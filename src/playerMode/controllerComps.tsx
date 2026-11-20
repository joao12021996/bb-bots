import { Episode, EpisodeType, getById, Houseguest } from "../model";
import { hashcode, rng } from "../utils";
import { newEpisode } from "../subjects/subjects";
import { CompDefinition, EnduranceDeals, Opponent } from "./comps/compTypes";
import { CompRole, THROW_EFFORT, throwChance } from "./comps/throwing";
import { KNOCKOUT_ID, KNOCKOUT_RULES } from "./comps/knockout";
import { botPour, botSwaps, claimLine, Pour, STRIKES_OUT, TAINTED_WINE_ID, TAINTED_WINE_RULES } from "./comps/taintedWine";
import { pickQuickComp, pickWeeklyComp } from "./comps";
import { sample, seededRand } from "./comps/random";
import { CompResult, LiveScore, tiedForFirst } from "./comps/compRunner";
import { shiftRelationship } from "./social/socialActions";
import { botGuess, closestGuesses, makeTiebreaker, TiebreakGuess } from "./comps/tiebreaker";
import { botHide, hideOutcome, tiebreakHouse, VetoHide } from "./comps/hideTiebreak";
import { botFlip, duelDeck, DuelTurn, Matched, MEMORY_DUEL_ID, MEMORY_DUEL_RULES } from "./comps/memoryDuel";
import { dayLabel } from "./days";
import { Ledger, pledge } from "./social/promises";
import { counterName, countOnce } from "../analytics/analytics";
import { PersonalityInfo } from "./social/personality";
import { shuffled } from "./comps/random";
import { dayPartOf, Step } from "./week";

import { Prompt, actorOf } from "./controllerTypes";
import { ControllerCore } from "./controllerCore";

// Running competitions: the bots' side, every format (a comp for everyone, knockouts, Tainted Wine, the Memory
// Duel), tiebreaks, and collecting everyone's votes.
export abstract class ControllerComps extends ControllerCore {
    // ---------- defined in a later part of the controller ----------
    protected abstract compBoost(id: number, comp: CompDefinition, seed: number): number;
    protected abstract haveNotCompeting(competitors: Houseguest[]): boolean;
    public abstract get ledger(): Ledger;
    public abstract traitsOf(id: number): PersonalityInfo | undefined;

    // ---------- stand-ins: a player can't win a comp a bot played for them ----------

    protected stepKey(): string {
        return `${this.gameState.phase}:${this.state.step}`;
    }

    // A comp is being played right now (from its start until its winner is known).
    public compOn(): boolean {
        return this.state.compAt === this.stepKey();
    }

    // Can a player a bot is playing for take back control now? Not halfway through a comp: the bot finishes it.
    public mayComeBack(id: number): boolean {
        return !(this.isAutopilot(id) && this.compOn());
    }

    // A comp starts: until its winner is known, nobody comes back from away. Returns `onWinner`, ending it first.
    protected compStarts<A extends any[]>(onWinner: (...args: A) => void): (...args: A) => void {
        if (this.state.compAt !== this.stepKey()) {
            this.state.compAt = this.stepKey();
            this.save();
        }
        return (...args: A) => {
            this.state.compAt = undefined;
            this.save();
            onWinner(...args);
        };
    }

    // The players a bot stood in for during this step (away, or out of time on a decision), saved so a reload or
    // their coming back in the middle of it doesn't change anything.
    protected standInKey(): string {
        return `standIns:${this.gameState.phase}:${this.state.step}`;
    }

    protected noteStandIn(id: number) {
        const list = this.locked<number[]>(this.standInKey()) || [];
        if (!list.includes(id)) this.lock(this.standInKey(), [...list, id]);
    }

    // At the start of a comp: the players who are away right now.
    protected noteStandIns(participants: { id: number }[]) {
        participants.forEach((p) => {
            if (this.state.humanIds.includes(p.id) && this.isAutopilot(p.id)) this.noteStandIn(p.id);
        });
    }

    // A player a bot played (some of) this step's comp for. They take part, but they can't win it.
    protected stoodIn(id: number): boolean {
        if (this.state.humanIds.includes(id) && this.isAutopilot(id)) return true;
        return (this.locked<number[]>(this.standInKey()) || []).includes(id);
    }

    // The winner of a comp where the last one standing wins (knockout, wine, memory duel). If a bot stood in for
    // them, the win goes to whoever lasted longest without one. `out`: who went out, first out first.
    protected eliminationWinner(last: number, out: number[], lines: string[]): [number, number[]] {
        if (!this.stoodIn(last)) return [last, out];
        const order = [...out, last];
        const real = [...order].reverse().find((id) => !this.stoodIn(id));
        if (real === undefined) return [last, out];
        lines.push(`💤 ${this.player(last).name} was away, with a bot standing in, so they can't win. The win goes to ${this.player(real).name}.`);
        return [real, order.filter((id) => id !== real)];
    }

    // The players among `hgs` who make their own decisions (evicted ones too: the battle back is for them).
    protected playingHumans(hgs: { id: number }[]): Houseguest[] {
        return this.players.filter((p) => this.isHuman(p) && hgs.some((hg) => hg.id === p.id));
    }

