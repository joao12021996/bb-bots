import { getById } from "../model";
import { PlayerModeController, newPlayerSave, Prompt } from "./playerModeController";
import { exitReport, ExitFacts } from "./social/exit";
import { answer, newGame } from "./testing";

function facts(over: Partial<ExitFacts> = {}): ExitFacts {
    const gs = newGame(8);
    return {
        gs,
        week: {
            week: 3,
            hohId: 1,
            nomineeIds: [0, 2],
            evictedIds: [0],
            votes: { 0: 3, 2: 2 },
            why: {
                noms: { 0: "HG1 can't stand HG0" },
                votes: { 3: { t: 0, why: "HG3 doesn't like HG0" }, 4: { t: 0, why: "HG0 was HG4's alliance's target" }, 5: { t: 2, why: "HG5 went with the house" }, 6: { t: 2, why: "x" } },
            },
        },
        evictedId: 0,
        humanIds: [0, 7],
        nominatorId: 1,
        replacement: false,
        said: {},
        allies: [],
        compWins: 0,
        timesNominated: 1,
        brokenPromises: 0,
        threatRank: 5,
        houseSize: 8,
        ...over,
    };
}

describe("why you went home", () => {
    it("gives the count, who put you up and why, and who voted which way", () => {
        const r = exitReport(facts());
        expect(r.headline).toBe("You were evicted by a vote of 3 to 2.");
        expect(r.block).toEqual(["HG1 nominated you.", "The reason: HG1 can't stand HG0."]);
        expect(r.against.map((a) => a.name)).toEqual(["HG3", "HG4"]);
        expect(r.against[0].why).toBe("HG3 doesn't like HG0");
        expect(r.kept).toEqual(["HG5", "HG6"]);
        // the third vote was another player's: counted, not named
        expect(r.secretVotes).toBe(1);
    });

    it("names the ones who said they'd keep you and didn't", () => {
        const r = exitReport(facts({ said: { 3: 2, 4: 0, 5: 2 } }));
        expect(r.against.find((a) => a.name === "HG3")!.lied).toBe(true);
        expect(r.against.find((a) => a.name === "HG4")!.lied).toBe(false); // told the truth
        expect(r.lessons.join(" ")).toContain("HG3 told you they were keeping you");
    });

    it("says so when it was a backdoor, or when nobody knows who did it", () => {
        expect(exitReport(facts({ replacement: true })).block[0]).toContain("backdoor");
        expect(exitReport(facts({ nominatorId: undefined })).block[0]).toContain("Nobody knows");
    });

    it("picks the lessons that fit", () => {
        expect(exitReport(facts()).lessons.join(" ")).toContain("no alliance");
        expect(exitReport(facts({ allies: [4, 6] })).lessons.join(" ")).toContain("Your own alliance turned on you: HG4");
        expect(exitReport(facts({ allies: [6], threatRank: 0, compWins: 3 })).lessons.join(" ")).toContain("3 comp wins");
        expect(exitReport(facts({ allies: [6], brokenPromises: 2 })).lessons.join(" ")).toContain("broke your word 2 times");
        const all = exitReport(facts({ threatRank: 0, compWins: 3, brokenPromises: 2, replacement: true, timesNominated: 4, said: { 3: 2 } })).lessons;
        expect(all.length).toBeLessThanOrEqual(4);
        expect(exitReport(facts({ allies: [6], week: { ...facts().week, votes: { 0: 5, 2: 0 }, why: { votes: {} } } })).lessons.length).toBeGreaterThan(0);
    });

    it("an evicted player sees it once, on their way out, in a real season", () => {
        let shown = 0;
        for (let id = 0; id < 6 && shown === 0; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(10), [id]));
            controller.state.seed = id * 7919 + 10;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            let guard = 0;
            let mine = 0;
            while (guard++ < 5000) {
                const p = prompt as Prompt | null;
                if (!p) throw new Error("No prompt");
                if (p.kind === "scene" && p.scene.title === "Why you went home") mine++;
                if (p.kind === "gameOver") break;
                answer(controller, p, "random", false);
            }
            // evicted in a week of the season (the final eviction, at three, goes straight to the finale)
            const evicted = getById(controller.gameState, id).isEvicted && controller.state.history.some((w) => w.evictedIds.includes(id));
            // (a player who comes back and goes out again hears it both times)
            if (evicted) expect(mine).toBeGreaterThanOrEqual(1);
            else if (!getById(controller.gameState, id).isEvicted) expect(mine).toBe(0);
            shown += mine;
        }
        expect(shown).toBeGreaterThan(0);
    });
});
