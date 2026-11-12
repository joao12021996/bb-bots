import React from "react";
import { GameState, getById, nonEvictedHouseguests, PlayerProfile, MutableGameState } from "../model";
import { rng } from "../utils";
import { seedRng } from "./seeding";
import { PlayerModeController, newPlayerSave, Prompt, Step, PlayerSave, migrateSave } from "./playerModeController";
import { botPercentile } from "./comps/botScores";
import { botSocialTime, performSocialAction, SocialMemory } from "./social/socialActions";
import { Alliance, betray, botNominate, createAlliance, emptyBook, holdMeeting } from "./social/alliances";
import { openHohRoom, pComesUp, visitBotHoh } from "./social/hohRoom";
import { bestReason, reasonFit } from "./social/pitch";
import { botPawnTalk, NOMINATION_HIT, nominationHit, settlePawnTalk, tellPawn } from "./social/pawnTalk";
import { evictionSpeech, makePromise, nominationSpeech, vetoSpeech } from "./social/speeches";
import { botGuess, closestGuesses, makeTiebreaker } from "./comps/tiebreaker";
import { botHide, hideOutcome, tiebreakHouse } from "./comps/hideTiebreak";
import { botFlip, DUEL_PAIRS, duelDeck, Matched, MEMORY_DUEL_ID } from "./comps/memoryDuel";
import { WineCellarComp } from "./comps/wineCellar";
import { botSwaps, STRIKES_OUT, TAINTED_WINE_ID } from "./comps/taintedWine";
import { seededRand } from "./comps/random";
import { dayOf, weekStartDay } from "./days";
import { throwChance } from "./comps/throwing";
import {
    checkVoteClaims,
    compareNotes,
    emptyLedger,
    pledge,
    reputation,
    settleEvictionPledges,
    settleFinalPledges,
    settleNominationPledges,
} from "./social/promises";
import { answerVoteQuestion, blameVote, offerFinal2, tellVote } from "./social/campaign";
import { apparentRelationship, assignPersonalities, PERSONALITY_IDS, voice } from "./social/personality";
import { botShowmances, flirt } from "./social/showmance";
import { reveal, shiftTrust, trustOf } from "./social/promises";
import { renderToStaticMarkup } from "react-dom/server";
import {
    botFight,
    checkRumours,
    exposeAllianceHoppers,
    houseMeeting,
    pickSides,
    snoop,
    spreadRumour,
    threatLevel,
} from "./social/drama";
import { addGrudge, botJuryVote, emptyJury, newcomerTalks, roundtable } from "./social/jury";
import { answer as answerJuror, giveSpeech, juryQuestions, movesFor } from "./social/finale";
import { KNOCKOUT_ID } from "./comps/knockout";
import { HoldTheWallComp } from "./comps/holdTheWall";
import { BBComicsComp, DaysQuizComp, FaceMorphComp, HideAndGoVetoComp, OtevComp, OverOrUnderComp } from "./comps/iconicComps";
import { deserialize, serialize } from "./save/serialize";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { Season } from "../model/season";
import { ALL_COMPS, WEEKLY_COMPS } from "./comps";
import { opponentCorrectAfter } from "./comps/compUi";
import { rankResults } from "./comps/compRunner";
import { answer, cast, newGame, Strategy } from "./testing";

function playSeason(n: number, humanIds: number[], strategy: Strategy, humansWin: boolean | "random") {
    const controller = new PlayerModeController(newPlayerSave(newGame(n), humanIds));
    controller.state.seed = humanIds[0] * 7919 + n;
    const seen = new Set<string>();
    const scenes = new Set<string>();
    const nomCounts: [number, number][] = [];
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    let guard = 0;
    while (guard++ < 5000) {
        const p = prompt as Prompt | null;
        if (!p) throw new Error("No prompt");
        seen.add(p.kind === "choose" ? `choose:${p.title}` : p.kind);
        if (p.kind === "choose" && p.title === "Nomination Ceremony")
            nomCounts.push([nonEvictedHouseguests(controller.gameState).length, p.count]);
        if (p.kind === "scene") scenes.add(p.scene.title);
        if (p.kind === "gameOver") break;
        answer(controller, p, strategy, humansWin);
    }
    if (guard >= 5000) throw new Error("Season did not finish");
    return { controller, seen, scenes, nomCounts };
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

    it("players take their social turns in a random order, a new one each block", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(10), [1, 4, 7]));
        controller.state.seed = 99;
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        const firsts = new Set<number>();
        const orders = new Set<string>();
        for (let guard = 0; guard < 5000; guard++) {
            const p = prompt as Prompt | null;
            if (!p || p.kind === "gameOver") break;
            if (p.kind === "social" && controller.state.socialTurn === 0 && controller.state.socialStage === "social") {
                firsts.add(p.actorId);
                orders.add(controller.turnOrder.map((hg) => hg.id).join(","));
                // the same order every time it's asked for in a block
                expect(controller.turnOrder.map((hg) => hg.id)).toEqual(controller.turnOrder.map((hg) => hg.id));
            }
            answer(controller, p, "random", "random");
        }
        expect(firsts.size).toBeGreaterThan(1);
        expect(orders.size).toBeGreaterThan(1);
    });

    it("doesn't repeat a competition until every weekly comp has been played", () => {
        for (const ids of [[0], [3, 7]]) {
            const { controller } = playSeason(16, ids, "random", "random");
            const used = controller.state.usedComps;
            // HoH + veto every week, a Blockbuster in weeks with 7+ houseguests, and three finale parts
            const blockbusters = 16 - 7 + 1;
            expect(used.length).toBe(2 * (16 - 3) + blockbusters + 3);
            // Last Chance comps come from the small pool of quick comps, so those can come round again sooner
            const quick = new Set(require("./comps").QUICK_COMPS.map((c: any) => c.id));
            const firstRound = used.slice(0, WEEKLY_COMPS.length - 2).filter((id) => !quick.has(id));
            expect(new Set(firstRound).size).toBe(firstRound.length);
        }
    });

    it("has Blockbuster weeks (three nominees) only while 7 or more houseguests are left", () => {
        const counts: [number, number][] = [];
        const scenes = new Set<string>();
        for (let id = 0; id < 10; id++) {
            const r = playSeason(10, [id], "random", true);
            counts.push(...r.nomCounts);
            r.scenes.forEach((t) => scenes.add(t));
        }
        expect(counts.length).toBeGreaterThan(0);
        counts.forEach(([alive, count]) => expect(count).toBe(alive >= 7 ? 3 : 2));
        expect(counts.some(([alive]) => alive >= 7)).toBe(true);
        expect(counts.some(([alive]) => alive < 7)).toBe(true);
        expect(scenes.has("Last Chance")).toBe(true);
    });

    it("bots form their own named alliances, and players get alliance time", () => {
        const { controller, seen } = playSeason(12, [9], "random", "random");
        expect(seen.has("alliance")).toBe(true);
        expect(controller.state.book.nextId).toBeGreaterThan(2);
        controller.state.book.alliances.forEach((a) => expect(a.name.length).toBeGreaterThan(0));
    });

    it("has enough comps for a 16-person season, with unique ids and time limits of at most 15 minutes", () => {
        expect(WEEKLY_COMPS.length).toBeGreaterThanOrEqual(2 * (16 - 3) + 1);
        expect(new Set(ALL_COMPS.map((c) => c.id)).size).toBe(ALL_COMPS.length);
        ALL_COMPS.forEach((c) => expect(c.maxSeconds).toBeLessThanOrEqual(900));
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
        const memory: SocialMemory = { chatsThisWeek: {} };
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
        expect(migrated.version).toBe(3);
        expect(migrated.humanIds).toEqual([4]);
        expect(migrated.usedComps).toEqual(["face-off"]);
        // old allies become an alliance
        expect(migrated.book.alliances.length).toBe(1);
        expect([...migrated.book.alliances[0].memberIds].sort()).toEqual([1, 4]);
        expect(migrated.socialStage).toBe("social");
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

describe("alliances", () => {
    function setup(n: number = 8) {
        rng().seed(3);
        const gs = new MutableGameState(prepareNextWeek(newGame(n), BigBrotherVanilla));
        return { gs, book: emptyBook() };
    }

    it("creates named alliances that bring members closer", () => {
        const { gs, book } = setup();
        const before = getById(gs, 0).relationships[1];
        const a = createAlliance(gs, book, [0, 1], "The Vault");
        expect(a.name).toBe("The Vault");
        expect(getById(gs, 0).relationships[1]).toBeGreaterThan(before);
        // same members: same alliance
        expect(createAlliance(gs, book, [1, 0], "Other").id).toBe(a.id);
    });

    it("disagreeing on a target costs chemistry; agreeing builds it", () => {
        let lost = false;
        let gained = false;
        for (let seed = 0; seed < 60 && !(lost && gained); seed++) {
            const { gs, book } = setup();
            rng().seed(seed);
            const a: Alliance = createAlliance(gs, book, [0, 1, 2, 3], "Test");
            const before = a.chemistry;
            // the player (0) suggests someone; bots have their own ideas
            a.suggestions[0] = 4 + (seed % 4);
            const result = holdMeeting(gs, a, [0]);
            if (result.chemistryChange < 0) {
                expect(a.chemistry).toBeLessThan(before);
                lost = true;
            }
            if (result.chemistryChange > 0) {
                expect(a.chemistry).toBeGreaterThan(before);
                gained = true;
            }
            expect(a.target).toBe(result.targetId === null ? undefined : result.targetId);
        }
        expect(lost).toBe(true);
        expect(gained).toBe(true);
    });

    it("high-Social players get their way in alliance meetings more often", () => {
        const wins = (social: number) => {
            let n = 0;
            for (let seed = 0; seed < 150; seed++) {
                rng().seed(seed);
                const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
                getById(gs, 0).social = social;
                const book = emptyBook();
                const a = createAlliance(gs, book, [0, 1, 2, 3], "Test");
                // suggest the outsider bot 1 likes most, so it takes persuasion
                const target = [4, 5, 6, 7, 8, 9].sort(
                    (x, y) => getById(gs, 1).relationships[y] - getById(gs, 1).relationships[x]
                )[0];
                a.suggestions[0] = target;
                if (holdMeeting(gs, a, [0]).targetId === target) n++;
            }
            return n;
        };
        expect(wins(10)).toBeGreaterThan(wins(1));
    });

    it("a caught backstabber is kicked out and resented", () => {
        const { gs, book } = setup();
        const a = createAlliance(gs, book, [0, 1, 2], "Test");
        const before = getById(gs, 1).relationships[0];
        betray(gs, book, a, 0, 1, true);
        expect(a.memberIds).toEqual([1, 2]);
        expect(getById(gs, 1).relationships[0]).toBeLessThan(before);
    });

    it("loyal bots don't nominate their allies when they have other options", () => {
        const { gs, book } = setup();
        const a = createAlliance(gs, book, [0, 1, 2], "Test");
        a.chemistry = 1;
        [1, 2].forEach((id) => {
            getById(gs, 0).relationships[id] = 1;
            getById(gs, id).relationships[0] = 1;
        });
        const hoh = getById(gs, 0);
        const options = nonEvictedHouseguests(gs).filter((hg) => hg.id !== 0);
        let allyNoms = 0;
        for (let seed = 0; seed < 50; seed++) {
            rng().seed(seed);
            const { picks } = botNominate(gs, book, hoh, options, 3);
            allyNoms += picks.filter((p) => p.id === 1 || p.id === 2).length;
        }
        expect(allyNoms).toBeLessThan(5);
    });

    it("a player who nominates an alliance mate gets kicked out of the alliance", () => {
        for (let id = 0; id < 8; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(8), [id]));
            controller.state.seed = id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            let guard = 0;
            while (guard++ < 400) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "choose" && p.title === "Nomination Ceremony") {
                    // make an alliance with the first option, then nominate them
                    const victim = p.options[0];
                    const gs = new MutableGameState(controller.gameState);
                    const a = createAlliance(gs, controller.state.book, [id, victim.id], "Doomed");
                    controller.state.gameState = new GameState(gs);
                    p.resolve(p.options.slice(0, p.count).map((o) => o.id));
                    expect(a.memberIds.includes(id)).toBe(false);
                    expect(controller.allyIds(id).includes(victim.id)).toBe(false);
                    return;
                }
                answer(controller, p, "random", true);
            }
        }
        throw new Error("The player never got to nominate");
    });

    it("keeps hidden skills hidden in the save", () => {
        const save = newPlayerSave(newGame(6), [0], undefined, true);
        const restored = migrateSave(deserialize<any>(serialize(save)))!;
        expect(restored.statsHidden).toBe(true);
    });
});

