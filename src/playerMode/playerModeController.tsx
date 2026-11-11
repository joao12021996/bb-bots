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
import { NextEpisodeButton } from "../components/nextEpisodeButton/nextEpisodeButton";
import { GoldenVeto } from "../components/episode/veto/veto";
import { refreshHgStats } from "../components/episode/utilities/evictHouseguest";
import { generateVotingTable } from "../components/votingTable/votingTable";
import { newEpisode, playerModeScreen$, pushToMainContentStream, secretRelationships$, selectedPlayer$ } from "../subjects/subjects";
import { Screens } from "../components/topbar/topBar";
import { WeekRecord } from "./history";
import { CompDefinition, EnduranceDeals, Opponent } from "./comps/compTypes";
import { CompRole, THROW_EFFORT, throwChance } from "./comps/throwing";
import { KNOCKOUT_ID, KNOCKOUT_RULES } from "./comps/knockout";
import { compById, finaleComps, pickQuickComp, pickWeeklyComp } from "./comps";
import { botPercentile } from "./comps/botScores";
import { sample, seededRand } from "./comps/random";
import { CompResult, tiedForFirst } from "./comps/compRunner";
import {
    ACTIONS_PER_BLOCK,
    answerPitch,
    Approach,
    botApproaches,
    botSocialTime,
    performSocialAction,
    shiftRelationship,
    DealAction,
    isDealAction,
    SocialAction,
    SocialMemory,
    SocialOutcome,
} from "./social/socialActions";
import { discussTarget, meetingSplit, fallBackToPlanB,
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
    MoveOutcome,
    proposeAlliance,
    pruneAlliances,
} from "./social/alliances";
import {
    answerVisitor,
    Deal,
    HohRoom,
    openHohRoom,
    RoomOutcome,
    settleNominations,
    visitBotHoh,
    VisitPitch,
} from "./social/hohRoom";
import { botPawnTalk, nominationHit, PawnTalk, settlePawnTalk } from "./social/pawnTalk";
import { evictionSpeech, nominationSpeech, SpeechResult, SpeechToneId, vetoSpeech } from "./social/speeches";
import { SpeechTone } from "./ui/speechPrompt";
import { botGuess, closestGuesses, makeTiebreaker, TiebreakGuess, TiebreakQuestion } from "./comps/tiebreaker";
import { DAY_PART, dayLabel, dayOf, totalWeeks, weekStartDay } from "./days";
import {
    ALL_POWERS,
    audienceScore,
    botExtraVote,
    botGhostSwap,
    botNullify,
    botOverthrow,
    HOLDABLE,
    PowerId,
    POWERS,
    PowerSlot,
    PowersState,
    schedulePowers,
    surprisePowers,
} from "./social/powers";
import { FeedLine, houseFeed } from "./social/feed";
import { evictionIntro, finaleIntro, previouslyOn } from "./social/narration";
import { MoveRecord, seasonAwards, seasonStats } from "./social/awards";
import { listNames } from "../utils/listStrings";
import { HOH } from "./terms";
import {
    emptyLedger,
    final2Partners,
    isRevealed,
    reveal,
    trustLabel,
    shiftTrust,
    trustOf,
    honorChance,
    Ledger,
    LedgerNews,
    openPledges,
    pledge,
    promisedVotes,
    checkVoteClaims,
    compareNotes,
    settleEvictionPledges,
    settleFinalPledges,
    settleNominationPledges,
} from "./social/promises";
import {
    acceptFinal2,
    answerVoteQuestion,
    blameVote,
    botDealApproaches,
    offerFinal2,
    offerVoteDeal,
    pityPitch,
    rumorFor,
    tellTarget,
    tellVote,
} from "./social/campaign";
import { generateBlockbusterScene } from "./blockbusterScene";
import { getComp, getSocial } from "../model";
import { clearSave, writeSave } from "./save/serialize";
import { seedRng } from "./seeding";
import {
    apparentRelationship,
    assignPersonalities,
    hash01,
    PersonalityId,
    PersonalityInfo,
    PERSONALITIES,
    Situation,
    voice,
} from "./social/personality";
import { botShowmances, flirt, partnerOf, Showmance } from "./social/showmance";
import {
    botFight,
    botRumours,
    compWins,
    checkRumours,
    confront,
    exposeAllianceHoppers,
    houseMeeting,
    sidesText,
    snoop,
    spreadRumour,
    threatLevel,
    threatScoresFor,
    walkedInOn,
} from "./social/drama";
import { addGrudge, botJuryVote, emptyJury, grudgeOf, JuryBook, jurorType, JurorType, newcomerTalks, roundtable } from "./social/jury";
import { PawnTalk as PawnTalkRecord } from "./social/pawnTalk";
import { Answer, answer as answerJuror, botAnswer, botOwns, giveSpeech, JuryQuestion, juryQuestions, Move, movesFor } from "./social/finale";
import { shuffled } from "./comps/random";
import { feelingLabel } from "./social/socialActions";

export type Difficulty = "easy" | "normal" | "hard";

export enum Step {
    WeekStart = "WeekStart",
    SocialMorning = "SocialMorning",
    Hoh = "Hoh",
    AllianceHoh = "AllianceHoh", // alliances meet once the new HoH is known, before nominations
    HohRoom = "HohRoom",
    Noms = "Noms",
    PawnTalk = "PawnTalk",
    SocialAfternoon = "SocialAfternoon",
    Veto = "Veto",
    VetoCeremony = "VetoCeremony",
    SocialBlockbuster = "SocialBlockbuster",
    Blockbuster = "Blockbuster",
    SocialCampaign = "SocialCampaign",
    Speeches = "Speeches",
    Eviction = "Eviction",
    Fallout = "Fallout",
    SocialFinale1 = "SocialFinale1",
    FinaleHoh1 = "FinaleHoh1",
    SocialFinale2 = "SocialFinale2",
    FinaleHoh2 = "FinaleHoh2",
    SocialFinale3 = "SocialFinale3",
    FinaleHoh3 = "FinaleHoh3",
    FinalEviction = "FinalEviction",
    FinalTwo = "FinalTwo",
    Jury = "Jury",
    GameOver = "GameOver",
}

const SOCIAL_BLOCK_NAMES: { [step: string]: string } = {
    [Step.SocialMorning]: "Morning in the house",
    [Step.SocialAfternoon]: "Afternoon in the house",
    [Step.SocialBlockbuster]: "Before the Last Chance comp",
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
    [Step.SocialCampaign]: Step.Speeches,
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
    room?: HohRoom; // this week's HoH room one-on-ones
    pawns?: PawnTalk[]; // nominees who were told "you're not the target" this week
    pawnAsk?: { ids: number[]; next: Step }; // a player HoH gives a speech about these new nominees, then on to `next`
    spoke?: number[]; // nominees who have given their eviction-night speech
    wallDeals?: { hohId: number; toId: number }[]; // endurance deals: if `hohId` wins HoH, they owe `toId` safety
    intel?: { [askerId: number]: { [voterId: number]: number } }; // vote counting: what each voter said they'd do
    hinky?: { voterId: number; targetId: number }[]; // players whose vote went against the house
    goodbyes?: { playerId: number; evictedId: number }[]; // players who can send a message to someone they evicted
    juryHouse?: string[]; // what happened in the jury house this week
    roundtable?: string[]; // the finale jury roundtable, once it's happened
    // final-two speeches and jury questions, in progress
    finalTwo?: { spoke: number[]; questions: JuryQuestion[]; qIndex: number; transcript: string[] };
    meetingBy?: number[]; // players who called a house meeting this week
    secretHoh?: boolean; // nobody knows who the Head of House is this week
    audienceNominee?: boolean; // the audience names one of this week's nominees
    initialNoms?: number[]; // the nominees named at the nomination ceremony
    nominators?: { [nomineeId: number]: number }; // who put each nominee up (-1: the audience)
    ghostBy?: number; // used the Ghost Swap this week...
    ghostNominee?: number; // ...and put this houseguest on the block
    overthrowBy?: number; // used the Overthrow this week
    swapChecked?: boolean;
    overthrowChecked?: boolean;
    evictionIntro?: boolean;
    finaleIntro?: boolean;
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
    deals?: Deal[]; // safety deals struck in the HoH room (they run into the following week)
    ledger?: Ledger; // every promise and claim, kept or broken, and everyone's reputation
    personalities?: { [id: number]: PersonalityId }; // every bot's (secret) personality
    showmances?: Showmance[];
    jury?: JuryBook; // what every juror holds against (or for) everyone, and why they voted
    overheard?: { [playerId: number]: number[] }; // alliances each player has overheard
    // What each player has picked up from talking to people: how they seemed (v) and how much they seemed
    // to believe the player (t), and on which day. Relationships themselves are never shown.
    reads?: { [viewerId: number]: { [otherId: number]: { v: number; day: number; t?: number; td?: number } } };
    // Everything else each player has found out about each houseguest (overheard alliances, targets...), dated.
    dossier?: { [viewerId: number]: { [otherId: number]: { day: number; text: string }[] } };
    statsHidden?: boolean; // skill randomizer: Social/Comp scores are random and secret until the end
    difficulty?: Difficulty; // how well bots play comps, and how strategically they vote
    powers?: PowersState; // the season's secret powers: which, when, and who holds them
    announce?: { title: string; lines: string[] }[]; // the host's announcements, shown before the next step
    moves?: MoveRecord[]; // big moves and backstabs, for the season awards
    feed?: FeedLine[]; // the live feed: what the house has been up to
    // custom relationships / teams for this season's houseguests (remapped when playing with part of the cast)
    castOptions?: CastOptionsOverride;
}

