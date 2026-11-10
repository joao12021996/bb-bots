import React from "react";
import { BehaviorSubject } from "rxjs";
import {
    Episode,
    EpisodeType,
    exclude,
    GameState,
    getById,
    Houseguest,
    MutableGameState,
    nonEvictedHouseguests,
} from "../model";
import { hashcode, rng } from "../utils";
import { BigBrotherVanilla, defaultContent } from "../components/episode/bigBrotherEpisode";
import { BigBrotherFinale } from "../components/episode/bigBrotherFinale";
import { generateGameOver } from "../components/episode/gameOver";
import { CastOptionsOverride, prepareNextWeek } from "../components/episode/episodeFactory";
import { generateHohCompScene } from "../components/episode/scenes/hohCompScene";
import { generateNomCeremonyScene } from "../components/episode/scenes/nomCeremonyScene";
import { generateVetoCompScene, pickVetoPlayers } from "../components/episode/scenes/vetoCompScene";
import { generateVetoCeremonyScene } from "../components/episode/scenes/vetoCeremonyScene";
import { generateEvictionScene } from "../components/episode/scenes/evictionScene";
import { finalHohCompScene } from "../components/episode/scenes/finalHohCompScene";
import { finalEvictionScene } from "../components/episode/scenes/finalEvictionScene";
import { juryVoteScene } from "../components/episode/scenes/juryVoteScene";
import { Scene } from "../components/episode/scenes/scene";
import { GoldenVeto } from "../components/episode/veto/veto";
import { castEvictionVote } from "../utils/ai/aiApi";
import { refreshHgStats } from "../components/episode/utilities/evictHouseguest";
import { generateVotingTable } from "../components/votingTable/votingTable";
import { newEpisode, playerModeScreen$, pushToMainContentStream } from "../subjects/subjects";
import { Screens } from "../components/topbar/topBar";
import { WeekRecord } from "./history";
import { CompDefinition, Opponent } from "./comps/compTypes";
import { compById, finaleComps, pickWeeklyComp } from "./comps";
import { botPercentile } from "./comps/botScores";
import { seededRand } from "./comps/random";
import { CompResult, rankResults } from "./comps/compRunner";
import { ACTIONS_PER_BLOCK, botSocialTime, performSocialAction, SocialAction, SocialMemory, SocialOutcome } from "./social/socialActions";
import { clearSave, writeSave } from "./save/serialize";

export enum Step {
    WeekStart = "WeekStart",
    SocialMorning = "SocialMorning",
    Hoh = "Hoh",
    Noms = "Noms",
    SocialAfternoon = "SocialAfternoon",
    Veto = "Veto",
    VetoCeremony = "VetoCeremony",
    SocialCampaign = "SocialCampaign",
    Eviction = "Eviction",
    FinaleHoh1 = "FinaleHoh1",
    FinaleHoh2 = "FinaleHoh2",
    FinaleHoh3 = "FinaleHoh3",
    FinalEviction = "FinalEviction",
    Jury = "Jury",
    GameOver = "GameOver",
}

const SOCIAL_BLOCK_NAMES: { [step: string]: string } = {
    [Step.SocialMorning]: "Morning in the house",
    [Step.SocialAfternoon]: "Afternoon in the house",
    [Step.SocialCampaign]: "Campaign time",
};

const AFTER_SOCIAL: { [step: string]: Step } = {
    [Step.SocialMorning]: Step.Hoh,
    [Step.SocialAfternoon]: Step.Veto,
    [Step.SocialCampaign]: Step.Eviction,
};

interface WeekProgress {
    hohId?: number;
    nomineeIds?: number[];
    povId?: number;
    finaleComps?: string[];
    endurance?: number;
    skill?: number;
    finalHoh?: number;
}

