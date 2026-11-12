// A room of devices playing the same online season. In the browser, every device keeps a WebSocket open to our
// relay (server/relay.js), which forwards messages between devices in the same room.

export interface NetRoom {
    readonly selfId: string;
    // to: one peer, or everyone when left out
    send(type: string, data: any, to?: string): void;
    onMessage(handler: (type: string, data: any, from: string) => void): void;
    onPeerJoin(handler: (peerId: string) => void): void;
    onPeerLeave(handler: (peerId: string) => void): void;
    peers(): string[];
    leave(): void;
}

// bumped when devices on different versions can't play together, so they never meet in a room
const APP_ID = "bb-bots-online-2";

// Room codes: easy to read out loud (no 0/O, 1/I/L).
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRoomCode(): string {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    return code;
}

export function cleanRoomCode(text: string): string {
    return text
        .toUpperCase()
        .split("")
        .filter((c) => CODE_LETTERS.includes(c))
        .join("")
        .slice(0, 6);
}

// The room code in whatever someone pasted: an invite link (…?join=ABC123) or the code itself.
export function parseInvite(text: string): string {
    const match = /[?&#]join=([A-Za-z0-9]+)/.exec(text);
    return cleanRoomCode(match ? match[1] : text);
}

export function joinLink(code: string): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?join=${code}`;
}

// Where devices meet: our relay on the DigitalOcean droplet (see server/README.md).
// REACT_APP_RELAY_URL overrides it, e.g. ws://localhost:8787 when running the relay locally.
const RELAY_URL = process.env.REACT_APP_RELAY_URL || "wss://api.spotlegame.co.uk/bb-relay";
const CONNECT_TIMEOUT_MS = 10000;

// this device's id for the whole page load (kept across reconnects)
const selfId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export function openRoom(code: string): Promise<NetRoom> {
    const roomName = `${APP_ID}:room-${code}`;
    const handlers: ((type: string, data: any, from: string) => void)[] = [];
    const joinHandlers: ((id: string) => void)[] = [];
    const leaveHandlers: ((id: string) => void)[] = [];
    const peers = new Set<string>();
    let ws: WebSocket | null = null;
    let left = false;
    let retry = 0;
    let retryTimer: any = null;

    const peerJoined = (id: string) => {
        if (id === selfId || peers.has(id)) return;
        peers.add(id);
        joinHandlers.forEach((h) => h(id));
    };
    const peerLeft = (id: string) => {
        if (!peers.delete(id)) return;
        leaveHandlers.forEach((h) => h(id));
    };

    const room: NetRoom = {
        selfId,
        send: (type, data, to) => {
            // JSON only: drop undefined fields the way JSON.stringify would
            const d = data === undefined ? null : JSON.parse(JSON.stringify(data));
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.error("Online: not connected, message dropped", type);
                return;
            }
            ws.send(JSON.stringify(to ? { op: "msg", to, t: type, d } : { op: "msg", t: type, d }));
        },
        onMessage: (h) => handlers.push(h),
        onPeerJoin: (h) => joinHandlers.push(h),
        onPeerLeave: (h) => leaveHandlers.push(h),
        peers: () => Array.from(peers),
        leave: () => {
            left = true;
            clearTimeout(retryTimer);
            if (ws) ws.close();
        },
    };

    return new Promise<NetRoom>((resolve, reject) => {
        let opened = false;

        const connect = () => {
            const socket = new WebSocket(RELAY_URL);
            ws = socket;
            const timeout = setTimeout(() => socket.close(), CONNECT_TIMEOUT_MS);
            socket.onopen = () => socket.send(JSON.stringify({ op: "join", room: roomName, id: selfId }));
            socket.onmessage = (event) => {
                let msg: any;
                try {
                    msg = JSON.parse(event.data);
                } catch (e) {
                    return;
                }
                if (msg.op === "welcome") {
                    clearTimeout(timeout);
                    retry = 0;
                    if (!opened) {
                        opened = true;
                        resolve(room);
                    }
                    // after the room has its handlers: announce who is already here, like a fresh join
                    setTimeout(() => (msg.peers as string[]).forEach(peerJoined), 0);
                } else if (msg.op === "join") peerJoined(msg.id);
                else if (msg.op === "leave") peerLeft(msg.id);
                else if (msg.op === "msg") handlers.forEach((h) => h(msg.t, msg.d, msg.from));
                else if (msg.op === "error") console.error("Online: relay refused", msg.reason);
            };
            socket.onclose = () => {
                clearTimeout(timeout);
                if (ws !== socket) return;
                ws = null;
                if (!opened) {
                    left = true;
                    reject(new Error("Online: couldn't reach the relay"));
                    return;
                }
                if (left) return;
                // lost the relay: everyone is gone until we're back
                Array.from(peers).forEach(peerLeft);
                const delay = Math.min(1000 * Math.pow(2, retry++), 15000);
                console.warn(`Online: connection lost, retrying in ${delay}ms`);
                retryTimer = setTimeout(() => !left && connect(), delay);
            };
        };

        connect();
    });
}

// For tests: rooms wired together in memory. Messages queue up until flush(), like a real network.
export class FakeHub {
    private rooms: { [id: string]: FakeRoom } = {};
    private queue: (() => void)[] = [];

    join(id: string): NetRoom {
        const room = new FakeRoom(this, id);
        const others = Object.keys(this.rooms);
        this.rooms[id] = room;
        others.forEach((other) => {
            this.queue.push(() => this.rooms[other] && this.rooms[other].joined(id));
            this.queue.push(() => this.rooms[id] && this.rooms[id].joined(other));
        });
        return room;
    }

    drop(id: string) {
        delete this.rooms[id];
        Object.keys(this.rooms).forEach((other) => this.queue.push(() => this.rooms[other] && this.rooms[other].left(id)));
    }

    // instant: messages arrive the moment they're sent (a player's move goes to the host and back within the
    // call, as if the network took no time)
    public instant = false;

    deliver(from: string, type: string, data: any, to?: string) {
        // copied, like sending over the wire
        const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
        const targets = to ? [to] : Object.keys(this.rooms).filter((id) => id !== from);
        targets.forEach((id) => {
            const arrive = () => this.rooms[id] && this.rooms[id].receive(type, copy, from);
            if (this.instant) arrive();
            else this.queue.push(arrive);
        });
    }

    peersOf(id: string): string[] {
        return Object.keys(this.rooms).filter((other) => other !== id);
    }

    // delivers everything, including whatever gets sent in response
    flush(limit = 100000) {
        let n = 0;
        while (this.queue.length > 0) {
            if (n++ > limit) throw new Error("FakeHub: messages never stopped");
            this.queue.shift()!();
        }
    }
}

class FakeRoom implements NetRoom {
    private handlers: ((type: string, data: any, from: string) => void)[] = [];
    private joinHandlers: ((id: string) => void)[] = [];
    private leaveHandlers: ((id: string) => void)[] = [];

    constructor(private hub: FakeHub, public readonly selfId: string) {}

    send(type: string, data: any, to?: string) {
        this.hub.deliver(this.selfId, type, data, to);
    }
    onMessage(h: (type: string, data: any, from: string) => void) {
        this.handlers.push(h);
    }
    onPeerJoin(h: (id: string) => void) {
        this.joinHandlers.push(h);
    }
    onPeerLeave(h: (id: string) => void) {
        this.leaveHandlers.push(h);
    }
    peers() {
        return this.hub.peersOf(this.selfId);
    }
    leave() {
        this.hub.drop(this.selfId);
    }
    receive(type: string, data: any, from: string) {
        this.handlers.forEach((h) => h(type, data, from));
    }
    joined(id: string) {
        this.joinHandlers.forEach((h) => h(id));
    }
    left(id: string) {
        this.leaveHandlers.forEach((h) => h(id));
    }
}
