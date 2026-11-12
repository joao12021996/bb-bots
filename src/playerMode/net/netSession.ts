import { BehaviorSubject } from "rxjs";
import { continueWaiting$ } from "../../subjects/subjects";
import { getById } from "../../model";
import { actorOf, migrateSave, PlayerModeController, PlayerSave, Prompt, Step } from "../playerModeController";
import { clearOnlineSave, deserialize, serialize, writeOnlineSave } from "../save/serialize";
import { seedRng } from "../seeding";
import { NetRoom } from "./room";
import { canJoin, CastCard, LobbySeat, LobbySetup, normalizeSetup } from "./lobby";

// Online play without a server.
//
// Every device runs its own PlayerModeController from the same save. The controller is deterministic (it
// reseeds before every decision), so if every device applies the same player inputs in the same order, every
// copy of the season stays identical. Only inputs travel: a prompt callback (resolve, onScore, next…) or one
// of the controller methods the screens call directly. Prompts themselves hold closures and JSX and never
// leave the device.
//
// Several devices can act at once: besides the screen everyone shares, the controller can give players their own
// screens at the same time (votes, comps...). The host puts every input in one order: other devices propose
// their inputs to the host, which checks them, numbers them and sends them to everyone, the proposer included.
// So every device applies the same inputs in the same order, even when players act at the same moment. A device
// may act on the shared screen when it belongs to its player (or, for screens everyone watches, when it's the
// host), and on its own player's screen.
//
// The host is the source of truth. It sends a hash of the season after inputs; a device that disagrees asks
// for a snapshot (the last save plus the inputs since) and rebuilds from it, the same way a reload resumes.
// New and returning devices join the same way. If the host leaves, the remaining device with the smallest id
// takes over; every device has the whole season, so nothing is lost.

// Controller methods the screens call that change the season.
export const NETWORKED_METHODS = [
    "continue",
    "noteRead",
    "socialAct",
    "endSocial",
    "respondApproach",
    "respondSides",
    "talkToBot",
    "askVote",
    "allianceSuggest",
    "allianceDiscuss",
    "renameAlliance",
    "leave",
    "leak",
    "endAlliance",
    "hohVisit",
    "hohAnswer",
    "endHohRoom",
] as const;

export interface Input {
    seq: number;
    kind: "prompt" | "method";
    name: string;
    args: any[];
    promptKind?: string;
    // the player acting (null: a screen everyone watches): who may send it, and who a method acts for
    owner: number | null;
    // prompt inputs: which screen, the shared one (null) or a player's own; and when it was shown (see promptAt)
    slot?: number | null;
    at?: number;
    // set by the host: the device that proposed it, and its number for the proposal
    by?: string;
    pid?: number;
}

// what a device sends the host
type Proposal = Omit<Input, "seq" | "by">;

export interface Slot {
    id: number;
    name: string;
    imageURL: string;
}

export interface NetStatus {
    code: string;
    selfId: string;
    isHost: boolean;
    hostId: string | null;
    started: boolean;
    slots: Slot[];
    claims: { [playerId: number]: string }; // which device plays each player
    peers: string[]; // connected devices (not counting this one)
    localPlayerId: number | null;
    notice?: string;
    // before the season starts, in a lobby the host is setting up
    setup: LobbySetup | null;
    cast: CastCard[];
    mySeat: LobbySeat | null;
}

export interface SessionOptions {
    // shows the game screen and starts the controller
    launch: (controller: PlayerModeController, save: PlayerSave, fresh: boolean) => void;
    // how long a returning device waits for a host before carrying on as the host itself
    hostWaitMs?: number;
    // how often the host sends its hash (debounced)
    hashDelayMs?: number;
    // how long a player's device can be gone before a bot plays for them
    awayMs?: number;
}

// Chat between players, outside the season itself (it never changes the game, so it doesn't go through the
// inputs): private messages between houseguests still in the house, and the jury house, for evicted players.
// The host checks every message and passes it on only to the devices that may read it.
export interface ChatMessage {
    id: string;
    from: number;
    to: number | "jury";
    text: string;
    at: number;
}

export const CHAT_MAX_LENGTH = 300;
const CHAT_KEEP = 500;

function chatKey(code: string): string {
    return `bbb-online-chat:${code}`;
}