// Everything needed to resume a season. Must stay JSON-serializable (see save/serialize.ts).
export interface PlayerSave {
    version: 2;
    humanIds: number[]; // one per player; 2+ means pass-and-play on one device
    seed: number;
    step: Step;
    gameState: GameState;
    weekStartState: GameState;
    week: WeekProgress;
    history: WeekRecord[];
    usedComps: string[]; // every comp played this season, in order (comps don't repeat)
    social: { [humanId: number]: SocialMemory };
    socialTurn: number; // which alive player is taking their social turn
    actionsLeft: number;
    socialLog: string[];
    // custom relationships / teams for this season's houseguests (remapped when playing with part of the cast)
    castOptions?: CastOptionsOverride;
}

export type Prompt =
    | { kind: "scene"; scene: Scene }
    | { kind: "handoff"; playerId: number; reason: string; next: () => void }
    | { kind: "social"; blockName: string; actorId: number }
    | {
          kind: "compPlay";
          title: string;
          comp: CompDefinition;
          participants: Houseguest[];
          playerId: number;
          seed: number;
          opponents: Opponent[];
          moreToPlay: boolean;
          onScore: (score: number) => void;
      }
    | {
          kind: "compResults";
          title: string;
          comp: CompDefinition;
          participants: Houseguest[];
          results: CompResult[];
          onDone: (winnerId: number) => void;
      }
    | {
          kind: "choose";
          actorId: number;
          title: string;
          text: string;
          options: Houseguest[];
          count: number;
          noneLabel?: string;
          confirmLabel: string;
          resolve: (ids: number[]) => void;
      }
    | { kind: "gameOver"; content: JSX.Element };

// Upgrades older saves to the current format.
export function migrateSave(save: any): PlayerSave | null {
    if (!save) return null;
    if (save.version === 2) return save as PlayerSave;
    if (save.version === 1) {
        return {
            version: 2,
            humanIds: [save.humanId],
            seed: save.seed,
            step: save.step,
            gameState: save.gameState,
            weekStartState: save.weekStartState,
            week: save.week,
            history: save.history,
            usedComps: save.recentComps || [],
            social: { [save.humanId]: save.social },
            socialTurn: 0,
            actionsLeft: save.actionsLeft,
            socialLog: save.socialLog || [],
        };
    }
    return null;
}

export class PlayerModeController {
    public state: PlayerSave;
    public readonly prompt$ = new BehaviorSubject<Prompt | null>(null);
    private weekScenes: Scene[] = [];

    constructor(save: PlayerSave) {
        this.state = save;
    }

    get gameState(): GameState {
        return this.state.gameState;
    }

    get players(): Houseguest[] {
        return this.state.humanIds.map((id) => getById(this.gameState, id));
    }

    get alivePlayers(): Houseguest[] {
        return this.players.filter((hg) => !hg.isEvicted);
    }

    get multiplayer(): boolean {
        return this.state.humanIds.length > 1;
    }

    public player(id: number): Houseguest {
        return getById(this.gameState, id);
    }

    // The player currently taking their social turn.
    get socialActor(): Houseguest {
        return this.alivePlayers[this.state.socialTurn];
    }

    public socialMemory(id: number): SocialMemory {
        if (!this.state.social[id]) this.state.social[id] = { chatsThisWeek: {}, allies: [] };
        return this.state.social[id];
    }

    public start() {
        this.run();
    }

    private save() {
        writeSave(this.state);
    }

    private reseed(extra: string = "") {
        const s = this.state;
        rng().seed(hashcode(`${s.seed}:${s.gameState.phase}:${s.step}:${s.socialTurn}:${s.actionsLeft}:${extra}`));
    }

    private show(prompt: Prompt) {
        this.prompt$.next(prompt);
    }

    // In pass-and-play, private screens are preceded by a "pass the device to X" screen.
    private privately(playerId: number, reason: string, prompt: () => void) {
        if (!this.multiplayer) return prompt();
        this.show({ kind: "handoff", playerId, reason, next: prompt });
    }

