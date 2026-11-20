import { GameState, getById, Houseguest } from "../model";
import { CastOptionsOverride } from "../components/episode/episodeFactory";
import { Scene } from "../components/episode/scenes/scene";
import { JoinedAt, WeekRecord } from "./history";
import { Difficulty, SeasonRules } from "./rules";
import { CompDefinition, Opponent } from "./comps/compTypes";
import { Claim, Pour } from "./comps/taintedWine";
import { CompResult } from "./comps/compRunner";
import { Approach, SocialMemory } from "./social/socialActions";
import { AllianceBook, emptyBook } from "./social/alliances";
import { Deal, HohRoom } from "./social/hohRoom";
import { PawnTalk } from "./social/pawnTalk";
import { SpeechTone } from "./ui/speechPrompt";
import { TiebreakGuess, TiebreakQuestion } from "./comps/tiebreaker";
import { VetoHide } from "./comps/hideTiebreak";
import { DuelTurn, Matched } from "./comps/memoryDuel";
import { HidingSpot } from "./comps/iconicComps";
import { PowersState } from "./social/powers";
import { FeedLine, Rivalry } from "./social/feed";
import { Pact } from "./social/endgame";
import { MoveRecord } from "./social/awards";
import { Ledger } from "./social/promises";
import { TalkLine } from "./social/botTalk";
import { PersonalityId } from "./social/personality";
import { Showmance } from "./social/showmance";
import { JuryBook } from "./social/jury";
import { Answer, JuryQuestion, Move } from "./social/finale";
import { DiaryEntry } from "./social/diary";
import { Step } from "./week";


// What a saved season and a screen are, and the helpers that go with them. Everything the parts of the controller
// (controllerCore.tsx and the files after it) share.

// Flirts with someone within this many weeks add up (see flirt: past FLIRTS_OK, some people are creeped out),
// and someone a player creeped out twice holds their relationship at this, for good.
export const CREEP_WEEKS = 2;
export const CREEP_LEVEL = -0.8;

// How a player's answer to an approach reads in the conversation: [yes, no].
export const APPROACH_ANSWERS: { [kind: string]: [string, string] } = {
    pitch: ["I'm in.", "I'm not so sure."],
    invite: ["I'm in!", "No thanks."],
    final2: ["Deal. You and me.", "Not yet."],
    votePlea: ["You have my vote.", "I can't promise that."],
    vetoPlea: ["I'll use it on you.", "I can't promise that."],
    vetoKeep: ["They'll stay the same.", "I'm keeping my options open."],
};

export interface WeekProgress {
    hohId?: number;
    nomineeIds?: number[];
    povId?: number;
    blockbuster?: boolean; // three nominees this week, and a Blockbuster after the veto
    fast?: boolean; // the Double Eviction: a whole week in one night, with no social time and no ceremonies' extras
    blockbusterId?: number;
    finaleComps?: string[];
    endurance?: number;
    skill?: number;
    finalHoh?: number;
    room?: HohRoom; // this week's HoH room one-on-ones
    pawns?: PawnTalk[]; // nominees who were told "you're not the target" this week
    pawnAsk?: { ids: number[]; next: Step }; // a player HoH gives a speech about these new nominees, then on to `next`
    vetoCases?: { [playerId: number]: boolean }; // players who made their case to a bot veto holder: did it work
    vetoAsks?: { [playerId: number]: number }; // players who asked a bot veto holder to save someone else, and won them over
    mergeTries?: string[]; // pairs of alliances ("id:id") a player has asked to merge this week
    backdoor?: number; // a player HoH's backdoor plan: nominate pawns, and put this houseguest up once the veto's used
    spoke?: number[]; // nominees who have given their eviction-night speech
    wallDeals?: { hohId: number; toId: number }[]; // endurance deals: if `hohId` wins HoH, they owe `toId` safety
    intel?: { [askerId: number]: { [voterId: number]: number } }; // vote counting: what each voter said they'd do
    hinky?: { voterId: number; targetId: number }[]; // players whose vote went against the house
    exitShown?: number[]; // evicted players who've been told why they went home
    goodbyes?: { playerId: number; evictedId: number }[]; // players who can send a message to someone they evicted
    juryHouse?: string[]; // what happened in the jury house this week
    roundtable?: string[]; // the finale jury roundtable, once it's happened
    // final-two speeches and jury questions, in progress
    finalTwo?: { spoke: number[]; questions: JuryQuestion[]; qIndex: number; transcript: string[] };
    meetingBy?: number[]; // players who called a house meeting this week
    secretHoh?: boolean; // nobody knows who the Head of Household is this week
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
    haveNots?: number[]; // the worst scorers in this week's HoH comp: one social action per block, and grey, until the next one
    nomWhy?: { [nomineeId: number]: string }; // why a bot HoH nominated who they did
}

