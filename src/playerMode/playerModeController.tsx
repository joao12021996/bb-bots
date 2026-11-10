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
import {
    ACTIONS_PER_BLOCK,
    answerPitch,
    Approach,
    botApproaches,
    botSocialTime,
    performSocialAction,
    shiftRelationship,
    SocialAction,
    SocialMemory,
    SocialOutcome,
} from "./social/socialActions";
import {
    addMember,
    Alliance,
    AllianceBook,
    aliveMembers,
    betray,
    botAllianceTime,
    botNominate,
    botVeto,
    botVote,
    cleanName,
    createAlliance,
    emptyBook,
    getAlliance,
    holdMeeting,
    leakAlliance,
    leaveAlliance,
    maxAllianceSize,
    MoveOutcome,
    proposeAlliance,
    pruneAlliances,
} from "./social/alliances";
import { generateBlockbusterScene } from "./blockbusterScene";
import { getComp, getSocial } from "../model";
import { clearSave, writeSave } from "./save/serialize";

export enum Step {
    WeekStart = "WeekStart",
    SocialMorning = "SocialMorning",
    Hoh = "Hoh",
    Noms = "Noms",
    SocialAfternoon = "SocialAfternoon",
    Veto = "Veto",
    VetoCeremony = "VetoCeremony",
    SocialBlockbuster = "SocialBlockbuster",
    Blockbuster = "Blockbuster",
    SocialCampaign = "SocialCampaign",
    Eviction = "Eviction",
    SocialFinale1 = "SocialFinale1",
    FinaleHoh1 = "FinaleHoh1",
    SocialFinale2 = "SocialFinale2",
    FinaleHoh2 = "FinaleHoh2",
    SocialFinale3 = "SocialFinale3",
    FinaleHoh3 = "FinaleHoh3",
    FinalEviction = "FinalEviction",
    Jury = "Jury",
    GameOver = "GameOver",
}

const SOCIAL_BLOCK_NAMES: { [step: string]: string } = {
    [Step.SocialMorning]: "Morning in the house",
    [Step.SocialAfternoon]: "Afternoon in the house",
    [Step.SocialBlockbuster]: "Before the Blockbuster",
    [Step.SocialCampaign]: "Campaign time",
    [Step.SocialFinale1]: "Final 3: before Part 1",
    [Step.SocialFinale2]: "Final 3: before Part 2",
    [Step.SocialFinale3]: "Final 3: before Part 3",
};

export function isSocialStep(step: Step): boolean {
    return SOCIAL_BLOCK_NAMES[step] !== undefined;
}

// Weeks with 7 or more houseguests are Blockbuster weeks: three nominees, the veto, then the Blockbuster.
export const BLOCKBUSTER_MIN_PLAYERS = 7;

const AFTER_SOCIAL: { [step: string]: Step } = {
    [Step.SocialMorning]: Step.Hoh,
    [Step.SocialAfternoon]: Step.Veto,
    [Step.SocialBlockbuster]: Step.Blockbuster,
    [Step.SocialCampaign]: Step.Eviction,
    [Step.SocialFinale1]: Step.FinaleHoh1,
    [Step.SocialFinale2]: Step.FinaleHoh2,
    [Step.SocialFinale3]: Step.FinaleHoh3,
};

interface WeekProgress {
    hohId?: number;
    nomineeIds?: number[];
    povId?: number;
    blockbuster?: boolean; // three nominees this week, and a Blockbuster after the veto
    blockbusterId?: number;
    finaleComps?: string[];
    endurance?: number;
    skill?: number;
    finalHoh?: number;
}

// Everything needed to resume a season. Must stay JSON-serializable (see save/serialize.ts).
export interface PlayerSave {
    version: 3;
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
    socialStage: "social" | "alliance"; // each player's turn: social time, then alliance time
    actionsLeft: number;
    socialLog: string[];
    book: AllianceBook; // every alliance in the house, bots' and players'
    approaches: { [humanId: number]: Approach[] }; // houseguests who came to talk to each player
    approachKey: { [humanId: number]: string }; // which social block approaches were last generated for
    news: { [humanId: number]: string[] }; // things each player found out since their last social time
    statsHidden?: boolean; // skill randomizer: Social/Comp scores are random and secret until the end
    // custom relationships / teams for this season's houseguests (remapped when playing with part of the cast)
    castOptions?: CastOptionsOverride;
}

