import { GameState, Houseguest, inJury } from "../../model";

// ---------- Have-Nots ----------

// How many of the HoH comp's worst scorers become Have-Nots, for a house this size.
export function haveNotCount(houseSize: number): number {
    if (houseSize >= 9) return 3;
    if (houseSize >= 5) return 2;
    if (houseSize >= 4) return 1;
    return 0;
}

// ---------- Double Eviction ----------

// Houses this big get one. Smaller ones are over too soon to lose two in a night.
export const DOUBLE_EVICTION_MIN_CAST = 10;

// The Double Eviction happens once: right after the eviction that leaves this many in the house, a whole week is
// played in one night (Head of Household, nominations, veto, vote), with no time to talk in between. It falls a
// little past the middle of the season, with enough of a house left for the second eviction to be a real vote.
export function doubleEvictionAt(castSize: number): number {
    if (castSize < DOUBLE_EVICTION_MIN_CAST) return 0;
    return castSize >= 14 ? 9 : castSize >= 12 ? 8 : 7;
}

// ---------- the Battle Back ----------

// Who can fight their way back in: everyone who's been evicted.
export function battleBackCandidates(gs: GameState): Houseguest[] {
    return gs.houseguests.filter((hg) => hg.isEvicted);
}

// The Battle Back happens once, right before the jury starts (the next eviction makes the first juror), as long
// as there are at least two evicted houseguests to fight for it and enough of a game left to come back to.
// Small houses that start with a jury get it as soon as two houseguests are out.
export function battleBackDue(gs: GameState, candidates: number): boolean {
    if (candidates < 2 || gs.remainingPlayers < 5) return false;
    return !!inJury(gs) || gs.remainingPlayers <= 6;
}