    // Online: a player's device has been away a while (on), or is back (off). Sent by the host, so every device
    // makes the switch at the same point. While it's on, bots make the player's decisions, the same way they
    // make their own; a decision the player was in the middle of is made for them.
    public autopilot(id: number, on: boolean) {
        const s = this.state;
        if (!s.humanIds.includes(id) || this.isRuleBreaker(id) || s.step === Step.GameOver) return;
        if (on === this.isAutopilot(id)) return;
        if (!on && !this.mayComeBack(id)) return;
        const list = s.autopilot || [];
        s.autopilot = on ? [...list, id] : list.filter((x) => x !== id);
        const name = this.player(id).name;
        this.feedPush(on ? `🤖 ${name} lost connection. A bot is playing for them until they're back.` : `🎮 ${name} is back in control.`);
        if (on) this.noteStandIn(id);
        this.save();
        if (!on) return;
        const shared = this.prompt$.value;
        if (id in this.personal$.value && this.gatherBot) {
            this.gatherBot(id);
        } else if (shared && actorOf(shared) === id) {
            // their decision on the screen everyone shares: the step starts again, with a bot deciding for them
            this.clearAllPersonal();
            this.run();
        }
    }

    // Online: a player took too long over a decision (sent by the host; see netSession's checkIdle). A bot makes
    // that one decision for them, as it would for a player who'd gone away, and then they're back in control.
    public timedOut(id: number) {
        const s = this.state;
        if (!s.humanIds.includes(id) || this.isRuleBreaker(id) || this.isAutopilot(id) || s.step === Step.GameOver) return;
        const shared = this.prompt$.value;
        const personal = id in this.personal$.value;
        if (!personal && !(shared && actorOf(shared) === id)) return;
        this.feedPush(`⏱️ ${this.player(id).name} ran out of time, so a bot made that call for them.`);
        s.autopilot = [...(s.autopilot || []), id];
        this.noteStandIn(id);
        try {
            if (personal && this.gatherBot) {
                this.gatherBot(id);
            } else if (shared && actorOf(shared) === id) {
                this.clearAllPersonal();
                this.run();
            }
        } finally {
            s.autopilot = (s.autopilot || []).filter((x) => x !== id);
            this.save();
        }
    }

    // The current social or alliance turn goes to a player a bot is playing for: they sit it out.
    protected skipTurn() {
        const s = this.state;
        s.socialTurn++;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
        this.save();
        this.run();
    }

    // Bots play the exact same comp instance as the players (same seed: same questions, dice, maze...),
    // performing according to their Comp score.
    // Some bots throw the comp: they'd rather not win it (see throwing.ts).
    protected simulateBots(comp: CompDefinition, participants: Houseguest[], seed: number, role: CompRole): CompResult[] {
        const ctx = { seed, gameState: this.gameState, history: this.compHistory, participants };
        return participants
            .filter((hg) => !this.isHuman(hg))
            .map((hg) => {
                const info = this.traitsOf(hg.id);
                const throwing = throwChance(this.gameState, this.book, hg, role, this.state.week, this.throwScore(hg.id)) * (info ? info.throws : 1);
                const threw = Math.abs(rng().randomFloat()) < throwing;
                const percentile = Math.max(0, Math.min(1, this.botSkill(hg) + this.compBoost(hg.id, comp, seed)));
                const skill = percentile * (threw ? THROW_EFFORT : 1);
                const result = comp.simulate(ctx, skill, seededRand(hashcode(`${seed}:bot:${hg.id}`)));
                return { id: hg.id, score: result.score, answers: result.answers, picks: result.picks, threw };
            });
    }

    // Deals on the wall in an endurance HoH comp: "drop and you're safe this week". Whoever ends up HoH owes
    // that safety going into the HoH room, and can honor it or break it like any other promise.
    protected wallDeals(player: Houseguest, bots: CompResult[], seed: number): EnduranceDeals {
        const week = this.state.week;
        const noise = seededRand(hashcode(`${seed}:deals:${player.id}`));
        // each ask its own roll, so it comes out the same however many were asked before (on every device)
        const askRoll = (botId: number) => seededRand(hashcode(`${seed}:ask:${player.id}:${botId}`))();
        const feels = (botId: number) => this.player(botId).relationships[player.id];
        const record = (hohId: number, toId: number) => {
            week.wallDeals = [...(week.wallDeals || []), { hohId, toId }];
            pledge(this.ledger, "safety", hohId, toId, this.gameState.phase);
            this.save();
        };
        return {
            offerFrom: bots.filter((b) => feels(b.id) > -0.2 && noise() < 0.5).map((b) => b.id),
            askBot: (botId, seconds) => {
                const bot = bots.find((b) => b.id === botId);
                if (!bot || bot.score <= seconds) return false;
                // a bot that's about to fall anyway is happy to get something for it
                const tired = Math.max(0, Math.min(1, 1 - (bot.score - seconds) / 60));
                const p = Math.max(0.05, Math.min(0.9, 0.2 + 0.4 * feels(botId) + 0.3 * tired));
                if (askRoll(botId) >= p) return false;
                bot.score = seconds;
                // saved, so the results are the same after a reload
                week.locks = { ...(week.locks || {}), [`wallDrop:${seed}:${botId}`]: seconds };
                record(player.id, botId);
                return true;
            },
            accept: (botId) => record(botId, player.id),
        };
    }

    protected noteComp(comp: CompDefinition) {
        countOnce(`${this.state.seed}:${this.state.usedComps.length}`, counterName("comp", comp.id));
        this.state.usedComps = [...this.state.usedComps, comp.id];
    }

