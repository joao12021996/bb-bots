import { GameState, getById, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { AllianceBook, alliesOf, currentTargets } from "./alliances";
import { compWins, threatScoresFor } from "./drama";
import { Ledger, promisedVotes } from "./promises";
import { partnerOf, Showmance } from "./showmance";
import { PersonalityId } from "./personality";

// "Why did they do that?" A bot's nomination or vote, explained in a sentence, from what drove it: alliances,
// friendships and grudges, threats, promises and showmances. Written after the fact, from the same things the
// decision used.

export interface ReasonContext {
    gs: GameState;
    book: AllianceBook;
    history: WeekRecord[];
    ledger: Ledger;
    showmances: Showmance[];
    personalities: { [id: number]: PersonalityId };
}

const name = (gs: GameState, id: number) => getById(gs, id).name;

function threatRank(ctx: ReasonContext, observer: Houseguest, id: number): { rank: number; of: number } {
    const scores = threatScoresFor(ctx.gs, ctx.history, observer);
    const ranked = Object.keys(scores)
        .map(Number)
        .filter((x) => x !== observer.id)
        .sort((a, b) => scores[b].score - scores[a].score);
    return { rank: ranked.indexOf(id), of: ranked.length };
}

// Earlier weeks: did `them` ever nominate `me`?
function nominatedBy(ctx: ReasonContext, me: number, them: number): number | undefined {
    const week = ctx.history.find((w) => w.hohId === them && w.nomineeIds.includes(me));
    return week ? week.week : undefined;
}

function wins(ctx: ReasonContext, id: number): string {
    const n = compWins(getById(ctx.gs, id), ctx.history);
    return n > 0 ? ` (${n} comp win${n === 1 ? "" : "s"})` : "";
}

export function explainNomination(ctx: ReasonContext, hohId: number, nomineeId: number): string {
    const { gs } = ctx;
    const hoh = getById(gs, hohId);
    const them = name(gs, nomineeId);
    const feeling = hoh.relationships[nomineeId] ?? 0;
    const allies = alliesOf(ctx.book, hohId);
    if (allies.has(nomineeId)) return `a betrayal: ${them} was in an alliance with ${hoh.name}`;
    if (currentTargets(ctx.book, gs, hohId).includes(nomineeId)) return `${hoh.name}'s alliance had been gunning for ${them}`;
    const week = nominatedBy(ctx, hohId, nomineeId);
    if (week !== undefined) return `payback: ${them} nominated ${hoh.name} in week ${week}`;
    if (feeling < -0.4) return `${hoh.name} can't stand ${them}`;
    const threat = threatRank(ctx, hoh, nomineeId);
    if (threat.rank >= 0 && threat.rank < Math.max(1, Math.ceil(threat.of / 4))) return `${hoh.name} sees ${them} as one of the biggest threats in the house${wins(ctx, nomineeId)}`;
    if (feeling < -0.15) return `${hoh.name} and ${them} don't get along`;
    if (feeling > 0.3) return `a pawn: ${hoh.name} likes ${them}, and expects them to stay`;
    return `${them} had nobody close to ${hoh.name} to keep them safe`;
}

export function explainVote(ctx: ReasonContext, voterId: number, chosenId: number, nomineeIds: number[]): string {
    const { gs } = ctx;
    const voter = getById(gs, voterId);
    const them = name(gs, chosenId);
    const others = nomineeIds.filter((id) => id !== chosenId);
    const love = partnerOf(ctx.showmances, voterId);
    if (love !== undefined && others.includes(love)) return `${voter.name} would never vote out their showmance, ${name(gs, love)}`;
    const allies = alliesOf(ctx.book, voterId);
    if (allies.has(chosenId) && others.some((o) => !allies.has(o))) return `a backstab: ${voter.name} turned on their ally ${them}`;
    const ally = others.find((o) => allies.has(o));
    if (ally !== undefined) return `${voter.name} was protecting their ally ${name(gs, ally)}`;
    if (currentTargets(ctx.book, gs, voterId).includes(chosenId)) return `${them} was ${voter.name}'s alliance's target`;
    const promised = promisedVotes(ctx.ledger, voterId, gs.phase).filter((id) => others.includes(id));
    if (promised.length > 0) return `${voter.name} had promised to keep ${name(gs, promised[0])}`;
    if (ctx.personalities[voterId] === "wildcard") return `nobody knows: ${voter.name} is a wildcard`;
    const threat = threatRank(ctx, voter, chosenId);
    const otherThreat = Math.min(...others.map((o) => threatRank(ctx, voter, o).rank).filter((r) => r >= 0));
    const feeling = voter.relationships[chosenId] ?? 0;
    const otherFeeling = Math.max(...others.map((o) => voter.relationships[o] ?? 0));
    if (threat.rank >= 0 && threat.rank < otherThreat && threat.rank < Math.ceil(threat.of / 3)) return `${voter.name} sees ${them} as the bigger threat${wins(ctx, chosenId)}`;
    if (feeling < -0.3) return `${voter.name} doesn't like ${them}`;
    if (feeling < otherFeeling) return `${voter.name} is closer to ${others.length === 1 ? name(gs, others[0]) : "the other nominees"}`;
    return `${voter.name} went with the house`;
}

// Put a reason after a name: "Sam: Pip can't stand Sam".
export function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
