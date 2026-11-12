// Shared by the player mode tests: a test cast, and an automatic player that answers any prompt.
import { GameState, nonEvictedHouseguests, PlayerProfile } from "../model";
import { PlayerModeController, Prompt, Step } from "./playerModeController";
import { rankResults } from "./comps/compRunner";
import { Rand, seededRand } from "./comps/random";

export function cast(n: number): PlayerProfile[] {
    return Array.from({ length: n }, (_, i) => ({
        name: `HG${i}`,
        imageURL: "",
        social: (i % 10) + 1,
        comp: ((i * 3) % 10) + 1,
    }));
}

export function newGame(n: number): GameState {
    return new GameState({ players: cast(n), jury: n >= 8 ? 5 : 3 });
}

export type Strategy = "first" | "random";

// Answers whatever the controller is asking, automatically.
// The automatic player's "random" choices are seeded by the season, so a test plays the same season every run
// (they used Math.random, and a test could pass alone and fail in the full run).
const rands = new WeakMap<PlayerModeController, Rand>();
function randFor(controller: PlayerModeController): Rand {
    let r = rands.get(controller);
    if (!r) {
        r = seededRand((controller.state.seed * 31 + 17) >>> 0);
        rands.set(controller, r);
    }
    return r;
}

export function answer(controller: PlayerModeController, p: Prompt, strategy: Strategy, humansWin: boolean | "random") {
    const random = randFor(controller);
    const pick = <T,>(arr: T[]): T => (strategy === "first" ? arr[0] : arr[Math.floor(random() * arr.length)]);
    if (p.kind === "scene") controller.continue();
    else if (p.kind === "handoff") p.next();
    else if (p.kind === "social") {
        const me = controller.socialActor;
        // answer whoever came to talk
        while (controller.approachesFor(me.id).length > 0) controller.respondApproach(0, random() < 0.6);
        const week = controller.state.week;
        const noms = week.nomineeIds || [];
        if (controller.state.step === Step.SocialCampaign) controller.voters().forEach((v) => controller.askVote(v.id));
        for (let i = 0; i < 3; i++) {
            const others = nonEvictedHouseguests(controller.gameState).filter((hg) => hg.id !== me.id);
            if (others.length === 0) break;
            const other = pick(others);
            const deal = random() < 0.4 && !controller.isHuman(other) ? pick(["final2", "voteDeal", "pity", "tellVote", "tellTarget"]) : null;
            if (deal === "final2" || ((deal === "voteDeal" || deal === "pity") && noms.includes(me.id))) {
                controller.socialAct({ kind: deal as any, botId: other.id });
                continue;
            }
            const about = noms.filter((id) => id !== other.id);
            if (deal === "tellVote" && about.length > 0 && me.id !== week.hohId && !noms.includes(me.id)) {
                controller.socialAct({ kind: "tellVote", botId: other.id, targetId: pick(about) });
                continue;
            }
            if (deal === "tellTarget" && me.id === week.hohId && about.length > 0) {
                controller.socialAct({ kind: "tellTarget", botId: other.id, targetId: pick(about) });
                continue;
            }
            const target = others.find((b) => b.id !== other.id);
            const kind = controller.isHuman(other) ? "alliance" : target ? ["chat", "alliance", "pitch"][i % 3] : "chat";
            const action: any =
                kind === "pitch"
                    ? { kind, botId: other.id, targetId: target!.id, reason: pick(["comps", "social", "relationship", "personal"]) }
                    : kind === "alliance"
                    ? { kind, botId: other.id, name: `Team ${me.id}-${other.id}` }
                    : { kind, botId: other.id };
            controller.socialAct(action);
        }
        controller.endSocial();
    } else if (p.kind === "alliance") {
        const me = controller.socialActor;
        controller.alliancesOf(me.id).forEach((a) => {
            const outsiders = nonEvictedHouseguests(controller.gameState).filter((hg) => !a.memberIds.includes(hg.id));
            if (random() < 0.05 && outsiders.length > 0) controller.leak(a.id, pick(outsiders).id);
            else controller.allianceSuggest(a.id, outsiders.length > 0 ? pick(outsiders).id : null);
        });
        controller.endAlliance();
    } else if (p.kind === "hohVisit") {
        const others = nonEvictedHouseguests(controller.gameState).filter(
            (hg) => hg.id !== p.actorId && hg.id !== controller.room!.hohId
        );
        const pitches: any[] = [null, { kind: "plea" }, { kind: "deal" }];
        if (others.length > 0) pitches.push({ kind: "target", targetId: pick(others).id });
        controller.hohVisit(p.actorId, strategy === "first" ? pitches[1] : pick(pitches));
        controller.continue();
    } else if (p.kind === "hohRoom") {
        const room = controller.room!;
        while (room.index < room.visitors.length) controller.hohAnswer(random() < 0.6);
        controller.endHohRoom();
    } else if (p.kind === "speech") {
        const tone = pick(p.tones);
        const ids = tone.pick ? tone.pick.options.slice(0, tone.pick.max).map((o) => o.id) : [];
        expect(p.deliver(tone.id, ids).length).toBeGreaterThan(0);
        p.next();
    } else if (p.kind === "ownMoves") {
        p.onDone(p.moves.filter(() => random() < 0.5).map((m) => m.id));
    } else if (p.kind === "juryQuestion") {
        p.onAnswer(pick(["own", "sorry", "deny"]) as any);
    } else if (p.kind === "juryReveal") {
        p.onDone();
    } else if (p.kind === "knockout") {
        p.onDone();
    } else if (p.kind === "winePour") {
        p.onPour({ offerTainted: random() < 0.5, claim: pick<"clean" | "tainted" | "none">(["clean", "tainted", "none"]) });
    } else if (p.kind === "wineDrink") {
        p.onDecide(random() < 0.5);
    } else if (p.kind === "tiebreak") {
        p.onGuess(Math.floor(random() * 200));
    } else if (p.kind === "tiebreakResults") {
        p.onDone();
    } else if (p.kind === "memoryDuel") {
        if (p.onDone) p.onDone();
        else {
            const free = p.deck.map((_, i) => i).filter((i) => p.matched[i] === undefined && !p.open.includes(i));
            // humans who win: they know where every card is
            const twin = p.open.length ? free.find((i) => p.deck[i] === p.deck[p.open[0]]) : undefined;
            // humans who lose: never make a pair
            const misses = free.filter((i) => !p.open.length || p.deck[i] !== p.deck[p.open[0]]);
            const best =
                humansWin === true && twin !== undefined
                    ? twin
                    : humansWin === false && misses.length
                    ? misses[Math.floor(random() * misses.length)]
                    : free[Math.floor(random() * free.length)];
            p.onFlip!(best);
        }
    } else if (p.kind === "hideTiebreak") {
        // offset by the player: online, every device's controller has the same seed, and players who always hid in
        // the same spot would tie forever
        p.onHide((Math.floor(random() * p.spots.length) + p.playerId) % p.spots.length);
    } else if (p.kind === "hideResults") {
        p.onDone();
    } else if (p.kind === "compPlay") {
        const win = humansWin === "random" ? random() < 0.5 : humansWin;
        p.onScore(win ? 1e9 : -1e9);
    } else if (p.kind === "compResults") {
        p.onDone(rankResults(p.results, controller.state.humanIds)[0].id);
    } else if (p.kind === "choose") {
        const ids = p.options.map((o) => o.id);
        if (p.noneLabel && random() < 0.5) p.resolve([]);
        else p.resolve(strategy === "first" ? ids.slice(0, p.count) : [...ids].sort(() => random() - 0.5).slice(0, p.count));
    }
}

