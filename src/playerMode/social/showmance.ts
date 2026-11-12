import { getById, getSocial, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";
import { SocialOutcome } from "./socialActions";

// Showmances: two houseguests who are more than friends. They protect each other above everything, and
// the rest of the house sees them as a pair: a two-person voting bloc to split up.

export interface Showmance {
    a: number;
    b: number;
    week: number;
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

export function partnerOf(list: Showmance[], id: number): number | undefined {
    const s = list.find((x) => x.a === id || x.b === id);
    return s ? (s.a === id ? s.b : s.a) : undefined;
}

// Bots who get very close may become a showmance.
// `charm`: how much more easily a bot falls for someone (1: the usual; charmers fall faster).
export function botShowmances(gs: MutableGameState, list: Showmance[], humanIds: number[], charm: (id: number) => number = () => 1): Showmance[] {
    const fresh: Showmance[] = [];
    const bots = nonEvictedHouseguests(gs).filter((hg) => !humanIds.includes(hg.id));
    const taken = (id: number) => partnerOf(list, id) !== undefined || fresh.some((s) => s.a === id || s.b === id);
    bots.forEach((x, i) =>
        bots.slice(i + 1).forEach((y) => {
            const c = Math.max(charm(x.id), charm(y.id));
            if (taken(x.id) || taken(y.id) || x.relationships[y.id] < (c > 1 ? 0.65 : 0.8)) return;
            if (rand() >= 0.12 * c) return;
            shiftRelationship(gs, x.id, y.id, 0.1);
            fresh.push({ a: x.id, b: y.id, week: gs.phase });
        })
    );
    return fresh;
}

// A player flirts with a bot. Enough chemistry, and it becomes a showmance.
export function flirt(gs: MutableGameState, list: Showmance[], playerId: number, botId: number): { outcome: SocialOutcome; showmance?: Showmance } {
    const bot = getById(gs, botId);
    const player = getById(gs, playerId);
    const mine = partnerOf(list, playerId);
    const theirs = partnerOf(list, botId);
    if (mine === botId) {
        shiftRelationship(gs, playerId, botId, 0.04);
        return { outcome: { text: `You and ${bot.name} spent the afternoon cuddled up in the hammock.`, good: true } };
    }
    if (theirs !== undefined) {
        shiftRelationship(gs, playerId, botId, -0.03);
        return { outcome: { text: `${bot.name} is with ${getById(gs, theirs).name}, and didn't appreciate that.`, good: false } };
    }
    if (mine !== undefined) {
        // flirting outside your showmance gets noticed
        shiftRelationship(gs, playerId, mine, -0.12);
        shiftRelationship(gs, playerId, botId, 0.03);
        return { outcome: { text: `${getById(gs, mine).name} saw you flirting with ${bot.name}. That did not go over well.`, good: false } };
    }
    shiftRelationship(gs, playerId, botId, 0.06 * socialFactor(player));
    const rel = bot.relationships[playerId];
    if (rel > 0.6 && rand() < 0.3 + 0.6 * (rel - 0.6) + 0.02 * getSocial(bot)) {
        const showmance = { a: playerId, b: botId, week: gs.phase };
        shiftRelationship(gs, playerId, botId, 0.1);
        return {
            outcome: { text: `💕 You and ${bot.name} are officially a showmance. The whole house has noticed.`, good: true },
            showmance,
        };
    }
    return {
        outcome: rel > 0.3 ? { text: `${bot.name} is definitely flirting back.`, good: true } : { text: `${bot.name} smiled politely. Not yet.`, good: false },
    };
}
