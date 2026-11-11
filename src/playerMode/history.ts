// A compact, serializable record of what happened each week. Used by quiz competitions and saves.
export interface WeekRecord {
    week: number;
    hohId?: number;
    nomineeIds: number[]; // final nominees (after the veto ceremony)
    povId?: number;
    blockbusterId?: number; // won the Last Chance comp (came off the block)
    evictedIds: number[];
}
