import { PlayerProfile } from "../model";
import { loadPref, savePref } from "../prefs/prefs";

// The Hall of Losers and the Hall of Winners: every season's first houseguest out and its winner, kept exactly
// as they were (face, name, hidden skills, personality, how willing they are to throw comps), so a season of
// them plays the same bots again.
//
// The All-Stars: the final four of every season, and whoever sent the player home. They come back with their
// last season behind them (see PastSeason): the house can read what they did, and they remember how things ended
// with the player.

export type Hall = "losers" | "winners" | "stars";

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
    stars: HallEntry[];
}

export function loadHalls(): Halls {
    const h = loadPref<Halls>(KEY, { losers: [], winners: [], stars: [] });
    return { losers: h.losers || [], winners: h.winners || [], stars: h.stars || [] };
}

export function recordHall(hall: Hall, entry: HallEntry) {
    const halls = loadHalls();
    if (halls[hall].some((e) => e.key === entry.key)) return;
    // an All-Star who's back again: their newest season replaces the one before
    if (hall === "stars") halls[hall] = halls[hall].filter((e) => e.profile.name !== entry.profile.name);
    halls[hall] = [...halls[hall], entry].slice(-MAX);
    savePref(KEY, halls);
}

// The cast for a Hall season: each houseguest as they were, newest seasons last.
export function hallCast(hall: Hall): PlayerProfile[] {
    return loadHalls()[hall].map((e) => ({ ...e.profile }));
}

export const HALL_MIN = 4;

// What a returning houseguest's last season comes to, in a line.
export function pastStory(placement: number, castSize: number): string {
    if (placement === 1) return `Won a ${castSize}-person season`;
    if (placement === 2) return `Runner-up in a ${castSize}-person season`;
    if (placement <= 4) return `Made the final ${placement === 3 ? "three" : "four"} of a ${castSize}-person season`;
    if (placement === castSize) return `First out of a ${castSize}-person season`;
    return `Finished ${placement} of ${castSize} last time`;
}
