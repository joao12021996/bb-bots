import { getComp } from "../../model";
import { rng } from "../../utils";

// Shifts every bot's performance. Positive = harder bots, negative = easier bots.
export const DIFFICULTY = 0;

function uniform(): number {
    // (0, 1]
    return Math.max(1e-9, Math.abs(rng().randomFloat()));
}

function gaussian(): number {
    return Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

// A bot's performance percentile in a competition, from its comp score (1-10).
// A comp 5 bot performs around the 50th percentile, which should roughly match an average human.
export function botPercentile(bot: { comp?: number }): number {
    const mean = 0.2 + 0.06 * getComp(bot) + DIFFICULTY;
    return Math.min(1, Math.max(0, mean + 0.15 * gaussian()));
}
