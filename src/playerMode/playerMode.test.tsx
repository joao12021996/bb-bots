import { GameState, getById, nonEvictedHouseguests, PlayerProfile, MutableGameState } from "../model";
import { rng } from "../utils";
import { PlayerModeController, newPlayerSave, Prompt, Step, PlayerSave, migrateSave } from "./playerModeController";
import { botPercentile } from "./comps/botScores";
import { botSocialTime, performSocialAction, SocialMemory } from "./social/socialActions";
import { deserialize, serialize } from "./save/serialize";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { Season } from "../model/season";
import { ALL_COMPS, WEEKLY_COMPS } from "./comps";
import { opponentCorrectAfter } from "./comps/compUi";
import { rankResults } from "./comps/compRunner";

function cast(n: number): PlayerProfile[] {
    return Array.from({ length: n }, (_, i) => ({
        name: `HG${i}`,
        imageURL: "",
        social: (i % 10) + 1,
        comp: ((i * 3) % 10) + 1,
    }));
}

function newGame(n: number): GameState {
    return new GameState({ players: cast(n), jury: n >= 8 ? 5 : 3 });
}

type Strategy = "first" | "random";

// Answers whatever the controller is asking, automatically.
function answer(controller: PlayerModeController, p: Prompt, strategy: Strategy, humansWin: boolean | "random") {
    const pick = <T,>(arr: T[]): T => (strategy === "first" ? arr[0] : arr[Math.floor(Math.random() * arr.length)]);
    if (p.kind === "scene") controller.continue();
    else if (p.kind === "handoff") p.next();
    else if (p.kind === "social") {
        for (let i = 0; i < 3; i++) {
            const me = controller.socialActor;
            const bots = nonEvictedHouseguests(controller.gameState).filter((hg) => !controller.isHuman(hg));
            if (bots.length === 0) break;
            const bot = pick(bots);
            const target = nonEvictedHouseguests(controller.gameState).find((b) => b.id !== bot.id && b.id !== me.id);
            const kind = target ? ["chat", "alliance", "pitch"][i % 3] : "chat";
            const action: any = kind === "pitch" ? { kind, botId: bot.id, targetId: target!.id } : { kind, botId: bot.id };
            controller.socialAct(action);
        }
        controller.endSocial();
    } else if (p.kind === "compPlay") {
        const win = humansWin === "random" ? Math.random() < 0.5 : humansWin;
        p.onScore(win ? 1e9 : -1e9);
    } else if (p.kind === "compResults") {
        p.onDone(rankResults(p.results, controller.state.humanIds)[0].id);
    } else if (p.kind === "choose") {
        const ids = p.options.map((o) => o.id);
        if (p.noneLabel && Math.random() < 0.5) p.resolve([]);
        else p.resolve(strategy === "first" ? ids.slice(0, p.count) : [...ids].sort(() => Math.random() - 0.5).slice(0, p.count));
    }
}

function playSeason(n: number, humanIds: number[], strategy: Strategy, humansWin: boolean | "random") {
    const controller = new PlayerModeController(newPlayerSave(newGame(n), humanIds));
    controller.state.seed = humanIds[0] * 7919 + n;
    const seen = new Set<string>();
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    let guard = 0;
    while (guard++ < 5000) {
        const p = prompt as Prompt | null;
        if (!p) throw new Error("No prompt");
        seen.add(p.kind === "choose" ? `choose:${p.title}` : p.kind);
        if (p.kind === "gameOver") break;
        answer(controller, p, strategy, humansWin);
    }
    if (guard >= 5000) throw new Error("Season did not finish");
    return { controller, seen };
}

