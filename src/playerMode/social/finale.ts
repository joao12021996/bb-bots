import { GameState, getById } from "../../model";
import { rng } from "../../utils";
import { WeekRecord } from "../history";
import { compWins } from "./drama";
import { addGrudge, grudgeOf, JuryBook, JurorType } from "./jury";
import { PersonalityId } from "./personality";

// Final-two speeches and jury questions. Each finalist chooses which of their moves to own up to: objective
// jurors respect a player who owns their game, bitter ones want honesty (and an apology). Then jurors ask
// about whatever they hold against the finalists, and how a finalist answers can win or lose a vote.

export interface Move {
    id: string;
    text: string; // "Telling HG3 they weren't the target"
    jurorIds: number[]; // jurors who hold it against the finalist (empty: a move to take credit for)
    kind: "grudge" | "credit";
}

export type Answer = "own" | "sorry" | "deny";

export interface JuryQuestion {
    jurorId: number;
    finalistId: number;
    reason?: string; // the grudge it's about (none: a general question)
    secondhand: boolean; // the juror only heard about it
    question: string;
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

// "(heard from HG4) lied to my face" -> "lied to my face"
function bareReason(reason: string): { reason: string; secondhand: boolean } {
    const m = reason.match(/^\(heard from [^)]*\) (.*)$/);
    return m ? { reason: m[1], secondhand: true } : { reason, secondhand: false };
}

const OWNING: { [reason: string]: string } = {
    "put me on the block": "Nominating {names}",
    "voted me out": "Voting out {names}",
    "told me I wasn't the target": "Telling {names} they weren't the target",
    "broke a promise to me": "Breaking your word to {names}",
    "lied to my face": "Lying to {names}",
    "cut me at the final three": "Cutting {names} at the final three",
    "gloated when I left": "Gloating when {names} left",
    "didn't even say goodbye": "Not saying goodbye to {names}",
};

const ASKING: { [reason: string]: string } = {
    "put me on the block": "Why did you put me on the block?",
    "voted me out": "I know you voted me out. Why?",
    "told me I wasn't the target": "You told me I wasn't the target. Was that a lie?",
    "broke a promise to me": "You made me a promise and broke it. Why should I vote for you?",
    "lied to my face": "Did you lie to me?",
    "cut me at the final three": "Why did you cut me at the final three?",
    "gloated when I left": "Why did you rub it in when I left?",
    "didn't even say goodbye": "You didn't even say goodbye. What was that about?",
};

// The moves a finalist could own up to: everything the jury holds against them, and the game they played.
export function movesFor(gs: GameState, history: WeekRecord[], jury: JuryBook, finalistId: number, jurorIds: number[]): Move[] {
    const byReason: { [reason: string]: number[] } = {};
    jurorIds.forEach((j) => {
        const g = grudgeOf(jury, j, finalistId);
        if (g.amount >= 0) return;
        g.reasons
            .map((r) => bareReason(r).reason)
            .filter((r) => OWNING[r])
            .forEach((r) => {
                byReason[r] = byReason[r] || [];
                if (!byReason[r].includes(j)) byReason[r].push(j);
            });
    });
    const moves: Move[] = Object.keys(byReason).map((r) => ({
        id: `grudge:${r}`,
        text: OWNING[r].replace("{names}", byReason[r].map((j) => getById(gs, j).name).join(" and ")),
        jurorIds: byReason[r],
        kind: "grudge" as const,
    }));
    const f = getById(gs, finalistId);
    const wins = compWins(f, history);
    const hohWeeks = history.filter((w) => w.hohId === finalistId).length;
    const survived = history.filter((w) => w.nomineeIds.includes(finalistId) && !w.evictedIds.includes(finalistId)).length;
    if (wins > 0) moves.push({ id: "credit:comps", text: `Winning ${wins} comp${wins === 1 ? "" : "s"}`, jurorIds: [], kind: "credit" });
    if (hohWeeks > 0) moves.push({ id: "credit:hoh", text: `Running the house as HoH${hohWeeks > 1 ? ` ${hohWeeks} times` : ""}`, jurorIds: [], kind: "credit" });
    if (survived > 0) moves.push({ id: "credit:block", text: `Surviving the block${survived > 1 ? ` ${survived} times` : ""}`, jurorIds: [], kind: "credit" });
    moves.push({ id: "credit:social", text: "Playing the social game: everyone talked to you", jurorIds: [], kind: "credit" });
    return moves;
}

function sway(jury: JuryBook, jurorId: number, finalistId: number, amount: number) {
    if (!jury.sway[jurorId]) jury.sway[jurorId] = {};
    jury.sway[jurorId][finalistId] = (jury.sway[jurorId][finalistId] || 0) + amount;
}

