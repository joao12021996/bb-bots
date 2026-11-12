import { getComp } from "../../model";
import { rng } from "../../utils";

// Shifts every bot's performance. Positive = harder bots, negative = easier bots.
export const DIFFICULTY = 0;

// `rand`: a random source of its own (0 to 1), or the game's
function uniform(rand?: () => number): number {
    // (0, 1]
    return Math.max(1e-9, rand ? 1 - rand() : Math.abs(rng().randomFloat()));
}

function gaussian(rand?: () => number): number {
    return Math.sqrt(-2 * Math.log(uniform(rand))) * Math.cos(2 * Math.PI * uniform(rand));
}

// A bot's performance percentile in a competition, from its comp score (1-10).
// A comp 5 bot performs around the 50th percentile, which should roughly match an average human.
// `rand`: for a result that has to come out the same when it's replayed (comps shown stage by stage).
export function botPercentile(bot: { comp?: number }, rand?: () => number): number {
    const mean = 0.2 + 0.06 * getComp(bot) + DIFFICULTY;
    return Math.min(1, Math.max(0, mean + 0.15 * gaussian(rand)));
}