describe("player mode season", () => {
    it.each([
        [6, [0], "first", true],
        [8, [3], "random", "random"],
        [10, [9], "random", false],
        [12, [5], "random", "random"],
        [16, [2], "random", "random"],
        [8, [0, 1], "random", "random"],
        [12, [2, 5, 9], "random", "random"],
        [10, [0, 1, 2, 3], "random", false],
    ] as [number, number[], Strategy, boolean | "random"][])(
        "plays a %i-person season to a winner (players %j, %s choices, wins comps: %s)",
        (n, humanIds, strategy, wins) => {
            const { controller } = playSeason(n, humanIds, strategy, wins);
            const gs = controller.gameState;
            expect(controller.state.step).toBe(Step.GameOver);
            expect(nonEvictedHouseguests(gs).length).toBe(2);
            expect(gs.log[gs.phase][0].winner).toBeDefined();
            expect(controller.state.history.length).toBe(n - 3);
        }
    );

    it("lets a player who wins every comp make HoH, veto and final eviction decisions", () => {
        const seen = new Set<string>();
        for (let id = 0; id < 8 && !seen.has("choose:Final Eviction"); id++) {
            playSeason(8, [id], "random", true).seen.forEach((k) => seen.add(k));
        }
        expect(seen.has("compPlay")).toBe(true);
        expect(seen.has("compResults")).toBe(true);
        expect(seen.has("choose:Nomination Ceremony")).toBe(true);
        expect(seen.has("choose:Veto Ceremony")).toBe(true);
        expect(seen.has("choose:Final Eviction")).toBe(true);
    });

    it("finishes the season after the player is evicted, asking a juror player for a jury vote", () => {
        let jurySeen = false;
        let evictedSeen = false;
        for (let id = 0; id < 8 && !jurySeen; id++) {
            const { controller, seen } = playSeason(10, [id], "random", false);
            if (getById(controller.gameState, id).isEvicted) evictedSeen = true;
            if (seen.has("choose:Jury Vote")) jurySeen = true;
        }
        expect(evictedSeen).toBe(true);
        expect(jurySeen).toBe(true);
    });

    it("only shows pass-the-device screens in pass-and-play", () => {
        expect(playSeason(8, [1], "random", "random").seen.has("handoff")).toBe(false);
        expect(playSeason(8, [1, 4], "random", "random").seen.has("handoff")).toBe(true);
    });

    it("never repeats a competition in a 16-person season", () => {
        for (const ids of [[0], [3, 7]]) {
            const { controller } = playSeason(16, ids, "random", "random");
            const used = controller.state.usedComps;
            expect(used.length).toBe(2 * (16 - 3) + 3);
            expect(new Set(used).size).toBe(used.length);
        }
    });

    it("has enough comps for a 16-person season, with unique ids and time limits of at most 10 minutes", () => {
        expect(WEEKLY_COMPS.length).toBeGreaterThanOrEqual(2 * (16 - 3) + 1);
        expect(new Set(ALL_COMPS.map((c) => c.id)).size).toBe(ALL_COMPS.length);
        ALL_COMPS.forEach((c) => expect(c.maxSeconds).toBeLessThanOrEqual(600));
    });
});

describe("bot mode", () => {
    it("still plays a full season without player mode", () => {
        const season = new Season();
        let gs = newGame(10);
        let guard = 0;
        while (nonEvictedHouseguests(gs).length > 0 && guard++ < 50) {
            gs = season.renderEpisode(gs).gameState;
        }
        expect(guard).toBeLessThan(50);
    });
});

describe("bot scores", () => {
    it("bots with higher comp scores perform better on average", () => {
        rng().seed(42);
        const avg = (comp: number) => {
            let total = 0;
            for (let i = 0; i < 2000; i++) total += botPercentile({ comp });
            return total / 2000;
        };
        expect(avg(1)).toBeLessThan(avg(5));
        expect(avg(5)).toBeLessThan(avg(10));
        expect(avg(5)).toBeGreaterThan(0.4);
        expect(avg(5)).toBeLessThan(0.6);
    });

    it("every comp turns bot percentiles into sensible, monotonic-ish scores", () => {
        const gs = newGame(8);
        const history = [
            { week: 1, hohId: 0, nomineeIds: [1, 2], povId: 3, evictedIds: [1] },
            { week: 2, hohId: 4, nomineeIds: [2, 5], povId: 6, evictedIds: [2] },
        ];
        ALL_COMPS.filter((c) => c.kind !== "luck").forEach((c) => {
            const low = c.botScore(0.05, { gameState: gs, history });
            const high = c.botScore(0.95, { gameState: gs, history });
            expect(Number.isFinite(low)).toBe(true);
            expect(high).toBeGreaterThanOrEqual(low);
        });
    });

    it("quiz scoreboards reveal exactly the final number of right answers by the end", () => {
        for (let correct = 0; correct <= 8; correct++) {
            expect(opponentCorrectAfter(3, correct * 100 + 42, 8, 8)).toBe(correct);
            let prev = 0;
            for (let a = 0; a <= 8; a++) {
                const c = opponentCorrectAfter(3, correct * 100, 8, a);
                expect(c).toBeGreaterThanOrEqual(prev);
                prev = c;
            }
        }
    });
});