describe("HoH room one-on-ones", () => {
    // Plays until `stop` says so. Players win every comp when `humansWin`.
    function playUntil(controller: PlayerModeController, humansWin: boolean, stop: (p: Prompt) => boolean): Prompt {
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        for (let guard = 0; guard < 2000; guard++) {
            const p = prompt as Prompt | null;
            if (!p) throw new Error("No prompt");
            if (stop(p)) return p;
            if (p.kind === "gameOver") break;
            answer(controller, p, "random", humansWin);
        }
        throw new Error("Never got there");
    }

    function newController(n: number, humanIds: number[], seed: number): PlayerModeController {
        const controller = new PlayerModeController(newPlayerSave(newGame(n), humanIds));
        controller.state.seed = seed;
        return controller;
    }

    it("comes before nominations: a player HoH hears visitors, other players choose whether to go up", () => {
        const asHoh = playSeason(10, [0], "random", true);
        expect(asHoh.seen.has("hohRoom")).toBe(true);
        const asGuest = playSeason(10, [0], "random", false);
        expect(asGuest.seen.has("hohVisit")).toBe(true);
        expect(asGuest.seen.has("hohRoom")).toBe(false);
        // pass-and-play: both sides are players
        const both = playSeason(8, [0, 1], "random", true);
        expect(both.seen.has("hohRoom")).toBe(true);
        expect(both.seen.has("hohVisit")).toBe(true);
    });

    it("houseguests may choose not to come up, and enemies stay away more than friends", () => {
        const gs = new MutableGameState(prepareNextWeek(newGame(12), BigBrotherVanilla));
        const book = emptyBook();
        const friend = getById(gs, 1);
        const enemy = getById(gs, 2);
        friend.relationships[0] = 0.9;
        enemy.relationships[0] = -0.9;
        enemy.social = friend.social;
        expect(pComesUp(book, friend, 0)).toBeGreaterThan(pComesUp(book, enemy, 0));
        let visits = 0;
        let rooms = 0;
        for (let seed = 0; seed < 40; seed++) {
            rng().seed(seed);
            const room = openHohRoom(gs, book, 0, [0], []);
            visits += room.visitors.length;
            rooms++;
            expect(new Set(room.visitors.map((v) => v.fromId)).size).toBe(room.visitors.length);
            expect(room.visitors.some((v) => v.fromId === 0)).toBe(false);
        }
        expect(visits).toBeGreaterThan(rooms); // people do come
        expect(visits).toBeLessThan(rooms * 11); // but not everyone, every week
    });

    it("a bot HoH keeps the houseguests it means to protect off the block, and nominates who it was talked into", () => {
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        const hoh = getById(gs, 0);
        const options = nonEvictedHouseguests(gs).filter((hg) => hg.id !== 0);
        for (let seed = 0; seed < 30; seed++) {
            rng().seed(seed);
            const base = botNominate(gs, emptyBook(), hoh, options, 3).picks.map((p) => p.id);
            const spared = base[0];
            const pitched = options.map((o) => o.id).find((id) => !base.includes(id))!;
            const { picks } = botNominate(gs, emptyBook(), hoh, options, 3, { protect: [spared], targets: [pitched] });
            expect(picks.map((p) => p.id)).not.toContain(spared);
            expect(picks.map((p) => p.id)).toContain(pitched);
        }
    });

    it("a player can talk a friendly bot HoH into a deal that runs into next week", () => {
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        getById(gs, 0).relationships[1] = 1;
        getById(gs, 1).relationships[0] = 1;
        getById(gs, 1).social = 10;
        let deals = 0;
        for (let seed = 0; seed < 40; seed++) {
            rng().seed(seed);
            const room = openHohRoom(gs, emptyBook(), 0, [1], []);
            const book: any[] = [];
            const outcome = visitBotHoh(gs, room, book, 1, { kind: "deal" }, 2);
            if (outcome.good) {
                deals++;
                expect(room.promised).toContain(1);
                expect(book).toEqual([{ hohId: 0, withId: 1, week: gs.phase }]);
            } else expect(room.promised).not.toContain(1);
        }
        expect(deals).toBeGreaterThan(25);
    });

    it("breaking a promise made in the HoH room costs the player, and ends the deal", () => {
        const controller = newController(10, [0], 11);
        playUntil(controller, true, (p) => p.kind === "hohRoom");
        const room = controller.room!;
        expect(room.hohId).toBe(0);
        // HG1 offers a deal, HG2 pleads; the player says yes to both
        room.visitors = [
            { kind: "deal", fromId: 1 },
            { kind: "plea", fromId: 2 },
        ];
        room.index = 0;
        expect(controller.hohAnswer(true)!.good).toBe(true);
        expect(controller.hohAnswer(true)!.good).toBe(true);
        expect(controller.hohAnswer(true)).toBeNull();
        expect(room.promised).toEqual([1, 2]);
        expect(controller.deals).toEqual([{ hohId: 0, withId: 1, week: controller.gameState.phase }]);
        const before = getById(controller.gameState, 0).relationships[1];
        const kept = getById(controller.gameState, 0).relationships[2];
        controller.endHohRoom();
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        const noms = prompt as unknown as Extract<Prompt, { kind: "choose" }>;
        expect(noms.title).toBe("Nomination Ceremony");
        expect(noms.promisedIds).toEqual([1, 2]);
        // nominate HG1 (promised) but not HG2
        const picks = [1, ...noms.options.map((o) => o.id).filter((id) => id !== 1 && id !== 2)].slice(0, noms.count);
        noms.resolve(picks);
        expect(getById(controller.gameState, 0).relationships[1]).toBeLessThan(before - 0.25);
        expect(getById(controller.gameState, 0).relationships[2]).toBeGreaterThan(kept - 0.1);
        expect(controller.deals).toEqual([]);
        expect(controller.newsFor(0).some((line) => line.includes("promised HG1 safety"))).toBe(true);
        expect(controller.room!.promised).toEqual([2]);
    });

    it("a deal made last week means the new HoH owes safety this week", () => {
        const controller = newController(10, [0], 5);
        playUntil(controller, true, (p) => p.kind === "hohRoom");
        const week = controller.gameState.phase;
        // pretend the player struck a deal with last week's HoH (HG3)
        controller.state.deals = [{ hohId: 3, withId: 0, week: week - 1 }];
        controller.state.week.room = undefined;
        controller.continue();
        expect(controller.room!.promised).toContain(3);
    });

    it("survives a save and reload in the middle of the one-on-ones", () => {
        const controller = newController(9, [0, 1], 3);
        playUntil(controller, true, (p) => p.kind === "hohRoom" || p.kind === "hohVisit");
        const restored = new PlayerModeController(migrateSave(deserialize<any>(serialize(controller.state)))!);
        expect(restored.state.step).toBe(Step.HohRoom);
        expect(restored.room).toEqual(controller.room);
        playUntil(restored, true, (p) => p.kind === "choose" && p.title === "Nomination Ceremony");
    });
});

describe("pitch reasons", () => {
    function house(): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
    }

    function convinced(reason: any, prepare: (gs: MutableGameState) => void): number {
        let wins = 0;
        for (let seed = 0; seed < 300; seed++) {
            const gs = house();
            getById(gs, 0).social = 5;
            [1, 2].forEach((id) => {
                getById(gs, 0).relationships[id] = 0.2;
                getById(gs, id).relationships[0] = 0.2;
            });
            getById(gs, 1).relationships[2] = 0;
            getById(gs, 2).relationships[1] = 0;
            prepare(gs);
            rng().seed(seed);
            if (performSocialAction(gs, 0, { kind: "pitch", botId: 1, targetId: 2, reason }, { chatsThisWeek: {} }).good) wins++;
        }
        return wins;
    }

    it("calling someone a comp threat works on comp beasts, not on houseguests who never win", () => {
        const beast = convinced("comps", (gs) => {
            getById(gs, 2).comp = 10;
            getById(gs, 2).hohWins = 2;
        });
        const dud = convinced("comps", (gs) => (getById(gs, 2).comp = 1));
        expect(beast).toBeGreaterThan(dud + 60);
    });

    it("a social-threat pitch depends on the target's Social, and bad blood on how the listener feels", () => {
        expect(convinced("social", (gs) => (getById(gs, 2).social = 10))).toBeGreaterThan(
            convinced("social", (gs) => (getById(gs, 2).social = 1)) + 60
        );
        const feud = (value: number) => (gs: MutableGameState) => {
            getById(gs, 1).relationships[2] = value;
            getById(gs, 2).relationships[1] = value;
        };
        expect(convinced("relationship", feud(-0.7))).toBeGreaterThan(convinced("relationship", feud(0.3)) + 60);
    });

    it("bots give the strongest reason when they pitch", () => {
        const gs = house();
        const [listener, target, pitcher] = [0, 2, 1].map((id) => getById(gs, id));
        target.comp = 10;
        target.social = 1;
        listener.relationships[2] = 0.5;
        listener.relationships[1] = 0;
        expect(bestReason(listener, target, pitcher)).toBe("comps");
        target.comp = 1;
        listener.relationships[2] = -0.9;
        expect(bestReason(listener, target, pitcher)).toBe("relationship");
        expect(reasonFit(listener, target, pitcher, "comps")).toBeLessThan(0);
    });
});

describe("pawn talk", () => {
    function house(): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
    }

    it("being nominated hurts, and believed pawn talk softens it", () => {
        let believedSeen = false;
        for (let seed = 0; seed < 30 && !believedSeen; seed++) {
            const gs = house();
            getById(gs, 0).relationships[1] = 0.5;
            getById(gs, 1).relationships[0] = 0.5;
            nominationHit(gs, 0, [1, 2]);
            const hit = getById(gs, 1).relationships[0];
            expect(hit).toBeCloseTo(0.5 - NOMINATION_HIT);
            rng().seed(seed);
            const { talk } = tellPawn(gs, 0, 1, [0]);
            if (talk.believed) {
                believedSeen = true;
                expect(getById(gs, 1).relationships[0]).toBeGreaterThan(hit + 0.05);
            } else expect(getById(gs, 1).relationships[0]).toBeLessThan(hit);
        }
        expect(believedSeen).toBe(true);
    });

    it("a pawn who goes home remembers the lie; one who stays trusts the HoH more", () => {
        const gs = house();
        const before = getById(gs, 1).relationships[0];
        const news = settlePawnTalk(gs, [{ hohId: 0, toId: 1, believed: true }], [1]);
        expect(getById(gs, 1).relationships[0]).toBeLessThan(before - 0.3);
        expect(news.some((n) => n.text.includes("lie"))).toBe(true);
        const kept = getById(gs, 2).relationships[0];
        settlePawnTalk(gs, [{ hohId: 0, toId: 2, believed: true }], [1]);
        expect(getById(gs, 2).relationships[0]).toBeGreaterThan(kept);
    });

    it("bot HoHs mostly reassure their pawns, not their target", () => {
        let toTarget = 0;
        let toPawn = 0;
        for (let seed = 0; seed < 200; seed++) {
            const gs = house();
            const hoh = getById(gs, 0);
            hoh.social = 8;
            hoh.relationships[1] = -0.8; // the real target
            hoh.relationships[2] = 0.4;
            rng().seed(seed);
            botPawnTalk(gs, hoh, [1, 2], [1, 2]).forEach((t) => (t.toId === 1 ? toTarget++ : toPawn++));
        }
        expect(toPawn).toBeGreaterThan(toTarget * 2);
        expect(toPawn).toBeGreaterThan(50);
    });

    it("a player HoH can do pawn talk in the nomination speech, and a lie is remembered at the eviction", () => {
        let lied = false;
        for (let id = 0; id < 10 && !lied; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(10), [id]));
            controller.state.seed = 40 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            let told: number[] = [];
            for (let guard = 0; guard < 600 && !lied; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "speech" && p.title === "Nomination Speech") {
                    const pawn = p.tones.find((t) => t.id === "pawn")!;
                    told = pawn.pick!.options.map((o) => o.id);
                    expect(p.deliver("pawn", told).length).toBeGreaterThan(told.length);
                    expect(controller.state.week.pawns!.map((t) => t.toId)).toEqual(expect.arrayContaining(told));
                    p.next();
                    continue;
                }
                const week = controller.state.history.length;
                answer(controller, p, "random", true);
                if (controller.state.history.length > week) {
                    const evicted = controller.state.history[week].evictedIds;
                    if (told.some((t) => evicted.includes(t))) {
                        lied = true;
                        expect(controller.newsFor(id).some((line) => line.includes("won't forget the lie"))).toBe(true);
                    }
                    told = [];
                }
            }
        }
        expect(lied).toBe(true);
    });
});

describe("speeches", () => {
    function house(): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
    }

    it("a gracious nomination speech softens the hit; a call-out makes the target angrier and reassures the rest", () => {
        const gs = house();
        getById(gs, 0).relationships[1] = 0; // neutral, so there's room to improve
        getById(gs, 1).relationships[0] = 0;
        const before = getById(gs, 1).relationships[0];
        nominationSpeech(gs, 0, [1, 2], "gracious", [], [0]);
        expect(getById(gs, 1).relationships[0]).toBeGreaterThan(before);

        const gs2 = house();
        getById(gs2, 0).relationships[1] = 0; // start from neutral, so the call-out has room to hurt
        getById(gs2, 1).relationships[0] = 0;
        getById(gs2, 3).relationships[1] = -0.8; // HG3 can't stand the target
        const fan = getById(gs2, 3).relationships[0];
        const target = getById(gs2, 1).relationships[0];
        rng().seed(1);
        const result = nominationSpeech(gs2, 0, [1, 2], "callout", [1], [0]);
        expect(getById(gs2, 1).relationships[0]).toBeLessThan(target - 0.1);
        expect(getById(gs2, 3).relationships[0]).toBeGreaterThan(fan);
        expect(result.talks.map((t) => t.toId)).toEqual([2]);
    });

    it("promises in a speech become deals the speaker owes next week", () => {
        let kept = 0;
        for (let seed = 0; seed < 40; seed++) {
            const gs = house();
            getById(gs, 0).relationships[4] = 0.8;
            getById(gs, 4).relationships[0] = 0.8;
            const deals: any[] = [];
            rng().seed(seed);
            const result = evictionSpeech(gs, deals, 0, [3, 4, 5], "promise", [4], [0]);
            expect(result.lines[0]).toContain("HG4");
            if (deals.length > 0) {
                kept++;
                expect(deals).toEqual([{ hohId: 4, withId: 0, week: gs.phase }]);
                expect(getById(gs, 4).relationships[0]).toBeGreaterThan(0.8);
            }
        }
        expect(kept).toBeGreaterThan(25);
        // promises to other players always count, and aren't recorded twice
        const gs = house();
        const deals: any[] = [];
        makePromise(gs, deals, 0, 1, [0, 1]);
        makePromise(gs, deals, 0, 1, [0, 1]);
        expect(deals.length).toBe(1);
        vetoSpeech(gs, deals, 0, 2, [3, 4], "promise", [5], [0, 5]);
        expect(deals.length).toBe(2);
    });

    it("an eviction-night call-out wins over the rival's enemies and loses the rival's friends", () => {
        const gs = house();
        getById(gs, 3).relationships[1] = -0.6;
        getById(gs, 4).relationships[1] = 0.8;
        const enemy = getById(gs, 3).relationships[0];
        const friend = getById(gs, 4).relationships[0];
        evictionSpeech(gs, [], 0, [3, 4], "callout", [1], [0]);
        expect(getById(gs, 3).relationships[0]).toBeGreaterThan(enemy);
        expect(getById(gs, 4).relationships[0]).toBeLessThan(friend);
    });

    it("players give nomination, veto and eviction speeches during a season, and a promise is owed the next week", () => {
        const titles = new Set<string>();
        let owed = false;
        const speeches = ["Eviction Speech", "Nomination Speech", "Veto Speech"];
        for (let id = 0; id < 6 && !(speeches.every((t) => titles.has(t)) && owed); id++) {
            for (const wins of [true, false]) {
                const controller = new PlayerModeController(newPlayerSave(newGame(10), [id]));
                controller.state.seed = 300 + id;
                let prompt: Prompt | null = null;
                controller.prompt$.subscribe((p) => (prompt = p));
                controller.start();
                for (let guard = 0; guard < 3000; guard++) {
                    const p = prompt as Prompt | null;
                    if (!p || p.kind === "gameOver") break;
                    if (p.kind === "speech") {
                        titles.add(p.title);
                        const promise = p.tones.find((t) => t.id === "promise");
                        if (promise) {
                            p.deliver("promise", promise.pick!.options.slice(0, 2).map((o) => o.id));
                            p.next();
                            continue;
                        }
                    }
                    if (p.kind === "hohRoom" && controller.room!.promised.length > 0) owed = true;
                    answer(controller, p, "random", wins);
                }
            }
        }
        expect(Array.from(titles)).toEqual(expect.arrayContaining(["Eviction Speech", "Nomination Speech", "Veto Speech"]));
        expect(owed).toBe(true);
    });
});

