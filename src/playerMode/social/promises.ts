import { GameState, getById, getSocial, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { shiftRelationship } from "./relationships";

// The ledger: every promise made in the house, and every claim made about votes and targets, tracked until
// it's kept or broken. Keeping your word builds a reputation; breaking it (or getting caught lying) costs one,
// and a bad reputation makes the house slower to believe you next time.

// safety: "you're safe if I'm HoH" (for a given week)
// final2: "I'll take you to the final 2"
// vote:   "I won't vote to evict you" (at a given eviction)
export type PledgeKind = "safety" | "final2" | "vote";
export type PledgeStatus = "open" | "kept" | "broken" | "void";

export interface Pledge {
    id: number;
    kind: PledgeKind;
    fromId: number; // who gave their word
    toId: number; // who they gave it to
    week: number; // safety: the week it applies; vote: the eviction it's about; final2: when it was made
    status: PledgeStatus;
    known?: boolean; // whoever it was made to knows it was broken
}

// Something said to one houseguest that may or may not be true: "I'm voting to evict X", "the target is X".
export interface Claim {
    id: number;
    kind: "vote" | "target" | "rumour";
    fromId: number;
    toId: number;
    aboutId: number;
    week: number;
    pledged?: boolean; // told to a nominee: it's also a vote pledge, settled as one
    true?: boolean; // rumours: whether it happens to be true
    caught?: boolean;
}

export interface Ledger {
    pledges: Pledge[];
    claims: Claim[];
    nextId: number;
    reputation: { [id: number]: number }; // -3 (snake) to 2 (word is gold); 0 to start
    // How much `listener` believes `speaker`, from 0 (not a word) to 1 (completely); 0.5 to start.
    // Separate from liking: someone can enjoy your company and still not believe you.
    trust?: { [listener: number]: { [speaker: number]: number } };
    // A bot's mask slipped in front of someone (it nominated them, or broke its word): the week it happened.
    revealed?: { [botId: number]: { [viewerId: number]: number } };
}

export interface LedgerNews {
    toIds: number[];
    text: string;
}

export function emptyLedger(): Ledger {
    return { pledges: [], claims: [], nextId: 1, reputation: {} };
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

const KIND_TEXT: { [k in PledgeKind]: string } = {
    safety: "safety",
    final2: "a final-two deal",
    vote: "their vote",
};

// ---------- reputation ----------

export function reputation(ledger: Ledger, id: number): number {
    return ledger.reputation[id] || 0;
}

export function adjustReputation(ledger: Ledger, id: number, delta: number) {
    ledger.reputation[id] = clamp(reputation(ledger, id) + delta, -3, 2);
}

// How much more (or less) the house believes someone: multiplies the odds of a deal or a claim landing.
export function trustOf(ledger: Ledger, listener: number, speaker: number): number {
    const row = ledger.trust && ledger.trust[listener];
    return row && row[speaker] !== undefined ? row[speaker] : 0.5;
}

export function shiftTrust(ledger: Ledger, listener: number, speaker: number, delta: number) {
    if (listener === speaker) return;
    if (!ledger.trust) ledger.trust = {};
    if (!ledger.trust[listener]) ledger.trust[listener] = {};
    ledger.trust[listener][speaker] = clamp(trustOf(ledger, listener, speaker) + delta, 0, 1);
}

// Everyone in the house trusts `speaker` a little less (or more).
export function shiftHouseTrust(gs: MutableGameState, ledger: Ledger, speaker: number, delta: number, except: number[] = []) {
    nonEvictedHouseguests(gs)
        .filter((hg) => hg.id !== speaker && !except.includes(hg.id))
        .forEach((hg) => shiftTrust(ledger, hg.id, speaker, delta));
}

// How readily `listener` believes `speaker`: their own trust, plus what the house says about them.
// Multiplies the odds of a deal, a claim or a cover story landing (1 for a stranger with a clean record).
export function belief(ledger: Ledger, listener: number, speaker: number): number {
    return clamp(0.4 + 1.2 * trustOf(ledger, listener, speaker) + 0.1 * reputation(ledger, speaker), 0.3, 1.4);
}

export function trustLabel(trust: number): string {
    if (trust >= 0.7) return "takes you at your word";
    if (trust >= 0.45) return "mostly believes you";
    if (trust >= 0.25) return "has doubts about you";
    return "doesn't believe a word you say";
}

export function reveal(ledger: Ledger, botId: number, viewerId: number, week: number) {
    if (!ledger.revealed) ledger.revealed = {};
    if (!ledger.revealed[botId]) ledger.revealed[botId] = {};
    ledger.revealed[botId][viewerId] = week;
}

// The mask stays off for the rest of that week and the next.
export function isRevealed(ledger: Ledger, botId: number, viewerId: number, week: number): boolean {
    const at = ledger.revealed && ledger.revealed[botId] && ledger.revealed[botId][viewerId];
    return at !== undefined && week - at <= 1;
}

export function trustFactor(ledger: Ledger, id: number): number {
    return clamp(1 + 0.15 * reputation(ledger, id), 0.45, 1.3);
}

export function reputationLabel(rep: number): { label: string; emoji: string } {
    if (rep >= 1) return { label: "Your word is gold", emoji: "🏅" };
    if (rep > -0.5) return { label: "Clean record", emoji: "🙂" };
    if (rep > -1.5) return { label: "Shady", emoji: "🤨" };
    return { label: "Snake", emoji: "🐍" };
}

// ---------- pledges ----------

export function pledge(ledger: Ledger, kind: PledgeKind, fromId: number, toId: number, week: number): Pledge {
    const same = ledger.pledges.find(
        (p) => p.status === "open" && p.kind === kind && p.fromId === fromId && p.toId === toId && (kind === "final2" || p.week === week)
    );
    if (same) return same;
    const p: Pledge = { id: ledger.nextId++, kind, fromId, toId, week, status: "open" };
    ledger.pledges.push(p);
    return p;
}

export function openPledges(ledger: Ledger, kind?: PledgeKind): Pledge[] {
    return ledger.pledges.filter((p) => p.status === "open" && (!kind || p.kind === kind));
}

export function hasFinal2(ledger: Ledger, a: number, b: number): boolean {
    return openPledges(ledger, "final2").some((p) => (p.fromId === a && p.toId === b) || (p.fromId === b && p.toId === a));
}

// Who `id` promised to take to the final 2.
export function final2Partners(ledger: Ledger, id: number): number[] {
    return openPledges(ledger, "final2")
        .filter((p) => p.fromId === id)
        .map((p) => p.toId);
}

// Nominees `id` promised not to vote out at this eviction (a vote pledge, or a final-two deal).
export function promisedVotes(ledger: Ledger, id: number, week: number): number[] {
    return openPledges(ledger)
        .filter((p) => p.fromId === id && (p.kind === "final2" || (p.kind === "vote" && p.week === week)))
        .map((p) => p.toId);
}

// How likely a bot is to honor its word to `toId`.
export function honorChance(gs: GameState, fromId: number, toId: number): number {
    const from = getById(gs, fromId);
    return clamp(0.6 + 0.35 * from.relationships[toId], 0.3, 0.95);
}

function keep(gs: MutableGameState, ledger: Ledger, p: Pledge): LedgerNews[] {
    p.status = "kept";
    adjustReputation(ledger, p.fromId, 0.25);
    shiftRelationship(gs, p.fromId, p.toId, 0.05);
    shiftTrust(ledger, p.toId, p.fromId, 0.12);
    const from = getById(gs, p.fromId);
    const to = getById(gs, p.toId);
    return [
        { toIds: [p.toId], text: `✅ ${from.name} kept their word: ${KIND_TEXT[p.kind]}, as promised.` },
        { toIds: [p.fromId], text: `✅ You kept your word to ${to.name}. Your reputation is better for it.` },
    ];
}

// `relationships`: false when the relationship hit has already been applied elsewhere (the HoH room).
function breakPledge(gs: MutableGameState, ledger: Ledger, p: Pledge, known: boolean, relationships: boolean = true): LedgerNews[] {
    p.status = "broken";
    p.known = known;
    const from = getById(gs, p.fromId);
    const to = getById(gs, p.toId);
    if (!known) {
        adjustReputation(ledger, p.fromId, -0.25);
        return [{ toIds: [p.fromId], text: `🤫 You broke your word to ${to.name}. They don't know… yet.` }];
    }
    adjustReputation(ledger, p.fromId, -1);
    shiftTrust(ledger, p.toId, p.fromId, -0.4);
    shiftHouseTrust(gs, ledger, p.fromId, -0.06, [p.toId]);
    reveal(ledger, p.fromId, p.toId, gs.phase);
    if (relationships) {
        shiftRelationship(gs, p.fromId, p.toId, -0.3);
        nonEvictedHouseguests(gs)
            .filter((hg) => hg.id !== p.fromId && hg.id !== p.toId)
            .forEach((hg) => shiftRelationship(gs, p.fromId, hg.id, -0.02));
    }
    return [
        { toIds: [p.toId], text: `💔 ${from.name} broke their word: they promised you ${KIND_TEXT[p.kind]}.` },
        { toIds: [p.fromId], text: `💔 ${to.name} knows you broke your promise. Your reputation took a hit.` },
    ];
}

// Nominations (and replacement nominations) are public: putting someone you owe on the block breaks your word.
export function settleNominationPledges(gs: MutableGameState, ledger: Ledger, hohId: number, nomineeIds: number[], week: number): LedgerNews[] {
    const news: LedgerNews[] = [];
    openPledges(ledger)
        .filter((p) => p.fromId === hohId && nomineeIds.includes(p.toId))
        .forEach((p) => {
            if (p.kind === "safety" && p.week === week) news.push(...breakPledge(gs, ledger, p, true, false));
            if (p.kind === "final2") news.push(...breakPledge(gs, ledger, p, true));
        });
    return news;
}

// Eviction night: votes against people you promised are breaks (secret votes, so they may not find out),
// the HoH's safety promises for the week are kept, and promises to the evicted end.
export function settleEvictionPledges(
    gs: MutableGameState,
    ledger: Ledger,
    week: number,
    hohId: number,
    votes: { [voterId: number]: number },
    evictedIds: number[]
): LedgerNews[] {
    const news: LedgerNews[] = [];
    const counts: { [id: number]: number } = {};
    Object.values(votes).forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    openPledges(ledger).forEach((p) => {
        const vote = votes[p.fromId];
        if ((p.kind === "vote" && p.week === week) || p.kind === "final2") {
            if (vote === p.toId) {
                // a lone vote stands out
                const known = rand() < (counts[vote] === 1 ? 0.75 : 0.45);
                news.push(...breakPledge(gs, ledger, p, known));
            } else if (p.kind === "vote" && vote !== undefined) news.push(...keep(gs, ledger, p));
            else if (p.kind === "vote") p.status = "void";
        }
        if (p.kind === "safety" && p.week === week && p.status === "open") {
            if (p.fromId === hohId) news.push(...keep(gs, ledger, p));
            else p.status = "void";
        }
        if (p.status === "open" && (evictedIds.includes(p.fromId) || evictedIds.includes(p.toId))) p.status = "void";
    });
    return news;
}

// The final Head of House decides who goes to the final 2.
export function settleFinalPledges(gs: MutableGameState, ledger: Ledger, hohId: number, evictedId: number): LedgerNews[] {
    const news: LedgerNews[] = [];
    openPledges(ledger, "final2").forEach((p) => {
        if (p.fromId === hohId && p.toId === evictedId) news.push(...breakPledge(gs, ledger, p, true));
        else if (p.fromId !== evictedId && p.toId !== evictedId) news.push(...keep(gs, ledger, p));
        else p.status = "void";
    });
    openPledges(ledger).forEach((p) => (p.status = "void"));
    return news;
}

// ---------- claims ----------

export function addClaim(ledger: Ledger, claim: Omit<Claim, "id">): Claim {
    const c: Claim = { ...claim, id: ledger.nextId++ };
    ledger.claims.push(c);
    return c;
}

export function caughtLying(gs: MutableGameState, ledger: Ledger, liarId: number, victims: number[]) {
    adjustReputation(ledger, liarId, -0.75);
    victims.forEach((v) => shiftRelationship(gs, liarId, v, -0.22));
    victims.forEach((v) => shiftTrust(ledger, v, liarId, -0.4));
    shiftHouseTrust(gs, ledger, liarId, -0.06, victims);
    nonEvictedHouseguests(gs)
        .filter((hg) => hg.id !== liarId && !victims.includes(hg.id))
        .forEach((hg) => shiftRelationship(gs, liarId, hg.id, -0.02));
}

// Houseguests compare notes. Telling two people different things can come out, more likely if they're close.
export function compareNotes(gs: MutableGameState, ledger: Ledger, week: number): LedgerNews[] {
    const news: LedgerNews[] = [];
    const live = ledger.claims.filter((c) => c.week === week && !c.caught);
    live.forEach((a, i) =>
        live.slice(i + 1).forEach((b) => {
            if (a.caught || b.caught) return;
            if (a.fromId !== b.fromId || a.kind !== b.kind || a.aboutId === b.aboutId || a.toId === b.toId) return;
            if (a.kind === "rumour") return; // rumours about different people don't contradict each other
            const x = getById(gs, a.toId);
            const y = getById(gs, b.toId);
            if (!x || !y || x.isEvicted || y.isEvicted) return;
            const p = clamp(0.12 + 0.45 * Math.max(0, x.relationships[y.id]) - 0.02 * getSocial(getById(gs, a.fromId)), 0.03, 0.6);
            if (rand() >= p) return;
            a.caught = true;
            b.caught = true;
            caughtLying(gs, ledger, a.fromId, [x.id, y.id]);
            const what = a.kind === "vote" ? "who you're voting for" : "who the target is";
            news.push({ toIds: [a.fromId], text: `🤥 ${x.name} and ${y.name} compared notes: you told them different things about ${what}.` });
            news.push({
                toIds: [x.id, y.id],
                text: `🤥 ${x.name} and ${y.name} compared notes: ${getById(gs, a.fromId).name} told you different things about ${what}.`,
            });
        })
    );
    return news;
}

// After the vote: "I'm voting to evict X" claims are checked against the real (secret) votes.
export function checkVoteClaims(gs: MutableGameState, ledger: Ledger, week: number, votes: { [voterId: number]: number }): LedgerNews[] {
    const news: LedgerNews[] = [];
    const counts: { [id: number]: number } = {};
    Object.values(votes).forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    ledger.claims
        .filter((c) => c.kind === "vote" && c.week === week && !c.caught && !c.pledged)
        .forEach((c) => {
            const vote = votes[c.fromId];
            if (vote === undefined || vote === c.aboutId || counts[c.aboutId] === undefined) return;
            const listener = getById(gs, c.toId);
            if (!listener || listener.isEvicted) return;
            const p = clamp(0.45 - 0.035 * getSocial(getById(gs, c.fromId)), 0.1, 0.4) + (counts[vote] === 1 ? 0.3 : 0);
            if (rand() >= p) return;
            c.caught = true;
            caughtLying(gs, ledger, c.fromId, [c.toId]);
            news.push({ toIds: [c.fromId], text: `🤥 ${listener.name} figured out you didn't vote the way you said you would.` });
            news.push({ toIds: [c.toId], text: `🤥 ${getById(gs, c.fromId).name} told you they'd vote out ${getById(gs, c.aboutId).name}. They didn't.` });
        });
    return news;
}