describe("social actions", () => {
    function setup() {
        const gs = new MutableGameState(prepareNextWeek(newGame(6), BigBrotherVanilla));
        const memory: SocialMemory = { chatsThisWeek: {}, allies: [] };
        return { gs, memory };
    }

    it("chatting raises the relationship, mutually, and stays within [-1, 1]", () => {
        rng().seed(1);
        const { gs, memory } = setup();
        const before = getById(gs, 0).relationships[1];
        for (let i = 0; i < 50; i++) performSocialAction(gs, 0, { kind: "chat", botId: 1 }, memory);
        const after = getById(gs, 0).relationships[1];
        expect(after).toBeGreaterThan(before);
        expect(after).toBeLessThanOrEqual(1);
        expect(getById(gs, 1).relationships[0]).toBe(after);
    });

    it("a successful pitch lowers the bot's relationship with the target", () => {
        const { gs, memory } = setup();
        let lowered = false;
        for (let seed = 0; seed < 30 && !lowered; seed++) {
            rng().seed(seed);
            const before = getById(gs, 1).relationships[2];
            const outcome = performSocialAction(gs, 0, { kind: "pitch", botId: 1, targetId: 2 }, memory);
            if (outcome.good) {
                expect(getById(gs, 1).relationships[2]).toBeLessThan(before);
                lowered = true;
            }
        }
        expect(lowered).toBe(true);
    });

    it("high-social bots change the house more than low-social bots", () => {
        // houseguest 9 has social 10, houseguest 0 has social 1 (see cast())
        let highTotal = 0;
        let lowTotal = 0;
        for (let seed = 0; seed < 40; seed++) {
            rng().seed(seed);
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            const before = { ...getById(gs, 9).relationships };
            const beforeLow = { ...getById(gs, 0).relationships };
            botSocialTime(gs, []);
            const sum = (id: number, b: any) =>
                Object.keys(b).reduce((acc, k) => acc + Math.abs(getById(gs, id).relationships[+k] - b[k]), 0);
            highTotal += sum(9, before);
            lowTotal += sum(0, beforeLow);
        }
        expect(highTotal).toBeGreaterThan(lowTotal);
    });
});

describe("save files", () => {
    it("round-trips a finished season's save", () => {
        const { controller } = playSeason(8, [2], "random", "random");
        const restored = deserialize<PlayerSave>(serialize({ ...controller.state }));
        const gs = restored.gameState;
        expect(gs).toBeInstanceOf(GameState);
        expect(gs.houseguests.length).toBe(8);
        expect(getById(gs, 3)).toBe(gs.houseguests[3]);
        expect(gs.nonEvictedHouseguests).toBeInstanceOf(Set);
        expect(gs.finalJurySize()).toBe(controller.gameState.finalJurySize());
        const anyVote = Object.values(gs.log[1][0].votes)[0];
        expect(typeof anyVote.render).toBe("function");
        expect(() => anyVote.render(gs)).not.toThrow();
    });

    it("resumes a pass-and-play save in the middle of a week and finishes the season", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(8), [0, 5]));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        for (let i = 0; i < 9; i++) answer(controller, prompt as unknown as Prompt, "first", "random");
        const restored = migrateSave(deserialize<any>(serialize(controller.state)))!;
        const resumed = new PlayerModeController(restored);
        let rp: Prompt | null = null;
        resumed.prompt$.subscribe((p) => (rp = p));
        resumed.start();
        let guard = 0;
        while (guard++ < 3000) {
            const p = rp as Prompt | null;
            if (!p || p.kind === "gameOver") break;
            answer(resumed, p, "first", "random");
        }
        expect(resumed.state.step).toBe(Step.GameOver);
    });

    it("upgrades a version 1 (single player) save", () => {
        const v2 = newPlayerSave(newGame(6), [4]);
        const v1: any = {
            version: 1,
            humanId: 4,
            seed: v2.seed,
            step: v2.step,
            gameState: v2.gameState,
            weekStartState: v2.weekStartState,
            week: {},
            history: [],
            recentComps: ["face-off"],
            social: { chatsThisWeek: {}, allies: [1] },
            actionsLeft: 3,
            socialLog: [],
        };
        const migrated = migrateSave(v1)!;
        expect(migrated.version).toBe(2);
        expect(migrated.humanIds).toEqual([4]);
        expect(migrated.usedComps).toEqual(["face-off"]);
        expect(migrated.social[4].allies).toEqual([1]);
    });
});