    private showScene(scene: Scene, next: Step) {
        this.weekScenes.push(scene);
        this.state.step = next;
        this.save();
        this.show({ kind: "scene", scene });
    }

    public continue = () => {
        this.run();
    };

    private goTo(step: Step) {
        this.state.step = step;
        this.save();
        this.run();
    }

    private run() {
        this.reseed();
        switch (this.state.step) {
            case Step.WeekStart:
                return this.weekStart();
            case Step.SocialMorning:
            case Step.SocialAfternoon:
            case Step.SocialCampaign:
                return this.social();
            case Step.Hoh:
                return this.hohComp();
            case Step.Noms:
                return this.nominations();
            case Step.Veto:
                return this.vetoComp();
            case Step.VetoCeremony:
                return this.vetoCeremony();
            case Step.Eviction:
                return this.eviction();
            case Step.FinaleHoh1:
            case Step.FinaleHoh2:
            case Step.FinaleHoh3:
                return this.finaleHoh();
            case Step.FinalEviction:
                return this.finalEviction();
            case Step.Jury:
                return this.jury();
            case Step.GameOver:
                return this.gameOver();
        }
    }

    // ---------- helpers ----------

    public isHuman(hg: { id: number } | undefined) {
        return !!hg && this.state.humanIds.includes(hg.id);
    }

    private playingHumans(hgs: { id: number }[]): Houseguest[] {
        return this.alivePlayers.filter((p) => hgs.some((hg) => hg.id === p.id));
    }

    // Bots play the exact same comp instance as the players (same seed: same questions, dice, maze...),
    // performing according to their Comp score.
    private simulateBots(comp: CompDefinition, participants: Houseguest[], seed: number): CompResult[] {
        const ctx = { seed, gameState: this.gameState, history: this.state.history, participants };
        return participants
            .filter((hg) => !this.isHuman(hg))
            .map((hg) => {
                const result = comp.simulate(ctx, botPercentile(hg), seededRand(hashcode(`${seed}:bot:${hg.id}`)));
                return { id: hg.id, score: result.score, answers: result.answers };
            });
    }

    private noteComp(comp: CompDefinition) {
        this.state.usedComps = [...this.state.usedComps, comp.id];
    }

    // Runs a competition: every player in it takes a turn (same seed), then everyone sees the results.
    private runComp(title: string, comp: CompDefinition, participants: Houseguest[], onWinner: (id: number) => void) {
        const seed = hashcode(`${this.state.seed}:${this.gameState.phase}:${this.state.step}:${comp.id}`);
        const bots = this.simulateBots(comp, participants, seed);
        const humans = this.playingHumans(participants);
        const done = (winnerId: number) => {
            this.noteComp(comp);
            onWinner(winnerId);
        };
        if (humans.length === 0) {
            done(rankResults(bots, []).reduce((best, r) => (r.score > best.score ? r : best)).id);
            return;
        }
        const humanResults: CompResult[] = [];
        const byId = (id: number) => getById(this.gameState, id);
        const turn = (i: number) => {
            if (i >= humans.length) {
                this.show({
                    kind: "compResults",
                    title,
                    comp,
                    participants,
                    results: [...bots, ...humanResults],
                    onDone: done,
                });
                return;
            }
            const player = humans[i];
            const opponents: Opponent[] = [...bots, ...humanResults].map((r) => ({
                hg: byId(r.id),
                score: r.score,
                answers: r.answers,
            }));
            this.privately(player.id, `${player.name}'s turn in the ${comp.name}`, () =>
                this.show({
                    kind: "compPlay",
                    title,
                    comp,
                    participants,
                    playerId: player.id,
                    seed,
                    opponents,
                    moreToPlay: i + 1 < humans.length,
                    onScore: (score) => {
                        humanResults.push({ id: player.id, score });
                        turn(i + 1);
                    },
                })
            );
        };
        turn(0);
    }