    // Runs a competition: every player in it takes a turn (same seed), then everyone sees the results.
    protected runComp(
        title: string,
        comp: CompDefinition,
        participants: Houseguest[],
        onWinner: (id: number, worstFirst: number[]) => void,
        role: CompRole = "other"
    ) {
        const seed = hashcode(`${this.state.seed}:${this.gameState.phase}:${this.state.step}:${comp.id}`);
        onWinner = this.compStarts(onWinner);
        this.noteStandIns(participants);
        const bots = this.simulateBots(comp, participants, seed, role);
        // bots who dropped off the wall for a deal
        bots.forEach((b) => {
            const dropped = this.locked<number>(`wallDrop:${seed}:${b.id}`);
            if (dropped !== undefined) b.score = dropped;
        });
        const humans = this.playingHumans(participants);
        let worstFirst: number[] = [];
        // a player a bot stood in for is marked: they rank under everyone else, and can't win
        const mark = (results: CompResult[]) =>
            results.map((r) => {
                const { away, ...rest } = r;
                return this.stoodIn(r.id) ? { ...rest, away: true } : rest;
            });
        const rank = (results: CompResult[]) =>
            (worstFirst = [...results]
                .sort((a, b) => (b.away ? 1 : 0) - (a.away ? 1 : 0) || a.score - b.score || a.id - b.id)
                .map((r) => r.id));
        const done = (winnerId: number) => {
            this.noteComp(comp);
            onWinner(winnerId, worstFirst.filter((id) => id !== winnerId));
        };
        if (humans.length === 0) {
            // nobody's playing, but everyone can watch: the results come in from last place up.
            // A tie for first goes to the tiebreaker, like any other.
            const results = mark(bots);
            rank(results);
            const tiedIds = tiedForFirst(comp, results);
            const tie = tiedIds.length > 1;
            this.show({
                kind: "compResults",
                title,
                comp,
                participants,
                results,
                spectating: !this.sealed(),
                sealed: this.sealed(),
                tiedIds: tie ? tiedIds : undefined,
                onDone: () => (tie ? this.tiebreak(title, tiedIds, seed, done) : done(tiedIds[0])),
            });
            return;
        }
        const humanResults: CompResult[] = [];
        const byId = (id: number) => getById(this.gameState, id);
        const showResults = () => {
            // any tie for first goes to a tiebreaker question
            const results = mark([...bots, ...humanResults]);
            rank(results);
            const tiedIds = tiedForFirst(comp, results);
            const tiebreak = tiedIds.length > 1;
            this.show({
                kind: "compResults",
                title,
                comp,
                participants,
                results,
                sealed: this.sealed(),
                tiedIds: tiebreak ? tiedIds : undefined,
                onDone: tiebreak ? () => this.tiebreak(title, tiedIds, seed, done) : () => done(tiedIds[0]),
            });
        };
        // a secret Head of Household comp: you play blind (nobody else's score) and there are no deals on the wall
        const blind = this.sealed();
        const deals = (player: Houseguest) =>
            role === "hoh" && comp.kind === "endurance" && !blind ? this.wallDeals(player, bots, seed) : undefined;
        const dealPrompt = (d: EnduranceDeals | undefined) =>
            d
                ? {
                      deals: { offerFrom: d.offerFrom },
                      onDeal: (action: "ask" | "accept", botId: number, seconds: number) => {
                          if (action === "ask") return d.askBot(botId, seconds) as boolean;
                          d.accept(botId);
                          return true;
                      },
                  }
                : {};
        if (this.net) {
            // online: everyone in it plays at the same time, and sees the others' scores come in
            const sealed = this.sealed();
            const humanIds = humans.map((p) => p.id);
            this.gather<CompResult>(
                `comp:${seed}`,
                humans,
                title,
                (player) => `${player.name}'s turn in the ${comp.name}`,
                (player, _more, answer) => {
                    const startKey = `compStart:${seed}:${player.id}`;
                    const started = this.locked<{ score: number | null }>(startKey);
                    const forfeitScore = started
                        ? started.score ?? comp.botScore(0, { gameState: this.gameState, history: this.compHistory })
                        : undefined;
                    return {
                        kind: "compPlay",
                        title,
                        comp,
                        participants,
                        playerId: player.id,
                        seed,
                        opponents: blind ? [] : bots.map((r) => ({ hg: byId(r.id), score: r.score, answers: r.answers, picks: r.picks })),
                        moreToPlay: false,
                        live: sealed ? undefined : { humanIds: humanIds.filter((id) => id !== player.id) },
                        forfeitScore,
                        ...dealPrompt(forfeitScore === undefined ? deals(player) : undefined),
                        // the same input on every device, whatever screen each has: a forfeit's screen hands in that score
                        onScore: (score, answers, picks) => answer({ id: player.id, score, answers, picks }),
                        onStart: () => this.lock(startKey, { score: null }),
                        // the score so far: everyone sees it come in
                        onReport: (score, answers, picks) => this.lock(startKey, { score, ...(answers ? { answers } : {}), ...(picks ? { picks } : {}) }),
                    };
                },
                (answers) => {
                    humans.forEach((p) => humanResults.push(answers[p.id]));
                    showResults();
                },
                (player) => {
                    // a bot finishes their turn: no better than the score they had when they left
                    const sofar = this.locked<{ score: number | null }>(`compStart:${seed}:${player.id}`);
                    const sim = comp.simulate(
                        { seed, gameState: this.gameState, history: this.compHistory, participants },
                        this.botSkill(player),
                        seededRand(hashcode(`${seed}:bot:${player.id}`))
                    );
                    const score = sofar && sofar.score !== null ? sofar.score : sim.score;
                    return { id: player.id, score, answers: sofar && sofar.score !== null ? undefined : sim.answers, picks: sofar && sofar.score !== null ? undefined : sim.picks };
                },
                sealed ? undefined : { comp, seed, participants, bots, humanIds }
            );
            return;
        }
        const turn = (i: number): void => {
            if (i >= humans.length) return showResults();
            const player = humans[i];
            const resultKey = `comp:${seed}:${player.id}`;
            const startKey = `compStart:${seed}:${player.id}`;
            const record = (result: CompResult) => {
                this.lock(resultKey, result);
                humanResults.push(result);
                turn(i + 1);
            };
            const saved = this.locked<CompResult>(resultKey);
            if (saved) {
                humanResults.push(saved);
                return turn(i + 1);
            }
            const started = this.locked<{ score: number | null }>(startKey);
            if (started) {
                // they left in the middle of their turn: no do-overs, they keep the score they had
                const score = started.score ?? comp.botScore(0, { gameState: this.gameState, history: this.compHistory });
                this.tell([player.id], `⏱️ You left the ${comp.name} in the middle of your turn. Your score stands: ${comp.format(score)}.`);
                return record({ id: player.id, score });
            }
            let lastSaved = 0;
            const opponents: Opponent[] = (blind ? [] : [...bots, ...humanResults]).map((r) => ({
                hg: byId(r.id),
                score: r.score,
                answers: r.answers,
                picks: r.picks,
            }));
            // the others can watch if they aren't playing it too (they'd see the answers)
            this.handOff(humans.length > 1, player.id, `${player.name}'s turn in the ${comp.name}`, () =>
                this.show({
                    kind: "compPlay",
                    title,
                    comp,
                    participants,
                    playerId: player.id,
                    seed,
                    opponents,
                    moreToPlay: i + 1 < humans.length,
                    ...dealPrompt(deals(player)),
                    onScore: (score, answers, picks) => record({ id: player.id, score, answers, picks }),
                    onStart: () => this.lock(startKey, { score: null }),
                    onReport: (score) => {
                        // the score so far: saved every couple of seconds, and after every answer in question comps
                        const now = Date.now();
                        const quiz = comp.kind === "memory" || comp.kind === "quiz";
                        if (!quiz && now - lastSaved < 2000) {
                            this.state.week.locks = { ...(this.state.week.locks || {}), [startKey]: { score } };
                            return;
                        }
                        lastSaved = now;
                        this.lock(startKey, { score });
                    },
                })
            );
        };
        turn(0);
    }

