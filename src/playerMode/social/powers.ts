import { GameState, getById, getSocial, Houseguest, nonEvictedHouseguests } from "../../model";
import { AllianceBook, alliesOf } from "./alliances";
import { WeekRecord } from "../history";
import { compWins } from "./drama";
import { PersonalityId } from "./personality";
import { POWER_NAMES } from "../terms";
import { Rand, shuffled } from "../comps/random";

// Secret powers. Which ones are in a season is chosen at setup (or left as a surprise), and players never
// see the list: a power only becomes known when someone gets it, or uses it.
//
// Holdable powers go to one houseguest on a scheduled week, in secret:
//   overthrow  - on eviction night, dethrone the Head of House and name new nominees (public)
//   immunity   - when you're nominated, play it: you're off the block, and whoever nominated you picks again
//   ghostSwap  - before the veto, anonymously take one nominee off the block and put someone else on it
//   extraVote  - cast a second eviction vote
//   nullifier  - cancel one vote to evict the nominee of your choice
// Season twists:
//   audience   - the audience hands out the powers (to its favorite), and one week it names a nominee itself
//   secretHoh  - one week, nobody knows who the Head of House is

export type PowerId = "overthrow" | "immunity" | "ghostSwap" | "extraVote" | "nullifier" | "audience" | "secretHoh";

export const HOLDABLE: PowerId[] = ["overthrow", "immunity", "ghostSwap", "extraVote", "nullifier"];
export const ALL_POWERS: PowerId[] = [...HOLDABLE, "audience", "secretHoh"];

export interface PowerInfo {
    id: PowerId;
    name: string;
    emoji: string;
    blurb: string; // for the setup screen
    howTo: string; // told to whoever receives it
}

export const POWERS: { [id in PowerId]: PowerInfo } = {
    overthrow: {
        id: "overthrow",
        name: POWER_NAMES.overthrow,
        emoji: "⚡",
        blurb: "On eviction night, the holder can dethrone the Head of House and name new nominees. Everyone will know.",
        howTo: "On eviction night, before the vote, you can overthrow the Head of House and name the nominees yourself. One use. Everyone will know it was you.",
    },
    immunity: {
        id: "immunity",
        name: POWER_NAMES.immunity,
        emoji: "🛡️",
        blurb: "When the holder is nominated, they can play it to come off the block. Whoever nominated them picks again.",
        howTo: "If you're nominated, you can play it: you're off the block, and whoever nominated you has to pick someone else. One use.",
    },
    ghostSwap: {
        id: "ghostSwap",
        name: POWER_NAMES.ghostSwap,
        emoji: "👻",
        blurb: "Before the veto, the holder anonymously takes one nominee off the block and puts someone else on it.",
        howTo: "Before the veto competition, you can take any nominee off the block and put someone else up in their place. Nobody will know it was you. One use.",
    },
    extraVote: {
        id: "extraVote",
        name: POWER_NAMES.extraVote,
        emoji: "➕",
        blurb: "The holder casts a second vote at one eviction.",
        howTo: "At one eviction, you can cast a second vote. One use.",
    },
    nullifier: {
        id: "nullifier",
        name: POWER_NAMES.nullifier,
        emoji: "🚫",
        blurb: "The holder cancels one vote to evict the nominee of their choice.",
        howTo: "At one eviction, pick a nominee: one vote to evict them won't count. Works even if you're on the block. One use.",
    },
    audience: {
        id: "audience",
        name: POWER_NAMES.audience,
        emoji: "📺",
        blurb: "The audience hands out the secret powers to its favorites, and one week it names a nominee itself.",
        howTo: "",
    },
    secretHoh: {
        id: "secretHoh",
        name: POWER_NAMES.secretHoh,
        emoji: "🕶️",
        blurb: "One week, nobody knows who the Head of House is, or who nominated them.",
        howTo: "",
    },
};

export interface PowerSlot {
    id: PowerId;
    week: number; // when it's handed out (holdable), or when the twist happens
    holderId?: number;
    used?: boolean;
}

export interface PowersState {
    enabled: PowerId[];
    slots: PowerSlot[];
}

