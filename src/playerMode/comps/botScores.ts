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

// Luck on the day, from 0 (a disaster) to 2 (the comp of their life); 1 is an ordinary day. A bell curve:
// 0.9 or 1.1 is everyday, 1.5 or 0.5 now and then, and 0 or 2 hardly ever (more than three standard deviations out).
export const LUCK_SPREAD = 0.3;
export function compLuck(rand?: () => number): number {
    return Math.min(2, Math.max(0, 1 + LUCK_SPREAD * gaussian(rand)));
}

// A bot's performance percentile in a competition, from its comp score (1-10) times its luck in this comp:
// comp 5 with luck 2 plays like a comp 10; comp 8 with luck 0 plays like a comp 0.
// A comp 5 bot on an ordinary day performs around the 50th percentile, which should roughly match an average human.
// `rand`: for a result that has to come out the same when it's replayed (comps shown stage by stage).
export function botPercentile(bot: { comp?: number }, rand?: () => number): number {
    const comp = getComp(bot) * compLuck(rand);
    return Math.min(1, Math.max(0, 0.2 + 0.06 * comp + DIFFICULTY));
}
