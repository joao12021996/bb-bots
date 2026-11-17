import { loadPref, savePref } from "../prefs/prefs";
import { hashcode } from "../utils";
import { ordinal } from "./career";

// The daily season: one season a day, the same for everyone. The day's date makes the seed, and the seed makes
// the cast (their faces, names and hidden skills), their personalities, the comps, the powers and every bot's
// roll of the dice. What differs is you: who you talk to, what you promise, how you play the comps. Finish it and
// you get a result to share and compare; only your first finish of the day counts.

export const DAILY_BOTS = 11; // plus you: a house of twelve, though you take over with eight or fewer left (see dailyPrelude.ts)
export const DAILY_URL = "https://spotlegame.co.uk/houseguests/";

// The day, the same everywhere in the world (UTC): "2026-11-14".
export function dailyKey(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function dailySeed(key: string): number {
    return (Math.abs(hashcode(`houseguests-daily:${key}`)) % 1000000006) + 1;
}

// How many days since the first daily season: "Daily #12".
export function dailyNumber(key: string): number {
    const first = Date.UTC(2026, 10, 14);
    return Math.max(1, Math.round((Date.parse(`${key}T00:00:00Z`) - first) / 86400000) + 1);
}

export function msUntilNextDaily(now: Date = new Date()): number {
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return next - now.getTime();
}

export interface DailyResult {
    key: string;
    when: number;
    name: string;
    placement: number;
    castSize: number;
    won: boolean;
    hohWins: number;
    vetoWins: number;
    juryVotesFor: number;
    juryVotesTotal: number;
    weeks: number; // evictions survived
}

interface DailyBook {
    results: { [key: string]: DailyResult };
}

const KEY = "daily";
const MAX_DAYS = 400;

export function loadDaily(): DailyBook {
    const book = loadPref<DailyBook>(KEY, { results: {} });
    return { results: book.results || {} };
}

export function dailyResult(key: string): DailyResult | undefined {
    return loadDaily().results[key];
}

// Records the day's result: the first finish only. True if it was recorded.
export function recordDaily(result: DailyResult): boolean {
    const book = loadDaily();
    if (book.results[result.key]) return false;
    book.results[result.key] = result;
    const days = Object.keys(book.results).sort();
    days.slice(0, Math.max(0, days.length - MAX_DAYS)).forEach((d) => delete book.results[d]);
    savePref(KEY, book);
    return true;
}

const dayBefore = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

// Days in a row with a finished daily season, up to today (a streak isn't broken until a day has gone by unplayed).
export function dailyStreak(today: string = dailyKey(), results: { [key: string]: DailyResult } = loadDaily().results): number {
    let day = results[today] ? today : dayBefore(today);
    let n = 0;
    while (results[day]) {
        n++;
        day = dayBefore(day);
    }
    return n;
}

export function dailyBest(results: { [key: string]: DailyResult } = loadDaily().results): { played: number; wins: number; best: number | null } {
    const all = Object.values(results);
    return { played: all.length, wins: all.filter((r) => r.won).length, best: all.length ? Math.min(...all.map((r) => r.placement)) : null };
}

const MEDAL = ["🥇", "🥈", "🥉"];

// The result as text to share: no spoilers about who did what, just how far you got.
export function dailyShareText(r: DailyResult, streak: number = 0): string {
    // one square per houseguest you outlasted, and a door where you went out
    const outlasted = r.castSize - r.placement;
    const row = "🟪".repeat(outlasted) + (r.won ? "👑" : "🚪") + "⬛".repeat(Math.max(0, r.placement - 1));
    const lines = [
        `Houseguest Bots Daily #${dailyNumber(r.key)}`,
        `${MEDAL[r.placement - 1] || "🏠"} ${r.won ? "Won" : `${ordinal(r.placement)} of ${r.castSize}`}${r.juryVotesTotal > 0 ? ` · jury ${r.juryVotesFor}-${r.juryVotesTotal - r.juryVotesFor}` : ""}`,
        row,
        `👑 ${r.hohWins} · 🏅 ${r.vetoWins}${streak > 1 ? ` · 🔥 ${streak} days` : ""}`,
        DAILY_URL,
    ];
    return lines.join("\n");
}
