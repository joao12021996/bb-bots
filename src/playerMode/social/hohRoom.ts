import { getById, getSocial, Houseguest, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";
import { alliesOf, AllianceBook } from "./alliances";
import { bestReason, convincedText, PitchReason, reasonBonus, reasonFit, unconvincedText } from "./pitch";

// HoH room one-on-ones: before nominations, houseguests come up to the HoH room one by one to plead for
// safety, pitch a nominee, or offer a deal. Nobody has to come. Promises made up there are remembered:
// breaking one costs the HoH dearly with whoever they lied to.

// What a visitor asks of the HoH.
export type VisitPitch =
    | { kind: "plea" } // "keep me off the block this week"
    | { kind: "target"; targetId: number; reason?: PitchReason } // "you should nominate X, and here's why"
    | { kind: "deal" }; // "keep me safe this week, and you're safe with me if I win HoH next week"

export type HohVisitor = (VisitPitch | { kind: "chat" }) & { fromId: number };

// A safety deal struck in the HoH room. This week `hohId` keeps `withId` off the block;
// next week, `withId` returns the favor if they win HoH.
export interface Deal {
    hohId: number;
    withId: number;
    week: number;
}

export interface HohRoom {
    hohId: number;
    visitors: HohVisitor[]; // waiting for a one-on-one with a player HoH, in order
    index: number; // the one-on-one in progress
    wentUp: number[]; // bots seen going up to the HoH room
    asked: number[]; // players who have decided whether to go up
    promised: number[]; // houseguests the HoH told they're safe this week
    safe: number[]; // bot HoH: the promises it actually means to keep
    targets: { fromId: number; targetId: number }[]; // nominees the HoH agreed to
    pawns?: { id: number; yes: boolean }[]; // allies the HoH asked to go up as a pawn, and what they said
    pawnPending?: number[]; // players asked to go up as a pawn, who answer before the nomination ceremony
    pawnAsked?: boolean; // a bot HoH has decided whether to ask a player to be its pawn
    done?: boolean;
}

export interface RoomOutcome {
    text: string;
    good: boolean;
}

export interface RoomNews {
    toIds: number[];
    text: string;
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function alive(gs: MutableGameState, id: number): boolean {
    const hg = getById(gs, id);
    return !!hg && !hg.isEvicted;
}

// Coming up is a choice: social houseguests, the HoH's friends and allies usually do; enemies often stay away.
export function pComesUp(book: AllianceBook, bot: Houseguest, hohId: number): number {
    const ally = alliesOf(book, bot.id).has(hohId);
    return clamp(0.3 + 0.035 * getSocial(bot) + 0.2 * bot.relationships[hohId] + (ally ? 0.2 : 0), 0.1, 0.95);
}

// What a bot wants from a player HoH: allies talk targets, friends check in, everyone else wants safety.
function botPitch(gs: MutableGameState, book: AllianceBook, bot: Houseguest, hohId: number): HohVisitor {
    const fromId = bot.id;
    const rel = bot.relationships[hohId];
    const entry = bot.hitList.find((e) => e.id !== hohId && e.id !== bot.id && alive(gs, e.id));
    const target: HohVisitor | null = entry
        ? {
              kind: "target",
              fromId,
              targetId: entry.id,
              reason: bestReason(getById(gs, hohId), getById(gs, entry.id), bot),
          }
        : null;
    const r = rand();
    if (alliesOf(book, bot.id).has(hohId)) return target && r < 0.6 ? target : { kind: "chat", fromId };
    if (rel > 0.4) {
        if (r < 0.3) return { kind: "chat", fromId };
        if (r < 0.6 && target) return target;
        return r < 0.8 ? { kind: "deal", fromId } : { kind: "plea", fromId };
    }
    if (r < 0.35) return { kind: "deal", fromId };
    if (r < 0.6 && target) return target;
    return { kind: "plea", fromId };
}

// Opens the HoH room for the week. `owed` are houseguests the HoH already owes safety (last week's deals).
// With a player HoH, bots line up for a one-on-one. With a bot HoH, the bots' visits happen off screen.
export function openHohRoom(
    gs: MutableGameState,
    book: AllianceBook,
    hohId: number,
    humanIds: number[],
    owed: number[]
): HohRoom {
    const hoh = getById(gs, hohId);
    const humanHoh = humanIds.includes(hohId);
    const room: HohRoom = { hohId, visitors: [], index: 0, wentUp: [], asked: [], promised: [...owed], safe: [], targets: [] };
    if (!humanHoh) {
        // a bot HoH honors an old deal if it still likes who it made it with
        room.safe = owed.filter((id) => rand() < clamp(0.6 + 0.4 * hoh.relationships[id], 0.3, 0.95));
    }
    const bots = nonEvictedHouseguests(gs).filter((hg) => hg.id !== hohId && !humanIds.includes(hg.id));
    const came = bots.filter((bot) => rand() < pComesUp(book, bot, hohId));
    room.wentUp = came.map((bot) => bot.id);
    if (humanHoh) {
        const order = [...came];
        for (let i = order.length - 1; i > 0; i--) {
            const j = rng().randomInt(0, i);
            [order[i], order[j]] = [order[j], order[i]];
        }
        room.visitors = order.map((bot) => botPitch(gs, book, bot, hohId));
    } else {
        // face time with the HoH pays off a little
        came.forEach((bot) => shiftRelationship(gs, bot.id, hohId, 0.03 * socialFactor(bot) * (0.5 + rand())));
    }
    return room;
}

// A player HoH asks an ally whether they'd be okay going up as a pawn. They're likelier to say yes the more they
// trust the HoH, and the fewer enemies they have in the house to vote them out.
export function askPawn(gs: MutableGameState, room: HohRoom, botId: number): RoomOutcome {
    const bot = getById(gs, botId);
    const trust = bot.relationships[room.hohId] ?? 0;
    const enemies = nonEvictedHouseguests(gs).filter((hg) => hg.id !== botId && hg.id !== room.hohId && (hg.relationships[botId] ?? 0) < -0.2).length;
    const p = clamp(0.25 + 0.7 * trust - 0.08 * enemies - (room.promised.includes(botId) ? 0.2 : 0), 0.05, 0.9);
    const yes = rand() < p;
    room.pawns = [...(room.pawns || []), { id: botId, yes }];
    if (yes) {
        shiftRelationship(gs, room.hohId, botId, 0.02); // asking first shows respect
        return { text: `${bot.name} will go up as a pawn: "I trust you. Just make sure I'm still here on eviction night."`, good: true };
    }
    return { text: `${bot.name} doesn't want to go up: "Please don't. I'm not risking my game on the block."`, good: false };
}

// A player HoH answers the visitor in front of them (a bot, or another player).
export function answerVisitor(
    gs: MutableGameState,
    room: HohRoom,
    deals: Deal[],
    visitor: HohVisitor,
    accept: boolean
): RoomOutcome {
    const hohId = room.hohId;
    const from = getById(gs, visitor.fromId);
    if (visitor.kind === "chat") {
        shiftRelationship(gs, hohId, from.id, 0.03 * socialFactor(from) * (0.5 + rand()));
        return { text: `You and ${from.name} hung out in the HoH room for a while.`, good: true };
    }
    if (visitor.kind === "plea") {
        if (!accept) {
            shiftRelationship(gs, hohId, from.id, -0.02);
            return { text: `You told ${from.name} you can't make any promises.`, good: false };
        }
        shiftRelationship(gs, hohId, from.id, 0.06);
        if (!room.promised.includes(from.id)) room.promised.push(from.id);
        return { text: `You promised ${from.name} they're safe this week.`, good: true };
    }
    if (visitor.kind === "deal") {
        if (!accept) {
            shiftRelationship(gs, hohId, from.id, -0.04);
            return { text: `You turned down ${from.name}'s deal.`, good: false };
        }
        shiftRelationship(gs, hohId, from.id, 0.08);
        if (!room.promised.includes(from.id)) room.promised.push(from.id);
        deals.push({ hohId, withId: from.id, week: gs.phase });
        return {
            text: `Deal: ${from.name} is safe this week, and you're safe with ${from.name} if they win HoH next week.`,
            good: true,
        };
    }
    const target = getById(gs, visitor.targetId);
    if (!accept) {
        shiftRelationship(gs, hohId, from.id, -0.02);
        return { text: `You told ${from.name} you'll think about ${target.name}.`, good: false };
    }
    shiftRelationship(gs, hohId, from.id, 0.05);
    room.targets.push({ fromId: from.id, targetId: target.id });
    return { text: `You told ${from.name} that ${target.name} is going up.`, good: true };
}

// A player goes up to a bot HoH. `nomCount` is how many nominees there will be this week.
export function visitBotHoh(
    gs: MutableGameState,
    room: HohRoom,
    deals: Deal[],
    humanId: number,
    pitch: VisitPitch,
    nomCount: number
): RoomOutcome {
    const human = getById(gs, humanId);
    const hoh = getById(gs, room.hohId);
    const sf = socialFactor(human);
    shiftRelationship(gs, humanId, hoh.id, 0.02 * sf); // face time
    const rel = hoh.relationships[humanId];
    const rank = hoh.hitList.findIndex((e) => e.id === humanId);
    const inDanger = rank >= 0 && rank < nomCount;

    if (pitch.kind === "target") {
        const target = getById(gs, pitch.targetId);
        const likesTarget = hoh.relationships[target.id];
        const bonus = reasonBonus(hoh, target, human, pitch.reason);
        const pConvince = clamp((0.35 + rel * 0.5 + bonus) * sf - Math.max(0, likesTarget) * 0.4, 0.05, 0.95);
        if (rand() < pConvince) {
            shiftRelationship(gs, hoh.id, target.id, -0.1 * sf);
            room.targets.push({ fromId: humanId, targetId: target.id });
            return {
                text: `${convincedText(pitch.reason, hoh.name, target.name)} ${target.name} might be going up.`,
                good: true,
            };
        }
        if (likesTarget > 0.4) {
            shiftRelationship(gs, humanId, hoh.id, -0.1);
            return { text: `${hoh.name} is close with ${target.name} and didn't like hearing that from you.`, good: false };
        }
        const fit = pitch.reason ? reasonFit(hoh, target, human, pitch.reason) : 0;
        return { text: unconvincedText(pitch.reason, fit, hoh.name, target.name), good: false };
    }

    const promise = (sincerity: number) => {
        if (!room.promised.includes(humanId)) room.promised.push(humanId);
        // HoHs don't always mean it
        if (rand() < sincerity && !room.safe.includes(humanId)) room.safe.push(humanId);
    };
    if (pitch.kind === "plea") {
        const p = clamp((0.35 + rel * 0.5) * sf - (inDanger ? 0.2 : 0), 0.05, 0.9);
        if (rand() < p) {
            promise(0.9);
            return { text: `${hoh.name} looked you in the eye: "You're good this week."`, good: true };
        }
        return { text: `${hoh.name} wouldn't promise you anything.`, good: false };
    }
    const p = clamp((0.45 + rel * 0.5) * sf - (inDanger ? 0.15 : 0), 0.05, 0.95);
    if (rand() < p) {
        promise(0.93);
        shiftRelationship(gs, humanId, hoh.id, 0.05);
        deals.push({ hohId: hoh.id, withId: humanId, week: gs.phase });
        return {
            text: `${hoh.name} shook on it: you're safe this week, and ${hoh.name} is safe with you if you win HoH next week.`,
            good: true,
        };
    }
    shiftRelationship(gs, humanId, hoh.id, -0.02);
    return { text: `${hoh.name} isn't interested in making a deal with you.`, good: false };
}

// After nominations (or a replacement nomination): broken promises come back to bite the HoH.
// On the first nominations, visitors also find out whether the HoH nominated who they said they would.
export function settleNominations(
    gs: MutableGameState,
    room: HohRoom,
    deals: Deal[],
    nomineeIds: number[],
    initial: boolean,
    humanHoh: boolean
): RoomNews[] {
    const hoh = getById(gs, room.hohId);
    const news: RoomNews[] = [];
    nomineeIds
        .filter((id) => room.promised.includes(id))
        .forEach((id) => {
            const victim = getById(gs, id);
            shiftRelationship(gs, hoh.id, id, -0.3);
            // word gets around
            nonEvictedHouseguests(gs)
                .filter((hg) => hg.id !== hoh.id && hg.id !== id)
                .forEach((hg) => shiftRelationship(gs, hoh.id, hg.id, -0.03));
            room.promised = room.promised.filter((p) => p !== id);
            room.safe = room.safe.filter((p) => p !== id);
            // the deal is off, in both directions
            for (let i = deals.length - 1; i >= 0; i--) {
                const d = deals[i];
                if ((d.hohId === hoh.id && d.withId === id) || (d.hohId === id && d.withId === hoh.id)) deals.splice(i, 1);
            }
            news.push({ toIds: [id], text: `😠 ${hoh.name} promised you safety, then put you on the block.` });
            news.push({
                toIds: [hoh.id],
                text: `😠 You promised ${victim.name} safety, then nominated them. ${victim.name} won't forget it, and the house noticed.`,
            });
        });
    if (initial && humanHoh) {
        room.targets.forEach(({ fromId, targetId }) => {
            if (!alive(gs, fromId)) return;
            const from = getById(gs, fromId);
            const target = getById(gs, targetId);
            if (nomineeIds.includes(targetId)) {
                shiftRelationship(gs, hoh.id, fromId, 0.04);
                news.push({ toIds: [fromId], text: `👑 ${hoh.name} nominated ${target.name}, just like you asked.` });
            } else {
                shiftRelationship(gs, hoh.id, fromId, -0.1);
                news.push({
                    toIds: [hoh.id],
                    text: `😒 ${from.name} is annoyed: you said ${target.name} was going up.`,
                });
                news.push({ toIds: [fromId], text: `😒 ${hoh.name} said ${target.name} was going up, and didn't do it.` });
            }
        });
    }
    return news;
}