describe("tiebreaker", () => {
    it("asks a closest-number question, and the closest guess wins", () => {
        const q = makeTiebreaker(77);
        expect(q.spots.length).toBe(q.answer);
        expect(makeTiebreaker(77)).toEqual(q);
        expect(q.answer).toBeGreaterThanOrEqual(45);
        const guesses = [
            { id: 1, guess: q.answer + 9 },
            { id: 2, guess: q.answer - 3 },
            { id: 3, guess: q.answer + 30 },
        ];
        expect(closestGuesses(q.answer, guesses)).toEqual([2]);
        // equally close: nobody gets it for free, both go to another question
        expect(closestGuesses(q.answer, [{ id: 1, guess: q.answer + 4 }, { id: 2, guess: q.answer - 4 }])).toEqual([1, 2]);
    });

    it("bots with better comp skills guess closer", () => {
        const q = makeTiebreaker(5);
        const error = (skill: number) => {
            let total = 0;
            for (let i = 0; i < 300; i++) total += Math.abs(botGuess(q, skill, seededRand(i + 1)) - q.answer);
            return total;
        };
        expect(error(0.9)).toBeLessThan(error(0.1));
    });

    it("hide the veto: the card found last wins; cards found together at the end are still tied", () => {
        const spots = tiebreakHouse(31);
        expect(tiebreakHouse(31)).toEqual(spots);
        const at = (n: number) => spots.findIndex((s) => s.searchedAt === n);
        // three tied: the first two found are out, the last one standing wins
        expect(hideOutcome(spots, [{ id: 1, spot: at(2) }, { id: 2, spot: at(9) }, { id: 3, spot: at(5) }])).toEqual({ winnerId: 2, tied: [2] });
        // the last two hid in the same spot: they're found together, and still tied
        expect(hideOutcome(spots, [{ id: 1, spot: at(7) }, { id: 2, spot: at(7) }, { id: 3, spot: at(1) }])).toEqual({ tied: [1, 2] });
        // smarter bots stay away from the obvious spots
        const obvious = (skill: number) => {
            let total = 0;
            for (let i = 0; i < 300; i++) total += spots[botHide(spots, skill, seededRand(i + 1))].obvious;
            return total;
        };
        expect(obvious(0.9)).toBeLessThan(obvious(0.1));
    });

    it("a comp that ties for first goes to the tiebreaker (pass-and-play players all max out the comp)", () => {
        const { seen } = playSeason(8, [0, 1], "random", true);
        expect(seen.has("hideTiebreak")).toBe(true);
        expect(seen.has("hideResults")).toBe(true);
    });

    // Runs one comp with fixed results and answers whatever it asks. Returns the prompts seen and the winner.
    function compWithResults(scores: { [id: number]: number }, humanIds: number[]) {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(8), BigBrotherVanilla), humanIds));
        const ids = Object.keys(scores).map(Number);
        (controller as any).simulateBots = () => ids.filter((id) => !humanIds.includes(id)).map((id) => ({ id, score: scores[id] }));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        let winner = -1;
        const seen: string[] = [];
        // plain scores: what you see is the score, so only equal scores tie
        const comp = { ...WEEKLY_COMPS[0], format: (sc: number) => `${sc}` };
        (controller as any).runComp("HoH", comp, ids.map((id) => controller.player(id)), (id: number) => (winner = id));
        for (let guard = 0; guard < 50 && winner < 0; guard++) {
            const p = prompt as unknown as Prompt;
            seen.push(p.kind);
            if (p.kind === "compPlay") p.onScore(scores[p.playerId]);
            else if (p.kind === "compResults") p.onDone(-1);
            else if (p.kind === "hideTiebreak") p.onHide(p.spots.findIndex((s) => s.searchedAt === p.spots.length)); // the spot searched last
            else if (p.kind === "hideResults") p.onDone();
            else if (p.kind === "handoff") p.next();
        }
        return { seen, winner };
    }

    it("no tie, no tiebreaker; any tie for first, players or not, goes to one", () => {
        expect(compWithResults({ 0: 50, 1: 90, 2: 40 }, [0]).seen).not.toContain("hideResults");
        expect(compWithResults({ 0: 50, 1: 90, 2: 40 }, [0]).winner).toBe(1);
        // two bots tied for first: they go to the tiebreaker, and you watch
        const bots = compWithResults({ 0: 50, 1: 90, 2: 90, 3: 10 }, [0]);
        expect(bots.seen).toContain("hideResults");
        expect([1, 2]).toContain(bots.winner);
        // a player tied with a bot no longer wins the tie for free: they hide their veto like everyone else
        const withPlayer = compWithResults({ 0: 90, 1: 90, 2: 40 }, [0]);
        expect(withPlayer.seen).toContain("hideTiebreak");
        expect([0, 1]).toContain(withPlayer.winner);
        // a comp nobody's playing in can tie too
        const watched = compWithResults({ 3: 70, 4: 70, 5: 20 }, [0]);
        expect(watched.seen).toContain("hideResults");
        expect([3, 4]).toContain(watched.winner);
    });

    it("no alliance time at the final three", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(6), [0]));
        expect(controller.allianceTimeOpen()).toBe(true);
        const gs = new MutableGameState(controller.gameState);
        const { evictHouseguest } = require("../components/episode/utilities/evictHouseguest");
        [3, 4, 5].forEach((id) => evictHouseguest(gs, id)); // the way the game does it
        controller.state.gameState = new GameState(gs);
        expect(controller.allianceTimeOpen()).toBe(false);
    });
});

describe("day counter", () => {
    it("runs from Day 1 to Day 90 whatever the cast size", () => {
        [6, 10, 16].forEach((n) => {
            const gs = newGame(n);
            const weeks = n - 2;
            expect(weekStartDay(gs, 1)).toBe(1);
            expect(dayOf(gs, weeks, 1)).toBe(90);
            expect(dayOf(gs, weeks + 3, 1)).toBe(90);
            for (let w = 1; w < weeks; w++) {
                expect(dayOf(gs, w, 1)).toBe(weekStartDay(gs, w + 1) - 1);
                expect(dayOf(gs, w, 0.5)).toBeGreaterThanOrEqual(dayOf(gs, w, 0));
                expect(dayOf(gs, w, 1)).toBeGreaterThanOrEqual(dayOf(gs, w, 0.5));
            }
        });
    });

    it("shows days instead of week numbers during a season", () => {
        const { controller, scenes } = playSeason(10, [0], "random", "random");
        expect(Array.from(scenes).some((title) => /^Week/.test(title))).toBe(false);
        expect(scenes.has("Day 1")).toBe(true);
        expect(controller.dayText()).toBe("Day 90");
    });
});

describe("wine cellar", () => {
    it("sharp bots need fewer tests than sloppy ones, and never fewer than is possible", () => {
        const gs = newGame(8);
        const tests = (skill: number) => {
            let total = 0;
            for (let seed = 1; seed <= 200; seed++) {
                const ctx = { seed, gameState: gs, history: [], participants: [] };
                const n = Math.floor(-WineCellarComp.simulate(ctx, skill, seededRand(seed * 31)).score / 1000);
                expect(n).toBeGreaterThanOrEqual(3); // one test per cellar at the very least
                total += n;
            }
            return total / 200;
        };
        expect(tests(0.95)).toBeLessThan(tests(0.05));
        expect(tests(0.95)).toBeLessThan(14);
        expect(WineCellarComp.format(-13042)).toBe("13 tests, 42s");
    });
});

describe("knockout comps", () => {
    // Plays seasons until a knockout HoH comes up, recording what the players were asked during it.
    function findKnockout(humansWin: boolean, onBoard?: (controller: PlayerModeController, board: Extract<Prompt, { kind: "knockout" }>, n: number) => void) {
        for (let id = 0; id < 12; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(12), [id]));
            controller.state.seed = 900 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            const boards: Extract<Prompt, { kind: "knockout" }>[] = [];
            let picked: number[] | null = null;
            let before = 0;
            for (let guard = 0; guard < 1500; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "knockout" && p.name !== "Memory Duel" && p.name !== "Tainted Wine") {
                    boards.push(p);
                    if (onBoard) onBoard(controller, p, boards.length);
                }
                if (p.kind === "tiebreak" && p.heading === "Knockout duel") {
                    // win or lose the duel on purpose
                    p.onGuess(humansWin ? p.question.answer : 999);
                    continue;
                }
                if (p.kind === "choose" && p.title.startsWith("Knockout") && !picked) {
                    // the two the player likes most, so the relationship has room to drop
                    const me = getById(controller.gameState, id);
                    picked = [...p.options]
                        .sort((x, y) => me.relationships[y.id] - me.relationships[x.id])
                        .slice(0, 2)
                        .map((o) => o.id);
                    before = getById(controller.gameState, id).relationships[picked[0]];
                    p.resolve(picked);
                    continue;
                }
                if (boards.length > 0 && boards[boards.length - 1].winnerId !== undefined) return { controller, boards, picked, before, id };
                answer(controller, p, "random", humansWin);
            }
        }
        throw new Error("No knockout comp came up");
    }

    it("runs duels until one houseguest is left, and happens at most once a season", () => {
        const { controller, boards } = findKnockout(false);
        const last = boards[boards.length - 1];
        expect(last.remaining.map((hg) => hg.id)).toEqual([last.winnerId]);
        expect(last.out.length).toBeGreaterThanOrEqual(4);
        expect(boards.flatMap((b) => b.lines).some((line) => line.includes("is out."))).toBe(true);
        expect(controller.state.usedComps.filter((c) => c === KNOCKOUT_ID).length).toBe(1);
        // one duel at a time, so a player who's out (or waiting) can watch it play out
        boards.forEach((b) => expect(b.lines.filter((line) => line.includes("is out.")).length).toBeLessThanOrEqual(1));
        expect(boards.length).toBeGreaterThanOrEqual(last.out.length);
    });

    it("a reload in the middle shows the duel you were looking at, not the ones you've already seen", () => {
        let checked = 0;
        findKnockout(false, (controller, board, n) => {
            if (n !== 3) return;
            const restored = new PlayerModeController(migrateSave(deserialize<any>(serialize(controller.state)))!);
            let first: Prompt | null = null;
            restored.prompt$.subscribe((p) => (first = first || p));
            restored.start();
            const shown = first as Prompt | null;
            expect(shown && shown.kind).toBe("knockout");
            if (shown && shown.kind === "knockout") expect(shown.lines).toEqual(board.lines);
            checked++;
        });
        expect(checked).toBe(1);
    });

    it("the duel winner picks the next pair, and the picks cost them with whoever they picked", () => {
        const { controller, picked, before, id, boards } = findKnockout(true);
        expect(picked).not.toBeNull();
        expect(boards[boards.length - 1].winnerId).toBe(id);
        // the HoH scene follows; the picks have been applied by then
        const after = getById(controller.gameState, id).relationships[picked![0]];
        if (before > -1) expect(after).toBeLessThan(before);
        else expect(after).toBe(-1); // already at the floor
    });
});

describe("tainted wine", () => {
    // Plays seasons until Tainted Wine comes up, recording its boards and what the player was asked.
    function findWine() {
        for (let id = 0; id < 30; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(10), [id % 10]));
            controller.state.seed = 4200 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            const boards: Extract<Prompt, { kind: "knockout" }>[] = [];
            const asked: string[] = [];
            for (let guard = 0; guard < 3000; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "knockout" && p.name === "Tainted Wine") boards.push(p);
                if (p.kind === "winePour" || p.kind === "wineDrink") asked.push(p.kind);
                if (boards.length > 0 && boards[boards.length - 1].winnerId !== undefined) return { controller, boards, asked };
                answer(controller, p, "random", "random");
            }
        }
        throw new Error("No Tainted Wine comp came up");
    }

    it("is played with two glasses until one houseguest is left; two tainted sips and you're out", () => {
        const { controller, boards, asked } = findWine();
        const last = boards[boards.length - 1];
        expect(last.remaining.map((hg) => hg.id)).toEqual([last.winnerId]);
        const lines = boards.flatMap((b) => b.lines);
        const outLines = lines.filter((l) => l.includes("is out!"));
        expect(outLines.length).toBe(last.out.length);
        outLines.forEach((l) => expect(l).toContain(`(${STRIKES_OUT}/${STRIKES_OUT})`));
        expect(asked.length).toBeGreaterThan(0);
        expect(controller.state.usedComps.filter((c) => c === TAINTED_WINE_ID).length).toBe(1);
        // one glass at a time
        boards.forEach((b) => expect(b.lines.filter((line) => line.includes("drank the tainted wine")).length).toBeLessThanOrEqual(1));
    });

    it("bots read tells, and sharper bots read the pourer better", () => {
        const rand = seededRand(5);
        const rate = (pour: { offerTainted: boolean; claim: "clean"; tell?: string }, skill: number) => {
            let right = 0;
            for (let i = 0; i < 4000; i++) if (botSwaps(pour, skill, 0.5, rand) === pour.offerTainted) right++;
            return right / 4000;
        };
        const plain = { offerTainted: true, claim: "clean" as const };
        expect(rate(plain, 1)).toBeGreaterThan(rate(plain, 0) + 0.05);
        expect(rate({ ...plain, tell: "can't stop smirking" }, 0)).toBeGreaterThan(0.7);
    });
});

describe("memory duel", () => {
    // Plays seasons until a Memory Duel comes up, recording its boards and the duel screens.
    function findDuel(stopAfterFlips?: number) {
        for (let id = 0; id < 60; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(8), [id % 8]));
            controller.state.seed = 5100 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            const boards: Extract<Prompt, { kind: "knockout" }>[] = [];
            const duels: Extract<Prompt, { kind: "memoryDuel" }>[] = [];
            for (let guard = 0; guard < 4000; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "knockout" && p.name === "Memory Duel") boards.push(p);
                if (p.kind === "memoryDuel") duels.push(p);
                if (stopAfterFlips !== undefined && duels.filter((d) => d.onFlip).length > stopAfterFlips) return { controller, boards, duels, current: () => prompt as Prompt };
                if (boards.length > 0 && boards[boards.length - 1].winnerId !== undefined) return { controller, boards, duels, current: () => prompt as Prompt };
                answer(controller, p, "random", "random");
            }
        }
        throw new Error("No Memory Duel came up");
    }

    it("is one on one, winner stays on, loser is out, until one houseguest is left", () => {
        const { controller, boards, duels } = findDuel();
        const last = boards[boards.length - 1];
        expect(last.remaining.map((hg) => hg.id)).toEqual([last.winnerId]);
        const results = boards.flatMap((b) => b.lines).filter((l) => l.includes(" beat "));
        expect(results.length).toBe(last.out.length);
        // every duel clears the board: the pairs add up
        results.forEach((l) => {
            const [, w, x] = l.match(/, (\d+) pairs to (\d+)/)!;
            expect(+w + +x).toBe(DUEL_PAIRS);
            expect(+w).toBeGreaterThan(+x);
        });
        // the player turned cards over one at a time, and saw who won each of their duels
        const flips = duels.filter((d) => d.onFlip);
        expect(flips.length).toBeGreaterThan(0);
        flips.forEach((d) => expect(d.open.length).toBeLessThan(2));
        expect(duels.filter((d) => d.onDone).length).toBeGreaterThan(0);
        expect(controller.state.usedComps.filter((c) => c === MEMORY_DUEL_ID).length).toBe(1);
    });

    it("picks up a reloaded duel where it was, card for card", () => {
        const { controller, current } = findDuel(3);
        const before = current() as Extract<Prompt, { kind: "memoryDuel" }>;
        expect(before.kind).toBe("memoryDuel");
        const resumed = new PlayerModeController(migrateSave(deserialize<any>(serialize(controller.state)))!);
        let rp: Prompt | null = null;
        resumed.prompt$.subscribe((p) => (rp = p));
        resumed.start();
        for (let guard = 0; guard < 20 && (rp as Prompt | null)?.kind !== "memoryDuel"; guard++) answer(resumed, rp!, "random", "random");
        const after = rp as unknown as Extract<Prompt, { kind: "memoryDuel" }>;
        expect(after.kind).toBe("memoryDuel");
        expect(after.deck).toEqual(before.deck);
        expect(after.matched).toEqual(before.matched);
        expect(after.open).toEqual(before.open);
        expect(after.scores).toEqual(before.scores);
    });

    it("bots take pairs they remember, and sharper bots win more duels", () => {
        const deck = duelDeck(9);
        const face = deck[0];
        const twin = deck.indexOf(face, 1);
        // a sharp bot that just saw both cards of a pair turns one over, then the other
        const first = botFlip(deck, {}, [0, twin], null, 1, 3);
        expect([0, twin]).toContain(first);
        expect(botFlip(deck, {}, [0, twin], first, 1, 3)).toBe(first === 0 ? twin : 0);
        // whole duels between two bots
        const play = (skillA: number, skillB: number, seed: number) => {
            const d = duelDeck(seed);
            const matched: Matched = {};
            const seen: number[] = [];
            const score = [0, 0];
            let turn = seed % 2;
            while (Object.keys(matched).length < d.length) {
                const skill = turn === 0 ? skillA : skillB;
                const c1 = botFlip(d, matched, seen, null, skill, seed * 1000 + seen.length);
                seen.push(c1);
                const c2 = botFlip(d, matched, seen, c1, skill, seed * 1000 + seen.length);
                seen.push(c2);
                expect(c2).not.toBe(c1);
                if (d[c1] === d[c2]) {
                    matched[c1] = matched[c2] = turn;
                    score[turn]++;
                } else turn = 1 - turn;
            }
            return score[0] > score[1];
        };
        let sharpWins = 0;
        for (let seed = 1; seed <= 200; seed++) if (play(0.9, 0.1, seed)) sharpWins++;
        expect(sharpWins).toBeGreaterThan(110);
    });
});