describe("season setup", () => {
    const { defaultJurySize } = require("../model");
    const { buildSeason } = require("./setupGame");

    it("makes the jury (total - 2) / 2, rounded down and made odd", () => {
        const expected: { [n: number]: number } = { 4: 1, 5: 1, 6: 1, 7: 1, 8: 3, 9: 3, 10: 3, 11: 3, 12: 5, 14: 5, 16: 7, 18: 7, 20: 9 };
        Object.entries(expected).forEach(([n, j]) => expect(defaultJurySize(+n)).toBe(j));
        for (let n = 4; n <= 30; n++) {
            const j = defaultJurySize(n);
            expect(j % 2).toBe(1);
            expect(j).toBeLessThanOrEqual(n - 2);
        }
    });

    it("plays with a subset of the cast: players plus bots, renumbered, with custom relationships remapped", () => {
        const full = cast(12);
        const relationships: { [a: number]: { [b: number]: number } } = {};
        for (let a = 0; a < 12; a++) {
            relationships[a] = {};
            for (let b = 0; b < 12; b++) if (a !== b) relationships[a][b] = (Math.min(a, b) * 12 + Math.max(a, b)) / 200 - 0.5; // mutual, like the relationship editor
        }
        // players are cast members 7 and 2; bots are 0, 5, 9, 11
        const setup = buildSeason(full, [7, 2], [0, 5, 9, 11], { relationships });
        const gs = setup.gameState;
        expect(gs.houseguests.map((h: any) => h.name)).toEqual(["HG0", "HG2", "HG5", "HG7", "HG9", "HG11"]);
        expect(setup.humanIds).toEqual([3, 1]); // HG7 is now id 3, HG2 is id 1
        expect(gs.finalJurySize()).toBe(defaultJurySize(6));
        // HG7 -> HG2 relationship carried over to new ids 3 -> 1
        expect(setup.castOptions.relationships[3][1]).toBe(relationships[7][2]);

        const controller = new PlayerModeController(newPlayerSave(gs, setup.humanIds, setup.castOptions));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        // week 1 starts: relationships came from the remapped custom map
        expect(getById(controller.gameState, 3).relationships[1]).toBe(relationships[7][2]);
        let guard = 0;
        while (guard++ < 3000) {
            const p = prompt as Prompt | null;
            if (!p || p.kind === "gameOver") break;
            answer(controller, p, "random", "random");
        }
        expect(controller.state.step).toBe(Step.GameOver);
        expect(controller.gameState.houseguests.filter((h) => h.isJury).length).toBe(defaultJurySize(6));
    });
});

describe("real houseguest ratings and custom players", () => {
    const { lookupStats, ALLOWED_DECKS, HOUSEGUEST_STATS } = require("../data/houseguestStats");
    const { buildSeason } = require("./setupGame");

    it("only offers US and Canada collections, with ratings in range", () => {
        ALLOWED_DECKS.forEach((deck: string) =>
            expect(/^(Big Brother (\d+|Canada \d+|Over The Top)|Celebrity Big Brother \d US)$/.test(deck)).toBe(true)
        );
        Object.values(HOUSEGUEST_STATS).forEach((people: any) =>
            Object.values(people).forEach(([s, c]: any) => {
                expect(s).toBeGreaterThanOrEqual(1);
                expect(s).toBeLessThanOrEqual(10);
                expect(c).toBeGreaterThanOrEqual(1);
                expect(c).toBeLessThanOrEqual(10);
            })
        );
        expect(lookupStats("Big Brother 6", "Janelle").comp).toBe(10);
        expect(lookupStats("Big Brother 2", "Will").social).toBe(10);
        expect(lookupStats("Big Brother Albania 1", "Someone")).toEqual({});
    });

    it("plays a season with a player who joined under their own name, even with custom relationships", () => {
        const full = cast(8);
        const relationships: { [a: number]: { [b: number]: number } } = {};
        for (let a = 0; a < 8; a++) {
            relationships[a] = {};
            for (let b = 0; b < 8; b++) if (a !== b) relationships[a][b] = 0.25;
        }
        const pool = [...full, { name: "Me", imageURL: "data:image/svg+xml,x", social: 5, comp: 5 }];
        const setup = buildSeason(pool, [8], [0, 2, 4, 6, 7], { relationships });
        const controller = new PlayerModeController(newPlayerSave(setup.gameState, setup.humanIds, setup.castOptions));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        const me = getById(controller.gameState, setup.humanIds[0]);
        expect(me.name).toBe("Me");
        Object.values(me.relationships).forEach((r) => expect(Number.isFinite(r)).toBe(true));
        // cast pairs keep the custom value
        expect(getById(controller.gameState, 0).relationships[1]).toBe(0.25);
        let guard = 0;
        while (guard++ < 3000) {
            const p = prompt as Prompt | null;
            if (!p || p.kind === "gameOver") break;
            answer(controller, p, "random", "random");
        }
        expect(controller.state.step).toBe(Step.GameOver);
    });
});
