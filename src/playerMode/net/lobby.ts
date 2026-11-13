import { defaultJurySize, PlayerProfile, validateJurySize } from "../../model";
import { statRoll } from "../../cartoon/cartoon";
import { SeasonRules, withDefaults } from "../rules";
import { CastOptionsOverride } from "../../components/episode/episodeFactory";
import { Difficulty, newPlayerSave, PlayerSave } from "../playerModeController";
import { buildSeason } from "../setupGame";

// The online lobby: the host picks how big the house is, and it starts out full of bots. Everyone who joins
// takes a bot's place, either as themselves (their own name and face) or as one of the cast.

export const MIN_HOUSE = 4;

export interface LobbySeat {
    peerId: string;
    name: string;
    imageURL: string;
    castIndex: number | null; // playing as a cast member, or null: as themselves
}

export interface LobbySetup {
    size: number; // houseguests in the house, players and bots together
    difficulty: Difficulty;
    powers: "off" | "surprise";
    battleBack?: boolean; // evicted houseguests compete to come back, right before the jury starts
    hideSkills: boolean;
    rules?: Partial<SeasonRules>; // house rules; anything left out is the usual
    jury?: number; // jury size, when the host changed it
    hohPlaysVeto?: boolean; // left out: the cast's setting
    paceHours?: number; // real time: hours between comps (left out or 0: no waiting, play straight through)
    turnSeconds?: number; // seconds a player has for each decision before a bot makes it (left out or 0: no limit)
    wantPlayers?: number; // how many players the host is waiting for (bots take any spots still empty at the start)
    seats: LobbySeat[]; // the players, in the order they joined
    botOrder: number[]; // cast indexes, in the order bots are picked
}

export interface CastCard {
    name: string;
    imageURL: string;
}

export type HouseSpot = { kind: "player"; seat: LobbySeat } | { kind: "bot"; castIndex: number; card: CastCard };

export function defaultSetup(castCount: number): LobbySetup {
    const order = Array.from({ length: castCount }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return {
        size: Math.max(MIN_HOUSE, Math.min(12, castCount)),
        difficulty: "normal",
        powers: "off",
        battleBack: true,
        hideSkills: false,
        turnSeconds: 120,
        seats: [],
        botOrder: order,
    };
}

// The biggest house there can be: every cast member, plus everyone playing as themselves.
export function maxHouse(setup: LobbySetup, castCount: number): number {
    return castCount + setup.seats.filter((s) => s.castIndex === null).length;
}

export function minHouse(setup: LobbySetup): number {
    return Math.max(MIN_HOUSE, setup.seats.length);
}

// Keeps the size possible: never fewer houseguests than players (the house grows as people join).
export function normalizeSetup(setup: LobbySetup, castCount: number): LobbySetup {
    const size = Math.max(minHouse(setup), Math.min(setup.size, maxHouse(setup, castCount)));
    return { ...setup, size };
}

// Whether someone can still join: there must be a bot to replace, or room to grow the house.
export function canJoin(setup: LobbySetup, castCount: number, seat: { castIndex: number | null }): boolean {
    if (seat.castIndex !== null && setup.seats.some((s) => s.castIndex === seat.castIndex)) return false;
    const grown = { ...setup, seats: [...setup.seats, { ...seat, peerId: "", name: "", imageURL: "" }] };
    return grown.seats.length <= maxHouse(grown, castCount);
}

// Who's in the house right now: the players, then bots filling the rest.
export function houseOf(setup: LobbySetup, cast: CastCard[]): HouseSpot[] {
    const taken = new Set(setup.seats.map((s) => s.castIndex).filter((i) => i !== null));
    const bots = setup.botOrder
        .filter((i) => i < cast.length && !taken.has(i))
        .slice(0, Math.max(0, setup.size - setup.seats.length));
    return [
        ...setup.seats.map((seat) => ({ kind: "player" as const, seat })),
        ...bots.map((castIndex) => ({ kind: "bot" as const, castIndex, card: cast[castIndex] })),
    ];
}

// The host builds the season when it starts. Returns the save, and which device plays each player.
export function buildOnlineSeason(
    setup: LobbySetup,
    cast: PlayerProfile[],
    castOptions: { relationships?: any; currentTribes?: any },
    hohPlaysVeto: boolean
): { save: PlayerSave; claims: { [playerId: number]: string } } {
    const customs = setup.seats.filter((s) => s.castIndex === null);
    const pool: PlayerProfile[] = [
        ...cast,
        ...customs.map((s) => ({ name: s.name, imageURL: s.imageURL, social: 5, comp: 5 })),
    ];
    const playerIndexes = setup.seats.map((s) => (s.castIndex !== null ? s.castIndex : cast.length + customs.indexOf(s)));
    const botIndexes = houseOf(setup, cast)
        .filter((spot) => spot.kind === "bot")
        .map((spot) => (spot as { castIndex: number }).castIndex);
    // skill randomizer: everyone gets secret, random Social and Comp scores
    const roll = () => statRoll(Math.random);
    const players = setup.hideSkills ? pool.map((hg) => ({ ...hg, social: roll(), comp: roll() })) : pool;
    const season = buildSeason(players, playerIndexes, botIndexes, castOptions, setup.hohPlaysVeto ?? hohPlaysVeto, lobbyJury(setup, houseOf(setup, cast).length));
    const save = newPlayerSave(season.gameState, season.humanIds, season.castOptions as CastOptionsOverride, setup.hideSkills, {
        difficulty: setup.difficulty,
        powers: setup.powers === "surprise" ? "surprise" : [],
        battleBack: !!setup.battleBack,
        rules: withDefaults(setup.rules),
    });
    if (setup.turnSeconds && setup.turnSeconds > 0) save.turnLimit = setup.turnSeconds;
    if (setup.paceHours && setup.paceHours > 0) save.pace = { gapMs: Math.round(setup.paceHours * 3600000), startedAt: Date.now() };
    const claims: { [playerId: number]: string } = {};
    season.humanIds.forEach((id, i) => (claims[id] = setup.seats[i].peerId));
    return { save, claims };
}

// The jury for a house of this size: the host's pick if it still fits, or the usual.
export function lobbyJury(setup: LobbySetup, houseSize: number): number {
    return setup.jury !== undefined && validateJurySize(setup.jury, houseSize) ? setup.jury : defaultJurySize(houseSize);
}
