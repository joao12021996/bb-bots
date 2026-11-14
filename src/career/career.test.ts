import { ACHIEVEMENTS, catchUpAchievements, loadCareer, madeJury, recordSeason, resetCareer, SeasonSummary } from "./career";
import { savePref } from "../prefs/prefs";

let n = 0;
function season(over: Partial<SeasonSummary> = {}): SeasonSummary {
    n++;
    return {
        key: `s${n}`,
        when: n,
        name: "Sam",
        placement: 6,
        castSize: 12,
        won: false,
        hohWins: 0,
        vetoWins: 0,
        lastChanceWins: 0,
        nominated: 1,
        survivedBlock: 0,
        juryVotesFor: 0,
        juryVotesTotal: 0,
        backstabs: 0,
        bigMoves: 0,
        brokePromises: 0,
        keptPromises: 0,
        alliances: 0,
        showmance: false,
        cameBack: false,
        difficulty: "normal",
        online: false,
        players: 1,
        jurySize: 5,
        ...over,
    };
}

const ids = (list: { id: string }[]) => list.map((a) => a.id);
const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;

describe("career", () => {
    beforeEach(() => resetCareer());

    it("every achievement has its own id", () => {
        expect(new Set(ids(ACHIEVEMENTS)).size).toBe(ACHIEVEMENTS.length);
    });

    it("the jury is the season's real jury, not half the house", () => {
        // 12 houseguests, 5 jurors: 7th place is on the jury, 8th isn't
        expect(madeJury(season({ placement: 7 }))).toBe(true);
        expect(madeJury(season({ placement: 8 }))).toBe(false);
        // a season from before the jury's size was recorded: half the house
        expect(madeJury(season({ placement: 6, jurySize: undefined }))).toBe(true);
        expect(madeJury(season({ placement: 7, jurySize: undefined }))).toBe(false);
    });

    it("Cutthroat Champion takes Cutthroat; Hard gets its own", () => {
        const hard = ids(recordSeason(season({ won: true, placement: 1, difficulty: "hard" })));
        expect(hard).toContain("hard-win");
        expect(hard).not.toContain("cutthroat-win");
        const cutthroat = ids(recordSeason(season({ won: true, placement: 1, difficulty: "cutthroat" })));
        expect(cutthroat).toContain("cutthroat-win");
    });

    it("a season is recorded once", () => {
        const s = season({ won: true, placement: 1 });
        expect(recordSeason(s).length).toBeGreaterThan(0);
        expect(recordSeason(s)).toEqual([]);
        expect(loadCareer().seasons.length).toBe(1);
    });

    it("shows how far along a locked achievement is", () => {
        recordSeason(season({ hohWins: 2, vetoWins: 1 }));
        recordSeason(season({ hohWins: 1 }));
        const career = loadCareer();
        expect(byId("hoh-3").progress!(career)).toEqual([2, 3]); // the best single season
        expect(byId("hoh-10").progress!(career)).toEqual([3, 10]); // all of them
        expect(byId("veteran").progress!(career)).toEqual([2, 10]);
        expect(byId("first-win").progress).toBeUndefined();
    });

    it("career achievements unlock on the season that gets there", () => {
        expect(ids(recordSeason(season({ won: true, placement: 1 })))).not.toContain("back-to-back");
        expect(ids(recordSeason(season({ won: true, placement: 1 })))).toContain("back-to-back");
    });

    it("past seasons unlock achievements added since", () => {
        const first = season({ won: true, placement: 1, nominated: 0 });
        const second = season({ placement: 2 });
        // a career from before these achievements existed
        savePref("career", { seasons: [first, second], unlocked: { "first-win": { when: 1, season: first.key } } });
        expect(catchUpAchievements()).toBeGreaterThan(0);
        const unlocked = loadCareer().unlocked;
        expect(unlocked["untouchable"].season).toBe(first.key);
        expect(unlocked["finalist"].season).toBe(first.key);
        expect(unlocked["first-win"].when).toBe(1); // left as it was
        expect(catchUpAchievements()).toBe(0);
    });
});
