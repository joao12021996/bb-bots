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

const SAVE_KEY = "bb-bots-player-save";

export function writeSave(data: any): boolean {
    try {
        localStorage.setItem(SAVE_KEY, serialize(data));
        return true;
    } catch (e) {
        console.error("Could not save player mode progress", e);
        return false;
    }
}

export function readSave<T>(): T | null {
    try {
        const json = localStorage.getItem(SAVE_KEY);
        return json ? deserialize<T>(json) : null;
    } catch (e) {
        console.error("Could not read player mode save", e);
        return null;
    }
}

export function hasSave(): boolean {
    try {
        return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
        return false;
    }
}

export function clearSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch (e) {
        // ignore
    }
}
