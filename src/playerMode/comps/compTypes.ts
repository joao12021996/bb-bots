import React from "react";
import { GameState, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { Rand } from "./random";

// Another competitor's final score: bots' simulated results, plus players who already took their turn.
// Comps use these to show live standings (who's still on the wall, quiz scoreboards).
export interface Opponent {
    hg: Houseguest;
    score: number;
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
    // Converts a bot's performance percentile (0 = worst, 1 = best) into a score on this comp's scale.
    // Scores are always "higher is better". May use rng() (seeded) for luck-based comps.
    botScore: (percentile: number, ctx: { gameState: GameState; history: WeekRecord[] }) => number;
    format: (score: number) => string;
    available?: (gameState: GameState, history: WeekRecord[]) => boolean;
}
