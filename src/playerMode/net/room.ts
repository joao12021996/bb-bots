// A room of devices playing the same online season. In the browser it's a Trystero room: devices connect to
// each other directly (WebRTC), using free public Nostr relays only to find each other. There is no server.

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

const APP_ID = "bb-bots-online-1";

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

export async function openRoom(code: string): Promise<NetRoom> {
    // loaded on demand: only online games need it
    // @ts-ignore: typed loosely, so the build doesn't depend on its type definitions
    const trystero: any = await import("trystero");
    const room = trystero.joinRoom({ appId: APP_ID }, `room-${code}`, {
        onJoinError: (e: any) => console.error("Online: couldn't connect to a device", e),
    });
    // Trystero 0.25: actions are objects ({ send, onMessage }), and room events are properties to assign
    const action = room.makeAction("msg");
    const handlers: ((type: string, data: any, from: string) => void)[] = [];
    const joinHandlers: ((id: string) => void)[] = [];
    const leaveHandlers: ((id: string) => void)[] = [];
    action.onMessage = (msg: { t: string; d: any }, context: { peerId: string }) =>
        handlers.forEach((h) => h(msg.t, msg.d, context.peerId));
    room.onPeerJoin = (id: string) => joinHandlers.forEach((h) => h(id));
    room.onPeerLeave = (id: string) => leaveHandlers.forEach((h) => h(id));
    return {
        selfId: trystero.selfId,
        send: (type, data, to) => {
            // JSON only: drop undefined fields the way JSON.stringify would
            const payload = { t: type, d: data === undefined ? null : JSON.parse(JSON.stringify(data)) };
            action.send(payload, to ? { target: to } : undefined).catch((e: any) => console.error("Online: send failed", e));
        },
        onMessage: (h) => handlers.push(h),
        onPeerJoin: (h) => joinHandlers.push(h),
        onPeerLeave: (h) => leaveHandlers.push(h),
        peers: () => Object.keys(room.getPeers()),
        leave: () => {
            room.leave();
        },
    };
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

    deliver(from: string, type: string, data: any, to?: string) {
        // copied, like sending over the wire
        const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
        const targets = to ? [to] : Object.keys(this.rooms).filter((id) => id !== from);
        targets.forEach((id) => this.queue.push(() => this.rooms[id] && this.rooms[id].receive(type, copy, from)));
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