describe("no do-overs: reloading in the middle of a comp", () => {
    // Plays until a player is about to start a regular comp, then starts it (and scores a little).
    function startComp(controller: PlayerModeController, getPrompt: () => Prompt | null) {
        for (let guard = 0; guard < 3000; guard++) {
            const p = getPrompt();
            if (!p) break;
            if (p.kind === "compPlay") {
                p.onStart!();
                p.onReport!(1);
                return p;
            }
            answer(controller, p, "random", "random");
        }
        throw new Error("No comp came up");
    }

    it("keeps the comp, and the player's score so far, instead of letting them replay it", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(8), [2]));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        const play = startComp(controller, () => prompt);
        // the tab is closed mid-comp, and the save is loaded again
        const restored = migrateSave(deserialize<any>(serialize(controller.state)))!;
        const resumed = new PlayerModeController(restored);
        let rp: Prompt | null = null;
        resumed.prompt$.subscribe((p) => (rp = p));
        resumed.start();
        for (let guard = 0; guard < 50; guard++) {
            const p = rp as Prompt | null;
            if (!p) break;
            expect(p.kind).not.toBe("compPlay");
            if (p.kind === "compResults") {
                expect(p.comp.id).toBe(play.comp.id);
                expect(p.results.find((r) => r.id === 2)!.score).toBe(1);
                return;
            }
            answer(resumed, p, "random", "random");
        }
        throw new Error("The comp's results never came up");
    });

    it("keeps a finished score, and the comp that was picked", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(8), [2]));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        const play = startComp(controller, () => prompt);
        play.onScore(7);
        const restored = migrateSave(deserialize<any>(serialize(controller.state)))!;
        const resumed = new PlayerModeController(restored);
        let rp: Prompt | null = null;
        resumed.prompt$.subscribe((p) => (rp = p));
        resumed.start();
        for (let guard = 0; guard < 50; guard++) {
            const p = rp as Prompt | null;
            if (!p) break;
            expect(p.kind).not.toBe("compPlay");
            if (p.kind === "compResults") {
                expect(p.comp.id).toBe(play.comp.id);
                expect(p.results.find((r) => r.id === 2)!.score).toBe(7);
                return;
            }
            answer(resumed, p, "random", "random");
        }
        throw new Error("The comp's results never came up");
    });
});

describe("bots throwing comps", () => {
    function house(n: number): GameState {
        return prepareNextWeek(newGame(n), BigBrotherVanilla);
    }

    it("houseguests on the block never throw the veto, and nobody throws late in the game", () => {
        const gs = house(10);
        const bot = getById(gs, 1);
        expect(throwChance(gs, emptyBook(), bot, "veto", { hohId: 0, nomineeIds: [1, 2] })).toBe(0);
        expect(throwChance(gs, emptyBook(), bot, "veto", { hohId: 0, nomineeIds: [2, 3] })).toBeGreaterThan(0.1);
        expect(throwChance(gs, emptyBook(), bot, "other", {})).toBe(0);
        const late = house(5);
        expect(throwChance(late, emptyBook(), getById(late, 1), "hoh", {})).toBe(0);
    });

    it("a houseguest in someone's sights fights for HoH; a safe one may sit it out", () => {
        const gs = new MutableGameState(house(10));
        const bot = getById(gs, 1);
        gs.houseguests.forEach((hg) => (hg.hitList = hg.hitList.filter((e) => e.id !== 1)));
        const safe = throwChance(gs, emptyBook(), bot, "hoh", {});
        getById(gs, 2).hitList = [{ id: 1, value: 1, name: "HG1" } as any, ...getById(gs, 2).hitList];
        expect(throwChance(gs, emptyBook(), bot, "hoh", {})).toBeLessThan(safe);
        expect(safe).toBeGreaterThan(0.05);
    });

    it("bots do throw comps over a season, and it shows in the results", () => {
        let threw = 0;
        for (let id = 0; id < 4; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(14), [id]));
            controller.state.seed = 60 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            for (let guard = 0; guard < 3000; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "compResults") threw += p.results.filter((r) => r.threw).length;
                answer(controller, p, "random", "random");
            }
        }
        expect(threw).toBeGreaterThan(0);
    });
});

describe("deals during endurance", () => {
    // Plays until an endurance HoH comp comes up for the player.
    function atTheWall(id: number, seed: number) {
        const controller = new PlayerModeController(newPlayerSave(newGame(10), [id]));
        controller.state.seed = seed;
        // every other weekly comp has been played, so the wall is next
        controller.state.usedComps = WEEKLY_COMPS.filter((c) => c.id !== HoldTheWallComp.id).map((c) => c.id).concat(KNOCKOUT_ID);
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        for (let guard = 0; guard < 200; guard++) {
            const p = prompt as Prompt | null;
            if (!p) break;
            if (p.kind === "compPlay") return { controller, play: p, current: () => prompt as Prompt };
            answer(controller, p, "random", true);
        }
        throw new Error("No comp came up");
    }

    it("offers deals on the wall only in an endurance HoH comp", () => {
        const { play } = atTheWall(0, 1);
        expect(play.comp.id).toBe(HoldTheWallComp.id);
        expect(play.title).toBe("Head of House Competition");
        expect(play.deals).toBeDefined();
    });

    it("a bot that takes the player's deal drops, and the player HoH owes it safety", () => {
        for (let seed = 1; seed < 40; seed++) {
            const { controller, play, current } = atTheWall(0, seed);
            const bots = play.opponents.filter((o) => o.score > 20).map((o) => o.hg.id);
            const taker = bots.find((botId) => play.onDeal!("ask", botId, 10));
            if (taker === undefined) continue;
            expect(controller.state.week.wallDeals).toEqual([{ hohId: 0, toId: taker }]);
            play.onScore(1e9);
            const results = current() as Extract<Prompt, { kind: "compResults" }>;
            expect(results.results.find((r) => r.id === taker)!.score).toBe(10);
            for (let guard = 0; guard < 20 && (current().kind !== "hohRoom"); guard++) answer(controller, current(), "random", true);
            expect(controller.room!.promised).toContain(taker);
            return;
        }
        throw new Error("No bot ever took the deal");
    });

    it("a player who takes a bot's offer and drops is owed safety if that bot wins HoH", () => {
        for (let seed = 1; seed < 40; seed++) {
            const { controller, play, current } = atTheWall(0, seed);
            // the bot that would outlast everyone makes the offer
            const [best, second] = [...play.opponents].sort((a, b) => b.score - a.score);
            if (!play.deals || !play.deals.offerFrom.includes(best.hg.id) || second.score === best.score) continue; // a tie goes to the tiebreaker
            play.onDeal!("accept", best.hg.id, 0);
            play.onScore(best.score - 1);
            for (let guard = 0; guard < 20 && current().kind !== "hohVisit"; guard++) answer(controller, current(), "random", true);
            expect(controller.state.week.hohId).toBe(best.hg.id);
            expect(controller.room!.promised).toContain(0);
            return;
        }
        throw new Error("The last bot standing never made an offer");
    });
});

describe("iconic comp formats", () => {
    const history = [
        { week: 1, hohId: 0, nomineeIds: [1, 2], povId: 3, evictedIds: [1] },
        { week: 2, hohId: 4, nomineeIds: [2, 5], povId: 6, evictedIds: [2] },
    ];

    it("are in the weekly rotation, and the season quizzes wait until there's a season to ask about", () => {
        const gs = newGame(10);
        [OtevComp, BBComicsComp, OverOrUnderComp, DaysQuizComp, FaceMorphComp].forEach((c) => expect(WEEKLY_COMPS).toContain(c));
        // Hide the Veto is the tiebreaker now, not a weekly comp
        expect(WEEKLY_COMPS).not.toContain(HideAndGoVetoComp);
        expect(OtevComp.available!(gs, [])).toBe(false);
        expect(OtevComp.available!(gs, history)).toBe(true);
        expect(DaysQuizComp.available!(gs, [])).toBe(false);
        expect(DaysQuizComp.available!(gs, history)).toBe(true);
    });

    it("better bots do better at each of them (except hiding a veto, which is mostly luck)", () => {
        const gs = newGame(10);
        [OtevComp, BBComicsComp, OverOrUnderComp, DaysQuizComp, FaceMorphComp].forEach((comp) => {
            const average = (skill: number) => {
                let total = 0;
                for (let seed = 1; seed <= 150; seed++) {
                    const ctx = { seed, gameState: gs, history, participants: [] };
                    total += comp.simulate(ctx, skill, seededRand(seed * 17 + 3)).score;
                }
                return total / 150;
            };
            expect(average(0.9)).toBeGreaterThan(average(0.1));
        });
    });

    it("hide and go veto: everyone gets the same house, and scores are places in the search order", () => {
        const gs = newGame(10);
        const ctx = { seed: 44, gameState: gs, history, participants: [] };
        for (let k = 0; k < 50; k++) {
            const score = HideAndGoVetoComp.simulate(ctx, k / 50, seededRand(k + 1)).score;
            expect(Number.isInteger(score)).toBe(true);
            expect(score).toBeGreaterThanOrEqual(1);
            expect(score).toBeLessThanOrEqual(12);
        }
        expect(HideAndGoVetoComp.format(12)).toBe("never found!");
        expect(HideAndGoVetoComp.format(2)).toBe("found 2nd");
    });
});

