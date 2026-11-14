// (the season's controller first: the comps and the screens import each other, and this is the order the app loads them in)
import { newGame } from "../testing";
import { ALL_COMPS, compById, QUICK_COMPS, WEEKLY_COMPS } from "./index";
import { seededRand } from "./random";
import { burns, diceRounds, doorRounds, rollCalls } from "./moreComps";

const ctx = (seed: number) => ({ seed, gameState: newGame(8), history: [], participants: newGame(8).houseguests });
const average = (id: string, skill: number) => {
    const comp = compById(id);
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) total += comp.simulate(ctx(seed), skill, seededRand(seed * 13 + 5)).score;
    return total / 200;
};

describe("Mystery Doors, Lucky Dice, Roll Call and Hot Hands", () => {
    it("are in the weekly rotation, and the two luck ones are quick enough for a Block Breaker", () => {
        ["mystery-doors", "lucky-dice", "roll-call", "hot-hands"].forEach((id) => {
            expect(ALL_COMPS.some((c) => c.id === id)).toBe(true);
            expect(WEEKLY_COMPS.some((c) => c.id === id)).toBe(true);
        });
        expect(QUICK_COMPS.map((c) => c.id)).toEqual(expect.arrayContaining(["mystery-doors", "lucky-dice"]));
        expect(compById("mystery-doors").kind).toBe("luck");
        expect(compById("roll-call").kind).toBe("endurance");
    });

    it("deal the same doors, dice and timings for the same seed", () => {
        expect(doorRounds(seededRand(9))).toEqual(doorRounds(seededRand(9)));
        expect(diceRounds(seededRand(9))).toEqual(diceRounds(seededRand(9)));
        expect(rollCalls(seededRand(9))).toEqual(rollCalls(seededRand(9)));
        expect(burns(seededRand(9))).toEqual(burns(seededRand(9)));
        expect(doorRounds(seededRand(9))).not.toEqual(doorRounds(seededRand(10)));
    });

    it("Mystery Doors: every round hides a big prize, a small one and nothing", () => {
        doorRounds(seededRand(3)).forEach((round) => {
            const sorted = [...round].sort((a, b) => a - b);
            expect(sorted[0]).toBe(0);
            expect(sorted[1]).toBeGreaterThanOrEqual(2);
            expect(sorted[1]).toBeLessThanOrEqual(5);
            expect(sorted[2]).toBeGreaterThanOrEqual(8);
        });
        // pure luck: skill makes no difference
        expect(Math.abs(average("mystery-doors", 1) - average("mystery-doors", 0))).toBeLessThan(4);
    });

    it("Lucky Dice: a bot's score is the rolls it kept, and playing the odds helps a little", () => {
        const comp = compById("lucky-dice");
        const r = comp.simulate(ctx(4), 1, seededRand(1));
        const rounds = diceRounds(seededRand(4));
        r.picks!.forEach((p, i) => expect([rounds[i].first[0] + rounds[i].first[1], rounds[i].again[0] + rounds[i].again[1]]).toContain(p));
        expect(r.score).toBe((r.picks as number[]).reduce((a, b) => a + b, 0));
        expect(comp.progress!(r, 2, ctx(4) as any)).toBe((r.picks as number[])[0] + (r.picks as number[])[1]);
        expect(average("lucky-dice", 1)).toBeGreaterThan(average("lucky-dice", 0));
    });

    it("Roll Call: calls come faster and leave less time; better bots last longer", () => {
        const calls = rollCalls(seededRand(5));
        expect(calls.length).toBeGreaterThan(15);
        expect(calls[calls.length - 1].window).toBeLessThan(calls[0].window);
        calls.forEach((c, i) => i > 0 && expect(c.at).toBeGreaterThan(calls[i - 1].at + calls[i - 1].window));
        expect(calls.slice(0, 3).some((c) => c.decoy)).toBe(false);
        expect(calls.some((c) => c.decoy)).toBe(true);
        expect(average("roll-call", 0.95)).toBeGreaterThan(average("roll-call", 0.1) + 15);
        expect(compById("roll-call").format(150)).toBe("outlasted the clock");
    });

    it("Hot Hands: the plate never turns hot before your hand could be back on; better bots last longer", () => {
        const plan = burns(seededRand(6));
        expect(plan.length).toBeGreaterThan(10);
        plan.forEach((b, i) => i > 0 && expect(b.at).toBeGreaterThan(plan[i - 1].at + plan[i - 1].cool + plan[i - 1].back));
        expect(plan[plan.length - 1].react).toBeLessThan(plan[0].react);
        expect(average("hot-hands", 0.95)).toBeGreaterThan(average("hot-hands", 0.1) + 15);
    });

    it("no comp runs past the limit", () => {
        ["mystery-doors", "lucky-dice", "roll-call", "hot-hands"].forEach((id) => expect(compById(id).maxSeconds).toBeLessThanOrEqual(900));
    });
});
