import React from "react";
import { GameState, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { Rand } from "./random";

// Another competitor's final score: bots' simulated results, plus players who already took their turn.
// Comps use these to show live standings (who's still on the wall, quiz scoreboards).
export interface Opponent {
    hg: Houseguest;
    score: number;
    answers?: boolean[]; // question comps: right/wrong for each question, in order
    picks?: (number | string)[]; // question comps: what they answered (a number, or a label), when it matters
}

// Everything a bot needs to play the exact same comp instance the players get.
export interface SimContext {
    seed: number; // the comp's seed: seededRand(seed) recreates the players' exact layout/questions
    gameState: GameState;
    history: WeekRecord[];
    participants: Houseguest[];
}

export interface SimResult {
    score: number;
    answers?: boolean[];
    picks?: (number | string)[];
}

// Deals on the wall, in an endurance HoH comp: "drop and you're safe this week".
export interface EnduranceDeals {
    offerFrom: number[]; // bots who will offer the player safety for dropping, once it's down to the two of them
    // the player asks a bot still on the wall to drop for safety: true if the bot takes the deal (and drops)
    askBot: (botId: number, seconds: number) => boolean;
    // the player takes a bot's offer (and drops)
    accept: (botId: number) => void;
}

export interface CompProps {
    participants: Houseguest[]; // everyone competing, including the human(s)
    human: Houseguest; // the player currently playing
    gameState: GameState;
    history: WeekRecord[];
    // Seeded randomness: use this instead of Math.random so every player gets the same comp.
    rand: Rand;
    opponents: Opponent[];
    // Report the player's score so far. If time runs out, the last reported score is used.
    report: (score: number) => void;
    // Call when the player finishes early.
    finish: (score: number) => void;
    // Question comps: stop (true) or restart (false) the comp's time limit, for the pause after each answer.
    pauseClock?: (paused: boolean) => void;
    // Question comps: record the player's answer to question `index`, so players after them can see it.
    recordAnswer?: (index: number, correct: boolean, pick?: number | string) => void;
    deals?: EnduranceDeals; // endurance HoH comps only
}

export type CompKind = "endurance" | "skill" | "memory" | "quiz" | "luck" | "reflex";

export interface CompDefinition {
    id: string;
    name: string;
    emoji: string;
    kind: CompKind;
    rules: string;
    maxSeconds: number; // hard cap enforced by the CompRunner (always <= 600)
    hideTimer?: boolean; // for comps about judging time: don't show the countdown
    finaleOnly?: boolean; // reserved for the final HoH
    Component: React.ComponentType<CompProps>;
    // A bot plays the same instance the players got (same questions, dice, maze...). `skill` is the bot's
    // performance percentile from its Comp score (0 = worst, 1 = best); `noise` is the bot's own seeded randomness.
    // Scores are always "higher is better".
    simulate: (ctx: SimContext, skill: number, noise: Rand) => SimResult;
    // A rough score for a given percentile, without playing; used as a fallback (e.g. time ran out with no score).
    botScore: (percentile: number, ctx: { gameState: GameState; history: WeekRecord[] }) => number;
    format: (score: number) => string;
    available?: (gameState: GameState, history: WeekRecord[]) => boolean;
}
