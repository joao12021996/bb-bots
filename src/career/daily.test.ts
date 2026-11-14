import { dailyBest, dailyKey, dailyNumber, dailyResult, dailySeed, dailyShareText, dailyStreak, DailyResult, msUntilNextDaily, recordDaily } from "./daily";

function result(key: string, over: Partial<DailyResult> = {}): DailyResult {
    return { key, when: 1, name: "Sam", placement: 4, castSize: 12, won: false, hohWins: 2, vetoWins: 1, juryVotesFor: 0, juryVotesTotal: 0, weeks: 8, ...over };
}

describe("the daily season", () => {
    beforeEach(() => window.localStorage.clear());

    it("is the same day, and the same seed, everywhere", () => {
        expect(dailyKey(new Date("2026-11-14T23:59:59Z"))).toBe("2026-11-14");
        expect(dailyKey(new Date("2026-11-15T00:00:01Z"))).toBe("2026-11-15");
        expect(dailySeed("2026-11-14")).toBe(dailySeed("2026-11-14"));
        expect(dailySeed("2026-11-14")).not.toBe(dailySeed("2026-11-15"));
        expect(dailySeed("2026-11-14")).toBeGreaterThan(0);
        expect(dailyNumber("2026-11-14")).toBe(1);
        expect(dailyNumber("2026-11-20")).toBe(7);
    });

    it("counts down to the next one", () => {
        expect(msUntilNextDaily(new Date("2026-11-14T23:00:00Z"))).toBe(3600000);
        expect(msUntilNextDaily(new Date("2026-11-14T00:00:00Z"))).toBe(86400000);
    });

    it("only the first finish of the day counts", () => {
        expect(recordDaily(result("2026-11-14", { placement: 6 }))).toBe(true);
        expect(recordDaily(result("2026-11-14", { placement: 1, won: true }))).toBe(false);
        expect(dailyResult("2026-11-14")!.placement).toBe(6);
        expect(dailyResult("2026-11-15")).toBeUndefined();
    });

    it("a streak runs through yesterday, and ends after a missed day", () => {
        const results: { [k: string]: DailyResult } = {};
        ["2026-11-10", "2026-11-12", "2026-11-13", "2026-11-14"].forEach((k) => (results[k] = result(k)));
        expect(dailyStreak("2026-11-14", results)).toBe(3);
        // not played yet today: still alive
        expect(dailyStreak("2026-11-15", results)).toBe(3);
        // a whole day missed: gone
        expect(dailyStreak("2026-11-16", results)).toBe(0);
        expect(dailyStreak("2026-11-14", {})).toBe(0);
    });

    it("keeps the best finish and the wins", () => {
        const results = { a: result("a", { placement: 5 }), b: result("b", { placement: 1, won: true }) };
        expect(dailyBest(results)).toEqual({ played: 2, wins: 1, best: 1 });
        expect(dailyBest({})).toEqual({ played: 0, wins: 0, best: null });
    });

    it("shares how far you got, without saying who did what", () => {
        const text = dailyShareText(result("2026-11-14"), 3);
        expect(text.split("\n")).toEqual(["Houseguest Bots Daily #1", "🏠 4th of 12", "🟪🟪🟪🟪🟪🟪🟪🟪🚪⬛⬛⬛", "👑 2 · 🏅 1 · 🔥 3 days", "https://spotlegame.co.uk/houseguests/"]);
        const won = dailyShareText(result("2026-11-15", { placement: 1, won: true, juryVotesFor: 4, juryVotesTotal: 5 }));
        expect(won).toContain("🥇 Won · jury 4-1");
        expect(won).toContain("🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪👑");
        expect(won).not.toContain("🔥");
    });
});
