import { GameState, MutableGameState, nonEvictedHouseguests } from "../../model/gameState";
import { Episode, Houseguest, getSocial, DEFAULT_STAT, MAX_STAT } from "../../model";
import { EpisodeType, Split } from "./episodes";
import { angleBetween, rng } from "../../utils";
import { EpisodeLog } from "../../model/logging/episodelog";
import { refreshHgStats } from "./utilities/evictHouseguest";
import { cast$ } from "../../subjects/subjects";
import { Tribe } from "../../model/tribe";

// How much social score shifts relationships. With both players at max social, a relationship
// is shifted up by 2 * SOCIAL_STRENGTH; with both at min social, it is shifted down by about the same.
const SOCIAL_STRENGTH = 0.3;

// Relationship bonus between two players based on their social scores (symmetric, so relationships stay mutual).
// A neutral player (DEFAULT_STAT) contributes nothing.
function socialBonus(a: { social?: number }, b: { social?: number }): number {
    const range = MAX_STAT - DEFAULT_STAT;
    return (SOCIAL_STRENGTH * (getSocial(a) - DEFAULT_STAT + (getSocial(b) - DEFAULT_STAT))) / range;
}

export function firstImpressionsMap(
    hgs: number,
    profiles: { social?: number }[] = []
): { [id: number]: { [id: number]: number } } {
    const sin = Math.sin;
    const cos = Math.cos;
    const compatibilityMap: { [id: number]: [number, number, number] } = {};
    const map: { [id: number]: { [id: number]: number } } = {};

    for (let i = 0; i < hgs; i++) {
        map[i] = {};
        // generate random spherical co-ordinates on the unit sphere
        const u = rng().randomFloat();
        const v = Math.abs(rng().randomFloat());
        const θ = 2 * Math.PI * u;
        const φ = Math.acos(2 * v - 1);
        // convert spherical co-ords to cartesian co-ords
        compatibilityMap[i] = [sin(φ) * cos(θ), sin(θ) * sin(φ), cos(φ)];
        // extremely rare 1 in a billion edge case that would crash the game
        if (compatibilityMap[i][0] === 0 && compatibilityMap[i][1] === 0 && compatibilityMap[i][2] === 0) {
            compatibilityMap[i] = [1, 0, 0];
        }
    }

    for (let i = 0; i < hgs; i++) {
        for (let j = i + 1; j < hgs; j++) {
            // creates a bunch of mutual relationships based on points on (or inside) a sphere
            let impression = 1 - (2 * angleBetween(compatibilityMap[i], compatibilityMap[j])) / Math.PI;
            if (profiles[i] && profiles[j]) {
                impression = Math.max(-1, Math.min(1, impression + socialBonus(profiles[i], profiles[j])));
            }
            map[i][j] = impression;
            map[j][i] = impression;
        }
    }
    return map;
}

// Optional overrides for the cast options (custom relationships, teams), keyed by houseguest id.
// Player mode uses this when it plays with a subset of the cast, since ids are renumbered.
export interface CastOptionsOverride {
    relationships?: { [id: number]: { [id: number]: number } };
    currentTribes?: { [id: number]: Tribe };
}

// `blankSlate`: nobody knows anybody yet, so every relationship starts at zero (player mode: they're all forged
// in the game). The impressions are still rolled, so the rest of the season's randomness stays the same.
function firstImpressions(houseguests: Houseguest[], override?: CastOptionsOverride, blankSlate: boolean = false) {
    const custom = override ? override.relationships : cast$.value.options?.relationships;
    const generated = firstImpressionsMap(houseguests.length, houseguests);
    for (let i = 0; i < houseguests.length; i++) {
        for (let j = i + 1; j < houseguests.length; j++) {
            // custom relationships win; any pair they don't cover (e.g. a player who joined under their own name)
            // gets a normal first impression
            const customValue = custom && custom[i] ? custom[i][j] : undefined;
            const value = blankSlate ? 0 : customValue !== undefined ? customValue : generated[i][j];
            houseguests[i].relationships[houseguests[j].id] = value;
            houseguests[j].relationships[houseguests[i].id] = value;
        }
    }
}

// Sets up the game state for the start of a new week (first impressions, phase, logs, stats).
export function prepareNextWeek(
    oldState: GameState,
    episodeType: EpisodeType,
    override?: CastOptionsOverride,
    blankSlate: boolean = false
): GameState {
    let newState = new MutableGameState(oldState);
    if (oldState.phase === 0) {
        firstImpressions(newState.houseguests, override, blankSlate);
        const currentTribes = override ? override.currentTribes : cast$.value.options?.currentTribes;
        if (currentTribes) {
            const tribes = currentTribes;
            newState.houseguests.forEach((hg) => {
                hg.tribe = tribes[hg.id];
            });
        }
    }
    !episodeType.pseudo && newState.phase++;
    !episodeType.pseudo && newState.resetLogIndex();
    if (oldState.remainingPlayers > 2 && !episodeType.pseudo) {
        newState.log[newState.phase] = [new EpisodeLog()];
    }
    !episodeType.pseudo && (newState.currentLog.weekEmoji = episodeType.emoji || "");
    const split: Split[] = episodeType.splitFunction ? episodeType.splitFunction(newState) : [];
    newState.split = split;
    refreshHgStats(newState, split, true);
    nonEvictedHouseguests(newState).forEach((hg) => {
        hg.previousPopularity = hg.popularity;
    });
    return new GameState(newState);
}

export function nextEpisode(oldState: GameState, episodeType: EpisodeType): Episode {
    const finalState = prepareNextWeek(oldState, episodeType);
    if (!episodeType.canPlayWith(finalState.remainingPlayers))
        throw new Error(
            `Episode type ${episodeType.name} not playable with ${finalState.remainingPlayers} players`
        );
    return episodeType.generate(finalState);
}