    // Players' scores in a comp being played online (see LiveScore). Read by the screens, changes nothing.
    public liveScores(seed: number, ids: number[]): LiveScore[] {
        return ids.map((id) => {
            const result = this.locked<CompResult>(`comp:${seed}:${id}`);
            if (result) return { id, score: result.score, answers: result.answers, picks: result.picks, done: true };
            const sofar = this.locked<{ score: number | null; answers?: boolean[]; picks?: (number | string)[] }>(`compStart:${seed}:${id}`);
            return { id, score: sofar ? sofar.score : null, answers: sofar && sofar.answers, picks: sofar && sofar.picks, done: false };
        });
    }

    // A knockout HoH comes up once a season, while there are enough houseguests for it to hurt.
    protected useKnockout(competitors: Houseguest[]): boolean {
        return (
            this.rules.formats.includes("knockout") &&
            !this.state.week.secretHoh &&
            !this.state.usedComps.includes(KNOCKOUT_ID) &&
            competitors.length >= 5 &&
            this.playingHumans(competitors).length > 0 &&
            Math.abs(rng().randomFloat()) < 0.3
        );
    }

    // Knockout: duels on a closest-number question. The loser is out, and the winner picks the next two.
    // Picking someone for a duel is a public shot at them, so it costs the picker with whoever they pick.
    protected runKnockout(title: string, participants: Houseguest[], onWinner: (id: number, worstFirst: number[]) => void) {
        const s = this.state;
        const seed = hashcode(`${s.seed}:${this.gameState.phase}:${s.step}:${KNOCKOUT_ID}`);
        const noise = seededRand(seed);
        const name = (id: number) => this.player(id).name;
        let remaining = participants.map((p) => p.id);
        const out: number[] = [];
        const picks: { pickerId: number; ids: number[] }[] = [];
        let lines: string[] = [KNOCKOUT_RULES];
        let round = 0;
        onWinner = this.compStarts(onWinner);
        this.noteStandIns(participants);

        // shows what happened since the players last looked, then carries on. `stage`: a board shown after each
        // duel, so everyone watches the comp one duel at a time; once seen, a reload doesn't show it again.
        const board = (next: () => void, winnerId?: number, stage?: string) => {
            if (lines.length === 0 && winnerId === undefined) return next();
            if (stage && this.locked(stage) !== undefined) {
                lines = [];
                return next();
            }
            const shown = lines;
            lines = [];
            this.show({
                kind: "knockout",
                title,
                lines: shown,
                remaining: remaining.map((id) => this.player(id)),
                out: out.map((id) => this.player(id)),
                winnerId,
                onDone: () => {
                    if (stage) this.lock(stage, true);
                    next();
                },
            });
        };

        const finish = () => {
            const [winnerId, worstFirst] = this.eliminationWinner(remaining[0], out, lines);
            this.mutate((gs) => picks.forEach((p) => p.ids.forEach((id) => shiftRelationship(gs, p.pickerId, id, -0.05))));
            picks.forEach((p) => p.ids.forEach((id) => this.tell([id], `⚔️ ${name(p.pickerId)} picked you to duel in the knockout.`)));
            s.usedComps = [...s.usedComps, KNOCKOUT_ID];
            board(() => onWinner(winnerId, worstFirst), winnerId);
        };

        const duel = (pickerId: number | null, a: number, b: number) => {
            round++;
            const duelSeed = hashcode(`${seed}:duel:${round}`);
            const question = makeTiebreaker(duelSeed);
            const pair = [a, b].map((id) => this.player(id));
            const guesses: TiebreakGuess[] = pair
                .filter((hg) => !this.isHuman(hg))
                .map((hg) => ({ id: hg.id, guess: botGuess(question, this.botSkill(hg, `${duelSeed}`), seededRand(hashcode(`${duelSeed}:${hg.id}`))) }));
            const humans = this.playingHumans(pair);
            const settle = () => {
                const closest = closestGuesses(question.answer, guesses);
                if (closest.length > 1) {
                    lines.push(`⚔️ ${name(a)} and ${name(b)} were dead even. Another question!`);
                    return duel(pickerId, a, b);
                }
                const winner = closest[0];
                const loser = winner === a ? b : a;
                const guessOf = (id: number) => guesses.find((g) => g.id === id)!.guess;
                remaining = remaining.filter((id) => id !== loser);
                out.push(loser);
                lines.push(
                    `⚔️ ${pickerId === null ? "The first duel, drawn at random" : `${name(pickerId)} picked`}: ${name(a)} vs ${name(b)}. ` +
                        `There were ${question.answer} ${question.noun}. ${name(winner)} guessed ${guessOf(winner)}, ${name(loser)} guessed ${guessOf(loser)}. ` +
                        `${name(loser)} is out.`
                );
                // one duel at a time (the last one is shown with the winner)
                if (remaining.length > 1) board(() => nextPick(winner), undefined, `koSeen:${duelSeed}`);
                else nextPick(winner);
            };
            const key = `ko:${duelSeed}`;
            const guessAll = () =>
                this.gather<number>(
                    key,
                    humans,
                    "Knockout duel",
                    (player) => `${player.name}'s knockout duel`,
                    (player, moreToPlay, onGuess) => {
                        const rival = pair.find((hg) => hg.id !== player.id)!;
                        return {
                            kind: "tiebreak",
                            title,
                            heading: "Knockout duel",
                            intro:
                                pickerId === null || pickerId === player.id
                                    ? `${player.name} vs ${rival.name}. The loser is out of the comp.`
                                    : `${name(pickerId)} picked ${player.name} to face ${rival.name}. The loser is out of the comp.`,
                            question,
                            tied: pair,
                            playerId: player.id,
                            moreToPlay,
                            onGuess,
                        };
                    },
                    (answers) => {
                        humans.forEach((h) => guesses.push({ id: h.id, guess: answers[h.id] }));
                        settle();
                    },
                    (player) => botGuess(question, this.botSkill(player, `${duelSeed}`), seededRand(hashcode(`${duelSeed}:${player.id}`)))
                );
            // the board first, unless every guess is already in (resuming)
            if (humans.every((h) => this.locked(`${key}:${h.id}`) !== undefined)) guessAll();
            else board(guessAll);
        };

        const nextPick = (pickerId: number) => {
            if (remaining.length === 1) return finish();
            if (remaining.length === 2) return duel(pickerId, remaining[0], remaining[1]);
            const options = remaining.filter((id) => id !== pickerId);
            const go = (ids: number[]) => {
                picks.push({ pickerId, ids });
                duel(pickerId, ids[0], ids[1]);
            };
            const picker = this.player(pickerId);
            const pickKey = `koPick:${seed}:${round}`;
            const savedPick = this.locked<number[]>(pickKey);
            if (savedPick) return go(savedPick);
            if (!this.isHuman(picker)) {
                // bots send the houseguests they like least into the duel
                const keyed = options.map((id) => ({ id, key: picker.relationships[id] + 0.2 * noise() }));
                keyed.sort((x, y) => x.key - y.key);
                return go(keyed.slice(0, 2).map((k) => k.id));
            }
            board(() =>
                this.openly(pickerId, `${picker.name}, pick the next duel`, () =>
                    this.show({
                        kind: "choose",
                        actorId: pickerId,
                        title: "Knockout: pick the next duel",
                        text: "You won your duel, so you choose the next two to face off. The loser is out of the comp. Everyone sees who you pick, and nobody likes being picked.",
                        options: options.map((id) => this.player(id)),
                        count: 2,
                        confirmLabel: "Send them to duel",
                        resolve: (ids) => {
                            this.lock(pickKey, ids);
                            go(ids);
                        },
                    })
                )
            );
        };

        const [first, second] = sample(noise, remaining, 2);
        duel(null, first, second);
    }

