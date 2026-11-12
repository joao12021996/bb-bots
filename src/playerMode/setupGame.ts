import { defaultJurySize, GameState, PlayerProfile, validateJurySize } from "../model";
import { Tribe } from "../model/tribe";
import { CastOptionsOverride } from "../components/episode/episodeFactory";

interface CastOptions {
    relationships?: { [id: number]: { [id: number]: number } };
    currentTribes?: { [id: number]: Tribe };
}

export interface SeasonSetup {
    gameState: GameState;
    humanIds: number[]; // ids in the new game state
    castOptions: CastOptionsOverride;
}

// Builds a season from part of the cast: the chosen players plus the chosen bots.
// Houseguests keep their cast order; ids are renumbered, so custom relationships and teams are remapped too.
export function buildSeason(
    cast: PlayerProfile[],
    playerIndexes: number[],
    botIndexes: number[],
    options: CastOptions = {},
    hohPlaysVeto: boolean = true,
    jury?: number
): SeasonSetup {
    const chosen = Array.from(new Set([...playerIndexes, ...botIndexes])).sort((a, b) => a - b);
    const players: PlayerProfile[] = chosen.map((i) => ({
        name: cast[i].name,
        imageURL: cast[i].imageURL,
        social: cast[i].social,
        comp: cast[i].comp,
        castingScreenId: cast[i].castingScreenId,
    }));
    const gameState = new GameState({ players, jury: jury !== undefined && validateJurySize(jury, players.length) ? jury : defaultJurySize(players.length), hohPlaysVeto });
    const newId = (castIndex: number) => chosen.indexOf(castIndex);

    const castOptions: CastOptionsOverride = {};
    if (options.relationships) {
        const map: { [id: number]: { [id: number]: number } } = {};
        chosen.forEach((a, i) => {
            map[i] = {};
            chosen.forEach((b, j) => {
                if (i !== j && options.relationships![a] && options.relationships![a][b] !== undefined) {
                    map[i][j] = options.relationships![a][b];
                }
            });
        });
        castOptions.relationships = map;
    }
    if (options.currentTribes) {
        const tribes: { [id: number]: Tribe } = {};
        chosen.forEach((a, i) => {
            if (options.currentTribes![a]) tribes[i] = options.currentTribes![a];
        });
        castOptions.currentTribes = tribes;
    }
    return { gameState, humanIds: playerIndexes.map(newId), castOptions };
}
