// The online relay: devices in the same room send each other messages through here.
// It knows nothing about the game; it only tracks who is in which room and forwards JSON.
//
// client -> server: {op:"join", room, id}  then  {op:"msg", to?, t, d}
// server -> client: {op:"welcome", peers}, {op:"join", id}, {op:"leave", id}, {op:"msg", from, t, d}, {op:"error", reason}
//
// Public games: a peer in a room can list it ({op:"list", info}, or info null to take it down); the listing goes
// when that peer leaves. Anyone, joined or not, can ask for the listed rooms whose names start with a prefix:
// {op:"rooms", prefix}  ->  {op:"rooms", rooms: [{room, info}]}
// A listing must be sent again at least every LISTING_TTL_MS or it's dropped: a host whose tab is still connected
// but who has gone away (the game stops re-sending it) doesn't stay on the list.
//
// Limits, so one visitor (or one script) can't take the relay down for everyone:
//   - browsers must come from one of our sites (ALLOWED_ORIGINS); other websites can't use the relay
//   - connections, rooms opened and listings are capped per address
//   - every connection has a budget of messages and of bytes; one that keeps going over it is dropped
// GET /health (or /bb-relay/health) answers with how busy the relay is.

const http = require("http");
const { WebSocketServer } = require("ws");

const DEFAULTS = {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 8787),
    maxMessage: 2 * 1024 * 1024, // season snapshots can carry inlined portraits
    maxRooms: 500,
    maxPeers: 32,
    heartbeatMs: 30000,
    maxListing: 2048, // bytes of JSON a listing's info can take
    maxListed: 100, // listings sent back for one query
    listingTtlMs: 90000, // clients re-send every 30s
    // per address
    maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP || 12), // a family or a classroom shares one
    maxRoomsPerIp: Number(process.env.MAX_ROOMS_PER_IP || 6), // rooms this address opened that are still open
    maxListingsPerIp: Number(process.env.MAX_LISTINGS_PER_IP || 2),
    // per connection: a bucket that refills every second, with room for a burst. A host with a full house in a
    // comp passes on about 40 messages a second (everyone's score so far, and the season's hash after each).
    messagesPerSecond: 100,
    messageBurst: 600,
    bytesPerSecond: 512 * 1024,
    byteBurst: 8 * 1024 * 1024, // a few snapshots in a row
    maxStrikes: 3, // times over the budget before the connection is dropped
    maxType: 32, // length of a message's type
    // Which websites may connect. Comma-separated hostnames; ".example.com" also allows every subdomain.
    // A connection with no Origin at all (wscat, a health check) is let in: the per-address limits still apply.
    allowedOrigins: (process.env.ALLOWED_ORIGINS || ".spotlegame.co.uk,.github.io,localhost,127.0.0.1")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
};

function originAllowed(origin, allowed) {
    if (!origin) return true;
    let host;
    try {
        host = new URL(origin).hostname.toLowerCase();
    } catch (e) {
        return false;
    }
    return allowed.some((a) => (a.startsWith(".") ? host === a.slice(1) || host.endsWith(a) : host === a));
}

// The visitor's address. The relay sits behind Caddy (and sometimes a Cloudflare Tunnel), so the socket's own
// address is the proxy's.
function addressOf(req) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf) return cf.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff) return xff.split(",")[0].trim();
    return (req.socket && req.socket.remoteAddress) || "unknown";
}

