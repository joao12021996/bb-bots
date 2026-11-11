import { getById, getSocial, Houseguest, MutableGameState } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";

// Pawn talk: being nominated stings, so after the ceremony the HoH can pull a nominee aside and tell them
// "you're not the target". If they buy it, most of the sting goes away. If they're then evicted, it was a lie,
// and they remember it (all the way to the jury).

export const NOMINATION_HIT = 0.12;

export interface PawnTalk {
    hohId: number;
    toId: number;
    believed: boolean;
}

export interface PawnNews {
    toIds: number[];
    text: string;
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// Nobody likes the person who put them on the block.
export function nominationHit(gs: MutableGameState, hohId: number, nomineeIds: number[]) {
    nomineeIds.forEach((id) => shiftRelationship(gs, hohId, id, -NOMINATION_HIT));
}

// A player HoH tells a nominee they're the pawn. Bots believe it if they trust the player, and good talkers
// are more convincing. Other players make up their own minds.
export function tellPawn(gs: MutableGameState, hohId: number, toId: number, humanIds: number[]): { talk: PawnTalk; text: string } {
    const hoh = getById(gs, hohId);
    const to = getById(gs, toId);
    if (humanIds.includes(toId)) {
        return { talk: { hohId, toId, believed: true }, text: `🤫 You told ${to.name} they're not the target.` };
    }
    const believed = rand() < clamp((0.5 + 0.4 * to.relationships[hohId]) * socialFactor(hoh), 0.1, 0.95);
    if (believed) {
        shiftRelationship(gs, hohId, toId, 0.1);
        return { talk: { hohId, toId, believed }, text: `🤫 ${to.name} believes you: they're just a pawn this week.` };
    }
    shiftRelationship(gs, hohId, toId, -0.02);
    return { talk: { hohId, toId, believed }, text: `🤨 ${to.name} didn't buy your pawn talk.` };
}

// A bot HoH does pawn talk too. Its real target is the nominee it likes least; it reassures the others,
// and a smooth-talking HoH may lie to its target's face. `candidates` are the nominees it can talk to now.
export function botPawnTalk(gs: MutableGameState, hoh: Houseguest, nomineeIds: number[], candidates: number[]): PawnTalk[] {
    if (nomineeIds.length < 2) return [];
    const target = [...nomineeIds].sort((a, b) => hoh.relationships[a] - hoh.relationships[b])[0];
    const social = getSocial(hoh);
    const talks: PawnTalk[] = [];
    candidates.forEach((id) => {
        const p = id === target ? 0.03 * social : 0.2 + 0.06 * social;
        if (rand() >= p) return;
        const to = getById(gs, id);
        const believed = rand() < clamp((0.5 + 0.4 * to.relationships[hoh.id]) * socialFactor(hoh), 0.1, 0.95);
        if (believed) shiftRelationship(gs, hoh.id, id, 0.08);
        talks.push({ hohId: hoh.id, toId: id, believed });
    });
    return talks;
}

// At the eviction, pawn talk turns out true or false. A pawn who goes home was lied to.
export function settlePawnTalk(gs: MutableGameState, talks: PawnTalk[], evictedIds: number[]): PawnNews[] {
    const news: PawnNews[] = [];
    talks.forEach((talk) => {
        const hoh = getById(gs, talk.hohId);
        const to = getById(gs, talk.toId);
        if (evictedIds.includes(talk.toId)) {
            // being fooled hurts more than having seen it coming
            shiftRelationship(gs, talk.hohId, talk.toId, talk.believed ? -0.4 : -0.2);
            news.push({
                toIds: [talk.hohId],
                text: `🤥 You told ${to.name} they weren't the target, and ${to.name} went home. They won't forget the lie.`,
            });
            news.push({ toIds: [talk.toId], text: `🤥 ${hoh.name} told you that you weren't the target. It was a lie.` });
        } else {
            shiftRelationship(gs, talk.hohId, talk.toId, 0.06);
            news.push({ toIds: [talk.hohId], text: `🤝 ${to.name} is still here, like you said. They trust you a little more.` });
            news.push({ toIds: [talk.toId], text: `🤝 ${hoh.name} said you weren't the target, and it was true.` });
        }
    });
    return news;
}
