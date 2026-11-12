import { GameState, getComp, getSocial, Houseguest, inJury, nonEvictedHouseguests } from "../../model";
import { AllianceBook, alliesOf } from "../social/alliances";

// Bots sometimes throw a comp: winning HoH means getting blood on your hands, and a houseguest who feels
// safe would rather let someone else make the enemies. Same with the veto, for anyone with no stake in it.

export type CompRole = "hoh" | "veto" | "other";

// How much of its usual performance a bot shows when it's throwing.
export const THROW_EFFORT = 0.25;

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// Each bot's hidden throwing score, 0 to 10 (mostly around 5): how willing it is to sit a comp out on purpose,
// whatever its comp score. 0 never throws; 10 throws twice as often as a 5.
export const DEFAULT_THROW_SCORE = 5;

// The chance that `bot` loses this comp on purpose. Nobody throws once it's jury time: everyone needs the power.
export function throwChance(
    gs: GameState,
    book: AllianceBook,
    bot: Houseguest,
    role: CompRole,
    week: { hohId?: number; nomineeIds?: number[] },
    throwScore: number = DEFAULT_THROW_SCORE
): number {
    const house = nonEvictedHouseguests(gs);
    if (role === "other" || house.length <= 5 || inJury(gs)) return 0;
    // early on, laying low is the classic move: the first weeks see the most thrown comps
    const total = gs.houseguests.length;
    const early = total > 0 ? Math.max(0, (house.length - total / 2) / (total / 2)) : 0;
    // comp beasts have the most to lose by standing out: comp 10 throws 1.5 times as often as comp 5, comp 1 about half
    const threat = 0.5 + getComp(bot) / 10;
    const willing = (throwScore / DEFAULT_THROW_SCORE) * (1 + 0.6 * early) * threat;
    return clamp(situational(house, book, bot, role, week) * willing, 0, 0.6);
}

function situational(
    house: Houseguest[],
    book: AllianceBook,
    bot: Houseguest,
    role: CompRole,
    week: { hohId?: number; nomineeIds?: number[] }
): number {
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
