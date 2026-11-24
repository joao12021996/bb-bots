import { GameState, nonEvictedHouseguests, PlayerProfile } from "../model";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { ALL_COMPS, compById } from "./comps";
import { seededRand } from "./comps/random";
import { cheatLine, CHEAT_REASONS, ClickJudge, scoreProblem } from "./anticheat";

function context(seed: number) {
    const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `H${i}`, imageURL: "" }));
    const gameState = prepareNextWeek(new GameState({ players: cast, jury: 5 }), BigBrotherVanilla);
    return { seed, gameState, history: [], participants: nonEvictedHouseguests(gameState).slice(0, 4) };
}

describe("clicks", () => {
    it("catches a script's clicks, but not the game's own download links", () => {
        const judge = new ClickJudge();
        expect(judge.event(true, document.createElement("button"))).toBeNull();
        expect(judge.event(false, document.createElement("button"))).toBe("fakeClicks");
        expect(judge.event(false, document.createElement("a"))).toBeNull();
    });

    it("catches clicking faster than anyone can, for seconds on end", () => {
        const judge = new ClickJudge();
        const caught = Array.from({ length: 200 }, (_, i) => judge.press(i * 25 + (i % 3) * 7)); // 40 a second
        expect(caught.filter(Boolean)[0]).toBe("autoClicker");
    });

    it("catches clicks at a machine's exact rhythm", () => {
        const judge = new ClickJudge();
        const caught = Array.from({ length: 50 }, (_, i) => judge.press(1000 + i * 120 + (i % 2) * 0.5));
        expect(caught.filter(Boolean)[0]).toBe("autoClicker");
    });

    it("never catches a fast human: quick bursts with uneven timing, and slow steady taps", () => {
        const fast = new ClickJudge();
        const noise = seededRand(5);
        let t = 0;
        for (let i = 0; i < 2000; i++) {
            t += 45 + noise() * 40; // up to 22 a second, never perfectly even
            expect(fast.press(t)).toBeNull();
        }
        const slow = new ClickJudge();
        for (let i = 0; i < 100; i++) expect(slow.press(i * 600)).toBeNull();
    });
});

describe("scores", () => {
    it("never flags a score a bot really got, in any comp", () => {
        ALL_COMPS.forEach((comp) => {
            for (let s = 1; s <= 30; s++) {
                const ctx = context(s * 101);
                const r = comp.simulate(ctx, (s % 11) / 10, seededRand(s));
                expect([comp.id, scoreProblem(comp, r.score, { answers: r.answers, picks: r.picks }, ctx)]).toEqual([comp.id, null]);
            }
        });
    });

    it("flags scores that can't be real", () => {
        const beam = compById("balance-beam");
        const ctx = context(1);
        expect(scoreProblem(beam, NaN, {}, ctx)).toBe("fakeScore");
        expect(scoreProblem(beam, null, {}, ctx)).toBe("fakeScore");
        expect(scoreProblem(beam, 9999, {}, ctx)).toBe("fakeScore");
        // lasted 50 seconds, ten seconds after starting
        expect(scoreProblem(beam, 50, {}, ctx, 10000)).toBe("fakeScore");
        expect(scoreProblem(beam, 50, {}, ctx, 52000)).toBeNull();
        // ten right, from five answers
        const hl = compById("higher-or-lower");
        expect(scoreProblem(hl, 10, { answers: [true, true, true, true, true], picks: [1, 1, 1, 1, 1] }, ctx)).toBe("fakeScore");
        expect(scoreProblem(hl, 5, { answers: [true, true, true, true, true], picks: [1, 1, 1, 1, 1] }, ctx)).toBeNull();
    });

    it("flags reacting faster than any human, every round", () => {
        const lights = compById("reaction-lights");
        const ctx = context(1);
        expect(scoreProblem(lights, -80, { picks: [80, 75, 90, 85, 70] }, ctx)).toBe("reaction");
        // one lucky guess is fine
        expect(scoreProblem(lights, -200, { picks: [80, 230, 240, 210, 240] }, ctx)).toBeNull();
    });
});

it("says what each cheater did", () => {
    CHEAT_REASONS.forEach((r) => expect(cheatLine("Ana", r)).toMatch(/^🚨 Ana /));
});

describe("offline", () => {
    // plays until the player is in a comp, then they're caught; the season plays on to the end without them
    it.each([[0], [3], [6]])("expels a player caught in the middle of a comp (player %i)", (id) => {
        const { PlayerModeController, newPlayerSave, Step } = require("./playerModeController");
        const { answer, newGame } = require("./testing");
        const controller = new PlayerModeController(newPlayerSave(newGame(8), [id]));
        controller.state.seed = 4242 + id;
        let prompt: any = null;
        controller.prompt$.subscribe((p: any) => (prompt = p));
        controller.start();
        let caught = false;
        for (let guard = 0; guard < 5000 && controller.state.step !== Step.GameOver; guard++) {
            const own = controller.personal$.value[id];
            const p = own || prompt;
            if (!caught && p && p.kind === "compPlay" && p.playerId === id) {
                controller.expel(id, "autoClicker");
                caught = true;
                expect(controller.state.ruleBreakers).toEqual([id]);
                expect(controller.state.cheats[id].reason).toBe("autoClicker");
                expect(controller.player(id).isEvicted).toBe(true);
                expect(prompt.kind).toBe("scene");
                continue;
            }
            answer(controller, p, "random", "random");
        }
        expect(caught).toBe(true);
        expect(controller.state.step).toBe(Step.GameOver);
        // nobody else is told it was them twice
        controller.expel(id, "fakeScore");
        expect(controller.state.cheats[id].reason).toBe("autoClicker");
    });
});
