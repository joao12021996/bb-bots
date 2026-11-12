import { GameState, getById, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { socialFactor } from "./relationships";
import { WeekRecord } from "../history";
import { compWins } from "./drama";
import { hash01, PersonalityId } from "./personality";

// The jury. Every juror remembers how they got there (who nominated them, who lied to them, who broke a
// promise, who kept one), and votes on a mix of feelings and respect for the game. Bitter jurors vote with
// their feelings; objective jurors vote for the better game. In the jury house, jurors talk: each new
// arrival brings news, and at the finale they argue it out at a roundtable.

export type JurorType = "bitter" | "objective";

export interface Grudge {
    amount: number; // negative: holds it against them; positive: owes them
    reasons: string[];
}

export interface JuryBook {
    grudges: { [jurorId: number]: { [againstId: number]: Grudge } };
    sway: { [jurorId: number]: { [finalistId: number]: number } }; // talked into (or out of) a finalist
    reasons?: { [jurorId: number]: string }; // why each bot juror voted the way they did
    finalVotes?: { [jurorId: number]: number }; // who each juror voted for to win
}

export function emptyJury(): JuryBook {
    return { grudges: {}, sway: {} };
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export function addGrudge(jury: JuryBook, jurorId: number, againstId: number, amount: number, reason: string) {
    if (jurorId === againstId) return;
    if (!jury.grudges[jurorId]) jury.grudges[jurorId] = {};
    const g = jury.grudges[jurorId][againstId] || { amount: 0, reasons: [] };
    g.amount = clamp(g.amount + amount, -1.5, 1.5);
    if (!g.reasons.includes(reason)) g.reasons.push(reason);
    jury.grudges[jurorId][againstId] = g;
}

export function grudgeOf(jury: JuryBook, jurorId: number, againstId: number): Grudge {
    return (jury.grudges[jurorId] && jury.grudges[jurorId][againstId]) || { amount: 0, reasons: [] };
}

// Loyal soldiers and villains vote with their hearts; masterminds, superfans and comp beasts with their
// heads; everyone else could go either way.
export function jurorType(p: PersonalityId | undefined, key: string): JurorType {
    if (p === "loyalSoldier" || p === "villain" || p === "sweetheart" || p === "paranoid") return "bitter";
    if (p === "mastermind" || p === "superfan" || p === "compBeast") return "objective";
    return hash01(`${key}:juror`) < 0.5 ? "bitter" : "objective";
}

// Respect for someone's game: comps, power, surviving the block, and how well they played the house.
export function respect(gs: GameState, history: WeekRecord[], finalistId: number, jurorIds: number[]): { score: number; reasons: string[] } {
    const f = getById(gs, finalistId);
    const wins = compWins(f, history);
    const hohWeeks = history.filter((w) => w.hohId === finalistId).length;
    const survived = history.filter((w) => w.nomineeIds.includes(finalistId) && !w.evictedIds.includes(finalistId)).length;
    const liked = jurorIds.length ? jurorIds.reduce((sum, j) => sum + getById(gs, j).relationships[finalistId], 0) / jurorIds.length : 0;
    const reasons: string[] = [];
    if (wins >= 2) reasons.push(`won ${wins} comps`);
    if (hohWeeks >= 1) reasons.push(`ran the house ${hohWeeks === 1 ? "once" : `${hohWeeks} times`}`);
    if (survived >= 1) reasons.push(`survived the block ${survived === 1 ? "once" : `${survived} times`}`);
    if (liked > 0.25) reasons.push("played a great social game");
    const coasted = wins === 0 && hohWeeks === 0;
    if (coasted) reasons.push("coasted to the end");
    return { score: 0.1 * wins + 0.06 * hohWeeks + 0.08 * survived + 0.4 * liked - (coasted ? 0.15 : 0), reasons };
}

// How much a juror wants a finalist to win.
export function lean(gs: GameState, history: WeekRecord[], jury: JuryBook, jurorId: number, finalistId: number, type: JurorType, jurorIds: number[]): number {
    const feel = getById(gs, jurorId).relationships[finalistId] + grudgeOf(jury, jurorId, finalistId).amount;
    const sway = (jury.sway[jurorId] && jury.sway[jurorId][finalistId]) || 0;
    const w = type === "bitter" ? 0.8 : 0.25;
    return w * feel + (1 - w) * respect(gs, history, finalistId, jurorIds).score * 2.5 + sway;
}

// A bot juror's vote, and why.
export function botJuryVote(
    gs: GameState,
    history: WeekRecord[],
    jury: JuryBook,
    jurorId: number,
    finalists: number[],
    type: JurorType,
    jurorIds: number[]
): { vote: number; reason: string } {
    const [x, y] = finalists;
    const lx = lean(gs, history, jury, jurorId, x, type, jurorIds);
    const ly = lean(gs, history, jury, jurorId, y, type, jurorIds);
    const vote = lx >= ly ? x : y;
    const loser = vote === x ? y : x;
    const name = (id: number) => getById(gs, id).name;
    const held = grudgeOf(jury, jurorId, loser);
    const owed = grudgeOf(jury, jurorId, vote);
    let reason: string;
    if (type === "bitter" && held.amount < -0.2) reason = `couldn't forgive ${name(loser)}: ${held.reasons[0]}`;
    else if (type === "bitter" && owed.amount > 0.1) reason = `${name(vote)} ${owed.reasons[0]}`;
    else if (type === "bitter") reason = `just liked ${name(vote)} more`;
    else {
        const r = respect(gs, history, vote, jurorIds).reasons.filter((s) => s !== "coasted to the end");
        reason = r.length > 0 ? `respected ${name(vote)}'s game: ${r.join(", ")}` : `thought ${name(loser)} had the weaker game`;
    }
    return { vote, reason };
}

// A newly evicted juror arrives at the jury house and tells everyone what happened to them. Jurors who
// like the newcomer take some of their grudges on as their own.
export function newcomerTalks(gs: GameState, jury: JuryBook, newcomerId: number, jurorIds: number[]): string[] {
    const newcomer = getById(gs, newcomerId);
    const stillIn = nonEvictedHouseguests(gs).map((hg) => hg.id);
    const theirs = Object.keys(jury.grudges[newcomerId] || {})
        .map(Number)
        .filter((id) => stillIn.includes(id))
        .map((id) => ({ id, g: jury.grudges[newcomerId][id] }))
        .filter((x) => Math.abs(x.g.amount) >= 0.2)
        .sort((a, b) => Math.abs(b.g.amount) - Math.abs(a.g.amount))
        .slice(0, 2);
    const lines: string[] = [];
    theirs.forEach(({ id, g }) => {
        const who = getById(gs, id).name;
        lines.push(
            g.amount < 0
                ? `🧑‍⚖️ ${newcomer.name} arrived at the jury house with news: ${who} ${g.reasons[0]}.`
                : `🧑‍⚖️ ${newcomer.name} arrived at the jury house singing ${who}'s praises: ${who} ${g.reasons[0]}.`
        );
        jurorIds
            .filter((j) => j !== newcomerId && j !== id)
            .forEach((j) => {
                const share = 0.35 * clamp(getById(gs, j).relationships[newcomerId] + 0.5, 0, 1.2);
                if (share > 0.05) addGrudge(jury, j, id, g.amount * share, `(heard from ${newcomer.name}) ${g.reasons[0]}`);
            });
    });
    if (lines.length === 0) lines.push(`🧑‍⚖️ ${newcomer.name} arrived at the jury house without much to report.`);
    return lines;
}

// The finale roundtable: each juror makes a case, and the others are swayed by whoever they like and
// respect (objective jurors less so). Players on the jury can argue for a finalist too.
export function roundtable(
    gs: GameState,
    history: WeekRecord[],
    jury: JuryBook,
    jurorIds: number[],
    finalists: number[],
    types: { [id: number]: JurorType },
    arguments_: { byId: number; forId: number }[],
    botIds: number[]
): string[] {
    const [x, y] = finalists;
    const name = (id: number) => getById(gs, id).name;
    const lines: string[] = [];
    const prefer: { [id: number]: number } = {};
    jurorIds.forEach((j) => {
        const lx = lean(gs, history, jury, j, x, types[j], jurorIds);
        const ly = lean(gs, history, jury, j, y, types[j], jurorIds);
        if (Math.abs(lx - ly) > 0.15) prefer[j] = lx > ly ? x : y;
    });
    arguments_.forEach((a) => (prefer[a.byId] = a.forId));
    const pushes: { [j: number]: { [f: number]: number } } = {};
    Object.keys(prefer)
        .map(Number)
        .forEach((speaker) => {
            const pick = prefer[speaker];
            const other = pick === x ? y : x;
            if (botIds.includes(speaker)) {
                const held = grudgeOf(jury, speaker, other);
                lines.push(
                    types[speaker] === "bitter" && held.amount < -0.2
                        ? `🗣️ ${name(speaker)} can't get past it: ${name(other)} ${held.reasons[0]}.`
                        : `🗣️ ${name(speaker)} made the case for ${name(pick)}.`
                );
            } else lines.push(`🗣️ ${name(speaker)} argued for ${name(pick)}.`);
            botIds
                .filter((j) => j !== speaker && jurorIds.includes(j))
                .forEach((j) => {
                    const pull =
                        0.12 * socialFactor(getById(gs, speaker)) * clamp(getById(gs, j).relationships[speaker] + 0.5, 0, 1.2) * (types[j] === "objective" ? 0.5 : 1);
                    if (!pushes[j]) pushes[j] = {};
                    pushes[j][pick] = (pushes[j][pick] || 0) + pull;
                });
        });
    Object.keys(pushes)
        .map(Number)
        .forEach((j) => {
            if (!jury.sway[j]) jury.sway[j] = {};
            [x, y].forEach((f) => (jury.sway[j][f] = (jury.sway[j][f] || 0) + (pushes[j][f] || 0)));
        });
    if (lines.length === 0) lines.push("🤐 The jury kept their cards close. Nobody gave anything away.");
    // a little unpredictability: someone always changes their mind at the last minute
    if (rand() < 0.3 && botIds.length > 0) {
        const j = botIds[Math.floor(rand() * botIds.length)];
        if (!jury.sway[j]) jury.sway[j] = {};
        const f = rand() < 0.5 ? x : y;
        jury.sway[j][f] = (jury.sway[j][f] || 0) + 0.1;
    }
    return lines;
}