export type Prompt =
    | { kind: "scene"; scene: Scene }
    | { kind: "handoff"; playerId: number; reason: string; next: () => void }
    | { kind: "social"; blockName: string; actorId: number }
    | { kind: "alliance"; blockName: string; actorId: number }
    | { kind: "hohRoom"; actorId: number } // the HoH hears out whoever came up
    | { kind: "hohVisit"; actorId: number } // a player decides whether to go up to the HoH room
    | {
          kind: "compPlay";
          title: string;
          comp: CompDefinition;
          participants: Houseguest[];
          playerId: number;
          seed: number;
          opponents: Opponent[];
          moreToPlay: boolean;
          deals?: EnduranceDeals;
          onScore: (score: number, answers?: boolean[], picks?: (number | string)[]) => void;
      }
    | {
          kind: "knockout";
          title: string;
          lines: string[];
          remaining: Houseguest[];
          out: Houseguest[];
          winnerId?: number;
          onDone: () => void;
      }
    | {
          kind: "compResults";
          title: string;
          comp: CompDefinition;
          participants: Houseguest[];
          results: CompResult[];
          tiedIds?: number[]; // a tie for first that a tiebreaker question will settle
          spectating?: boolean; // no players in it: the players watch the results come in
          sealed?: boolean; // a secret Head of House week: the winner stays a secret
          onDone: (winnerId: number) => void;
      }
    | {
          kind: "tiebreak";
          title: string;
          question: TiebreakQuestion;
          tied: Houseguest[];
          playerId: number;
          moreToPlay: boolean;
          heading?: string;
          intro?: string;
          onGuess: (guess: number) => void;
      }
    | {
          kind: "tiebreakResults";
          title: string;
          question: TiebreakQuestion;
          tied: Houseguest[];
          guesses: TiebreakGuess[];
          winnerId?: number; // none: still tied, another question follows
          sealed?: boolean; // a secret Head of House week: the winner stays a secret
          onDone: () => void;
      }
    | {
          kind: "speech";
          actorId: number;
          title: string;
          text: string;
          tones: SpeechTone[];
          deliver: (toneId: string, ids: number[]) => string[];
          next: () => void;
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
          promisedIds?: number[]; // houseguests the player promised safety (picking them breaks the promise)
          resolve: (ids: number[]) => void;
      }
    | { kind: "ownMoves"; actorId: number; moves: Move[]; onDone: (ids: string[]) => void }
    | { kind: "juryQuestion"; actorId: number; jurorId: number; question: JuryQuestion; onAnswer: (a: Answer) => void }
    | { kind: "juryReveal"; votes: { jurorId: number; finalistId: number }[]; onDone: () => void }
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
            (a) => alive(a.fromId) && (a.kind !== "pitch" || alive(a.targetId)) && (a.kind !== "sides" || alive(a.otherId))
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

    // Plan B only matters in Blockbuster weeks, where the target can still win the Last Chance comp.
    public get planBWeek(): boolean {
        return !!this.state.week.blockbuster;
    }

    // The target came off the block: alliances with a plan B on the block switch to it.
    private planB() {
        const s = this.state;
        if (!this.planBWeek) return;
        const block = (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted);
        if (block.length === 0) return;
        fallBackToPlanB(s.gameState, s.book, block).forEach(({ alliance, from, to }) =>
            this.tellAlliance(
                alliance,
                `🔁 ${this.player(from).name} is off the block. ${alliance.name} goes to plan B: ${this.player(to).name}.`
            )
        );
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
        this.logMove("backstab", betrayerId, victimId, `${this.player(betrayerId).name} turned on alliance mate ${this.player(victimId).name}`, 3);
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
        seedRng(`${s.seed}:${s.gameState.phase}:${s.step}:${s.socialTurn}:${s.socialStage}:${s.actionsLeft}:${extra}`);
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

    // ---------- the host ----------

    private announce(title: string, lines: string[]) {
        this.state.announce = [...(this.state.announce || []), { title, lines }];
    }

    private showAnnouncement() {
        const s = this.state;
        const a = s.announce!.shift()!;
        const scene = this.textScene(a.title, a.lines);
        this.weekScenes.push(scene);
        this.save();
        this.show({ kind: "scene", scene });
    }

    // A simple scene of lines, with a Continue button.
    private textScene(title: string, lines: string[]): Scene {
        return new Scene({
            title,
            gameState: this.state.gameState,
            content: (
                <div style={{ textAlign: "center" }}>
                    <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>{title}</h3>
                    {lines.map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                    <NextEpisodeButton />
                </div>
            ),
        });
    }

    // A ceremony scene with the twists that happened during it written on top.
    private withNotes(scene: Scene, notes: string[]): Scene {
        if (notes.length === 0) return scene;
        return new Scene({
            title: scene.title,
            gameState: scene.gameState,
            content: (
                <div>
                    {notes.map((note, i) => (
                        <p key={i} style={{ textAlign: "center", fontWeight: 700 }}>
                            {note}
                        </p>
                    ))}
                    {scene.content}
                </div>
            ),
        });
    }

    // ---------- the live feed ----------

    private feedPush(...lines: string[]) {
        const s = this.state;
        const day = this.currentDay();
        s.feed = [...(s.feed || []), ...lines.map((text) => ({ day, text }))].slice(-30);
    }

    public feedLines(): FeedLine[] {
        return (this.state.feed || []).slice(-10);
    }

    // ---------- difficulty ----------

    get difficulty(): Difficulty {
        return this.state.difficulty || "normal";
    }

    // A bot's comp performance, adjusted for difficulty.
    private botSkill(hg: Houseguest): number {
        const shift = { easy: -0.12, normal: 0, hard: 0.08 }[this.difficulty];
        return Math.max(0, Math.min(1, botPercentile(hg) + shift));
    }

    // How strategically bots play: going after threats with their votes and nominations, or voting on feelings.
    private strategy(): { threatVote: number; threatNom: number; gut: number } {
        const late = this.lateness();
        if (this.difficulty === "easy") return { threatVote: 0.05 + 0.15 * late, threatNom: 0.15 + 0.25 * late, gut: 0.25 };
        if (this.difficulty === "hard") return { threatVote: 0.3 + 0.4 * late, threatNom: 0.5 + 0.4 * late, gut: 0 };
        return { threatVote: 0.15 + 0.3 * late, threatNom: 0.3 + 0.4 * late, gut: 0 };
    }

    // ---------- secret powers ----------

    get powers(): PowersState {
        if (!this.state.powers) this.state.powers = { enabled: [], slots: [] };
        return this.state.powers;
    }

    // A power that's been handed out, hasn't been used, and can still be: its holder is in the house,
    // and there are more than four houseguests left.
    private activePower(id: PowerId): PowerSlot | undefined {
        const slot = this.powers.slots.find((sl) => sl.id === id && sl.holderId !== undefined && !sl.used);
        if (!slot || this.player(slot.holderId!).isEvicted) return undefined;
        return nonEvictedHouseguests(this.gameState).length > 4 ? slot : undefined;
    }

    // The power a houseguest secretly holds, if any (for their own screen).
    public heldPower(id: number) {
        const slot = this.powers.slots.find((sl) => sl.holderId === id && !sl.used);
        return slot && !this.player(id).isEvicted ? POWERS[slot.id] : undefined;
    }

    // The houseguests a bot holder looks out for: its final-two partners and its showmance.
    private partnersOf(id: number): number[] {
        const love = partnerOf(this.showmances, id);
        return [...final2Partners(this.ledger, id), ...(love !== undefined ? [love] : [])];
    }

    // How much the audience loves each houseguest (a little random: audiences are fickle).
    private audienceScores(ids: number[], key: string): { [id: number]: number } {
        this.reseed(`audience:${key}`);
        const rand = () => Math.abs(rng().randomFloat());
        const out: { [id: number]: number } = {};
        ids.forEach(
            (id) =>
                (out[id] = audienceScore(this.gameState, this.state.history, this.player(id), this.personalities[id], partnerOf(this.showmances, id) !== undefined, rand))
        );
        return out;
    }

    // The audience's least favorite of `ids` (for its nominee).
    private audiencePick(ids: number[]): number {
        const score = this.audienceScores(ids, ids.join(","));
        return [...ids].sort((a, b) => score[a] - score[b])[0];
    }

    // This week's twists, and the powers due to be handed out.
    private startWeekPowers() {
        const s = this.state;
        const week = s.gameState.phase;
        const due = (id: PowerId) => this.powers.slots.find((sl) => sl.id === id && sl.week === week);
        s.week.secretHoh = !!due("secretHoh");
        s.week.audienceNominee = !!due("audience");
        const audience = this.powers.enabled.includes("audience");
        this.powers.slots
            .filter((sl) => HOLDABLE.includes(sl.id) && sl.week === week && sl.holderId === undefined)
            .forEach((sl) => {
                const holders = this.powers.slots.filter((x) => x.holderId !== undefined && !x.used).map((x) => x.holderId!);
                const pool = nonEvictedHouseguests(s.gameState).filter((hg) => !holders.includes(hg.id));
                if (pool.length === 0) return;
                let holder: Houseguest;
                if (audience) {
                    const score = this.audienceScores(
                        pool.map((hg) => hg.id),
                        `power:${sl.id}`
                    );
                    holder = [...pool].sort((a, b) => score[b.id] - score[a.id])[0];
                } else {
                    this.reseed(`power:${sl.id}`);
                    holder = pool[Math.floor(Math.abs(rng().randomFloat()) * pool.length)];
                }
                sl.holderId = holder.id;
                const info = POWERS[sl.id];
                this.tell([holder.id], `🤫 ${audience ? "The audience voted, and you" : "You"} secretly received the ${info.emoji} ${info.name}. ${info.howTo}`);
                this.announce("🤫 A secret power", [
                    audience
                        ? "📺 The audience has voted, and somewhere in this house, one houseguest just received a secret power."
                        : "Somewhere in this house, one houseguest just received a secret power.",
                    "Who has it, and what it does? Nobody's saying.",
                ]);
            });
    }

    // Hidden Immunity: a nominee holding it can play it to come off the block. `repick(index, exclude, cb)`
    // names someone else for that slot (and they might hold it too, so it's checked again).
    private immunityCheck(
        nominees: number[],
        repick: (index: number, exclude: number[], cb: (id: number) => void) => void,
        done: (final: number[], notes: string[]) => void,
        notes: string[] = [],
        tried: number[] = []
    ) {
        const slot = this.activePower("immunity");
        const index = slot ? nominees.indexOf(slot.holderId!) : -1;
        if (!slot || index < 0) return done(nominees, notes);
        const holder = this.player(slot.holderId!);
        const play = () => {
            slot.used = true;
            const note = `🛡️ ${holder.name} played ${POWERS.immunity.name} and is off the block!`;
            this.logMove("move", holder.id, undefined, `${holder.name} played ${POWERS.immunity.name} to escape the block`, 2);
            this.feedPush(note);
            repick(index, [...nominees, ...tried, holder.id], (id) => {
                const next = [...nominees];
                next[index] = id;
                this.immunityCheck(next, repick, done, [...notes, note], [...tried, holder.id]);
            });
        };
        if (!this.isHuman(holder)) return play();
        this.privately(holder.id, `${holder.name}, you've been nominated`, () =>
            this.show({
                kind: "choose",
                actorId: holder.id,
                title: POWERS.immunity.name,
                text: `You've been nominated, and you hold ${POWERS.immunity.name}. Play it now to come off the block? Whoever nominated you has to pick someone else.`,
                options: [holder],
                count: 1,
                confirmLabel: "🛡️ Play it",
                noneLabel: "Keep it for later",
                resolve: (ids) => (ids.length > 0 ? play() : done(nominees, notes)),
            })
        );
    }

    // The Head of House names someone else (Hidden Immunity, mostly).
    private hohRepick(hoh: Houseguest, pool: Houseguest[], text: string, cb: (id: number) => void) {
        if (pool.length === 0) return cb(-1);
        if (!this.isHuman(hoh)) return cb(botNominate(this.gameState, this.book, hoh, pool, 1, this.roomSway()).picks[0].id);
        this.privately(hoh.id, `${hoh.name}, ${HOH}`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Replacement Nominee",
                text,
                options: pool,
                count: 1,
                confirmLabel: "Nominate",
                resolve: (ids) => cb(ids[0]),
            })
        );
    }

    // Writes new nominees into the week (and the voting table's log).
    private setNominees(ids: number[], postVeto: boolean) {
        const s = this.state;
        s.week.nomineeIds = ids;
        this.mutate((gs) => {
            const log = gs.currentLog as any;
            if (!log) return;
            const names = ids.map((id) => getById(gs, id).name).sort();
            if (postVeto) log.nominationsPostVeto = names;
            else log.nominationsPreVeto = names;
        });
    }

    // Before the veto: the Ghost Swap takes one nominee off the block and puts someone else up. Anonymously.
    private ghostSwap(slot: PowerSlot, next: () => void) {
        const s = this.state;
        const holder = this.player(slot.holderId!);
        const noms = s.week.nomineeIds || [];
        const candidates = () =>
            nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== s.week.hohId && hg.id !== holder.id && !(s.week.nomineeIds || []).includes(hg.id));
        const apply = (remove: number, add: number, notes: string[]) => {
            slot.used = true;
            const ids = (s.week.nomineeIds || []).map((id) => (id === remove ? add : id));
            this.setNominees(ids, false);
            s.week.nominators = { ...(s.week.nominators || {}), [add]: holder.id };
            s.week.ghostBy = holder.id;
            s.week.ghostNominee = add;
            const line = `👻 Someone used the ${POWERS.ghostSwap.name}! ${this.player(remove).name} is off the block, and ${this.player(add).name} has been nominated in their place.`;
            this.feedPush(line);
            this.announce(`${POWERS.ghostSwap.emoji} ${POWERS.ghostSwap.name}`, [...notes, line, "Who did it? Nobody knows."]);
            this.save();
            next();
        };
        // the replacement may hold Hidden Immunity: then the swapper picks again
        const withImmunity = (remove: number, add: number) => {
            const repick = (_i: number, exclude: number[], cb: (id: number) => void) => {
                const pool = candidates().filter((hg) => !exclude.includes(hg.id));
                if (pool.length === 0) return cb(-1);
                if (!this.isHuman(holder)) return cb([...pool].sort((a, b) => holder.relationships[a.id] - holder.relationships[b.id])[0].id);
                this.privately(holder.id, `${holder.name}, your ${POWERS.ghostSwap.name}`, () =>
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: POWERS.ghostSwap.name,
                        text: "They played Hidden Immunity. Pick someone else to put on the block.",
                        options: pool,
                        count: 1,
                        confirmLabel: "Nominate",
                        resolve: (ids) => cb(ids[0]),
                    })
                );
            };
            this.immunityCheck([add], repick, (final, notes) => (final[0] >= 0 ? apply(remove, final[0], notes) : next()));
        };
        if (!this.isHuman(holder)) {
            const pick = botGhostSwap(
                s.gameState,
                this.book,
                holder.id,
                noms,
                candidates().map((hg) => hg.id),
                this.partnersOf(holder.id)
            );
            return pick ? withImmunity(pick.remove, pick.add) : next();
        }
        this.privately(holder.id, `${holder.name}, your ${POWERS.ghostSwap.name}`, () =>
            this.show({
                kind: "choose",
                actorId: holder.id,
                title: `${POWERS.ghostSwap.emoji} ${POWERS.ghostSwap.name}`,
                text: `Before the veto, you can take one nominee off the block and put someone else up. Nobody will know it was you.`,
                options: noms.map((id) => this.player(id)),
                count: 1,
                confirmLabel: "Take them off the block",
                noneLabel: "Not this week",
                resolve: (removed) => {
                    if (removed.length === 0) return next();
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: `${POWERS.ghostSwap.emoji} ${POWERS.ghostSwap.name}`,
                        text: `${this.player(removed[0]).name} is coming off the block. Who goes up in their place?`,
                        options: candidates(),
                        count: 1,
                        confirmLabel: "Nominate",
                        resolve: (added) => withImmunity(removed[0], added[0]),
                    });
                },
            })
        );
    }

    // Eviction night: the Overthrow dethrones the Head of House, and its holder names new nominees. Publicly.
    private overthrow(slot: PowerSlot, next: () => void) {
        const s = this.state;
        const holder = this.player(slot.holderId!);
        const noms = s.week.nomineeIds || [];
        const candidates = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== s.week.hohId && hg.id !== holder.id);
        const apply = (ids: number[]) => {
            slot.used = true;
            this.setNominees(ids, true);
            s.week.overthrowBy = holder.id;
            s.week.nominators = {};
            ids.forEach((id) => (s.week.nominators![id] = holder.id));
            s.week.spoke = [];
            this.mutate((gs) => {
                if (s.week.hohId !== undefined && !s.week.secretHoh) shiftRelationship(gs, holder.id, s.week.hohId, -0.25);
                ids.forEach((id) => shiftRelationship(gs, holder.id, id, -0.15));
            });
            const line = `⚡ ${holder.name} used the ${POWERS.overthrow.name}! The ${HOH} has been dethroned, and ${holder.name} has nominated ${listNames(
                ids.map((id) => this.player(id).name)
            )}.`;
            this.feedPush(line);
            this.announce(`${POWERS.overthrow.emoji} ${POWERS.overthrow.name}`, [line]);
            this.save();
            next();
        };
        if (!this.isHuman(holder)) {
            const pick = botOverthrow(
                s.gameState,
                this.book,
                holder.id,
                noms,
                candidates.map((hg) => hg.id),
                noms.length,
                this.partnersOf(holder.id)
            );
            return pick ? apply(pick) : next();
        }
        this.privately(holder.id, `${holder.name}, your ${POWERS.overthrow.name}`, () =>
            this.show({
                kind: "choose",
                actorId: holder.id,
                title: `${POWERS.overthrow.emoji} ${POWERS.overthrow.name}`,
                text: `Tonight's nominees are ${listNames(noms.map((id) => this.player(id).name))}. Overthrow the ${HOH} and name ${
                    noms.length
                } new nominees? Everyone will know it was you.`,
                options: candidates,
                count: noms.length,
                confirmLabel: "⚡ Overthrow",
                noneLabel: "Not tonight",
                resolve: (ids) => (ids.length > 0 ? apply(ids) : next()),
            })
        );
    }

    // In a secret Head of House week, only the HoH (and nobody else) sees who it is.
    public publicHohId(viewerId?: number): number | undefined {
        const s = this.state;
        if (!s.week.secretHoh) return s.week.hohId;
        return viewerId !== undefined && viewerId === s.week.hohId ? s.week.hohId : undefined;
    }

    private sealed(): boolean {
        return !!this.state.week.secretHoh && this.state.step === Step.Hoh;
    }

    // Who a newly evicted juror blames for being on the block (nobody, if they can't know).
    private blameFor(evictedId: number): number | undefined {
        const s = this.state;
        const by = s.week.nominators ? s.week.nominators[evictedId] : undefined;
        if (s.week.ghostNominee === evictedId) return undefined; // anonymous
        if (by === -1) return undefined; // the audience
        if (by !== undefined && by !== s.week.hohId) return by; // the Overthrow
        return s.week.secretHoh ? undefined : s.week.hohId;
    }

    // ---------- season awards ----------

    private logMove(kind: "move" | "backstab", actorId: number, targetId: number | undefined, text: string, weight: number) {
        const s = this.state;
        s.moves = [...(s.moves || []), { week: s.gameState.phase, kind, actorId, targetId, text, weight }];
    }

    private goTo(step: Step) {
        this.state.step = step;
        this.save();
        this.run();
    }

    private run(): void {
        this.reseed();
        // the host has something to say first
        if (this.state.announce && this.state.announce.length > 0) return this.showAnnouncement();
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
            case Step.AllianceHoh:
                return this.allianceHoh();
            case Step.HohRoom:
                return this.hohRoom();
            case Step.Noms:
                return this.nominations();
            case Step.PawnTalk:
                return this.pawnTalk();
            case Step.Veto:
                return this.vetoComp();
            case Step.VetoCeremony:
                return this.vetoCeremony();
            case Step.Speeches:
                return this.speeches();
            case Step.Eviction:
                return this.eviction();
            case Step.Fallout:
                return this.fallout();
            case Step.FinaleHoh1:
            case Step.FinaleHoh2:
            case Step.FinaleHoh3:
                return this.finaleHoh();
            case Step.FinalTwo:
                return this.finalTwo();
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
    // Some bots throw the comp: they'd rather not win it (see throwing.ts).
    private simulateBots(comp: CompDefinition, participants: Houseguest[], seed: number, role: CompRole): CompResult[] {
        const ctx = { seed, gameState: this.gameState, history: this.state.history, participants };
        return participants
            .filter((hg) => !this.isHuman(hg))
            .map((hg) => {
                const info = this.traitsOf(hg.id);
                const throwing = throwChance(this.gameState, this.book, hg, role, this.state.week) * (info ? info.throws : 1);
                const threw = Math.abs(rng().randomFloat()) < throwing;
                const percentile = Math.max(0, Math.min(1, this.botSkill(hg) + this.compBoost(hg.id, comp, seed)));
                const skill = percentile * (threw ? THROW_EFFORT : 1);
                const result = comp.simulate(ctx, skill, seededRand(hashcode(`${seed}:bot:${hg.id}`)));
                return { id: hg.id, score: result.score, answers: result.answers, picks: result.picks, threw };
            });
    }

    // Deals on the wall in an endurance HoH comp: "drop and you're safe this week". Whoever ends up HoH owes
    // that safety going into the HoH room, and can honor it or break it like any other promise.
    private wallDeals(player: Houseguest, bots: CompResult[], seed: number): EnduranceDeals {
        const week = this.state.week;
        const noise = seededRand(hashcode(`${seed}:deals:${player.id}`));
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
                if (noise() >= p) return false;
                bot.score = seconds;
                record(player.id, botId);
                return true;
            },
            accept: (botId) => record(botId, player.id),
        };
    }

    private noteComp(comp: CompDefinition) {
        this.state.usedComps = [...this.state.usedComps, comp.id];
    }

    // Runs a competition: every player in it takes a turn (same seed), then everyone sees the results.
    private runComp(
        title: string,
        comp: CompDefinition,
        participants: Houseguest[],
        onWinner: (id: number) => void,
        role: CompRole = "other"
    ) {
        const seed = hashcode(`${this.state.seed}:${this.gameState.phase}:${this.state.step}:${comp.id}`);
        const bots = this.simulateBots(comp, participants, seed, role);
        const humans = this.playingHumans(participants);
        const done = (winnerId: number) => {
            this.noteComp(comp);
            onWinner(winnerId);
        };
        if (humans.length === 0) {
            // nobody's playing, but everyone can watch: the results come in from last place up.
            // A tie for first goes to the tiebreaker, like any other.
            const tiedIds = tiedForFirst(comp, bots);
            const tie = tiedIds.length > 1;
            this.show({
                kind: "compResults",
                title,
                comp,
                participants,
                results: bots,
                spectating: !this.sealed(),
                sealed: this.sealed(),
                tiedIds: tie ? tiedIds : undefined,
                onDone: () => (tie ? this.tiebreak(title, tiedIds, seed, done) : done(tiedIds[0])),
            });
            return;
        }
        const humanResults: CompResult[] = [];
        const byId = (id: number) => getById(this.gameState, id);
        const turn = (i: number) => {
            if (i >= humans.length) {
                // any tie for first goes to a tiebreaker question
                const results = [...bots, ...humanResults];
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
                return;
            }
            const player = humans[i];
            const opponents: Opponent[] = [...bots, ...humanResults].map((r) => ({
                hg: byId(r.id),
                score: r.score,
                answers: r.answers,
                picks: r.picks,
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
                    deals: role === "hoh" && comp.kind === "endurance" ? this.wallDeals(player, bots, seed) : undefined,
                    onScore: (score, answers, picks) => {
                        humanResults.push({ id: player.id, score, answers, picks });
                        turn(i + 1);
                    },
                })
            );
        };
        turn(0);
    }

    // A knockout HoH comes up once a season, while there are enough houseguests for it to hurt.
    private useKnockout(competitors: Houseguest[]): boolean {
        return (
            !this.state.week.secretHoh &&
            !this.state.usedComps.includes(KNOCKOUT_ID) &&
            competitors.length >= 5 &&
            this.playingHumans(competitors).length > 0 &&
            Math.abs(rng().randomFloat()) < 0.3
        );
    }

    // Knockout: duels on a closest-number question. The loser is out, and the winner picks the next two.
    // Picking someone for a duel is a public shot at them, so it costs the picker with whoever they pick.
    private runKnockout(title: string, participants: Houseguest[], onWinner: (id: number) => void) {
        const s = this.state;
        const seed = hashcode(`${s.seed}:${this.gameState.phase}:${s.step}:${KNOCKOUT_ID}`);
        const noise = seededRand(seed);
        const name = (id: number) => this.player(id).name;
        let remaining = participants.map((p) => p.id);
        const out: number[] = [];
        const picks: { pickerId: number; ids: number[] }[] = [];
        let lines: string[] = [KNOCKOUT_RULES];
        let round = 0;

        // shows what happened since the players last looked, then carries on
        const board = (next: () => void, winnerId?: number) => {
            if (lines.length === 0 && winnerId === undefined) return next();
            const shown = lines;
            lines = [];
            this.show({
                kind: "knockout",
                title,
                lines: shown,
                remaining: remaining.map((id) => this.player(id)),
                out: out.map((id) => this.player(id)),
                winnerId,
                onDone: next,
            });
        };

        const finish = () => {
            const winnerId = remaining[0];
            this.mutate((gs) => picks.forEach((p) => p.ids.forEach((id) => shiftRelationship(gs, p.pickerId, id, -0.05))));
            picks.forEach((p) => p.ids.forEach((id) => this.tell([id], `⚔️ ${name(p.pickerId)} picked you to duel in the knockout.`)));
            s.usedComps = [...s.usedComps, KNOCKOUT_ID];
            board(() => onWinner(winnerId), winnerId);
        };

        const duel = (pickerId: number | null, a: number, b: number) => {
            round++;
            const duelSeed = hashcode(`${seed}:duel:${round}`);
            const question = makeTiebreaker(duelSeed);
            const pair = [a, b].map((id) => this.player(id));
            const guesses: TiebreakGuess[] = pair
                .filter((hg) => !this.isHuman(hg))
                .map((hg) => ({ id: hg.id, guess: botGuess(question, this.botSkill(hg), seededRand(hashcode(`${duelSeed}:${hg.id}`))) }));
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
                nextPick(winner);
            };
            const turn = (i: number) => {
                if (i >= humans.length) return settle();
                const player = humans[i];
                const rival = pair.find((hg) => hg.id !== player.id)!;
                board(() =>
                    this.privately(player.id, `${player.name}'s knockout duel`, () =>
                        this.show({
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
                            moreToPlay: i + 1 < humans.length,
                            onGuess: (guess) => {
                                guesses.push({ id: player.id, guess });
                                turn(i + 1);
                            },
                        })
                    )
                );
            };
            turn(0);
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
            if (!this.isHuman(picker)) {
                // bots send the houseguests they like least into the duel
                const keyed = options.map((id) => ({ id, key: picker.relationships[id] + 0.2 * noise() }));
                keyed.sort((x, y) => x.key - y.key);
                return go(keyed.slice(0, 2).map((k) => k.id));
            }
            board(() =>
                this.privately(pickerId, `${picker.name}, pick the next duel`, () =>
                    this.show({
                        kind: "choose",
                        actorId: pickerId,
                        title: "Knockout: pick the next duel",
                        text: "You won your duel, so you choose the next two to face off. The loser is out of the comp. Everyone sees who you pick, and nobody likes being picked.",
                        options: options.map((id) => this.player(id)),
                        count: 2,
                        confirmLabel: "Send them to duel",
                        resolve: go,
                    })
                )
            );
        };

        const [first, second] = sample(noise, remaining, 2);
        duel(null, first, second);
    }

    // The tiebreaker: everyone tied for first answers one closest-number question.
    private tiebreak(title: string, tiedIds: number[], seed: number, done: (winnerId: number) => void, round: number = 0) {
        const question = makeTiebreaker(hashcode(`${seed}:tiebreak${round ? `:${round}` : ""}`));
        const tied = tiedIds.map((id) => this.player(id));
        const guesses: TiebreakGuess[] = tied
            .filter((hg) => !this.isHuman(hg))
            .map((hg) => ({
                id: hg.id,
                guess: botGuess(question, this.botSkill(hg), seededRand(hashcode(`${seed}:tiebreak:${round}:${hg.id}`))),
            }));
        const humans = this.playingHumans(tied);
        const turn = (i: number) => {
            if (i >= humans.length) {
                const closest = closestGuesses(question.answer, guesses);
                const again = closest.length > 1;
                this.show({
                    kind: "tiebreakResults",
                    title,
                    question,
                    tied,
                    guesses,
                    winnerId: again ? undefined : closest[0],
                    sealed: this.sealed(),
                    onDone: () => (again ? this.tiebreak(title, closest, seed, done, round + 1) : done(closest[0])),
                });
                return;
            }
            const player = humans[i];
            this.privately(player.id, `${player.name}'s turn at the tiebreaker`, () =>
                this.show({
                    kind: "tiebreak",
                    title,
                    question,
                    tied,
                    playerId: player.id,
                    moreToPlay: i + 1 < humans.length,
                    onGuess: (guess) => {
                        guesses.push({ id: player.id, guess });
                        turn(i + 1);
                    },
                })
            );
        };
        turn(0);
    }

    // The day of the season (1 to 90) for whatever is happening now.
    public dayText(): string | null {
        const s = this.state;
        const week = s.gameState.phase;
        if (week < 1) return null;
        const parts: { [step: string]: number } = {
            [Step.WeekStart]: DAY_PART.eviction, // the eviction scene is still on screen
            [Step.SocialMorning]: DAY_PART.hoh,
            [Step.Hoh]: DAY_PART.hoh,
            [Step.AllianceHoh]: DAY_PART.nominations,
            [Step.HohRoom]: DAY_PART.nominations,
            [Step.Noms]: DAY_PART.nominations,
            [Step.PawnTalk]: DAY_PART.nominations,
            [Step.SocialAfternoon]: DAY_PART.veto,
            [Step.Veto]: DAY_PART.veto,
            [Step.VetoCeremony]: DAY_PART.vetoCeremony,
            [Step.SocialBlockbuster]: DAY_PART.blockbuster,
            [Step.Blockbuster]: DAY_PART.blockbuster,
            [Step.SocialFinale1]: 0,
            [Step.FinaleHoh1]: 0,
            [Step.SocialFinale2]: 0.35,
            [Step.FinaleHoh2]: 0.35,
            [Step.SocialFinale3]: 0.7,
            [Step.FinaleHoh3]: 0.7,
        };
        const part = parts[s.step];
        return dayLabel(s.gameState, week, part === undefined ? DAY_PART.eviction : part);
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
        s.deals = this.deals.filter((d) => d.week >= s.gameState.phase - 1);
        s.humanIds.forEach((id) => (this.socialMemory(id).chatsThisWeek = {}));
        s.socialLog = [];
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = ACTIONS_PER_BLOCK;
        pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
        const title = finale ? "Finale" : `Day ${weekStartDay(s.gameState, s.gameState.phase)}`;
        s.step = finale ? Step.SocialFinale1 : Step.SocialMorning;
        // "Previously on…": last week, and last week's secret Head of House, revealed
        const last = s.history[s.history.length - 1];
        const lastSecret = !!last && this.powers.slots.some((sl) => sl.id === "secretHoh" && sl.week === last.week);
        const recap = previouslyOn(s.gameState, last, [], lastSecret && last.hohId !== undefined ? this.player(last.hohId).name : undefined);
        if (!finale) this.startWeekPowers();
        if (s.week.secretHoh)
            this.announce(`🕶️ ${POWERS.secretHoh.name}`, [`This week, the ${HOH} will be a secret. Nobody will know who it is, or who made the nominations.`]);
        this.save();
        this.show({
            kind: "scene",
            scene: new Scene({
                title,
                gameState: s.gameState,
                content: (
                    <div>
                        <div className="bbb-host">
                            {recap.map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                        {defaultContent(s.gameState)}
                    </div>
                ),
            }),
        });
    }

    private social() {
        const s = this.state;
        const alive = this.alivePlayers;
        if (s.socialTurn >= alive.length) return this.finishSocialBlock();
        const actor = alive[s.socialTurn];
        const blockName = SOCIAL_BLOCK_NAMES[s.step];
        if (s.socialStage === "alliance") {
            // at the final three there's nobody left to target: no alliance time
            if (this.alliancesOf(actor.id).length === 0 || !this.allianceTimeOpen()) return this.endAlliance();
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
            const fresh = this.mutate((gs) => botApproaches(gs, s.book, actor.id, s.humanIds)).map((a) =>
                a.kind === "chat" && this.personalities[a.fromId]
                    ? { ...a, text: `${this.player(a.fromId).name} ${this.say(a.fromId, "chat", `${s.step}:${actor.id}`)}` }
                    : a
            );
            const deals = botDealApproaches(
                new MutableGameState(s.gameState),
                this.ledger,
                actor.id,
                s.humanIds,
                s.week.nomineeIds || [],
                s.step === Step.SocialCampaign,
                s.week.hohId
            );
            s.approaches[actor.id] = [...(s.approaches[actor.id] || []), ...fresh, ...deals];
            [...fresh, ...deals].forEach((a) => this.noteRead(actor.id, a.fromId));
            this.save();
        }
        this.privately(actor.id, `${actor.name}'s social time`, () => this.show({ kind: "social", blockName, actorId: actor.id }));
    }

    // Called by the social screen.
    public socialAct(action: SocialAction): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        if (s.actionsLeft <= 0 || !actor) return null;
        if (action.kind === "meeting" && (s.actionsLeft < 2 || (s.week.meetingBy || []).includes(actor.id))) return null;
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
        } else if (isDealAction(action)) {
            outcome = this.mutate((gs) => this.dealAction(gs, actor.id, action));
        } else {
            outcome = this.mutate((gs) => performSocialAction(gs, actor.id, action, this.socialMemory(actor.id)));
        }
        s.actionsLeft -= action.kind === "meeting" ? 2 : 1;
        const withId = (action as { botId?: number }).botId;
        if (withId !== undefined) this.noteRead(actor.id, withId, action.kind !== "chat");
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
                    addMember(gs, existing, actor.id);
                    this.tellAlliance(existing, `🤝 ${actor.name} joined ${existing.name}.`, actor.id);
                    return { text: `You joined ${existing.name}!`, good: true };
                }
                const a = createAlliance(gs, s.book, [from.id, actor.id], approach.name);
                this.tell([from.id], `🤝 ${actor.name} said yes: ${a.name} is official.`);
                return { text: `You and ${from.name} formed ${a.name}!`, good: true };
            });
        }
        if (approach.kind === "final2") {
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.04);
                    return { text: `You told ${from.name} you're not ready to promise the final 2.`, good: false };
                }
                acceptFinal2(gs, this.ledger, from.id, actor.id, gs.phase);
                return { text: `Final-two deal with ${from.name}: the two of you, to the end.`, good: true };
            });
        } else if (approach.kind === "votePlea") {
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.03);
                    return { text: `You didn't promise ${from.name} your vote.`, good: false };
                }
                pledge(this.ledger, "vote", actor.id, from.id, gs.phase);
                pledge(this.ledger, "safety", from.id, actor.id, gs.phase + 1);
                shiftRelationship(gs, actor.id, from.id, 0.06);
                return { text: `You promised ${from.name} your vote. If they stay and win HoH, you're safe.`, good: true };
            });
        }
        if (outcome) s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.noteRead(actor.id, approach.fromId, approach.kind !== "chat");
        this.save();
        return outcome;
    }

    // Alliances pick targets only while there's an eviction vote to come: not at the final three.
    public allianceTimeOpen(): boolean {
        return nonEvictedHouseguests(this.gameState).length > 3;
    }

    // After the veto ceremony, alliance targets have to come from the block (whoever's nominated now).
    public targetBlock(): number[] | undefined {
        const s = this.state;
        if (s.step !== Step.SocialBlockbuster && s.step !== Step.SocialCampaign) return undefined;
        const block = (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted);
        return block.length > 0 ? block : undefined;
    }

    // ---------- reads: what players learn about how others feel ----------

    // The day of the season right now, as a number.
    public currentDay(): number {
        const text = this.dayText();
        return text ? parseInt(text.replace(/\D/g, ""), 10) || 1 : 1;
    }

    // Talking to someone gives the player a read on how they feel (as they act it: bots can fake it), and
    // dealing with them (deals, claims, questions) a read on how much they believe the player.
    public noteRead(viewerId: number, otherId: number, trust: boolean = false) {
        if (viewerId === otherId || !this.isHuman({ id: viewerId }) || this.isHuman({ id: otherId })) return;
        const s = this.state;
        if (!s.reads) s.reads = {};
        const mine = (s.reads[viewerId] = s.reads[viewerId] || {});
        const day = this.currentDay();
        mine[otherId] = { ...(mine[otherId] || {}), v: this.feelingOf(viewerId, otherId), day };
        if (trust) {
            mine[otherId].t = trustOf(this.ledger, otherId, viewerId);
            mine[otherId].td = day;
        }
    }

    // The player's latest read on how someone feels about them, if they have one. Reads go stale.
    public readOf(viewerId: number, otherId: number): { label: string; emoji: string; day: number; old: boolean } | null {
        const r = this.state.reads && this.state.reads[viewerId] && this.state.reads[viewerId][otherId];
        if (!r) return null;
        return { ...feelingLabel(r.v), day: r.day, old: this.currentDay() - r.day > 6 };
    }

    // Something a player found out about a houseguest: it goes in that houseguest's file.
    public noteIntel(viewerId: number, otherId: number, text: string) {
        if (viewerId === otherId || !this.isHuman({ id: viewerId })) return;
        const s = this.state;
        if (!s.dossier) s.dossier = {};
        const mine = (s.dossier[viewerId] = s.dossier[viewerId] || {});
        const notes = (mine[otherId] = mine[otherId] || []);
        const day = this.currentDay();
        if (notes.some((n) => n.text === text)) return;
        notes.push({ day, text });
    }

    public intelOn(viewerId: number, otherId: number): { day: number; text: string }[] {
        const mine = this.state.dossier && this.state.dossier[viewerId];
        return (mine && mine[otherId]) || [];
    }

    // A player overheard an alliance meeting: each houseguest in it gets a note in the player's files.
    private noteOverheard(gs: GameState, viewerId: number, allianceId: number) {
        const a = this.book.alliances.find((x) => x.id === allianceId);
        if (!a) return;
        const members = a.memberIds.filter((m) => !getById(gs, m).isEvicted);
        const target = a.target !== undefined && a.targetWeek === gs.phase && !getById(gs, a.target).isEvicted ? a.target : undefined;
        const name = (id: number) => (id === viewerId ? "you" : getById(gs, id).name);
        members.forEach((m) => {
            const others = members.filter((o) => o !== m);
            this.noteIntel(viewerId, m, `👂 Overheard in ${a.name}${others.length ? ` with ${others.map(name).join(", ")}` : ""}.`);
            if (target !== undefined) this.noteIntel(viewerId, m, `🎯 ${a.name} was going after ${name(target)}.`);
            if (target !== undefined && a.backup !== undefined && !getById(gs, a.backup).isEvicted)
                this.noteIntel(viewerId, m, `🔁 ${a.name}'s plan B: ${name(a.backup)}.`);
        });
        if (target !== undefined && target !== viewerId) this.noteIntel(viewerId, target, `🎯 ${a.name} is going after them (overheard).`);
    }

    // What a player knows about a houseguest, for their file: never their real relationships.
    public knownProfile(viewerId: number, otherId: number) {
        const gs = this.gameState;
        const other = this.player(otherId);
        const book = this.book;
        const overheard = this.overheardBy(viewerId);
        const name = (id: number) => (id === viewerId ? "You" : this.player(id).name);
        // alliances you know they're in: your own, and ones you overheard
        const alliances = book.alliances
            .filter((a) => a.memberIds.includes(otherId) && (a.memberIds.includes(viewerId) || overheard.includes(a.id)))
            .map((a) => ({
                name: a.name,
                yours: a.memberIds.includes(viewerId),
                members: a.memberIds.filter((m) => m !== otherId && !getById(gs, m).isEvicted).map(name),
            }));
        const showmance = this.showmancePartner(otherId);
        const pledges = this.ledger.pledges
            .filter((p) => (p.fromId === otherId && p.toId === viewerId) || (p.fromId === viewerId && p.toId === otherId))
            .filter((p) => p.status === "open" || p.known || p.fromId === viewerId);
        const said = ((this.state.week.intel || {})[viewerId] || {})[otherId];
        return {
            hg: other,
            read: this.readOf(viewerId, otherId),
            trust: this.trustReadOf(viewerId, otherId),
            alliances,
            showmance: showmance !== undefined ? name(showmance) : undefined,
            pledges: pledges.map((p) => ({
                text:
                    (p.fromId === viewerId ? `You promised ${other.name} ` : `${other.name} promised you `) +
                    (p.kind === "safety" ? "safety" : p.kind === "final2" ? "a final two" : "a vote"),
                status: p.status,
            })),
            voteSaid: said !== undefined ? this.player(said).name : undefined,
            notes: [...this.intelOn(viewerId, otherId)].reverse(),
        };
    }

    public trustReadOf(viewerId: number, otherId: number): { label: string; day: number } | null {
        const r = this.state.reads && this.state.reads[viewerId] && this.state.reads[viewerId][otherId];
        if (!r || r.t === undefined) return null;
        return { label: trustLabel(r.t), day: r.td || r.day };
    }

    // ---------- deals, promises and the vote ----------

    get ledger(): Ledger {
        if (!this.state.ledger) this.state.ledger = emptyLedger();
        return this.state.ledger;
    }

    private tellAll(news: LedgerNews[]) {
        news.forEach((n) => this.tell(n.toIds, n.text));
    }

    private dealAction(gs: MutableGameState, actorId: number, action: DealAction): SocialOutcome {
        const week = gs.phase;
        const noms = this.state.week.nomineeIds || [];
        switch (action.kind) {
            case "final2":
                return offerFinal2(gs, this.ledger, actorId, action.botId, week);
            case "voteDeal":
                return offerVoteDeal(gs, this.ledger, actorId, action.botId, week);
            case "pity":
                return pityPitch(gs, actorId, action.botId);
            case "tellVote":
                return tellVote(gs, this.ledger, actorId, action.botId, action.targetId, noms, week, this.voteOf(gs, action.botId, noms));
            case "tellTarget":
                return tellTarget(gs, this.ledger, actorId, action.botId, action.targetId, week, noms);
            case "confront": {
                const outcome = confront(gs, this.ledger, actorId, action.botId, this.state.humanIds);
                this.askOthersToPickSides(actorId, action.botId, outcome.text);
                return outcome;
            }
            case "meeting": {
                this.state.week.meetingBy = [...(this.state.week.meetingBy || []), actorId];
                const outcome = houseMeeting(gs, this.ledger, actorId, action.botId, this.state.humanIds);
                this.askOthersToPickSides(actorId, action.botId, outcome.text);
                return outcome;
            }
            case "snoop": {
                const result = snoop(gs, this.ledger, this.book, actorId);
                if (result.learned !== undefined) {
                    const known = this.overheardBy(actorId);
                    if (!known.includes(result.learned)) known.push(result.learned);
                    this.noteOverheard(gs, actorId, result.learned);
                }
                return result.outcome;
            }
            case "rumour":
                return spreadRumour(gs, this.ledger, this.book, actorId, action.botId, action.targetId, action.rumour);
            case "flirt": {
                const result = flirt(gs, this.showmances, actorId, action.botId);
                if (result.showmance) {
                    this.showmances.push(result.showmance);
                    this.tell(
                        this.state.humanIds.filter((id) => id !== actorId),
                        `💕 The house is buzzing: ${getById(gs, actorId).name} and ${getById(gs, action.botId).name} are a showmance.`
                    );
                }
                return result.outcome;
            }
        }
    }

    // Who a bot with a vote this week means to evict (undefined: no vote, or it's a player).
    private voteOf(gs: GameState, voterId: number, nomineeIds: number[]): number | undefined {
        if (this.isHuman({ id: voterId }) || nomineeIds.length < 2 || nomineeIds.includes(voterId)) return undefined;
        if (voterId === this.state.week.hohId) return undefined;
        return this.intendedVote(gs, getById(gs, voterId), nomineeIds.map((id) => getById(gs, id))).id;
    }

    // How a bot means to vote: its usual vote, unless it gave its word to the nominee it would vote out.
    // Seeded per voter and week, so asking now and voting later agree (unless the house has changed).
    private intendedVote(gs: GameState, voter: Houseguest, noms: Houseguest[]): { id: number; betrayed?: number } {
        seedRng(`${this.state.seed}:${gs.phase}:vote:${voter.id}`);
        const r = () => Math.abs(rng().randomFloat());
        const base = botVote(gs, this.book, voter, noms);
        const leastLiked = (pool: Houseguest[]) => [...pool].sort((a, b) => voter.relationships[a.id] - voter.relationships[b.id])[0];
        // nobody votes out their showmance
        const love = partnerOf(this.showmances, voter.id);
        if (love !== undefined && noms.some((n) => n.id === love)) {
            const others = noms.filter((n) => n.id !== love);
            if (others.length > 0) return base.id === love ? { id: leastLiked(others).id } : base;
        }
        const p = this.personalities[voter.id];
        if (p === "wildcard" && r() < 0.2) return { id: noms[Math.floor(r() * noms.length)].id };
        let choice = base;
        if (p === "villain" && r() < 0.5) choice = { id: leastLiked(noms).id };
        // a showmance on the block: split them up
        const paired = noms.filter((n) => {
            const partner = partnerOf(this.showmances, n.id);
            return partner !== undefined && partner !== voter.id && !getById(gs, partner).isEvicted;
        });
        if (paired.length === 1 && r() < 0.25) choice = { id: paired[0].id };
        // a big threat on the block is hard to pass up, more so late in the game
        const scores = threatScoresFor(gs, this.state.history, voter); // the threat as this voter sees it
        const byThreat = [...noms].sort((a, b) => (scores[b.id] ? scores[b.id].score : 0) - (scores[a.id] ? scores[a.id].score : 0));
        const gap = byThreat.length > 1 && scores[byThreat[0].id] && scores[byThreat[1].id] ? scores[byThreat[0].id].score - scores[byThreat[1].id].score : 0;
        if (gap > 1 && byThreat[0].id !== love && r() < this.strategy().threatVote) choice = { id: byThreat[0].id };
        // easy bots sometimes just vote with their gut
        if (r() < this.strategy().gut) choice = { id: leastLiked(noms).id };
        const promised = promisedVotes(this.ledger, voter.id, gs.phase).filter((id) => noms.some((n) => n.id === id));
        if (!promised.includes(choice.id)) return choice;
        if (r() >= this.honor(voter.id, choice.id)) return choice;
        const others = noms.filter((n) => !promised.includes(n.id));
        if (others.length === 0) return choice;
        return { id: leastLiked(others).id };
    }

    // Who the current player thinks the nominees are, and who they're campaigning to.
    public voters(): Houseguest[] {
        const s = this.state;
        const noms = s.week.nomineeIds || [];
        const hoh = this.publicHohId();
        return nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== hoh && !noms.includes(hg.id));
    }

    // Vote counting: ask a voter how they'll vote. Free, once per voter. Bots may lie.
    public askVote(voterId: number): number | null {
        const s = this.state;
        const actor = this.socialActor;
        const noms = (s.week.nomineeIds || []).map((id) => this.player(id));
        if (!actor || noms.length < 2 || this.isHuman({ id: voterId })) return null;
        const intel = (s.week.intel = s.week.intel || {});
        const mine = (intel[actor.id] = intel[actor.id] || {});
        if (mine[voterId] !== undefined) return mine[voterId];
        const intended = this.intendedVote(s.gameState, this.player(voterId), noms).id;
        this.reseed(`ask:${voterId}`);
        const info = this.traitsOf(voterId);
        const answer = answerVoteQuestion(
            new MutableGameState(s.gameState),
            actor.id,
            voterId,
            intended,
            noms.map((n) => n.id),
            info ? info.lies : 1
        );
        mine[voterId] = answer.said;
        this.noteRead(actor.id, voterId, true);
        this.save();
        return answer.said;
    }

    // The player's vote count so far: what each voter said (if asked).
    public tally(actorId: number): { hg: Houseguest; said?: number }[] {
        const mine = (this.state.week.intel || {})[actorId] || {};
        return this.voters()
            .filter((hg) => hg.id !== actorId)
            .map((hg) => ({ hg, said: mine[hg.id] }));
    }

    // Eviction night: promises and claims are checked against the secret votes, vote counts against the truth,
    // and votes against the house get noticed.
    private settleTheVote(week: number, hohId: number, votes: { [voterId: number]: number }, evictedIds: number[], noms: Houseguest[]) {
        const s = this.state;
        this.reseed("word");
        this.tellAll(
            this.mutate((gs) => [
                ...checkVoteClaims(gs, this.ledger, week, votes),
                ...settleEvictionPledges(gs, this.ledger, week, hohId, votes, evictedIds),
            ])
        );
        const real = (id: number) => Object.values(votes).filter((v) => v === id).length;
        Object.keys(s.week.intel || {})
            .map(Number)
            .forEach((asker) => {
                const said = s.week.intel![asker];
                const asked = Object.keys(said).map(Number);
                if (asked.length === 0) return;
                const wrong = asked.filter((v) => votes[v] !== undefined && votes[v] !== said[v]).length;
                this.tell(
                    [asker],
                    wrong === 0
                        ? `🗳️ Your vote count held up: everyone you asked voted the way they said.`
                        : `🗳️ ${wrong} of the ${asked.length} houseguests you asked didn't vote the way they told you. The real vote: ${noms
                              .map((n) => `${n.name} ${real(n.id)}`)
                              .join(", ")}.`
                );
            });
        // votes against the nominee who stayed
        const survivors = noms.filter((n) => !evictedIds.includes(n.id)).map((n) => n.id);
        const voterIds = Object.keys(votes).map(Number);
        s.week.hinky = [];
        voterIds.forEach((voterId) => {
            const target = votes[voterId];
            if (!survivors.includes(target)) return;
            if (this.isHuman({ id: voterId })) {
                s.week.hinky!.push({ voterId, targetId: target });
                return;
            }
            if (!this.isHuman({ id: target })) return;
            const rumored = this.mutate((gs) => {
                const r = rumorFor(gs, target, voterIds, voterId);
                shiftRelationship(gs, target, r, -0.08);
                return r;
            });
            this.tell([target], `🗳️ Somebody voted to evict you. Word is it was ${this.player(rumored).name}.`);
        });
        // bots pin their own rogue votes on someone else, sometimes a player who voted the other way
        voterIds.forEach((voterId) => {
            const target = votes[voterId];
            if (this.isHuman({ id: voterId }) || this.isHuman({ id: target }) || !survivors.includes(target)) return;
            const p = this.personalities[voterId];
            if (Math.abs(rng().randomFloat()) >= (p === "villain" || p === "mastermind" ? 0.5 : 0.2)) return;
            const goats = this.alivePlayers.filter((pl) => votes[pl.id] !== undefined && votes[pl.id] !== target);
            if (goats.length === 0) return;
            const goat = goats[Math.floor(Math.abs(rng().randomFloat()) * goats.length)];
            this.mutate((gs) => shiftRelationship(gs, target, goat.id, -0.12));
            this.tell(
                [goat.id],
                `🗳️ ${this.player(target).name} is convinced you voted to evict them. You didn't: somebody pinned their vote on you.`
            );
        });
        this.endShowmances(evictedIds);
    }

    // ---------- house drama ----------

    // The players who weren't part of a fight hear about it, and get asked to pick a side.
    private askOthersToPickSides(aId: number, bId: number, text: string) {
        const s = this.state;
        this.alivePlayers
            .filter((p) => p.id !== aId && p.id !== bId)
            .forEach((p) => {
                s.approaches[p.id] = [...(s.approaches[p.id] || []), { kind: "sides", fromId: aId, otherId: bId }];
                this.tell([p.id], text);
            });
    }

    // The current player picks a side in someone else's fight (or stays out of it). Free, like any answer.
    public respondSides(index: number, side: "a" | "b" | null): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        const list = this.approachesFor(actor.id);
        const approach = list[index];
        if (!approach || approach.kind !== "sides") return null;
        s.approaches[actor.id] = list.filter((_, i) => i !== index);
        const a = this.player(approach.fromId);
        const b = this.player(approach.otherId);
        const outcome = this.mutate((gs) => {
            if (side === null) {
                shiftRelationship(gs, actor.id, a.id, -0.03);
                shiftRelationship(gs, actor.id, b.id, -0.03);
                return { text: `You stayed out of ${a.name} and ${b.name}'s fight. Neither of them was thrilled.`, good: true };
            }
            const [chosen, other] = side === "a" ? [a, b] : [b, a];
            shiftRelationship(gs, actor.id, chosen.id, 0.08);
            shiftRelationship(gs, actor.id, other.id, -0.12);
            return { text: `You took ${chosen.name}'s side. ${other.name} noticed.`, good: true };
        });
        s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.save();
        return outcome;
    }

    public overheardBy(playerId: number): number[] {
        const s = this.state;
        if (!s.overheard) s.overheard = {};
        if (!s.overheard[playerId]) s.overheard[playerId] = [];
        return s.overheard[playerId];
    }

    // How far into the season we are: 0 at the start, 1 at the final 3.
    private lateness(): number {
        const total = Math.max(4, this.gameState.houseguests.length);
        return Math.max(0, Math.min(1, (total - this.gameState.remainingPlayers) / (total - 3)));
    }

    public threatOf(id: number) {
        return threatLevel(this.gameState, this.state.history, id);
    }

    // A bot HoH may simply go after the biggest threat in the house.
    private topThreat(hohId: number): number[] {
        const scores = threatScoresFor(this.gameState, this.state.history, this.player(hohId)); // as the HoH sees it
        const love = partnerOf(this.showmances, hohId);
        const allies = this.allyIds(hohId);
        const pool = Object.keys(scores)
            .map(Number)
            .filter((id) => id !== hohId && id !== love && !allies.includes(id));
        if (pool.length === 0) return [];
        const top = pool.sort((a, b) => scores[b].score - scores[a].score)[0];
        if (scores[top].score < 1 || Math.abs(rng().randomFloat()) >= this.strategy().threatNom) return [];
        return [top];
    }

    // ---------- the jury ----------

    get juryBook(): JuryBook {
        if (!this.state.jury) this.state.jury = emptyJury();
        return this.state.jury;
    }

    public jurorTypeOf(id: number): JurorType {
        return jurorType(this.personalities[id], `${this.state.seed}:${id}`);
    }

    private jurorIds(): number[] {
        return this.gameState.houseguests.filter((hg) => hg.isJury && hg.isEvicted).map((hg) => hg.id);
    }

    // What each juror holds against (or for) `id`, as far as `id` can tell: they know what they did.
    public juryView(id: number): { juror: Houseguest; amount: number; reasons: string[] }[] {
        return this.jurorIds()
            .filter((j) => j !== id)
            .map((j) => {
                const g = grudgeOf(this.juryBook, j, id);
                return { juror: this.player(j), amount: g.amount, reasons: g.reasons };
            });
    }

    // A new juror remembers how they got there: who nominated them (or cut them), who voted them out,
    // who lied to them, and who kept or broke their word. In the jury house, the truth comes out.
    private recordEvictionGrudges(
        evictedIds: number[],
        hohId: number | undefined,
        votes: { [voterId: number]: number },
        pawns: PawnTalkRecord[],
        how: string
    ) {
        const s = this.state;
        const gs = s.gameState;
        const jury = this.juryBook;
        this.reseed("jury");
        evictedIds.forEach((e) => {
            if (!getById(gs, e).isJury) return;
            if (hohId !== undefined) addGrudge(jury, e, hohId, -0.25, how);
            Object.keys(votes)
                .map(Number)
                .filter((v) => votes[v] === e && Math.abs(rng().randomFloat()) < 0.5)
                .forEach((v) => addGrudge(jury, e, v, -0.12, "voted me out"));
            pawns.filter((t) => t.toId === e).forEach((t) => addGrudge(jury, e, t.hohId, -0.35, "told me I wasn't the target"));
            this.ledger.pledges
                .filter((p) => p.toId === e)
                .forEach((p) => {
                    if (p.status === "broken") addGrudge(jury, e, p.fromId, -0.35, "broke a promise to me");
                    if (p.status === "kept") addGrudge(jury, e, p.fromId, 0.15, "kept their word to me");
                });
            this.ledger.claims
                .filter(
                    (c) =>
                        c.toId === e &&
                        (c.caught || (c.kind === "vote" && votes[c.fromId] === e && c.aboutId !== e) || (c.kind === "rumour" && !c.true))
                )
                .forEach((c) => addGrudge(jury, e, c.fromId, -0.25, "lied to my face"));
            const lines = newcomerTalks(gs, jury, e, this.jurorIds());
            s.week.juryHouse = [...(s.week.juryHouse || []), ...lines];
            // players who put them there can send a goodbye message
            if (hohId !== undefined && votes[hohId] === undefined && Object.keys(votes).length === 0) return;
            this.alivePlayers
                .filter((p) => p.id === hohId || votes[p.id] === e)
                .forEach((p) => (s.week.goodbyes = [...(s.week.goodbyes || []), { playerId: p.id, evictedId: e }]));
        });
    }

    // The jury house goes in the episode recap (single player only: in pass-and-play it's a secret).
    private pushJuryHouse() {
        const s = this.state;
        const lines = s.week.juryHouse || [];
        if (lines.length === 0 || this.multiplayer) return;
        this.weekScenes.push(
            new Scene({
                title: "Jury House",
                gameState: s.gameState,
                content: (
                    <div style={{ textAlign: "center" }}>
                        <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🧑‍⚖️ Meanwhile, in the jury house</h3>
                        {lines.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                        <NextEpisodeButton />
                    </div>
                ),
            })
        );
        s.week.juryHouse = [];
    }

    // After an eviction, players who put a juror there can send them a goodbye message. How it lands
    // depends on the juror: objective jurors respect a game move, bitter ones want an apology.
    private goodbyes() {
        const s = this.state;
        const list = (s.week.goodbyes || []).filter((g) => !this.player(g.playerId).isEvicted);
        if (list.length === 0) return this.goTo(Step.WeekStart);
        const { playerId, evictedId } = list[0];
        const done = () => {
            s.week.goodbyes = list.slice(1);
            this.save();
            this.run();
        };
        const player = this.player(playerId);
        const juror = this.player(evictedId);
        const tones: SpeechTone[] = [
            { id: "game", label: "🎯 It was a game move", blurb: "Explain it was strategy, not personal. Respected by jurors who judge the game." },
            { id: "sorry", label: "🙏 Apologize", blurb: "Say you're sorry it had to be them. Goes a long way with jurors who vote with their hearts." },
            { id: "gloat", label: "😈 Gloat", blurb: "Tell them exactly why they had to go. Nobody likes this. Some respect it." },
            { id: "silent", label: "🤐 Say nothing", blurb: "No message at all. Some jurors won't even notice. Some will." },
        ];
        this.privately(playerId, `${player.name}, a message for ${juror.name}`, () =>
            this.show({
                kind: "speech",
                actorId: playerId,
                title: `Goodbye message to ${juror.name}`,
                text: `${juror.name} is heading to the jury house, and they'll have a vote at the finale. You helped send them there. Anything to say?`,
                tones,
                deliver: (toneId) => {
                    const type = this.jurorTypeOf(evictedId);
                    const effect: { [tone: string]: [number, string] } = {
                        game: [type === "objective" ? 0.25 : 0.05, "explained it was just a game move"],
                        sorry: [type === "bitter" ? 0.25 : 0.05, "apologized on my way out"],
                        gloat: [type === "objective" ? -0.1 : -0.35, "gloated when I left"],
                        silent: [type === "bitter" ? -0.08 : 0, "didn't even say goodbye"],
                    };
                    const [amount, reason] = effect[toneId];
                    if (amount !== 0) addGrudge(this.juryBook, evictedId, playerId, amount, reason);
                    this.save();
                    return [
                        toneId === "silent" ? "(no message)" : `Your message is on its way to ${juror.name}.`,
                        amount > 0.1
                            ? `🙂 Word from the jury house: ${juror.name} appreciated it.`
                            : amount < -0.05
                            ? `😠 Word from the jury house: that landed badly with ${juror.name}.`
                            : `😐 Hard to say how ${juror.name} took it.`,
                    ];
                },
                next: done,
            })
        );
    }

    // ---------- personalities, hidden feelings, trust and showmances ----------

    get personalities(): { [id: number]: PersonalityId } {
        const s = this.state;
        if (!s.personalities) {
            const bots = s.gameState.houseguests.filter((hg) => !this.isHuman(hg));
            s.personalities = assignPersonalities(bots, s.seed);
        }
        return s.personalities;
    }

    public traitsOf(id: number): PersonalityInfo | undefined {
        const p = this.personalities[id];
        return p ? PERSONALITIES[p] : undefined;
    }

    get showmances(): Showmance[] {
        if (!this.state.showmances) this.state.showmances = [];
        return this.state.showmances;
    }

    public showmancePartner(id: number): number | undefined {
        return partnerOf(this.showmances, id);
    }

    // A line in a bot's own voice. `key` keeps the choice of line stable for a given moment.
    public say(botId: number, situation: Situation, key: string, name: string = ""): string {
        return voice(this.personalities[botId], situation, `${this.state.seed}:${this.gameState.phase}:${botId}:${key}`, name);
    }

    // How `otherId` seems to feel about `viewerId`: bots can fake it (depending on their personality),
    // unless their mask slipped recently. Players see each other as they are.
    public feelingOf(viewerId: number, otherId: number): number {
        const viewer = this.player(viewerId);
        const real = viewer.relationships[otherId] ?? 0;
        if (this.isHuman({ id: otherId }) || !this.isHuman({ id: viewerId })) return real;
        const week = this.gameState.phase;
        return apparentRelationship(
            real,
            this.personalities[otherId],
            `${this.state.seed}:${week}:${otherId}:${viewerId}`,
            isRevealed(this.ledger, otherId, viewerId, week)
        );
    }

    // How much `listener` believes `speaker` (separate from how much they like them).
    public trustIn(listener: number, speaker: number): number {
        return trustOf(this.ledger, listener, speaker);
    }

    // How likely a bot is to keep its word: how it feels, and who it is.
    private honor(botId: number, toId: number): number {
        const info = this.traitsOf(botId);
        let h = honorChance(this.gameState, botId, toId) + (info ? info.honor : 0);
        if (this.personalities[botId] === "wildcard") h += (Math.abs(rng().randomFloat()) - 0.5) * 0.5;
        return Math.max(0.05, Math.min(0.99, h));
    }

    private compBoost(id: number, comp: CompDefinition, seed: number): number {
        const p = this.personalities[id];
        if (!p) return 0;
        let boost = PERSONALITIES[p].compBoost;
        if (p === "superfan" && (comp.kind === "quiz" || comp.kind === "memory")) boost += 0.1;
        if (p === "wildcard") boost += (hash01(`${seed}:${id}:wild`) - 0.5) * 0.3;
        return boost;
    }

    // Who a bot HoH goes after, given its personality.
    private personalityTargets(hohId: number): number[] {
        const p = this.personalities[hohId];
        const hoh = this.player(hohId);
        const love = partnerOf(this.showmances, hohId);
        const allies = this.allyIds(hohId);
        const pool = nonEvictedHouseguests(this.gameState).filter((hg) => hg.id !== hohId && hg.id !== love && !allies.includes(hg.id));
        if (pool.length === 0) return [];
        const top = (score: (hg: Houseguest) => number) => [...pool].sort((a, b) => score(b) - score(a))[0];
        if (p === "compBeast") {
            const threat = top((hg) => hg.hohWins + hg.povWins);
            return threat.hohWins + threat.povWins > 0 ? [threat.id] : [];
        }
        if (p === "villain") return [top((hg) => -hoh.relationships[hg.id]).id];
        if (p === "mastermind") return [top((hg) => hg.popularity).id];
        if (p === "superfan") return [top((hg) => hg.powerRanking).id]; // a big move
        return [];
    }

    // A bot HoH may go after a showmance as a pair.
    private showmanceTarget(hohId: number): number[] {
        const alive = (id: number) => !this.player(id).isEvicted;
        const couple = this.showmances.find((sm) => sm.a !== hohId && sm.b !== hohId && alive(sm.a) && alive(sm.b));
        if (!couple || Math.abs(rng().randomFloat()) >= 0.5) return [];
        return [couple.a, couple.b];
    }

    private endShowmances(evictedIds: number[]) {
        const s = this.state;
        s.showmances = this.showmances.filter((sm) => {
            const gone = [sm.a, sm.b].find((id) => evictedIds.includes(id));
            if (gone === undefined) return true;
            const partner = gone === sm.a ? sm.b : sm.a;
            this.tell([partner], `💔 ${this.player(gone).name} is gone. You're on your own in this house now.`);
            if (this.player(gone).isJury) addGrudge(this.juryBook, gone, partner, 0.4, "was my showmance");
            return false;
        });
    }

    // Wildcards' moods swing: a random relationship of theirs lurches one way or the other.
    private wildcardSwings(gs: MutableGameState) {
        const house = nonEvictedHouseguests(gs);
        house
            .filter((hg) => this.personalities[hg.id] === "wildcard")
            .forEach((hg) => {
                const others = house.filter((o) => o.id !== hg.id);
                if (others.length === 0) return;
                const other = others[Math.floor(Math.abs(rng().randomFloat()) * others.length)];
                shiftRelationship(gs, hg.id, other.id, (Math.abs(rng().randomFloat()) - 0.5) * 0.24);
            });
    }

    // The end-of-season reveal: who everyone really was, and (single player) how they really felt about you.
    private whoTheyWere(): JSX.Element {
        const gs = this.state.gameState;
        const me = this.multiplayer ? null : this.players[0];
        const bots = gs.houseguests.filter((hg) => !this.isHuman(hg) && this.personalities[hg.id]);
        return (
            <div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🎭 Who they really were</h3>
                <div className="bbb-skills-reveal">
                    {bots.map((hg) => {
                        const info = PERSONALITIES[this.personalities[hg.id]];
                        const real = me ? feelingLabel(hg.relationships[me.id] ?? 0) : null;
                        return (
                            <div key={hg.id}>
                                <img src={hg.imageURL} alt="" />
                                <b>{hg.name}</b>
                                <span>
                                    {info.emoji} {info.label}
                                </span>
                                {real && (
                                    <span>
                                        really: {real.emoji} {real.label}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // After the eviction: players who voted against the nominee who stayed can pin it on someone else.
    private fallout() {
        const s = this.state;
        const list = s.week.hinky || [];
        const next = list.find((h) => !this.player(h.voterId).isEvicted && !this.player(h.targetId).isEvicted);
        if (!next) return this.goodbyes();
        const voter = this.player(next.voterId);
        const target = this.player(next.targetId);
        const nomIds = s.week.nomineeIds || [];
        const options = nonEvictedHouseguests(s.gameState).filter(
            (hg) => hg.id !== voter.id && hg.id !== target.id && hg.id !== s.week.hohId && !nomIds.includes(hg.id)
        );
        this.privately(voter.id, `${voter.name}, about that vote`, () =>
            this.show({
                kind: "choose",
                actorId: voter.id,
                title: "Rogue Vote",
                text: `You voted to evict ${target.name}, and ${target.name} is still here, wondering who it was. Pin your vote on someone else, or keep quiet and hope nobody figures it out?`,
                options,
                count: 1,
                noneLabel: "Keep quiet",
                confirmLabel: "Pin it on them",
                resolve: (ids) => {
                    this.reseed(`blame:${voter.id}`);
                    const result = this.mutate((gs) => blameVote(gs, this.ledger, voter.id, target.id, ids.length > 0 ? ids[0] : null));
                    this.tellAll(result.news);
                    s.week.hinky = list.filter((h) => h !== next);
                    this.save();
                    this.show({
                        kind: "scene",
                        scene: new Scene({
                            title: "Rogue Vote",
                            gameState: s.gameState,
                            content: (
                                <div style={{ textAlign: "center" }}>
                                    <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🗳️ Rogue Vote</h3>
                                    <p>
                                        {result.good ? "👍" : "👎"} {result.text}
                                    </p>
                                    <NextEpisodeButton />
                                </div>
                            ),
                        }),
                    });
                },
            })
        );
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
    public allianceSuggest(allianceId: number, targetId: number | null, backupId: number | null = null): string[] {
        const s = this.state;
        const actor = this.socialActor;
        const a = getAlliance(s.book, allianceId);
        if (!a || a.met) return [];
        a.suggestions[actor.id] = targetId;
        a.backupSuggestions = { ...(a.backupSuggestions || {}), [actor.id]: this.planBWeek && backupId !== targetId ? backupId : null };
        a.memberIds.forEach((m) => this.noteRead(actor.id, m)); // alliance time: you get a read on your allies
        const later = this.alivePlayers.slice(s.socialTurn + 1).filter((p) => a.memberIds.includes(p.id));
        if (later.length > 0) {
            this.save();
            return [`Your pick is in. ${later.map((p) => p.name).join(" and ")} will weigh in before ${a.name} decides.`];
        }
        this.reseed(`meeting:${a.id}`);
        const result = this.mutate((gs) => holdMeeting(gs, a, s.humanIds, this.targetBlock(), this.targetExclude(), this.planBWeek));
        this.tellAlliance(a, `🤝 ${a.name} met. ${result.lines[result.lines.length - 1]}`, actor.id);
        result.lines.forEach((line) => s.socialLog.push(`🤝 ${line}`));
        if (a.chemistry <= 0) this.dissolve(a);
        this.save();
        return result.lines;
    }

    // A split alliance meeting: the player argues for a target, or goes along with the alliance's pick.
    public allianceDiscuss(allianceId: number, move: { kind: "argue"; targetId: number } | { kind: "concede" }): string[] {
        const s = this.state;
        const actor = this.socialActor;
        const a = getAlliance(s.book, allianceId);
        if (!a || !actor || !a.memberIds.includes(actor.id) || !meetingSplit(s.gameState, a)) return [];
        this.reseed(`discuss:${a.id}`);
        const result = this.mutate((gs) => discussTarget(gs, a, actor.id, s.humanIds, move));
        this.tellAlliance(a, `💬 ${a.name} talked it out. ${result.lines[result.lines.length - 1]}`, actor.id);
        result.lines.forEach((line) => s.socialLog.push(`💬 ${line}`));
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
        this.feedPush(
            ...houseFeed(
                s.gameState,
                {
                    humanIds: s.humanIds,
                    hohId: s.week.hohId,
                    secretHoh: s.week.secretHoh,
                    nomineeIds: s.week.nomineeIds || [],
                    showmances: this.showmances,
                    personalities: this.personalities,
                },
                () => Math.abs(rng().randomFloat())
            )
        );
        this.mutate((gs) => {
            // alliances that haven't met yet meet now (players who skipped alliance time don't get a say)
            s.book.alliances
                .filter((a) => !a.met && aliveMembers(gs, a).length >= 2 && this.allianceTimeOpen())
                .forEach((a) => {
                    const result = holdMeeting(gs, a, s.humanIds, this.targetBlock(), [], this.planBWeek);
                    this.tellAlliance(a, `🤝 ${a.name} met without you. ${result.lines[result.lines.length - 1]}`);
                });
            s.book.alliances.filter((a) => a.chemistry <= 0).forEach((a) => this.dissolve(a));
            this.tellAll(compareNotes(gs, this.ledger, gs.phase));
            this.tellAll(checkRumours(gs, this.ledger, gs.phase));
            this.tellAll(exposeAllianceHoppers(gs, this.ledger, s.book));
            this.tellAll(walkedInOn(gs, s.book, s.humanIds));
            botRumours(gs, s.humanIds, (id) => (this.traitsOf(id) || { scheming: 1 }).scheming).forEach((r) => {
                if (r.known) reveal(this.ledger, r.fromId, r.aboutId, gs.phase);
                this.tell(
                    [r.aboutId],
                    `🗯️ Someone's been spreading rumours about you${r.known ? `. Word is it was ${getById(gs, r.fromId).name}` : ""}.`
                );
            });
            const fight = botFight(gs, this.ledger, s.humanIds, (id) =>
                this.personalities[id] === "villain" ? 2.5 : this.personalities[id] === "wildcard" ? 1.5 : 1
            );
            if (fight) {
                const a = getById(gs, fight.aId).name;
                const sides = sidesText(gs, fight.aId, fight.bId, fight.sides);
                if (this.isHuman({ id: fight.bId })) this.tell([fight.bId], `💥 ${a} blew up at you in front of everyone. ${sides}`);
                this.askOthersToPickSides(fight.aId, fight.bId, `💥 ${a} and ${getById(gs, fight.bId).name} blew up at each other. ${sides}`);
            }
            botSocialTime(gs, s.humanIds, (id) => this.traitsOf(id) || { chats: 1, scheming: 1 });
            this.wildcardSwings(gs);
            botShowmances(gs, this.showmances, s.humanIds).forEach((sm) => {
                this.showmances.push(sm);
                this.tell(s.humanIds, `💕 The house is buzzing: ${getById(gs, sm.a).name} and ${getById(gs, sm.b).name} are a showmance.`);
            });
            botAllianceTime(gs, s.book, s.humanIds).forEach((invite) => {
                s.approaches[invite.toId] = [
                    ...(s.approaches[invite.toId] || []),
                    { kind: "invite", fromId: invite.fromId, allianceId: invite.allianceId, name: invite.name },
                ];
            });
            s.book.alliances.forEach((a) => {
                a.met = false;
                a.suggestions = {};
                a.backupSuggestions = {};
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
                            <NextEpisodeButton />
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
        const title = "Head of House Competition";
        const onWinner = (winnerId: number) => {
            const [gs, scene, hohs] = generateHohCompScene(s.gameState, { forcedWinners: [getById(s.gameState, winnerId)] });
            s.gameState = gs;
            s.week.hohId = hohs[0].id;
            if (!s.week.secretHoh) {
                this.feedPush(`👑 ${hohs[0].name} is the new ${HOH}.`);
                return this.showScene(scene, Step.AllianceHoh);
            }
            const yours = s.humanIds.length === 1 && this.isHuman(hohs[0]);
            this.showScene(
                this.textScene(`${HOH} Competition`, [
                    `🕶️ A new ${HOH} has been crowned… in secret.`,
                    `This week, nobody knows who the ${HOH} is, or who nominated them.`,
                    ...(yours ? ["🤫 It's you. Nobody else knows."] : []),
                ]),
                Step.AllianceHoh
            );
        };
        if (this.useKnockout(competitors)) return this.runKnockout(title, competitors, onWinner);
        const comp = pickWeeklyComp(s.gameState, s.history, s.usedComps);
        this.runComp(title, comp, competitors, onWinner, "hoh");
    }

    // ---------- alliances convene before nominations ----------

    // Who can't be the alliance's target right now: the new HoH can't be nominated (unless it's a secret).
    public targetExclude(): number[] {
        const s = this.state;
        if (s.step !== Step.AllianceHoh || s.week.secretHoh || s.week.hohId === undefined) return [];
        return [s.week.hohId];
    }

    // The new HoH is known: each player gets to meet with their alliances before nominations, then the bots'
    // alliances meet too. Whatever they settle on is what their HoH (or their pitch to the HoH) goes with.
    private allianceHoh(): void {
        const s = this.state;
        const alive = this.alivePlayers;
        if (this.allianceTimeOpen()) {
            while (s.socialTurn < alive.length && this.alliancesOf(alive[s.socialTurn].id).length === 0) s.socialTurn++;
            if (s.socialTurn < alive.length) {
                const actor = alive[s.socialTurn];
                s.socialStage = "alliance";
                this.save();
                return this.privately(actor.id, `${actor.name}: your alliances convene`, () =>
                    this.show({ kind: "alliance", blockName: `Before nominations: ${this.hohLine()}`, actorId: actor.id })
                );
            }
            this.reseed("alliances:hoh");
            this.mutate((gs) =>
                s.book.alliances
                    .filter((a) => !a.met && aliveMembers(gs, a).length >= 2)
                    .forEach((a) => {
                        const result = holdMeeting(gs, a, s.humanIds, undefined, this.targetExclude(), this.planBWeek);
                        this.tellAlliance(a, `🤝 ${a.name} met before nominations. ${result.lines[result.lines.length - 1]}`);
                    })
            );
            s.book.alliances.filter((a) => a.chemistry <= 0).forEach((a) => this.dissolve(a));
        }
        s.book.alliances.forEach((a) => {
            a.met = false;
            a.suggestions = {};
            a.backupSuggestions = {};
        });
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = ACTIONS_PER_BLOCK;
        this.goTo(Step.HohRoom);
    }

    private hohLine(): string {
        const s = this.state;
        if (s.week.secretHoh || s.week.hohId === undefined) return `the ${HOH} is a secret`;
        return `${this.player(s.week.hohId).name} is ${HOH}`;
    }

    // ---------- HoH room one-on-ones ----------

    get deals(): Deal[] {
        if (!this.state.deals) this.state.deals = [];
        return this.state.deals;
    }

    get room(): HohRoom | undefined {
        return this.state.week.room;
    }

    private get nomCount(): number {
        return this.state.week.blockbuster ? 3 : 2;
    }

    // Before nominations, houseguests come up to the HoH room one by one. Players choose whether to go;
    // a player HoH then hears out everyone who came.
    private hohRoom() {
        const s = this.state;
        const hohId = s.week.hohId!;
        // nobody can visit a Head of House nobody knows
        if (s.week.secretHoh) return this.goTo(Step.Noms);
        if (!s.week.room) {
            this.reseed("room");
            const stillIn = (id: number) => getById(s.gameState, id) && !getById(s.gameState, id).isEvicted;
            // last week's deals, and deals made on the wall in this week's endurance comp:
            // this HoH owes these houseguests safety
            const owed = this.deals
                .filter((d) => d.week === s.gameState.phase - 1 && d.withId === hohId && stillIn(d.hohId))
                .map((d) => d.hohId);
            (s.week.wallDeals || []).forEach((d) => d.hohId === hohId && !owed.includes(d.toId) && owed.push(d.toId));
            // and every other safety promise for this week (deals made while campaigning, for one)
            openPledges(this.ledger, "safety")
                .filter((p) => p.week === s.gameState.phase && p.fromId === hohId && stillIn(p.toId))
                .forEach((p) => !owed.includes(p.toId) && owed.push(p.toId));
            s.week.room = this.mutate((gs) => openHohRoom(gs, s.book, hohId, s.humanIds, owed));
            this.save();
        }
        const room = s.week.room;
        const hoh = this.player(hohId);
        const waiting = this.alivePlayers.find((p) => p.id !== hohId && !room.asked.includes(p.id));
        if (waiting) {
            return this.privately(waiting.id, `${waiting.name}, the HoH room is open`, () =>
                this.show({ kind: "hohVisit", actorId: waiting.id })
            );
        }
        if (this.isHuman(hoh) && !room.done) {
            room.visitors.forEach((v) => this.noteRead(hoh.id, v.fromId));
            return this.privately(hoh.id, `${hoh.name}'s HoH room one-on-ones`, () =>
                this.show({ kind: "hohRoom", actorId: hoh.id })
            );
        }
        this.goTo(Step.Noms);
    }

    // Called by the visit screen: a player goes up to the HoH room with a pitch, or stays away (null).
    public hohVisit(actorId: number, pitch: VisitPitch | null): RoomOutcome | null {
        const s = this.state;
        const room = s.week.room;
        if (!room || room.asked.includes(actorId)) return null;
        room.asked.push(actorId);
        const hoh = this.player(room.hohId);
        if (pitch) this.noteRead(actorId, room.hohId, true);
        let outcome: RoomOutcome;
        if (!pitch) {
            outcome = { text: "You stayed downstairs.", good: true };
        } else if (this.isHuman(hoh)) {
            // another player is HoH: they'll answer during their one-on-ones
            room.visitors.push({ ...pitch, fromId: actorId });
            outcome = { text: `You went up to the HoH room. ${hoh.name} will give you an answer.`, good: true };
        } else {
            this.reseed(`visit:${actorId}`);
            outcome = this.mutate((gs) => visitBotHoh(gs, room, this.deals, actorId, pitch, this.nomCount));
            s.socialLog.push(`🚪 ${outcome.text}`);
            if (outcome.good && (pitch.kind === "plea" || pitch.kind === "deal")) {
                pledge(this.ledger, "safety", room.hohId, actorId, s.gameState.phase);
                if (pitch.kind === "deal") pledge(this.ledger, "safety", actorId, room.hohId, s.gameState.phase + 1);
            }
        }
        this.save();
        return outcome;
    }

    // Called by the HoH room screen: the HoH answers the visitor in front of them.
    public hohAnswer(accept: boolean): RoomOutcome | null {
        const s = this.state;
        const room = s.week.room;
        const visitor = room && room.visitors[room.index];
        if (!room || !visitor) return null;
        this.reseed(`answer:${room.index}`);
        const outcome = this.mutate((gs) => answerVisitor(gs, room, this.deals, visitor, accept));
        room.index++;
        if (accept && (visitor.kind === "plea" || visitor.kind === "deal")) {
            pledge(this.ledger, "safety", room.hohId, visitor.fromId, s.gameState.phase);
            if (visitor.kind === "deal") pledge(this.ledger, "safety", visitor.fromId, room.hohId, s.gameState.phase + 1);
        }
        const hoh = this.player(room.hohId);
        if (visitor.kind === "plea") {
            this.tell(
                [visitor.fromId],
                accept ? `👑 ${hoh.name} promised you safety this week.` : `👑 ${hoh.name} wouldn't promise you safety.`
            );
        } else if (visitor.kind === "deal") {
            this.tell(
                [visitor.fromId],
                accept
                    ? `👑 ${hoh.name} took your deal: you're safe this week, and ${hoh.name} is safe with you next week.`
                    : `👑 ${hoh.name} turned down your deal.`
            );
        } else if (visitor.kind === "target" && !accept) {
            this.tell([visitor.fromId], `👑 ${hoh.name} wasn't sold on nominating ${this.player(visitor.targetId).name}.`);
        }
        s.socialLog.push(`🚪 ${outcome.text}`);
        this.save();
        return outcome;
    }

    // Called by the HoH room screen once everyone has been heard.
    public endHohRoom = () => {
        const room = this.state.week.room;
        if (room) {
            room.index = room.visitors.length;
            room.done = true;
        }
        this.save();
        this.run();
    };

    // Promises made in the HoH room are checked against the nominations.
    private settleRoom(hohId: number, nomineeIds: number[], initial: boolean) {
        const room = this.state.week.room;
        if (!room) return;
        const news = this.mutate((gs) =>
            settleNominations(gs, room, this.deals, nomineeIds, initial, this.isHuman({ id: hohId }))
        );
        news.forEach((n) => this.tell(n.toIds, n.text));
        this.tellAll(this.mutate((gs) => settleNominationPledges(gs, this.ledger, hohId, nomineeIds, gs.phase)));
        if (!this.isHuman({ id: hohId }))
            nomineeIds
                .filter((id) => this.isHuman({ id }))
                .forEach((id) => {
                    reveal(this.ledger, hohId, id, this.gameState.phase);
                    this.noteRead(id, hohId);
                });
        this.save();
    }

    // What a bot HoH takes into nominations: who it means to keep safe (HoH room promises it means,
    // final-two partners it stays loyal to), and who it was talked into nominating.
    private roomSway() {
        const room = this.state.week.room;
        const hohId = this.state.week.hohId;
        if (hohId === undefined) return { protect: room ? room.safe : [], targets: room ? room.targets.map((t) => t.targetId) : [] };
        const partners = final2Partners(this.ledger, hohId).filter((id) => Math.abs(rng().randomFloat()) < this.honor(hohId, id));
        const love = partnerOf(this.showmances, hohId);
        return {
            protect: [...(room ? room.safe : []), ...partners, ...(love !== undefined ? [love] : [])],
            targets: [
                ...this.showmanceTarget(hohId),
                ...(room ? room.targets.map((t) => t.targetId) : []),
                ...this.personalityTargets(hohId),
                ...this.topThreat(hohId),
            ],
        };
    }

    private nominations() {
        const s = this.state;
        const hoh = getById(s.gameState, s.week.hohId!);
        const count = this.nomCount;
        const audience = !!s.week.audienceNominee;
        const hohCount = audience ? count - 1 : count;
        const secret = !!s.week.secretHoh;
        const options = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== hoh.id);
        // after the HoH's picks: the audience's nominee (if it's that week), then any Hidden Immunity
        const finish = (hohPicks: number[], betrayed: number[]) => {
            const picks = [...hohPicks];
            const notes: string[] = [];
            if (audience) {
                const choice = this.audiencePick(options.filter((o) => !picks.includes(o.id)).map((o) => o.id));
                picks.push(choice);
                notes.push(`📺 The audience has voted: ${this.player(choice).name} is this week's audience nominee!`);
            }
            const repick = (index: number, exclude: number[], cb: (id: number) => void) => {
                const pool = options.filter((o) => !exclude.includes(o.id));
                if (audience && index === picks.length - 1) return cb(pool.length ? this.audiencePick(pool.map((o) => o.id)) : -1);
                this.hohRepick(hoh, pool, "They played Hidden Immunity! You have to name someone else.", cb);
            };
            this.immunityCheck(picks, repick, (final, immunityNotes) => {
                const kept = final.filter((id) => id >= 0);
                const nominees = kept.map((id) => getById(s.gameState, id));
                const [gs, scene, noms] = generateNomCeremonyScene(s.gameState, [hoh], { forcedNominees: nominees });
                s.gameState = gs;
                s.week.nomineeIds = noms.map((n) => n.id);
                s.week.initialNoms = [...s.week.nomineeIds];
                s.week.nominators = {};
                final.forEach((id, i) => id >= 0 && (s.week.nominators![id] = audience && i === final.length - 1 ? -1 : hoh.id));
                betrayed.filter((v) => kept.includes(v)).forEach((victim) => this.backstab(hoh.id, victim, secret ? 0.3 : 1));
                if (!secret) this.settleRoom(hoh.id, s.week.nomineeIds, true);
                const allNotes = [...notes, ...immunityNotes];
                this.feedPush(`🎯 ${listNames(nominees.map((n) => n.name))} ${nominees.length === 1 ? "is" : "are"} on the block.`);
                const shown = secret
                    ? this.textScene("Nomination Ceremony", [`🕶️ The secret ${HOH} has nominated ${listNames(nominees.map((n) => n.name))}.`, ...allNotes])
                    : this.withNotes(scene, allNotes);
                this.showScene(shown, this.afterNomination(hoh.id, s.week.nomineeIds, Step.SocialAfternoon));
            });
        };
        if (!this.isHuman(hoh)) {
            const { picks, betrayed } = botNominate(s.gameState, s.book, hoh, options, hohCount, this.roomSway());
            return finish(
                picks.map((p) => p.id),
                betrayed
            );
        }
        const lastChance = s.week.blockbuster ? " After the veto, the nominees play the Last Chance comp, and the winner comes off the block." : "";
        const howMany = hohCount === 1 ? "one houseguest" : hohCount === 2 ? "two houseguests" : "three houseguests";
        this.privately(hoh.id, `${hoh.name}, ${HOH}`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Nomination Ceremony",
                text: `You are the ${HOH}${secret ? " (and nobody knows it)" : ""}. Choose ${howMany} to nominate for eviction.${
                    audience ? " This week, the audience names the last nominee itself." : ""
                }${lastChance}`,
                options,
                count: hohCount,
                confirmLabel: "Nominate",
                promisedIds: s.week.room ? s.week.room.promised : undefined,
                resolve: (ids) => {
                    const allies = this.allyIds(hoh.id);
                    finish(
                        ids,
                        ids.filter((id) => allies.includes(id))
                    );
                },
            })
        );
    }

    // ---------- pawn talk ----------

    // Being nominated stings. A bot HoH may reassure its pawns right away; a player HoH gets to choose
    // who to reassure (the PawnTalk step) before the game moves on to `next`. Returns the step to go to.
    private afterNomination(hohId: number, newNomineeIds: number[], next: Step): Step {
        const s = this.state;
        const week = s.week;
        if (week.secretHoh) return next;
        if (this.isHuman({ id: hohId })) {
            this.mutate((gs) => nominationHit(gs, hohId, newNomineeIds));
            week.pawnAsk = { ids: newNomineeIds, next };
            return Step.PawnTalk;
        }
        this.reseed(`pawn:${newNomineeIds.join(",")}`);
        const talks = this.mutate((gs) => {
            nominationHit(gs, hohId, newNomineeIds);
            return botPawnTalk(gs, getById(gs, hohId), week.nomineeIds || newNomineeIds, newNomineeIds);
        });
        week.pawns = [...(week.pawns || []), ...talks];
        const hoh = this.player(hohId);
        talks.forEach((t) =>
            this.tell([t.toId], `🤫 ${hoh.name} pulled you aside after the ceremony: "You're not the target this week."`)
        );
        return next;
    }

    // Remembers who was told "you're not the target" in a speech, and puts the speech in the week's recap.
    private keepSpeech(speaker: Houseguest, result: SpeechResult) {
        const s = this.state;
        s.week.pawns = [...(s.week.pawns || []), ...result.talks];
        result.talks.forEach((t) => this.tell([t.toId], `🤫 ${speaker.name} said in front of everyone that you're not the target.`));
        result.lines.forEach((line) => s.socialLog.push(`🎤 ${line}`));
    }

    // A player HoH's nomination speech (also given after naming a replacement nominee). The tone matters:
    // gracious, pawn talk ("you're not the target"), or calling out the real target.
    private pawnTalk() {
        const s = this.state;
        const ask = s.week.pawnAsk;
        if (!ask) return this.goTo(Step.SocialAfternoon);
        const hoh = this.player(s.week.hohId!);
        const options = ask.ids
            .filter((id) => (s.week.nomineeIds || []).includes(id))
            .map((id) => this.player(id))
            .filter((hg) => !hg.isEvicted);
        if (!this.isHuman(hoh) || hoh.isEvicted || options.length === 0) {
            s.week.pawnAsk = undefined;
            return this.goTo(ask.next);
        }
        const one = options.length === 1 ? options[0].name : null;
        const tones: SpeechTone[] = [
            {
                id: "gracious",
                label: "🕊️ Gracious",
                blurb: "Nothing personal, just a game move. Takes some of the sting out of being nominated.",
            },
            {
                id: "pawn",
                label: "🤫 Pawn talk",
                blurb: one
                    ? `Tell ${one} "you're not the target". It softens the blow if they believe you. If they go home, they'll know you lied.`
                    : `Tell a nominee "you're not the target". It softens the blow if they believe you. If they go home, they'll know you lied.`,
                pick: { text: "Who do you tell they're not the target?", options, max: options.length },
            },
            {
                id: "callout",
                label: "🔥 Call-out",
                blurb: one
                    ? `Tell ${one} to their face that they're your target. They'll hate it. Their enemies will love it.`
                    : "Name your target to their face. They'll hate it, their enemies will love it, and the other nominees hear they're pawns.",
                pick: { text: "Who is your target?", options, max: 1 },
            },
        ];
        this.privately(hoh.id, `${hoh.name}'s nomination speech`, () =>
            this.show({
                kind: "speech",
                actorId: hoh.id,
                title: "Nomination Speech",
                text: "Nobody likes being nominated. What you say now decides how hard they take it. Pick a tone.",
                tones,
                deliver: (toneId, ids) => {
                    this.reseed("speech");
                    const result = this.mutate((gs) =>
                        nominationSpeech(gs, hoh.id, options.map((o) => o.id), toneId as SpeechToneId, ids, s.humanIds)
                    );
                    this.keepSpeech(hoh, result);
                    s.week.pawnAsk = undefined;
                    s.step = ask.next;
                    this.save();
                    return result.lines;
                },
                next: () => this.run(),
            })
        );
    }

    // The veto holder's speech at the veto ceremony, given after deciding whether to use the veto.
    private vetoSpeechPrompt(pov: Houseguest, hoh: Houseguest, noms: Houseguest[], used: boolean, next: () => void) {
        const s = this.state;
        const everyone = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== pov.id);
        // in a secret HoH week, nobody can call out a Head of House they don't know
        const onStage = (this.state.week.secretHoh ? noms : [hoh, ...noms]).filter((hg) => hg.id !== pov.id);
        const tones: SpeechTone[] = [
            { id: "gracious", label: "🕊️ Gracious", blurb: "Love for everyone. A small boost with the HoH and the nominees." },
            {
                id: "promise",
                label: "🤝 Promise",
                blurb: "Promise up to two houseguests they're safe if you win HoH next week. If they believe you, they'll like you more, and they'll hold you to it.",
                pick: { text: "Who do you promise safety next week?", options: everyone, max: 2 },
            },
        ];
        if (onStage.length > 0)
            tones.push({
                id: "callout",
                label: "🔥 Call-out",
                blurb: "Call out the HoH or a nominee in front of the house. They'll hate it. Their enemies will love it.",
                pick: { text: "Who do you call out?", options: onStage, max: 1 },
            });
        this.show({
            kind: "speech",
            actorId: pov.id,
            title: "Veto Speech",
            text: used ? "You're using the veto. First, a few words. Pick a tone." : "You're not using the veto. First, a few words. Pick a tone.",
            tones,
            deliver: (toneId, ids) => {
                this.reseed("vetospeech");
                const before = this.deals.length;
                const result = this.mutate((gs) =>
                    vetoSpeech(gs, this.deals, pov.id, hoh.id, noms.map((n) => n.id), toneId as SpeechToneId, ids, s.humanIds)
                );
                this.keepSpeech(pov, result);
                this.deals.slice(before).forEach((d) => pledge(this.ledger, "safety", d.withId, d.hohId, d.week + 1));
                this.save();
                return result.lines;
            },
            next,
        });
    }

    // Eviction night: each nominee who is a player makes a last plea before the vote.
    private speeches(): void {
        const s = this.state;
        if (!s.week.overthrowChecked) {
            s.week.overthrowChecked = true;
            const slot = this.activePower("overthrow");
            if (slot && slot.holderId !== s.week.hohId) return this.overthrow(slot, () => this.run());
        }
        if (!s.week.evictionIntro) {
            s.week.evictionIntro = true;
            const tonight = (s.week.nomineeIds || []).map((id) => this.player(id));
            this.announce("Live Eviction Night", evictionIntro(tonight, nonEvictedHouseguests(s.gameState).length));
            this.save();
            return this.run();
        }
        const nomIds = s.week.nomineeIds || [];
        const spoke = s.week.spoke || [];
        const speaker = this.alivePlayers.find((p) => nomIds.includes(p.id) && !spoke.includes(p.id));
        if (!speaker) return this.goTo(Step.Eviction);
        const everyone = nonEvictedHouseguests(s.gameState);
        const voters = everyone.filter((hg) => hg.id !== s.week.hohId && !nomIds.includes(hg.id));
        const rivals = everyone.filter((hg) => nomIds.includes(hg.id) && hg.id !== speaker.id);
        const canPromise = everyone.filter((hg) => !nomIds.includes(hg.id));
        const tones: SpeechTone[] = [
            { id: "gracious", label: "🕊️ Gracious", blurb: "Thank the house and keep it classy. A small boost with every voter." },
        ];
        if (canPromise.length > 0)
            tones.push({
                id: "promise",
                label: "🤝 Promise",
                blurb: "Promise up to two houseguests they're safe if you stay and win HoH. If they believe you, it can win their vote, and they'll hold you to it.",
                pick: { text: "Who do you promise safety next week?", options: canPromise, max: 2 },
            });
        if (rivals.length > 0)
            tones.push({
                id: "callout",
                label: "🔥 Call-out",
                blurb: "Go after the nominee sitting next to you. Voters who dislike them move toward you. Their friends won't like it.",
                pick: { text: "Who do you call out?", options: rivals, max: 1 },
            });
        this.privately(speaker.id, `${speaker.name}'s eviction speech`, () =>
            this.show({
                kind: "speech",
                actorId: speaker.id,
                title: "Eviction Speech",
                text: "You're on the block and the house is about to vote. This is your last chance to change their minds. Pick a tone.",
                tones,
                deliver: (toneId, ids) => {
                    this.reseed(`evictionspeech:${speaker.id}`);
                    const before = this.deals.length;
                    const result = this.mutate((gs) =>
                        evictionSpeech(gs, this.deals, speaker.id, voters.map((v) => v.id), toneId as SpeechToneId, ids, s.humanIds)
                    );
                    this.keepSpeech(speaker, result);
                    this.deals.slice(before).forEach((d) => pledge(this.ledger, "safety", d.withId, d.hohId, d.week + 1));
                    s.week.spoke = [...spoke, speaker.id];
                    this.save();
                    return result.lines;
                },
                next: () => this.run(),
            })
        );
    }

    // Called at the eviction: pawns who went home were lied to.
    private settlePawns(evictedIds: number[]) {
        const talks = this.state.week.pawns || [];
        if (talks.length === 0) return;
        const news = this.mutate((gs) => settlePawnTalk(gs, talks, evictedIds));
        news.forEach((n) => this.tell(n.toIds, n.text));
        talks.forEach((t) => shiftTrust(this.ledger, t.toId, t.hohId, evictedIds.includes(t.toId) ? -0.4 : 0.1));
        talks
            .filter((t) => evictedIds.includes(t.toId))
            .forEach((t) =>
                this.logMove(
                    "backstab",
                    t.hohId,
                    t.toId,
                    `${this.player(t.hohId).name} told ${this.player(t.toId).name} they weren't the target, then sent them home`,
                    2.5
                )
            );
        this.state.week.pawns = [];
    }

    private vetoComp(): void {
        const s = this.state;
        if (!s.week.swapChecked) {
            s.week.swapChecked = true;
            const slot = this.activePower("ghostSwap");
            if (slot && slot.holderId !== s.week.hohId) return this.ghostSwap(slot, () => this.run());
        }
        const hoh = getById(s.gameState, s.week.hohId!);
        const noms = s.week.nomineeIds!.map((id) => getById(s.gameState, id));
        const players = pickVetoPlayers(s.gameState, [hoh], noms).povPlayers.map((p) => getById(s.gameState, p.id));
        const comp = pickWeeklyComp(s.gameState, s.history, s.usedComps);
        this.runComp("Veto Competition", comp, players, (winnerId) => {
            const [gs, scene, pov] = generateVetoCompScene(s.gameState, [hoh], noms, {
                veto: GoldenVeto,
                forcedPlayers: players,
                forcedWinner: getById(s.gameState, winnerId),
            });
            s.gameState = gs;
            s.week.povId = pov.id;
            this.feedPush(`🏅 ${pov.name} won the Veto.`);
            void scene; // the classic scene is replaced by the Veto winner's own moment
            this.showScene(this.vetoWinnerScene(players, pov, noms, hoh), Step.VetoCeremony);
        }, "veto");
    }

    // The Veto winner gets their own moment: the necklace goes on, and what it means for the block.
    private vetoWinnerScene(players: Houseguest[], pov: Houseguest, noms: Houseguest[], hoh: Houseguest): Scene {
        const s = this.state;
        const onBlock = noms.some((n) => n.id === pov.id);
        const isHoh = !s.week.secretHoh && pov.id === hoh.id;
        const you = s.humanIds.length === 1 && s.humanIds[0] === pov.id;
        const what = onBlock
            ? `${pov.name} was on the block. Now they can save themselves.`
            : isHoh
            ? `The Head of House won it too. The nominations only change if ${pov.name} wants them to.`
            : `${pov.name} now decides whether the nominations stay the same.`;
        const others = players.filter((p) => p.id !== pov.id);
        return new Scene({
            title: "Veto Winner",
            gameState: s.gameState,
            content: (
                <div className="bbb-veto-winner">
                    <div className="bbb-veto-winner-label">🏅 The Veto goes to…</div>
                    <div className="bbb-veto-winner-photo">
                        <img src={pov.imageURL} alt={pov.name} />
                        <span className="bbb-veto-winner-medal">🏅</span>
                    </div>
                    <div className="bbb-veto-winner-name">{pov.name}</div>
                    <p>{what}</p>
                    {you && <p>It's your call at the Veto Ceremony.</p>}
                    {others.length > 0 && <p className="bbb-veto-winner-others">Also played: {listNames(others.map((p) => p.name))}</p>}
                    <NextEpisodeButton />
                </div>
            ),
        });
    }

    private vetoCeremony() {
        const s = this.state;
        let gsAtStart = s.gameState;
        let hoh = getById(gsAtStart, s.week.hohId!);
        let pov = getById(gsAtStart, s.week.povId!);
        let noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        // the veto holder's speech changes relationships: carry on from the state it left
        const refresh = () => {
            gsAtStart = s.gameState;
            hoh = getById(gsAtStart, s.week.hohId!);
            pov = getById(gsAtStart, s.week.povId!);
            noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        };

        const generate = (choice: { decision: Houseguest | null; reason: string }, renom?: Houseguest, notes: string[] = []) => {
            const [gs, scene, finalNoms] = generateVetoCeremonyScene(gsAtStart, [hoh], noms, pov, {
                veto: GoldenVeto,
                forcedVetoChoice: choice,
                forcedRenom: renom,
            });
            s.gameState = gs;
            s.week.nomineeIds = finalNoms.map((n: Houseguest) => n.id);
            if (choice.decision) this.planB();
            if (renom) s.week.nominators = { ...(s.week.nominators || {}), [renom.id]: hoh.id };
            const next = s.week.blockbuster ? Step.SocialBlockbuster : Step.SocialCampaign;
            const shown = s.week.secretHoh
                ? this.textScene("Veto Ceremony", [
                      choice.decision ? `${pov.name} used the Veto on ${choice.decision.name}.` : `${pov.name} did not use the Veto.`,
                      ...(renom ? [`🕶️ The secret ${HOH} named ${renom.name} as the replacement nominee.`] : []),
                      ...notes,
                      `The final nominees: ${listNames(finalNoms.map((n: Houseguest) => n.name))}.`,
                  ])
                : this.withNotes(scene, notes);
            this.showScene(shown, renom ? this.afterNomination(hoh.id, [renom.id], next) : next);
        };
        // the replacement nominee may hold Hidden Immunity: then the HoH names someone else
        const renominate = (choice: { decision: Houseguest | null; reason: string }, first: number, pool: Houseguest[], after: (id: number) => void) =>
            this.immunityCheck(
                [first],
                (_i, exclude, cb) =>
                    this.hohRepick(
                        hoh,
                        pool.filter((hg) => !exclude.includes(hg.id)),
                        "They played Hidden Immunity! You have to name someone else.",
                        cb
                    ),
                (final, notes) => {
                    if (final[0] < 0) return generate(choice, undefined, notes);
                    generate(choice, getById(gsAtStart, final[0]), notes);
                    after(final[0]);
                }
            );

        const afterChoice = (choice: { decision: Houseguest | null; reason: string }) => {
            if (!choice.decision) return generate(choice);
            const everyone = nonEvictedHouseguests(gsAtStart);
            let options = exclude(everyone, [...noms, pov, hoh]);
            if (options.length === 0) options = exclude(everyone, [hoh, ...noms]);
            if (!this.isHuman(hoh)) {
                const { picks, betrayed } = botNominate(gsAtStart, s.book, hoh, options, 1, this.roomSway());
                return renominate(choice, picks[0].id, options, (id) => {
                    if (id === picks[0].id) betrayed.forEach((victim) => this.backstab(hoh.id, victim, s.week.secretHoh ? 0.3 : 1));
                    if (!s.week.secretHoh) this.settleRoom(hoh.id, [id], false);
                });
            }
            this.privately(hoh.id, `${hoh.name}, Head of House`, () =>
                this.show({
                    kind: "choose",
                    actorId: hoh.id,
                    title: "Replacement Nominee",
                    text: `${choice.decision!.name} has been saved by the veto. As Head of House, you must name a replacement nominee.`,
                    options,
                    count: 1,
                    confirmLabel: "Nominate",
                    promisedIds: s.week.room ? s.week.room.promised : undefined,
                    resolve: (ids) =>
                        renominate(choice, ids[0], options, (id) => {
                            if (this.allyIds(hoh.id).includes(id)) this.backstab(hoh.id, id, s.week.secretHoh ? 0.3 : 1);
                            if (!s.week.secretHoh) this.settleRoom(hoh.id, [id], false);
                        }),
                })
            );
        };

        if (this.isHuman(pov)) {
            this.privately(pov.id, `${pov.name}, veto holder`, () =>
                this.show({
                    kind: "choose",
                    actorId: pov.id,
                    title: "Veto Ceremony",
                    text: "You hold the Veto. Will you use it to save one of the nominees?",
                    options: noms,
                    count: 1,
                    noneLabel: "Don't use the veto",
                    confirmLabel: "Use the veto",
                    resolve: (ids) =>
                        this.vetoSpeechPrompt(pov, hoh, noms, ids.length > 0, () => {
                            refresh();
                            afterChoice(
                                ids.length === 0
                                    ? { decision: null, reason: "" }
                                    : { decision: getById(gsAtStart, ids[0]), reason: "" }
                            );
                        }),
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
        const comp = pickQuickComp(s.gameState, s.history, s.usedComps);
        this.runComp("Last Chance Competition", comp, noms, (winnerId) => {
            const [gs, scene, remaining] = generateBlockbusterScene(s.gameState, noms, winnerId);
            s.gameState = gs;
            s.week.blockbusterId = winnerId;
            s.week.nomineeIds = remaining.map((n) => n.id);
            this.planB();
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
            const vote = this.intendedVote(gsAtStart, voter, noms);
            votes[voter.id] = vote.id;
            if (vote.betrayed !== undefined) botBetrayals.push([voter.id, vote.betrayed]);
        });

        // secret powers can change the count: an extra vote (+1), a nullified vote (-1)
        const adjust: { [nomineeId: number]: number } = {};
        const adjustNotes: string[] = [];
        const counted = (id: number) => Object.values(votes).filter((v) => v === id).length + (adjust[id] || 0);
        const generate = (tieBreak?: number) => {
            const [gs, scene] = generateEvictionScene(gsAtStart, [hoh], noms, {
                votingTo: "Evict",
                forcedVotes: votes,
                forcedTieBreak: tieBreak,
                hideVoters: true,
                voteAdjustments: adjust,
                adjustmentNotes: adjustNotes,
                secretTieBreaker: !!s.week.secretHoh,
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
            const pawns = [...(s.week.pawns || [])];
            this.settlePawns(evictedIds);
            this.settleTheVote(gsAtStart.phase, hoh.id, votes, evictedIds, noms);
            this.recordEvictionGrudges(evictedIds, this.blameFor(evictedIds[0]), votes, pawns, "put me on the block");
            // the big moves of the week
            evictedIds.forEach((e) => {
                const out = this.player(e).name;
                if (s.week.overthrowBy !== undefined) {
                    this.logMove("move", s.week.overthrowBy, e, `${this.player(s.week.overthrowBy).name} used the ${POWERS.overthrow.name} and sent ${out} home`, 5);
                } else if (s.week.ghostNominee === e && s.week.ghostBy !== undefined) {
                    this.logMove("move", s.week.ghostBy, e, `${this.player(s.week.ghostBy).name} secretly used the ${POWERS.ghostSwap.name} to send ${out} home`, 4.5);
                } else if (s.week.initialNoms && !s.week.initialNoms.includes(e) && (s.week.nominators || {})[e] === hoh.id) {
                    this.logMove("move", hoh.id, e, `${hoh.name} backdoored ${out}`, 3 + 0.4 * compWins(this.player(e), s.history));
                }
                this.feedPush(`🚪 ${out} has been evicted.`);
            });
            pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
            this.weekScenes.push(scene);
            this.pushJuryHouse();
            this.pushEpisode(BigBrotherVanilla, `Day ${dayOf(gsAtStart, gsAtStart.phase, DAY_PART.eviction)}`);
            s.step = Step.Fallout;
            this.save();
            this.show({ kind: "scene", scene });
        };

        const afterVotes = () => {
            const counts = noms.map((n) => counted(n.id));
            const max = Math.max(...counts);
            const tied = noms.filter((_, i) => counts[i] === max);
            if (tied.length > 1 && this.isHuman(hoh)) {
                this.privately(hoh.id, `${hoh.name}, Head of House`, () =>
                    this.show({
                        kind: "choose",
                        actorId: hoh.id,
                        title: "Tie Breaker",
                        text: "The vote is tied! As Head of House, you must cast the deciding vote to evict.",
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
                promisedIds: promisedVotes(this.ledger, voter.id, gsAtStart.phase),
                confirmLabel: "Vote to evict",
                resolve: (ids) => record(ids[0]),
            }),
            (humanVotes) => {
                Object.assign(votes, humanVotes);
                this.votePowers(noms, votes, adjust, adjustNotes, afterVotes);
            }
        );
    }

    // At the eviction: the Extra Vote and the Vote Nullifier, if someone holds them and wants to use them.
    private votePowers(
        noms: Houseguest[],
        votes: { [voterId: number]: number },
        adjust: { [nomineeId: number]: number },
        notes: string[],
        done: () => void
    ) {
        const s = this.state;
        const nomIds = noms.map((n) => n.id);
        const extra = this.activePower("extraVote");
        const nullifier = this.activePower("nullifier");
        const castExtraVote = (target: number) => {
            extra!.used = true;
            adjust[target] = (adjust[target] || 0) + 1;
            notes.push(`${POWERS.extraVote.emoji} Someone cast an ${POWERS.extraVote.name} tonight.`);
            this.logMove("move", extra!.holderId!, target, `${this.player(extra!.holderId!).name} cast an ${POWERS.extraVote.name} against ${this.player(target).name}`, 2);
        };
        const nullifyVote = (target: number) => {
            nullifier!.used = true;
            const against = Object.values(votes).filter((v) => v === target).length + (adjust[target] || 0);
            if (against > 0) adjust[target] = (adjust[target] || 0) - 1;
            notes.push(`${POWERS.nullifier.emoji} Someone used a ${POWERS.nullifier.name}: one vote to evict ${this.player(target).name} won't count.`);
            this.logMove("move", nullifier!.holderId!, target, `${this.player(nullifier!.holderId!).name} nullified a vote to save ${this.player(target).name}`, 2);
        };
        const steps: ((next: () => void) => void)[] = [];
        if (extra && votes[extra.holderId!] !== undefined) {
            const holder = this.player(extra.holderId!);
            steps.push((next) => {
                if (!this.isHuman(holder)) {
                    if (botExtraVote(s.gameState, this.book, holder.id, nomIds, votes[holder.id], this.partnersOf(holder.id))) castExtraVote(votes[holder.id]);
                    return next();
                }
                this.privately(holder.id, `${holder.name}, your ${POWERS.extraVote.name}`, () =>
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: `${POWERS.extraVote.emoji} ${POWERS.extraVote.name}`,
                        text: "You can cast a second vote tonight. Who do you vote to evict?",
                        options: noms,
                        count: 1,
                        confirmLabel: "Cast it",
                        noneLabel: "Save it",
                        resolve: (ids) => {
                            if (ids.length > 0) castExtraVote(ids[0]);
                            next();
                        },
                    })
                );
            });
        }
        if (nullifier && nullifier.holderId !== s.week.hohId) {
            const holder = this.player(nullifier.holderId!);
            steps.push((next) => {
                if (!this.isHuman(holder)) {
                    const save = botNullify(s.gameState, this.book, holder.id, nomIds, this.partnersOf(holder.id));
                    if (save !== null && Object.values(votes).some((v) => v === save)) nullifyVote(save);
                    return next();
                }
                this.privately(holder.id, `${holder.name}, your ${POWERS.nullifier.name}`, () =>
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: `${POWERS.nullifier.emoji} ${POWERS.nullifier.name}`,
                        text: "Pick a nominee: one vote to evict them won't count tonight.",
                        options: noms,
                        count: 1,
                        confirmLabel: "Nullify a vote",
                        noneLabel: "Save it",
                        resolve: (ids) => {
                            if (ids.length > 0) nullifyVote(ids[0]);
                            next();
                        },
                    })
                );
            });
        }
        const runStep = (i: number): void => (i >= steps.length ? done() : steps[i](() => runStep(i + 1)));
        this.reseed("votepowers");
        runStep(0);
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
        const others = nonEvictedHouseguests(gs).filter((hg) => hg.id !== hoh.id);
        const finish = (evictee?: number) => {
            const [newGs, scene] = finalEvictionScene(gs, hoh, evictee);
            s.gameState = newGs;
            const evicted = others.find((hg) => getById(newGs, hg.id).isEvicted);
            if (evicted) {
                this.tellAll(this.mutate((g) => settleFinalPledges(g, this.ledger, hoh.id, evicted.id)));
                this.endShowmances([evicted.id]);
                this.recordEvictionGrudges([evicted.id], hoh.id, {}, [], "cut me at the final three");
                this.pushJuryHouse();
            }
            this.showScene(scene, Step.FinalTwo);
        };
        if (!this.isHuman(hoh)) {
            // a final-two deal decides it, if the HoH sticks to it
            this.reseed("final2");
            const partners = final2Partners(this.ledger, hoh.id).filter((id) => others.some((o) => o.id === id));
            const love = partnerOf(this.showmances, hoh.id);
            if (love !== undefined && others.some((o) => o.id === love)) return finish(others.find((o) => o.id !== love)!.id);
            if (partners.length === 1 && Math.abs(rng().randomFloat()) < this.honor(hoh.id, partners[0]))
                return finish(others.find((o) => o.id !== partners[0])!.id);
            return finish();
        }
        this.privately(hoh.id, `${hoh.name}, final Head of House`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Final Eviction",
                text: "You are the final Head of House. Who will you evict? The one you keep sits next to you in the final 2.",
                options: others,
                count: 1,
                promisedIds: final2Partners(this.ledger, hoh.id),
                confirmLabel: "Evict",
                resolve: (ids) => finish(ids[0]),
            })
        );
    }

    // The finale: first the jury roundtable (player jurors argue for a finalist, bot jurors make their cases
    // and sway each other), then the votes. Bot jurors vote on feelings, grudges and respect for the game.
    private jury(): void {
        const s = this.state;
        const gs = s.gameState;
        const jurorIds = this.jurorIds();
        const finalists = nonEvictedHouseguests(gs);
        const finalistIds = finalists.map((f) => f.id);
        const playerJurors = this.players.filter((p) => p.isJury && p.isEvicted);
        const botJurors = jurorIds.filter((id) => !this.isHuman({ id }));
        const types: { [id: number]: JurorType } = {};
        jurorIds.forEach((id) => (types[id] = this.jurorTypeOf(id)));
        if (!s.week.finaleIntro) {
            s.week.finaleIntro = true;
            this.announce("Finale Night", finaleIntro(finalists, jurorIds.length));
            this.save();
            return this.run();
        }
        if (!s.week.roundtable) {
            this.collectVotes(
                playerJurors,
                (juror, record) => ({
                    kind: "choose",
                    actorId: juror.id,
                    title: "Jury Roundtable",
                    text: "The jury meets one last time before the vote. Who will you argue for? The other jurors will hear you out, and you'll hear their cases next.",
                    options: finalists,
                    count: 1,
                    noneLabel: "Stay quiet",
                    confirmLabel: "Argue for them",
                    resolve: (ids) => record(ids.length > 0 ? ids[0] : -1),
                }),
                (args) => {
                    this.reseed("roundtable");
                    const lines = roundtable(
                        gs,
                        s.history,
                        this.juryBook,
                        jurorIds,
                        finalistIds,
                        types,
                        Object.keys(args)
                            .map(Number)
                            .filter((id) => args[id] >= 0)
                            .map((id) => ({ byId: id, forId: args[id] })),
                        botJurors
                    );
                    s.week.roundtable = lines;
                    const scene = new Scene({
                        title: "Jury Roundtable",
                        gameState: gs,
                        content: (
                            <div style={{ textAlign: "center" }}>
                                <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🧑‍⚖️ The jury roundtable</h3>
                                {lines.map((line, i) => (
                                    <p key={i}>{line}</p>
                                ))}
                                <NextEpisodeButton />
                            </div>
                        ),
                    });
                    this.weekScenes.push(scene);
                    this.save();
                    this.show({ kind: "scene", scene });
                }
            );
            return;
        }
        this.collectVotes(
            playerJurors,
            (juror, record) => ({
                kind: "choose",
                actorId: juror.id,
                title: "Jury Vote",
                text: "You are on the jury. Your vote is secret. Vote for the houseguest you want to WIN The Houseguests.",
                options: finalists,
                count: 1,
                confirmLabel: "Vote to win",
                resolve: (ids) => record(ids[0]),
            }),
            (votes) => {
                const all: { [jurorId: number]: number } = { ...votes };
                const reasons: { [jurorId: number]: string } = {};
                botJurors.forEach((j) => {
                    const v = botJuryVote(gs, s.history, this.juryBook, j, finalistIds, types[j], jurorIds);
                    all[j] = v.vote;
                    reasons[j] = v.reason;
                });
                this.juryBook.reasons = reasons;
                // finale night: the votes are read one at a time
                const order = shuffled(seededRand(hashcode(`${s.seed}:reveal`)), jurorIds).map((j) => ({ jurorId: j, finalistId: all[j] }));
                this.show({
                    kind: "juryReveal",
                    votes: order,
                    onDone: () => {
                        const [newGs, scene] = juryVoteScene(gs, all, true);
                        s.gameState = new GameState(newGs);
                        this.weekScenes.push(scene);
                        this.pushEpisode(BigBrotherFinale, "Finale");
                        s.step = Step.GameOver;
                        this.save();
                        this.run();
                    },
                });
            }
        );
    }

    // Final-two speeches (each finalist chooses which moves to own up to), then the jury's questions.
    private finalTwo() {
        const s = this.state;
        const gs = s.gameState;
        const finalists = nonEvictedHouseguests(gs);
        const jurorIds = this.jurorIds();
        const botJurors = jurorIds.filter((id) => !this.isHuman({ id }));
        const types: { [id: number]: JurorType } = {};
        jurorIds.forEach((id) => (types[id] = this.jurorTypeOf(id)));
        if (!s.week.finalTwo) {
            this.reseed("finalTwo");
            s.week.finalTwo = {
                spoke: [],
                questions: juryQuestions(gs, this.juryBook, finalists.map((f) => f.id), botJurors),
                qIndex: 0,
                transcript: [],
            };
            this.save();
        }
        const ft = s.week.finalTwo;
        const speaker = finalists.find((f) => !ft.spoke.includes(f.id));
        if (speaker) {
            const moves = movesFor(gs, s.history, this.juryBook, speaker.id, jurorIds);
            const deliver = (ids: string[]) => {
                ft.transcript.push(...giveSpeech(gs, this.juryBook, speaker.id, moves, ids, types, jurorIds));
                ft.spoke.push(speaker.id);
                this.save();
                this.run();
            };
            if (!this.isHuman(speaker)) {
                this.reseed(`speech:${speaker.id}`);
                return deliver(botOwns(this.personalities[speaker.id], moves));
            }
            return this.privately(speaker.id, `${speaker.name}'s final two speech`, () =>
                this.show({ kind: "ownMoves", actorId: speaker.id, moves, onDone: deliver })
            );
        }
        if (ft.qIndex < ft.questions.length) {
            const q = ft.questions[ft.qIndex];
            const finalist = this.player(q.finalistId);
            const respond = (a: Answer) => {
                this.reseed(`answer:${ft.qIndex}`);
                ft.transcript.push(answerJuror(gs, this.juryBook, q, a, types[q.jurorId]));
                ft.qIndex++;
                this.save();
                this.run();
            };
            if (!this.isHuman(finalist)) {
                this.reseed(`botanswer:${ft.qIndex}`);
                return respond(botAnswer(this.personalities[finalist.id]));
            }
            return this.privately(finalist.id, `${finalist.name}, a question from the jury`, () =>
                this.show({ kind: "juryQuestion", actorId: finalist.id, jurorId: q.jurorId, question: q, onAnswer: respond })
            );
        }
        const scene = new Scene({
            title: "Final Two",
            gameState: gs,
            content: (
                <div style={{ textAlign: "center" }}>
                    <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🎤 Final two speeches and jury questions</h3>
                    {ft.transcript.map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                    <NextEpisodeButton />
                </div>
            ),
        });
        this.showScene(scene, Step.Jury);
    }

    // Season stats, awards, and the secret powers (finally revealed).
    private seasonRecap(): JSX.Element {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const winnerId = log ? log.winner : undefined;
        const stats = seasonStats(gs, s.history, winnerId);
        const awards = seasonAwards(gs, s.history, s.moves || [], s.ledger, winnerId);
        const name = (id: number) => this.player(id).name;
        const powers = this.powers.slots.map((sl) => {
            const info = POWERS[sl.id];
            if (sl.id === "secretHoh") {
                const week = s.history.find((w) => w.week === sl.week);
                return `${info.emoji} ${info.name}: week ${sl.week}${week && week.hohId !== undefined ? `, and it was ${name(week.hohId)}` : ""}.`;
            }
            if (sl.id === "audience") return `${info.emoji} ${info.name}: the audience handed out the powers, and named a nominee in week ${sl.week}.`;
            if (sl.holderId === undefined) return `${info.emoji} ${info.name}: never handed out.`;
            return `${info.emoji} ${info.name}: given to ${name(sl.holderId)} in week ${sl.week}${sl.used ? ", and used" : ", never used"}.`;
        });
        return (
            <div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🏅 Season awards</h3>
                <div className="bbb-awards">
                    {awards.map((a) => (
                        <div key={a.title} className="bbb-award">
                            <span className="bbb-award-emoji">{a.emoji}</span>
                            <div>
                                <b>{a.title}</b>: {name(a.winnerId)}
                                <br />
                                <small>{a.reason}</small>
                            </div>
                        </div>
                    ))}
                </div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>📊 Season stats</h3>
                <div style={{ overflowX: "auto" }}>
                    <table className="bbb-stats">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Houseguest</th>
                                <th title={HOH}>👑</th>
                                <th title="Veto">🏅</th>
                                <th title="Last Chance comp">🎬</th>
                                <th title="Times on the block">🎯</th>
                                <th title="Survived the block">🧗</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.map((r) => (
                                <tr key={r.id} className={this.isHuman({ id: r.id }) ? "is-player" : ""}>
                                    <td>{r.placement}</td>
                                    <td>{r.name}</td>
                                    <td>{r.hohWins}</td>
                                    <td>{r.vetoWins}</td>
                                    <td>{r.lastChanceWins}</td>
                                    <td>{r.nominated}</td>
                                    <td>{r.survived}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {powers.length > 0 && (
                    <>
                        <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🤫 This season's secret powers</h3>
                        {powers.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                    </>
                )}
            </div>
        );
    }

    // The end-of-season reveal of the jury's reasons.
    private whyTheJuryVoted(): JSX.Element | null {
        const reasons = (this.state.jury && this.state.jury.reasons) || {};
        const ids = Object.keys(reasons).map(Number);
        if (ids.length === 0) return null;
        return (
            <div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🧑‍⚖️ Why the jury voted</h3>
                {ids.map((id) => (
                    <p key={id}>
                        <b>{this.player(id).name}</b> ({this.jurorTypeOf(id) === "bitter" ? "voted with their heart" : "judged the game"}){" "}
                        {reasons[id]}.
                    </p>
                ))}
            </div>
        );
    }

    private gameOver() {
        const gs = this.state.gameState;
        const weekLabel = (week: number) => dayLabel(gs, week, DAY_PART.eviction);
        const table = generateVotingTable(gs, weekLabel);
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
        newEpisode(generateGameOver(new GameState(new MutableGameState(gs)), weekLabel));
        clearSave();
        playerModeScreen$.next(null);
        this.show({
            kind: "gameOver",
            content: (
                <div>
                    {content}
                    {this.seasonRecap()}
                    {this.whoTheyWere()}
                    {this.whyTheJuryVoted()}
                </div>
            ),
        });
    }
}

let activeController: PlayerModeController | null = null;

export function getActiveController() {
    return activeController;
}

export function activatePlayerMode(controller: PlayerModeController, screen: () => JSX.Element) {
    activeController = controller;
    selectedPlayer$.next(null);
    secretRelationships$.next(true);
    playerModeScreen$.next(screen);
    pushToMainContentStream(screen(), Screens.Ingame);
    controller.start();
}

export function newPlayerSave(
    gameState: GameState,
    humanIds: number[],
    castOptions?: CastOptionsOverride,
    statsHidden?: boolean,
    extras: { difficulty?: Difficulty; powers?: PowerId[] | "surprise" } = {}
): PlayerSave {
    const seed = Date.now() % 1000000007;
    const rand = seededRand(hashcode(`${seed}:powers`));
    const chosen = extras.powers === "surprise" ? surprisePowers(rand) : (extras.powers || []).filter((p) => ALL_POWERS.includes(p));
    const powers = schedulePowers(chosen, totalWeeks(gameState), rand);
    const social: { [id: number]: SocialMemory } = {};
    humanIds.forEach((id) => (social[id] = { chatsThisWeek: {} }));
    return {
        version: 3,
        humanIds,
        seed,
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
        difficulty: extras.difficulty || "normal",
        powers,
    };
}
