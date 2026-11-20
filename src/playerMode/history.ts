import { DAY_PART, dayOf } from "./days";

// A compact, serializable record of what happened each week. Used by quiz competitions and saves.
export interface WeekRecord {
    week: number;
    hohId?: number;
    nomineeIds: number[]; // final nominees (after the veto ceremony)
    povId?: number;
    blockbusterId?: number; // won the Block Breaker (came off the block)
    evictedIds: number[];
    joinedPart?: number; // seenHistory: the player took over partway through this week, this far in (as in DAY_PART)
    votes?: { [nomineeId: number]: number }; // the eviction count, once announced (e.g. 5 to 2)
    // why the bots did what they did: the HoH's nominations, and each bot's vote (revealed when the season ends)
    why?: { noms?: { [nomineeId: number]: string }; votes?: { [voterId: number]: { t: number; why: string } } };
}

// The daily season: the moment the player took over from their stand-in (`part` as in DAY_PART: 0 is the week's
// first day, 1 eviction night). What happened before it, the player never saw.
export interface JoinedAt {
    week: number;
    part: number;
}

// The season as the player lived it: the weeks before they took over are gone, and so is anything that happened
// earlier in the week they took over. Memory comps ask only about this.
export function seenHistory(history: WeekRecord[], joinedAt?: JoinedAt): WeekRecord[] {
    if (!joinedAt) return history;
    return history
        .filter((w) => w.week >= joinedAt.week)
        .map((w) => {
            if (w.week > joinedAt.week) return w;
            const after = (part: number) => part >= joinedAt.part;
            return {
                ...w,
                joinedPart: joinedAt.part,
                hohId: after(DAY_PART.hoh) ? w.hohId : undefined,
                povId: after(DAY_PART.veto) ? w.povId : undefined,
                nomineeIds: after(DAY_PART.vetoCeremony) ? w.nomineeIds : [],
                blockbusterId: after(DAY_PART.blockbuster) ? w.blockbusterId : undefined,
            };
        });
}

// " since Day 34": for statements about a whole stay, when the season the players saw doesn't start on Day 1.
export function sinceLabel(gs: { houseguests: { length: number } }, history: WeekRecord[]): string {
    const first = history.find((w) => w.joinedPart !== undefined);
    return first ? ` since Day ${dayOf(gs, first.week, first.joinedPart!)}` : "";
}

// The houseguests who were in the house when `history` starts: still in, or evicted since.
export function presentFor<T extends { id: number; isEvicted?: boolean }>(houseguests: T[], history: WeekRecord[]): T[] {
    const evicted = new Set(history.flatMap((w) => w.evictedIds));
    return houseguests.filter((hg) => !hg.isEvicted || evicted.has(hg.id));
}

// How many times each houseguest won HoH, won the veto, and sat on the block after the veto ceremony, in `history`.
export function tally(history: WeekRecord[]): { hoh: Map<number, number>; pov: Map<number, number>; block: Map<number, number> } {
    const t = { hoh: new Map<number, number>(), pov: new Map<number, number>(), block: new Map<number, number>() };
    const add = (m: Map<number, number>, id?: number) => id !== undefined && m.set(id, (m.get(id) ?? 0) + 1);
    history.forEach((w) => {
        add(t.hoh, w.hohId);
        add(t.pov, w.povId);
        w.nomineeIds.forEach((id) => add(t.block, id));
    });
    return t;
}