describe("deals, promises and lies", () => {
    function house(n: number = 10): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(n), BigBrotherVanilla));
    }

    it("a safety promise is kept when the HoH doesn't nominate you, and broken (publicly) when they do", () => {
        const gs = house();
        const ledger = emptyLedger();
        const kept = pledge(ledger, "safety", 0, 1, gs.phase);
        const broken = pledge(ledger, "safety", 0, 2, gs.phase);
        const news = settleNominationPledges(gs, ledger, 0, [2, 3], gs.phase);
        expect(broken.status).toBe("broken");
        expect(broken.known).toBe(true);
        expect(reputation(ledger, 0)).toBeLessThan(0);
        expect(news.some((n) => n.toIds.includes(2))).toBe(true);
        settleEvictionPledges(gs, ledger, gs.phase, 0, { 4: 2, 5: 2 }, [2]);
        expect(kept.status).toBe("kept");
        // a safety promise from someone who didn't win HoH comes to nothing
        const other = pledge(ledger, "safety", 6, 7, gs.phase);
        settleEvictionPledges(gs, ledger, gs.phase, 0, {}, []);
        expect(other.status).toBe("void");
    });

    it("vote promises and final-two deals are settled by the secret votes", () => {
        const gs = house();
        const ledger = emptyLedger();
        const keptVote = pledge(ledger, "vote", 4, 1, gs.phase);
        const brokenVote = pledge(ledger, "vote", 5, 1, gs.phase);
        const final2 = pledge(ledger, "final2", 6, 2, gs.phase);
        rng().seed(3);
        settleEvictionPledges(gs, ledger, gs.phase, 0, { 4: 2, 5: 1, 6: 2 }, [2]);
        expect(keptVote.status).toBe("kept");
        expect(brokenVote.status).toBe("broken");
        expect(final2.status).toBe("broken");
        expect(reputation(ledger, 4)).toBeGreaterThan(0);
        expect(reputation(ledger, 5)).toBeLessThan(0);
    });

    it("final-two deals: kept if you take them, broken if you evict them", () => {
        const gs = house(4);
        const ledger = emptyLedger();
        const kept = pledge(ledger, "final2", 0, 1, 1);
        const back = pledge(ledger, "final2", 1, 0, 1);
        const broken = pledge(ledger, "final2", 0, 2, 1);
        settleFinalPledges(gs, ledger, 0, 2);
        expect(kept.status).toBe("kept");
        expect(back.status).toBe("kept");
        expect(broken.status).toBe("broken");
    });

    it("telling a nominee the other nominee is the target is good news, even if they're close", () => {
        const { tellTarget } = require("./social/campaign");
        const gs = house();
        getById(gs, 5).relationships[6] = 0.9;
        const onBlock = tellTarget(gs, emptyLedger(), 0, 5, 6, gs.phase, [5, 6]);
        expect(onBlock.good).toBe(true);
        expect(onBlock.text).toContain("relieved");
        // not on the block: a close friend of the target doesn't like it
        const offBlock = tellTarget(gs, emptyLedger(), 0, 5, 6, gs.phase, [6, 7]);
        expect(offBlock.good).toBe(false);
    });

    it("different houseguests see the same player's comp and social game differently", () => {
        const { perceivedComp, perceivedSocial } = require("./social/perception");
        const gs = house();
        const target = getById(gs, 6);
        const views = [1, 2, 3, 4, 5].map((id) => perceivedComp(getById(gs, id), target));
        expect(new Set(views.map((v) => v.toFixed(2))).size).toBeGreaterThan(1);
        // stable: the same observer sees them the same way all season
        expect(perceivedComp(getById(gs, 1), target)).toBe(views[0]);
        // liking someone makes their social game look less dangerous
        const before = perceivedSocial(getById(gs, 1), target);
        getById(gs, 1).relationships[6] = 0.9;
        expect(perceivedSocial(getById(gs, 1), target)).toBeLessThan(before);
    });

    it("telling a voter your vote: agreeing with them, or liking both nominees, isn't an insult", () => {
        const gs = house();
        const ledger = emptyLedger();
        getById(gs, 5).relationships[3] = 0.8;
        getById(gs, 5).relationships[4] = 0.8;
        // likes both the same: a tough call, not a slight
        expect(tellVote(gs, ledger, 0, 5, 3, [3, 4], gs.phase).good).toBe(true);
        // closer to the one you named than the other: that stings
        getById(gs, 5).relationships[4] = 0.1;
        const stings = tellVote(gs, ledger, 0, 5, 3, [3, 4], gs.phase);
        expect(stings.good).toBe(false);
        expect(stings.text).toContain("didn't love hearing that");
        // ...unless they were voting that way anyway
        const agrees = tellVote(gs, ledger, 0, 5, 3, [3, 4], gs.phase, 3);
        expect(agrees.good).toBe(true);
        expect(agrees.text).not.toContain("didn't love");
    });

    it("telling two close houseguests different things gets caught", () => {
        let caught = 0;
        for (let seed = 0; seed < 40; seed++) {
            const gs = house();
            const ledger = emptyLedger();
            getById(gs, 1).relationships[2] = 0.9;
            getById(gs, 2).relationships[1] = 0.9;
            tellVote(gs, ledger, 0, 1, 3, [3, 4], gs.phase);
            tellVote(gs, ledger, 0, 2, 4, [3, 4], gs.phase);
            seedRng(`deals:${seed}`);
            if (compareNotes(gs, ledger, gs.phase).length > 0) {
                caught++;
                expect(reputation(ledger, 0)).toBeLessThan(0);
            }
        }
        expect(caught).toBeGreaterThan(8);
        expect(caught).toBeLessThan(40);
    });

    it("saying one thing and voting another can come out, especially as a lone vote", () => {
        let lone = 0;
        let crowd = 0;
        for (let seed = 0; seed < 200; seed++) {
            const gs = house();
            const ledger = emptyLedger();
            tellVote(gs, ledger, 0, 5, 3, [3, 4], gs.phase);
            seedRng(`deals:${seed}`);
            if (checkVoteClaims(gs, ledger, gs.phase, { 0: 4, 6: 3, 7: 3 }).length > 0) lone++;
            const gs2 = house();
            const ledger2 = emptyLedger();
            tellVote(gs2, ledger2, 0, 5, 3, [3, 4], gs2.phase);
            seedRng(`deals:${seed}`);
            if (checkVoteClaims(gs2, ledger2, gs2.phase, { 0: 4, 6: 4, 7: 3 }).length > 0) crowd++;
        }
        expect(lone).toBeGreaterThan(crowd);
        expect(crowd).toBeGreaterThan(0);
    });

    it("a bot asked by a nominee it's voting out often lies; otherwise it's mostly honest", () => {
        let liesToNominee = 0;
        let liesToFriend = 0;
        for (let seed = 0; seed < 200; seed++) {
            const gs = house();
            seedRng(`deals:${seed}`);
            if (answerVoteQuestion(gs, 3, 5, 3, [3, 4]).lied) liesToNominee++;
            seedRng(`deals:${seed}`);
            getById(gs, 5).relationships[0] = 0.5;
            if (answerVoteQuestion(gs, 0, 5, 3, [3, 4]).lied) liesToFriend++;
        }
        expect(liesToNominee).toBeGreaterThan(60);
        expect(liesToFriend).toBeLessThan(25);
    });

    it("a bad reputation makes deals harder to land", () => {
        let clean = 0;
        let snake = 0;
        for (let seed = 0; seed < 200; seed++) {
            const gs = house();
            getById(gs, 1).relationships[0] = 0.3;
            getById(gs, 0).relationships[1] = 0.3;
            const good = emptyLedger();
            const bad = emptyLedger();
            bad.reputation[0] = -3;
            seedRng(`deals:${seed}`);
            if (offerFinal2(gs, good, 0, 1, 1).good) clean++;
            const gs2 = house();
            getById(gs2, 1).relationships[0] = 0.3;
            getById(gs2, 0).relationships[1] = 0.3;
            seedRng(`deals:${seed}`);
            if (offerFinal2(gs2, bad, 0, 1, 1).good) snake++;
        }
        expect(clean).toBeGreaterThan(snake + 20);
    });

    it("pinning a rogue vote on someone the target already dislikes usually works; on their friend it backfires", () => {
        let works = 0;
        let backfires = 0;
        for (let seed = 0; seed < 400; seed++) {
            const gs = house();
            const ledger = emptyLedger();
            getById(gs, 3).relationships[5] = -0.8;
            getById(gs, 5).relationships[3] = -0.8;
            seedRng(`deals:${seed}`);
            if (blameVote(gs, ledger, 0, 3, 5).good) works++;
            const gs2 = house();
            const ledger2 = emptyLedger();
            getById(gs2, 3).relationships[5] = 0.8;
            getById(gs2, 5).relationships[3] = 0.8;
            getById(gs2, 3).relationships[0] = -0.5;
            getById(gs2, 0).relationships[3] = -0.5;
            seedRng(`deals:${seed}`);
            if (!blameVote(gs2, ledger2, 0, 3, 5).good) {
                backfires++;
                expect(reputation(ledger2, 0)).toBeLessThan(0);
            }
        }
        // blaming the target's enemy works far more often than blaming their friend
        expect(works).toBeGreaterThan(400 - backfires + 50);
        expect(backfires).toBeGreaterThan(240);
    });

    it("bots mostly keep their vote promises, loyal soldiers more than villains", () => {
        const honoredBy = (personality: any) => {
            let honored = 0;
            for (let id = 0; id < 40; id++) {
                const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
                controller.state.seed = 500 + id;
                controller.state.personalities = { 5: personality };
                const gs = controller.gameState;
                const noms = [getById(gs, 1), getById(gs, 2)];
                controller.state.week.nomineeIds = [1, 2];
                controller.state.week.hohId = 3;
                const voter = getById(gs, 5);
                const before = (controller as any).intendedVote(gs, voter, noms).id;
                pledge(controller.ledger, "vote", 5, before, gs.phase);
                if ((controller as any).intendedVote(gs, voter, noms).id !== before) honored++;
            }
            return honored / 40;
        };
        const soldier = honoredBy("loyalSoldier");
        expect(soldier).toBeGreaterThan(0.7);
        expect(soldier).toBeGreaterThan(honoredBy("villain"));
    });

    it("vote counting: a bot's answer is fixed once asked, and shows in the tally", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        controller.state.week.nomineeIds = [1, 2];
        controller.state.week.hohId = 3;
        controller.state.socialTurn = 0;
        const said = controller.askVote(5);
        expect([1, 2]).toContain(said);
        expect(controller.askVote(5)).toBe(said);
        expect(controller.askVote(0)).toBeNull(); // can't ask a player
        const row = controller.tally(0).find((r) => r.hg.id === 5)!;
        expect(row.said).toBe(said);
        expect(controller.tally(0).some((r) => r.hg.id === 1 || r.hg.id === 3)).toBe(false);
    });

    it("seasons play through with deals and campaigning; rogue votes lead to the blame prompt", () => {
        let rogue = false;
        let settled = 0;
        for (let id = 0; id < 6 && !(rogue && settled > 0); id++) {
            const { controller, seen } = playSeason(10, [id], "random", "random");
            if (seen.has("choose:Rogue Vote")) rogue = true;
            settled += controller.ledger.pledges.filter((p) => p.status === "kept" || p.status === "broken").length;
            controller.ledger.pledges.forEach((p) => expect(p.status).not.toBe("open"));
        }
        expect(rogue).toBe(true);
        expect(settled).toBeGreaterThan(0);
    });
});

describe("bot personalities", () => {
    it("every bot gets one (players don't), the same one for the same seed, and a varied house", () => {
        const gs = prepareNextWeek(newGame(16), BigBrotherVanilla);
        const bots = gs.houseguests.filter((hg) => hg.id !== 0);
        const a = assignPersonalities(bots, 42);
        expect(assignPersonalities(bots, 42)).toEqual(a);
        expect(Object.keys(a).map(Number).sort((x, y) => x - y)).toEqual(bots.map((b) => b.id).sort((x, y) => x - y));
        expect(new Set(Object.values(a)).size).toBeGreaterThanOrEqual(4);
        const controller = new PlayerModeController(newPlayerSave(gs, [0]));
        expect(controller.personalities[0]).toBeUndefined();
        expect(controller.personalities[1]).toBeDefined();
    });

    it("comp-heavy casts have more comp beasts; social casts more masterminds", () => {
        const count = (stat: "comp" | "social", kind: string) => {
            let n = 0;
            for (let seed = 0; seed < 40; seed++) {
                const cast = Array.from({ length: 12 }, (_, i) => ({ name: `HG${i}`, imageURL: "", comp: stat === "comp" ? 10 : 1, social: stat === "social" ? 10 : 1 }));
                const gs = new GameState({ players: cast, jury: 5 });
                n += Object.values(assignPersonalities(gs.houseguests, seed)).filter((p) => p === kind).length;
            }
            return n;
        };
        expect(count("comp", "compBeast")).toBeGreaterThan(count("social", "compBeast"));
        expect(count("social", "mastermind")).toBeGreaterThan(count("comp", "mastermind"));
    });

    it("each has its own voice for every situation", () => {
        const situations: any[] = ["chat", "pitch", "final2", "votePlea", "voteAnswer", "hohVisit", "flirt"];
        PERSONALITY_IDS.forEach((p) =>
            situations.forEach((s) => {
                const line = voice(p, s, `k:${p}:${s}`, "Zed");
                expect(line.length).toBeGreaterThan(5);
                expect(line).not.toContain("{name}");
                if (s === "voteAnswer") expect(line).toContain("Zed");
            })
        );
        expect(voice("villain", "voteAnswer", "x", "Zed")).not.toEqual(voice("floater", "voteAnswer", "x", "Zed"));
    });

    it("comp beasts never throw a comp; floaters sometimes do", () => {
        const threwAs = (personality: any) => {
            let threw = 0;
            for (let seed = 0; seed < 30; seed++) {
                const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
                controller.state.seed = seed;
                const bots = controller.gameState.houseguests.filter((hg) => hg.id !== 0);
                controller.state.personalities = Object.fromEntries(bots.map((b) => [b.id, personality]));
                gs_hitlists_clear(controller);
                const results = (controller as any).simulateBots(WEEKLY_COMPS[0], bots, 1000 + seed, "hoh");
                threw += results.filter((r: any) => r.threw).length;
            }
            return threw;
        };
        expect(threwAs("compBeast")).toBe(0);
        expect(threwAs("floater")).toBeGreaterThan(5);
    });

    it("villains and masterminds lie about their votes more than loyal soldiers", () => {
        let villain = 0;
        let soldier = 0;
        for (let seed = 0; seed < 300; seed++) {
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            seedRng(`lie:${seed}`);
            if (answerVoteQuestion(gs, 3, 5, 3, [3, 4], 1.4).lied) villain++;
            seedRng(`lie:${seed}`);
            if (answerVoteQuestion(gs, 3, 5, 3, [3, 4], 0.3).lied) soldier++;
        }
        expect(villain).toBeGreaterThan(soldier * 2);
    });
});

// nobody is targeting anyone, so throwing is on the table for everyone
function gs_hitlists_clear(controller: PlayerModeController) {
    controller.gameState.houseguests.forEach((hg) => (hg.hitList = []));
}

describe("hidden feelings", () => {
    it("masterminds hide a grudge behind a smile; loyal soldiers show how they feel", () => {
        expect(apparentRelationship(-0.7, "mastermind", "k", false)).toBeGreaterThan(-0.25);
        expect(apparentRelationship(-0.7, "loyalSoldier", "k", false)).toBeLessThan(-0.55);
        // villains act colder than they feel
        expect(apparentRelationship(0.1, "villain", "k", false)).toBeLessThan(0.1);
        // once the mask slips, you see the truth (give or take)
        expect(Math.abs(apparentRelationship(-0.7, "mastermind", "k", true) + 0.7)).toBeLessThan(0.09);
    });

    it("players see how a bot acts; the truth shows once the bot nominates them", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        controller.state.personalities = { ...controller.personalities, 4: "mastermind" };
        const me = getById(controller.gameState, 0);
        const bot = getById(controller.gameState, 4);
        me.relationships[4] = -0.8;
        bot.relationships[0] = -0.8;
        expect(controller.feelingOf(0, 4)).toBeGreaterThan(-0.4);
        // bots see the truth (they don't need the mask)
        expect(controller.feelingOf(4, 0)).toBe(-0.8);
        reveal(controller.ledger, 4, 0, controller.gameState.phase);
        expect(controller.feelingOf(0, 4)).toBeLessThan(-0.7);
    });
});

describe("trust, separate from liking", () => {
    it("breaking your word drops trust even if they still like you, and low trust makes deals fail", () => {
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        const ledger = emptyLedger();
        const p = pledge(ledger, "safety", 0, 1, gs.phase);
        settleNominationPledges(gs, ledger, 0, [1, 2], gs.phase);
        expect(p.status).toBe("broken");
        expect(trustOf(ledger, 1, 0)).toBeLessThan(0.2);
        // the house noticed too, a little
        expect(trustOf(ledger, 5, 0)).toBeLessThan(0.5);
        expect(trustOf(ledger, 5, 0)).toBeGreaterThan(0.4);

        let trusted = 0;
        let doubted = 0;
        for (let seed = 0; seed < 300; seed++) {
            const make = () => {
                const g = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
                getById(g, 1).relationships[0] = 0.6; // they like you either way
                getById(g, 0).relationships[1] = 0.6;
                return g;
            };
            const fresh = emptyLedger();
            seedRng(`trust:${seed}`);
            if (offerFinal2(make(), fresh, 0, 1, 1).good) trusted++;
            const burned = emptyLedger();
            shiftTrust(burned, 1, 0, -0.5);
            seedRng(`trust:${seed}`);
            if (offerFinal2(make(), burned, 0, 1, 1).good) doubted++;
        }
        expect(trusted).toBeGreaterThan(doubted + 40);
    });

    it("pawn talk that turns out true builds trust; a lie destroys it", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        controller.state.week.pawns = [
            { hohId: 0, toId: 1, believed: true },
            { hohId: 0, toId: 2, believed: true },
        ];
        (controller as any).settlePawns([1]);
        expect(controller.trustIn(1, 0)).toBeLessThan(0.2);
        expect(controller.trustIn(2, 0)).toBeGreaterThan(0.5);
    });
});

describe("showmances", () => {
    it("flirting with someone who likes you can start a showmance; flirting outside it costs you", () => {
        let formed = 0;
        for (let seed = 0; seed < 40; seed++) {
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            getById(gs, 0).relationships[3] = 0.7;
            getById(gs, 3).relationships[0] = 0.7;
            const list: any[] = [];
            seedRng(`flirt:${seed}`);
            const result = flirt(gs, list, 0, 3);
            if (result.showmance) {
                formed++;
                list.push(result.showmance);
                const before = getById(gs, 0).relationships[3];
                const cheat = flirt(gs, list, 0, 4);
                expect(cheat.outcome.good).toBe(false);
                expect(getById(gs, 0).relationships[3]).toBeLessThan(before);
            }
        }
        expect(formed).toBeGreaterThan(10);
    });

    it("close bots pair off on their own", () => {
        let formed = 0;
        for (let seed = 0; seed < 40; seed++) {
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            getById(gs, 4).relationships[5] = 0.9;
            getById(gs, 5).relationships[4] = 0.9;
            seedRng(`pair:${seed}`);
            formed += botShowmances(gs, [], [0]).filter((s) => (s.a === 4 && s.b === 5) || (s.a === 5 && s.b === 4)).length;
        }
        expect(formed).toBeGreaterThan(0);
    });

    it("nobody votes out their showmance, and bot HoHs go after showmances as a pair", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        controller.state.showmances = [{ a: 5, b: 1, week: 1 }];
        const gs = controller.gameState;
        const noms = [getById(gs, 1), getById(gs, 2)];
        for (let seed = 0; seed < 20; seed++) {
            controller.state.seed = seed;
            expect((controller as any).intendedVote(gs, getById(gs, 5), noms).id).toBe(2);
        }
        let paired = 0;
        controller.state.week.hohId = 3;
        for (let seed = 0; seed < 40; seed++) {
            seedRng(`sway:${seed}`);
            const sway = (controller as any).roomSway();
            if (sway.targets.includes(1) && sway.targets.includes(5)) paired++;
        }
        expect(paired).toBeGreaterThan(8);
        // and a showmance member, as HoH, protects their partner
        controller.state.week.hohId = 5;
        expect((controller as any).roomSway().protect).toContain(1);
    });
});