export type Prompt =
    | { kind: "scene"; scene: Scene }
    | { kind: "handoff"; playerId: number; reason: string; next: () => void }
    | { kind: "social"; blockName: string; actorId: number }
    | { kind: "alliance"; blockName: string; actorId: number }
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
    if (save.version === 1) {
        save = {
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
    if (save.version === 2) {
        // allies became alliances: each player's allies form one alliance with them
        const book = emptyBook();
        const gs = save.gameState as GameState;
        Object.keys(save.social || {}).forEach((key) => {
            const id = Number(key);
            const allies: number[] = (save.social[id] && save.social[id].allies) || [];
            const members = [id, ...allies].filter((m) => getById(gs, m) && !getById(gs, m).isEvicted);
            if (members.length >= 2) {
                book.alliances.push({
                    id: book.nextId++,
                    name: `${getById(gs, id).name}'s Alliance`,
                    memberIds: members,
                    chemistry: 0.6,
                    formedWeek: gs.phase,
                    suggestions: {},
                    met: false,
                });
            }
            save.social[id] = { chatsThisWeek: (save.social[id] && save.social[id].chatsThisWeek) || {} };
        });
        save = { ...save, version: 3, socialStage: "social", book, approaches: {}, approachKey: {}, news: {} };
    }
    if (save.version === 3) return save as PlayerSave;
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
        if (!this.state.social[id]) this.state.social[id] = { chatsThisWeek: {} };
        return this.state.social[id];
    }

    get book(): AllianceBook {
        return this.state.book;
    }

    // Alliances a houseguest is in that still have at least two members in the house.
    public alliancesOf(id: number): Alliance[] {
        return this.book.alliances.filter((a) => a.memberIds.includes(id) && aliveMembers(this.gameState, a).length >= 2);
    }

    public allyIds(id: number): number[] {
        const ids = new Set<number>();
        this.alliancesOf(id).forEach((a) => a.memberIds.forEach((m) => m !== id && ids.add(m)));
        return Array.from(ids);
    }

    // Approaches that still make sense (the houseguests involved are still in the house).
    public approachesFor(id: number): Approach[] {
        const alive = (hid: number) => getById(this.gameState, hid) && !getById(this.gameState, hid).isEvicted;
        const list = (this.state.approaches[id] || []).filter(
            (a) => alive(a.fromId) && (a.kind !== "pitch" || alive(a.targetId))
        );
        this.state.approaches[id] = list;
        return list;
    }

    public newsFor(id: number): string[] {
        return this.state.news[id] || [];
    }

    private tell(ids: number[], text: string) {
        ids.forEach((id) => {
            if (!this.isHuman({ id })) return;
            this.state.news[id] = [...(this.state.news[id] || []), text];
        });
    }

    private tellAlliance(a: Alliance, text: string, except?: number) {
        this.tell(
            a.memberIds.filter((m) => m !== except),
            text
        );
    }

    // Applies changes to the game state's relationships, then refreshes everyone's stats and hit lists.
    private mutate<T>(fn: (gs: MutableGameState) => T): T {
        const gs = new MutableGameState(this.state.gameState);
        const result = fn(gs);
        refreshHgStats(gs, []);
        this.state.gameState = new GameState(gs);
        return result;
    }

    // `betrayerId` went after `victimId`. Every alliance they share takes the hit, if the betrayal is noticed.
    private backstab(betrayerId: number, victimId: number, pCaught: number) {
        const shared = this.book.alliances.filter((a) => a.memberIds.includes(betrayerId) && a.memberIds.includes(victimId));
        if (shared.length === 0) return;
        this.mutate((gs) =>
            shared.forEach((a) => {
                const caught = Math.abs(rng().randomFloat()) < pCaught;
                const members = [...a.memberIds];
                const text = betray(gs, this.book, a, betrayerId, victimId, caught);
                this.tell(members, text);
            })
        );
        this.save();
    }

    public start() {
        this.run();
    }

    private save() {
        writeSave(this.state);
    }

    private reseed(extra: string = "") {
        const s = this.state;
        rng().seed(
            hashcode(`${s.seed}:${s.gameState.phase}:${s.step}:${s.socialTurn}:${s.socialStage}:${s.actionsLeft}:${extra}`)
        );
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
            case Step.SocialBlockbuster:
            case Step.SocialCampaign:
            case Step.SocialFinale1:
            case Step.SocialFinale2:
            case Step.SocialFinale3:
                return this.social();
            case Step.Blockbuster:
                return this.blockbuster();
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
        s.week = { blockbuster: !finale && remaining >= BLOCKBUSTER_MIN_PLAYERS };
        s.humanIds.forEach((id) => (this.socialMemory(id).chatsThisWeek = {}));
        s.socialLog = [];
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = ACTIONS_PER_BLOCK;
        pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
        const title = finale ? "Finale" : `Week ${s.gameState.phase}`;
        s.step = finale ? Step.SocialFinale1 : Step.SocialMorning;
        this.save();
        this.show({ kind: "scene", scene: new Scene({ title, gameState: s.gameState, content: defaultContent(s.gameState) }) });
    }

    private social() {
        const s = this.state;
        const alive = this.alivePlayers;
        if (s.socialTurn >= alive.length) return this.finishSocialBlock();
        const actor = alive[s.socialTurn];
        const blockName = SOCIAL_BLOCK_NAMES[s.step];
        if (s.socialStage === "alliance") {
            if (this.alliancesOf(actor.id).length === 0) return this.endAlliance();
            this.privately(actor.id, `${actor.name}'s alliance time`, () =>
                this.show({ kind: "alliance", blockName, actorId: actor.id })
            );
            return;
        }
        // other houseguests come to talk to the player (once per social block)
        const key = `${s.gameState.phase}:${s.step}`;
        if (s.approachKey[actor.id] !== key) {
            s.approachKey[actor.id] = key;
            this.reseed(`approach:${actor.id}`);
            const fresh = this.mutate((gs) => botApproaches(gs, s.book, actor.id, s.humanIds));
            s.approaches[actor.id] = [...(s.approaches[actor.id] || []), ...fresh];
            this.save();
        }
        this.privately(actor.id, `${actor.name}'s social time`, () => this.show({ kind: "social", blockName, actorId: actor.id }));
    }

    // Called by the social screen.
    public socialAct(action: SocialAction): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        if (s.actionsLeft <= 0 || !actor) return null;
        this.reseed("act");
        let outcome: SocialOutcome;
        if (action.kind === "alliance" && this.isHuman({ id: action.botId })) {
            // players invite each other: the other player answers on their own social turn
            const other = this.player(action.botId);
            const a = action.allianceId !== undefined ? getAlliance(s.book, action.allianceId) : undefined;
            const name = a ? a.name : cleanName(action.name || "", s.book);
            s.approaches[other.id] = [
                ...(s.approaches[other.id] || []),
                { kind: "invite", fromId: actor.id, allianceId: a ? a.id : undefined, name },
            ];
            outcome = { text: `You asked ${other.name} to join ${name}. They'll answer on their social turn.`, good: true };
        } else if (action.kind === "alliance") {
            const { botId, allianceId, name } = action;
            outcome = this.mutate((gs) => proposeAlliance(gs, s.book, actor.id, botId, { allianceId, name }));
        } else {
            outcome = this.mutate((gs) => performSocialAction(gs, actor.id, action, this.socialMemory(actor.id)));
        }
        s.actionsLeft--;
        s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.save();
        return outcome;
    }

    // The current player answers someone who came to talk to them. Answering is free (no action used).
    public respondApproach(index: number, accept: boolean): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        const list = this.approachesFor(actor.id);
        const approach = list[index];
        if (!approach) return null;
        s.approaches[actor.id] = list.filter((_, i) => i !== index);
        this.reseed(`respond:${index}:${list.length}`);
        const from = this.player(approach.fromId);
        let outcome: SocialOutcome | null = null;
        if (approach.kind === "pitch") {
            outcome = this.mutate((gs) => answerPitch(gs, actor.id, approach.fromId, approach.targetId, accept));
        } else if (approach.kind === "invite") {
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.04);
                    this.tell([from.id], `${actor.name} turned down your alliance offer.`);
                    return { text: `You turned down ${from.name}'s alliance offer.`, good: false };
                }
                const existing = approach.allianceId !== undefined ? getAlliance(s.book, approach.allianceId) : undefined;
                if (existing && existing.memberIds.includes(from.id)) {
                    if (existing.memberIds.includes(actor.id)) return { text: `You're already in ${existing.name}.`, good: true };
                    if (existing.memberIds.length >= maxAllianceSize(gs))
                        return { text: `${existing.name} is already full.`, good: false };
                    addMember(gs, existing, actor.id);
                    this.tellAlliance(existing, `🤝 ${actor.name} joined ${existing.name}.`, actor.id);
                    return { text: `You joined ${existing.name}!`, good: true };
                }
                const a = createAlliance(gs, s.book, [from.id, actor.id], approach.name);
                this.tell([from.id], `🤝 ${actor.name} said yes: ${a.name} is official.`);
                return { text: `You and ${from.name} formed ${a.name}!`, good: true };
            });
        }
        if (outcome) s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.save();
        return outcome;
    }

    // Called by the social screen when the current player is done: on to alliance time.
    public endSocial = () => {
        const s = this.state;
        const actor = this.socialActor;
        if (actor) {
            s.news[actor.id] = [];
            s.approaches[actor.id] = this.approachesFor(actor.id).filter((a) => a.kind === "invite");
        }
        s.socialStage = "alliance";
        this.save();
        this.run();
    };

    // Alliance time: the current player suggests a target. The alliance meets once every player in it has
    // weighed in this block (bots always have an opinion).
    public allianceSuggest(allianceId: number, targetId: number | null): string[] {
        const s = this.state;
        const actor = this.socialActor;
        const a = getAlliance(s.book, allianceId);
        if (!a || a.met) return [];
        a.suggestions[actor.id] = targetId;
        const later = this.alivePlayers.slice(s.socialTurn + 1).filter((p) => a.memberIds.includes(p.id));
        if (later.length > 0) {
            this.save();
            return [`Your pick is in. ${later.map((p) => p.name).join(" and ")} will weigh in before ${a.name} decides.`];
        }
        this.reseed(`meeting:${a.id}`);
        const result = this.mutate((gs) => holdMeeting(gs, a, s.humanIds));
        this.tellAlliance(a, `🤝 ${a.name} met. ${result.lines[result.lines.length - 1]}`, actor.id);
        result.lines.forEach((line) => s.socialLog.push(`🤝 ${line}`));
        if (a.chemistry <= 0) this.dissolve(a);
        this.save();
        return result.lines;
    }

    public renameAlliance(allianceId: number, name: string) {
        const a = getAlliance(this.book, allianceId);
        if (!a) return;
        a.name = cleanName(name, this.book);
        this.save();
    }

    // Backstab: leak the alliance's plans to an outsider.
    public leak(allianceId: number, outsiderId: number): MoveOutcome[] {
        const a = getAlliance(this.book, allianceId);
        const actor = this.socialActor;
        if (!a) return [];
        this.reseed(`leak:${a.id}:${outsiderId}`);
        const members = a.memberIds.filter((m) => m !== actor.id);
        const out = this.mutate((gs) => leakAlliance(gs, this.book, a, actor.id, outsiderId));
        if (!a.memberIds.includes(actor.id)) this.tell(members, out[out.length - 1].text);
        out.forEach((o) => this.state.socialLog.push(`${o.good ? "👍" : "👎"} ${o.text}`));
        this.save();
        return out;
    }

    public leave(allianceId: number): MoveOutcome | null {
        const a = getAlliance(this.book, allianceId);
        const actor = this.socialActor;
        if (!a) return null;
        const out = this.mutate((gs) => leaveAlliance(gs, this.book, a, actor.id));
        this.tellAlliance(a, `🚪 ${actor.name} walked out on ${a.name}.`, actor.id);
        this.state.socialLog.push(`👎 ${out.text}`);
        this.save();
        return out;
    }

    private dissolve(a: Alliance) {
        this.state.book.alliances = this.state.book.alliances.filter((x) => x.id !== a.id);
        this.tellAlliance(a, `💔 ${a.name} has fallen apart.`);
    }

    // Called by the alliance screen when the current player is done: next player's turn.
    public endAlliance = () => {
        const s = this.state;
        const actor = this.socialActor;
        if (actor) s.approaches[actor.id] = [];
        s.socialTurn++;
        s.socialStage = "social";
        s.actionsLeft = ACTIONS_PER_BLOCK;
        this.save();
        this.run();
    };

    private finishSocialBlock() {
        const s = this.state;
        const blockName = SOCIAL_BLOCK_NAMES[s.step];
        this.reseed("bots");
        this.mutate((gs) => {
            // alliances that haven't met yet meet now (players who skipped alliance time don't get a say)
            s.book.alliances
                .filter((a) => !a.met && aliveMembers(gs, a).length >= 2)
                .forEach((a) => {
                    const result = holdMeeting(gs, a, s.humanIds);
                    this.tellAlliance(a, `🤝 ${a.name} met without you. ${result.lines[result.lines.length - 1]}`);
                });
            s.book.alliances.filter((a) => a.chemistry <= 0).forEach((a) => this.dissolve(a));
            botSocialTime(gs, s.humanIds);
            botAllianceTime(gs, s.book, s.humanIds).forEach((invite) => {
                s.approaches[invite.toId] = [
                    ...(s.approaches[invite.toId] || []),
                    { kind: "invite", fromId: invite.fromId, allianceId: invite.allianceId, name: invite.name },
                ];
            });
            s.book.alliances.forEach((a) => {
                a.met = false;
                a.suggestions = {};
            });
        });
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
        s.socialStage = "social";
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
        const count = s.week.blockbuster ? 3 : 2;
        const options = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== hoh.id);
        const finish = (nominees: Houseguest[], betrayed: number[]) => {
            const [gs, scene, noms] = generateNomCeremonyScene(s.gameState, [hoh], { forcedNominees: nominees });
            s.gameState = gs;
            s.week.nomineeIds = noms.map((n) => n.id);
            betrayed.forEach((victim) => this.backstab(hoh.id, victim, 1));
            this.showScene(scene, Step.SocialAfternoon);
        };
        if (!this.isHuman(hoh)) {
            const { picks, betrayed } = botNominate(s.gameState, s.book, hoh, options, count);
            return finish(picks, betrayed);
        }
        this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Nomination Ceremony",
                text: s.week.blockbuster
                    ? "You are the Head of Household. Choose three houseguests to nominate for eviction. After the veto, the nominees play the Blockbuster, and the winner comes off the block."
                    : "You are the Head of Household. Choose two houseguests to nominate for eviction.",
                options,
                count,
                confirmLabel: "Nominate",
                resolve: (ids) => {
                    const allies = this.allyIds(hoh.id);
                    finish(
                        ids.map((id) => getById(s.gameState, id)),
                        ids.filter((id) => allies.includes(id))
                    );
                },
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
            this.showScene(scene, s.week.blockbuster ? Step.SocialBlockbuster : Step.SocialCampaign);
        };

        const afterChoice = (choice: { decision: Houseguest | null; reason: string }) => {
            if (!choice.decision) return generate(choice);
            const everyone = nonEvictedHouseguests(gsAtStart);
            let options = exclude(everyone, [...noms, pov, hoh]);
            if (options.length === 0) options = exclude(everyone, [hoh, ...noms]);
            if (!this.isHuman(hoh)) {
                const { picks, betrayed } = botNominate(gsAtStart, s.book, hoh, options, 1);
                generate(choice, picks[0]);
                betrayed.forEach((victim) => this.backstab(hoh.id, victim, 1));
                return;
            }
            this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
                this.show({
                    kind: "choose",
                    actorId: hoh.id,
                    title: "Replacement Nominee",
                    text: `${choice.decision!.name} has been saved by the veto. As Head of Household, you must name a replacement nominee.`,
                    options,
                    count: 1,
                    confirmLabel: "Nominate",
                    resolve: (ids) => {
                        generate(choice, getById(gsAtStart, ids[0]));
                        if (this.allyIds(hoh.id).includes(ids[0])) this.backstab(hoh.id, ids[0], 1);
                    },
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
            afterChoice(botVeto(gsAtStart, s.book, pov, noms, hoh.id, immunePlayers));
        }
    }

    private blockbuster() {
        const s = this.state;
        const noms = s.week.nomineeIds!.map((id) => getById(s.gameState, id));
        const comp = pickWeeklyComp(s.gameState, s.history, s.usedComps);
        this.runComp("Blockbuster Competition", comp, noms, (winnerId) => {
            const [gs, scene, remaining] = generateBlockbusterScene(s.gameState, noms, winnerId);
            s.gameState = gs;
            s.week.blockbusterId = winnerId;
            s.week.nomineeIds = remaining.map((n) => n.id);
            this.showScene(scene, Step.SocialCampaign);
        });
    }

    private eviction() {
        const s = this.state;
        const gsAtStart = s.gameState;
        const hoh = getById(gsAtStart, s.week.hohId!);
        const noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        const voters = exclude(nonEvictedHouseguests(gsAtStart), [hoh, ...noms]);
        const votes: { [voterId: number]: number } = {};
        const botBetrayals: [number, number][] = [];
        voters.forEach((voter) => {
            if (this.isHuman(voter)) return;
            const vote = botVote(gsAtStart, s.book, voter, noms);
            votes[voter.id] = vote.id;
            if (vote.betrayed !== undefined) botBetrayals.push([voter.id, vote.betrayed]);
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
                {
                    week: gsAtStart.phase,
                    hohId: hoh.id,
                    nomineeIds: noms.map((n) => n.id),
                    povId: s.week.povId,
                    blockbusterId: s.week.blockbusterId,
                    evictedIds,
                },
            ];
            // votes against allies can get noticed (bots 30% of the time; players less often the more social they are)
            this.reseed("betrayals");
            botBetrayals.forEach(([voter, victim]) => this.backstab(voter, victim, 0.3));
            Object.keys(votes)
                .map(Number)
                .filter((voter) => this.isHuman({ id: voter }) && this.allyIds(voter).includes(votes[voter]))
                .forEach((voter) =>
                    this.backstab(voter, votes[voter], Math.max(0.1, Math.min(0.55, 0.6 - 0.05 * getSocial(getById(gs, voter)))))
                );
            pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
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
                this.goTo(s.step === Step.FinaleHoh1 ? Step.SocialFinale2 : Step.SocialFinale3);
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
        const table = generateVotingTable(gs);
        const content = this.state.statsHidden ? (
            <div>
                {table}
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🎲 The hidden skills</h3>
                <div className="bbb-skills-reveal">
                    {[...gs.houseguests]
                        .sort((a, b) => getSocial(b) + getComp(b) - (getSocial(a) + getComp(a)))
                        .map((hg) => (
                            <div key={hg.id}>
                                <img src={hg.imageURL} alt="" />
                                <b>{hg.name}</b>
                                <span>
                                    🗣️ {getSocial(hg)} · 🏆 {getComp(hg)}
                                </span>
                            </div>
                        ))}
                </div>
            </div>
        ) : (
            table
        );
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

export function newPlayerSave(
    gameState: GameState,
    humanIds: number[],
    castOptions?: CastOptionsOverride,
    statsHidden?: boolean
): PlayerSave {
    const social: { [id: number]: SocialMemory } = {};
    humanIds.forEach((id) => (social[id] = { chatsThisWeek: {} }));
    return {
        version: 3,
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
        socialStage: "social",
        actionsLeft: ACTIONS_PER_BLOCK,
        socialLog: [],
        book: emptyBook(),
        approaches: {},
        approachKey: {},
        news: {},
        castOptions,
        statsHidden,
    };
}
