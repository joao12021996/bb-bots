import { perceivedComp, perceivedSocial } from "./perception";
import { GameState, getById, getSocial, Houseguest, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";
import { aliveMembers, Alliance, AllianceBook, alliancesOf } from "./alliances";
import { addClaim, adjustReputation, caughtLying, Ledger, LedgerNews, reputation, shiftHouseTrust, shiftTrust, trustOf, belief } from "./promises";
import { WeekRecord } from "../history";
import { SocialOutcome } from "./socialActions";

// House drama: fights that make everyone pick a side, house meetings, being seen as a threat, getting
// exposed for playing every side, eavesdropping on alliances, and rumours (true or not).

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// ---------- fights and picking sides ----------

export interface Sides {
    forA: number[];
    forB: number[];
    neutral: number[];
}

// Everyone in `deciderIds` picks a side between A and B: whoever they like and believe more.
// `bias` pushes them toward A. Picking a side brings you closer to one and sours you on the other.
export function pickSides(gs: MutableGameState, ledger: Ledger, aId: number, bId: number, deciderIds: number[], scale: number, bias: number = 0): Sides {
    const sides: Sides = { forA: [], forB: [], neutral: [] };
    deciderIds.forEach((id) => {
        const d = getById(gs, id);
        const lean =
            d.relationships[aId] - d.relationships[bId] + 0.4 * (trustOf(ledger, id, aId) - trustOf(ledger, id, bId)) + bias + (rand() - 0.5) * 0.2;
        if (Math.abs(lean) < 0.12) {
            shiftRelationship(gs, id, aId, -0.02 * scale);
            shiftRelationship(gs, id, bId, -0.02 * scale);
            sides.neutral.push(id);
            return;
        }
        const [chosen, other] = lean > 0 ? [aId, bId] : [bId, aId];
        shiftRelationship(gs, id, chosen, 0.06 * scale);
        shiftRelationship(gs, id, other, -0.08 * scale);
        (lean > 0 ? sides.forA : sides.forB).push(id);
    });
    return sides;
}

function names(gs: GameState, ids: number[]): string {
    return ids.length === 0 ? "nobody" : ids.map((id) => getById(gs, id).name).join(", ");
}

// A blow-up between A and B. The bots in the house pick sides on the spot; players are asked separately.
export function blowUp(gs: MutableGameState, ledger: Ledger, aId: number, bId: number, humanIds: number[], scale: number = 1): Sides {
    shiftRelationship(gs, aId, bId, -0.18 * scale);
    const deciders = nonEvictedHouseguests(gs)
        .filter((hg) => hg.id !== aId && hg.id !== bId && !humanIds.includes(hg.id))
        .map((hg) => hg.id);
    return pickSides(gs, ledger, aId, bId, deciders, scale);
}

export function sidesText(gs: GameState, aId: number, bId: number, sides: Sides): string {
    const a = getById(gs, aId).name;
    const b = getById(gs, bId).name;
    return `Sided with ${a}: ${names(gs, sides.forA)}. Sided with ${b}: ${names(gs, sides.forB)}.${
        sides.neutral.length > 0 ? ` Stayed out of it: ${names(gs, sides.neutral)}.` : ""
    }`;
}

// A player confronts someone, one on one but loudly enough for the house to hear.
export function confront(gs: MutableGameState, ledger: Ledger, playerId: number, targetId: number, humanIds: number[]): SocialOutcome {
    const sides = blowUp(gs, ledger, playerId, targetId, humanIds);
    const target = getById(gs, targetId);
    const won = sides.forA.length >= sides.forB.length;
    return {
        text: `💥 You and ${target.name} had it out in the kitchen. ${sidesText(gs, playerId, targetId, sides)}`,
        good: won,
    };
}

// A house meeting: the player calls someone out in front of everyone. With evidence (the target has been
// caught lying or breaking their word), the house turns on them. Without it, the caller looks dramatic.
export function houseMeeting(gs: MutableGameState, ledger: Ledger, callerId: number, targetId: number, humanIds: number[]): SocialOutcome {
    const target = getById(gs, targetId);
    const evidence = reputation(ledger, targetId) <= -0.5;
    shiftRelationship(gs, callerId, targetId, -0.25);
    const deciders = nonEvictedHouseguests(gs)
        .filter((hg) => hg.id !== callerId && hg.id !== targetId && !humanIds.includes(hg.id))
        .map((hg) => hg.id);
    const sides = pickSides(gs, ledger, callerId, targetId, deciders, 1.6, evidence ? 0.3 : -0.1);
    if (evidence) shiftHouseTrust(gs, ledger, targetId, -0.08, [callerId]);
    else sides.neutral.forEach((id) => shiftRelationship(gs, id, callerId, -0.03));
    return {
        text: `📣 You called a house meeting and laid into ${target.name}. ${
            evidence ? `Everyone knows ${target.name}'s track record, and it showed.` : `Without proof, some thought you were just stirring the pot.`
        } ${sidesText(gs, callerId, targetId, sides)}`,
        good: sides.forA.length >= sides.forB.length,
    };
}

// Feuding bots blow up on their own. At most one fight per social block; villains start more of them.
// Returns the fight (if any) so players can be asked to pick a side.
export function botFight(gs: MutableGameState, ledger: Ledger, humanIds: number[], fiery: (id: number) => number): { aId: number; bId: number; sides: Sides } | null {
    const house = nonEvictedHouseguests(gs);
    const pairs: [number, number][] = [];
    house.forEach((x, i) =>
        house.slice(i + 1).forEach((y) => {
            if (humanIds.includes(x.id) && humanIds.includes(y.id)) return;
            if (x.relationships[y.id] < -0.55) pairs.push([x.id, y.id]);
        })
    );
    for (const [a, b] of pairs) {
        if (rand() < 0.07 * Math.max(fiery(a), fiery(b))) {
            const [starter, other] = humanIds.includes(a) ? [b, a] : [a, b];
            return { aId: starter, bId: other, sides: blowUp(gs, ledger, starter, other, humanIds) };
        }
    }
    return null;
}

// ---------- threat level ----------

export interface Threat {
    score: number;
    comp: number;
    liked: number;
}

export function compWins(hg: { hohWins: number; povWins: number; id: number }, history: WeekRecord[]): number {
    return hg.hohWins + hg.povWins + history.filter((w) => w.blockbusterId === hg.id).length;
}

// How big a threat each houseguest looks: comp wins, and how well liked they are.
export function threatScores(gs: GameState, history: WeekRecord[]): { [id: number]: Threat } {
    const house = nonEvictedHouseguests(gs);
    const out: { [id: number]: Threat } = {};
    house.forEach((hg) => {
        const others = house.filter((o) => o.id !== hg.id);
        const liked = others.length ? others.reduce((sum, o) => sum + o.relationships[hg.id], 0) / others.length : 0;
        const comp = compWins(hg, history);
        out[hg.id] = { score: comp * 0.6 + liked * 3, comp, liked };
    });
    return out;
}

// How big a threat each houseguest looks to one particular observer: the same comp wins and popularity, but
// seen through the observer's own read of everyone's comp and social game.
export function threatScoresFor(gs: GameState, history: WeekRecord[], observer: Houseguest): { [id: number]: Threat } {
    const out = threatScores(gs, history);
    Object.keys(out)
        .map(Number)
        .forEach((id) => {
            if (id === observer.id) return;
            const target = getById(gs, id);
            out[id] = {
                ...out[id],
                score: out[id].score + 0.25 * (perceivedComp(observer, target) - 5) + 0.25 * (perceivedSocial(observer, target) - 5),
            };
        });
    return out;
}

export function threatLevel(gs: GameState, history: WeekRecord[], id: number): { label: string; emoji: string; reasons: string[]; rank: number } {
    const scores = threatScores(gs, history);
    const ranked = Object.keys(scores)
        .map(Number)
        .sort((a, b) => scores[b].score - scores[a].score);
    const rank = ranked.indexOf(id);
    const me = scores[id];
    const n = ranked.length;
    const reasons: string[] = [];
    if (me && me.comp >= 1) reasons.push(`${me.comp} comp win${me.comp === 1 ? "" : "s"}`);
    if (me && me.liked > 0.3) reasons.push("liked by most of the house");
    else if (me && me.liked > 0.15) reasons.push("well liked");
    const second = ranked.length > 1 ? scores[ranked[1]].score : -Infinity;
    if (rank === 0 && me.score - second > 0.3) return { label: "Biggest threat in the house", emoji: "🔥", reasons, rank };
    if (rank < Math.ceil(n / 4)) return { label: "High", emoji: "🔴", reasons, rank };
    if (rank < Math.ceil(n / 2)) return { label: "Medium", emoji: "🟠", reasons, rank };
    return { label: "Low", emoji: "🟢", reasons, rank };
}

// ---------- too many alliances ----------

// Anyone in three or more alliances risks the house figuring out they're playing every side.
export function exposeAllianceHoppers(gs: MutableGameState, ledger: Ledger, book: AllianceBook): LedgerNews[] {
    const news: LedgerNews[] = [];
    nonEvictedHouseguests(gs).forEach((hg) => {
        const mine = alliancesOf(book, hg.id).filter((a) => aliveMembers(gs, a).length >= 2);
        if (mine.length < 3 || rand() >= 0.12 * (mine.length - 2) + 0.05) return;
        adjustReputation(ledger, hg.id, -0.5);
        const others = new Set<number>();
        mine.forEach((a: Alliance) => {
            a.chemistry = clamp(a.chemistry - 0.15, 0, 1);
            a.memberIds.filter((m) => m !== hg.id).forEach((m) => others.add(m));
        });
        others.forEach((m) => {
            shiftRelationship(gs, hg.id, m, -0.1);
            shiftTrust(ledger, m, hg.id, -0.2);
        });
        news.push({
            toIds: [hg.id],
            text: `🕸️ The house figured out you're in ${mine.length} alliances. Nobody knows whose side you're really on.`,
        });
        news.push({
            toIds: Array.from(others),
            text: `🕸️ Turns out ${hg.name} is in ${mine.length} different alliances. Whose side are they really on?`,
        });
    });
    return news;
}

// ---------- eavesdropping ----------

// A player snoops around the house: they may overhear an alliance meeting they're not part of (who's in
// it, and who they're after), and they may get walked in on.
export function snoop(
    gs: MutableGameState,
    ledger: Ledger,
    book: AllianceBook,
    playerId: number
): { outcome: SocialOutcome; learned?: number } {
    const player = getById(gs, playerId);
    const candidates = book.alliances.filter((a) => !a.memberIds.includes(playerId) && aliveMembers(gs, a).length >= 2);
    if (candidates.length === 0) return { outcome: { text: "You wandered around the house, but didn't hear anything interesting.", good: false } };
    const a = candidates[Math.floor(rand() * candidates.length)];
    const social = getSocial(player);
    const heard = rand() < 0.45 + 0.03 * social;
    const caught = rand() < clamp(0.3 - 0.02 * social, 0.08, 0.3);
    const members = aliveMembers(gs, a);
    let text: string;
    if (heard) {
        const target = a.target !== undefined && a.targetWeek === gs.phase && !getById(gs, a.target).isEvicted ? getById(gs, a.target) : null;
        text = `👂 You overheard ${a.name} meeting: ${members.map((m) => m.name).join(", ")}. ${
            target ? (target.id === playerId ? "They're coming after YOU." : `They're going after ${target.name}.`) : "They haven't picked a target yet."
        }`;
    } else text = `👂 You tried to listen in on a meeting, but couldn't make out much.`;
    if (caught) {
        const who = members[Math.floor(rand() * members.length)];
        members.forEach((m) => {
            shiftRelationship(gs, playerId, m.id, -0.08);
            shiftTrust(ledger, m.id, playerId, -0.15);
        });
        text += ` Then ${who.name} walked in on you. ${a.name} knows you were listening.`;
    }
    return { outcome: { text, good: heard && !caught }, learned: heard ? a.id : undefined };
}

// Players' own alliances can be overheard too. Returns news for the alliance's players.
export function walkedInOn(gs: MutableGameState, book: AllianceBook, humanIds: number[]): LedgerNews[] {
    const news: LedgerNews[] = [];
    book.alliances
        .filter((a) => a.memberIds.some((m) => humanIds.includes(m)) && aliveMembers(gs, a).length >= 2)
        .forEach((a) => {
            if (rand() >= 0.12) return;
            const outsiders = nonEvictedHouseguests(gs).filter((hg) => !a.memberIds.includes(hg.id) && !humanIds.includes(hg.id));
            if (outsiders.length === 0) return;
            const spy = outsiders[Math.floor(rand() * outsiders.length)];
            const targeted = a.target === spy.id && a.targetWeek === gs.phase;
            a.memberIds.forEach((m) => shiftRelationship(gs, spy.id, m, targeted ? -0.2 : -0.06));
            news.push({
                toIds: a.memberIds.filter((m) => humanIds.includes(m)),
                text: `👂 ${spy.name} walked in on ${a.name}'s meeting${targeted ? `, right as you were talking about going after them` : ""}.`,
            });
        });
    return news;
}

// ---------- rumours ----------

export type RumourKind = "coming" | "secretAlliance" | "trashTalk";

export const RUMOURS: { id: RumourKind; label: string; line: (about: string) => string }[] = [
    { id: "coming", label: "🎯 They're coming after you", line: (x) => `${x} is coming after you. I heard it myself.` },
    { id: "secretAlliance", label: "🤫 They have a secret alliance", line: (x) => `${x} has a secret alliance, and you're not in it.` },
    { id: "trashTalk", label: "🗯️ They've been trash-talking you", line: (x) => `${x} has been talking trash about you behind your back.` },
];

// Is the rumour actually true?
export function rumourIsTrue(gs: GameState, book: AllianceBook, kind: RumourKind, listenerId: number, aboutId: number): boolean {
    const about = getById(gs, aboutId);
    if (kind === "coming") return about.hitList.slice(0, 2).some((e) => e.id === listenerId);
    if (kind === "secretAlliance") return alliancesOf(book, aboutId).some((a) => !a.memberIds.includes(listenerId));
    return about.relationships[listenerId] < -0.3;
}

export function spreadRumour(
    gs: MutableGameState,
    ledger: Ledger,
    book: AllianceBook,
    speakerId: number,
    listenerId: number,
    aboutId: number,
    kind: RumourKind
): SocialOutcome {
    const listener = getById(gs, listenerId);
    const about = getById(gs, aboutId);
    const feels = listener.relationships[aboutId];
    const p = clamp(0.45 * belief(ledger, listenerId, speakerId) + 0.25 * Math.max(0, -feels) - 0.3 * Math.max(0, feels), 0.05, 0.9);
    addClaim(ledger, {
        kind: "rumour",
        fromId: speakerId,
        toId: listenerId,
        aboutId,
        week: gs.phase,
        true: rumourIsTrue(gs, book, kind, listenerId, aboutId),
    });
    if (rand() < p) {
        shiftRelationship(gs, listenerId, aboutId, kind === "coming" ? -0.15 : -0.12);
        shiftRelationship(gs, speakerId, listenerId, 0.03);
        return { text: `${listener.name} bought it. They're looking at ${about.name} differently now.`, good: true };
    }
    shiftRelationship(gs, speakerId, listenerId, -0.03);
    return { text: `${listener.name} doesn't buy it${feels > 0.3 ? `: they're close with ${about.name}` : ""}.`, good: false };
}

// Rumours get checked: the listener asks around, and a false one can come back to whoever started it.
export function checkRumours(gs: MutableGameState, ledger: Ledger, week: number): LedgerNews[] {
    const news: LedgerNews[] = [];
    ledger.claims
        .filter((c) => c.kind === "rumour" && c.week === week && !c.caught && !c.true)
        .forEach((c) => {
            const listener = getById(gs, c.toId);
            const about = getById(gs, c.aboutId);
            if (listener.isEvicted || about.isEvicted) return;
            if (rand() >= 0.12 + 0.3 * Math.max(0, listener.relationships[c.aboutId])) return;
            c.caught = true;
            caughtLying(gs, ledger, c.fromId, [c.toId, c.aboutId]);
            const speaker = getById(gs, c.fromId);
            news.push({
                toIds: [c.fromId],
                text: `🗯️ ${listener.name} asked ${about.name} about your rumour. It came straight back to you.`,
            });
            news.push({ toIds: [c.toId, c.aboutId], text: `🗯️ That rumour about ${about.name}? ${speaker.name} made it up.` });
        });
    return news;
}

// Scheming bots spread rumours about players they're after. Players hear about it, and sometimes who it was.
export function botRumours(gs: MutableGameState, humanIds: number[], scheming: (id: number) => number): { aboutId: number; fromId: number; known: boolean }[] {
    const out: { aboutId: number; fromId: number; known: boolean }[] = [];
    const house = nonEvictedHouseguests(gs);
    house
        .filter((hg) => !humanIds.includes(hg.id))
        .forEach((bot) => {
            const victim = house.find((h) => humanIds.includes(h.id) && bot.relationships[h.id] < -0.2);
            if (!victim || rand() >= 0.08 * scheming(bot.id) * socialFactor(bot)) return;
            const listeners = house.filter((h) => h.id !== bot.id && h.id !== victim.id && !humanIds.includes(h.id));
            if (listeners.length === 0) return;
            const listener = listeners[Math.floor(rand() * listeners.length)];
            shiftRelationship(gs, listener.id, victim.id, -0.08);
            out.push({ aboutId: victim.id, fromId: bot.id, known: rand() < 0.5 });
        });
    return out;
}