describe("bots pinning rogue votes", () => {
    it("a bot can pin its vote against the surviving nominee on a player who voted the other way", () => {
        let framed = 0;
        for (let seed = 0; seed < 30; seed++) {
            const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
            controller.state.seed = seed;
            controller.state.personalities = { ...controller.personalities, 6: "villain", 7: "villain" };
            const gs = controller.gameState;
            const noms = [getById(gs, 1), getById(gs, 2)];
            seedRng(`frame:${seed}`);
            // HG2 goes home; HG6 and HG7 voted against HG1 (who stays); the player voted out HG2
            (controller as any).settleTheVote(gs.phase, 3, { 0: 2, 4: 2, 5: 2, 6: 1, 7: 1 }, [2], noms);
            if (controller.newsFor(0).some((line) => line.includes("pinned their vote on you"))) framed++;
        }
        expect(framed).toBeGreaterThan(5);
    });
});

describe("season end", () => {
    it("reveals who everyone really was", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(6), [0]));
        controller.state.seed = 77;
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        for (let guard = 0; guard < 2000; guard++) {
            const p = prompt as Prompt | null;
            if (!p) break;
            if (p.kind === "gameOver") {
                const html = renderToStaticMarkup(p.content);
                expect(html).toContain("Who they really were");
                expect(html).toMatch(/Mastermind|Comp Beast|Floater|Loyal Soldier|Villain|Superfan|Wildcard/);
                return;
            }
            answer(controller, p, "random", "random");
        }
        throw new Error("The season never ended");
    });
});

describe("rivalries and blow-ups", () => {
    function house(): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
    }

    it("everyone picks the side of whoever they like more, and it costs them with the other", () => {
        const gs = house();
        const ledger = emptyLedger();
        getById(gs, 5).relationships[1] = 0.8;
        getById(gs, 5).relationships[2] = -0.4;
        getById(gs, 6).relationships[1] = -0.4;
        getById(gs, 6).relationships[2] = 0.8;
        seedRng("sides");
        const sides = pickSides(gs, ledger, 1, 2, [5, 6], 1);
        expect(sides.forA).toContain(5);
        expect(sides.forB).toContain(6);
        expect(getById(gs, 5).relationships[2]).toBeLessThan(-0.4);
    });

    it("a house meeting goes better with evidence against the target", () => {
        let withProof = 0;
        let without = 0;
        for (let seed = 0; seed < 60; seed++) {
            const a = house();
            const proof = emptyLedger();
            proof.reputation[3] = -1.5;
            seedRng(`meeting:${seed}`);
            if (houseMeeting(a, proof, 0, 3, [0]).good) withProof++;
            const b = house();
            seedRng(`meeting:${seed}`);
            if (houseMeeting(b, emptyLedger(), 0, 3, [0]).good) without++;
        }
        expect(withProof).toBeGreaterThan(without);
    });

    it("feuding bots blow up, and players are asked to pick a side", () => {
        let asked = false;
        for (let seed = 0; seed < 30 && !asked; seed++) {
            const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
            controller.state.seed = seed;
            const gs = new MutableGameState(controller.gameState);
            getById(gs, 4).relationships[5] = -0.9;
            getById(gs, 5).relationships[4] = -0.9;
            controller.state.gameState = new GameState(gs);
            controller.state.personalities = { 4: "villain", 5: "villain" };
            seedRng(`fight:${seed}`);
            const fight = botFight(new MutableGameState(controller.gameState), controller.ledger, [0], () => 2.5);
            if (!fight) continue;
            (controller as any).askOthersToPickSides(fight.aId, fight.bId, "fight");
            const approaches = controller.approachesFor(0);
            const i = approaches.findIndex((a) => a.kind === "sides");
            expect(i).toBeGreaterThanOrEqual(0);
            controller.state.socialTurn = 0;
            const before = controller.player(0).relationships[fight.bId];
            expect(controller.respondSides(i, "a")!.text).toContain("side");
            expect(controller.player(0).relationships[fight.bId]).toBeLessThan(before);
            asked = true;
        }
        expect(asked).toBe(true);
    });
});

describe("threat level", () => {
    it("comp wins and being liked make you a threat", () => {
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        getById(gs, 3).hohWins = 3;
        getById(gs, 3).povWins = 2;
        const t = threatLevel(gs, [], 3);
        expect(t.rank).toBe(0);
        expect(t.reasons[0]).toContain("5 comp wins");
        expect(["Biggest threat in the house", "High"]).toContain(t.label);
    });

    it("bot HoHs and voters go after big threats, more so late in the game", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        controller.state.personalities = {};
        getById(controller.gameState, 7).hohWins = 4;
        controller.state.week.hohId = 3;
        let targeted = 0;
        for (let seed = 0; seed < 60; seed++) {
            seedRng(`threat:${seed}`);
            if ((controller as any).topThreat(3).includes(7)) targeted++;
        }
        expect(targeted).toBeGreaterThan(10);
        expect(targeted).toBeLessThan(60);
    });
});

describe("too many alliances", () => {
    it("someone in several alliances eventually gets exposed as playing every side", () => {
        let exposed = 0;
        for (let seed = 0; seed < 40; seed++) {
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            const book = emptyBook();
            const ledger = emptyLedger();
            [[0, 1], [0, 2], [0, 3], [0, 4]].forEach((m, i) => createAlliance(gs, book, m, `A${i}`));
            seedRng(`hop:${seed}`);
            const news = exposeAllianceHoppers(gs, ledger, book);
            if (news.length > 0) {
                exposed++;
                expect(reputation(ledger, 0)).toBeLessThan(0);
                expect(trustOf(ledger, 1, 0)).toBeLessThan(0.5);
            }
        }
        expect(exposed).toBeGreaterThan(5);
        // one or two alliances is fine
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        const book = emptyBook();
        createAlliance(gs, book, [0, 1], "One");
        createAlliance(gs, book, [0, 2], "Two");
        for (let seed = 0; seed < 20; seed++) expect(exposeAllianceHoppers(gs, emptyLedger(), book)).toEqual([]);
    });
});

describe("eavesdropping and rumours", () => {
    it("snooping can reveal an alliance (and its target), and can get you caught", () => {
        let learned = 0;
        let caught = 0;
        for (let seed = 0; seed < 60; seed++) {
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            const book = emptyBook();
            const a = createAlliance(gs, book, [3, 4, 5], "The Vault");
            a.target = 0;
            a.targetWeek = gs.phase;
            const ledger = emptyLedger();
            seedRng(`snoop:${seed}`);
            const result = snoop(gs, ledger, book, 0);
            if (result.learned === a.id) {
                learned++;
                expect(result.outcome.text).toContain("coming after YOU");
            }
            if (result.outcome.text.includes("walked in on you")) {
                caught++;
                expect(trustOf(ledger, 3, 0)).toBeLessThan(0.5);
            }
        }
        expect(learned).toBeGreaterThan(20);
        expect(caught).toBeGreaterThan(3);
    });

    it("rumours turn people against each other; false ones can come back to bite", () => {
        let believed = 0;
        let backfired = 0;
        for (let seed = 0; seed < 80; seed++) {
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            const ledger = emptyLedger();
            getById(gs, 4).relationships[5] = 0.5; // they're friends: the rumour is false
            getById(gs, 5).relationships[4] = 0.5;
            const before = getById(gs, 4).relationships[5];
            seedRng(`rumour:${seed}`);
            if (spreadRumour(gs, ledger, emptyBook(), 0, 4, 5, "trashTalk").good) {
                believed++;
                expect(getById(gs, 4).relationships[5]).toBeLessThan(before);
            }
            if (checkRumours(gs, ledger, gs.phase).length > 0) {
                backfired++;
                expect(reputation(ledger, 0)).toBeLessThan(0);
            }
        }
        expect(believed).toBeGreaterThan(5);
        expect(backfired).toBeGreaterThan(5);
        // a true rumour can't backfire
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        const ledger = emptyLedger();
        getById(gs, 5).relationships[4] = -0.8;
        getById(gs, 4).relationships[5] = -0.8;
        spreadRumour(gs, ledger, emptyBook(), 0, 4, 5, "trashTalk");
        for (let seed = 0; seed < 20; seed++) expect(checkRumours(gs, ledger, gs.phase)).toEqual([]);
    });

    it("snooping works through the social screen's action and remembers what you heard", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        const gs = new MutableGameState(controller.gameState);
        createAlliance(gs, controller.state.book, [3, 4], "Night Owls");
        controller.state.gameState = new GameState(gs);
        controller.state.socialTurn = 0;
        controller.state.actionsLeft = 3;
        for (let i = 0; i < 3; i++) controller.socialAct({ kind: "snoop" });
        expect(controller.state.actionsLeft).toBe(0);
        // a house meeting needs two actions
        controller.state.actionsLeft = 1;
        expect(controller.socialAct({ kind: "meeting", botId: 3 })).toBeNull();
    });
});

describe("the jury", () => {
    function house(): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
    }

    it("bitter jurors vote with their feelings; objective jurors respect the better game", () => {
        const gs = house();
        // HG1 is lovely and did nothing; HG2 is disliked and won everything
        getById(gs, 2).hohWins = 4;
        getById(gs, 2).povWins = 3;
        const history = [
            { week: 1, hohId: 2, nomineeIds: [1, 5], povId: 2, evictedIds: [5] },
            { week: 2, hohId: 2, nomineeIds: [1, 6], povId: 2, evictedIds: [6] },
        ];
        getById(gs, 8).relationships[1] = 0.6;
        getById(gs, 8).relationships[2] = -0.3;
        const jury = emptyJury();
        expect(botJuryVote(gs, history, jury, 8, [1, 2], "bitter", [8]).vote).toBe(1);
        const objective = botJuryVote(gs, history, jury, 8, [1, 2], "objective", [8]);
        expect(objective.vote).toBe(2);
        expect(objective.reason).toContain("won 7 comps");
    });

    it("lies and broken promises follow you to the jury, and grudges spread in the jury house", () => {
        const gs = house();
        const jury = emptyJury();
        getById(gs, 7).relationships[1] = 0; // no feelings either way: the grudge decides
        getById(gs, 7).relationships[2] = 0;
        addGrudge(jury, 7, 1, -0.6, "told me I wasn't the target");
        const before = botJuryVote(gs, [], jury, 7, [1, 2], "bitter", [7]);
        expect(before.reason).toContain("couldn't forgive");
        // HG7 arrives at the jury house; HG8 (who likes HG7) picks up the grudge
        getById(gs, 8).relationships[7] = 0.8;
        getById(gs, 9).relationships[7] = -0.8;
        getById(gs, 1).isEvicted = false;
        const lines = newcomerTalks(gs, jury, 7, [7, 8, 9]);
        expect(lines[0]).toContain("told me I wasn't the target");
        expect(jury.grudges[8][1].amount).toBeLessThan(0);
        expect(jury.grudges[9] && jury.grudges[9][1]).toBeUndefined();
    });

    it("at the roundtable, a player juror's argument sways jurors who like them", () => {
        // the same roundtable with and without the player's argument: the difference is the player's effect
        const run = (argue: boolean) => {
            seedRng("house"); // the same house both times
            const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
            const jury = emptyJury();
            getById(gs, 7).relationships[0] = 0.9;
            getById(gs, 0).relationships[7] = 0.9;
            getById(gs, 8).relationships[0] = -0.6;
            getById(gs, 0).relationships[8] = -0.6;
            seedRng("roundtable");
            const lines = roundtable(gs, [], jury, [0, 7, 8], [1, 2], { 0: "bitter", 7: "bitter", 8: "bitter" }, argue ? [{ byId: 0, forId: 2 }] : [], [7, 8]);
            const sway = (j: number) => (jury.sway[j] && jury.sway[j][2]) || 0;
            return { lines, friend: sway(7), foe: sway(8) };
        };
        const withArgument = run(true);
        const without = run(false);
        expect(withArgument.lines.some((l) => l.includes("argued for HG2"))).toBe(true);
        const onFriend = withArgument.friend - without.friend;
        const onFoe = withArgument.foe - without.foe;
        expect(onFriend).toBeGreaterThan(0.05);
        expect(onFriend).toBeGreaterThan(onFoe);
    });

    it("an eviction leaves the juror with grudges: who nominated them, and who lied", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        const gs = new MutableGameState(controller.gameState);
        getById(gs, 4).isEvicted = true;
        getById(gs, 4).isJury = true;
        controller.state.gameState = new GameState(gs);
        pledge(controller.ledger, "vote", 0, 4, controller.gameState.phase).status = "broken";
        (controller as any).recordEvictionGrudges([4], 3, { 0: 4, 5: 4, 6: 2 }, [{ hohId: 3, toId: 4, believed: true }], "put me on the block");
        const view = controller.juryView(0);
        expect(view.find((v) => v.juror.id === 4)!.reasons).toContain("broke a promise to me");
        expect(controller.juryBook.grudges[4][3].reasons).toEqual(expect.arrayContaining(["put me on the block", "told me I wasn't the target"]));
        // the player who voted them out gets to send a goodbye message
        expect(controller.state.week.goodbyes).toEqual([{ playerId: 0, evictedId: 4 }]);
    });

    it("full seasons hold a jury roundtable, send goodbye messages, and explain the jury's votes", () => {
        let roundtables = 0;
        let goodbyes = 0;
        for (let id = 0; id < 4; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(10), [id]));
            controller.state.seed = 700 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            for (let guard = 0; guard < 4000; guard++) {
                const p = prompt as Prompt | null;
                if (!p) break;
                if (p.kind === "scene" && p.scene.title === "Jury Roundtable") roundtables++;
                if (p.kind === "speech" && p.title.startsWith("Goodbye message")) goodbyes++;
                if (p.kind === "gameOver") {
                    expect(renderToStaticMarkup(p.content)).toContain("Why the jury voted");
                    break;
                }
                answer(controller, p, "random", "random");
            }
        }
        expect(roundtables).toBe(4);
        expect(goodbyes).toBeGreaterThan(0);
    }, 20000); // four whole seasons
});

