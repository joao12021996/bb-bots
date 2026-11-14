// The online relay: devices in the same room send each other messages through here.
// It knows nothing about the game; it only tracks who is in which room and forwards JSON.
//
// client -> server: {op:"join", room, id}  then  {op:"msg", to?, t, d}
// server -> client: {op:"welcome", peers}, {op:"join", id}, {op:"leave", id}, {op:"msg", from, t, d}, {op:"error", reason}
//
// Public games: a peer in a room can list it ({op:"list", info}, or info null to take it down); the listing goes
// when that peer leaves. Anyone, joined or not, can ask for the listed rooms whose names start with a prefix:
// {op:"rooms", prefix}  ->  {op:"rooms", rooms: [{room, info}]}

const { WebSocketServer } = require("ws");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const MAX_MESSAGE = 2 * 1024 * 1024; // season snapshots can carry inlined portraits
const MAX_ROOMS = 500;
const MAX_PEERS = 32;
const HEARTBEAT_MS = 30000;
const MAX_LISTING = 2048; // bytes of JSON a listing's info can take
const MAX_LISTED = 100; // listings sent back for one query

// room name -> Map(peer id -> socket)
const rooms = new Map();
// room name -> {by: peer id that listed it, info}
const listings = new Map();

const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: MAX_MESSAGE });

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
        if (room.size === 0) rooms.delete(ws.roomName);
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
        if (rooms.size >= MAX_ROOMS) return sendTo(ws, { op: "error", reason: "server full" });
        room = new Map();
        rooms.set(roomName, room);
    }
    // the same device reconnecting before its old connection timed out: replace the old one
    const old = room.get(id);
    if (old) {
        removePeer(old);
        old.terminate();
    }
    if (room.size >= MAX_PEERS) return sendTo(ws, { op: "error", reason: "room full" });
    sendTo(ws, { op: "welcome", peers: Array.from(room.keys()) });
    broadcast(room, { op: "join", id });
    room.set(id, ws);
    ws.roomName = roomName;
    ws.peerId = id;
}

function forward(ws, msg) {
    const room = ws.roomName && rooms.get(ws.roomName);
    if (!room) return;
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
    if (typeof info !== "object" || Array.isArray(info) || JSON.stringify(info).length > MAX_LISTING) {
        return sendTo(ws, { op: "error", reason: "bad listing" });
    }
    listings.set(ws.roomName, { by: ws.peerId, info });
}

function sendRooms(ws, prefix) {
    if (typeof prefix !== "string" || !prefix || prefix.length > 64) return sendTo(ws, { op: "error", reason: "bad prefix" });
    const out = [];
    for (const [room, listing] of listings) {
        if (out.length >= MAX_LISTED) break;
        if (room.startsWith(prefix)) out.push({ room, info: listing.info });
    }
    sendTo(ws, { op: "rooms", rooms: out });
}

wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.roomName = null;
    ws.on("pong", () => (ws.isAlive = true));
    ws.on("message", (raw) => {
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
    ws.on("close", () => removePeer(ws));
    ws.on("error", () => removePeer(ws));
});

// drops connections that died without closing, so the room hears they left
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            removePeer(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

wss.on("listening", () => console.log(`bb-bots relay listening on ${HOST}:${PORT}`));