    // Asks one or more players to vote privately, one after another.
    private collectVotes(
        voters: Houseguest[],
        makePrompt: (voter: Houseguest, record: (id: number) => void) => Prompt,
        onDone: (votes: { [voterId: number]: number }) => void
    ) {
        const votes: { [voterId: number]: number } = {};
        const ask = (i: number) => {
            if (i >= voters.length) return onDone(votes);
            const voter = voters[i];
            this.privately(voter.id, `${voter.name}, it's time to vote`, () =>
                this.show(
                    makePrompt(voter, (id) => {
                        votes[voter.id] = id;
                        ask(i + 1);
                    })
                )
            );
        };
        ask(0);
    }

    private pushEpisode(type: EpisodeType, title?: string) {
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

    // ---------- steps ----------

    private weekStart() {
        const s = this.state;
        const remaining = s.gameState.remainingPlayers;
        if (remaining <= 2) return this.goTo(Step.GameOver);
        const finale = remaining === 3;
        s.gameState = prepareNextWeek(s.gameState, finale ? BigBrotherFinale : BigBrotherVanilla, s.castOptions);
        s.weekStartState = s.gameState;
        s.week = {};
        s.humanIds.forEach((id) => (this.socialMemory(id).chatsThisWeek = {}));
        s.socialLog = [];
        s.socialTurn = 0;
        s.actionsLeft = ACTIONS_PER_BLOCK;
        const title = finale ? "Finale" : `Week ${s.gameState.phase}`;
        s.step = finale ? Step.FinaleHoh1 : Step.SocialMorning;
        this.save();
        this.show({ kind: "scene", scene: new Scene({ title, gameState: s.gameState, content: defaultContent(s.gameState) }) });
    }

    private social() {
        const s = this.state;
        const alive = this.alivePlayers;
        if (s.socialTurn >= alive.length) return this.finishSocialBlock();
        const actor = alive[s.socialTurn];
        this.privately(actor.id, `${actor.name}'s social time`, () =>
            this.show({ kind: "social", blockName: SOCIAL_BLOCK_NAMES[s.step], actorId: actor.id })
        );
    }

    // Called by the social screen.
    public socialAct(action: SocialAction): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        if (s.actionsLeft <= 0 || !actor) return null;
        this.reseed("act");
        const gs = new MutableGameState(s.gameState);
        const outcome = performSocialAction(gs, actor.id, action, this.socialMemory(actor.id));
        refreshHgStats(gs, []);
        s.gameState = new GameState(gs);
        s.actionsLeft--;
        s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.save();
        return outcome;
    }

    // Called by the social screen when the current player is done.
    public endSocial = () => {
        const s = this.state;
        s.socialTurn++;
        s.actionsLeft = ACTIONS_PER_BLOCK;
        this.save();
        this.run();
    };

