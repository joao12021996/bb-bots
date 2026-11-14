// A compact, serializable record of what happened each week. Used by quiz competitions and saves.
export interface WeekRecord {
    week: number;
    hohId?: number;
    nomineeIds: number[]; // final nominees (after the veto ceremony)
    povId?: number;
    blockbusterId?: number; // won the Block Breaker (came off the block)
    evictedIds: number[];
    votes?: { [nomineeId: number]: number }; // the eviction count, once announced (e.g. 5 to 2)
    // why the bots did what they did: the HoH's nominations, and each bot's vote (revealed when the season ends)
    why?: { noms?: { [nomineeId: number]: string }; votes?: { [voterId: number]: { t: number; why: string } } };
}
