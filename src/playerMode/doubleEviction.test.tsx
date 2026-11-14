import { nonEvictedHouseguests } from "../model";
import { PlayerModeController, newPlayerSave, Prompt, Step } from "./playerModeController";
import { doubleEvictionAt } from "./social/twists";
import { DEFAULT_RULES, withDefaults } from "./rules";
import { answer, newGame } from "./testing";

// Plays a whole season, noting what came up on the Double Eviction night.
function play(n: number, humanId: number, rules = DEFAULT_RULES) {
    const controller = new PlayerModeController(newPlayerSave(newGame(n), [humanId], undefined, undefined, { rules }));
    controller.state.seed = humanId * 7919 + n;
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    const fastKinds = new Set<string>();
    const fastSteps = new Set<string>();
    let fastWeeks = 0;
    let houseAtFast = 0;
    let wasFast = false;
    let guard = 0;
    while (guard++ < 5000) {
        const p = prompt as Prompt | null;
        if (!p) throw new Error("No prompt");
        const fast = !!controller.state.week.fast;
        if (fast && !wasFast) {
            fastWeeks++;
            houseAtFast = nonEvictedHouseguests(controller.gameState).length;
        }
        wasFast = fast;
        if (fast) {
            fastKinds.add(p.kind === "choose" ? `choose:${p.title}` : p.kind);
            fastSteps.add(controller.state.step);
        }
        if (p.kind === "gameOver") break;
        answer(controller, p, "random", "random");
    }
    if (guard >= 5000) throw new Error("Season did not finish");
    return { controller, fastKinds, fastSteps, fastWeeks, houseAtFast };
}

describe("the Double Eviction", () => {
    it("is for houses of ten or more, a little past the middle of the season", () => {
        expect(doubleEvictionAt(8)).toBe(0);
        expect(doubleEvictionAt(9)).toBe(0);
        expect(doubleEvictionAt(10)).toBe(7);
        expect(doubleEvictionAt(12)).toBe(8);
        expect(doubleEvictionAt(16)).toBe(9);
    });

    it("is on unless the house rules turn it off (older seasons included)", () => {
        expect(withDefaults({}).doubleEviction).toBe(true);
        expect(withDefaults({ doubleEviction: false }).doubleEviction).toBe(false);
    });

    it.each([
        [10, 2],
        [12, 5],
        [16, 3],
    ])("a %i-person season has one: a whole week in a night, with no time to talk", (n, humanId) => {
        const { controller, fastKinds, fastSteps, fastWeeks, houseAtFast } = play(n, humanId);
        expect(controller.state.step).toBe(Step.GameOver);
        expect(fastWeeks).toBe(1);
        expect(houseAtFast).toBe(doubleEvictionAt(n));
        // the season is still one eviction per week on the books, and ends with two
        expect(controller.state.history.length).toBe(n - 3);
        expect(nonEvictedHouseguests(controller.gameState).length).toBe(2);
        // nothing social, and none of the week's slower parts (the veto holder still says a word at the ceremony)
        ["social", "alliance", "hohRoom", "hohVisit"].forEach((kind) => expect(fastKinds.has(kind)).toBe(false));
        expect(fastKinds.has("speech:Eviction Speech")).toBe(false);
        // two nominees that night, whatever the house's size
        const fastWeek = controller.state.history[n - houseAtFast];
        expect(fastWeek.nomineeIds.length).toBe(2);
        expect(fastWeek.evictedIds.length).toBe(1);
        // the week's bones are all there: a Head of Household, a veto holder, a vote
        expect(fastWeek.hohId).toBeDefined();
        expect(fastWeek.povId).toBeDefined();
        expect(fastSteps.has(Step.Eviction) || fastSteps.has(Step.Fallout)).toBe(true);
        // and the night's Head of Household is new: last week's couldn't compete
        expect(fastWeek.hohId).not.toBe(controller.state.history[n - houseAtFast - 1].hohId);
    });

    it("doesn't happen in a small house, or with the rule off", () => {
        expect(play(8, 1).fastWeeks).toBe(0);
        expect(play(12, 5, { ...DEFAULT_RULES, doubleEviction: false }).fastWeeks).toBe(0);
    });
});