    // Tainted Wine comes up once a season (HoH or Veto), with a player in it and enough houseguests to make it a game.
    protected useTaintedWine(competitors: Houseguest[]): boolean {
        return (
            this.rules.formats.includes("taintedWine") &&
            !this.state.week.secretHoh &&
            !this.state.usedComps.includes(TAINTED_WINE_ID) &&
            competitors.length >= 3 &&
            this.playingHumans(competitors).length > 0 &&
            Math.abs(rng().randomFloat()) < 0.25
        );
    }

    // Memory Duel, like Tainted Wine: once a season, with a player in it.
    protected useMemoryDuel(competitors: Houseguest[]): boolean {
        return (
            this.rules.formats.includes("memoryDuel") &&
            !this.state.week.secretHoh &&
            !this.state.usedComps.includes(MEMORY_DUEL_ID) &&
            competitors.length >= 3 &&
            this.playingHumans(competitors).length > 0 &&
            Math.abs(rng().randomFloat()) < 0.25
        );
    }

    // HoH or Veto: the special comps (Knockout, Tainted Wine, Memory Duel) or a regular one. Picked once and saved.
    protected pickComp(competitors: Houseguest[], hoh: boolean): string {
        return this.compChoice(() => {
            // a Double Eviction night: something quick
            if (this.state.week.fast) return pickQuickComp(this.state.gameState, this.compHistory, this.state.usedComps, this.rules.kinds, this.haveNotCompeting(competitors)).id;
            if (hoh && this.useKnockout(competitors)) return KNOCKOUT_ID;
            if (this.useTaintedWine(competitors)) return TAINTED_WINE_ID;
            if (this.useMemoryDuel(competitors)) return MEMORY_DUEL_ID;
            return pickWeeklyComp(this.state.gameState, this.compHistory, this.state.usedComps, this.rules.kinds, this.haveNotCompeting(competitors)).id;
        });
    }

