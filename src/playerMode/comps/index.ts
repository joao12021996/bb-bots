import { GameState } from "../../model";
import { rng } from "../../utils";
import { WeekRecord } from "../history";
import { CatchTheKeysComp, SteadyHandComp, TowerStackComp } from "./actionComps";
import { BeforeOrAfterComp } from "./beforeOrAfter";
import { CompDefinition } from "./compTypes";
import { FaceOffComp } from "./faceOff";
import { HoldTheWallComp } from "./holdTheWall";
import { FactOrFictionComp, ZoomInComp } from "./houseComps";
import { BankOrBustComp, HigherOrLowerComp } from "./luckComps";
import { ConcentrationComp, CountEmComp, DigitSpanComp, FindTheKeyComp, SimonSaysComp } from "./memoryComps";
import { MemoryWallComp } from "./memoryWall";
import { GuessTheNumberComp, MathRushComp, MazeRunnerComp, OddOneOutComp, ScrambleComp } from "./puzzleComps";
import { RankEmComp } from "./rankEm";
import { BullseyeComp, ColorClashComp, NumberGridComp, ReactionLightsComp, WhackComp } from "./reflexComps";
import { SlidePuzzleComp } from "./slidePuzzle";
import { StopTheClockComp } from "./stopTheClock";
import { TaintedWineComp } from "./taintedWine";
import { BBComicsComp, DaysQuizComp, FaceMorphComp, HideAndGoVetoComp, OtevComp, OverOrUnderComp } from "./iconicComps";

export const ALL_COMPS: CompDefinition[] = [
    // originals
    MemoryWallComp,
    StopTheClockComp,
    FaceOffComp,
    RankEmComp,
    SlidePuzzleComp,
    HoldTheWallComp,
    BeforeOrAfterComp,
    // reflex
    WhackComp,
    ReactionLightsComp,
    ColorClashComp,
    NumberGridComp,
    BullseyeComp,
    // memory
    SimonSaysComp,
    ConcentrationComp,
    DigitSpanComp,
    CountEmComp,
    FindTheKeyComp,
    // puzzles
    ScrambleComp,
    OddOneOutComp,
    MazeRunnerComp,
    MathRushComp,
    GuessTheNumberComp,
    TaintedWineComp,
    // action
    SteadyHandComp,
    CatchTheKeysComp,
    TowerStackComp,
    // luck
    HigherOrLowerComp,
    BankOrBustComp,
    // house knowledge
    ZoomInComp,
    FactOrFictionComp,
    // iconic formats
    OtevComp,
    HideAndGoVetoComp,
    BBComicsComp,
    OverOrUnderComp,
    DaysQuizComp,
    FaceMorphComp,
];

export function compById(id: string): CompDefinition {
    const comp = ALL_COMPS.find((c) => c.id === id);
    if (!comp) throw new Error(`Unknown competition ${id}`);
    return comp;
}

export const WEEKLY_COMPS = ALL_COMPS.filter((c) => !c.finaleOnly);

// Picks a comp for a weekly HoH or veto. Never repeats a comp within a season while unplayed ones remain;
// only a season longer than the comp library (more than ~13 weeks) falls back to the least recently played.
export function pickWeeklyComp(gameState: GameState, history: WeekRecord[], used: string[]): CompDefinition {
    const available = WEEKLY_COMPS.filter((c) => !c.available || c.available(gameState, history));
    const unused = available.filter((c) => !used.includes(c.id));
    if (unused.length > 0) return unused[rng().randomInt(0, unused.length - 1)];
    // everything has been played: take the one played longest ago
    return available.reduce((best, c) => (used.lastIndexOf(c.id) < used.lastIndexOf(best.id) ? c : best));
}

// The three-part final HoH: endurance (Hold the Wall), then an unplayed skill comp, then a quiz about the season.
export function finaleComps(gameState: GameState, history: WeekRecord[], used: string[]): [CompDefinition, CompDefinition, CompDefinition] {
    const skills = WEEKLY_COMPS.filter((c) => (c.kind === "skill" || c.kind === "memory") && !c.available);
    const unusedSkills = skills.filter((c) => !used.includes(c.id));
    const pool = unusedSkills.length > 0 ? unusedSkills : skills;
    const skill = pool[rng().randomInt(0, pool.length - 1)];
    const quiz = BeforeOrAfterComp.available!(gameState, history) ? BeforeOrAfterComp : MemoryWallComp;
    return [HoldTheWallComp, skill, quiz];
}

// The Last Chance comp is a quick one: under a minute or so of play, simple rules, no long puzzles or quizzes.
export const QUICK_COMPS: CompDefinition[] = [
    SteadyHandComp,
    CatchTheKeysComp,
    FaceOffComp,
    WhackComp,
    ReactionLightsComp,
    ColorClashComp,
    BullseyeComp,
    OddOneOutComp,
    MathRushComp,
    HigherOrLowerComp,
    StopTheClockComp,
    ZoomInComp,
];

// Picks the Last Chance comp: a quick one, not played yet this season if possible.
export function pickQuickComp(gameState: GameState, history: WeekRecord[], used: string[]): CompDefinition {
    const available = QUICK_COMPS.filter((c) => !c.available || c.available(gameState, history));
    const unused = available.filter((c) => !used.includes(c.id));
    if (unused.length > 0) return unused[rng().randomInt(0, unused.length - 1)];
    return available.reduce((best, c) => (used.lastIndexOf(c.id) < used.lastIndexOf(best.id) ? c : best));
}
