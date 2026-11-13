import React from "react";
import { BehaviorSubject, Subject } from "rxjs";
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
import { evictHouseguest, refreshHgStats } from "../components/episode/utilities/evictHouseguest";
import { generateVotingTable } from "../components/votingTable/votingTable";
import { newEpisode, playerModeScreen$, pushToMainContentStream, secretRelationships$, selectedPlayer$ } from "../subjects/subjects";
import { Screens } from "../components/topbar/topBar";
import { WeekRecord } from "./history";
import { Difficulty, SeasonRules, withDefaults } from "./rules";
import { setSuspicion } from "./social/promises";
import { capitalize, explainNomination, explainVote, ReasonContext } from "./social/reasons";
import { CompDefinition, EnduranceDeals, Opponent } from "./comps/compTypes";
import { CompRole, THROW_EFFORT, throwChance } from "./comps/throwing";
import { KNOCKOUT_ID, KNOCKOUT_RULES } from "./comps/knockout";
import { botPour, botSwaps, botTarget, Claim, claimLine, Pour, STRIKES_OUT, TAINTED_WINE_ID, TAINTED_WINE_RULES } from "./comps/taintedWine";
import { compById, finaleComps, pickQuickComp, pickWeeklyComp } from "./comps";
import { botPercentile } from "./comps/botScores";
import { sample, seededRand } from "./comps/random";
import { CompResult, LiveScore, tiedForFirst } from "./comps/compRunner";
import {
    answerPitch,
    Approach,
    botApproaches,
    botSocialTime,
    performSocialAction,
    shiftRelationship,
    socialFactor,
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
import { botHide, hideOutcome, tiebreakHouse, VetoHide } from "./comps/hideTiebreak";
import { botFlip, duelDeck, DuelTurn, Matched, MEMORY_DUEL_ID, MEMORY_DUEL_RULES } from "./comps/memoryDuel";
import { HidingSpot } from "./comps/iconicComps";
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
import { montageLines } from "./social/montage";
import { MoveRecord, seasonAwards, seasonStats } from "./social/awards";
import { listNames } from "../utils/listStrings";
import { HOH, VETO } from "./terms";
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
    hasFinal2,
    reputation,
    reputationLabel,
} from "./social/promises";
import { Standing, WeekReview, WhyTheyDidIt } from "./ui/weekReview";
import { recordSeason, SeasonSummary } from "../career/career";
import { Hall, recordHall } from "../career/halls";
import { SeasonCard } from "../career/seasonCard";
import { play as playCue } from "../sound/sound";
import { feelingReply, mentionsIn, opinionReply, readMessage, Reply, TALK_MAX_LENGTH, TALKS_MIN, talkLine, talkPatience, TalkLine } from "./social/botTalk";
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
import { getComp, getSocial, PlayerProfile } from "../model";
import { clearSave, writeSave } from "./save/serialize";
import { seedRng } from "./seeding";
import {
    apparentRelationship,
    assignPersonalities,
    hash01,
    noticedTells,
    setPersonalitySource,
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
import { DiaryEntry, diaryEntries, recapText } from "./social/diary";
import { battleBackCandidates, battleBackDue, haveNotCount } from "./social/twists";
import { DiaryRoom } from "./ui/diaryRoom";
import { nextTip, Tip, tipIdsFor } from "./coach";

export type { Difficulty } from "./rules";

export enum Step {
    BattleBack = "BattleBack", // evicted houseguests compete to come back, before the week starts
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

// Real time: the steps the season takes a break before, and what players are waiting for.
const BREAK_BEFORE: { [step: string]: string } = {
    [Step.Hoh]: "the Head of House comp",
    [Step.Veto]: "the Veto comp",
    [Step.Eviction]: "eviction night",
    [Step.FinaleHoh1]: "Part 1 of the final Head of House comp",
    [Step.FinaleHoh2]: "Part 2 of the final Head of House comp",
    [Step.FinaleHoh3]: "Part 3 of the final Head of House comp",
    [Step.FinalTwo]: "finale night",
};

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
    // Comp progress, saved as it happens so reloading mid-comp can't get anyone a do-over: which comp was picked,
    // each player's score (or their score so far, once they've started), tiebreak guesses, and every decision
    // made in a Knockout or Tainted Wine (replayed on reload, so the comp picks up where it was).
    locks?: { [key: string]: any };
    evictionIntro?: boolean;
    finaleIntro?: boolean;
    haveNots?: number[]; // the worst scorers in this week's HoH comp: one social action per block until the eviction
    nomWhy?: { [nomineeId: number]: string }; // why a bot HoH nominated who they did
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
    ruleBreakers?: number[]; // players expelled for breaking the rules (online: opening the inspect tools)
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
    rules?: SeasonRules; // house rules (see rules.ts); left out: the defaults
    guided?: boolean; // a guided season: the coach explains each part of the week the first time (see coach.ts)
    tipsSeen?: string[]; // the coach's tips already shown
    // online, real time: a break before each comp and eviction, `gapMs` long, unless every player votes to move
    // on. `startedAt`: when the host started the season. `nextAt`: when the next break ends (left out: the first
    // comp hasn't started yet; it doesn't wait).
    pace?: { gapMs: number; startedAt: number; nextAt?: number };
    // online: seconds a player has to act before a bot decides for them (left out: no limit). See netSession.
    turnLimit?: number;
    powers?: PowersState; // the season's secret powers: which, when, and who holds them
    announce?: { title: string; lines: string[] }[]; // the host's announcements, shown before the next step
    moves?: MoveRecord[]; // big moves and backstabs, for the season awards
    feed?: FeedLine[]; // the live feed: what the house has been up to
    // custom relationships / teams for this season's houseguests (remapped when playing with part of the cast)
    castOptions?: CastOptionsOverride;
    // online: players whose device is away, so a bot plays for them until they're back
    autopilot?: number[];
    // the step a comp is being played in (phase:step), from its start until its winner is known. Players coming
    // back while it's on wait for the end of it: the bot standing in for them finishes it.
    compAt?: string;
    // the diary room: what houseguests said about each week, revealed when the season ends
    diary?: DiaryEntry[];
    // everything that happened in the jury house, for the jury's chat
    juryLog?: { week: number; text: string }[];
    // players' conversations with bots, in their own words (see talkToBot): per player, per houseguest
    talks?: { [viewerId: number]: { [botId: number]: BotTalk } };
}

// A player's conversation with a bot. `key`: the social block that `n` (messages so far) and the answers
// are for: asking twice in one block gets the same answer.
export interface BotTalk {
    lines: TalkLine[];
    key: string;
    n: number;
    warm?: boolean; // they've had a friendly word this block
    max?: number; // how many messages they have time for this block (see talkPatience)
    target?: number | null; // what they said about their target this block (null: they wouldn't say)
}

export type Prompt =
    | { kind: "scene"; scene: Scene }
    // pass-and-play: hand the device to someone before the next screen. `shared`: the next screen isn't private, so
    // everyone can watch. `everyone`: no one in particular, everyone gathers round (playerId is just a placeholder).
    | { kind: "handoff"; playerId: number; reason: string; next: () => void; shared?: boolean; everyone?: boolean }
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
          deals?: { offerFrom: number[] }; // endurance HoH comps: deals on the wall, made through onDeal
          // online: the other players in it, whose scores come in live (see liveScores)
          live?: { humanIds: number[] };
          // they left in the middle of their turn: no do-overs, this is their score
          forfeitScore?: number;
          onScore: (score: number, answers?: boolean[], picks?: (number | string)[]) => void;
          onStart?: () => void;
          onReport?: (score: number, answers?: boolean[], picks?: (number | string)[]) => void;
          // a deal on the wall: ask a bot to drop for safety (whether they did), or take a bot's offer
          onDeal?: (action: "ask" | "accept", botId: number, seconds: number) => boolean;
      }
    | {
          kind: "knockout";
          title: string;
          lines: string[];
          remaining: Houseguest[];
          out: Houseguest[];
          winnerId?: number;
          emoji?: string;
          name?: string;
          captions?: { [id: number]: string };
          onDone: () => void;
      }
    | {
          kind: "memoryDuel"; // Concentration, one on one: whoever's turn it is turns over a card (or, at the end, Continue)
          title: string;
          note: string;
          players: Houseguest[];
          actorId: number;
          deck: string[];
          matched: Matched;
          open: number[];
          scores: { [id: number]: number };
          recent: DuelTurn[]; // the turns since the last time a player turned a card over, replayed first
          onFlip?: (card: number) => void;
          onDone?: () => void; // the duel is over
      }
    | {
          kind: "winePour";
          title: string;
          pourerId: number;
          targetId: number;
          strikes: { [id: number]: number };
          onPour: (pour: Pour) => void;
      }
    | {
          kind: "wineDrink";
          title: string;
          pourerId: number;
          drinkerId: number;
          claim: Claim;
          tell?: string;
          strikes: { [id: number]: number };
          onDecide: (swap: boolean) => void;
      }
    | {
          kind: "compResults";
          title: string;
          comp: CompDefinition;
          participants: Houseguest[];
          results: CompResult[];
          tiedIds?: number[]; // a tie for first that the tiebreaker (Hide the Veto) will settle
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
          kind: "hideTiebreak"; // the tiebreaker: hide your veto card
          title: string;
          spots: HidingSpot[];
          tied: Houseguest[];
          playerId: number;
          moreToPlay: boolean;
          onHide: (spot: number) => void;
      }
    | {
          kind: "hideResults"; // the tiebreaker: the search, and who's left standing
          title: string;
          spots: HidingSpot[];
          tied: Houseguest[];
          hides: VetoHide[];
          winnerId?: number; // none: still tied, and they hide again
          sealed?: boolean; // a secret Head of House week: the winner stays a secret
          onDone: () => void;
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
    | { kind: "gameOver"; content: JSX.Element }
    // online: players are deciding on their own screens at the same time (see gather)
    | { kind: "waiting"; title: string; waitingOn: number[]; comp?: LiveComp }
    // real time: a break before what's next, until `until` or until every player votes to move on. The host's
    // device ends it when time's up (timeUp). `at`: when, from the device that sent it, so every device agrees.
    | { kind: "break"; next: string; until: number; voters: number[]; voted: number[]; timeUp: (at: number) => void }
    | { kind: "breakVote"; playerId: number; next: string; until: number; onVote: (at: number) => void };

// A comp being played online, for the standings while players wait: the bots' results are known up front, the
// players' come in live (see liveScores).
export interface LiveComp {
    comp: CompDefinition;
    seed: number;
    participants: Houseguest[];
    bots: CompResult[];
    humanIds: number[];
}


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

// Who a prompt belongs to: the player making the decision, or null for screens everyone watches.
export function actorOf(prompt: Prompt): number | null {
    switch (prompt.kind) {
        case "handoff":
            return prompt.everyone ? null : prompt.playerId;
        case "breakVote":
        case "compPlay":
        case "tiebreak":
        case "hideTiebreak":
            return prompt.playerId;
        case "social":
        case "alliance":
        case "hohRoom":
        case "hohVisit":
        case "speech":
        case "choose":
        case "ownMoves":
        case "juryQuestion":
            return prompt.actorId;
        case "winePour":
            return prompt.pourerId;
        case "memoryDuel":
            return prompt.onFlip ? prompt.actorId : null;
        case "wineDrink":
            return prompt.drinkerId;
        default:
            return null;
    }
}

// Online play (see net/netSession.ts): every device runs its own controller, and these hooks let the session
// send each player's inputs to the other devices and keep its own copy of the save.
export interface NetHooks {
    // owner: a player's own screen (left out: the screen everyone shares)
    wrapPrompt(prompt: Prompt, owner?: number): Prompt;
    dropPersonal(owner: number): void;
    saved(state: PlayerSave): void;
    ended(): void;
    localIds?: () => number[]; // the players on this device
}

export class PlayerModeController {
    public state: PlayerSave;
    public readonly prompt$ = new BehaviorSubject<Prompt | null>(null);
    // online: players' own screens, shown at the same time as the shared one (see gather)
    public readonly personal$ = new BehaviorSubject<{ [playerId: number]: Prompt }>({});
    // the season changed (saved): screens showing live information re-render
    public readonly changed$ = new Subject<void>();
    public net: NetHooks | null = null;
    // online: the player an input from another device acts for, while it runs
    public actingFor: number | null = null;
    private weekScenes: Scene[] = [];

    constructor(save: PlayerSave) {
        this.state = save;
        this.applyDifficulty();
        // comps that quote the bots (Who Said It?) hear the voices of this season's bots
        setPersonalitySource(() => this.personalities);
    }

    // Bots believe what they're told more readily, or less, depending on the difficulty.
    private applyDifficulty() {
        setSuspicion({ easy: 1.15, normal: 1, hard: 1, cutthroat: 0.8 }[this.difficulty] ?? 1);
    }

    get rules(): SeasonRules {
        return withDefaults(this.state.rules);
    }

    // ---------- the coach (guided seasons; never online) ----------

    get guided(): boolean {
        return !!this.state.guided && !this.net;
    }

    // The coach's tip for this screen, if there's one the players haven't seen. Marks it seen.
    public coachTip(prompt: Prompt): Tip | null {
        if (!this.guided) return null;
        const p: any = prompt;
        const ids = tipIdsFor({ kind: prompt.kind, title: p.title, sceneTitle: p.scene && p.scene.title }, this.state.step, this.gameState.phase);
        const found = nextTip(ids, this.state.tipsSeen || []);
        if (found) {
            this.state.tipsSeen = [...(this.state.tipsSeen || []), found.id];
            writeSave(this.state);
        }
        return found;
    }

    public stopCoaching() {
        this.state.guided = false;
        if (!this.net) writeSave(this.state);
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
        return this.turnOrder[this.state.socialTurn];
    }

    // The order players take their turns in this block of social (or alliance) time: shuffled for each block,
    // the same on every device and after a reload.
    get turnOrder(): Houseguest[] {
        const s = this.state;
        return shuffled(seededRand(hashcode(`${s.seed}:turns:${s.gameState.phase}:${s.step}`)), this.alivePlayers);
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
    // Read by the screens, so it changes nothing (online, each device draws different screens: reading must
    // never make one device's season differ). Those who answer one save the list back.
    public approachesFor(id: number): Approach[] {
        const alive = (hid: number) => getById(this.gameState, hid) && !getById(this.gameState, hid).isEvicted;
        return (this.state.approaches[id] || []).filter(
            (a) => alive(a.fromId) && (a.kind !== "pitch" || alive(a.targetId)) && (a.kind !== "sides" || alive(a.otherId))
        );
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
        if (this.net) this.net.saved(this.state);
        else writeSave(this.state);
        this.changed$.next();
    }

    // ---------- comp progress (see WeekProgress.locks) ----------

    private locked<T>(key: string): T | undefined {
        const locks = this.state.week.locks;
        return locks && key in locks ? locks[key] : undefined;
    }

    private lock(key: string, value: any) {
        this.state.week.locks = { ...(this.state.week.locks || {}), [key]: value };
        this.save();
    }

    // A player's decision in a comp: asked once, then saved. After a reload, the saved answer is used without asking.
    private decide<T>(key: string, ask: (answer: (value: T) => void) => void, then: (value: T) => void) {
        const saved = this.locked<T>(key);
        if (saved !== undefined) return then(saved);
        ask((value) => {
            this.lock(key, value);
            then(value);
        });
    }

    // Which comp is played at this point in the week: picked once and saved, so a reload can't reroll it.
    private compChoice(pick: () => string): string {
        const key = `pick:${this.gameState.phase}:${this.state.step}`;
        const saved = this.locked<string>(key);
        if (saved !== undefined) return saved;
        const id = pick();
        this.lock(key, id);
        return id;
    }

    private reseed(extra: string = "") {
        const s = this.state;
        seedRng(`${s.seed}:${s.gameState.phase}:${s.step}:${s.socialTurn}:${s.socialStage}:${s.actionsLeft}:${extra}`);
    }

    private show(prompt: Prompt) {
        if (this.multiplayer && !this.net) {
            if (prompt.kind === "handoff") this.afterPrivate = false;
            else if (this.inPrivate) this.afterPrivate = true;
            else if (this.afterPrivate && actorOf(prompt) === null) {
                // a screen for everyone, after a private one: call everyone back first
                this.afterPrivate = false;
                const next = () => this.prompt$.next(prompt);
                return this.prompt$.next({ kind: "handoff", playerId: this.state.humanIds[0], reason: "", next, shared: true, everyone: true });
            }
        }
        this.prompt$.next(this.net ? this.net.wrapPrompt(prompt) : prompt);
    }

    // pass-and-play: a private screen is being opened / the last screen up was private
    private inPrivate = false;
    private afterPrivate = false;

    // In pass-and-play, the device is passed before each screen meant for one player. Online, each player has
    // their own device, so there's nothing to pass. `secret`: no one else may see it (votes, powers, decisions);
    // otherwise the others are welcome to watch (a speech, a comp only one of them plays).
    private handOff(secret: boolean, playerId: number, reason: string, prompt: () => void) {
        if (!this.multiplayer || this.net) return prompt();
        const next = () => {
            this.inPrivate = secret;
            try {
                prompt();
            } finally {
                this.inPrivate = false;
            }
        };
        this.show({ kind: "handoff", playerId, reason, next, shared: !secret });
    }

    private privately(playerId: number, reason: string, prompt: () => void) {
        this.handOff(true, playerId, reason, prompt);
    }

    private openly(playerId: number, reason: string, prompt: () => void) {
        this.handOff(false, playerId, reason, prompt);
    }

    // Online: a screen of a player's own, up at the same time as the shared one and other players' own screens.
    private showPersonal(playerId: number, prompt: Prompt) {
        const shown = this.net ? this.net.wrapPrompt(prompt, playerId) : prompt;
        this.personal$.next({ ...this.personal$.value, [playerId]: shown });
    }

    private clearPersonal(playerId: number) {
        if (!(playerId in this.personal$.value)) return;
        if (this.net) this.net.dropPersonal(playerId);
        const rest = { ...this.personal$.value };
        delete rest[playerId];
        this.personal$.next(rest);
    }

    // Several players decide something on their own. Online, they all do it at the same time, each on their own
    // screen, while the shared screen says who's still deciding. On one device, they take turns (passing it).
    // Each answer is saved as it comes in (as `${key}:${id}`), so after a reload only those who haven't answered
    // are asked. `done` gets everyone's answers once they're all in, whatever order they came in.
    // `bot` answers for a player a bot takes over from in the middle of it (online: their device went away).
    private gather<T>(
        key: string,
        players: Houseguest[],
        waitingTitle: string,
        reason: (player: Houseguest) => string,
        ask: (player: Houseguest, moreToPlay: boolean, answer: (value: T) => void) => Prompt,
        done: (answers: { [playerId: number]: T }) => void,
        bot: (player: Houseguest) => T,
        waitingComp?: LiveComp
    ) {
        const keyOf = (id: number) => `${key}:${id}`;
        const finish = () => {
            this.gatherBot = null;
            const answers: { [playerId: number]: T } = {};
            players.forEach((p) => (answers[p.id] = this.locked<T>(keyOf(p.id)) as T));
            done(answers);
        };
        const pending = players.filter((p) => this.locked(keyOf(p.id)) === undefined);
        if (pending.length === 0) return finish();
        if (!this.net) {
            const turn = (i: number): void => {
                if (i >= pending.length) return finish();
                const player = pending[i];
                this.privately(player.id, reason(player), () =>
                    this.show(
                        ask(player, i + 1 < pending.length, (value) => {
                            this.lock(keyOf(player.id), value);
                            turn(i + 1);
                        })
                    )
                );
            };
            return turn(0);
        }
        const left = pending.map((p) => p.id);
        const showWaiting = () => this.show({ kind: "waiting", title: waitingTitle, waitingOn: [...left], comp: waitingComp });
        const answerFor = (player: Houseguest) => (value: T) => {
            const at = left.indexOf(player.id);
            if (at < 0) return; // answered already
            left.splice(at, 1);
            this.clearPersonal(player.id);
            this.lock(keyOf(player.id), value);
            if (left.length === 0) finish();
            else showWaiting();
        };
        this.gatherBot = (id) => {
            const player = pending.find((p) => p.id === id);
            if (player && left.includes(id)) answerFor(player)(bot(player));
        };
        showWaiting();
        pending.forEach((player) => this.showPersonal(player.id, ask(player, false, answerFor(player))));
    }

    // While players answer at the same time (see gather): answers for one of them with what a bot would do.
    private gatherBot: ((playerId: number) => void) | null = null;

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

    // A bot's hidden throwing score, 0 to 10, mostly around 5 (see throwing.ts): fixed for the season.
    public throwScore(id: number): number {
        const pinned = this.gameState.houseguests[id] && this.gameState.houseguests[id].throws;
        if (typeof pinned === "number") return pinned; // a Hall season: the same bot as before
        const roll = (k: number) => hash01(`${this.state.seed}:throw:${k}:${id}`);
        return Math.round((10 * (roll(1) + roll(2) + roll(3))) / 3);
    }

    // A bot's comp performance, adjusted for difficulty.
    // `seed`: the same skill every time for this seed (a comp that's replayed after a reload must come out the same)
    private botSkill(hg: Houseguest, seed?: string): number {
        const shift = { easy: -0.12, normal: 0, hard: 0.08, cutthroat: 0.14 }[this.difficulty] ?? 0;
        const rand = seed === undefined ? undefined : seededRand(hashcode(`${seed}:skill:${hg.id}`));
        return Math.max(0, Math.min(1, botPercentile(hg, rand) + shift));
    }

    // How strategically bots play: going after threats with their votes and nominations, or voting on feelings.
    private strategy(): { threatVote: number; threatNom: number; gut: number } {
        const late = this.lateness();
        if (this.difficulty === "easy") return { threatVote: 0.05 + 0.15 * late, threatNom: 0.15 + 0.25 * late, gut: 0.25 };
        if (this.difficulty === "hard") return { threatVote: 0.3 + 0.4 * late, threatNom: 0.5 + 0.4 * late, gut: 0 };
        if (this.difficulty === "cutthroat") return { threatVote: 0.5 + 0.4 * late, threatNom: 0.7 + 0.25 * late, gut: 0 };
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

    // ---------- why they did it ----------

    private get reasonContext(): ReasonContext {
        const s = this.state;
        return { gs: s.gameState, book: this.book, history: s.history, ledger: this.ledger, showmances: this.showmances, personalities: this.personalities };
    }

    // A bot HoH's nominations, explained: kept for the recap and the season's end, and the nominated players hear it.
    private explainNoms(hohId: number, nomineeIds: number[]) {
        const s = this.state;
        if (this.isHuman({ id: hohId })) return;
        const ctx = this.reasonContext;
        s.week.nomWhy = { ...(s.week.nomWhy || {}) };
        nomineeIds.forEach((id) => {
            const why = explainNomination(ctx, hohId, id);
            s.week.nomWhy![id] = why;
            if (!s.week.secretHoh) this.tell([id], `💬 Word around the house: ${this.player(hohId).name} nominated you. ${capitalize(why)}.`);
        });
    }

    private logMove(kind: "move" | "backstab", actorId: number, targetId: number | undefined, text: string, weight: number) {
        const s = this.state;
        s.moves = [...(s.moves || []), { week: s.gameState.phase, kind, actorId, targetId, text, weight }];
    }

    // ---------- real time (online) ----------

    private breakKey(): string {
        return `break:${this.gameState.phase}:${this.state.step}`;
    }

    // Whether the season takes a break before this step (real time only).
    private breakPending(): boolean {
        const pace = this.state.pace;
        if (!pace || !this.net || !(this.state.step in BREAK_BEFORE)) return false;
        if (this.locked(this.breakKey()) !== undefined) return false;
        if (pace.nextAt === undefined) {
            // the first one: straight into it, and the next is a gap after the season started
            pace.nextAt = pace.startedAt + pace.gapMs;
            this.lock(this.breakKey(), "start");
            return false;
        }
        return true;
    }

    public breakVoters(): number[] {
        return this.state.humanIds.filter((id) => !this.isRuleBreaker(id) && !this.isAutopilot(id));
    }

    private realtimeBreak() {
        const pace = this.state.pace!;
        const key = this.breakKey();
        const votesKey = `${key}:votes`;
        const next = BREAK_BEFORE[this.state.step];
        const voted = () => this.locked<number[]>(votesKey) || [];
        const until = pace.nextAt!;
        const finish = (at: number) => {
            if (this.locked(key) !== undefined) return;
            this.state.humanIds.forEach((id) => this.clearPersonal(id));
            pace.nextAt = at + pace.gapMs;
            this.feedPush(`⏰ Break's over: on to ${next}.`);
            this.lock(key, at);
            this.run();
        };
        const showShared = () => this.show({ kind: "break", next, until, voters: this.breakVoters(), voted: voted(), timeUp: finish });
        const vote = (id: number) => (at: number) => {
            if (this.locked(key) !== undefined || voted().includes(id)) return;
            this.lock(votesKey, [...voted(), id]);
            this.clearPersonal(id);
            const left = this.breakVoters().filter((v) => !voted().includes(v));
            if (left.length === 0) return finish(at);
            showShared();
        };
        showShared();
        this.breakVoters()
            .filter((id) => !voted().includes(id))
            .forEach((id) => this.showPersonal(id, { kind: "breakVote", playerId: id, next, until, onVote: vote(id) }));
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
        if (this.breakPending()) return this.realtimeBreak();
        switch (this.state.step) {
            case Step.BattleBack:
                return this.battleBack();
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

    public isRuleBreaker(id: number): boolean {
        return (this.state.ruleBreakers || []).includes(id);
    }

    private clearAllPersonal() {
        Object.keys(this.personal$.value).forEach((id) => this.clearPersonal(Number(id)));
    }

    // A player broke the rules (online: opened the browser's inspect tools): expelled on the spot, in front of
    // everyone. On the block, that's the week's eviction: no vote needed. Already out, they lose their jury seat;
    // in the final two, every jury vote goes to the other finalist.
    public ruleBreak() {
        const s = this.state;
        const id = this.actingFor;
        if (id === null || !s.humanIds.includes(id) || this.isRuleBreaker(id) || s.step === Step.GameOver) return;
        s.ruleBreakers = [...(s.ruleBreakers || []), id];
        const hg = this.player(id);
        const name = hg.name;
        const lines = [`🚨 ${name} opened the inspect tools in the middle of the game. That's against the rules.`];
        const week: Step[] = [
            Step.SocialMorning,
            Step.Hoh,
            Step.AllianceHoh,
            Step.HohRoom,
            Step.Noms,
            Step.PawnTalk,
            Step.SocialAfternoon,
            Step.Veto,
            Step.VetoCeremony,
            Step.SocialBlockbuster,
            Step.Blockbuster,
            Step.SocialCampaign,
            Step.Speeches,
            Step.Eviction,
        ];
        const finalThree: Step[] = [Step.SocialFinale1, Step.FinaleHoh1, Step.SocialFinale2, Step.FinaleHoh2, Step.SocialFinale3, Step.FinaleHoh3, Step.FinalEviction];
        if (hg.isEvicted) {
            if (hg.isJury) {
                this.mutate((gs) => (getById(gs, id).isJury = false));
                lines.push(`${name} loses their seat on the jury.`);
            } else lines.push(`${name} is out of the game for good.`);
        } else if (s.step === Step.FinalTwo || s.step === Step.Jury) {
            lines.push(`${name} is disqualified: every jury vote goes to the other finalist.`);
        } else {
            const phase = s.gameState.phase;
            this.mutate((gs) => {
                evictHouseguest(gs, id);
                getById(gs, id).isJury = false;
            });
            this.feedPush(`🚨 ${name} broke the rules and was expelled.`);
            lines.push(`${name} has been expelled from the house, effective immediately.`);
            if (finalThree.includes(s.step)) {
                lines.push("That leaves the final two: on to the jury.");
                s.step = Step.FinalTwo;
            } else if (week.includes(s.step)) {
                const nominee = (s.week.nomineeIds || []).includes(id);
                if (nominee || s.gameState.remainingPlayers <= 3) {
                    // that's this week's eviction
                    s.history = [
                        ...s.history,
                        {
                            week: phase,
                            hohId: s.week.hohId,
                            nomineeIds: s.week.nomineeIds || [],
                            povId: s.week.povId,
                            blockbusterId: s.week.blockbusterId,
                            evictedIds: [id],
                        },
                    ];
                    lines.push(nominee ? `${name} was on the block, so there's no eviction vote this week.` : "That's this week's eviction.");
                    pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
                    this.pushEpisode(BigBrotherVanilla, `Day ${dayOf(s.gameState, phase, DAY_PART.eviction)}`);
                    s.step = Step.Fallout;
                } else if (s.week.hohId === id && !s.week.nomineeIds) {
                    // the Head of House is gone before nominations: the HoH comp's results stand, without them
                    lines.push(`The Head of House is gone. The comp results stand without ${name}.`);
                    s.week.hohId = undefined;
                    s.week.room = undefined;
                    s.step = Step.Hoh;
                }
            }
        }
        this.announce("🚨 Rule breaker", lines);
        this.clearAllPersonal();
        this.save();
        this.run();
    }

    // A player making their own decisions: not expelled, and (online) not away with a bot playing for them.
    public isHuman(hg: { id: number } | undefined) {
        return !!hg && this.state.humanIds.includes(hg.id) && !this.isRuleBreaker(hg.id) && !this.isAutopilot(hg.id);
    }

    public isAutopilot(id: number): boolean {
        return (this.state.autopilot || []).includes(id);
    }

    // ---------- stand-ins: a player can't win a comp a bot played for them ----------

    private stepKey(): string {
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
    private compStarts<A extends any[]>(onWinner: (...args: A) => void): (...args: A) => void {
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
    private standInKey(): string {
        return `standIns:${this.gameState.phase}:${this.state.step}`;
    }

    private noteStandIn(id: number) {
        const list = this.locked<number[]>(this.standInKey()) || [];
        if (!list.includes(id)) this.lock(this.standInKey(), [...list, id]);
    }

    // At the start of a comp: the players who are away right now.
    private noteStandIns(participants: { id: number }[]) {
        participants.forEach((p) => {
            if (this.state.humanIds.includes(p.id) && this.isAutopilot(p.id)) this.noteStandIn(p.id);
        });
    }

    // A player a bot played (some of) this step's comp for. They take part, but they can't win it.
    private stoodIn(id: number): boolean {
        if (this.state.humanIds.includes(id) && this.isAutopilot(id)) return true;
        return (this.locked<number[]>(this.standInKey()) || []).includes(id);
    }

    // The winner of a comp where the last one standing wins (knockout, wine, memory duel). If a bot stood in for
    // them, the win goes to whoever lasted longest without one. `out`: who went out, first out first.
    private eliminationWinner(last: number, out: number[], lines: string[]): [number, number[]] {
        if (!this.stoodIn(last)) return [last, out];
        const order = [...out, last];
        const real = [...order].reverse().find((id) => !this.stoodIn(id));
        if (real === undefined) return [last, out];
        lines.push(`💤 ${this.player(last).name} was away, with a bot standing in, so they can't win. The win goes to ${this.player(real).name}.`);
        return [real, order.filter((id) => id !== real)];
    }

    // The players among `hgs` who make their own decisions (evicted ones too: the battle back is for them).
    private playingHumans(hgs: { id: number }[]): Houseguest[] {
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
    private skipTurn() {
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
    private simulateBots(comp: CompDefinition, participants: Houseguest[], seed: number, role: CompRole): CompResult[] {
        const ctx = { seed, gameState: this.gameState, history: this.state.history, participants };
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
    private wallDeals(player: Houseguest, bots: CompResult[], seed: number): EnduranceDeals {
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

    private noteComp(comp: CompDefinition) {
        this.state.usedComps = [...this.state.usedComps, comp.id];
    }

    // Runs a competition: every player in it takes a turn (same seed), then everyone sees the results.
    private runComp(
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
        const deals = (player: Houseguest) => (role === "hoh" && comp.kind === "endurance" ? this.wallDeals(player, bots, seed) : undefined);
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
                        ? started.score ?? comp.botScore(0, { gameState: this.gameState, history: this.state.history })
                        : undefined;
                    return {
                        kind: "compPlay",
                        title,
                        comp,
                        participants,
                        playerId: player.id,
                        seed,
                        opponents: bots.map((r) => ({ hg: byId(r.id), score: r.score, answers: r.answers, picks: r.picks })),
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
                        { seed, gameState: this.gameState, history: this.state.history, participants },
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
                const score = started.score ?? comp.botScore(0, { gameState: this.gameState, history: this.state.history });
                this.tell([player.id], `⏱️ You left the ${comp.name} in the middle of your turn. Your score stands: ${comp.format(score)}.`);
                return record({ id: player.id, score });
            }
            let lastSaved = 0;
            const opponents: Opponent[] = [...bots, ...humanResults].map((r) => ({
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
    private useKnockout(competitors: Houseguest[]): boolean {
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
    private runKnockout(title: string, participants: Houseguest[], onWinner: (id: number, worstFirst: number[]) => void) {
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
    private useTaintedWine(competitors: Houseguest[]): boolean {
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
    private useMemoryDuel(competitors: Houseguest[]): boolean {
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
    private pickComp(competitors: Houseguest[], hoh: boolean): string {
        return this.compChoice(() => {
            if (hoh && this.useKnockout(competitors)) return KNOCKOUT_ID;
            if (this.useTaintedWine(competitors)) return TAINTED_WINE_ID;
            if (this.useMemoryDuel(competitors)) return MEMORY_DUEL_ID;
            return pickWeeklyComp(this.state.gameState, this.state.history, this.state.usedComps, this.rules.kinds).id;
        });
    }

    // Tainted Wine: two glasses, one tainted. The pourer offers one to a houseguest and keeps the other, truth or
    // bluff; the houseguest drinks or trades. Two tainted sips and you're out; whoever drank the tainted glass pours
    // next. Every player decision is saved as it's made, and the bots' choices come from the comp's seed, so a
    // reload replays the comp exactly up to where it was.
    private runTaintedWine(title: string, participants: Houseguest[], onWinner: (id: number, worstFirst: number[]) => void) {
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
        onWinner = this.compStarts(onWinner);
        this.noteStandIns(participants);
        const skillOf = (id: number) => (this.isHuman({ id }) ? 0.5 : this.botSkill(this.player(id), `${seed}`));

        const captions = () => {
            const c: { [id: number]: string } = {};
            remaining.forEach((id) => (c[id] = strikes[id] === 0 ? "🍷 no sips" : `☠️ ${strikes[id]}/${STRIKES_OUT}`));
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

        const drink = (pourerId: number, targetId: number, pour: Pour, swap: boolean) => {
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
            // one glass at a time
            board(() => pourTurn(remaining.includes(victim) ? victim : other), undefined, `wine:${seed}:${round}:seen`);
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

        const pourTurn = (pourerId: number) => {
            const options = remaining.filter((id) => id !== pourerId).map((id) => this.player(id));
            const pourer = this.player(pourerId);
            const botPick = botTarget(pourer, options, strikes, noise).id;
            if (options.length === 1) return offer(pourerId, options[0].id);
            if (!this.isHuman(pourer)) return offer(pourerId, botPick);
            this.decide<number>(
                `wine:${seed}:${round + 1}:target`,
                (answer) =>
                    board(() =>
                        this.privately(pourerId, `${pourer.name}, you're pouring`, () =>
                            this.show({
                                kind: "choose",
                                actorId: pourerId,
                                title: "Tainted Wine: who do you pour for?",
                                text: `You hold both glasses and you know which one is tainted. Pick who you'll offer a glass to: you drink the other one. Everyone sees who you pick. Strikes: ${remaining
                                    .map((id) => `${name(id)} ${strikes[id]}/${STRIKES_OUT}`)
                                    .join(", ")}.`,
                                options,
                                count: 1,
                                confirmLabel: "Pour for them",
                                resolve: (ids) => answer(ids[0]),
                            })
                        )
                    ),
                (targetId) => offer(pourerId, targetId)
            );
        };

        const first = sample(noise, remaining, 1)[0];
        lines.push(`🎲 ${name(first)} was drawn to pour first.`);
        pourTurn(first);
    }

    // Memory Duel: Concentration, king of the hill. Two at a time, in a drawn order: the winner of each duel faces
    // the next challenger, and the loser is out. Players turn over one card at a time, each card saved as it's
    // turned over; bots turn theirs over from the comp's seed, so a reload replays the comp exactly.
    private runMemoryDuel(title: string, participants: Houseguest[], onWinner: (id: number, worstFirst: number[]) => void) {
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
                        turnOver(botFlip(deck, matched, seen, open.length ? open[0] : null, skill, hashcode(`${dseed}:${seen.length}`)));
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
    private tiebreak(title: string, tiedIds: number[], seed: number, done: (winnerId: number) => void, round: number = 0) {
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

    // Asks one or more players to vote privately: all at once online, one after another on one device.
    private collectVotes(
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

    // The house's biggest threats, for the weekly review.
    private topThreats(n: number): { id: number; emoji: string; label: string }[] {
        return nonEvictedHouseguests(this.gameState)
            .map((hg) => ({ id: hg.id, ...this.threatOf(hg.id) }))
            .sort((a, b) => a.rank - b.rank)
            .slice(0, n)
            .map((t) => ({ id: t.id, emoji: t.emoji, label: t.label }));
    }

    // Where a player stands: only shown when they're alone on their device (it's private).
    public standingOf(id: number): Standing | undefined {
        const s = this.state;
        if (this.net || s.humanIds.length !== 1 || this.player(id).isEvicted) return undefined;
        const others = nonEvictedHouseguests(this.gameState).filter((hg) => hg.id !== id);
        const reads = (s.reads && s.reads[id]) || {};
        const warm = others.filter((o) => reads[o.id] && reads[o.id].v > 0.25).length;
        const cold = others.filter((o) => reads[o.id] && reads[o.id].v < -0.25).length;
        const unknown = others.filter((o) => !reads[o.id]).length;
        const threat = this.threatOf(id);
        const rep = reputationLabel(reputation(this.ledger, id));
        const alliances = this.alliancesOf(id)
            .filter((a) => a.memberIds.filter((m) => !this.player(m).isEvicted).length >= 2)
            .map((a) => a.name);
        const tips: string[] = [];
        if (unknown >= 3) tips.push(`You don't have a read on ${unknown} houseguests yet. A chat tells you how they feel about you.`);
        if (alliances.length === 0) tips.push("Nobody has your back. An alliance can protect you on eviction night.");
        if (threat.rank === 0 || threat.label === "High") tips.push("You're one of the biggest targets. A final-two deal, or a quiet week in the comps, could take the heat off.");
        if (cold > warm && cold >= 2) tips.push("More people seem wary of you than friendly. Spend a few actions mending fences.");
        if (reputation(this.ledger, id) < -0.3) tips.push("Your word isn't worth much right now. Keep your next few promises.");
        return { name: this.player(id).name, threat, reputation: rep, alliances, warm, cold, unknown, tips: tips.slice(0, 2) };
    }

    private weekStart() {
        const s = this.state;
        const remaining = s.gameState.remainingPlayers;
        if (remaining <= 2) return this.goTo(Step.GameOver);
        const finale = remaining === 3;
        // no relationships before the game: bots and players alike start as strangers, and forge them in the house
        s.gameState = prepareNextWeek(s.gameState, finale ? BigBrotherFinale : BigBrotherVanilla, s.castOptions, true);
        s.weekStartState = s.gameState;
        s.week = { blockbuster: this.rules.lastChance && !finale && remaining >= BLOCKBUSTER_MIN_PLAYERS };
        s.deals = this.deals.filter((d) => d.week >= s.gameState.phase - 1);
        s.humanIds.forEach((id) => (this.socialMemory(id).chatsThisWeek = {}));
        s.socialLog = [];
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
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
                        {last && (
                            <WeekReview
                                gs={s.gameState}
                                week={last}
                                threats={this.topThreats(3)}
                                standing={this.standingOf(s.humanIds[0])}
                            />
                        )}
                        {defaultContent(s.gameState)}
                    </div>
                ),
            }),
        });
    }

    private social() {
        const s = this.state;
        const alive = this.turnOrder;
        if (s.socialTurn >= alive.length) return this.finishSocialBlock();
        const actor = alive[s.socialTurn];
        const blockName = SOCIAL_BLOCK_NAMES[s.step];
        if (!this.isHuman(actor)) return this.skipTurn();
        if (s.socialStage === "alliance") {
            // at the final three there's nobody left to target: no alliance time
            // nothing to meet about: no alliances, or every one of them is all on the block
            if (this.alliancesOf(actor.id).every((a) => this.allianceStandsDown(a)) || !this.allianceTimeOpen()) return this.endAlliance();
            this.privately(actor.id, `${actor.name}'s alliance time`, () =>
                this.show({ kind: "alliance", blockName, actorId: actor.id })
            );
            return;
        }
        // other houseguests come to talk to the player (once per social block)
        const key = `${s.gameState.phase}:${s.step}`;
        if (s.approachKey[actor.id] !== key) {
            s.approachKey[actor.id] = key;
            // the start of their turn: a Have-Not only has the energy for one action
            if (this.isHaveNot(actor.id)) s.actionsLeft = Math.min(s.actionsLeft, 1);
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

    // Every member left in the alliance is on the block, or everyone on the block is in the alliance: any target
    // would be one of their own, so it doesn't pick one. It's every member for themselves this week.
    public allianceStandsDown(a: Alliance): boolean {
        const block = this.targetBlock();
        const members = aliveMembers(this.gameState, a);
        if (!block || members.length === 0) return false;
        return members.every((m) => block.includes(m.id)) || block.every((id) => members.some((m) => m.id === id));
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
            // bots only: what you've noticed about how they play, more as the weeks go on
            tells: this.isHuman(other) ? [] : noticedTells(this.personalities[otherId], this.state.history.length, `${this.state.seed}:${otherId}`),
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
                    if (!known.includes(result.learned)) this.state.overheard = { ...(this.state.overheard || {}), [actorId]: [...known, result.learned] };
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

    // ---------- talking to bots in your own words ----------

    public talkWith(viewerId: number, botId: number): TalkLine[] {
        const mine = this.state.talks && this.state.talks[viewerId];
        return (mine && mine[botId] && mine[botId].lines) || [];
    }

    // The current player says something to a bot during social time. The message is read for what it's
    // about (see botTalk.ts), and the bot reacts by the same rules as the social buttons: questions and small
    // talk are free, while deals, pitches and the like use up a social action, just like the buttons do.
    public talkToBot(botId: number, text: string): { lines: TalkLine[]; outcome?: SocialOutcome } | null {
        const s = this.state;
        const actor = this.socialActor;
        const clean = String(text || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, TALK_MAX_LENGTH);
        if (!actor || !clean || s.socialStage !== "social" || !this.isHuman(actor) || !SOCIAL_BLOCK_NAMES[s.step]) return null;
        if (s.approachKey[actor.id] !== `${s.gameState.phase}:${s.step}`) return null; // their social screen isn't up yet
        const bot = s.gameState.houseguests.find((hg) => hg.id === botId);
        if (!bot || bot.isEvicted || bot.id === actor.id || this.isHuman(bot)) return null;
        const gs = this.gameState;
        const talks = (s.talks = s.talks || {});
        const mine = (talks[actor.id] = talks[actor.id] || {});
        const talk = (mine[botId] = mine[botId] || { lines: [], key: "", n: 0 });
        const block = `${gs.phase}:${s.step}`;
        if (talk.key !== block) {
            talk.key = block;
            talk.n = 0;
            talk.warm = false;
            delete talk.target;
            // how much time they have for you: decided when you start talking, so it doesn't move mid-chat
            const traits = this.traitsOf(botId);
            talk.max = talkPatience(bot.relationships[actor.id] ?? 0, traits ? traits.chats : 1, hash01(`${s.seed}:${block}:${actor.id}:${botId}:patience`));
        }
        const day = this.currentDay();
        const said: TalkLine[] = [];
        const add = (who: TalkLine["who"], t: string) => {
            const l = { who, text: t, day };
            talk.lines.push(l);
            said.push(l);
        };
        add("me", clean);
        talk.n++;
        const p = this.personalities[botId];
        const lineKey = `${s.seed}:${block}:${actor.id}:${botId}:${talk.n}`;
        const line = (reply: Reply, who: string = "") => talkLine(p, reply, `${lineKey}:${reply}`, who);
        const name = (id: number) => (id === actor.id ? "you" : this.player(id).name);
        const botSays = (t: string) => add("bot", t);
        const finish = (outcome?: SocialOutcome) => {
            if (talk.lines.length > 60) talk.lines = talk.lines.slice(talk.lines.length - 60);
            this.save();
            return { lines: said, outcome };
        };

        if (talk.n > (talk.max ?? TALKS_MIN)) {
            botSays(line("tired"));
            return finish();
        }

        this.reseed(`talk:${actor.id}:${botId}:${talk.n}`);
        const rand = () => Math.abs(rng().randomFloat());
        const others = nonEvictedHouseguests(gs).filter((hg) => hg.id !== actor.id && hg.id !== botId);
        const iAmHoh = s.week.hohId === actor.id;
        const intent = readMessage(clean, mentionsIn(clean, others), { iAmHoh });
        const noms = (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted);
        const nomsSet = noms.length >= 2 && [Step.SocialAfternoon, Step.SocialBlockbuster, Step.SocialCampaign].includes(s.step);
        const hohId = s.week.hohId;
        const botVotes = botId !== hohId && !noms.includes(botId);
        const real = bot.relationships[actor.id] ?? 0;
        const info = this.traitsOf(botId);
        const lies = info ? info.lies : 1;

        // an action, as if the player had pressed its button (no actions left: the bot puts it off)
        const act = (action: SocialAction, yes: Reply, no: Reply, about: string = "") => {
            if (s.actionsLeft <= 0) {
                botSays(line("busy"));
                return finish();
            }
            const outcome = this.socialAct(action);
            if (!outcome) {
                botSays(line("notNow"));
                return finish();
            }
            botSays(line(outcome.good ? yes : no, about));
            add("note", outcome.text);
            return finish(outcome);
        };
        // small talk: a friendly word helps a little, once per block
        const friendly = (reply: Reply, delta: number = 0.015) => {
            if (!talk.warm) {
                talk.warm = true;
                this.mutate((m) => shiftRelationship(m, actor.id, botId, delta * socialFactor(actor) * (0.5 + rand())));
            }
            botSays(line(reply));
            this.noteRead(actor.id, botId);
            return finish();
        };

        switch (intent.kind) {
            case "askTarget": {
                if (talk.target === undefined) {
                    let target: number | undefined;
                    if (botId === hohId && nomsSet) {
                        target = noms.reduce((a, b) => ((bot.relationships[a] ?? 0) <= (bot.relationships[b] ?? 0) ? a : b));
                    } else {
                        const everyone = nonEvictedHouseguests(gs).filter((hg) => hg.id !== botId);
                        target = everyone.length
                            ? everyone.reduce((a, b) => ((bot.relationships[a.id] ?? 0) <= (bot.relationships[b.id] ?? 0) ? a : b)).id
                            : undefined;
                    }
                    const decoys = others.filter((hg) => hg.id !== target);
                    if (target === undefined) talk.target = null;
                    else if (target === actor.id) {
                        // nobody tells you to your face... though a liar might name somebody else
                        talk.target = decoys.length && rand() < Math.min(0.9, 0.5 * lies) ? decoys[rng().randomInt(0, decoys.length - 1)].id : null;
                    } else if (real > 0.15 || rand() < 0.15) {
                        // friends tell you, and liars sometimes name the wrong person
                        talk.target = decoys.length && rand() < 0.12 * lies ? decoys[rng().randomInt(0, decoys.length - 1)].id : target;
                    } else talk.target = null;
                }
                const told = talk.target;
                if (told === null || told === undefined) {
                    botSays(line(p === "floater" && rand() < 0.5 ? "targetNoone" : "targetSecret"));
                } else {
                    botSays(line(botId === hohId && nomsSet ? "targetHoh" : "targetIs", name(told)));
                    this.noteIntel(actor.id, botId, `🗣️ Told you their target is ${name(told)} (week ${gs.phase}).`);
                }
                this.noteRead(actor.id, botId);
                return finish();
            }
            case "askVote": {
                if (!nomsSet) botSays(line("voteNoNoms"));
                else if (noms.includes(botId)) botSays(line("voteNominee"));
                else if (botId === hohId) botSays(line("voteHoh"));
                else if (s.step !== Step.SocialCampaign) botSays(line("voteNotYet"));
                else {
                    const vote = this.askVote(botId);
                    if (vote === null || vote === undefined) botSays(line("dodge"));
                    else botSays(this.say(botId, "voteAnswer", "ask", this.player(vote).name));
                }
                return finish();
            }
            case "askFeeling":
                botSays(line(feelingReply(this.feelingOf(actor.id, botId))));
                this.noteRead(actor.id, botId);
                return finish();
            case "askOpinion": {
                const about = this.player(intent.aboutId);
                const v = apparentRelationship(bot.relationships[about.id] ?? 0, p, `${s.seed}:${gs.phase}:${botId}:${about.id}:talk`, false);
                botSays(line(opinionReply(v), about.name));
                return finish();
            }
            case "askAllies": {
                const shared = this.alliancesOf(actor.id).filter((a) => a.memberIds.includes(botId));
                if (shared.length > 0) botSays(line("alliesYours", shared[0].name));
                else {
                    const closest = [...others].sort((a, b) => (bot.relationships[b.id] ?? 0) - (bot.relationships[a.id] ?? 0))[0];
                    if (closest && real > 0.45 && rand() < 0.6) {
                        botSays(line("alliesClose", closest.name));
                        this.noteIntel(actor.id, botId, `🗣️ Said they're close with ${closest.name} (week ${gs.phase}).`);
                    } else botSays(line("alliesSecret"));
                }
                this.noteRead(actor.id, botId);
                return finish();
            }
            case "final2":
                if (hasFinal2(this.ledger, actor.id, botId)) {
                    botSays(line("alreadyF2"));
                    return finish();
                }
                if (others.length < 2) {
                    botSays(line("notNow"));
                    return finish();
                }
                return act({ kind: "final2", botId }, "accept", "decline");
            case "alliance": {
                const together = this.alliancesOf(actor.id).find((a) => a.memberIds.includes(botId));
                if (together && !intent.name) {
                    botSays(line("alreadyAllied", together.name));
                    return finish();
                }
                if (!this.allianceTimeOpen()) {
                    botSays(line("notNow"));
                    return finish();
                }
                return act({ kind: "alliance", botId, name: intent.name }, "accept", "decline");
            }
            case "pitch":
                return act({ kind: "pitch", botId, targetId: intent.targetId, reason: intent.reason }, "pitchYes", "pitchNo", name(intent.targetId));
            case "tellVote":
                if (!nomsSet || iAmHoh || noms.includes(actor.id) || !noms.includes(intent.targetId)) {
                    botSays(line(nomsSet ? "listen" : "voteNoNoms"));
                    return finish();
                }
                return act({ kind: "tellVote", botId, targetId: intent.targetId }, "heard", "listen");
            case "tellTarget":
                return act({ kind: "tellTarget", botId, targetId: intent.targetId }, "heard", "listen");
            case "keepMe":
                if (s.step !== Step.SocialCampaign || !noms.includes(actor.id) || !botVotes) {
                    botSays(line(noms.includes(actor.id) ? "voteNotYet" : "listen"));
                    return finish();
                }
                return act({ kind: intent.pity ? "pity" : "voteDeal", botId }, "accept", "decline");
            case "flirt":
                return act({ kind: "flirt", botId }, "flirtYes", "flirtNo");
            case "insult":
                this.mutate((m) => shiftRelationship(m, actor.id, botId, -0.04 * (p === "villain" ? 1.5 : 1)));
                botSays(line("insult"));
                this.noteRead(actor.id, botId);
                return finish();
            case "compliment":
                return friendly("compliment", p === "villain" ? 0.005 : p === "floater" ? 0.025 : 0.015);
            case "thanks":
                return friendly("thanks");
            case "apology":
                return friendly("apology", 0.02);
            case "bye":
                botSays(line("bye"));
                return finish();
            case "howAreYou":
                return friendly(botId === hohId ? "howHoh" : noms.includes(botId) ? "howNominee" : this.isHaveNot(botId) ? "howHaveNot" : "howFine");
            case "greet":
                return friendly("greet");
            case "small": {
                const topic: Reply =
                    intent.topic === "comps"
                        ? "smallComps"
                        : intent.topic === "home"
                        ? "smallHome"
                        : intent.topic === "food"
                        ? this.isHaveNot(botId)
                            ? "howHaveNot"
                            : "smallFood"
                        : intent.topic === "game"
                        ? "smallGame"
                        : "small";
                return friendly(topic);
            }
            default:
                botSays(line(intent.question ? "dodge" : "listen"));
                return finish();
        }
    }

    // Read by the screens, so it changes nothing (see approachesFor).
    public overheardBy(playerId: number): number[] {
        return (this.state.overheard || {})[playerId] || [];
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
            s.juryLog = [...(s.juryLog || []), ...lines.map((text) => ({ week: gs.phase, text }))];
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
        const list = (s.week.goodbyes || []).filter((g) => !this.player(g.playerId).isEvicted && this.isHuman({ id: g.playerId }));
        if (list.length === 0) return this.goTo(this.battleBackDue() ? Step.BattleBack : Step.WeekStart);
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
        // casual bots keep their word more; cutthroat bots break it when it suits them
        h += { easy: 0.1, normal: 0, hard: 0, cutthroat: -0.15 }[this.difficulty] ?? 0;
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
        const next = list.find((h) => !this.player(h.voterId).isEvicted && !this.player(h.targetId).isEvicted && this.isHuman({ id: h.voterId }));
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
        if (!a || a.met || this.allianceStandsDown(a)) return [];
        a.suggestions[actor.id] = targetId;
        a.backupSuggestions = { ...(a.backupSuggestions || {}), [actor.id]: this.planBWeek && backupId !== targetId ? backupId : null };
        a.memberIds.forEach((m) => this.noteRead(actor.id, m)); // alliance time: you get a read on your allies
        const later = this.turnOrder.slice(s.socialTurn + 1).filter((p) => a.memberIds.includes(p.id));
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
        s.actionsLeft = this.rules.actions;
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
                .filter((a) => !a.met && aliveMembers(gs, a).length >= 2 && this.allianceTimeOpen() && !this.allianceStandsDown(a))
                .forEach((a) => {
                    const result = holdMeeting(gs, a, s.humanIds, this.targetBlock(), this.targetExclude(), this.planBWeek);
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
                this.personalities[id] === "villain"
                    ? 2.5
                    : this.personalities[id] === "wildcard" || this.personalities[id] === "paranoid"
                    ? 1.5
                    : this.personalities[id] === "sweetheart"
                    ? 0.3
                    : 1
            );
            if (fight) {
                const a = getById(gs, fight.aId).name;
                const sides = sidesText(gs, fight.aId, fight.bId, fight.sides);
                if (this.isHuman({ id: fight.bId })) this.tell([fight.bId], `💥 ${a} blew up at you in front of everyone. ${sides}`);
                this.askOthersToPickSides(fight.aId, fight.bId, `💥 ${a} and ${getById(gs, fight.bId).name} blew up at each other. ${sides}`);
            }
            botSocialTime(gs, s.humanIds, (id) => {
                const traits = this.traitsOf(id) || { chats: 1, scheming: 1 };
                // Have-Nots don't get around the house much
                return this.isHaveNot(id) ? { ...traits, chats: traits.chats * 0.4 } : traits;
            });
            this.wildcardSwings(gs);
            botShowmances(gs, this.showmances, s.humanIds, (id) => (this.personalities[id] === "charmer" ? 2 : 1)).forEach((sm) => {
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
        s.actionsLeft = this.rules.actions;
        this.goTo(AFTER_SOCIAL[s.step]);
    }

    private hohComp() {
        const s = this.state;
        const competitors = exclude(nonEvictedHouseguests(s.gameState), s.gameState.previousHOH || []);
        const title = "Head of House Competition";
        const onWinner = (winnerId: number, worstFirst: number[]) => {
            const [gs, scene, hohs] = generateHohCompScene(s.gameState, { forcedWinners: [getById(s.gameState, winnerId)] });
            s.gameState = gs;
            s.week.hohId = hohs[0].id;
            this.pickHaveNots(worstFirst);
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
        const choice = this.pickComp(competitors, true);
        if (choice === KNOCKOUT_ID) return this.runKnockout(title, competitors, onWinner);
        if (choice === TAINTED_WINE_ID) return this.runTaintedWine(title, competitors, onWinner);
        if (choice === MEMORY_DUEL_ID) return this.runMemoryDuel(title, competitors, onWinner);
        this.runComp(title, compById(choice), competitors, onWinner, "hoh");
    }

    // ---------- Have-Nots ----------

    // The worst scorers in the HoH comp are this week's Have-Nots: slop, cold showers, and too tired to do much.
    // Until the eviction, they get one social action per block.
    private pickHaveNots(worstFirst: number[]) {
        const s = this.state;
        const ids = worstFirst.slice(0, haveNotCount(nonEvictedHouseguests(s.gameState).length));
        s.week.haveNots = ids;
        if (ids.length === 0) return;
        const names = listNames(ids.map((id) => this.player(id).name));
        this.feedPush(`🥫 ${names} ${ids.length === 1 ? "is" : "are"} this week's Have-Not${ids.length === 1 ? "" : "s"}.`);
        this.tell(ids, "🥫 You scored among the worst in the HoH comp, so you're a Have-Not this week: one social action per block until the eviction.");
        this.announce("🥫 The Have-Nots", [
            `The worst scores in the ${HOH} competition: ${names}.`,
            `Until the eviction, ${ids.length === 1 ? "they eat" : "they all eat"} slop, take cold showers, and only have the energy for one social action at a time.`,
        ]);
    }

    public isHaveNot(id: number): boolean {
        return (this.state.week.haveNots || []).includes(id);
    }

    // ---------- the Battle Back ----------

    get battleBackSlot(): PowerSlot | undefined {
        return this.powers.slots.find((sl) => sl.id === "battleBack");
    }

    // Once a season, when the twist is on: right before the jury starts, the evicted houseguests compete to come back.
    private battleBackDue(): boolean {
        const slot = this.battleBackSlot;
        return !!slot && !slot.used && battleBackDue(this.gameState, this.candidatesForBattleBack().length);
    }

    private candidatesForBattleBack(): Houseguest[] {
        return battleBackCandidates(this.gameState).filter((hg) => !this.isRuleBreaker(hg.id));
    }

    private battleBack() {
        const s = this.state;
        const slot = this.battleBackSlot;
        const candidates = this.candidatesForBattleBack();
        if (!slot || slot.used || candidates.length < 2) return this.goTo(Step.WeekStart);
        if (!this.locked("battleBackIntro")) {
            this.lock("battleBackIntro", true);
            this.announce("🔙 Battle Back", [
                "Before the next week begins, a twist: the evicted houseguests are coming back to the house…",
                `…for one competition. ${listNames(candidates.map((hg) => hg.name))} will battle it out, and the winner returns to the game.`,
            ]);
            return this.run();
        }
        const comp = compById(this.compChoice(() => pickQuickComp(s.gameState, s.history, s.usedComps, this.rules.kinds).id));
        this.runComp("🔙 Battle Back Competition", comp, candidates, (winnerId) => {
            const back = this.player(winnerId);
            const wasJuror = back.isJury;
            this.mutate((gs) => {
                const hg = getById(gs, winnerId);
                hg.isEvicted = false;
                hg.isJury = false;
                gs.nonEvictedHouseguests.add(winnerId);
                gs.remainingPlayers++;
            });
            slot.used = true;
            slot.holderId = winnerId;
            slot.week = s.gameState.phase + 1;
            this.feedPush(`🔙 ${back.name} won the Battle Back and is back in the house!`);
            this.logMove("move", winnerId, undefined, `${back.name} won the Battle Back and came back from eviction`, 3);
            this.addDiary(s.gameState.phase, winnerId, ["I got a second chance. I'm not wasting it."]);
            this.tell(
                this.state.humanIds.filter((id) => id !== winnerId),
                `🔙 ${back.name} won the Battle Back. They're back in the house, and they remember everything.`
            );
            this.tell([winnerId], "🔙 You won the Battle Back! You're back in the game. Everyone knows who sent you out.");
            this.showScene(
                this.textScene("🔙 Battle Back", [
                    `${back.name} has won the Battle Back!`,
                    `${back.name} walks back through the front door and rejoins the game${wasJuror ? ", giving up their seat on the jury" : ""}.`,
                    candidates.length > 2
                        ? `${listNames(candidates.filter((c) => c.id !== winnerId).map((c) => c.name))} stay evicted.`
                        : `${candidates.find((c) => c.id !== winnerId)!.name} stays evicted.`,
                ]),
                Step.WeekStart
            );
        });
    }

    // ---------- the diary room ----------

    private addDiary(week: number, id: number, lines: string[]) {
        const s = this.state;
        s.diary = [...(s.diary || []), { week, id, lines }];
    }

    // What houseguests said in the diary room about the week that just ended.
    private writeDiary(week: number, votes: { [voterId: number]: number }, evictedIds: number[]) {
        const s = this.state;
        const record = s.history.find((w) => w.week === week);
        const entries = diaryEntries({
            seed: s.seed,
            week,
            gameState: s.gameState,
            record,
            votes,
            evictedIds,
            playerIds: s.humanIds.filter((id) => !this.isRuleBreaker(id)),
            initialNoms: s.week.initialNoms || [],
            secretHoh: !!s.week.secretHoh,
            haveNots: s.week.haveNots || [],
            pledges: this.ledger.pledges,
            moves: (s.moves || []).filter((m) => m.week === week),
            hohRoomSafe: s.week.room ? s.week.room.promised || [] : [],
        });
        s.diary = [...(s.diary || []), ...entries];
    }

    public diaryOf(week?: number): DiaryEntry[] {
        return (this.state.diary || []).filter((e) => week === undefined || e.week === week);
    }

    // The whole season as text, to copy and share.
    public seasonRecapText(): string {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        return recapText({
            gameState: gs,
            history: s.history,
            diary: s.diary || [],
            winnerId: log ? log.winner : undefined,
            battleBack: this.battleBackSlot && this.battleBackSlot.used ? { id: this.battleBackSlot.holderId!, week: this.battleBackSlot.week } : undefined,
        });
    }

    // ---------- the jury house ----------

    public juryHouseLog(): { week: number; text: string }[] {
        return this.state.juryLog || [];
    }

    // ---------- alliances convene before nominations ----------

    // Who can't be the alliance's target right now: the new HoH can't be nominated (unless it's a secret).
    // Who an alliance can't target: this week's Head of House, who's safe until the eviction (unless it's a
    // secret who the Head of House is).
    public targetExclude(): number[] {
        const s = this.state;
        if (s.week.secretHoh || s.week.hohId === undefined || this.player(s.week.hohId).isEvicted) return [];
        return [s.week.hohId];
    }

    // The new HoH is known: each player gets to meet with their alliances before nominations, then the bots'
    // alliances meet too. Whatever they settle on is what their HoH (or their pitch to the HoH) goes with.
    private allianceHoh(): void {
        const s = this.state;
        const alive = this.turnOrder;
        if (this.allianceTimeOpen()) {
            while (s.socialTurn < alive.length && (this.alliancesOf(alive[s.socialTurn].id).length === 0 || !this.isHuman(alive[s.socialTurn])))
                s.socialTurn++;
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
        s.actionsLeft = this.rules.actions;
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
        const waiting = this.alivePlayers.find((p) => p.id !== hohId && !room.asked.includes(p.id) && this.isHuman(p));
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
                this.explainNoms(hoh.id, kept.filter((id, i) => !(audience && i === final.length - 1)));
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
        this.openly(hoh.id, `${hoh.name}'s nomination speech`, () =>
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
        const speaker = this.alivePlayers.find((p) => nomIds.includes(p.id) && !spoke.includes(p.id) && this.isHuman(p));
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
        this.openly(speaker.id, `${speaker.name}'s eviction speech`, () =>
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
        // the draw for veto players is saved too, so a reload can't redraw it
        const drawKey = `vetoPlayers:${s.gameState.phase}`;
        let drawn = this.locked<number[]>(drawKey);
        if (!drawn) {
            drawn = pickVetoPlayers(s.gameState, [hoh], noms).povPlayers.map((p) => p.id);
            this.lock(drawKey, drawn);
        }
        const players = drawn.map((id) => getById(s.gameState, id));
        const choice = this.pickComp(players, false);
        const onWinner = (winnerId: number) => {
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
        };
        if (choice === TAINTED_WINE_ID) return this.runTaintedWine("Veto Competition", players, onWinner);
        if (choice === MEMORY_DUEL_ID) return this.runMemoryDuel("Veto Competition", players, onWinner);
        this.runComp("Veto Competition", compById(choice), players, onWinner, "veto");
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

        // the veto holder's decision, saved once made, so the scenes in between don't ask for it again
        const phase = gsAtStart.phase;
        const choiceKey = `vetoChoice:${phase}`;
        const decided = (choice: { decision: Houseguest | null; reason: string }) => {
            this.lock(choiceKey, { id: choice.decision ? choice.decision.id : -1, reason: choice.reason });
            afterChoice(choice);
        };

        const afterChoice = (choice: { decision: Houseguest | null; reason: string }) => {
            if (!choice.decision) return generate(choice);
            // the replacement: never the veto holder (vetoUsable makes sure there's someone)
            const options = exclude(nonEvictedHouseguests(gsAtStart), [...noms, pov, hoh]);
            if (options.length === 0) return generate({ decision: null, reason: "" });
            // everyone sees the veto used first; only then does the HoH name a replacement
            const usedKey = `vetoUsedShown:${phase}`;
            if (this.locked(usedKey) === undefined) {
                this.lock(usedKey, true);
                const scene = this.vetoUsedScene(pov, choice.decision, hoh, options);
                this.weekScenes.push(scene);
                return this.show({ kind: "scene", scene });
            }
            // the only one who can go up: naming them breaks no promise, and betrays nobody
            const forced = options.length === 1;
            const settle = (id: number) => {
                if (forced) return this.forcedNomination(hoh.id, id);
                if (!s.week.secretHoh) this.settleRoom(hoh.id, [id], false);
            };
            if (!this.isHuman(hoh)) {
                const { picks, betrayed } = botNominate(gsAtStart, s.book, hoh, options, 1, this.roomSway());
                return renominate(choice, picks[0].id, options, (id) => {
                    this.explainNoms(hoh.id, [id]);
                    if (id === picks[0].id && !forced) betrayed.forEach((victim) => this.backstab(hoh.id, victim, s.week.secretHoh ? 0.3 : 1));
                    settle(id);
                });
            }
            const saved = choice.decision;
            this.privately(hoh.id, `${hoh.name}, Head of House`, () =>
                this.show({
                    kind: "choose",
                    actorId: hoh.id,
                    title: "Replacement Nominee",
                    text:
                        `${pov.name} used the ${VETO} on ${saved.id === pov.id ? "themselves" : saved.name}: “Since I have just vetoed one of your nominations, you must name a replacement nominee.”` +
                        (forced ? ` ${options[0].name} is the only one who can go up, so it breaks no promise.` : ""),
                    options,
                    count: 1,
                    confirmLabel: "Nominate",
                    promisedIds: s.week.room && !forced ? s.week.room.promised : undefined,
                    resolve: (ids) =>
                        renominate(choice, ids[0], options, (id) => {
                            if (!forced && this.allyIds(hoh.id).includes(id)) this.backstab(hoh.id, id, s.week.secretHoh ? 0.3 : 1);
                            settle(id);
                        }),
                })
            );
        };

        // At the final four, with the veto holder off the block, there's nobody left to name as a replacement: the
        // veto can't be used, so there's nothing to decide.
        const vetoUsable = exclude(nonEvictedHouseguests(gsAtStart), [...noms, pov, hoh]).length > 0;
        if (!vetoUsable) {
            this.feedPush(`🛡️ ${pov.name} can't use the ${VETO}: there's nobody left to name as a replacement.`);
            return generate({ decision: null, reason: "" });
        }
        const savedChoice = this.locked<{ id: number; reason: string }>(choiceKey);
        if (savedChoice) return afterChoice({ decision: savedChoice.id >= 0 ? getById(gsAtStart, savedChoice.id) : null, reason: savedChoice.reason });
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
                            decided(
                                ids.length === 0
                                    ? { decision: null, reason: "" }
                                    : { decision: getById(gsAtStart, ids[0]), reason: "" }
                            );
                        }),
                })
            );
        } else {
            const immunePlayers = hoh.id !== pov.id ? [hoh] : [];
            decided(botVeto(gsAtStart, s.book, pov, noms, hoh.id, immunePlayers));
        }
    }

    // The veto ceremony, before the replacement: the holder uses the veto, and tells the HoH to name someone.
    private vetoUsedScene(pov: Houseguest, saved: Houseguest, hoh: Houseguest, options: Houseguest[]): Scene {
        const secret = !!this.state.week.secretHoh;
        return this.textScene("Veto Ceremony", [
            `🏅 ${pov.name} has decided to use the Power of ${VETO} on ${saved.id === pov.id ? "themselves" : saved.name}.`,
            secret
                ? "“Since I have just vetoed one of the nominations, the Head of House must name a replacement nominee.”"
                : `“${hoh.name}, since I have just vetoed one of your nominations, you must name a replacement nominee.”`,
            ...(options.length === 1 ? [`Only ${options[0].name} is left who can take their place.`] : []),
        ]);
    }

    // A replacement nominee who was the only one who could go up: a promise of safety couldn't have been kept, so
    // it isn't broken. It's just over.
    private forcedNomination(hohId: number, id: number) {
        const s = this.state;
        const hoh = this.player(hohId);
        const room = s.week.room;
        if (room && room.promised.includes(id)) {
            room.promised = room.promised.filter((p) => p !== id);
            room.safe = room.safe.filter((p) => p !== id);
            this.tell([id], `🤷 ${hoh.name} promised you safety, but you were the only one left who could go up. Nothing they could do.`);
        }
        openPledges(this.ledger)
            .filter((p) => p.fromId === hohId && p.toId === id && p.kind === "safety" && p.week === s.gameState.phase)
            .forEach((p) => (p.status = "void"));
        this.save();
    }

    private blockbuster() {
        const s = this.state;
        const noms = s.week.nomineeIds!.map((id) => getById(s.gameState, id));
        const comp = compById(this.compChoice(() => pickQuickComp(s.gameState, s.history, s.usedComps, this.rules.kinds).id));
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
            const ctx = { ...this.reasonContext, gs: gsAtStart };
            const voteWhy: { [voterId: number]: { t: number; why: string } } = {};
            Object.keys(votes)
                .map(Number)
                .filter((v) => !this.isHuman({ id: v }))
                .forEach((v) => (voteWhy[v] = { t: votes[v], why: explainVote(ctx, v, votes[v], noms.map((n) => n.id)) }));
            const tally: { [nomineeId: number]: number } = {};
            noms.forEach((n) => (tally[n.id] = Math.max(0, counted(n.id))));
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
                    votes: tally,
                    why: { noms: s.week.nomWhy, votes: voteWhy },
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
            this.writeDiary(gsAtStart.phase, votes, evictedIds);
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
            `evict:${s.step}:${noms.map((n) => n.id).join(",")}`,
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
            },
            (voter) => this.intendedVote(gsAtStart, voter, noms).id
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
                const kept = others.find((o) => o.id !== evicted.id);
                this.addDiary(gs.phase, hoh.id, [
                    `I won the final Head of House, and I had to cut ${evicted.name}.${kept ? ` I'm sitting next to ${kept.name}. I think I can beat them.` : ""}`,
                ]);
                this.addDiary(gs.phase, evicted.id, [`So close. Final three, and ${hoh.name} cut me. I'll have my say on the jury.`]);
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
        const playerJurors = this.players.filter((p) => p.isJury && p.isEvicted && this.isHuman(p));
        const botJurors = jurorIds.filter((id) => !this.isHuman({ id }));
        const types: { [id: number]: JurorType } = {};
        jurorIds.forEach((id) => (types[id] = this.jurorTypeOf(id)));
        if (!s.week.finaleIntro) {
            s.week.finaleIntro = true;
            this.announce("Finale Night", finaleIntro(finalists, jurorIds.length));
            // the montage: each finalist's best moments, before the jury has its say
            finalists.forEach((f) => this.announce(`🎞️ ${f.name}'s journey`, montageLines(gs, s.history, s.moves || [], f.id)));
            this.save();
            return this.run();
        }
        if (!s.week.roundtable) {
            this.collectVotes(
                "roundtable",
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
                },
                () => -1 // a juror a bot took over from stays quiet
            );
            return;
        }
        this.collectVotes(
            "juryVote",
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
                // a finalist who broke the rules is disqualified: every vote goes to the other one
                const clean = finalistIds.filter((f) => !this.isRuleBreaker(f));
                if (clean.length === 1)
                    jurorIds.forEach((j) => {
                        all[j] = clean[0];
                        reasons[j] = "The other finalist broke the rules.";
                    });
                this.juryBook.reasons = reasons;
                this.juryBook.finalVotes = all;
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
            },
            (juror) => botJuryVote(gs, s.history, this.juryBook, juror.id, finalistIds, types[juror.id], jurorIds).vote
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
            return this.openly(speaker.id, `${speaker.name}'s final two speech`, () =>
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
            return this.openly(finalist.id, `${finalist.name}, a question from the jury`, () =>
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
            if (sl.id === "battleBack")
                return sl.used && sl.holderId !== undefined
                    ? `${info.emoji} ${info.name}: ${name(sl.holderId)} won it and came back into the house in week ${sl.week}.`
                    : `${info.emoji} ${info.name}: it never happened.`;
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

    // The season's first houseguest out and its winner go in the halls, exactly as they were.
    private recordHalls() {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const firstOut = s.history.find((w) => w.evictedIds.length > 0);
        const keep = (hall: Hall, id: number | undefined) => {
            if (id === undefined || !gs.houseguests[id]) return;
            const hg = gs.houseguests[id];
            const profile: PlayerProfile = { name: hg.name, imageURL: hg.imageURL, social: hg.social, comp: hg.comp };
            if (!this.isHuman(hg)) {
                profile.personality = this.personalities[id];
                profile.throws = this.throwScore(id);
            }
            recordHall(hall, { key: `${s.seed}:${id}`, when: Date.now(), castSize: gs.houseguests.length, profile });
        };
        keep("losers", firstOut ? firstOut.evictedIds[0] : undefined);
        keep("winners", log ? log.winner : undefined);
    }

    // The players on this device.
    public devicePlayers(): number[] {
        if (this.net) return this.net.localIds ? this.net.localIds() : [];
        return this.state.humanIds;
    }

    // A player's season, for their career stats and achievements.
    public summaryFor(id: number): SeasonSummary {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const winnerId = log ? log.winner : undefined;
        const row = seasonStats(gs, s.history, winnerId).find((r) => r.id === id)!;
        const finalVotes = (this.juryBook && this.juryBook.finalVotes) || {};
        const juryTotal = Object.keys(finalVotes).length;
        const finalist = !this.player(id).isEvicted;
        const pledges = this.ledger.pledges.filter((p) => p.fromId === id);
        const moves = (s.moves || []).filter((m) => m.actorId === id);
        const best = [...moves].filter((m) => m.kind === "move").sort((a, b) => b.weight - a.weight)[0];
        const hg = this.player(id);
        return {
            key: `${s.seed}:${id}`,
            when: Date.now(),
            name: hg.name,
            imageURL: hg.imageURL,
            placement: row.placement,
            castSize: gs.houseguests.length,
            won: winnerId === id,
            hohWins: row.hohWins,
            vetoWins: row.vetoWins,
            lastChanceWins: row.lastChanceWins,
            nominated: row.nominated,
            survivedBlock: row.survived,
            juryVotesFor: finalist ? Object.values(finalVotes).filter((v) => v === id).length : 0,
            juryVotesTotal: finalist ? juryTotal : 0,
            backstabs: moves.filter((m) => m.kind === "backstab").length,
            bigMoves: moves.filter((m) => m.kind === "move").length,
            brokePromises: pledges.filter((p) => p.status === "broken").length,
            keptPromises: pledges.filter((p) => p.status === "kept").length,
            alliances: s.book.alliances.filter((a) => a.memberIds.includes(id)).length,
            showmance: (s.showmances || []).some((m) => m.a === id || m.b === id) || (s.feed || []).some((f) => /showmance/i.test(f.text) && f.text.includes(hg.name)),
            cameBack: this.powers.slots.some((sl) => sl.id === "battleBack" && sl.used && sl.holderId === id),
            difficulty: this.difficulty,
            online: !!this.net,
            players: s.humanIds.length,
            highlight: best ? best.text : undefined,
        };
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
                                    {!this.state.humanIds.includes(hg.id) && ` · 🏳️ ${this.throwScore(hg.id)}`}
                                </span>
                            </div>
                        ))}
                </div>
            </div>
        ) : (
            table
        );
        this.recordHalls();
        // the players on this device: their season goes in their career, and may unlock achievements
        const cards = this.devicePlayers()
            .filter((id) => !this.isRuleBreaker(id))
            .map((id) => {
                const summary = this.summaryFor(id);
                return { summary, unlocked: recordSeason(summary) };
            });
        if (cards.some((c) => c.unlocked.length > 0)) setTimeout(() => playCue("achievement"), 2200);
        newEpisode(generateGameOver(new GameState(new MutableGameState(gs)), weekLabel));
        if (this.net) this.net.ended();
        else clearSave();
        playerModeScreen$.next(null);
        this.show({
            kind: "gameOver",
            content: (
                <div>
                    {cards.length > 0 && (
                        <div className="bbb-season-cards">
                            {cards.map((c) => (
                                <SeasonCard key={c.summary.key} summary={c.summary} unlocked={c.unlocked} />
                            ))}
                        </div>
                    )}
                    {content}
                    {this.seasonRecap()}
                    {this.whoTheyWere()}
                    {this.whyTheJuryVoted()}
                    <WhyTheyDidIt gs={this.state.gameState} history={this.state.history} />
                    <DiaryRoom entries={this.diaryOf()} houseguest={(id) => this.player(id)} recap={this.seasonRecapText()} />
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
    extras: { difficulty?: Difficulty; powers?: PowerId[] | "surprise"; battleBack?: boolean; rules?: SeasonRules; guided?: boolean } = {}
): PlayerSave {
    const seed = Date.now() % 1000000007;
    const rand = seededRand(hashcode(`${seed}:powers`));
    const chosen = extras.powers === "surprise" ? surprisePowers(rand) : (extras.powers || []).filter((p) => ALL_POWERS.includes(p));
    if (extras.battleBack && !chosen.includes("battleBack")) chosen.push("battleBack");
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
        actionsLeft: withDefaults(extras.rules).actions,
        socialLog: [],
        book: emptyBook(),
        approaches: {},
        approachKey: {},
        news: {},
        castOptions,
        statsHidden,
        difficulty: extras.difficulty || "normal",
        rules: extras.rules ? withDefaults(extras.rules) : undefined,
        powers,
        guided: extras.guided || undefined,
    };
}
