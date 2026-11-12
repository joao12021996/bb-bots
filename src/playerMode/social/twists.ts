import { GameState, Houseguest, inJury } from "../../model";

// ---------- Have-Nots ----------

// How many of the HoH comp's worst scorers become Have-Nots, for a house this size.
export function haveNotCount(houseSize: number): number {
    if (houseSize >= 9) return 3;
    if (houseSize >= 5) return 2;
    if (houseSize >= 4) return 1;
    return 0;
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
