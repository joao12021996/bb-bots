import { getById, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { JuryBook, JurorType } from "./jury";
import { belief, Ledger, pledge, shiftTrust } from "./promises";
import { shiftRelationship, socialFactor } from "./relationships";
import { SocialOutcome } from "./socialActions";

// The endgame: once the house is down to its last few, two more things to do with a social action.
//
//   A final-three pact: you and two others, to the final three. Both have to want it, and want each other. It's a
//   promise three ways: safety from each other next week, and a bond that makes turning on each other costly.
//
//   Making your case: tell someone still in the house why you deserve to win. If they end up on the jury, they
//   remember it. It lands with people who like and believe you, and sounds like bragging to people who don't.

// Endgame actions open when this many houseguests (or fewer) are left.
export const ENDGAME_AT = 6;

export function endgameOpen(gs: { remainingPlayers: number }): boolean {
    return gs.remainingPlayers <= ENDGAME_AT && gs.remainingPlayers >= 4;
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface Pact {
    ids: [number, number, number];
    week: number;
}

export function pactOf(pacts: Pact[], id: number, gs?: { houseguests: { id: number; isEvicted: boolean }[] }): Pact | undefined {
    return pacts.find((p) => p.ids.includes(id) && (!gs || p.ids.every((x) => !gs.houseguests[x] || !gs.houseguests[x].isEvicted)));
}

// "You, me and X: final three." Asked of `botId`, about `thirdId`. A bot weighs how it feels about each of the
// other two; a player named as the third is asked later (they get it as news, and are in if they don't object:
// it's a pact among people on speaking terms).
export function offerFinal3(
    gs: MutableGameState,
    ledger: Ledger,
    pacts: Pact[],
    fromId: number,
    botId: number,
    thirdId: number,
    week: number,
    isHuman: (id: number) => boolean
): { outcome: SocialOutcome; pact?: Pact } {
    const from = getById(gs, fromId);
    const bot = getById(gs, botId);
    const third = getById(gs, thirdId);
    const taken = [fromId, botId, thirdId].find((id) => pactOf(pacts, id, gs));
    if (taken !== undefined) {
        const who = taken === fromId ? "You're" : `${getById(gs, taken).name} is`;
        return { outcome: { text: `${who} already in a final-three pact.`, good: false } };
    }
    // each bot has to like the idea of both of the others
    const wants = (meId: number, aId: number, bId: number) => {
        const me = getById(gs, meId);
        const p = (0.25 + 0.45 * me.relationships[aId] + 0.35 * me.relationships[bId]) * socialFactor(from) * belief(ledger, meId, fromId);
        return rand() < clamp(p, 0.03, 0.92);
    };
    const botIn = wants(botId, fromId, thirdId);
    const thirdIn = isHuman(thirdId) ? third.relationships[fromId] > -0.2 : wants(thirdId, fromId, botId);
    if (botIn && thirdIn) {
        const ids: [number, number, number] = [fromId, botId, thirdId];
        ids.forEach((a) =>
            ids.forEach((b) => {
                if (a === b) return;
                pledge(ledger, "safety", a, b, week + 1);
                if (a < b) shiftRelationship(gs, a, b, 0.1);
            })
        );
        return { outcome: { text: `${bot.name} and ${third.name} are in: the three of you, to the final three. Nobody puts the others up next week.`, good: true }, pact: { ids, week } };
    }
    shiftRelationship(gs, fromId, botId, -0.02);
    if (!botIn) return { outcome: { text: `${bot.name} isn't sold on a final three with you and ${third.name}.`, good: false } };
    // the one who said no hears about it, and wonders
    shiftTrust(ledger, thirdId, fromId, -0.03);
    return { outcome: { text: `${bot.name} liked it. ${third.name} didn't: no pact.`, good: false } };
}

// A broken pact: someone in it nominated, or voted out, another. The third member takes it personally too.
export function pactBroken(gs: MutableGameState, pacts: Pact[], byId: number, againstId: number): Pact | undefined {
    const pact = pacts.find((p) => p.ids.includes(byId) && p.ids.includes(againstId));
    if (!pact) return undefined;
    const third = pact.ids.find((id) => id !== byId && id !== againstId)!;
    if (nonEvictedHouseguests(gs).some((hg) => hg.id === third)) shiftRelationship(gs, third, byId, -0.15);
    return pact;
}

// Making your case to someone who may end up on the jury. Once per houseguest.
export function makeYourCase(
    gs: MutableGameState,
    ledger: Ledger,
    jury: JuryBook,
    fromId: number,
    botId: number,
    type: JurorType,
    compWins: number,
    bigMoves: number
): SocialOutcome {
    const from = getById(gs, fromId);
    const bot = getById(gs, botId);
    const likes = bot.relationships[fromId];
    // what there is to point to: an objective juror wants a record, a bitter one wants to have been treated well
    const record = type === "objective" ? 0.12 * Math.min(4, compWins + bigMoves) : 0.5 * likes;
    const p = clamp((0.35 + 0.35 * likes + record) * socialFactor(from) * belief(ledger, botId, fromId), 0.05, 0.92);
    if (!jury.sway[botId]) jury.sway[botId] = {};
    const before = jury.sway[botId][fromId] || 0;
    if (rand() < p) {
        jury.sway[botId][fromId] = before + 0.18;
        shiftRelationship(gs, fromId, botId, 0.02);
        return {
            text:
                type === "objective"
                    ? `${bot.name} heard you out, and nodded along. "You've played a real game. I'll remember that."`
                    : `${bot.name} heard you out. "You've been straight with me. That counts for a lot."`,
            good: true,
        };
    }
    jury.sway[botId][fromId] = before - 0.08;
    shiftRelationship(gs, fromId, botId, -0.03);
    return {
        text: likes < 0 ? `${bot.name} cut you off. "Save it for finale night."` : `${bot.name} wasn't convinced. To them it sounded like bragging.`,
        good: false,
    };
}
