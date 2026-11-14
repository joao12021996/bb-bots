import { BehaviorSubject } from "rxjs";
import { GameState, Houseguest, MutableGameState } from "../../model";
import {
    BlankVote,
    EndTeamVote,
    GrayVote,
    HoHVote,
    NomineeVote,
    NormalVote,
    PoVvote,
    RunnerUpVote,
    SaveVote,
    TeamVote,
    WinnerVote,
} from "../../model/logging/voteType";

// JSON (de)serialization for player mode saves. Class instances are tagged so they can be rebuilt:
// Houseguest, GameState, Set, and the VoteType classes (which carry a render function).

const VOTE_CLASSES: [string, any][] = [
    ["SaveVote", SaveVote],
    ["NormalVote", NormalVote],
    ["BlankVote", BlankVote],
    ["WinnerVote", WinnerVote],
    ["RunnerUpVote", RunnerUpVote],
    ["NomineeVote", NomineeVote],
    ["PoVvote", PoVvote],
    ["GrayVote", GrayVote],
    ["HoHVote", HoHVote],
    ["TeamVote", TeamVote],
    ["EndTeamVote", EndTeamVote],
];

function replacer(this: any, key: string, value: any): any {
    // JSON.stringify passes already-converted values for some types; use the raw holder value
    const raw = this && key in this ? this[key] : value;
    if (raw instanceof Set) return { __set: Array.from(raw) };
    if (raw instanceof GameState || raw instanceof MutableGameState) {
        // houseguestCache duplicates houseguests; rebuilt on load
        const { houseguestCache, ...rest } = raw as any;
        return { __gs: { ...rest } };
    }
    if (raw instanceof Houseguest) return { __hg: { ...raw } };
    for (const [name, cls] of VOTE_CLASSES) {
        if (raw instanceof cls) return { __vote: name, fields: { ...raw } };
    }
    return value;
}

function reviver(_key: string, value: any): any {
    if (value && typeof value === "object") {
        if (value.__set) return new Set(value.__set);
        if (value.__hg) return new Houseguest(value.__hg);
        if (value.__vote) {
            const entry = VOTE_CLASSES.find(([name]) => name === value.__vote);
            if (!entry) return value.fields;
            // construct with placeholder args, then restore the saved fields
            const instance = new entry[1](value.fields.id ?? value.fields.text ?? -1);
            return Object.assign(instance, value.fields);
        }
        if (value.__gs) {
            const gs: any = new GameState({ players: [], jury: 1 });
            Object.assign(gs, value.__gs);
            const cache: { [id: number]: Houseguest } = {};
            gs.houseguests.forEach((hg: Houseguest) => (cache[hg.id] = hg));
            gs.houseguestCache = cache;
            return gs;
        }
    }
    return value;
}

export function serialize(data: any): string {
    return JSON.stringify(data, replacer);
}

export function deserialize<T>(json: string): T {
    return JSON.parse(json, reviver) as T;
}

// Uploaded portraits are blob: URLs that stop working after a reload. Shrink them and inline
// them as data URLs so saves keep their pictures (and stay well under the storage quota).
export async function inlineBlobImages(houseguests: { imageURL: string }[], size: number = 160): Promise<void> {
    await Promise.all(
        houseguests.map(
            (hg) =>
                new Promise<void>((resolve) => {
                    if (!hg.imageURL.startsWith("blob:")) return resolve();
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const canvas = document.createElement("canvas");
                            canvas.width = size;
                            canvas.height = size;
                            const ctx = canvas.getContext("2d")!;
                            // center-crop to a square
                            const s = Math.min(img.width, img.height);
                            ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
                            hg.imageURL = canvas.toDataURL("image/jpeg", 0.8);
                        } catch (e) {
                            // keep the blob URL if the browser refuses
                        }
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = hg.imageURL;
                })
        )
    );
}

// ---------- saved seasons ----------
//
// Every season in progress has its own slot (named after the season's seed), so starting a new season doesn't
// replace one that's still going. An index lists the slots, with enough about each to tell them apart without
// reading the whole season. Seasons saved before slots existed (one season, under LEGACY_KEY) move into a slot
// the first time saves are looked at.

const LEGACY_KEY = "bb-bots-player-save";
const INDEX_KEY = "bb-bots-saves";
const SLOT_PREFIX = "bb-bots-save:";
export const MAX_SAVES = 8;

export interface SaveInfo {
    id: string; // the season's seed
    when: number; // last saved
    players: string[]; // the players' names
    week: number; // the week it's on (1: the first)
    left: number; // houseguests still in the house
    cast: number;
    difficulty?: string;
    image?: string; // the first player's picture
}

// True once a save couldn't be written (storage is full, or blocked): the season's screen warns the player.
export const saveFailed$ = new BehaviorSubject<boolean>(false);

