import { GameState, getById, PlayerProfile } from "../model";
import { PlayerModeController, newPlayerSave, Prompt, Step } from "./playerModeController";
import { loadHalls, pastStory } from "../career/halls";
import { buildSeason } from "./setupGame";
import { cartoonCast } from "../cartoon/cartoon";
import { DAILY_BOTS, dailyResult, dailySeed } from "../career/daily";
import { answer, cast, newGame } from "./testing";

function play(controller: PlayerModeController, wins: boolean | "random" = "random") {
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    let guard = 0;
    while (guard++ < 5000) {
        const p = prompt as Prompt | null;
        if (!p) throw new Error("No prompt");
        if (p.kind === "gameOver") return;
        answer(controller, p, "random", wins);
    }
    throw new Error("Season did not finish");
}

describe("the All-Stars", () => {
    beforeEach(() => window.localStorage.clear());

    it("a season's story, in a line", () => {
        expect(pastStory(1, 12)).toBe("Won a 12-person season");
        expect(pastStory(2, 12)).toBe("Runner-up in a 12-person season");
        expect(pastStory(3, 12)).toContain("final three");
        expect(pastStory(12, 12)).toContain("First out");
        expect(pastStory(7, 12)).toBe("Finished 7 of 12 last time");
    });

    it("the final four of a season, and whoever sent the player home, go in the hall with their story", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(10), [3]));
        controller.state.seed = 4242;
        play(controller, false);
        expect(controller.state.step).toBe(Step.GameOver);
        const stars = loadHalls().stars;
        expect(stars.length).toBeGreaterThanOrEqual(4);
        const winner = stars.find((e) => e.profile.past!.placement === 1)!;
        expect(winner.profile.past!.story).toBe("Won a 10-person season");
        expect(winner.profile.past!.won).toBe(true);
        // bots keep who they were, and how things stood with the player
        const bots = stars.filter((e) => e.profile.name !== "HG3");
        bots.forEach((e) => {
            expect(e.profile.personality).toBeDefined();
            expect(e.profile.past!.withPlayer!.name).toBe("HG3");
            expect(e.profile.past!.withPlayer!.why.length).toBeGreaterThan(5);
        });
        // the one who sent the player home is in, whatever their finish
        const week = controller.state.history.find((w) => w.evictedIds.includes(3));
        if (week && week.hohId !== undefined) {
            const nemesis = stars.find((e) => e.profile.name === getById(controller.gameState, week.hohId!).name)!;
            expect(nemesis.profile.past!.withPlayer!.why).toBe("they sent you home last time");
        }
    });

    it("a personality chosen for a cast member survives building the season", () => {
        const profiles: PlayerProfile[] = cast(6).map((p, i) => ({ ...p, personality: i === 2 ? "gossip" : undefined, throws: i === 2 ? 7 : undefined }));
        const setup = buildSeason(profiles, [0], [1, 2, 3, 4, 5]);
        const controller = new PlayerModeController(newPlayerSave(setup.gameState, setup.humanIds));
        expect(controller.personalities[2]).toBe("gossip");
        expect(controller.throwScore(2)).toBe(7);
    });

    it("returning houseguests remember the player: they don't start as strangers, and the player is told", () => {
        const past = (feeling: number, why: string) => ({ placement: 2, castSize: 10, won: false, comps: 3, story: pastStory(2, 10), withPlayer: { name: "HG0", feeling, why } });
        const profiles: PlayerProfile[] = cast(6).map((p, i) => ({
            ...p,
            ...(i === 1 ? { past: past(-0.8, "they sent you home last time") } : {}),
            ...(i === 2 ? { past: past(0.9, "you were close last time") } : {}),
            // someone who played with a different player: nothing to remember here
            ...(i === 3 ? { past: { ...past(0.9, "x"), withPlayer: { name: "Somebody Else", feeling: 0.9, why: "x" } } } : {}),
        }));
        const setup = buildSeason(profiles, [0], [1, 2, 3, 4, 5]);
        const controller = new PlayerModeController(newPlayerSave(setup.gameState, setup.humanIds));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        expect(prompt).not.toBeNull();
        const gs = controller.gameState;
        expect(getById(gs, 1).relationships[0]).toBeLessThan(getById(gs, 4).relationships[0] - 0.2);
        expect(getById(gs, 2).relationships[0]).toBeGreaterThan(getById(gs, 4).relationships[0] + 0.2);
        expect(Math.abs(getById(gs, 3).relationships[0] - getById(gs, 4).relationships[0])).toBeLessThan(0.2);
        const news = controller.newsFor(0).join("\n");
        expect(news).toContain("HG1 hasn't forgotten: they sent you home last time.");
        expect(news).toContain("HG2 lit up when they saw you");
        expect(news).not.toContain("HG3");
        expect(controller.intelOn(0, 1).some((n) => n.text.includes("played together before"))).toBe(true);
        // what they did last time is on their profile
        expect(controller.knownProfile(0, 1).returning).toBe("Runner-up in a 10-person season");
        expect(controller.knownProfile(0, 4).returning).toBeUndefined();
    });
});

describe("the daily season, played", () => {
    beforeEach(() => window.localStorage.clear());

    it("deals the same house from the same day", () => {
        const a = cartoonCast(DAILY_BOTS, dailySeed("2026-11-14"));
        const b = cartoonCast(DAILY_BOTS, dailySeed("2026-11-14"));
        expect(a).toEqual(b);
        expect(a.length).toBe(11);
        expect(cartoonCast(DAILY_BOTS, dailySeed("2026-11-15"))).not.toEqual(a);
    });

    it("gives everyone the same bots, powers and comps, and records the first finish", () => {
        const seed = dailySeed("2026-11-14");
        const season = () => {
            const bots = cartoonCast(DAILY_BOTS, seed);
            const setup = buildSeason([{ name: "Sam", imageURL: "", social: 5, comp: 5 }, ...bots], [0], bots.map((_, i) => i + 1));
            return new PlayerModeController(newPlayerSave(setup.gameState, setup.humanIds, setup.castOptions, true, { powers: "surprise", seed, daily: "2026-11-14" }));
        };
        const one = season();
        const two = season();
        expect(one.state.seed).toBe(seed);
        expect(one.state.daily).toBe("2026-11-14");
        expect(one.personalities).toEqual(two.personalities);
        expect(one.state.powers).toEqual(two.state.powers);
        play(one);
        const first = dailyResult("2026-11-14")!;
        expect(first.name).toBe("Sam");
        expect(first.castSize).toBe(12);
        expect(first.placement).toBeGreaterThanOrEqual(1);
        // playing it again the same day doesn't change the day's result
        play(two, true);
        expect(dailyResult("2026-11-14")).toEqual(first);
        // an ordinary season isn't a daily one
        expect((new PlayerModeController(newPlayerSave(new GameState({ players: cast(6), jury: 3 }), [0])).state as any).daily).toBeUndefined();
    });
});
