import { getById, MutableGameState } from "../model";
import { seedRng } from "./seeding";
import { PlayerModeController, newPlayerSave } from "./playerModeController";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { endgameOpen, makeYourCase, offerFinal3, Pact, pactBroken, pactOf } from "./social/endgame";
import { emptyLedger } from "./social/promises";
import { emptyJury } from "./social/jury";
import { newGame } from "./testing";

function house(n = 6): MutableGameState {
    return new MutableGameState(prepareNextWeek(newGame(n), BigBrotherVanilla));
}

function everyoneFeels(gs: MutableGameState, v: number) {
    gs.houseguests.forEach((a) => gs.houseguests.forEach((b) => a.id !== b.id && (a.relationships[b.id] = v)));
}

describe("the endgame's extra social actions", () => {
    it("open for the last few houseguests only", () => {
        expect(endgameOpen({ remainingPlayers: 7 })).toBe(false);
        expect(endgameOpen({ remainingPlayers: 6 })).toBe(true);
        expect(endgameOpen({ remainingPlayers: 4 })).toBe(true);
        expect(endgameOpen({ remainingPlayers: 3 })).toBe(false);
    });

    it("a final-three pact needs both of the others to want it", () => {
        let made = 0;
        let refused = 0;
        for (let seed = 1; seed <= 30; seed++) {
            seedRng(String(seed));
            // (asked by the most social houseguest in a house of ten: a quiet one talks fewer people round)
            const friends = house(10);
            everyoneFeels(friends, 0.9);
            if (offerFinal3(friends, emptyLedger(), [], 9, 1, 2, 5, () => false).pact) made++;
            seedRng(String(seed));
            const enemies = house();
            everyoneFeels(enemies, -0.9);
            if (!offerFinal3(enemies, emptyLedger(), [], 0, 1, 2, 5, () => false).pact) refused++;
        }
        expect(made).toBeGreaterThan(20);
        expect(refused).toBeGreaterThan(26); // (there is always a small chance someone says yes)
    });

    it("a pact is a promise three ways: safety next week, and a warmer three", () => {
        const gs = house();
        everyoneFeels(gs, 0.9);
        const ledger = emptyLedger();
        let result = offerFinal3(gs, ledger, [], 0, 1, 2, 5, () => false);
        for (let seed = 2; !result.pact && seed < 40; seed++) {
            seedRng(String(seed));
            result = offerFinal3(gs, ledger, [], 0, 1, 2, 5, () => false);
        }
        expect(result.pact!.ids).toEqual([0, 1, 2]);
        expect(result.outcome.good).toBe(true);
        const safety = ledger.pledges.filter((p) => p.kind === "safety" && p.week === 6);
        expect(safety.length).toBe(6); // each to each
        // nobody can be in two
        const pacts: Pact[] = [result.pact!];
        expect(offerFinal3(gs, ledger, pacts, 0, 3, 4, 5, () => false).pact).toBeUndefined();
        expect(offerFinal3(gs, ledger, pacts, 3, 4, 1, 5, () => false).outcome.text).toContain("already in a final-three pact");
    });

    it("a pact ends when a member leaves, and breaking one costs you the third member too", () => {
        const gs = house();
        everyoneFeels(gs, 0.5);
        const pacts: Pact[] = [{ ids: [0, 1, 2], week: 5 }];
        expect(pactOf(pacts, 1, gs)).toBeDefined();
        expect(pactBroken(gs, pacts, 0, 3)).toBeUndefined(); // 3 isn't in it
        expect(pactBroken(gs, pacts, 0, 1)).toBe(pacts[0]);
        expect(getById(gs, 2).relationships[0]).toBeLessThan(0.5);
        getById(gs, 2).isEvicted = true;
        expect(pactOf(pacts, 1, gs)).toBeUndefined();
    });

    it("making your case lands with people who like you, and backfires with people who don't", () => {
        const sway = (feeling: number) => {
            let total = 0;
            for (let seed = 1; seed <= 40; seed++) {
                seedRng(String(seed));
                const gs = house();
                everyoneFeels(gs, feeling);
                const jury = emptyJury();
                makeYourCase(gs, emptyLedger(), jury, 0, 1, "bitter", 0, 0);
                total += jury.sway[1][0];
            }
            return total;
        };
        expect(sway(0.9)).toBeGreaterThan(2);
        expect(sway(-0.9)).toBeLessThan(0);
    });

    it("an objective juror is moved by a record: comp wins and big moves", () => {
        const wins = (comps: number) => {
            let n = 0;
            for (let seed = 1; seed <= 60; seed++) {
                seedRng(String(seed));
                const gs = house();
                everyoneFeels(gs, 0);
                if (makeYourCase(gs, emptyLedger(), emptyJury(), 0, 1, "objective", comps, 0).good) n++;
            }
            return n;
        };
        expect(wins(4)).toBeGreaterThan(wins(0));
    });

    it("in a season: only in the endgame, a pact once made protects its members, and a case is made once", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(6), BigBrotherVanilla), [0]));
        const c: any = controller;
        expect(controller.endgameOpen()).toBe(true);
        controller.gameState.houseguests.forEach((a) => controller.gameState.houseguests.forEach((b) => a.id !== b.id && (a.relationships[b.id] = 0.9)));
        let made = false;
        for (let seed = 1; !made && seed < 40; seed++) {
            seedRng(String(seed));
            c.mutate((gs: MutableGameState) => c.dealAction(gs, 0, { kind: "final3", botId: 1, targetId: 2 }));
            made = controller.pactPartners(0).length === 2;
        }
        expect(controller.pactPartners(0).sort()).toEqual([1, 2]);
        expect(controller.pactPartners(1).sort()).toEqual([0, 2]);
        // a member who nominates another ends it
        c.checkPacts(1, [2]);
        expect(controller.pactPartners(0)).toEqual([]);
        // one case per houseguest
        expect(controller.madeCaseTo(0, 3)).toBe(false);
        c.mutate((gs: MutableGameState) => c.dealAction(gs, 0, { kind: "juryCase", botId: 3 }));
        expect(controller.madeCaseTo(0, 3)).toBe(true);
        const again = c.mutate((gs: MutableGameState) => c.dealAction(gs, 0, { kind: "juryCase", botId: 3 }));
        expect(again.text).toContain("already made your case");
        // a bigger house: not yet
        const early = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        expect(early.endgameOpen()).toBe(false);
        const no = (early as any).mutate((gs: MutableGameState) => (early as any).dealAction(gs, 0, { kind: "final3", botId: 1, targetId: 2 }));
        expect(no.text).toContain("too early");
    });
});