    // Tainted Wine: two glasses, one tainted, two houseguests on stage at a time. The pourer offers one glass to
    // the other and keeps the other, truth or bluff; the other drinks or trades. Whoever drank the tainted glass
    // pours next; two tainted sips and you're out, and two more take the stage. Nobody takes the stage again until
    // everyone still in has had their turn (with an odd number, the last one up faces someone who's been on
    // already). Every player decision is saved as it's made, and the bots' choices come from the comp's seed, so a
    // reload replays the comp exactly up to where it was.
    protected runTaintedWine(title: string, participants: Houseguest[], onWinner: (id: number, worstFirst: number[]) => void) {
        const s = this.state;
        const seed = hashcode(`${s.seed}:${this.gameState.phase}:${s.step}:${TAINTED_WINE_ID}`);
        const noise = seededRand(seed);
        const name = (id: number) => this.player(id).name;
        let remaining = participants.map((p) => p.id);
        const out: number[] = [];
        const strikes: { [id: number]: number } = {};
        participants.forEach((p) => (strikes[p.id] = 0));
        const offered: { pourerId: number; targetId: number }[] = [];
        let lines: string[] = [TAINTED_WINE_RULES];
        let round = 0;
        // the stage: the two on it, who's still to go up this time round, and who's been up and is still in
        const order = shuffled(noise, remaining);
        let waiting = [...order];
        let been: number[] = [];
        let stage: [number, number] = [order[0], order[1]];
        onWinner = this.compStarts(onWinner);
        this.noteStandIns(participants);
        const skillOf = (id: number) => (this.isHuman({ id }) ? 0.5 : this.botSkill(this.player(id), `${seed}`));

        const captions = () => {
            const c: { [id: number]: string } = {};
            remaining.forEach((id) => (c[id] = !stage.includes(id) ? (been.includes(id) ? "✅ played" : "⏳ up later") : strikes[id] === 0 ? "🎭 🍷 no sips" : `🎭 ☠️ ${strikes[id]}/${STRIKES_OUT}`));
            return c;
        };
        // as in the knockout: `stage` boards come after every glass, and are shown once
        const board = (next: () => void, winnerId?: number, stage?: string) => {
            if (lines.length === 0 && winnerId === undefined) return next();
            if (stage && this.locked(stage) !== undefined) {
                lines = [];
                return next();
            }
            const shown = lines;
            lines = [];
            this.show({
                kind: "knockout",
                title,
                emoji: "🍷",
                name: "Tainted Wine",
                lines: shown,
                remaining: remaining.map((id) => this.player(id)),
                out: out.map((id) => this.player(id)),
                captions: captions(),
                winnerId,
                onDone: () => {
                    if (stage) this.lock(stage, true);
                    next();
                },
            });
        };

        const finish = () => {
            const [winnerId, worstFirst] = this.eliminationWinner(remaining[0], out, lines);
            // handing someone the glass is a shot at them
            this.mutate((gs) => offered.forEach((o) => shiftRelationship(gs, o.targetId, o.pourerId, -0.03)));
            s.usedComps = [...s.usedComps, TAINTED_WINE_ID];
            board(() => onWinner(winnerId, worstFirst), winnerId);
        };

        const drink = (pourerId: number, targetId: number, pour: Pour, swap: boolean): void => {
            // after the trade (if any), does the drinker hold the tainted glass?
            const drinkerTainted = pour.offerTainted !== swap;
            const victim = drinkerTainted ? targetId : pourerId;
            const other = victim === targetId ? pourerId : targetId;
            strikes[victim]++;
            const said = pour.claim === "none" ? "said nothing" : `said “${claimLine(pour.claim)}”`;
            const bluff =
                pour.claim === "none" ? "" : (pour.claim === "clean") === pour.offerTainted ? " It was a bluff." : " It was the truth.";
            let line =
                `🍷 ${name(pourerId)} poured for ${name(targetId)} and ${said}.${bluff} ` +
                `${name(targetId)} ${swap ? "traded glasses" : "kept the glass"}. ☠️ ${name(victim)} drank the tainted wine (${strikes[victim]}/${STRIKES_OUT}).`;
            if (strikes[victim] >= STRIKES_OUT) {
                remaining = remaining.filter((id) => id !== victim);
                out.push(victim);
                line += ` ${name(victim)} is out!`;
            }
            lines.push(line);
            if (remaining.length === 1) return finish();
            // one glass at a time; whoever drank the tainted glass pours next, until one of them is out
            if (remaining.includes(victim)) return board(() => pourTurn(victim), undefined, `wine:${seed}:${round}:seen`);
            been.push(other);
            const next = nextUp();
            board(() => pourTurn(next), undefined, `wine:${seed}:${round}:seen`);
        };

        const offer = (pourerId: number, targetId: number) => {
            round++;
            const key = `wine:${seed}:${round}`;
            offered.push({ pourerId, targetId });
            const pourer = this.player(pourerId);
            const target = this.player(targetId);
            const botPourNoise = botPour(skillOf(pourerId), noise);
            const swapNoise = noise();
            const decideSwap = (pour: Pour) => {
                if (!this.isHuman(target)) {
                    return drink(pourerId, targetId, pour, botSwaps(pour, skillOf(targetId), skillOf(pourerId), seededRand(hashcode(`${seed}:${round}:${swapNoise}`))));
                }
                this.decide<boolean>(
                    `${key}:swap`,
                    (answer) =>
                        board(() =>
                            this.privately(targetId, `${target.name}: ${pourer.name} hands you a glass`, () =>
                                this.show({
                                    kind: "wineDrink",
                                    title,
                                    pourerId,
                                    drinkerId: targetId,
                                    claim: pour.claim,
                                    tell: pour.tell,
                                    strikes: { ...strikes },
                                    onDecide: answer,
                                })
                            )
                        ),
                    (swap) => drink(pourerId, targetId, pour, swap)
                );
            };
            if (!this.isHuman(pourer)) return decideSwap(botPourNoise);
            this.decide<Pour>(
                `${key}:pour`,
                (answer) =>
                    board(() =>
                        this.privately(pourerId, `${pourer.name}, pour the wine`, () =>
                            this.show({ kind: "winePour", title, pourerId, targetId, strikes: { ...strikes }, onPour: answer })
                        )
                    ),
                decideSwap
            );
        };

        // The next two to take the stage (the first of them pours first). Those who haven't been up go first;
        // once everyone has, everyone still in goes round again.
        const nextUp = (): number => {
            if (waiting.length === 0) {
                waiting = order.filter((id) => been.includes(id));
                been = [];
            }
            let pair: number[];
            if (waiting.length >= 2) pair = waiting.slice(0, 2);
            else pair = [waiting[0], been[0]]; // odd one left: they face whoever's been waiting longest
            waiting = waiting.filter((id) => !pair.includes(id));
            been = been.filter((id) => !pair.includes(id));
            stage = [pair[0], pair[1]];
            pair.forEach((id) => (strikes[id] = 0)); // a fresh game for both
            lines.push(`🎭 ${name(pair[0])} and ${name(pair[1])} take the stage. ${name(pair[0])} pours first.`);
            return pair[0];
        };

        const pourTurn = (pourerId: number): void => offer(pourerId, stage[0] === pourerId ? stage[1] : stage[0]);

        lines.push(`🎲 The draw: ${order.map(name).join(", ")}.`);
        pourTurn(nextUp());
    }

