import { PlayerProfile } from "../model";
import { loadPref, savePref } from "../prefs/prefs";

// The Hall of Losers and the Hall of Winners: every season's first houseguest out and its winner, kept exactly
// as they were (face, name, hidden skills, personality, how willing they are to throw comps), so a season of
// them plays the same bots again.

export type Hall = "losers" | "winners";

export interface HallEntry {
    key: string; // the season and the houseguest: recorded once
    when: number;
    castSize: number;
    profile: PlayerProfile;
}

const KEY = "halls";
const MAX = 64; // a big house

interface Halls {
    losers: HallEntry[];
    winners: HallEntry[];
}

export function loadHalls(): Halls {
    const h = loadPref<Halls>(KEY, { losers: [], winners: [] });
    return { losers: h.losers || [], winners: h.winners || [] };
}

export function recordHall(hall: Hall, entry: HallEntry) {
    const halls = loadHalls();
    if (halls[hall].some((e) => e.key === entry.key)) return;
    halls[hall] = [...halls[hall], entry].slice(-MAX);
    savePref(KEY, halls);
}

// The cast for a Hall season: each houseguest as they were, newest seasons last.
export function hallCast(hall: Hall): PlayerProfile[] {
    return loadHalls()[hall].map((e) => ({ ...e.profile }));
}

export const HALL_MIN = 4;