// A season's powers: when each one comes into play. Nothing before week 2, nothing at the very end.
export function schedulePowers(enabled: PowerId[], totalWeeks: number, rand: Rand): PowersState {
    const last = Math.max(2, totalWeeks - 3);
    const weeks = shuffled(
        rand,
        Array.from({ length: last - 1 }, (_, i) => i + 2)
    );
    const slots: PowerSlot[] = enabled.map((id, i) => ({ id, week: weeks.length ? weeks[i % weeks.length] : 2 }));
    return { enabled: [...enabled], slots };
}

// "Surprise me": a few powers, chosen at random.
export function surprisePowers(rand: Rand): PowerId[] {
    const n = 2 + Math.floor(rand() * 3); // 2 to 4
    return shuffled(rand, ALL_POWERS).slice(0, n);
}

// How much the audience loves someone: big personalities, comp wins, and the drama.
export function audienceScore(
    gs: GameState,
    history: WeekRecord[],
    hg: Houseguest,
    personality: PersonalityId | undefined,
    inShowmance: boolean,
    rand: Rand
): number {
    const drama = personality === "villain" || personality === "wildcard" ? 0.6 : personality === "superfan" ? 0.4 : 0;
    return 0.4 * compWins(hg, history) + 0.12 * getSocial(hg) + drama + (inShowmance ? 0.5 : 0) + rand() * 0.8;
}

// Who a bot with a power wants to protect: itself, its showmance, its allies, its final-two partners.
function protects(gs: GameState, book: AllianceBook, botId: number, partners: number[]): (id: number) => boolean {
    const allies = alliesOf(book, botId);
    return (id) => id === botId || allies.has(id) || partners.includes(id);
}

// The nominee a bot least wants out of the house.
function favorite(bot: Houseguest, ids: number[]): number {
    return [...ids].sort((a, b) => bot.relationships[b] - bot.relationships[a])[0];
}

// The houseguest a bot would most like to see on the block.
function leastFavorite(bot: Houseguest, ids: number[]): number {
    return [...ids].sort((a, b) => bot.relationships[a] - bot.relationships[b])[0];
}

// Ghost Swap: take someone it protects off the block (itself first), and put up someone it dislikes.
export function botGhostSwap(
    gs: GameState,
    book: AllianceBook,
    holderId: number,
    nomineeIds: number[],
    candidates: number[],
    partners: number[]
): { remove: number; add: number } | null {
    const bot = getById(gs, holderId);
    const keep = protects(gs, book, holderId, partners);
    const saved = nomineeIds.filter(keep);
    if (saved.length === 0 || candidates.length === 0) return null;
    const remove = saved.includes(holderId) ? holderId : favorite(bot, saved);
    return { remove, add: leastFavorite(bot, candidates) };
}

// Overthrow: only worth burning if someone it protects is on the block.
export function botOverthrow(
    gs: GameState,
    book: AllianceBook,
    holderId: number,
    nomineeIds: number[],
    candidates: number[],
    count: number,
    partners: number[]
): number[] | null {
    const keep = protects(gs, book, holderId, partners);
    if (!nomineeIds.some(keep)) return null;
    const bot = getById(gs, holderId);
    const pool = candidates.filter((id) => !keep(id));
    if (pool.length < count) return null;
    return [...pool].sort((a, b) => bot.relationships[a] - bot.relationships[b]).slice(0, count);
}

// Extra vote: used to push out a nominee it really dislikes, or to save someone it protects.
export function botExtraVote(gs: GameState, book: AllianceBook, holderId: number, nomineeIds: number[], vote: number, partners: number[]): boolean {
    const bot = getById(gs, holderId);
    const keep = protects(gs, book, holderId, partners);
    return nomineeIds.some((id) => id !== vote && keep(id)) || bot.relationships[vote] < -0.5 || nonEvictedHouseguests(gs).length <= 6;
}

// Nullifier: protect itself or someone it protects, if they're on the block.
export function botNullify(gs: GameState, book: AllianceBook, holderId: number, nomineeIds: number[], partners: number[]): number | null {
    const keep = protects(gs, book, holderId, partners);
    const saved = nomineeIds.filter(keep);
    if (saved.length === 0) return null;
    return saved.includes(holderId) ? holderId : favorite(getById(gs, holderId), saved);
}