    // Memory Duel: Concentration, king of the hill. Two at a time, in a drawn order: the winner of each duel faces
    // the next challenger, and the loser is out. Players turn over one card at a time, each card saved as it's
    // turned over; bots turn theirs over from the comp's seed, so a reload replays the comp exactly.
    protected runMemoryDuel(title: string, participants: Houseguest[], onWinner: (id: number, worstFirst: number[]) => void) {
        const s = this.state;
        const seed = hashcode(`${s.seed}:${this.gameState.phase}:${s.step}:${MEMORY_DUEL_ID}`);
        const noise = seededRand(seed);
        const name = (id: number) => this.player(id).name;
        const queue = shuffled(noise, participants.map((p) => p.id));
        const total = queue.length - 1;
        const out: number[] = [];
        const wins: { [id: number]: number } = {};
        queue.forEach((id) => (wins[id] = 0));
        let lines: string[] = [
            MEMORY_DUEL_RULES,
            `🎲 The draw: ${queue.map(name).join(", ")}. ${name(queue[0])} and ${name(queue[1])} duel first.`,
        ];
        let champ = queue[0];
        let next = 2;
        onWinner = this.compStarts(onWinner);
        this.noteStandIns(participants);

        // as in Tainted Wine: the board shows what happened since it was last shown
        const board = (then: () => void, winnerId?: number) => {
            if (lines.length === 0 && winnerId === undefined) return then();
            const shown = lines;
            lines = [];
            const captions: { [id: number]: string } = {};
            queue.forEach((id) => (captions[id] = wins[id] ? `🃏 ${wins[id]} win${wins[id] === 1 ? "" : "s"}` : "🃏 no duels won"));
            this.show({
                kind: "knockout",
                title,
                emoji: "🃏",
                name: "Memory Duel",
                lines: shown,
                remaining: queue.filter((id) => !out.includes(id)).map((id) => this.player(id)),
                out: out.map((id) => this.player(id)),
                captions,
                winnerId,
                onDone: then,
            });
        };

        const finish = () => {
            s.usedComps = [...s.usedComps, MEMORY_DUEL_ID];
            const [winnerId, worstFirst] = this.eliminationWinner(champ, out, lines);
            board(() => onWinner(winnerId, worstFirst), winnerId);
        };

        const duel = (no: number, a: number, b: number) => {
            const dseed = hashcode(`${seed}:duel:${no}`);
            const deck = duelDeck(dseed);
            const players = [this.player(a), this.player(b)];
            const humanIn = players.some((p) => this.isHuman(p));
            const note = `Duel ${no} of ${total}`;
            const matched: Matched = {};
            const scores: { [id: number]: number } = { [a]: 0, [b]: 0 };
            const seen: number[] = [];
            let actor = seededRand(dseed)() < 0.5 ? a : b;
            let open: number[] = [];
            let recent: DuelTurn[] = [];
            const turnOver = (card: number) => {
                seen.push(card);
                open = [...open, card];
                if (open.length < 2) return;
                recent.push({ by: actor, cards: open });
                if (deck[open[0]] === deck[open[1]]) {
                    open.forEach((c) => (matched[c] = actor));
                    scores[actor]++;
                } else actor = actor === a ? b : a;
                open = [];
            };
            const prompt = (extra: Partial<Extract<Prompt, { kind: "memoryDuel" }>>, shownRecent: DuelTurn[]): Prompt => ({
                kind: "memoryDuel",
                title,
                note,
                players,
                actorId: actor,
                deck,
                matched: { ...matched },
                open: [...open],
                scores: { ...scores },
                recent: shownRecent,
                ...extra,
            });

            const end = () => {
                const [w, l] = scores[a] > scores[b] ? [a, b] : [b, a];
                wins[w]++;
                out.push(l);
                champ = w;
                lines.push(`🃏 ${name(w)} beat ${name(l)}, ${scores[w]} pairs to ${scores[l]}. ${name(l)} is out!`);
                const onward = () => {
                    if (next >= queue.length) return finish();
                    const challenger = queue[next++];
                    lines.push(`🃏 Next up: ${name(w)} vs ${name(challenger)}.`);
                    duel(no + 1, w, challenger);
                };
                if (!humanIn) return onward();
                const shownRecent = recent;
                recent = [];
                this.decide<boolean>(
                    `md:${seed}:${no}:end`,
                    (answer) => this.show(prompt({ actorId: w, onDone: () => answer(true) }, shownRecent)),
                    onward
                );
            };

            const play = (): void => {
                while (Object.keys(matched).length < deck.length) {
                    if (!this.isHuman(this.player(actor))) {
                        const skill = this.botSkill(this.player(actor), `${seed}:duel`);
                        turnOver(botFlip(deck, matched, seen, open.length ? open[0] : null, skill, hashcode(`${dseed}:mind:${actor}`)));
                        continue;
                    }
                    const shownRecent = recent;
                    recent = [];
                    return this.decide<number>(
                        `md:${seed}:${no}:${seen.length}`,
                        (answer) => board(() => this.show(prompt({ onFlip: answer }, shownRecent))),
                        (card) => {
                            turnOver(card);
                            play();
                        }
                    );
                }
                end();
            };
            play();
        };

        duel(1, queue[0], queue[1]);
    }