describe("final two speeches and jury questions", () => {
    function setup() {
        const gs = new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
        const jury = emptyJury();
        addGrudge(jury, 7, 1, -0.5, "told me I wasn't the target");
        addGrudge(jury, 8, 1, -0.4, "(heard from HG7) told me I wasn't the target");
        addGrudge(jury, 9, 1, -0.3, "put me on the block");
        getById(gs, 1).hohWins = 2;
        return { gs, jury };
    }

    it("lists the moves the jury holds against a finalist, and the game they can take credit for", () => {
        const { gs, jury } = setup();
        const moves = movesFor(gs, [], jury, 1, [7, 8, 9]);
        const pawn = moves.find((m) => m.id === "grudge:told me I wasn't the target")!;
        expect(pawn.text).toBe("Telling HG7 and HG8 they weren't the target");
        expect(pawn.jurorIds).toEqual([7, 8]);
        expect(moves.find((m) => m.id === "grudge:put me on the block")!.text).toBe("Nominating HG9");
        expect(moves.find((m) => m.id === "credit:comps")!.text).toBe("Winning 2 comps");
    });

    it("owning a move earns respect; dodging it costs you with the jurors it was done to", () => {
        const { gs, jury } = setup();
        const moves = movesFor(gs, [], jury, 1, [7, 8, 9]);
        const types: any = { 7: "objective", 8: "bitter", 9: "objective" };
        giveSpeech(gs, jury, 1, moves, ["grudge:told me I wasn't the target"], types, [7, 8, 9]);
        expect(jury.sway[7][1]).toBeGreaterThan(0); // objective: respect for owning it
        expect(jury.grudges[8][1].reasons).toContain("owned up to it in their speech"); // bitter: softened
        expect(jury.sway[9][1]).toBeLessThan(0); // dodged the nomination
    });

    it("jurors ask about what they hold against you; how you answer depends on who's asking", () => {
        const { gs, jury } = setup();
        seedRng("questions");
        const qs = juryQuestions(gs, jury, [1, 2], [7, 8, 9]);
        const q7 = qs.find((q) => q.jurorId === 7)!;
        expect(q7.finalistId).toBe(1);
        expect(q7.question).toContain("wasn't the target");
        expect(qs.find((q) => q.jurorId === 8)!.secondhand).toBe(true);
        // every juror questions both finalists
        [7, 8, 9].forEach((j) => expect(qs.filter((q) => q.jurorId === j).map((q) => q.finalistId).sort()).toEqual([1, 2]));
        const effect = (type: any, a: any) => {
            const j = emptyJury();
            answerJuror(gs, j, q7, a, type);
            return j.sway[7][1];
        };
        expect(effect("objective", "own")).toBeGreaterThan(effect("objective", "sorry"));
        expect(effect("bitter", "sorry")).toBeGreaterThan(effect("bitter", "own"));
        expect(effect("objective", "deny")).toBeLessThan(0);
        expect(effect("bitter", "deny")).toBeLessThan(0);
    });

    it("player finalists give a speech and answer questions; every season ends with the votes read one at a time", () => {
        let spoke = false;
        let asked = false;
        // reaching the final two isn't guaranteed in any one season, so play until it happens
        for (let id = 0; id < 24 && !(spoke && asked); id++) {
            const { seen, scenes, controller } = playSeason(10, [id % 10], "random", true);
            if (!seen.has("juryReveal") || !scenes.has("Final Two"))
                throw new Error(`season ${id}: reveal ${seen.has("juryReveal")}, final two ${scenes.has("Final Two")}, scenes ${Array.from(scenes).join(" | ")}, step ${controller.state.step}`);
            if (seen.has("ownMoves")) spoke = true;
            if (seen.has("juryQuestion")) asked = true;
        }
        expect(spoke).toBe(true);
        expect(asked).toBe(true);
    });
});

describe("relationships are secret in player mode", () => {
    const { secretRelationships$, selectedPlayer$ } = require("../subjects/subjects");
    const { selectPlayer } = require("../components/playerPortrait/selectedPortrait");
    const { generatePopularitySubtitle } = require("../components/playerPortrait/subtitle");

    afterEach(() => secretRelationships$.next(false));

    it("classic views hide popularity and friend counts, and clicking a face reveals nothing", () => {
        const hero = { id: 1, name: "HG1", imageURL: "", popularity: 0.42, friends: 3, enemies: 1, targetingMe: 0, hohWins: 1, povWins: 0 };
        const shown = renderToStaticMarkup(<div>{generatePopularitySubtitle(hero, { popularity: 0.42 }, true)}</div>);
        expect(shown).toContain("42");
        secretRelationships$.next(true);
        const hidden = renderToStaticMarkup(<div>{generatePopularitySubtitle(hero, { popularity: 0.42 }, true)}</div>);
        expect(hidden).not.toContain("42");
        expect(hidden).not.toMatch(/❤|💔|👊|friend/i);
        selectPlayer({ id: 2, name: "HG2", popularity: 0, relationships: { 1: 0.9 }, isEvicted: false });
        expect(selectedPlayer$.value).toBeNull();
    });

    it("clicking a houseguest opens what you know about them: overheard alliances go in each member's file", () => {
        const { knownProfile$ } = require("../subjects/subjects");
        const { KnownProfileCard } = require("./ui/knownProfile");
        secretRelationships$.next(true);
        selectPlayer({ id: 4, name: "HG4", popularity: 0, relationships: { 1: 0.9 }, isEvicted: false });
        expect(knownProfile$.value).toBe(4);
        expect(selectedPlayer$.value).toBeNull();
        selectPlayer({ id: 4, name: "HG4", popularity: 0, relationships: { 1: 0.9 }, isEvicted: false });
        expect(knownProfile$.value).toBeNull(); // clicking again closes it

        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        const gs = controller.gameState;
        const a = createAlliance(new MutableGameState(gs), controller.book, [3, 4, 5], "The Vault");
        a.target = 7;
        a.targetWeek = gs.phase;
        controller.overheardBy(0).push(a.id);
        (controller as any).noteOverheard(gs, 0, a.id);
        [3, 4, 5].forEach((m) => {
            const notes = controller.intelOn(0, m).map((n) => n.text);
            expect(notes.some((t) => t.includes("The Vault"))).toBe(true);
            expect(notes.some((t) => t.includes("going after HG7"))).toBe(true);
        });
        expect(controller.intelOn(0, 7)[0].text).toContain("going after them");
        expect(controller.intelOn(0, 6)).toEqual([]);

        const card = renderToStaticMarkup(<KnownProfileCard controller={controller} viewerId={0} otherId={4} onClose={() => undefined} />);
        expect(card).toContain("The Vault");
        expect(card).toContain("HG3");
        expect(card).toContain("No read yet");
        // no peeking at real relationships: someone you know nothing about has an empty file
        const blank = renderToStaticMarkup(<KnownProfileCard controller={controller} viewerId={0} otherId={8} onClose={() => undefined} />);
        expect(blank).toContain("Nothing you know of");
        expect(blank).not.toContain("The Vault");
    });

    it("starting a player mode season turns secrecy on; the end of the season turns it off", () => {
        const { activatePlayerMode } = require("./playerModeController");
        const controller = new PlayerModeController(newPlayerSave(newGame(6), [0]));
        activatePlayerMode(controller, () => <div />);
        expect(secretRelationships$.value).toBe(true);
        const { playerModeScreen$ } = require("../subjects/subjects");
        playerModeScreen$.next(null);
        expect(secretRelationships$.value).toBe(false);
    });

    it("reads come from talking: people who approach you, people you deal with, and bots who nominate you", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        expect(controller.readOf(0, 3)).toBeNull();
        controller.state.socialTurn = 0;
        controller.socialAct({ kind: "chat", botId: 3 });
        expect(controller.readOf(0, 3)).not.toBeNull();
        expect(controller.trustReadOf(0, 3)).toBeNull(); // a chat doesn't tell you whether they believe you
        controller.socialAct({ kind: "final2", botId: 3 });
        expect(controller.trustReadOf(0, 3)).not.toBeNull();
        // a read is how they act (masked), not the truth
        controller.state.personalities = { 4: "mastermind" };
        getById(controller.gameState, 0).relationships[4] = -0.9;
        getById(controller.gameState, 4).relationships[0] = -0.9;
        controller.noteRead(0, 4);
        expect(controller.readOf(0, 4)!.label).not.toBe("Enemy");
        // no reads on players, or on yourself
        controller.noteRead(0, 0);
        expect(controller.readOf(0, 0)).toBeNull();
    });
});

describe("alliances and the block", () => {
    function house(): MutableGameState {
        return new MutableGameState(prepareNextWeek(newGame(10), BigBrotherVanilla));
    }

    it("alliances have no size limit", () => {
        const { proposeAlliance } = require("./social/alliances");
        let joined = false;
        for (let seed = 0; seed < 40 && !joined; seed++) {
            const gs = house();
            const book = emptyBook();
            const a = createAlliance(gs, book, [0, 1, 2, 3, 4, 5, 6], "Majority");
            getById(gs, 7).relationships[0] = 0.9;
            getById(gs, 0).relationships[7] = 0.9;
            seedRng(`big:${seed}`);
            const out = proposeAlliance(gs, book, 0, 7, { allianceId: a.id });
            expect(out.text).not.toContain("as big as it can get");
            if (a.memberIds.includes(7)) joined = true;
        }
        expect(joined).toBe(true);
    });

    it("after the veto, alliance targets come from the block, even if that means one of their own", () => {
        const { botSuggestion, holdMeeting } = require("./social/alliances");
        const gs = house();
        const book = emptyBook();
        const a = createAlliance(gs, book, [1, 2, 3], "The Vault");
        // before the veto: anyone outside the alliance
        expect([1, 2, 3]).not.toContain(botSuggestion(gs, a, 1));
        // after it, HG2 and HG5 are on the block: HG1 goes after HG5 (not an ally), whoever else they dislike
        getById(gs, 1).relationships[4] = -0.9;
        expect(botSuggestion(gs, a, 1, [2, 5])).toBe(5);
        // both nominees are allies: one of them it is
        expect([2, 3]).toContain(botSuggestion(gs, a, 1, [2, 3]));
        // a nominee suggests the other nominee
        expect(botSuggestion(gs, a, 2, [2, 5])).toBe(5);
        seedRng("meeting");
        const result = holdMeeting(gs, a, [], [2, 5]);
        expect([2, 5]).toContain(result.targetId);
    });

    it("alliances pick a plan B, and switch to it when the target comes off the block", () => {
        const { fallBackToPlanB } = require("./social/alliances");
        const gs = house();
        const book = emptyBook();
        const a = createAlliance(gs, book, [1, 2, 3], "The Vault");
        a.suggestions[1] = 6;
        a.backupSuggestions = { 1: 7 };
        seedRng("planb");
        const result = holdMeeting(gs, a, [1]);
        expect(result.targetId).not.toBeNull();
        expect(a.backup).toBeDefined();
        expect(a.backup).not.toBe(a.target);
        expect(result.lines.some((l) => l.includes("Plan B"))).toBe(true);
        // the target won the veto: the block is plan B and someone else
        const target = a.target!;
        const planB = a.backup!;
        const other = [4, 5, 6, 7, 8].find((id) => id !== target && id !== planB)!;
        const switched = fallBackToPlanB(gs, book, [planB, other]);
        expect(switched).toEqual([{ alliance: a, from: target, to: planB }]);
        expect(a.target).toBe(planB);
        // still on the block: nothing changes
        expect(fallBackToPlanB(gs, book, [planB, other])).toEqual([]);
        // a bot HoH naming a replacement goes for plan B
        a.target = target;
        a.backup = planB;
        a.targetWeek = gs.phase;
        const options = [planB, other].map((id) => getById(gs, id));
        getById(gs, 1).relationships[other] = -0.9;
        expect(botNominate(gs, book, getById(gs, 1), options, 1).picks[0].id).toBe(planB);
    });

    it("the controller tells the alliance when plan B kicks in", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        const a = createAlliance(new MutableGameState(controller.gameState), controller.book, [0, 3], "Duo");
        a.target = 5;
        a.backup = 6;
        a.targetWeek = controller.gameState.phase;
        controller.state.week.blockbuster = true;
        controller.state.week.nomineeIds = [6, 7];
        (controller as any).planB();
        expect(a.target).toBe(6);
        expect(controller.state.news[0].some((n: string) => n.includes("plan B"))).toBe(true);
    });

    it("plan B only applies in Blockbuster weeks", () => {
        const gs = house();
        const book = emptyBook();
        const a = createAlliance(gs, book, [1, 2, 3], "The Vault");
        a.suggestions[1] = 6;
        a.backupSuggestions = { 1: 7 };
        seedRng("planb");
        const result = holdMeeting(gs, a, [1], undefined, [], false);
        expect(result.targetId).not.toBeNull();
        expect(a.backup).toBeUndefined();
        expect(result.lines.some((l) => l.includes("Plan B"))).toBe(false);
        // a leftover plan B doesn't kick in outside a Blockbuster week
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        const b = createAlliance(new MutableGameState(controller.gameState), controller.book, [0, 3], "Duo");
        b.target = 5;
        b.backup = 6;
        b.targetWeek = controller.gameState.phase;
        controller.state.week.blockbuster = false;
        controller.state.week.nomineeIds = [6, 7];
        (controller as any).planB();
        expect(b.target).toBe(5);
        expect(controller.planBWeek).toBe(false);
    });

    it("alliances convene after the HoH comp, before nominations; the new HoH can't be the target", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        const a = createAlliance(new MutableGameState(controller.gameState), controller.book, [0, 3, 4], "Trio");
        controller.state.week.hohId = 5;
        controller.state.step = Step.AllianceHoh;
        (controller as any).run();
        const p = prompt as any;
        // a private handoff in pass-and-play goes straight through for one player
        const shown = p.kind === "handoff" ? (p.next(), prompt as any) : p;
        expect(shown.kind).toBe("alliance");
        expect(shown.blockName).toContain("Before nominations");
        expect(controller.targetExclude()).toEqual([5]);
        // HG3 and HG4 never suggest the HoH
        expect(require("./social/alliances").botSuggestion(controller.gameState, a, 3, undefined, [5])).not.toBe(5);
        controller.allianceSuggest(a.id, 6);
        expect(a.target).toBeDefined();
        expect(a.target).not.toBe(5);
        controller.endAlliance();
        expect(controller.state.step).toBe(Step.HohRoom);
        expect(a.met).toBe(false); // they can meet again later in the week
    });

    it("a split alliance meeting can be talked out", () => {
        const { discussTarget, meetingSplit, positionsOf } = require("./social/alliances");
        let won = 0;
        for (let seed = 0; seed < 40; seed++) {
            const gs = house();
            const book = emptyBook();
            const a = createAlliance(gs, book, [0, 1, 2], "The Vault");
            [1, 2].forEach((b) => {
                getById(gs, b).relationships[0] = 0.8;
                getById(gs, 0).relationships[b] = 0.8;
            });
            a.met = true;
            a.target = 6;
            a.targetWeek = gs.phase;
            a.positions = { 0: 7, 1: 6, 2: 6 };
            a.discussed = false;
            expect(meetingSplit(gs, a)).toBe(true);
            expect(positionsOf(gs, a)[0]).toEqual({ targetId: 6, memberIds: [1, 2] });
            seedRng(`talk:${seed}`);
            const result = discussTarget(gs, a, 0, [0], { kind: "argue", targetId: 7 });
            expect(result.lines.length).toBeGreaterThan(0);
            expect(meetingSplit(gs, a)).toBe(false); // once per meeting
            if (a.target === 7) won++;
        }
        expect(won).toBeGreaterThan(3); // liked and persuasive: sometimes you turn the room
        // going along with it unites the alliance
        const gs = house();
        const a = createAlliance(gs, emptyBook(), [0, 1], "Duo");
        a.met = true;
        a.target = 6;
        a.positions = { 0: 7, 1: 6 };
        const chem = a.chemistry;
        const result = discussTarget(gs, a, 0, [0], { kind: "concede" });
        expect(a.target).toBe(6);
        expect(a.chemistry).toBeGreaterThan(chem);
        expect(result.lines.join(" ")).toContain("united");
    });

    it("the controller only applies the block once the veto ceremony is done", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(10), BigBrotherVanilla), [0]));
        controller.state.week.nomineeIds = [2, 5];
        controller.state.step = Step.SocialAfternoon;
        expect(controller.targetBlock()).toBeUndefined();
        controller.state.step = Step.SocialCampaign;
        expect(controller.targetBlock()).toEqual([2, 5]);
    });
});