    private finishSocialBlock() {
        const s = this.state;
        const blockName = SOCIAL_BLOCK_NAMES[s.step];
        this.reseed("bots");
        const gs = new MutableGameState(s.gameState);
        botSocialTime(gs, s.humanIds);
        refreshHgStats(gs, []);
        s.gameState = new GameState(gs);
        // in pass-and-play, social moves are secret, so they don't go in the episode recap
        if (!this.multiplayer && s.socialLog.length > 0) {
            const log = [...s.socialLog];
            this.weekScenes.push(
                new Scene({
                    title: blockName,
                    gameState: s.gameState,
                    content: (
                        <div style={{ textAlign: "center" }}>
                            <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>{blockName}</h3>
                            {log.map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    ),
                })
            );
        }
        s.socialLog = [];
        s.socialTurn = 0;
        s.actionsLeft = ACTIONS_PER_BLOCK;
        this.goTo(AFTER_SOCIAL[s.step]);
    }

    private hohComp() {
        const s = this.state;
        const competitors = exclude(nonEvictedHouseguests(s.gameState), s.gameState.previousHOH || []);
        const comp = pickWeeklyComp(s.gameState, s.history, s.usedComps);
        this.runComp("Head of Household Competition", comp, competitors, (winnerId) => {
            const [gs, scene, hohs] = generateHohCompScene(s.gameState, { forcedWinners: [getById(s.gameState, winnerId)] });
            s.gameState = gs;
            s.week.hohId = hohs[0].id;
            this.showScene(scene, Step.Noms);
        });
    }

    private nominations() {
        const s = this.state;
        const hoh = getById(s.gameState, s.week.hohId!);
        const finish = (forced?: Houseguest[]) => {
            const [gs, scene, noms] = generateNomCeremonyScene(s.gameState, [hoh], { forcedNominees: forced });
            s.gameState = gs;
            s.week.nomineeIds = noms.map((n) => n.id);
            this.showScene(scene, Step.SocialAfternoon);
        };
        if (!this.isHuman(hoh)) return finish();
        this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Nomination Ceremony",
                text: "You are the Head of Household. Choose two houseguests to nominate for eviction.",
                options: nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== hoh.id),
                count: 2,
                confirmLabel: "Nominate",
                resolve: (ids) => finish(ids.map((id) => getById(s.gameState, id))),
            })
        );
    }

    private vetoComp() {
        const s = this.state;
        const hoh = getById(s.gameState, s.week.hohId!);
        const noms = s.week.nomineeIds!.map((id) => getById(s.gameState, id));
        const players = pickVetoPlayers(s.gameState, [hoh], noms).povPlayers.map((p) => getById(s.gameState, p.id));
        const comp = pickWeeklyComp(s.gameState, s.history, s.usedComps);
        this.runComp("Power of Veto Competition", comp, players, (winnerId) => {
            const [gs, scene, pov] = generateVetoCompScene(s.gameState, [hoh], noms, {
                veto: GoldenVeto,
                forcedPlayers: players,
                forcedWinner: getById(s.gameState, winnerId),
            });
            s.gameState = gs;
            s.week.povId = pov.id;
            this.showScene(scene, Step.VetoCeremony);
        });
    }

    private vetoCeremony() {
        const s = this.state;
        const gsAtStart = s.gameState;
        const hoh = getById(gsAtStart, s.week.hohId!);
        const pov = getById(gsAtStart, s.week.povId!);
        const noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));

        const generate = (choice: { decision: Houseguest | null; reason: string }, renom?: Houseguest) => {
            const [gs, scene, finalNoms] = generateVetoCeremonyScene(gsAtStart, [hoh], noms, pov, {
                veto: GoldenVeto,
                forcedVetoChoice: choice,
                forcedRenom: renom,
            });
            s.gameState = gs;
            s.week.nomineeIds = finalNoms.map((n: Houseguest) => n.id);
            this.showScene(scene, Step.SocialCampaign);
        };

        const afterChoice = (choice: { decision: Houseguest | null; reason: string }) => {
            if (!choice.decision || !this.isHuman(hoh)) return generate(choice);
            const everyone = nonEvictedHouseguests(gsAtStart);
            let options = exclude(everyone, [...noms, pov, hoh]);
            if (options.length === 0) options = exclude(everyone, [hoh, ...noms]);
            this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
                this.show({
                    kind: "choose",
                    actorId: hoh.id,
                    title: "Replacement Nominee",
                    text: `${choice.decision!.name} has been saved by the veto. As Head of Household, you must name a replacement nominee.`,
                    options,
                    count: 1,
                    confirmLabel: "Nominate",
                    resolve: (ids) => generate(choice, getById(gsAtStart, ids[0])),
                })
            );
        };

        if (this.isHuman(pov)) {
            this.privately(pov.id, `${pov.name}, veto holder`, () =>
                this.show({
                    kind: "choose",
                    actorId: pov.id,
                    title: "Veto Ceremony",
                    text: "You hold the Power of Veto. Will you use it to save one of the nominees?",
                    options: noms,
                    count: 1,
                    noneLabel: "Don't use the veto",
                    confirmLabel: "Use the veto",
                    resolve: (ids) =>
                        afterChoice(
                            ids.length === 0 ? { decision: null, reason: "" } : { decision: getById(gsAtStart, ids[0]), reason: "" }
                        ),
                })
            );
        } else {
            const immunePlayers = hoh.id !== pov.id ? [hoh] : [];
            afterChoice(GoldenVeto.use(pov, noms, gsAtStart, hoh.id, { immunePlayers }));
        }
    }

    private eviction() {
        const s = this.state;
        const gsAtStart = s.gameState;
        const hoh = getById(gsAtStart, s.week.hohId!);
        const noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        const voters = exclude(nonEvictedHouseguests(gsAtStart), [hoh, ...noms]);
        const votes: { [voterId: number]: number } = {};
        voters.forEach((voter) => {
            if (!this.isHuman(voter)) votes[voter.id] = noms[castEvictionVote(voter, noms, gsAtStart).decision].id;
        });

        const generate = (tieBreak?: number) => {
            const [gs, scene] = generateEvictionScene(gsAtStart, [hoh], noms, {
                votingTo: "Evict",
                forcedVotes: votes,
                forcedTieBreak: tieBreak,
                hideVoters: true,
            });
            s.gameState = gs;
            const evictedIds = noms.filter((n) => getById(gs, n.id).isEvicted).map((n) => n.id);
            s.history = [
                ...s.history,
                { week: gsAtStart.phase, hohId: hoh.id, nomineeIds: noms.map((n) => n.id), povId: s.week.povId, evictedIds },
            ];
            this.weekScenes.push(scene);
            this.pushEpisode(BigBrotherVanilla);
            s.step = Step.WeekStart;
            this.save();
            this.show({ kind: "scene", scene });
        };

        const afterVotes = () => {
            const counts = noms.map((n) => Object.values(votes).filter((v) => v === n.id).length);
            const max = Math.max(...counts);
            const tied = noms.filter((_, i) => counts[i] === max);
            if (tied.length > 1 && this.isHuman(hoh)) {
                this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
                    this.show({
                        kind: "choose",
                        actorId: hoh.id,
                        title: "Tie Breaker",
                        text: "The vote is tied! As Head of Household, you must cast the deciding vote to evict.",
                        options: tied,
                        count: 1,
                        confirmLabel: "Evict",
                        resolve: (ids) => generate(ids[0]),
                    })
                );
            } else {
                generate();
            }
        };

        this.collectVotes(
            this.playingHumans(voters),
            (voter, record) => ({
                kind: "choose",
                actorId: voter.id,
                title: "Live Eviction",
                text: "It's time to vote. Your vote is secret. Who do you vote to evict?",
                options: noms,
                count: 1,
                confirmLabel: "Vote to evict",
                resolve: (ids) => record(ids[0]),
            }),
            (humanVotes) => {
                Object.assign(votes, humanVotes);
                afterVotes();
            }
        );
    }

    private finaleHoh() {
        const s = this.state;
        const gs = s.gameState;
        if (!s.week.finaleComps) s.week.finaleComps = finaleComps(gs, s.history, s.usedComps).map((c) => c.id);
        const [c1, c2, c3] = s.week.finaleComps.map(compById);
        const final3 = nonEvictedHouseguests(gs);
        let comp: CompDefinition;
        let participants: Houseguest[];
        let title: string;
        let record: (id: number) => void;
        if (s.step === Step.FinaleHoh1) {
            comp = c1;
            participants = final3;
            title = "Final HoH, Part 1 (all three houseguests)";
            record = (id) => (s.week.endurance = id);
        } else if (s.step === Step.FinaleHoh2) {
            comp = c2;
            participants = final3.filter((hg) => hg.id !== s.week.endurance);
            title = "Final HoH, Part 2 (the two who lost Part 1)";
            record = (id) => (s.week.skill = id);
        } else {
            comp = c3;
            participants = [getById(gs, s.week.endurance!), getById(gs, s.week.skill!)];
            title = "Final HoH, Part 3 (winners of Parts 1 and 2)";
            record = (id) => (s.week.finalHoh = id);
        }
        this.runComp(title, comp, participants, (winnerId) => {
            record(winnerId);
            if (s.step === Step.FinaleHoh3) {
                const [newGs, scene] = finalHohCompScene(gs, {
                    endurance: s.week.endurance!,
                    skill: s.week.skill!,
                    final: s.week.finalHoh!,
                });
                s.gameState = newGs;
                this.showScene(scene, Step.FinalEviction);
            } else {
                this.goTo(s.step === Step.FinaleHoh1 ? Step.FinaleHoh2 : Step.FinaleHoh3);
            }
        });
    }

    private finalEviction() {
        const s = this.state;
        const gs = s.gameState;
        const hoh = getById(gs, s.week.finalHoh!);
        const finish = (evictee?: number) => {
            const [newGs, scene] = finalEvictionScene(gs, hoh, evictee);
            s.gameState = newGs;
            this.showScene(scene, Step.Jury);
        };
        if (!this.isHuman(hoh)) return finish();
        this.privately(hoh.id, `${hoh.name}, final Head of Household`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Final Eviction",
                text: "You are the final Head of Household. Who will you evict? The one you keep sits next to you in the final 2.",
                options: nonEvictedHouseguests(gs).filter((hg) => hg.id !== hoh.id),
                count: 1,
                confirmLabel: "Evict",
                resolve: (ids) => finish(ids[0]),
            })
        );
    }

    private jury() {
        const s = this.state;
        const gs = s.gameState;
        const jurors = this.players.filter((p) => p.isJury && p.isEvicted);
        this.collectVotes(
            jurors,
            (juror, record) => ({
                kind: "choose",
                actorId: juror.id,
                title: "Jury Vote",
                text: "You are on the jury. Your vote is secret. Vote for the houseguest you want to WIN Big Brother.",
                options: nonEvictedHouseguests(gs),
                count: 1,
                confirmLabel: "Vote to win",
                resolve: (ids) => record(ids[0]),
            }),
            (votes) => {
                const [newGs, scene] = juryVoteScene(gs, Object.keys(votes).length ? votes : undefined, true);
                s.gameState = new GameState(newGs);
                this.weekScenes.push(scene);
                this.pushEpisode(BigBrotherFinale, "Finale");
                s.step = Step.GameOver;
                this.save();
                this.show({ kind: "scene", scene });
            }
        );
    }

    private gameOver() {
        const gs = this.state.gameState;
        const content = generateVotingTable(gs);
        newEpisode(generateGameOver(new GameState(new MutableGameState(gs))));
        clearSave();
        playerModeScreen$.next(null);
        this.show({ kind: "gameOver", content });
    }
}

let activeController: PlayerModeController | null = null;

export function getActiveController() {
    return activeController;
}

export function activatePlayerMode(controller: PlayerModeController, screen: () => JSX.Element) {
    activeController = controller;
    playerModeScreen$.next(screen);
    pushToMainContentStream(screen(), Screens.Ingame);
    controller.start();
}

export function newPlayerSave(gameState: GameState, humanIds: number[], castOptions?: CastOptionsOverride): PlayerSave {
    const social: { [id: number]: SocialMemory } = {};
    humanIds.forEach((id) => (social[id] = { chatsThisWeek: {}, allies: [] }));
    return {
        version: 2,
        humanIds,
        seed: Date.now() % 1000000007,
        step: Step.WeekStart,
        gameState,
        weekStartState: gameState,
        week: {},
        history: [],
        usedComps: [],
        social,
        socialTurn: 0,
        actionsLeft: ACTIONS_PER_BLOCK,
        socialLog: [],
        castOptions,
    };
}
