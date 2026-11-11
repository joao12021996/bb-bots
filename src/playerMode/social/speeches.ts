import { getById, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";
import { Deal } from "./hohRoom";
import { PawnTalk, tellPawn } from "./pawnTalk";

// Speeches: at the nomination ceremony, the veto ceremony and on eviction night, players say a few words,
// and the tone they pick shifts relationships. Gracious keeps the peace, pawn talk reassures a nominee
// ("you're not the target"), a call-out picks a fight, and a promise offers safety next week.
// Promises are recorded as deals: whoever made one owes that safety if they win the next HoH.

export type SpeechToneId = "gracious" | "pawn" | "callout" | "promise";

export interface SpeechResult {
    lines: string[]; // what was said, then how the house took it
    talks: PawnTalk[]; // nominees told "you're not the target"
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function others(gs: MutableGameState, ...ids: number[]) {
    return nonEvictedHouseguests(gs).filter((hg) => !ids.includes(hg.id));
}

// Calling someone out in front of everyone: they resent it, their enemies enjoy it, their friends don't.
function callOut(gs: MutableGameState, speakerId: number, targetId: number): string[] {
    const target = getById(gs, targetId);
    shiftRelationship(gs, speakerId, targetId, -0.15);
    let cheered = 0;
    let offended = 0;
    others(gs, speakerId, targetId).forEach((hg) => {
        const rel = hg.relationships[targetId];
        if (rel < -0.2) {
            shiftRelationship(gs, speakerId, hg.id, 0.04);
            cheered++;
        } else if (rel > 0.5) {
            shiftRelationship(gs, speakerId, hg.id, -0.04);
            offended++;
        }
    });
    const lines = [`😠 ${target.name} did not appreciate being called out in front of everyone.`];
    if (cheered > 0) lines.push(`👏 ${cheered} houseguest${cheered === 1 ? "" : "s"} who can't stand ${target.name} enjoyed that.`);
    if (offended > 0) lines.push(`😬 ${offended} of ${target.name}'s friends thought it was out of line.`);
    return lines;
}

// "If I win HoH next week, you're safe." Bots take the promise if they trust the speaker; players decide for
// themselves. An accepted promise is a deal the speaker owes next week.
export function makePromise(gs: MutableGameState, deals: Deal[], fromId: number, toId: number, humanIds: number[]): string {
    const from = getById(gs, fromId);
    const to = getById(gs, toId);
    const record = () => {
        if (!deals.some((d) => d.hohId === toId && d.withId === fromId && d.week === gs.phase))
            deals.push({ hohId: toId, withId: fromId, week: gs.phase });
    };
    if (humanIds.includes(toId)) {
        record();
        return `🤝 You promised ${to.name} safety if you win HoH next week.`;
    }
    if (rand() < clamp((0.45 + 0.4 * to.relationships[fromId]) * socialFactor(from), 0.1, 0.95)) {
        shiftRelationship(gs, fromId, toId, 0.1);
        record();
        return `🤝 ${to.name} is holding you to it: they're safe if you win HoH next week.`;
    }
    return `🤨 ${to.name} doesn't believe your promise.`;
}

// The HoH's nomination speech (also used when naming a replacement nominee).
// `ids`: for pawn talk, the nominees told they're not the target; for a call-out, the real target.
export function nominationSpeech(
    gs: MutableGameState,
    hohId: number,
    nomineeIds: number[],
    tone: SpeechToneId,
    ids: number[],
    humanIds: number[]
): SpeechResult {
    const talks: PawnTalk[] = [];
    const name = (id: number) => getById(gs, id).name;
    if (tone === "pawn") {
        const lines = [`“${ids.map(name).join(" and ")}, you are not my target this week.”`];
        ids.forEach((id) => {
            const result = tellPawn(gs, hohId, id, humanIds);
            talks.push(result.talk);
            lines.push(result.text);
        });
        return { lines, talks };
    }
    if (tone === "callout" && ids.length > 0) {
        const target = ids[0];
        const lines = [`“${name(target)}, I'm not going to pretend. You are my target this week.”`, ...callOut(gs, hohId, target)];
        // everyone else on the block just heard they're not the target
        nomineeIds
            .filter((id) => id !== target)
            .forEach((id) => {
                const result = tellPawn(gs, hohId, id, humanIds);
                talks.push(result.talk);
                lines.push(result.text);
            });
        return { lines, talks };
    }
    nomineeIds.forEach((id) => shiftRelationship(gs, hohId, id, 0.05));
    return {
        lines: [`“This is strictly a game move. I respect every one of you.”`, `🙂 The nominees took it about as well as anyone can.`],
        talks,
    };
}

// The veto holder's speech at the veto ceremony.
// `ids`: for a call-out, who gets called out; for a promise, who is promised safety next week.
export function vetoSpeech(
    gs: MutableGameState,
    deals: Deal[],
    povId: number,
    hohId: number,
    nomineeIds: number[],
    tone: SpeechToneId,
    ids: number[],
    humanIds: number[]
): SpeechResult {
    const name = (id: number) => getById(gs, id).name;
    if (tone === "callout" && ids.length > 0) {
        return { lines: [`“${name(ids[0])}, everyone in this house knows what you've been up to.”`, ...callOut(gs, povId, ids[0])], talks: [] };
    }
    if (tone === "promise" && ids.length > 0) {
        return {
            lines: [
                `“${ids.map(name).join(" and ")}: if I win Head of House next week, you have my word that you're safe.”`,
                ...ids.map((id) => makePromise(gs, deals, povId, id, humanIds)),
            ],
            talks: [],
        };
    }
    [hohId, ...nomineeIds].filter((id) => id !== povId).forEach((id) => shiftRelationship(gs, povId, id, 0.03));
    return { lines: [`“I have nothing but love for everyone here. This is just what's best for my game.”`, `🙂 Nobody could be mad at that.`], talks: [] };
}

// A nominee's last plea before the vote.
// `ids`: for a promise, the voters promised safety; for a call-out, the other nominee being called out.
export function evictionSpeech(
    gs: MutableGameState,
    deals: Deal[],
    speakerId: number,
    voterIds: number[],
    tone: SpeechToneId,
    ids: number[],
    humanIds: number[]
): SpeechResult {
    const speaker = getById(gs, speakerId);
    const name = (id: number) => getById(gs, id).name;
    if (tone === "promise" && ids.length > 0) {
        return {
            lines: [
                `“Keep me here, ${ids.map(name).join(" and ")}, and if I win Head of House you are safe. That's a promise.”`,
                ...ids.map((id) => makePromise(gs, deals, speakerId, id, humanIds)),
            ],
            talks: [],
        };
    }
    if (tone === "callout" && ids.length > 0) {
        const rival = ids[0];
        shiftRelationship(gs, speakerId, rival, -0.2);
        let swayed = 0;
        let lost = 0;
        // voters side with whoever they already liked better
        voterIds.forEach((id) => {
            const rel = getById(gs, id).relationships[rival];
            if (rel < 0) {
                shiftRelationship(gs, speakerId, id, 0.08 * socialFactor(speaker));
                swayed++;
            } else if (rel > 0.3) {
                shiftRelationship(gs, speakerId, id, -0.06);
                lost++;
            }
        });
        return {
            lines: [
                `“If you keep ${name(rival)} over me, you are handing ${name(rival)} this game. Open your eyes.”`,
                `😠 ${name(rival)} won't forget that.`,
                swayed > 0 ? `👀 ${swayed} voter${swayed === 1 ? "" : "s"} nodded along.` : `😶 Nobody nodded along.`,
                ...(lost > 0 ? [`😬 ${lost} of ${name(rival)}'s friends didn't like it.`] : []),
            ],
            talks: [],
        };
    }
    voterIds.forEach((id) => shiftRelationship(gs, speakerId, id, 0.03 * socialFactor(speaker)));
    return {
        lines: [`“Whatever happens tonight, I've loved every minute in this house with you.”`, `🙂 A classy speech. The voters appreciated it.`],
        talks: [],
    };
}
