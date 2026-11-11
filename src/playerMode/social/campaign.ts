import { getById, getSocial, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";
import { addClaim, adjustReputation, belief, final2Partners, hasFinal2, Ledger, LedgerNews, pledge, shiftTrust } from "./promises";
import { SocialOutcome } from "./socialActions";

// Working the vote: nominees campaign (deals, pity, throwing the other nominee under the bus), everyone
// says things that may or may not be true, counts votes (bots may lie about theirs), and after a rogue vote,
// tries to pin it on someone else.

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// "I'm voting to evict X." Told to a nominee who isn't X, it's also a promise not to vote them out.
export function tellVote(
    gs: MutableGameState,
    ledger: Ledger,
    speakerId: number,
    listenerId: number,
    aboutId: number,
    nomineeIds: number[],
    week: number,
    listenerVote?: number // who the listener means to vote out, if they have a vote
): SocialOutcome {
    const listener = getById(gs, listenerId);
    const about = getById(gs, aboutId);
    const toNominee = nomineeIds.includes(listenerId);
    addClaim(ledger, { kind: "vote", fromId: speakerId, toId: listenerId, aboutId, week, pledged: toNominee });
    const trust = belief(ledger, listenerId, speakerId);
    if (toNominee) {
        pledge(ledger, "vote", speakerId, listenerId, week);
        shiftRelationship(gs, speakerId, listenerId, 0.08 * trust);
        return { text: `You told ${listener.name} you're voting to evict ${about.name}. ${listener.name} is counting on your vote now.`, good: true };
    }
    const feels = listener.relationships[aboutId];
    // how they feel about the other nominee(s): liking both the same makes it a tough call, not an insult
    const others = nomineeIds.filter((id) => id !== aboutId && id !== listenerId).map((id) => listener.relationships[id]);
    const otherFeels = others.length > 0 ? Math.max(...others) : -1;
    if (listenerVote === aboutId) {
        // they were going that way anyway
        shiftRelationship(gs, speakerId, listenerId, 0.04 * trust);
        return {
            text:
                feels > 0.4
                    ? `${listener.name} sighed. They like ${about.name} too, but they didn't argue.`
                    : `${listener.name} didn't push back. Sounds like you're on the same page.`,
            good: true,
        };
    }
    if (feels > 0.4 && feels > otherFeels + 0.15) {
        shiftRelationship(gs, speakerId, listenerId, -0.04);
        return { text: `${listener.name} is close with ${about.name} and didn't love hearing that.`, good: false };
    }
    if (feels > 0.4) {
        shiftRelationship(gs, speakerId, listenerId, 0.01 * trust);
        return { text: `${listener.name} likes both nominees. It's a tough one for them, but they get it.`, good: true };
    }
    shiftRelationship(gs, speakerId, listenerId, (feels < -0.2 ? 0.06 : 0.02) * trust);
    return {
        text: feels < -0.2 ? `${listener.name} is glad to hear it: ${about.name} has to go.` : `${listener.name} nodded and filed that away.`,
        good: true,
    };
}

// The HoH tells someone who the real target is. Whoever trusts the HoH turns on the target a little.
export function tellTarget(
    gs: MutableGameState,
    ledger: Ledger,
    hohId: number,
    listenerId: number,
    aboutId: number,
    week: number,
    nomineeIds: number[] = []
): SocialOutcome {
    const listener = getById(gs, listenerId);
    const about = getById(gs, aboutId);
    addClaim(ledger, { kind: "target", fromId: hohId, toId: listenerId, aboutId, week });
    // telling a nominee the *other* nominee is the target: that's good news for them, close friend or not
    if (nomineeIds.includes(listenerId) && nomineeIds.includes(aboutId) && listenerId !== aboutId) {
        const believes = belief(ledger, listenerId, hohId);
        shiftRelationship(gs, hohId, listenerId, 0.06 * believes);
        const close = listener.relationships[aboutId] > 0.4;
        return {
            text: close
                ? `${listener.name} is relieved it isn't them, even if they hate to see ${about.name} go.`
                : `${listener.name} is relieved: ${about.name} is the target, not them.`,
            good: true,
        };
    }
    if (listener.relationships[aboutId] > 0.4) {
        shiftRelationship(gs, hohId, listenerId, -0.05);
        return { text: `${listener.name} is close with ${about.name}, and now knows you're after them.`, good: false };
    }
    const believes = belief(ledger, listenerId, hohId);
    shiftRelationship(gs, hohId, listenerId, 0.04 * believes);
    // they only act on it if they believe it
    if (listener.relationships[hohId] > 0.1 && believes >= 0.8)
        shiftRelationship(gs, listenerId, aboutId, -0.05 * socialFactor(getById(gs, hohId)) * believes);
    return { text: `You let ${listener.name} in on it: ${about.name} is the target. ${listener.name} appreciated being trusted.`, good: true };
}

// A nominee's pity pitch: works on friends and softies, annoys everyone else.
export function pityPitch(gs: MutableGameState, nomineeId: number, voterId: number): SocialOutcome {
    const voter = getById(gs, voterId);
    const nominee = getById(gs, nomineeId);
    const p = clamp(0.3 + 0.45 * voter.relationships[nomineeId] + 0.02 * getSocial(voter), 0.05, 0.85);
    if (rand() < p) {
        shiftRelationship(gs, nomineeId, voterId, 0.08 * socialFactor(nominee));
        return { text: `${voter.name} gave you a hug. They don't want to see you go.`, good: true };
    }
    shiftRelationship(gs, nomineeId, voterId, -0.02);
    return { text: `${voter.name} listened politely, but it didn't move them.`, good: false };
}

// A nominee offers a deal: "vote to keep me, and you're safe if I win HoH next week."
export function offerVoteDeal(gs: MutableGameState, ledger: Ledger, nomineeId: number, voterId: number, week: number): SocialOutcome {
    const voter = getById(gs, voterId);
    const nominee = getById(gs, nomineeId);
    const p = clamp((0.3 + 0.5 * voter.relationships[nomineeId]) * socialFactor(nominee) * belief(ledger, voterId, nomineeId), 0.05, 0.9);
    if (rand() < p) {
        pledge(ledger, "vote", voterId, nomineeId, week);
        pledge(ledger, "safety", nomineeId, voterId, week + 1);
        shiftRelationship(gs, nomineeId, voterId, 0.05);
        return { text: `${voter.name} shook on it: their vote to keep you, for safety if you win HoH next week.`, good: true };
    }
    shiftRelationship(gs, nomineeId, voterId, -0.02);
    return { text: `${voter.name} won't commit their vote.`, good: false };
}

// "Let's go to the final 2 together." Bots who already have a final-two deal rarely take a second one.
export function offerFinal2(gs: MutableGameState, ledger: Ledger, fromId: number, botId: number, week: number): SocialOutcome {
    const bot = getById(gs, botId);
    const from = getById(gs, fromId);
    if (hasFinal2(ledger, fromId, botId)) return { text: `You and ${bot.name} already have a final-two deal.`, good: true };
    const taken = final2Partners(ledger, botId).length > 0;
    const p = clamp((0.2 + 0.7 * bot.relationships[fromId]) * socialFactor(from) * belief(ledger, botId, fromId) * (taken ? 0.25 : 1), 0.03, 0.9);
    if (rand() < p) {
        acceptFinal2(gs, ledger, fromId, botId, week);
        return { text: `${bot.name} is in: it's the two of you to the end.`, good: true };
    }
    shiftRelationship(gs, fromId, botId, -0.03);
    return { text: taken ? `${bot.name} hesitated. Maybe they already promised someone else.` : `${bot.name} isn't ready to make that promise.`, good: false };
}

export function acceptFinal2(gs: MutableGameState, ledger: Ledger, a: number, b: number, week: number) {
    pledge(ledger, "final2", a, b, week);
    pledge(ledger, "final2", b, a, week);
    shiftRelationship(gs, a, b, 0.1);
}

// Asked how they'll vote, a bot usually tells the truth. It lies to a nominee it's voting out (who wants
// that conversation?), and sometimes to people it doesn't like.
export function answerVoteQuestion(
    gs: MutableGameState,
    askerId: number,
    voterId: number,
    intended: number,
    nomineeIds: number[],
    lieMult: number = 1
): { said: number; lied: boolean } {
    const voter = getById(gs, voterId);
    const rel = voter.relationships[askerId];
    const others = nomineeIds.filter((id) => id !== intended);
    if (others.length === 0) return { said: intended, lied: false };
    let p = rel < -0.3 ? 0.25 : 0.05;
    if (intended === askerId) p = clamp(0.55 + 0.03 * getSocial(voter) - 0.25 * rel, 0.2, 0.85);
    if (rand() >= Math.min(0.95, p * lieMult)) return { said: intended, lied: false };
    const lie = others.find((id) => id !== askerId) ?? others[0];
    return { said: lie, lied: true };
}

// After a rogue vote, the nominee who survived it wants to know who cast it. Pin it on someone else,
// or keep quiet and hope nobody figures it out.
export function blameVote(
    gs: MutableGameState,
    ledger: Ledger,
    voterId: number,
    targetId: number,
    scapegoatId: number | null
): { text: string; good: boolean; news: LedgerNews[] } {
    const voter = getById(gs, voterId);
    const target = getById(gs, targetId);
    if (scapegoatId === null) {
        const found = rand() < clamp(0.4 - 0.03 * getSocial(voter), 0.1, 0.4);
        if (!found) return { text: `You kept quiet. ${target.name} never figured out it was you.`, good: true, news: [] };
        shiftRelationship(gs, voterId, targetId, -0.15);
        return {
            text: `${target.name} figured out the vote against them was yours.`,
            good: false,
            news: [{ toIds: [targetId], text: `🗳️ You figured it out: ${voter.name} voted against you.` }],
        };
    }
    const goat = getById(gs, scapegoatId);
    const p = clamp(
        0.25 + 0.05 * getSocial(voter) + 0.25 * Math.max(0, -target.relationships[scapegoatId]) + 0.15 * target.relationships[voterId],
        0.05,
        0.9
    ) * belief(ledger, targetId, voterId);
    if (rand() < p) {
        shiftRelationship(gs, targetId, scapegoatId, -0.25);
        return {
            text: `${target.name} believes you: they think ${goat.name} cast that vote.`,
            good: true,
            news: [{ toIds: [scapegoatId], text: `🗳️ ${target.name} is convinced you voted against them.` }],
        };
    }
    shiftRelationship(gs, voterId, targetId, -0.25);
    shiftRelationship(gs, voterId, scapegoatId, -0.15);
    adjustReputation(ledger, voterId, -0.75);
    shiftTrust(ledger, targetId, voterId, -0.3);
    shiftTrust(ledger, scapegoatId, voterId, -0.25);
    return {
        text: `${target.name} didn't buy it, and now knows the vote was yours. ${goat.name} heard you tried to pin it on them.`,
        good: false,
        news: [
            { toIds: [targetId], text: `🗳️ ${voter.name} voted against you, then tried to pin it on ${goat.name}.` },
            { toIds: [scapegoatId], text: `🗳️ ${voter.name} tried to pin their vote against ${target.name} on you.` },
        ],
    };
}

// Bots who notice a lone vote against them spread a rumor about who cast it. Right, more often than not.
export function rumorFor(gs: MutableGameState, targetId: number, voterIds: number[], realId: number): number {
    const candidates = voterIds.filter((id) => id !== realId && !getById(gs, id).isEvicted);
    if (candidates.length === 0 || rand() < 0.6) return realId;
    const target = getById(gs, targetId);
    return [...candidates].sort((a, b) => target.relationships[a] - target.relationships[b])[0];
}

// Bots approach players with deals: final-two offers from close friends, and nominees asking for votes.
export function botDealApproaches(
    gs: MutableGameState,
    ledger: Ledger,
    humanId: number,
    humanIds: number[],
    nomineeIds: number[],
    campaign: boolean,
    hohId?: number
): ({ kind: "final2"; fromId: number } | { kind: "votePlea"; fromId: number })[] {
    const out: ({ kind: "final2"; fromId: number } | { kind: "votePlea"; fromId: number })[] = [];
    const house = nonEvictedHouseguests(gs);
    const voter = humanId !== hohId && !nomineeIds.includes(humanId);
    house
        .filter((hg) => !humanIds.includes(hg.id) && hg.id !== humanId)
        .forEach((bot) => {
            const rel = bot.relationships[humanId];
            if (campaign && voter && nomineeIds.includes(bot.id) && rand() < clamp(0.3 + 0.04 * getSocial(bot) + 0.3 * rel, 0.1, 0.9)) {
                out.push({ kind: "votePlea", fromId: bot.id });
                return;
            }
            if (house.length >= 4 && house.length <= 10 && rel > 0.45 && !hasFinal2(ledger, bot.id, humanId)) {
                if (final2Partners(ledger, bot.id).length === 0 && rand() < 0.15) out.push({ kind: "final2", fromId: bot.id });
            }
        });
    return out;
}