    // The tiebreaker: everyone tied for first hides a veto card, then the house is searched. The first card found
    // loses; the last one standing wins. Cards found together at the end hide again.
    protected tiebreak(title: string, tiedIds: number[], seed: number, done: (winnerId: number) => void, round: number = 0) {
        const spots = tiebreakHouse(hashcode(`${seed}:hide:${round}`));
        const tied = tiedIds.map((id) => this.player(id));
        const botSpot = (hg: Houseguest) =>
            botHide(spots, this.botSkill(hg, `${seed}:hide:${round}`), seededRand(hashcode(`${seed}:hide:${round}:${hg.id}`)));
        const hides: VetoHide[] = tied.filter((hg) => !this.isHuman(hg)).map((hg) => ({ id: hg.id, spot: botSpot(hg) }));
        const humans = this.playingHumans(tied);
        this.gather<number>(
            `hide:${seed}:${round}`,
            humans,
            title,
            (player) => `${player.name}'s turn to hide the veto`,
            (player, moreToPlay, onHide) => ({ kind: "hideTiebreak", title, spots, tied, playerId: player.id, moreToPlay, onHide }),
            (answers) => {
                humans.forEach((h) => hides.push({ id: h.id, spot: answers[h.id] }));
                const outcome = hideOutcome(spots, hides);
                let { winnerId, tied: still } = outcome;
                // a bot standing in for an away player can't win it for them: the others go again
                const playing = tiedIds.filter((id) => !this.stoodIn(id));
                if (winnerId !== undefined && this.stoodIn(winnerId) && playing.length > 0) {
                    winnerId = playing.length === 1 ? playing[0] : undefined;
                    still = playing;
                }
                this.show({
                    kind: "hideResults",
                    title,
                    spots,
                    tied,
                    hides,
                    winnerId,
                    sealed: this.sealed(),
                    onDone: () => (winnerId === undefined ? this.tiebreak(title, still, seed, done, round + 1) : done(winnerId)),
                });
            },
            botSpot
        );
    }

    // The day of the season (1 to 90) for whatever is happening now.
    public dayText(): string | null {
        const s = this.state;
        const week = s.gameState.phase;
        if (week < 1) return null;
        return dayLabel(s.gameState, week, dayPartOf(s.step));
    }

    // Asks one or more players to vote privately: all at once online, one after another on one device.
    protected collectVotes(
        key: string,
        voters: Houseguest[],
        makePrompt: (voter: Houseguest, record: (id: number) => void) => Prompt,
        onDone: (votes: { [voterId: number]: number }) => void,
        bot: (voter: Houseguest) => number
    ) {
        this.gather<number>(
            key,
            voters,
            "Voting",
            (voter) => `${voter.name}, it's time to vote`,
            (voter, _more, record) => makePrompt(voter, record),
            onDone,
            bot
        );
    }

    protected pushEpisode(type: EpisodeType, title?: string) {
        newEpisode(
            new Episode({
                scenes: this.weekScenes,
                gameState: this.gameState,
                initialGamestate: this.state.weekStartState,
                type,
                title,
            })
        );
        this.weekScenes = [];
    }

    public bannerText(): string | null {
        const evicted = this.players.filter((p) => p.isEvicted);
        if (evicted.length === 0) return null;
        if (!this.multiplayer) {
            const me = evicted[0];
            return `You were evicted. You're watching the rest of the season${
                me.isJury ? " from the jury, and you'll vote for the winner at the finale." : "."
            }`;
        }
        if (this.alivePlayers.length === 0) return "Every player has been evicted. Jurors will still vote at the finale.";
        return `Evicted: ${evicted.map((p) => p.name).join(", ")}. Still in the game: ${this.alivePlayers.map((p) => p.name).join(", ")}.`;
    }
}