// Everything needed to resume a season. Must stay JSON-serializable (see save/serialize.ts).
export interface PlayerSave {
    version: 3;
    humanIds: number[]; // one per player; 2+ means pass-and-play on one device
    watching?: boolean; // nobody playing: the viewer watches the bots, and sees everything they do
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
    // online: every player's social and alliance time runs at the same time, each on their own screen (see
    // together): where each player is in this block, and how many actions they have left
    socialBy?: { [playerId: number]: { stage: "social" | "alliance" | "done"; actions: number } };
    socialLog: string[];
    book: AllianceBook; // every alliance in the house, bots' and players'
    approaches: { [humanId: number]: Approach[] }; // houseguests who came to talk to each player
    approachKey: { [humanId: number]: string }; // which social block approaches were last generated for
    news: { [humanId: number]: string[] }; // things each player found out since their last social time
    deals?: Deal[]; // safety deals struck in the HoH room (they run into the following week)
    ledger?: Ledger; // every promise and claim, kept or broken, and everyone's reputation
    personalities?: { [id: number]: PersonalityId }; // every bot's (secret) personality
    showmances?: Showmance[];
    rivalries?: Rivalry[]; // houseguests who blew up at each other and haven't made up
    doubleDone?: boolean; // the season's Double Eviction has happened
    daily?: string; // the daily season: which day's ("2026-11-14")
    joinedAt?: JoinedAt; // the daily season: when the player took over from their stand-in (see seenHistory)
    reunited?: boolean; // All-Stars: returning houseguests have been reminded of their history with the players
    pacts?: Pact[]; // final-three pacts (see endgame.ts)
    juryCases?: { [playerId: number]: number[] }; // houseguests each player has already made their case to
    flirts?: { [pair: string]: number[] }; // the weeks a player flirted with a houseguest ("player:bot")
    creeped?: { [pair: string]: number }; // how many times a player creeped a houseguest out ("player:bot")
    creeps?: { playerId: number; botId: number }[]; // ...twice: they can't stand the player, for good
    // houseguests a HoH asked to be a pawn, then nominated. `repaid`: the HoH who owed the pawn has since been
    // nominated by them, and took it well: the favour's used up
    pawnFavors?: { hohId: number; pawnId: number; week: number; agreed: boolean; repaid?: boolean }[];
    allianceFirst?: string; // the social block ("week:step") whose alliance time, before social time, is over
    allianceMet?: string; // what the house looked like the last time alliances met (see allianceSituation)
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
    paid?: boolean; // the player spent the action it takes to talk to them this block
    over?: boolean; // they ended the conversation: no more talking until the next block
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
          sealed?: boolean; // a secret Head of Household week: the winner stays a secret
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
          sealed?: boolean; // a secret Head of Household week: the winner stays a secret
          onDone: () => void;
      }
    | {
          kind: "tiebreakResults";
          title: string;
          question: TiebreakQuestion;
          tied: Houseguest[];
          guesses: TiebreakGuess[];
          winnerId?: number; // none: still tied, another question follows
          sealed?: boolean; // a secret Head of Household week: the winner stays a secret
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
    // online: a player who's done with their social time, while the others finish theirs (see together)
    | { kind: "socialDone"; actorId: number; blockName: string }
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
        case "socialDone":
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
