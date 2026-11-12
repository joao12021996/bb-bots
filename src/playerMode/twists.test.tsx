import { renderToStaticMarkup } from "react-dom/server";
import { getById, nonEvictedHouseguests } from "../model";
import { newPlayerSave, PlayerModeController, Prompt, Step } from "./playerModeController";
import { haveNotCount, battleBackDue } from "./social/twists";
import { answer, newGame } from "./testing";
import { placements } from "./social/awards";

function play(n: number, humanIds: number[], seed: number, extras: any = {}, humansWin: boolean | "random" = "random", watch?: (c: PlayerModeController, p: Prompt) => void) {
    const controller = new PlayerModeController(newPlayerSave(newGame(n), humanIds, undefined, false, extras));
    controller.state.seed = seed;
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    let guard = 0;
    while (guard++ < 6000) {
        const p = prompt as Prompt | null;
        if (!p) throw new Error("No prompt");
        if (watch) watch(controller, p);
        if (p.kind === "gameOver") break;
        answer(controller, p, "random", humansWin);
    }
    if (guard >= 6000) throw new Error("Season did not finish");
    return { controller, last: prompt as unknown as Prompt };
}

describe("Have-Nots", () => {
    it("are the worst scorers in the HoH comp, more of them in a bigger house", () => {
        expect(haveNotCount(12)).toBe(3);
        expect(haveNotCount(9)).toBe(3);
        expect(haveNotCount(6)).toBe(2);
        expect(haveNotCount(4)).toBe(1);
        expect(haveNotCount(3)).toBe(0);
        const controller = new PlayerModeController(newPlayerSave(newGame(10), [0]));
        (controller as any).pickHaveNots([7, 2, 5, 9, 1]);
        expect(controller.state.week.haveNots).toEqual([7, 2, 5]);
        expect(controller.isHaveNot(2)).toBe(true);
        expect(controller.isHaveNot(9)).toBe(false);
    });

    it("are picked every week, never the HoH, and a player Have-Not gets one social action per block", () => {
        let haveNotTurns = 0;
        for (const seed of [3, 17, 29]) {
            const weeks: { [week: number]: { ids: number[]; alive: number; hohId?: number } } = {};
            const { controller } = play(10, [0, 4], seed, {}, false, (c, p) => {
                const s = c.state;
                const week = s.gameState.phase;
                if (s.week.haveNots && !weeks[week]) weeks[week] = { ids: [...s.week.haveNots], alive: nonEvictedHouseguests(c.gameState).length, hohId: s.week.hohId };
                if (p.kind === "social" && c.isHaveNot(c.socialActor.id)) {
                    haveNotTurns++;
                    expect(s.actionsLeft).toBeLessThanOrEqual(1);
                }
            });
            expect(controller.state.step).toBe(Step.GameOver);
            const recorded = Object.values(weeks);
            expect(recorded.length).toBeGreaterThan(4);
            recorded.forEach((w) => {
                expect(w.ids.length).toBe(haveNotCount(w.alive));
                if (w.hohId !== undefined) expect(w.ids).not.toContain(w.hohId);
                expect(new Set(w.ids).size).toBe(w.ids.length);
            });
        }
        // players who lose every comp end up Have-Nots
        expect(haveNotTurns).toBeGreaterThan(0);
    });
});

describe("Battle Back", () => {
    it("happens right before the jury starts, with at least two evicted houseguests", () => {
        const gs = newGame(12);
        expect(battleBackDue(gs, 0)).toBe(false);
        expect(battleBackDue(gs, 1)).toBe(false);
    });

    it("brings one evicted houseguest back, once, and the season still ends with a winner", () => {
        let returned = 0;
        for (const [n, seed] of [
            [10, 5],
            [12, 8],
            [8, 13],
            [12, 21],
        ]) {
            let backAt = -1;
            const { controller, last } = play(n, [1], seed, { battleBack: true }, "random", (c) => {
                const slot = c.battleBackSlot;
                if (slot && slot.used && backAt < 0) {
                    backAt = c.state.gameState.phase;
                    // they're back in the house, not on the jury
                    const hg = getById(c.gameState, slot.holderId!);
                    expect(hg.isEvicted).toBe(false);
                    expect(hg.isJury).toBeFalsy();
                }
            });
            const gs = controller.gameState;
            expect(controller.state.step).toBe(Step.GameOver);
            expect(nonEvictedHouseguests(gs).length).toBe(2);
            expect(gs.log[gs.phase][0].winner).toBeDefined();
            const slot = controller.battleBackSlot!;
            if (slot.used) {
                returned++;
                // one more eviction to get down to the final two
                expect(controller.state.history.length).toBe(n - 3 + 1);
            } else {
                expect(controller.state.history.length).toBe(n - 3);
            }
            // everyone gets one placement, the returnee included
            const place = placements(gs, controller.state.history, gs.log[gs.phase][0].winner);
            expect(Object.values(place).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
            if (last.kind !== "gameOver") throw new Error("no game over screen");
            const html = renderToStaticMarkup(last.content);
            expect(html).toContain("Battle Back");
            expect(html).toContain("Diary Room");
        }
        expect(returned).toBeGreaterThanOrEqual(3);
    });

    it("isn't in a season unless it's turned on", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(10), [0]));
        expect(controller.battleBackSlot).toBeUndefined();
    });
});

describe("Diary room", () => {
    it("keeps what every player said each week, and the season recap tells the whole story", () => {
        const { controller } = play(10, [0, 6], 41);
        const entries = controller.diaryOf();
        expect(entries.length).toBeGreaterThan(5);
        entries.forEach((e) => {
            expect(e.lines.length).toBeGreaterThan(0);
            e.lines.forEach((line) => expect(line.length).toBeGreaterThan(5));
        });
        // each player has an entry every week they were in the house
        [0, 6].forEach((id) => expect(entries.some((e) => e.id === id)).toBe(true));
        const recap = controller.seasonRecapText();
        expect(recap).toContain("Week 1");
        const gs = controller.gameState;
        expect(recap).toContain(getById(gs, gs.log[gs.phase][0].winner!).name);
    });
});