describe("watching comps you're not in", () => {
    it("the Veto winner gets their own moment", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(8), BigBrotherVanilla), [0]));
        const p = (id: number) => controller.player(id);
        const scene = (controller as any).vetoWinnerScene([p(1), p(2), p(3)], p(2), [p(2), p(4)], p(1));
        const html = renderToStaticMarkup(scene.content);
        expect(html).toContain("The Veto goes to");
        expect(html).toContain("HG2");
        expect(html).toContain("save themselves");
        expect(html).toContain("Also played: HG1 and HG3");
    });

    it("a comp without players still shows the results, to watch", () => {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(8), BigBrotherVanilla), [0]));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        const bots = nonEvictedHouseguests(controller.gameState).filter((hg) => hg.id !== 0);
        let winner = -1;
        (controller as any).runComp("Veto Competition", WEEKLY_COMPS[0], bots.slice(0, 6), (id: number) => (winner = id));
        const p = prompt as unknown as Extract<Prompt, { kind: "compResults" }>;
        expect(p.kind).toBe("compResults");
        expect(p.spectating).toBe(true);
        expect(winner).toBe(-1); // nothing happens until they've watched it
        p.onDone(-1);
        // a tie for first plays out a tiebreaker, to watch as well
        for (let guard = 0; guard < 20 && winner < 0; guard++) {
            const next = prompt as unknown as Prompt;
            if (next.kind === "hideResults") next.onDone();
            else if (next.kind === "handoff") next.next();
            else break;
        }
        expect(bots.map((b) => b.id)).toContain(winner);
    });
});

describe("secret powers", () => {
    const { ALL_POWERS, schedulePowers, surprisePowers } = require("./social/powers");
    const { generateEvictionScene } = require("../components/episode/scenes/evictionScene");

    // A controller at the start of a week, with some powers handed out by hand.
    function withPowers(slots: any[], n: number = 10) {
        const controller = new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(n), BigBrotherVanilla), [0]));
        controller.state.powers = { enabled: slots.map((sl) => sl.id), slots };
        controller.state.personalities = {};
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        return { controller, prompt: () => prompt as unknown as Prompt };
    }

    it("are scheduled between week 2 and the end of the season; a surprise is two to four of them", () => {
        const plan = schedulePowers(ALL_POWERS, 13, seededRand(3));
        expect(plan.slots.map((sl: any) => sl.id).sort()).toEqual([...ALL_POWERS].sort());
        plan.slots.forEach((sl: any) => {
            expect(sl.week).toBeGreaterThanOrEqual(2);
            expect(sl.week).toBeLessThanOrEqual(10);
        });
        for (let seed = 1; seed < 30; seed++) {
            const picked = surprisePowers(seededRand(seed));
            expect(picked.length).toBeGreaterThanOrEqual(2);
            expect(picked.length).toBeLessThanOrEqual(4);
            expect(new Set(picked).size).toBe(picked.length);
        }
        // a new season with no powers chosen has none
        expect(newPlayerSave(newGame(8), [0]).powers!.slots).toEqual([]);
        expect(newPlayerSave(newGame(8), [0], undefined, false, { powers: "surprise" }).powers!.slots.length).toBeGreaterThanOrEqual(2);
    });

    it("seasons with every power play through, and the powers get handed out and used", () => {
        let handedOut = 0;
        let used = 0;
        for (let id = 0; id < 4; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(12), [id], undefined, false, { powers: ALL_POWERS }));
            controller.state.seed = 4000 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            for (let guard = 0; guard < 6000; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                answer(controller, p, "random", "random");
            }
            expect((prompt as unknown as Prompt).kind).toBe("gameOver");
            const slots = controller.state.powers!.slots;
            // the Battle Back brings someone back: one more eviction
            const back = slots.some((sl) => sl.id === "battleBack" && sl.used);
            expect(controller.state.history.length).toBe(12 - 3 + (back ? 1 : 0));
            handedOut += slots.filter((sl) => sl.holderId !== undefined).length;
            used += slots.filter((sl) => sl.used).length;
        }
        expect(handedOut).toBeGreaterThan(8);
        expect(used).toBeGreaterThan(2);
    });

    it("Hidden Immunity: a nominee plays it, and whoever nominated them picks again", () => {
        const { controller } = withPowers([{ id: "immunity", week: 1, holderId: 4 }]);
        controller.state.week.hohId = 3;
        let final: number[] = [];
        let notes: string[] = [];
        (controller as any).immunityCheck(
            [4, 5],
            (_i: number, exclude: number[], cb: (id: number) => void) => {
                expect(exclude).toContain(4);
                cb(6);
            },
            (f: number[], n: string[]) => {
                final = f;
                notes = n;
            }
        );
        expect(final).toEqual([6, 5]);
        expect(notes[0]).toContain("played Hidden Immunity");
        expect(controller.state.powers!.slots[0].used).toBe(true);
    });

    it("Ghost Swap: a bot on the block swaps itself out for someone it dislikes, anonymously", () => {
        const { controller } = withPowers([{ id: "ghostSwap", week: 1, holderId: 7 }]);
        controller.state.week.hohId = 3;
        controller.state.week.nomineeIds = [2, 7];
        let continued = false;
        (controller as any).ghostSwap(controller.state.powers!.slots[0], () => (continued = true));
        expect(continued).toBe(true);
        const noms = controller.state.week.nomineeIds!;
        expect(noms).toContain(2);
        expect(noms).not.toContain(7);
        expect(noms).not.toContain(3);
        expect(controller.state.week.ghostBy).toBe(7);
        expect(controller.state.announce![0].lines.join(" ")).toContain("Nobody knows");
        expect(controller.state.announce![0].lines.join(" ")).not.toContain(controller.player(7).name + " used");
    });

    it("Overthrow: a bot whose ally is on the block dethrones the HoH and names new nominees", () => {
        const { controller } = withPowers([{ id: "overthrow", week: 1, holderId: 7 }]);
        const gs = new MutableGameState(controller.gameState);
        createAlliance(gs, controller.state.book, [7, 2], "Pair");
        controller.state.gameState = new GameState(gs);
        controller.state.week.hohId = 3;
        controller.state.week.nomineeIds = [2, 5];
        (controller as any).overthrow(controller.state.powers!.slots[0], () => undefined);
        const noms = controller.state.week.nomineeIds!;
        expect(noms.length).toBe(2);
        expect(noms).not.toContain(2);
        expect(noms).not.toContain(3);
        expect(noms).not.toContain(7);
        expect(controller.state.week.overthrowBy).toBe(7);
        expect(controller.state.announce![0].lines[0]).toContain(`${controller.player(7).name} used the Overthrow`);
    });

    it("Extra Vote and Vote Nullifier change the count, and the eviction follows the new count", () => {
        const { controller } = withPowers([
            { id: "extraVote", week: 1, holderId: 5 },
            { id: "nullifier", week: 1, holderId: 2 },
        ]);
        controller.state.week.hohId = 3;
        getById(controller.gameState, 5).relationships[1] = -0.9; // HG5 really wants HG1 out
        const noms = [1, 2].map((id) => controller.player(id));
        const votes = { 4: 2, 5: 1, 6: 2, 7: 1 };
        const adjust: any = {};
        const notes: string[] = [];
        let done = false;
        (controller as any).votePowers(noms, votes, adjust, notes, () => (done = true));
        expect(done).toBe(true);
        expect(adjust[1]).toBe(1); // the extra vote against HG1
        expect(adjust[2]).toBe(-1); // HG2 (on the block) nullified a vote against themselves
        expect(notes.length).toBe(2);
        // the scene counts the adjusted votes: 3 to evict HG1, 1 to evict HG2
        const [gs] = generateEvictionScene(controller.gameState, [controller.player(3)], noms, {
            votingTo: "Evict",
            forcedVotes: votes,
            hideVoters: true,
            voteAdjustments: adjust,
        });
        expect(getById(gs, 1).isEvicted).toBe(true);
        expect(getById(gs, 2).isEvicted).toBe(false);
    });

    it("Secret Head of House: only the HoH knows who it is; results are sealed", () => {
        const { controller } = withPowers([]);
        controller.state.week.secretHoh = true;
        controller.state.week.hohId = 3;
        controller.state.week.nomineeIds = [1, 2];
        expect(controller.publicHohId(0)).toBeUndefined();
        expect(controller.publicHohId(3)).toBe(3);
        expect(controller.voters().map((v) => v.id)).toContain(3); // looks like any other voter
        controller.state.step = Step.Hoh;
        expect((controller as any).sealed()).toBe(true);
        controller.state.step = Step.Veto;
        expect((controller as any).sealed()).toBe(false);
    });

    it("a secret-HoH season never names the HoH at the ceremonies that week, and the audience names a nominee", () => {
        let secretWeeks = 0;
        let audienceWeeks = 0;
        for (let id = 0; id < 3; id++) {
            const controller = new PlayerModeController(newPlayerSave(newGame(10), [id], undefined, false, { powers: ["secretHoh", "audience"] }));
            controller.state.seed = 5000 + id;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            for (let guard = 0; guard < 5000; guard++) {
                const p = prompt as Prompt | null;
                if (!p || p.kind === "gameOver") break;
                if (p.kind === "scene" && p.scene.title === "Nomination Ceremony") {
                    const html = renderToStaticMarkup(p.scene.render);
                    if (controller.state.week.secretHoh) {
                        secretWeeks++;
                        const hoh = controller.player(controller.state.week.hohId!).name;
                        expect(html).toContain("secret");
                        expect(html).not.toContain(`${hoh} has nominated`);
                    }
                    if (controller.state.week.audienceNominee) {
                        audienceWeeks++;
                        expect(html).toContain("audience nominee");
                    }
                }
                if (p.kind === "compResults" && controller.state.week.secretHoh && controller.state.step === Step.Hoh) expect(p.sealed).toBe(true);
                answer(controller, p, "random", "random");
            }
        }
        expect(secretWeeks).toBe(3);
        expect(audienceWeeks).toBe(3);
    });
});

describe("live feed, host and difficulty", () => {
    const { houseFeed } = require("./social/feed");
    const { previouslyOn } = require("./social/narration");

    it("the feed follows the bots, and never names a secret HoH", () => {
        const gs = prepareNextWeek(newGame(10), BigBrotherVanilla);
        for (let seed = 1; seed < 30; seed++) {
            const lines: string[] = houseFeed(gs, { humanIds: [0], hohId: 3, secretHoh: true, nomineeIds: [1, 2], showmances: [], personalities: { 4: "villain" } }, seededRand(seed));
            expect(lines.length).toBeGreaterThan(0);
            lines.forEach((line) => {
                expect(line).not.toContain("HG0 "); // the player's moves are their own
                expect(line).not.toContain("HoH room");
            });
        }
        const open: string[] = [];
        for (let seed = 1; seed < 30; seed++)
            open.push(...houseFeed(gs, { humanIds: [0], hohId: 3, secretHoh: false, nomineeIds: [], showmances: [], personalities: {} }, seededRand(seed)));
        expect(open.some((l) => l.includes("HG3 is up in the HoH room"))).toBe(true);
    });

    it("the host recaps last week (and reveals a secret HoH)", () => {
        const gs = prepareNextWeek(newGame(10), BigBrotherVanilla);
        const last = { week: 1, hohId: 3, nomineeIds: [1, 2], povId: 4, evictedIds: [1] };
        const lines = previouslyOn(gs, last, []);
        expect(lines[0]).toContain("Previously on The Houseguests");
        expect(lines.join(" ")).toContain("HG3 won Head of House");
        expect(lines.join(" ")).toContain("HG1 walked out the door");
        expect(previouslyOn(gs, last, [], "HG3").join(" ")).toContain("it was HG3");
    });

    it("difficulty changes how well bots play comps, and how strategically they play", () => {
        const make = (difficulty: any) => {
            const c = new PlayerModeController(newPlayerSave(newGame(8), [0], undefined, false, { difficulty }));
            return c;
        };
        const hg = getById(make("normal").gameState, 3);
        const avg = (difficulty: any) => {
            const c = make(difficulty);
            rng().seed(7);
            let total = 0;
            for (let i = 0; i < 400; i++) total += (c as any).botSkill(hg);
            return total / 400;
        };
        expect(avg("easy")).toBeLessThan(avg("normal"));
        expect(avg("normal")).toBeLessThan(avg("hard"));
        expect((make("hard") as any).strategy().threatNom).toBeGreaterThan((make("easy") as any).strategy().threatNom);
        expect((make("easy") as any).strategy().gut).toBeGreaterThan(0);
        expect((make("hard") as any).strategy().gut).toBe(0);
    });
});

describe("season awards", () => {
    const { seasonStats, seasonAwards } = require("./social/awards");

    it("every season ends with stats, awards and placements", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(8), [0], undefined, false, { powers: ["overthrow", "immunity"] }));
        controller.state.seed = 77;
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        for (let guard = 0; guard < 4000; guard++) {
            const p = prompt as Prompt | null;
            if (!p) break;
            if (p.kind === "gameOver") {
                const html = renderToStaticMarkup(p.content);
                expect(html).toContain("Season awards");
                expect(html).toContain("Season stats");
                expect(html).toContain("secret powers");
                break;
            }
            answer(controller, p, "random", "random");
        }
        const gs = controller.gameState;
        const stats = seasonStats(gs, controller.state.history);
        expect(stats.map((r: any) => r.placement).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        const awards = seasonAwards(gs, controller.state.history, controller.state.moves || [], controller.state.ledger);
        expect(awards.length).toBeGreaterThan(2);
    });

    it("the biggest move and the biggest backstab go to the heaviest ones", () => {
        const gs = prepareNextWeek(newGame(8), BigBrotherVanilla);
        const moves = [
            { week: 1, kind: "move", actorId: 1, text: "small", weight: 1 },
            { week: 2, kind: "move", actorId: 2, text: "HG2 used the Overthrow", weight: 5 },
            { week: 3, kind: "backstab", actorId: 3, text: "HG3 turned on alliance mate HG4", weight: 3 },
        ];
        const awards = seasonAwards(gs, [], moves, undefined);
        expect(awards.find((a: any) => a.title === "Biggest Move").winnerId).toBe(2);
        expect(awards.find((a: any) => a.title === "Biggest Backstab").winnerId).toBe(3);
    });
});
