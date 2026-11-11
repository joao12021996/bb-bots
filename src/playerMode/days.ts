// The season runs from Day 1 to Day 90, however many houseguests there are. Each week (one eviction, or
// the finale) takes an equal share of the 90 days, and finale night is always Day 90.

export const SEASON_DAYS = 90;

interface Cast {
    houseguests: { length: number };
}

// Weeks in the season: one per eviction down to the final 3, plus the finale.
export function totalWeeks(gs: Cast): number {
    return Math.max(1, gs.houseguests.length - 2);
}

export function weekStartDay(gs: Cast, week: number): number {
    const w = Math.max(1, Math.min(week, totalWeeks(gs) + 1));
    return 1 + Math.floor(((w - 1) * SEASON_DAYS) / totalWeeks(gs));
}

// The day something happens: `part` runs from 0 (the week's first day) to 1 (eviction night).
export function dayOf(gs: Cast, week: number, part: number): number {
    const w = Math.max(1, Math.min(week, totalWeeks(gs)));
    const start = weekStartDay(gs, w);
    const end = Math.max(start, weekStartDay(gs, w + 1) - 1);
    return start + Math.round(Math.max(0, Math.min(1, part)) * (end - start));
}

// When the week's main events happen.
export const DAY_PART = { hoh: 0, nominations: 0.2, veto: 0.5, vetoCeremony: 0.65, blockbuster: 0.8, eviction: 1 };

export function dayLabel(gs: Cast, week: number, part: number): string {
    return `Day ${dayOf(gs, week, part)}`;
}