function infoOf(data: any, id: string): SaveInfo {
    const gs = data.gameState || {};
    const hgs: any[] = gs.houseguests || [];
    const humans = (data.humanIds || []).map((h: number) => hgs.find((x) => x.id === h)).filter(Boolean);
    return {
        id,
        when: Date.now(),
        players: humans.map((h: any) => String(h.name)),
        week: ((data.history && data.history.length) || 0) + 1,
        left: hgs.filter((h) => !h.isEvicted).length,
        cast: hgs.length,
        difficulty: data.difficulty,
        image: humans[0] && typeof humans[0].imageURL === "string" && humans[0].imageURL.length < 40000 ? humans[0].imageURL : undefined,
    };
}

function readIndex(): SaveInfo[] {
    try {
        const list = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
        return Array.isArray(list) ? list.filter((x) => x && typeof x.id === "string") : [];
    } catch (e) {
        return [];
    }
}

function writeIndex(list: SaveInfo[]) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

// a season saved before there were slots
function adoptLegacy() {
    try {
        const json = localStorage.getItem(LEGACY_KEY);
        if (!json) return;
        const data = deserialize<any>(json);
        const id = String(data && data.seed !== undefined ? data.seed : "old");
        localStorage.setItem(SLOT_PREFIX + id, json);
        writeIndex([...readIndex().filter((x) => x.id !== id), infoOf(data, id)]);
        localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
        // unreadable, or no room to move it: leave it where it is
    }
}

// The saved seasons, the most recently played first.
export function listSaves(): SaveInfo[] {
    try {
        adoptLegacy();
        return readIndex()
            .filter((x) => localStorage.getItem(SLOT_PREFIX + x.id) !== null)
            .sort((a, b) => b.when - a.when);
    } catch (e) {
        return [];
    }
}

export function writeSave(data: any): boolean {
    try {
        const id = String(data.seed);
        const json = serialize(data);
        let index = listSaves().filter((x) => x.id !== id);
        // a full shelf: the season left alone the longest makes room
        while (index.length >= MAX_SAVES) {
            const oldest = index[index.length - 1];
            localStorage.removeItem(SLOT_PREFIX + oldest.id);
            index = index.slice(0, -1);
        }
        localStorage.setItem(SLOT_PREFIX + id, json);
        writeIndex([infoOf(data, id), ...index]);
        if (saveFailed$.value) saveFailed$.next(false);
        return true;
    } catch (e) {
        console.error("Could not save player mode progress", e);
        if (!saveFailed$.value) saveFailed$.next(true);
        return false;
    }
}

// A saved season (left out: the one played last).
export function readSave<T>(id?: string | number): T | null {
    try {
        const slot = id !== undefined ? String(id) : (listSaves()[0] || { id: undefined }).id;
        if (slot === undefined) return null;
        const json = localStorage.getItem(SLOT_PREFIX + slot);
        return json ? deserialize<T>(json) : null;
    } catch (e) {
        console.error("Could not read player mode save", e);
        return null;
    }
}

export function hasSave(): boolean {
    return listSaves().length > 0;
}

// Forgets a saved season (left out: all of them).
export function clearSave(id?: string | number) {
    try {
        const all = listSaves();
        const gone = id !== undefined ? all.filter((x) => x.id === String(id)) : all;
        gone.forEach((x) => localStorage.removeItem(SLOT_PREFIX + x.id));
        writeIndex(all.filter((x) => !gone.includes(x)));
        if (id === undefined) localStorage.removeItem(LEGACY_KEY);
        if (saveFailed$.value) saveFailed$.next(false);
    } catch (e) {
        // ignore
    }
}

// A saved season as text, for a file; and back again (false: not a season, or no room for it).
export function exportSave(id: string): string | null {
    try {
        return localStorage.getItem(SLOT_PREFIX + id);
    } catch (e) {
        return null;
    }
}

export function importSave(json: string): boolean {
    try {
        const data = deserialize<any>(json);
        if (!data || typeof data !== "object" || data.seed === undefined || !data.gameState || !Array.isArray(data.humanIds)) return false;
        return writeSave(data);
    } catch (e) {
        return false;
    }
}

// Online seasons are saved separately (with the room code and which player this device is), so joining
// someone else's game never overwrites your own saved season.
const ONLINE_KEY = "bb-bots-online-save";

export interface OnlineSaveData {
    code: string;
    playerId: number | null;
    json: string; // serialize(PlayerSave)
}

export function writeOnlineSave(data: OnlineSaveData) {
    try {
        localStorage.setItem(ONLINE_KEY, JSON.stringify(data));
    } catch (e) {
        // fine: the host still has the season, and rejoining fetches it from them
    }
}

export function readOnlineSave(): OnlineSaveData | null {
    try {
        const json = localStorage.getItem(ONLINE_KEY);
        return json ? (JSON.parse(json) as OnlineSaveData) : null;
    } catch (e) {
        return null;
    }
}

export function clearOnlineSave() {
    try {
        localStorage.removeItem(ONLINE_KEY);
    } catch (e) {
        // ignore
    }
}
