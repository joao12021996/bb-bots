import { GameState, getSocial, Houseguest, nonEvictedHouseguests } from "../../model";
import { AllianceBook, alliesOf } from "../social/alliances";

// Bots sometimes throw a comp: winning HoH means getting blood on your hands, and a houseguest who feels
// safe would rather let someone else make the enemies. Same with the veto, for anyone with no stake in it.

export type CompRole = "hoh" | "veto" | "other";

// How much of its usual performance a bot shows when it's throwing.
export const THROW_EFFORT = 0.25;

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// The chance that `bot` loses this comp on purpose.
export function throwChance(
    gs: GameState,
    book: AllianceBook,
    bot: Houseguest,
    role: CompRole,
    week: { hohId?: number; nomineeIds?: number[] }
): number {
    const house = nonEvictedHouseguests(gs);
    if (role === "other" || house.length <= 5) return 0; // late in the game, everyone needs the power
    const allies = alliesOf(book, bot.id);
    const social = getSocial(bot);
    if (role === "veto") {
        const noms = week.nomineeIds || [];
        if (noms.includes(bot.id)) return 0; // fighting for their life
        if (noms.some((id) => allies.has(id))) return 0; // wants to save an ally
        if (bot.id === week.hohId) return 0.04;
        return clamp(0.12 + 0.015 * social, 0, 0.35);
    }
    // HoH: only houseguests who aren't in anyone's sights can afford to sit one out
    const targetedBy = house.filter((hg) => hg.id !== bot.id && hg.hitList.slice(0, 2).some((e) => e.id === bot.id)).length;
    if (targetedBy > 0) return 0.02;
    const alliesInHouse = house.filter((hg) => allies.has(hg.id)).length;
    return clamp(0.08 + 0.015 * social + (alliesInHouse >= 2 ? 0.08 : 0), 0, 0.4);
}
