import { clearSave, exportSave, hasSave, importSave, listSaves, MAX_SAVES, readSave, saveFailed$, serialize, writeSave } from "./serialize";
import { describeBackup, makeBackup, parseBackup, restoreBackup } from "../../prefs/backup";
import { savePref, loadPref } from "../../prefs/prefs";

// just enough of a season for the list of saves
function season(seed: number, weeks = 0, name = "Sam"): any {
    return {
        seed,
        humanIds: [0],
        history: Array.from({ length: weeks }, (_, i) => ({ week: i + 1 })),
        difficulty: "normal",
        gameState: {
            houseguests: [
                { id: 0, name, imageURL: "data:image/png;base64,AAAA", isEvicted: false },
                { id: 1, name: "Bot", imageURL: "", isEvicted: weeks > 0 },
            ],
        },
    };
}

describe("saved seasons", () => {
    beforeEach(() => {
        window.localStorage.clear();
        saveFailed$.next(false);
    });

    it("keeps each season in its own slot", () => {
        expect(hasSave()).toBe(false);
        writeSave(season(1, 0, "Ana"));
        writeSave(season(2, 3, "Ben"));
        const saves = listSaves();
        expect(saves.map((s) => s.id)).toEqual(["2", "1"]); // the last played first
        expect(saves[0]).toMatchObject({ players: ["Ben"], week: 4, left: 1, cast: 2, difficulty: "normal" });
        expect(readSave<any>("1").seed).toBe(1);
        expect(readSave<any>().seed).toBe(2); // none named: the last played
    });

    it("saving a season again updates its slot", () => {
        writeSave(season(1, 0));
        writeSave(season(2, 0));
        writeSave(season(1, 5));
        expect(listSaves().map((s) => s.id)).toEqual(["1", "2"]);
        expect(listSaves()[0].week).toBe(6);
    });

    it("deletes one season, or all of them", () => {
        writeSave(season(1));
        writeSave(season(2));
        clearSave(1);
        expect(listSaves().map((s) => s.id)).toEqual(["2"]);
        expect(readSave("1")).toBeNull();
        clearSave();
        expect(hasSave()).toBe(false);
    });

    it("a full shelf drops the season left alone the longest", () => {
        for (let i = 1; i <= MAX_SAVES + 2; i++) writeSave(season(i));
        const ids = listSaves().map((s) => s.id);
        expect(ids.length).toBe(MAX_SAVES);
        expect(ids).not.toContain("1");
        expect(ids).not.toContain("2");
        expect(readSave("1")).toBeNull();
    });

    it("moves a season saved before there were slots into one", () => {
        window.localStorage.setItem("bb-bots-player-save", serialize(season(77, 2, "Old")));
        expect(hasSave()).toBe(true);
        expect(listSaves()[0]).toMatchObject({ id: "77", players: ["Old"], week: 3 });
        expect(window.localStorage.getItem("bb-bots-player-save")).toBeNull();
        expect(readSave<any>().seed).toBe(77);
    });

    it("a season goes out to a file and comes back", () => {
        writeSave(season(5, 2, "Cleo"));
        const file = exportSave("5")!;
        clearSave();
        expect(importSave("not a season")).toBe(false);
        expect(importSave(JSON.stringify({ hello: 1 }))).toBe(false);
        expect(importSave(file)).toBe(true);
        expect(listSaves()[0]).toMatchObject({ id: "5", players: ["Cleo"], week: 3 });
    });

    it("says so when a season can't be saved, and stops saying so once it can", () => {
        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        const real = window.localStorage.setItem.bind(window.localStorage);
        const storage: any = window.localStorage;
        storage.setItem = () => {
            throw new Error("QuotaExceededError");
        };
        expect(writeSave(season(1))).toBe(false);
        expect(saveFailed$.value).toBe(true);
        storage.setItem = real;
        expect(writeSave(season(1))).toBe(true);
        expect(saveFailed$.value).toBe(false);
        spy.mockRestore();
    });
});

describe("a copy of everything", () => {
    beforeEach(() => window.localStorage.clear());

    it("holds stats, settings and saved seasons, and nothing else", () => {
        savePref("career", { seasons: [{ key: "a" }, { key: "b" }], unlocked: { "first-win": { when: 1, season: "a" } } });
        savePref("muted", true);
        writeSave(season(9));
        window.localStorage.setItem("bb-bots-online-save", "{}");
        window.localStorage.setItem("someone-elses", "x");
        const backup = makeBackup();
        expect(Object.keys(backup.items).sort()).toEqual(["bb-bots-save:9", "bb-bots-saves", "bbb-pref:career", "bbb-pref:muted"]);
        expect(describeBackup(backup)).toEqual({ seasons: 2, achievements: 1, saves: 1 });
    });

    it("comes back on another device, replacing what was there", () => {
        savePref("career", { seasons: [{ key: "a" }], unlocked: {} });
        writeSave(season(9));
        const text = JSON.stringify(makeBackup());
        // another device, with its own things
        window.localStorage.clear();
        savePref("career", { seasons: [], unlocked: {} });
        savePref("bests", { maze: 3 });
        writeSave(season(4));
        window.localStorage.setItem("someone-elses", "x");
        const backup = parseBackup(text)!;
        expect(restoreBackup(backup)).toBe(true);
        expect(loadPref<any>("career", null).seasons.length).toBe(1);
        expect(loadPref<any>("bests", null)).toBeNull();
        expect(listSaves().map((s) => s.id)).toEqual(["9"]);
        expect(window.localStorage.getItem("someone-elses")).toBe("x");
    });

    it("turns away files that aren't a copy, and keys that aren't ours", () => {
        expect(parseBackup("nonsense")).toBeNull();
        expect(parseBackup(JSON.stringify({ kind: "other", items: {} }))).toBeNull();
        const sneaky = parseBackup(JSON.stringify({ kind: "houseguest-bots-backup", items: { "bbb-pref:muted": "true", "auth-token": "x", "bbb-pref:n": 5 } }))!;
        expect(Object.keys(sneaky.items)).toEqual(["bbb-pref:muted"]);
    });
});