// The final-two speech: owning a move earns respect (objective jurors) and softens grudges (bitter ones).
// Dodging a move someone holds against you makes it worse. Taking credit impresses objective jurors,
// but bragging too much grates on bitter ones.
export function giveSpeech(
    gs: GameState,
    jury: JuryBook,
    finalistId: number,
    moves: Move[],
    ownedIds: string[],
    types: { [id: number]: JurorType },
    jurorIds: number[]
): string[] {
    const name = getById(gs, finalistId).name;
    const owned = moves.filter((m) => ownedIds.includes(m.id));
    const credits = owned.filter((m) => m.kind === "credit").length;
    moves
        .filter((m) => m.kind === "grudge")
        .forEach((m) =>
            m.jurorIds.forEach((j) => {
                if (ownedIds.includes(m.id)) {
                    if (types[j] === "objective") sway(jury, j, finalistId, 0.15);
                    else addGrudge(jury, j, finalistId, 0.08, "owned up to it in their speech");
                } else sway(jury, j, finalistId, types[j] === "objective" ? -0.1 : -0.08);
            })
        );
    jurorIds.forEach((j) => {
        if (types[j] === "objective") sway(jury, j, finalistId, 0.06 * credits);
        else if (credits > 2) sway(jury, j, finalistId, -0.03 * (credits - 2));
    });
    if (owned.length === 0) return [`🎤 ${name} gave a speech about friendship and the journey, and didn't own up to a single move.`];
    return [`🎤 ${name} owned it: ${owned.map((m) => m.text.charAt(0).toLowerCase() + m.text.slice(1)).join("; ")}.`];
}

// How a bot finalist plays its speech.
export function botOwns(p: PersonalityId | undefined, moves: Move[]): string[] {
    if (p === "villain" || p === "mastermind" || p === "compBeast") return moves.map((m) => m.id);
    if (p === "loyalSoldier" || p === "superfan") return moves.filter((m) => m.kind === "grudge" || m.id === "credit:social").map((m) => m.id);
    if (p === "floater") return moves.filter((m) => m.id === "credit:social").map((m) => m.id);
    return moves.filter(() => rand() < 0.5).map((m) => m.id);
}

// Each bot juror asks one question: about what they hold against a finalist most, or a general one.
// Every juror questions both finalists: about what they hold against them if there's something to ask, a general
// question otherwise. The finalist they hold the most against goes first.
const GENERAL: ((other: string) => string)[] = [
    (other) => `Why do you deserve to win more than ${other}?`,
    () => "What was your best move this season?",
    () => "Is there one move you regret?",
    (other) => `What did you do in this game that ${other} didn't?`,
];

export function juryQuestions(gs: GameState, jury: JuryBook, finalistIds: number[], botJurorIds: number[]): JuryQuestion[] {
    const questions: JuryQuestion[] = [];
    botJurorIds.forEach((j, ji) => {
        const order = [...finalistIds].sort((a, b) => grudgeOf(jury, j, a).amount - grudgeOf(jury, j, b).amount);
        order.forEach((f, fi) => {
            const g = grudgeOf(jury, j, f);
            const asked = g.amount < -0.15 ? g.reasons.map(bareReason).find((r) => ASKING[r.reason]) : undefined;
            if (asked) {
                questions.push({ jurorId: j, finalistId: f, reason: asked.reason, secondhand: asked.secondhand, question: ASKING[asked.reason] });
                return;
            }
            const other = finalistIds.find((id) => id !== f);
            const general = GENERAL[(ji + fi) % GENERAL.length];
            questions.push({ jurorId: j, finalistId: f, secondhand: false, question: general(other === undefined ? "the others" : getById(gs, other).name) });
        });
    });
    return questions;
}

export function answerLabels(q: JuryQuestion): { [a in Answer]: string } {
    if (!q.reason) return { own: "🏆 Talk up my game", sorry: "🙏 Thank the jury, stay humble", deny: "🗡️ Trash my opponent" };
    return { own: "🎯 Own it: it was strategy", sorry: "🙏 Apologize", deny: "🙅 Deny it" };
}

// Answering a juror. Owning it works on objective jurors, apologizing on bitter ones, and denying something
// they know is true backfires (unless they only heard it secondhand, and believe you).
export function answer(gs: GameState, jury: JuryBook, q: JuryQuestion, a: Answer, type: JurorType): string {
    const juror = getById(gs, q.jurorId).name;
    const finalist = getById(gs, q.finalistId).name;
    let effect: number;
    if (!q.reason) effect = { own: type === "objective" ? 0.2 : 0, sorry: type === "bitter" ? 0.15 : 0.02, deny: -0.15 }[a];
    else if (a === "deny" && q.secondhand && rand() < 0.4) effect = 0.15;
    else effect = type === "objective" ? { own: 0.3, sorry: 0.1, deny: -0.3 }[a] : { own: 0.05, sorry: 0.3, deny: -0.35 }[a];
    sway(jury, q.jurorId, q.finalistId, effect);
    const said = answerLabels(q)[a].replace(/^\S+ /, "").toLowerCase();
    const reaction = effect > 0.12 ? "nodded. That landed." : effect < -0.05 ? "didn't like that answer one bit." : "gave nothing away.";
    return `❓ ${juror} asked ${finalist}: "${q.question}" ${finalist} chose to ${said}. ${juror} ${reaction}`;
}

export function botAnswer(p: PersonalityId | undefined): Answer {
    if (p === "villain" || p === "mastermind" || p === "compBeast") return "own";
    if (p === "loyalSoldier" || p === "superfan") return "sorry";
    if (p === "floater") return "deny";
    return (["own", "sorry", "deny"] as Answer[])[Math.floor(rand() * 3)];
}
