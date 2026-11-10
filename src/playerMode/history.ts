// A compact, serializable record of what happened each week. Used by quiz competitions and saves.
export interface WeekRecord {
    week: number;
    hohId?: number;
    nomineeIds: number[]; // final nominees (after the veto ceremony)
    povId?: number;
    evictedIds: number[];
}