function createRelay(options = {}) {
    const o = { ...DEFAULTS, ...options };
    // room name -> Map(peer id -> socket)
    const rooms = new Map();
    // room name -> the address that opened it
    const roomOwners = new Map();
    // room name -> {by: peer id that listed it, ip, info, at: when it was last sent}
    const listings = new Map();
    // address -> open connections
    const connections = new Map();
    const stats = { startedAt: Date.now(), accepted: 0, refused: 0, dropped: 0, messages: 0 };

    const count = (map, key, by) => {
        const n = (map.get(key) || 0) + by;
        if (n <= 0) map.delete(key);
        else map.set(key, n);
    };
    const roomsOf = (ip) => {
        let n = 0;
        roomOwners.forEach((owner) => owner === ip && n++);
        return n;
    };
    const listingsOf = (ip, exceptRoom) => {
        let n = 0;
        listings.forEach((l, room) => l.ip === ip && room !== exceptRoom && n++);
        return n;
    };

    function sendTo(ws, obj) {
        if (ws.readyState === ws.OPEN) ws.send(typeof obj === "string" ? obj : JSON.stringify(obj));
    }

    function broadcast(room, obj, exceptId) {
        const text = JSON.stringify(obj);
        room.forEach((ws, id) => id !== exceptId && sendTo(ws, text));
    }

    // takes a socket out of its room and tells the others
    function removePeer(ws) {
        if (!ws.roomName) return;
        const room = rooms.get(ws.roomName);
        if (room && room.get(ws.peerId) === ws) {
            room.delete(ws.peerId);
            broadcast(room, { op: "leave", id: ws.peerId });
            const listing = listings.get(ws.roomName);
            if (listing && listing.by === ws.peerId) listings.delete(ws.roomName);
            if (room.size === 0) {
                rooms.delete(ws.roomName);
                roomOwners.delete(ws.roomName);
            }
        }
        ws.roomName = null;
    }

    function join(ws, roomName, id) {
        if (ws.roomName) return sendTo(ws, { op: "error", reason: "already joined" });
        if (typeof roomName !== "string" || typeof id !== "string" || !roomName || !id || roomName.length > 64 || id.length > 64) {
            return sendTo(ws, { op: "error", reason: "bad join" });
        }
        let room = rooms.get(roomName);
        if (!room) {
            if (rooms.size >= o.maxRooms) return sendTo(ws, { op: "error", reason: "server full" });
            if (roomsOf(ws.ip) >= o.maxRoomsPerIp) return sendTo(ws, { op: "error", reason: "too many rooms" });
            room = new Map();
            rooms.set(roomName, room);
            roomOwners.set(roomName, ws.ip);
        }
        // the same device reconnecting before its old connection timed out: replace the old one
        const old = room.get(id);
        if (old) {
            // the others hear it leave, then join again, and send it what it missed. The room itself stays, even
            // if this was its only peer.
            room.delete(id);
            old.roomName = null;
            old.terminate();
            broadcast(room, { op: "leave", id });
            const listing = listings.get(roomName);
            if (listing && listing.by === id) listings.delete(roomName);
        }
        if (room.size >= o.maxPeers) return sendTo(ws, { op: "error", reason: "room full" });
        sendTo(ws, { op: "welcome", peers: Array.from(room.keys()) });
        broadcast(room, { op: "join", id });
        room.set(id, ws);
        ws.roomName = roomName;
        ws.peerId = id;
    }

    function forward(ws, msg) {
        const room = ws.roomName && rooms.get(ws.roomName);
        if (!room) return;
        if (typeof msg.t !== "string" || !msg.t || msg.t.length > o.maxType) return sendTo(ws, { op: "error", reason: "bad message" });
        if (msg.to !== undefined && (typeof msg.to !== "string" || msg.to.length > 64)) return sendTo(ws, { op: "error", reason: "bad message" });
        stats.messages++;
        const out = JSON.stringify({ op: "msg", from: ws.peerId, t: msg.t, d: msg.d });
        if (typeof msg.to === "string") {
            const target = room.get(msg.to);
            if (target) sendTo(target, out);
        } else {
            room.forEach((other, id) => id !== ws.peerId && sendTo(other, out));
        }
    }

    function list(ws, info) {
        if (!ws.roomName) return;
        const current = listings.get(ws.roomName);
        if (info === null || info === undefined) {
            if (current && current.by === ws.peerId) listings.delete(ws.roomName);
            return;
        }
        if (typeof info !== "object" || Array.isArray(info) || JSON.stringify(info).length > o.maxListing) {
            return sendTo(ws, { op: "error", reason: "bad listing" });
        }
        // someone else in the room can't take over its listing
        if (current && current.by !== ws.peerId && rooms.get(ws.roomName) && rooms.get(ws.roomName).has(current.by)) {
            return sendTo(ws, { op: "error", reason: "already listed" });
        }
        dropStaleListings();
        if (listingsOf(ws.ip, ws.roomName) >= o.maxListingsPerIp) return sendTo(ws, { op: "error", reason: "too many listings" });
        listings.set(ws.roomName, { by: ws.peerId, ip: ws.ip, info, at: Date.now() });
    }

    // takes down listings their host stopped sending
    function dropStaleListings() {
        const now = Date.now();
        for (const [room, listing] of listings) if (now - listing.at > o.listingTtlMs) listings.delete(room);
    }

    function sendRooms(ws, prefix) {
        if (typeof prefix !== "string" || !prefix || prefix.length > 64) return sendTo(ws, { op: "error", reason: "bad prefix" });
        dropStaleListings();
        const out = [];
        for (const [room, listing] of listings) {
            if (out.length >= o.maxListed) break;
            if (room.startsWith(prefix)) out.push({ room, info: listing.info });
        }
        sendTo(ws, { op: "rooms", rooms: out });
    }

    // The connection's budget. False: over it (the message is dropped; too often, and so is the connection).
    function withinBudget(ws, bytes) {
        if (ws.cutOff) return false; // messages still on their way in when it was dropped
        const now = Date.now();
        const seconds = (now - ws.budgetAt) / 1000;
        ws.budgetAt = now;
        ws.messagesLeft = Math.min(o.messageBurst, ws.messagesLeft + seconds * o.messagesPerSecond);
        ws.bytesLeft = Math.min(o.byteBurst, ws.bytesLeft + seconds * o.bytesPerSecond);
        if (ws.messagesLeft < 1 || ws.bytesLeft < bytes) {
            ws.strikes++;
            if (ws.strikes >= o.maxStrikes) {
                stats.dropped++;
                ws.cutOff = true;
                sendTo(ws, { op: "error", reason: "too many messages" });
                removePeer(ws);
                ws.terminate();
            } else {
                sendTo(ws, { op: "error", reason: "slow down" });
                // a full second's worth before the next strike can land
                ws.messagesLeft = Math.max(ws.messagesLeft, 1);
            }
            return false;
        }
        ws.messagesLeft -= 1;
        ws.bytesLeft -= bytes;
        return true;
    }

    function health() {
        let peers = 0;
        rooms.forEach((room) => (peers += room.size));
        return {
            ok: true,
            uptimeSeconds: Math.round((Date.now() - stats.startedAt) / 1000),
            connections: wss.clients.size,
            rooms: rooms.size,
            peers,
            listings: listings.size,
            addresses: connections.size,
            accepted: stats.accepted,
            refused: stats.refused,
            dropped: stats.dropped,
            messages: stats.messages,
        };
    }

    const server = http.createServer((req, res) => {
        const path = (req.url || "").split("?")[0];
        if (req.method === "GET" && (path === "/health" || path === "/bb-relay/health")) {
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            return res.end(JSON.stringify(health()));
        }
        res.writeHead(426, { "Content-Type": "text/plain" });
        res.end("This is a WebSocket relay.");
    });

    const wss = new WebSocketServer({ noServer: true, maxPayload: o.maxMessage });

    server.on("upgrade", (req, socket, head) => {
        const refuse = (code, text) => {
            stats.refused++;
            socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
            socket.destroy();
        };
        if (!originAllowed(req.headers.origin, o.allowedOrigins)) return refuse(403, "Forbidden");
        const ip = addressOf(req);
        if ((connections.get(ip) || 0) >= o.maxConnectionsPerIp) return refuse(429, "Too Many Requests");
        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.ip = ip;
            wss.emit("connection", ws, req);
        });
    });

    wss.on("connection", (ws) => {
        stats.accepted++;
        count(connections, ws.ip, 1);
        ws.isAlive = true;
        ws.roomName = null;
        ws.budgetAt = Date.now();
        ws.messagesLeft = o.messageBurst;
        ws.bytesLeft = o.byteBurst;
        ws.strikes = 0;
        let gone = false;
        const closed = () => {
            if (gone) return;
            gone = true;
            count(connections, ws.ip, -1);
            removePeer(ws);
        };
        ws.on("pong", () => (ws.isAlive = true));
        ws.on("message", (raw) => {
            if (!withinBudget(ws, raw.length)) return;
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch (e) {
                return;
            }
            if (!msg || typeof msg !== "object") return;
            if (msg.op === "join") join(ws, msg.room, msg.id);
            else if (msg.op === "msg") forward(ws, msg);
            else if (msg.op === "list") list(ws, msg.info);
            else if (msg.op === "rooms") sendRooms(ws, msg.prefix);
        });
        ws.on("close", closed);
        ws.on("error", closed);
    });

    // drops connections that died without closing, so the room hears they left
    const heartbeat = setInterval(() => {
        dropStaleListings();
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) {
                removePeer(ws);
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, o.heartbeatMs);

    return {
        server,
        health,
        listen: () =>
            new Promise((resolve) => {
                server.listen(o.port, o.host, () => resolve(server.address().port));
            }),
        close: () =>
            new Promise((resolve) => {
                clearInterval(heartbeat);
                wss.clients.forEach((ws) => ws.terminate());
                wss.close(() => server.close(() => resolve()));
            }),
    };
}

module.exports = { createRelay, originAllowed, addressOf };

if (require.main === module) {
    const relay = createRelay();
    relay.listen().then((port) => console.log(`bb-bots relay listening on ${DEFAULTS.host}:${port}`));
}
