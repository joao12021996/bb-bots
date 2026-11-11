import { GameState, getById } from "../../model";
import { WeekRecord } from "../history";
import { Ledger } from "./promises";

// Season stats and awards, for the end of the season.

// Something worth remembering: a big move, or a backstab.
export interface MoveRecord {
    week: number;
    kind: "move" | "backstab";
    actorId: number;
    targetId?: number;
    text: string; // "HG3 backdoored HG5"
    weight: number; // how big it was
}

export interface StatRow {
    id: number;
    name: string;
    hohWins: number;
    vetoWins: number;
    lastChanceWins: number;
    nominated: number; // times on the block after the veto
    survived: number; // ...and still there the next week
    placement: number; // 1 = winner
}

export interface Award {
    emoji: string;
    title: string;
    winnerId: number;
    reason: string;
}

// Final placements: the winner, the runner-up, then everyone else in reverse order of eviction.
export function placements(gs: GameState, history: WeekRecord[], winnerId?: number): { [id: number]: number } {
    const order: number[] = [];
    history.forEach((w) => w.evictedIds.forEach((id) => order.push(id)));
    // evicted at the final eviction (not in the weekly history)
    gs.houseguests.filter((hg) => hg.isEvicted && !order.includes(hg.id)).forEach((hg) => order.push(hg.id));
    const finalists = gs.houseguests.filter((hg) => !order.includes(hg.id)).map((hg) => hg.id);
    if (winnerId !== undefined) finalists.sort((a, b) => (a === winnerId ? -1 : b === winnerId ? 1 : 0));
    const ranked = [...finalists, ...order.reverse()];
    const out: { [id: number]: number } = {};
    ranked.forEach((id, i) => (out[id] = i + 1));
    return out;
}

export function seasonStats(gs: GameState, history: WeekRecord[], winnerId?: number): StatRow[] {
    const place = placements(gs, history, winnerId);
    return gs.houseguests
        .map((hg) => {
            const nominated = history.filter((w) => w.nomineeIds.includes(hg.id)).length;
            return {
                id: hg.id,
                name: hg.name,
                hohWins: hg.hohWins,
                vetoWins: hg.povWins,
                lastChanceWins: history.filter((w) => w.blockbusterId === hg.id).length,
                nominated,
                survived: history.filter((w) => w.nomineeIds.includes(hg.id) && !w.evictedIds.includes(hg.id)).length,
                placement: place[hg.id],
            };
        })
        .sort((a, b) => a.placement - b.placement);
}

// Backstabs the ledger knows about: broken promises (that came out) and lies that got caught.
function ledgerBackstabs(gs: GameState, ledger: Ledger | undefined): MoveRecord[] {
    if (!ledger) return [];
    const name = (id: number) => getById(gs, id).name;
    const out: MoveRecord[] = [];
    const what: { [k: string]: [string, number] } = {
        final2: ["broke a final-two deal with", 4],
        safety: ["promised safety to, then nominated,", 3],
        vote: ["promised their vote to, then voted out,", 2],
    };
    ledger.pledges
        .filter((p) => p.status === "broken" && p.known)
        .forEach((p) => {
            const [text, weight] = what[p.kind];
            out.push({ week: p.week, kind: "backstab", actorId: p.fromId, targetId: p.toId, text: `${name(p.fromId)} ${text} ${name(p.toId)}`, weight });
        });
    ledger.claims
        .filter((c) => c.caught)
        .forEach((c) =>
            out.push({ week: c.week, kind: "backstab", actorId: c.fromId, targetId: c.toId, text: `${name(c.fromId)} got caught lying to ${name(c.toId)}`, weight: 1.5 })
        );
    return out;
}

export function seasonAwards(gs: GameState, history: WeekRecord[], moves: MoveRecord[], ledger: Ledger | undefined, winnerId?: number): Award[] {
    const stats = seasonStats(gs, history, winnerId);
    const awards: Award[] = [];
    const top = <T,>(arr: T[], score: (x: T) => number): T | undefined =>
        arr.length ? arr.reduce((best, x) => (score(x) > score(best) ? x : best)) : undefined;
    const wins = (s: StatRow) => s.hohWins + s.vetoWins + s.lastChanceWins;
    const beast = top(stats, wins);
    if (beast && wins(beast) > 0)
        awards.push({ emoji: "🏆", title: "Comp Beast", winnerId: beast.id, reason: `${wins(beast)} comp wins` });
    const survivor = top(stats, (s) => s.survived);
    if (survivor && survivor.survived > 0)
        awards.push({ emoji: "🧗", title: "Survivor", winnerId: survivor.id, reason: `survived the block ${survivor.survived} time${survivor.survived === 1 ? "" : "s"}` });
    const move = top(
        moves.filter((m) => m.kind === "move"),
        (m) => m.weight
    );
    if (move) awards.push({ emoji: "💣", title: "Biggest Move", winnerId: move.actorId, reason: `${move.text} (week ${move.week})` });
    const stab = top([...moves.filter((m) => m.kind === "backstab"), ...ledgerBackstabs(gs, ledger)], (m) => m.weight);
    if (stab) awards.push({ emoji: "🐍", title: "Biggest Backstab", winnerId: stab.actorId, reason: `${stab.text} (week ${stab.week})` });
    // how the rest of the house felt about each houseguest at the end
    const liked = (id: number) => {
        const others = gs.houseguests.filter((o) => o.id !== id);
        return others.reduce((sum, o) => sum + o.relationships[id], 0) / Math.max(1, others.length);
    };
    const butterfly = top(stats, (s) => liked(s.id));
    if (butterfly) awards.push({ emoji: "🦋", title: "Social Butterfly", winnerId: butterfly.id, reason: "the most liked houseguest of the season" });
    const villain = top(stats, (s) => -liked(s.id));
    if (villain && villain.id !== (butterfly && butterfly.id))
        awards.push({ emoji: "😈", title: "Villain of the Season", winnerId: villain.id, reason: "the least liked houseguest of the season" });
    const radar = stats.filter((s) => s.nominated === 0 && wins(s) === 0).sort((a, b) => a.placement - b.placement)[0];
    if (radar) awards.push({ emoji: "🛋️", title: "Under the Radar", winnerId: radar.id, reason: `never won a comp, never faced the vote, and finished #${radar.placement}` });
    return awards;
}