function loadChat(code: string): ChatMessage[] {
    try {
        const json = localStorage.getItem(chatKey(code));
        const list = json ? JSON.parse(json) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function storeChat(code: string, list: ChatMessage[]) {
    try {
        localStorage.setItem(chatKey(code), JSON.stringify(list));
    } catch (e) {
        // no storage: the chat only lasts as long as the tab
    }
}

interface Snapshot {
    json: string;
    log: Input[];
    seq: number;
    hard?: boolean;
    stamps?: Stamps;
}

// When the screens up were shown (see Stamp), for a device catching up from a snapshot to take on.
interface Stamps {
    shared: number;
    personal: { [playerId: number]: number };
}

// When a screen was shown: the number of the input that showed it, the same on every device, so the host can
// tell an input meant for an earlier screen of the same kind. Its buttons hold on to it, so a device catching
// up can take on the host's numbers for the screens it has up, while older screens stay old.
interface Stamp {
    at: number;
}

// ---------- hashing ----------

// A JSON string with every object's keys sorted, so the same season hashes the same however it was built.
function canonical(value: any): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonical(v))).join(",")}]`;
    const keys = Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

function fnv1a(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + ":" + text.length.toString(36);
}

export function stateHash(state: PlayerSave): string {
    return fnv1a(canonical(JSON.parse(serialize(state))));
}

// Inputs are copied as they'd arrive over the wire (undefined survives), and the sender uses the copy too,
// so every device runs the input with exactly the same arguments.
function wireCopy(args: any[]): any[] {
    // buttons often pass an action straight to onClick, which hands it the click event: never part of the input
    const trimmed = args.map((a) => (isEvent(a) ? undefined : a));
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === undefined) trimmed.pop();
    return fromWire(toWire(trimmed));
}

// a React synthetic event or a DOM event
function isEvent(a: any): boolean {
    if (!a || typeof a !== "object") return false;
    if (typeof Event !== "undefined" && a instanceof Event) return true;
    return "nativeEvent" in a && "currentTarget" in a;
}

function toWire(args: any[]): any {
    return JSON.parse(JSON.stringify(args, (_k, v) => (v === undefined ? { __u: 1 } : v)));
}

function fromWire(args: any): any[] {
    return JSON.parse(JSON.stringify(args), (_k, v) => (v && typeof v === "object" && v.__u === 1 ? undefined : v));
}

function toWireInput(input: Input): Input {
    return { ...input, args: toWire(input.args) };
}

function fromWireInput(input: Input): Input {
    return { ...input, args: fromWire(input.args) };
}

// ---------- the session ----------

let active: NetSession | null = null;

export function getActiveSession(): NetSession | null {
    return active;
}

// The session this browser tab is playing (any earlier one is left).
export function setActiveSession(session: NetSession) {
    if (active && active !== session) active.leave();
    active = session;
}

// The session playing this controller's season, if it's an online one.
export function sessionFor(controller: PlayerModeController): NetSession | null {
    return active && active.controller === controller ? active : null;
}

export class NetSession {
    public readonly status$: BehaviorSubject<NetStatus>;
    public controller: PlayerModeController | null = null;
    public resyncs = 0; // times this device found itself out of sync with the host
    public readonly chat$ = new BehaviorSubject<ChatMessage[]>([]); // the messages this device's player may read

    private isHost: boolean;
    private hostId: string | null;
    private started = false;
    private slots: Slot[] = [];
    private claims: { [playerId: number]: string } = {};
    private notice?: string;
    private pendingSave: PlayerSave | null = null; // the host's season, before it starts (fixed players)
    private setup: LobbySetup | null = null; // or the lobby, where the players are whoever joins
    private cast: CastCard[] = [];
    private wantPlayerId: number | null = null; // a returning player claims their old seat automatically
    private fallbackJson: string | null = null; // a returning device's own copy of the season

    // the screens being shown, unwrapped: the one everyone shares, and players' own (by player id)
    private rawPrompt: Prompt | null = null;
    private rawPersonal: { [playerId: number]: Prompt } = {};
    // when each was shown: the number of the input that showed it. The same on every device, so the host can
    // tell an input meant for an earlier screen of the same kind
    private sharedStamp: Stamp = { at: 0 };
    private personalStamp: { [playerId: number]: Stamp } = {};
    // which player's own screen this device is showing (methods called from it act for that player)
    private focusOwner: number | null = null;
    // this device's inputs waiting for the host to send them back
    private pidSeq = 0;
    private proposals: { [pid: number]: { settle: (result: any) => void } } = {};
    private rawMethods: { [name: string]: (...args: any[]) => any } = {};
    private applied = 0; // inputs applied so far
    private buffer: { [seq: number]: Input } = {};
    private log: Input[] = []; // inputs since the last save
    private lastSavedJson = "";
    private depth = 0; // > 0 while the controller is running: calls inside it aren't new inputs
    private savedDuringInput = false;
    private lastReport = 0;
    // Continue on a screen everyone watches: everyone presses it, then it happens (see ready)
    private readyAt = -1; // which screen (its stamp) the presses are for
    private readyIds: number[] = []; // players who pressed it
    private readyProposal: Proposal | null = null; // the host: what to do once everyone has
    private myReadyAt = -1; // this device pressed it (before the host has said so)
    private reportTimer: any = undefined;
    private pendingHash: { seq: number; hash: string } | null = null; // hash: see signature()
    private hashTimer: any = null;
    private gapTimer: any = null;
    private hostWaitTimer: any = null;
    private lastResyncAt = 0;
    private lastHardResyncAt = 0;
    private lastHard: Snapshot | null = null; // the snapshot everyone last reloaded from together
    // the host: since when each player's device has been gone (a bot plays for them after a while)
    private awaySince: { [playerId: number]: number } = {};
    private awayTimer: any = null;
    // chat: every message this device has (the host: all of them), and the evicted players the host has sent
    // the jury house to so far
    private allChat: ChatMessage[] = [];
    private chatSeq = 0;
    private juryChatSent = new Set<number>();

    private constructor(private room: NetRoom, public readonly code: string, private opts: SessionOptions, isHost: boolean) {
        this.isHost = isHost;
        this.hostId = isHost ? room.selfId : null;
        this.status$ = new BehaviorSubject<NetStatus>(this.status());
        this.allChat = loadChat(code);
        room.onMessage((type, data, from) => this.onMessage(type, data, from));
        room.onPeerJoin((id) => this.onPeerJoin(id));
        room.onPeerLeave((id) => this.onPeerLeave(id));
    }

    // Hosts a new season: players join the room and pick who they are, then the host starts it.
    static host(room: NetRoom, code: string, save: PlayerSave, opts: SessionOptions): NetSession {
        const session = new NetSession(room, code, opts, true);
        session.pendingSave = save;
        session.slots = slotsOf(save);
        session.lastSavedJson = serialize(save);
        session.emit();
        return session;
    }

    // Hosts a lobby: the house starts out full of bots, and everyone who joins takes a bot's place.
    static hostLobby(room: NetRoom, code: string, setup: LobbySetup, cast: CastCard[], opts: SessionOptions): NetSession {
        const session = new NetSession(room, code, opts, true);
        session.cast = cast;
        session.setup = normalizeSetup(setup, cast.length);
        session.emit();
        return session;
    }

    // Joins a room. A returning player passes their seat and their own copy of the season: if nobody's
    // hosting any more, they carry on as the host.
    static join(room: NetRoom, code: string, opts: SessionOptions, rejoin?: { playerId: number | null; json: string }): NetSession {
        const session = new NetSession(room, code, opts, false);
        if (rejoin) {
            session.wantPlayerId = rejoin.playerId;
            session.fallbackJson = rejoin.json;
            session.hostWaitTimer = setTimeout(() => session.takeOverAlone(), opts.hostWaitMs ?? 6000);
        }
        session.emit();
        return session;
    }

    // ---------- status ----------

    get localPlayerId(): number | null {
        const self = this.room.selfId;
        const mine = Object.keys(this.claims).find((id) => this.claims[Number(id)] === self);
        return mine === undefined ? null : Number(mine);
    }

    get amHost(): boolean {
        return this.isHost;
    }

    private connected(peerId: string | undefined): boolean {
        return !!peerId && (peerId === this.room.selfId || this.room.peers().includes(peerId));
    }

    // Whether this device makes the decision on a prompt belonging to `actor` (null: a screen everyone watches).
    public mayActFor(actor: number | null): boolean {
        return this.allowed(actor, this.room.selfId);
    }

    public isConnected(playerId: number): boolean {
        return this.connected(this.claims[playerId]);
    }

    private status(): NetStatus {
        return {
            code: this.code,
            selfId: this.room.selfId,
            isHost: this.isHost,
            hostId: this.hostId,
            started: this.started,
            slots: this.slots,
            claims: { ...this.claims },
            peers: this.room.peers(),
            localPlayerId: this.localPlayerId,
            notice: this.notice,
            setup: this.setup,
            cast: this.cast,
            mySeat: (this.setup && this.setup.seats.find((s) => s.peerId === this.room.selfId)) || null,
        };
    }

    private emit() {
        this.status$.next(this.status());
        this.updateWaiting();
        this.refreshChat();
        if (this.isHost) {
            this.checkReady();
            this.checkAway();
        }
    }

    // ---------- lobby ----------

    public claim(playerId: number) {
        if (this.isHost) this.grantClaim(playerId, this.room.selfId);
        else if (this.hostId) this.room.send("claim", { playerId }, this.hostId);
    }

    // ---------- the lobby (before the season starts) ----------

    // The host changes the settings (size, difficulty...).
    public updateSetup(change: Partial<LobbySetup>) {
        if (!this.isHost || !this.setup || this.started) return;
        this.setup = normalizeSetup({ ...this.setup, ...change }, this.cast.length);
        this.broadcastLobby();
    }

    // Join the house (as yourself, or as a cast member), or change how you're joining.
    public takeSeat(seat: Omit<LobbySeat, "peerId">) {
        if (this.isHost) this.seatPeer(this.room.selfId, seat);
        else if (this.hostId) this.room.send("seat", seat, this.hostId);
    }

    public leaveSeat() {
        if (this.isHost) this.unseatPeer(this.room.selfId);
        else if (this.hostId) this.room.send("unseat", {}, this.hostId);
    }

    private seatPeer(peerId: string, seat: Omit<LobbySeat, "peerId">) {
        if (!this.setup || this.started) return;
        const others = { ...this.setup, seats: this.setup.seats.filter((s) => s.peerId !== peerId) };
        const clean = {
            name: String(seat.name || "").trim().slice(0, 24) || "Player",
            imageURL: String(seat.imageURL || ""),
            castIndex: typeof seat.castIndex === "number" && seat.castIndex >= 0 && seat.castIndex < this.cast.length ? seat.castIndex : null,
        };
        if (!canJoin(others, this.cast.length, clean)) {
            if (peerId === this.room.selfId) {
                this.notice = "That houseguest is taken, or the house is full.";
                this.emit();
            } else {
                this.room.send("full", {}, peerId);
            }
            return;
        }
        // keep their place in line if they're only changing their name or face
        const index = this.setup.seats.findIndex((s) => s.peerId === peerId);
        const seats = [...others.seats];
        seats.splice(index >= 0 ? index : seats.length, 0, { ...clean, peerId });
        if (peerId === this.room.selfId) this.notice = undefined;
        this.setup = normalizeSetup({ ...this.setup, seats }, this.cast.length);
        this.broadcastLobby();
    }

    private unseatPeer(peerId: string) {
        if (!this.setup || this.started) return;
        if (!this.setup.seats.some((s) => s.peerId === peerId)) return;
        this.setup = normalizeSetup({ ...this.setup, seats: this.setup.seats.filter((s) => s.peerId !== peerId) }, this.cast.length);
        this.broadcastLobby();
    }

    // The host starts a lobby's season: built from whoever's in the house.
    public startSeason(save: PlayerSave, claims: { [playerId: number]: string }) {
        if (!this.isHost || this.started) return;
        this.slots = slotsOf(save);
        this.claims = { ...claims };
        this.setup = null;
        this.lastSavedJson = serialize(save);
        this.begin();
    }

    // The host starts the season for everyone.
    public start() {
        if (!this.isHost || this.started || !this.pendingSave) return;
        this.pendingSave = null;
        this.begin();
    }

    private begin() {
        this.started = true;
        const json = this.lastSavedJson;
        this.room.send("snap", { json, log: [], seq: 0 } as Snapshot);
        this.broadcastLobby();
        this.loadSnapshot(json, [], 0);
    }

    public leave() {
        clearTimeout(this.hashTimer);
        clearTimeout(this.gapTimer);
        clearTimeout(this.reportTimer);
        clearTimeout(this.hostWaitTimer);
        clearTimeout(this.awayTimer);
        continueWaiting$.next(null);
        if (this.controller) this.controller.net = null;
        this.room.leave();
        if (active === this) active = null;
    }

    private grantClaim(playerId: number, peerId: string) {
        if (!this.slots.some((s) => s.id === playerId)) return;
        const holder = this.claims[playerId];
        if (holder && holder !== peerId && this.connected(holder)) return; // taken
        // one seat per device
        Object.keys(this.claims).forEach((id) => {
            if (this.claims[Number(id)] === peerId) delete this.claims[Number(id)];
        });
        this.claims[playerId] = peerId;
        // the season first, so the new device has it by the time the lobby says it's playing
        if (this.started && peerId !== this.room.selfId) {
            this.sendSnapshot(peerId);
            this.sendChatLog(playerId, peerId);
        }
        this.broadcastLobby();
    }

    private lobbyData() {
        return { slots: this.slots, claims: this.claims, started: this.started, setup: this.setup, cast: this.setup ? this.cast : [] };
    }

    private broadcastLobby() {
        this.room.send("lobby", this.lobbyData());
        this.emit();
    }

    private onPeerJoin(peerId: string) {
        if (this.isHost) this.room.send("lobby", this.lobbyData(), peerId);
        this.emit();
    }

    private onPeerLeave(peerId: string) {
        if (peerId === this.hostId) {
            // the host left: the device with the smallest id takes over
            const next = [this.room.selfId, ...this.room.peers()].filter((id) => id !== peerId).sort()[0];
            this.hostId = next;
            this.settleAllProposals();
            // Continue presses went to the old host: everyone presses again
            this.myReadyAt = -1;
            this.readyAt = -1;
            this.readyIds = [];
            this.readyProposal = null;
            this.notice = "The host left.";
            if (next === this.room.selfId) {
                this.isHost = true;
                this.notice = "The host left, so you're the host now. Keep this tab open!";
            }
        }
        if (this.isHost) {
            Object.keys(this.claims).forEach((id) => {
                if (this.claims[Number(id)] === peerId) delete this.claims[Number(id)];
            });
            if (this.setup && !this.started) {
                // they left the lobby: a bot takes their place again
                this.setup = normalizeSetup({ ...this.setup, seats: this.setup.seats.filter((s) => s.peerId !== peerId) }, this.cast.length);
            }
            this.broadcastLobby();
        } else {
            this.emit();
        }
    }

    // A returning device found nobody hosting: it carries on alone, as the host, from its own copy.
    private takeOverAlone() {
        if (this.hostId || !this.fallbackJson) return;
        const save = migrateSave(deserialize<any>(this.fallbackJson));
        if (!save) return;
        this.isHost = true;
        this.hostId = this.room.selfId;
        this.started = true;
        this.slots = slotsOf(save);
        this.claims = {};
        if (this.wantPlayerId !== null) this.claims[this.wantPlayerId] = this.room.selfId;
        this.notice = "Nobody else is here yet, so you're the host. Friends can rejoin with the room code.";
        this.loadSnapshot(this.fallbackJson, [], 0);
        this.broadcastLobby();
    }

    // ---------- messages ----------

    private onMessage(type: string, data: any, from: string) {
        switch (type) {
            case "lobby":
                return this.onLobby(data, from);
            case "claim":
                if (this.isHost) this.grantClaim(data.playerId, from);
                return;
            case "seat":
                if (this.isHost) this.seatPeer(from, data);
                return;
            case "unseat":
                if (this.isHost) this.unseatPeer(from);
                return;
            case "full":
                if (from === this.hostId) {
                    this.notice = "That houseguest is taken, or the house is full.";
                    this.emit();
                }
                return;
            case "input":
                return this.receiveInput(data as Input, from);
            case "propose":
                return this.receiveProposal(data as Input, from);
            case "rejected":
                return this.settleProposal(data && data.pid);
            case "ready":
                return this.receiveReady(data as Input, from);
            case "readyState":
                if (from === this.hostId && data) {
                    this.readyAt = data.at;
                    this.readyIds = data.ids || [];
                    this.updateWaiting();
                }
                return;
            case "hash":
                if (!this.isHost && from === this.hostId) {
                    this.pendingHash = data;
                    this.checkHash();
                }
                return;
            case "snapReq":
                if (!this.isHost || !this.started) return;
                if (data && data.hard) return this.hardResync();
                return this.sendSnapshot(from);
            case "chatSend":
                return this.receiveChat(data as ChatMessage, from);
            case "chat":
            case "chatLog":
                if (from === this.hostId && Array.isArray(data)) this.addChat(data);
                return;
            case "snap":
                if (from === this.hostId) {
                    const snap = data as Snapshot;
                    this.loadSnapshot(snap.json, snap.log.map(fromWireInput), snap.seq, snap.stamps);
                }
                return;
        }
    }

    private onLobby(
        data: { slots: Slot[]; claims: { [id: number]: string }; started: boolean; setup?: LobbySetup | null; cast?: CastCard[] },
        from: string
    ) {
        if (this.isHost && from !== this.room.selfId) {
            // two hosts (both thought they were alone): the smaller id stays host
            if (this.room.selfId < from) {
                this.room.send("lobby", this.lobbyData(), from);
                return;
            }
            this.isHost = false;
        }
        clearTimeout(this.hostWaitTimer);
        // the seat this device had: after a dropped connection the host may have let it go, so claim it back
        const had = this.localPlayerId;
        if (had !== null && this.started) this.wantPlayerId = had;
        this.hostId = from;
        this.slots = data.slots;
        this.claims = { ...data.claims };
        this.setup = data.setup || null;
        if (data.cast && data.cast.length > 0) this.cast = data.cast;
        if (this.setup && this.setup.seats.some((s) => s.peerId === this.room.selfId)) this.notice = undefined;
        this.started = data.started || this.started;
        const mine = this.localPlayerId;
        if (mine === null && this.wantPlayerId !== null && !this.connected(this.claims[this.wantPlayerId])) {
            this.room.send("claim", { playerId: this.wantPlayerId }, from);
        } else if (this.started && mine !== null && !this.controller) {
            this.room.send("snapReq", {}, from);
        }
        if (this.controller && mine !== null) {
            // remember which seat is ours, for rejoining
            writeOnlineSave({ code: this.code, playerId: mine, json: this.lastSavedJson });
        }
        this.emit();
    }

    private stamps(): Stamps {
        const personal: { [playerId: number]: number } = {};
        Object.keys(this.personalStamp).forEach((id) => (personal[Number(id)] = this.personalStamp[Number(id)].at));
        return { shared: this.sharedStamp.at, personal };
    }

    private currentSnapshot(): Snapshot {
        return { json: this.lastSavedJson, log: this.log.map(toWireInput), seq: this.applied, hard: true, stamps: this.stamps() };
    }

    private sendSnapshot(peerId: string) {
        const snap: Snapshot = { json: this.lastSavedJson, log: this.log.map(toWireInput), seq: this.applied, stamps: this.stamps() };
        this.room.send("snap", snap, peerId);
    }

    // Everyone (the host too) rebuilds from the host's last save, so every device takes exactly the same path.
    private hardResync() {
        const now = Date.now();
        if (now - this.lastHardResyncAt < 60000) {
            // not again so soon: if nothing's happened since, resend the snapshot everyone reloaded from, so the
            // device takes exactly the path this one did
            const last = this.lastHard;
            const snap = last && last.seq === this.applied ? last : this.currentSnapshot();
            return this.room.send("snap", snap);
        }
        this.lastHardResyncAt = now;
        const log = [...this.log];
        const snap = this.currentSnapshot();
        this.lastHard = snap;
        this.room.send("snap", snap);
        this.loadSnapshot(snap.json, log, snap.seq, snap.stamps);
    }

    // This device disagrees with the host: fetch the season again. Twice in a row, and everyone reloads.
    private outOfSync() {
        this.resyncs++;
        const now = Date.now();
        const hard = now - this.lastResyncAt < 30000;
        this.lastResyncAt = now;
        if (this.isHost) return this.hardResync();
        if (this.hostId) this.room.send("snapReq", { hard }, this.hostId);
    }

    // ---------- the season ----------

    private loadSnapshot(json: string, log: Input[], seq: number, stamps?: Stamps) {
        const save = migrateSave(deserialize<any>(json));
        if (!save) return;
        if (this.controller) this.controller.net = null;
        const controller = new PlayerModeController(save);
        this.attach(controller);
        this.started = true;
        this.lastSavedJson = json;
        this.log = [];
        this.applied = seq - log.length;
        this.pendingHash = null;
        this.rawPrompt = null;
        this.rawPersonal = {};
        this.personalStamp = {};
        Object.keys(this.buffer).forEach((s) => {
            if (Number(s) <= seq) delete this.buffer[Number(s)];
        });
        writeOnlineSave({ code: this.code, playerId: this.localPlayerId, json });
        const fresh = seq === 0 && save.history.length === 0 && !save.week.hohId;
        seedRng(`net:start:${seq - log.length}`);
        this.depth++;
        try {
            this.opts.launch(controller, save, fresh);
        } finally {
            this.depth--;
        }
        log.forEach((input) => this.exec(input));
        // the screens up now are the host's: take on when it showed them. Resuming shows them again, later
        if (stamps && this.applied === seq) {
            if (this.rawPrompt) this.sharedStamp.at = stamps.shared;
            Object.keys(this.personalStamp).forEach((id) => {
                const at = stamps.personal[Number(id)];
                if (at !== undefined) this.personalStamp[Number(id)].at = at;
            });
        }
        this.drain();
        this.emit();
    }

    private attach(controller: PlayerModeController) {
        this.controller = controller;
        controller.net = {
            wrapPrompt: (p, owner) => this.wrapPrompt(p, owner),
            dropPersonal: (owner) => {
                delete this.rawPersonal[owner];
                delete this.personalStamp[owner];
            },
            saved: (state) => this.saved(state),
            ended: () => clearOnlineSave(),
            localIds: () => (this.localPlayerId !== null ? [this.localPlayerId] : []),
        };
        this.rawMethods = {};
        const c = controller as any;
        // parts of the season that are created the first time something reads them: create them now, so a
        // screen on one device reading them first doesn't make that device's season look different
        void [c.powers, c.ledger, c.juryBook, c.personalities, c.showmances, c.deals];
        NETWORKED_METHODS.forEach((name) => {
            const raw = c[name].bind(controller);
            this.rawMethods[name] = raw;
            c[name] = this.wrap("method", name, raw);
        });
        // sent by the session itself, for this device's own player (see reportRuleBreak)
        this.rawMethods.ruleBreak = c.ruleBreak.bind(controller);
        // sent by the host itself, when a player's device has been gone a while, or is back (see checkAway)
        this.rawMethods.autopilot = c.autopilot.bind(controller);
    }

    // owner: a player's own screen (undefined: the screen everyone shares)
    private wrapPrompt(prompt: Prompt, owner?: number): Prompt {
        const slot = owner === undefined ? null : owner;
        const stamp: Stamp = { at: this.applied };
        if (slot === null) {
            this.rawPrompt = prompt;
            this.sharedStamp = stamp;
            if (this.depth > 0) Promise.resolve().then(() => this.updateWaiting());
            else this.updateWaiting();
        } else {
            this.rawPersonal[slot] = prompt;
            this.personalStamp[slot] = stamp;
        }
        const copy: any = { ...prompt };
        Object.keys(prompt).forEach((key) => {
            const value = (prompt as any)[key];
            if (typeof value === "function") copy[key] = this.wrap("prompt", key, value, prompt.kind, slot, stamp);
        });
        return copy;
    }

    private saved(state: PlayerSave) {
        const json = serialize(state);
        this.lastSavedJson = json;
        this.log = [];
        this.savedDuringInput = true;
        writeOnlineSave({ code: this.code, playerId: this.localPlayerId, json });
    }

    // This device's player broke the rules (opened the inspect tools): everyone finds out, and they're expelled.
    public reportRuleBreak() {
        const owner = this.localPlayerId;
        if (!this.started || !this.controller || owner === null) return;
        const proposal: Proposal = { kind: "method", name: "ruleBreak", args: [], owner };
        if (!this.valid(proposal, this.room.selfId)) return;
        if (this.isHost) this.sequence(proposal, this.room.selfId);
        else if (this.hostId) this.room.send("propose", toWireInput({ ...proposal, seq: 0 }), this.hostId);
    }

    // The screen showing a player's own screen says so: methods called from it act for that player.
    public focus(owner: number | null) {
        this.focusOwner = owner;
    }

    // Whether the device `peerId` may act for `owner` (null: a screen everyone watches, the host's job).
    // The host also plays for any player whose device isn't connected, so the season never gets stuck.
    private allowed(owner: number | null, peerId: string): boolean {
        if (!this.started) return false;
        const hostPeer = this.isHost ? this.room.selfId : this.hostId;
        if (owner === null) return peerId === hostPeer;
        if (this.claims[owner] === peerId) return true;
        return peerId === hostPeer && !this.connected(this.claims[owner]);
    }

    // Whether an input can be applied now: sent by a device allowed to, for a screen that's still showing.
    private valid(p: Proposal, from: string): boolean {
        if (p.kind === "method" && p.name === "autopilot") return false; // only ever the host's own doing
        if (!this.allowed(p.owner, from)) return false;
        if (p.kind === "method" && p.name === "ruleBreak") {
            // only ever about the sender's own player
            return p.owner !== null && this.claims[p.owner] === from && !this.controller!.isRuleBreaker(p.owner);
        }
        if (p.kind === "method") {
            if (!this.rawMethods[p.name]) return false;
            // a method acts for a player who has a screen up: the shared one, or their own
            const shared = this.rawPrompt ? actorOf(this.rawPrompt) : null;
            return p.owner === shared || (p.owner !== null && !!this.rawPersonal[p.owner]);
        }
        const slot = p.slot === undefined ? null : p.slot;
        const prompt: any = slot === null ? this.rawPrompt : this.rawPersonal[slot];
        const stamp = slot === null ? this.sharedStamp : this.personalStamp[slot];
        const at = stamp ? stamp.at : -1;
        if (!prompt || prompt.kind !== p.promptKind || at !== p.at || typeof prompt[p.name] !== "function") return false;
        return slot === null ? actorOf(prompt) === p.owner : slot === p.owner;
    }

    // A player input made on this device. The host applies it and sends it to everyone; any other device
    // proposes it to the host and applies it when the host sends it back. Returns the result when it's
    // already been applied, otherwise a promise of it.
    private wrap(kind: "prompt" | "method", name: string, raw: (...args: any[]) => any, promptKind?: string, slot?: number | null, stamp?: Stamp) {
        const wrapped = (...args: any[]): any => {
            if (this.depth > 0) return raw(...args); // the controller calling itself
            let owner: number | null;
            if (kind === "prompt") {
                const prompt = slot === null || slot === undefined ? this.rawPrompt : this.rawPersonal[slot];
                owner = slot === null || slot === undefined ? (prompt ? actorOf(prompt) : null) : slot;
            } else {
                const focused = this.focusOwner !== null && this.rawPersonal[this.focusOwner] ? this.focusOwner : null;
                owner = focused !== null ? focused : this.rawPrompt ? actorOf(this.rawPrompt) : null;
            }
            const proposal: Proposal = { kind, name, args: wireCopy(args), promptKind, owner, slot, at: stamp ? stamp.at : undefined };
            if (this.isContinue(proposal) && this.everyoneContinues) return this.pressContinue(proposal);
            if (!this.valid(proposal, this.room.selfId)) return undefined; // not ours, or an old screen
            if (name === "onReport") {
                // a comp's score so far: not too often, but the latest one always gets sent
                const now = Date.now();
                clearTimeout(this.reportTimer);
                const wait = this.lastReport + 1500 - now;
                if (wait > 0) {
                    this.reportTimer = setTimeout(() => wrapped(...args), wait);
                    return undefined;
                }
                this.lastReport = now;
            }
            if (this.isHost) return this.sequence(proposal, this.room.selfId);
            if (!this.hostId) return undefined;
            const pid = ++this.pidSeq;
            let done = false;
            let result: any;
            let settle: (value: any) => void = (value) => {
                done = true;
                result = value;
            };
            this.proposals[pid] = { settle: (value) => settle(value) };
            this.room.send("propose", toWireInput({ ...proposal, pid, seq: 0 }), this.hostId);
            // the host answered straight away (it does in tests): no need for a promise
            if (done) return result;
            return new Promise((resolve) => {
                settle = resolve;
            });
        };
        return wrapped;
    }

    // ---------- Continue, together ----------

    // Moving on from a screen everyone watches (a scene's Continue, a results screen's button...).
    private isContinue(p: Proposal): boolean {
        if (p.owner !== null) return false;
        if (p.kind === "prompt") return p.slot === null || p.slot === undefined;
        return p.name === "continue" && !!this.rawPrompt && actorOf(this.rawPrompt) === null;
    }

    // The players whose Continue is waited for: everyone connected (an expelled player only watches).
    private continuers(): number[] {
        return Object.keys(this.claims)
            .map(Number)
            .filter((id) => this.connected(this.claims[id]) && !(this.controller && this.controller.isRuleBreaker(id)));
    }

    // Whether a screen everyone watches waits for everyone's Continue (with one player there's nobody to wait for).
    public get everyoneContinues(): boolean {
        return this.started && this.localPlayerId !== null && this.continuers().length > 1;
    }

    // A shared screen's Continue, the same as any input on it except that any player's device may press it.
    // `from` null: the host, moving on once everyone has pressed it.
    private validContinue(p: Proposal, from: string | null): boolean {
        if (from !== null && !Object.keys(this.claims).some((id) => this.claims[Number(id)] === from)) return false;
        const prompt: any = this.rawPrompt;
        if (!prompt || actorOf(prompt) !== null || p.at !== this.sharedStamp.at) return false;
        if (p.kind === "method") return p.name === "continue";
        return prompt.kind === p.promptKind && typeof prompt[p.name] === "function";
    }

    // This device pressed Continue: it tells the host, and waits for everyone else.
    private pressContinue(pressed: Proposal): undefined {
        const at = this.sharedStamp.at;
        const p = { ...pressed, at }; // for the screen it was pressed on
        if (!this.validContinue(p, this.room.selfId)) return undefined;
        if (this.myReadyAt === at && !this.isHost) return undefined; // pressed already
        this.myReadyAt = at;
        if (this.isHost) this.receiveReady(toWireInput({ ...p, seq: 0 }), this.room.selfId);
        else if (this.hostId) this.room.send("ready", toWireInput({ ...p, seq: 0 }), this.hostId);
        this.updateWaiting();
        return undefined;
    }

    // The host: a player pressed Continue. Once everyone has, it happens.
    private receiveReady(wire: Input, from: string) {
        if (!this.isHost || !this.controller) return;
        const { seq, ...p } = fromWireInput(wire);
        if (!this.validContinue(p, from)) return;
        const at = this.sharedStamp.at;
        const playerId = Number(Object.keys(this.claims).find((id) => this.claims[Number(id)] === from));
        if (p.at !== at) return;
        if (this.readyAt !== at) {
            this.readyAt = at;
            this.readyIds = [];
            this.readyProposal = null;
        }
        if (!this.readyIds.includes(playerId)) this.readyIds = [...this.readyIds, playerId];
        // the host's own press, if it made one: it's what the host's screen showed
        if (from === this.room.selfId || !this.readyProposal) this.readyProposal = p;
        this.room.send("readyState", { at, ids: this.readyIds });
        this.updateWaiting();
        this.checkReady();
    }

    // The host: everyone who's here has pressed Continue (someone leaving can make that true too).
    private checkReady() {
        if (!this.isHost || !this.readyProposal || this.readyAt !== this.sharedStamp.at) return;
        if (this.depth > 0) {
            // in the middle of an input: once it's done
            Promise.resolve().then(() => this.checkReady());
            return;
        }
        const waiting = this.continuers().filter((id) => !this.readyIds.includes(id));
        if (waiting.length > 0 && this.everyoneContinues) return;
        const p = this.readyProposal;
        this.readyProposal = null;
        this.readyIds = [];
        this.readyAt = -1;
        if (this.validContinue(p, null)) this.sequence(p, this.room.selfId);
    }

    // What this device's pressed Continue button says while it waits for the others (null: it isn't waiting).
    public get waitingText(): string | null {
        const me = this.localPlayerId;
        const at = this.sharedStamp.at;
        const pressed = me !== null && (this.myReadyAt === at || (this.readyAt === at && this.readyIds.includes(me)));
        if (!this.started || !this.controller || !pressed || !this.rawPrompt || actorOf(this.rawPrompt) !== null) return null;
        const done = this.readyAt === at ? this.readyIds : [];
        const names = this.continuers()
            .filter((id) => id !== me && !done.includes(id))
            .map((id) => this.playerName(id));
        return names.length === 0 ? "⏳ Moving on…" : `⏳ Waiting for ${names.join(" and ")}`;
    }

    private updateWaiting() {
        const text = this.waitingText;
        if (continueWaiting$.value !== text) continueWaiting$.next(text);
    }

    // The host: numbers an input, sends it to everyone and applies it.
    private sequence(p: Proposal, from: string): any {
        const input: Input = { ...p, seq: this.applied + 1, by: from };
        this.room.send("input", toWireInput(input));
        return this.exec(input);
    }

    // The host: another device's input.
    private receiveProposal(wire: Input, from: string) {
        if (!this.isHost || !this.controller) return;
        const { seq, ...p } = fromWireInput(wire);
        if (!this.valid(p, from)) {
            // too late (another input changed the screen first) or not theirs: tell them, so they stop waiting
            this.room.send("rejected", { pid: p.pid }, from);
            return;
        }
        this.sequence(p, from);
    }

    // A proposal this device made has been applied (with its result) or turned down (nothing).
    private settleProposal(pid: number | undefined, result?: any) {
        if (pid === undefined) return;
        const waiting = this.proposals[pid];
        if (!waiting) return;
        delete this.proposals[pid];
        waiting.settle(result);
    }

    // The host changed: proposals sent to the old one will never come back.
    private settleAllProposals() {
        Object.keys(this.proposals).forEach((pid) => this.settleProposal(Number(pid)));
    }

    private exec(input: Input): any {
        let result: any;
        let lost = false;
        this.savedDuringInput = false;
        // numbered before it runs, so screens it shows are stamped with this input (see Stamp)
        this.applied = Math.max(this.applied, input.seq);
        this.depth++;
        // the controller reseeds before its decisions, but not quite everywhere: start every input from the same
        // random state on every device, whatever else used the generator in between
        seedRng(`net:${input.seq}`);
        const controller = this.controller!;
        try {
            if (input.kind === "method") {
                const method = this.rawMethods[input.name];
                controller.actingFor = input.owner;
                if (method) result = method(...input.args);
            } else {
                const slot = input.slot === undefined ? null : input.slot;
                const prompt: any = slot === null ? this.rawPrompt : this.rawPersonal[slot];
                if (!prompt || prompt.kind !== input.promptKind || typeof prompt[input.name] !== "function") {
                    console.warn(`Online: got ${input.promptKind}.${input.name} but showing ${prompt ? prompt.kind : "nothing"}`);
                    lost = true;
                } else {
                    result = prompt[input.name](...input.args);
                }
            }
        } catch (e) {
            console.error("Online: an input failed", e);
        } finally {
            controller.actingFor = null;
            this.depth--;
        }
        if (!this.savedDuringInput) this.log.push(input);
        if (input.by === this.room.selfId) this.settleProposal(input.pid, result);
        if (lost) this.outOfSync();
        else if (this.isHost) this.scheduleHash();
        else this.checkHash();
        if (this.isHost) this.syncJuryChat();
        this.refreshChat();
        return result;
    }

    private receiveInput(wire: Input, from: string) {
        if (from !== this.hostId) return; // only the host numbers inputs
        const input = fromWireInput(wire);
        if (input.seq <= this.applied) return;
        this.buffer[input.seq] = input;
        this.drain();
    }

    private drain() {
        if (!this.controller) return;
        while (this.buffer[this.applied + 1]) {
            const next = this.buffer[this.applied + 1];
            delete this.buffer[next.seq];
            this.exec(next);
        }
        clearTimeout(this.gapTimer);
        if (Object.keys(this.buffer).length > 0) {
            // an input went missing: fetch the season again
            this.gapTimer = setTimeout(() => this.outOfSync(), 4000);
        }
    }

    private scheduleHash() {
        clearTimeout(this.hashTimer);
        this.hashTimer = setTimeout(() => this.sendHash(), this.opts.hashDelayMs ?? 700);
    }

    public sendHash() {
        if (!this.isHost || !this.controller) return;
        this.room.send("hash", { seq: this.applied, hash: this.signature() });
    }

    // The season's hash, and which screens are up: a device resumed from a save can have the same season but
    // be a screen ahead (a reload skips the scene the host is still looking at).
    private signature(): string {
        const p = this.rawPrompt;
        const own = Object.keys(this.rawPersonal)
            .map(Number)
            .sort((a, b) => a - b)
            .map((id) => `${id}:${this.rawPersonal[id].kind}`)
            .join(",");
        return `${stateHash(this.controller!.state)}|${p ? `${p.kind}:${actorOf(p)}` : "-"}|${own}`;
    }

    private checkHash() {
        const pending = this.pendingHash;
        if (!pending || !this.controller) return;
        if (pending.seq < this.applied) {
            this.pendingHash = null;
            return;
        }
        if (pending.seq > this.applied) return; // not there yet
        this.pendingHash = null;
        if (this.signature() !== pending.hash) {
            console.warn("Online: out of sync with the host, fetching the season again");
            this.outOfSync();
        }
    }

    // ---------- away players ----------

    // The host: a player whose device has been gone a while gets a bot playing for them, so the season never
    // waits on someone who isn't there; once they're back, they're in control again. Sent as an input, so every
    // device makes the switch at the same point.
    private checkAway() {
        clearTimeout(this.awayTimer);
        const c = this.controller;
        if (!this.isHost || !this.started || !c || c.state.step === Step.GameOver) return;
        if (this.depth > 0) {
            Promise.resolve().then(() => this.checkAway());
            return;
        }
        const now = Date.now();
        const wait = this.opts.awayMs ?? 15000;
        let next = Infinity;
        c.state.humanIds.forEach((id) => {
            if (c.isRuleBreaker(id)) return;
            if (this.connected(this.claims[id])) {
                delete this.awaySince[id];
                if (c.isAutopilot(id)) this.sequence({ kind: "method", name: "autopilot", args: [id, false], owner: null }, this.room.selfId);
                return;
            }
            if (c.isAutopilot(id)) return;
            if (this.awaySince[id] === undefined) this.awaySince[id] = now;
            const due = this.awaySince[id] + wait;
            if (due <= now) this.sequence({ kind: "method", name: "autopilot", args: [id, true], owner: null }, this.room.selfId);
            else next = Math.min(next, due);
        });
        if (next < Infinity) this.awayTimer = setTimeout(() => this.checkAway(), next - now + 20);
    }

    // ---------- chat ----------

    // Who may send a message to whom: houseguests in the house message each other; evicted ones, the jury house.
    public mayChat(from: number | null, to: number | "jury"): boolean {
        const c = this.controller;
        if (!c || !this.started || from === null || !c.state.humanIds.includes(from) || c.isRuleBreaker(from)) return false;
        const sender = getById(c.gameState, from);
        if (!sender) return false;
        if (to === "jury") return sender.isEvicted;
        const other = getById(c.gameState, to);
        return to !== from && !sender.isEvicted && !!other && !other.isEvicted && c.state.humanIds.includes(to) && !c.isRuleBreaker(to);
    }

    // Whether a player may read a message: their own private messages, and the jury house once they're in it.
    private mayRead(m: ChatMessage, playerId: number | null): boolean {
        if (playerId === null) return false;
        if (m.to === "jury") {
            const hg = this.controller && getById(this.controller.gameState, playerId);
            return !!hg && hg.isEvicted;
        }
        return m.from === playerId || m.to === playerId;
    }

    public sendChat(to: number | "jury", text: string) {
        const from = this.localPlayerId;
        const clean = String(text || "").trim().slice(0, CHAT_MAX_LENGTH);
        if (!clean || from === null || !this.mayChat(from, to)) return;
        const message: ChatMessage = { id: `${this.room.selfId}:${Date.now()}:${++this.chatSeq}`, from, to, text: clean, at: Date.now() };
        if (this.isHost) this.receiveChat(message, this.room.selfId);
        else if (this.hostId) this.room.send("chatSend", message, this.hostId);
    }

    // The host: a message from a device. Checked, then passed on to whoever may read it.
    private receiveChat(m: ChatMessage, from: string) {
        if (!this.isHost || !m || typeof m.text !== "string") return;
        const to = m.to === "jury" ? "jury" : Number(m.to);
        const sender = Number(m.from);
        if (this.claims[sender] !== from || !this.mayChat(sender, to)) return;
        const message: ChatMessage = { id: String(m.id).slice(0, 80), from: sender, to, text: m.text.trim().slice(0, CHAT_MAX_LENGTH), at: Date.now() };
        if (!message.text || this.allChat.some((x) => x.id === message.id)) return;
        this.addChat([message]);
        Object.keys(this.claims)
            .map(Number)
            .filter((id) => this.mayRead(message, id))
            .forEach((id) => {
                const peer = this.claims[id];
                if (peer !== this.room.selfId && this.connected(peer)) this.room.send("chat", [message], peer);
            });
    }

    // The host: everything a player may read, for their device (joining, or back).
    private sendChatLog(playerId: number, peerId: string) {
        const mine = this.allChat.filter((m) => this.mayRead(m, playerId));
        if (mine.length > 0) this.room.send("chatLog", mine, peerId);
    }

    // The host: a player just got evicted and moves into the jury house: they get its chat so far.
    private syncJuryChat() {
        const c = this.controller;
        if (!c) return;
        c.state.humanIds.forEach((id) => {
            const hg = getById(c.gameState, id);
            if (!hg || !hg.isEvicted || this.juryChatSent.has(id)) return;
            this.juryChatSent.add(id);
            const peer = this.claims[id];
            if (peer && peer !== this.room.selfId && this.connected(peer)) this.sendChatLog(id, peer);
        });
    }

    private addChat(list: ChatMessage[]) {
        const known = new Set(this.allChat.map((m) => m.id));
        const fresh = list.filter(
            (m) => m && typeof m.id === "string" && typeof m.text === "string" && !known.has(m.id) && (m.to === "jury" || typeof m.to === "number")
        );
        if (fresh.length === 0) return;
        this.allChat = [...this.allChat, ...fresh].sort((a, b) => a.at - b.at).slice(-CHAT_KEEP);
        storeChat(this.code, this.allChat);
        this.refreshChat();
    }

    private refreshChat() {
        const me = this.localPlayerId;
        const visible = this.allChat.filter((m) => this.mayRead(m, me));
        const current = this.chat$.value;
        if (visible.length !== current.length || visible.some((m, i) => m !== current[i])) this.chat$.next(visible);
    }

    // ---------- for the screens ----------

    public playerName(id: number): string {
        const slot = this.slots.find((s) => s.id === id);
        if (slot) return slot.name;
        return this.controller ? getById(this.controller.gameState, id).name : "?";
    }

    // for tests
    public get appliedInputs(): number {
        return this.applied;
    }

    // for tests: look for away players now
    public checkAwayNow() {
        this.checkAway();
    }
}

function slotsOf(save: PlayerSave): Slot[] {
    return save.humanIds.map((id) => {
        const hg = getById(save.gameState, id);
        return { id, name: hg.name, imageURL: hg.imageURL };
    });
}
