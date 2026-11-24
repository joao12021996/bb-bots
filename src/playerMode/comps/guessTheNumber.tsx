import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, Opponent, SimContext, SimResult } from "./compTypes";
import { Keypad } from "./compUi";
import { AnswerBoards, BoardRow, boardsDoneAt } from "./compVideo";
import { clamp, Rand, randInt, seededRand } from "./random";

// Guess the Number: one secret number from 1 to 100, and everyone guesses at once. Every guess is shown, each
// with "higher" or "lower", once, as it's made: nobody's shown the guesses again or what's still possible, so
// keeping track is up to you. The first time anyone gets it, everyone who
// didn't is out. If only one got it, they win; if two or more got it on the same turn, they play a new number.
//
// How it fits a comp where everyone takes their own turn: a score is the turn someone got each number on, number
// after number (fewer is better), compared number by number. That's exactly the knockout: whoever got the first
// number soonest is still in, and of those, whoever got the second soonest, and so on. A bot's turns are worked
// out up front; on screen its wrong guesses are made up to fit, closing in on the number at the same pace a
// player can.

const NUMBERS = 4; // after this many numbers, anyone still tied goes to the tiebreaker
const MAX_TURN = 5; // by the fifth turn there's only one number left to guess
// How wide the range of numbers still possible is, before each turn: everyone's guesses close it in this fast.
const WIDTHS = [100, 30, 9, 3, 1];
const BASE = 100;
const NOT_IN = BASE - 1; // a number someone never got to play (they were out by then)

// Turns per number, best first, into a score (higher is better).
export function encodeTurns(turns: number[]): number {
    let x = 0;
    for (let i = 0; i < NUMBERS; i++) x = x * BASE + (turns[i] ?? NOT_IN);
    return -x;
}

export function decodeTurns(score: number): number[] {
    let x = Math.round(Math.abs(score));
    // older saves: just the number of guesses
    if (x < BASE) return [x];
    const turns: number[] = [];
    for (let i = 0; i < NUMBERS; i++) {
        turns.unshift(x % BASE);
        x = Math.floor(x / BASE);
    }
    return turns;
}

function secretsFrom(rand: Rand): number[] {
    return Array.from({ length: NUMBERS }, () => randInt(rand, 1, 100));
}

// The turn a bot gets a number on: each turn, a one-in-(numbers left) shot, like anyone's.
function botTurn(skill: number, noise: Rand): number {
    const sharp = 0.8 + 0.4 * skill;
    for (let t = 1; t < MAX_TURN; t++) {
        if (noise() < Math.min(1, sharp / WIDTHS[t - 1])) return t;
    }
    return MAX_TURN;
}

function simulateGuessTheNumber(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    return { score: encodeTurns(Array.from({ length: NUMBERS }, () => botTurn(skill, noise))) };
}

// A wrong guess, made up for someone who doesn't get it this turn: inside what's still possible (as far as it can
// be), landing near the edge of where the range should close to next.
function wrongGuess(noise: Rand, secret: number, lo: number, hi: number, nextWidth: number): number {
    const below = secret - lo; // wrong numbers still possible below the secret
    const above = hi - secret;
    if (below <= 0 && above <= 0) return secret > 1 && (secret === 100 || noise() < 0.5) ? secret - 1 : secret + 1;
    const goLow = above <= 0 || (below > 0 && noise() < below / (below + above));
    const room = goLow ? below : above;
    const near = Math.min(room, Math.max(1, Math.round(nextWidth * (0.3 + noise() * 0.7))));
    const d = randInt(noise, near, room);
    return goLow ? secret - d : secret + d;
}

interface Turn {
    rows: BoardRow[];
    found: number[]; // who got it
    salt: number;
}

type Outcome = { kind: "next" } | { kind: "won" } | { kind: "out" } | { kind: "tie"; withIds: number[] } | { kind: "tiebreak" } | { kind: "found" };

function GuessTheNumber(props: CompProps) {
    const [secrets] = React.useState(() => secretsFrom(props.rand));
    const [noise] = React.useState(() => seededRand(Math.floor(props.rand() * 1e9)));
    const [number, setNumber] = React.useState(0); // which number (0-based)
    const [turn, setTurn] = React.useState(1);
    const [mine, setMine] = React.useState<number[]>([]); // the turn the player got each number on
    const [range, setRange] = React.useState<[number, number]>([1, 100]);
    const [value, setValue] = React.useState("");
    const [shown, setShown] = React.useState<{ turn: Turn; outcome: Outcome; score: number } | null>(null);

    // everyone else whose turns are known (bots, and players who have played), with the turns they got each number on
    const others = React.useMemo(
        () =>
            props.opponents
                .filter((o: Opponent) => !o.live || o.live.done)
                .map((o) => ({ hg: o.hg, turns: decodeTurns(o.score) })),
        [props.opponents]
    );
    // still in for this number: got every number before it on the same turn as the player
    const inNow = others.filter((o) => mine.every((t, i) => o.turns[i] === t));
    const secret = secrets[number];

    const submit = () => {
        const g = parseInt(value, 10);
        if (!(g >= 1 && g <= 100)) {
            setValue("");
            return;
        }
        setValue("");
        // someone who already won (a 0) gets it straight away
        const theirTurn = (o: { turns: number[] }) => Math.max(1, o.turns[number] ?? NOT_IN);
        const [lo, hi] = range;
        const next = WIDTHS[Math.min(turn, WIDTHS.length - 1)];
        const guesses = inNow.map((o) => ({ o, g: theirTurn(o) === turn ? secret : wrongGuess(noise, secret, lo, hi, next) }));
        const all = [{ id: props.human.id, g }, ...guesses.map((x) => ({ id: x.o.hg.id, g: x.g }))];
        let [nlo, nhi] = range;
        all.forEach(({ g: x }) => {
            if (x < secret) nlo = Math.max(nlo, x + 1);
            if (x > secret) nhi = Math.min(nhi, x - 1);
        });
        const arrow = (x: number) => (x === secret ? "✅" : x < secret ? "⬆️" : "⬇️");
        const rows: BoardRow[] = [
            { id: props.human.id, name: props.human.name, imageURL: props.human.imageURL, you: true, answer: `${g} ${arrow(g)}`, correct: g === secret ? true : undefined },
            ...guesses.map((x) => ({
                id: x.o.hg.id,
                name: x.o.hg.name,
                imageURL: x.o.hg.imageURL,
                answer: `${x.g} ${arrow(x.g)}`,
                correct: x.g === secret ? true : undefined,
            })),
        ];
        const found = all.filter((x) => x.g === secret).map((x) => x.id);
        const meRight = g === secret;
        let outcome: Outcome;
        let score: number;
        if (!found.length) {
            outcome = { kind: "next" };
            score = encodeTurns([...mine, NOT_IN]);
        } else if (meRight && others.length === 0) {
            outcome = { kind: "found" };
            score = encodeTurns([...mine, turn, ...Array(NUMBERS).fill(0)]);
        } else if (meRight && found.length === 1) {
            outcome = { kind: "won" };
            score = encodeTurns([...mine, turn, ...Array(NUMBERS).fill(0)]);
        } else if (meRight) {
            score = encodeTurns([...mine, turn]);
            outcome = number + 1 >= NUMBERS ? { kind: "tiebreak" } : { kind: "tie", withIds: found.filter((id) => id !== props.human.id) };
        } else {
            outcome = { kind: "out" };
            score = encodeTurns([...mine, turn + 1]);
        }
        props.report(score);
        if (props.pauseClock) props.pauseClock(true);
        setRange([nlo, nhi]);
        setShown({ turn: { rows, found, salt: number * 10 + turn }, outcome, score });
    };

    const carryOn = () => {
        if (!shown) return;
        const { outcome, score } = shown;
        if (props.pauseClock) props.pauseClock(false);
        if (outcome.kind === "next") {
            setTurn(turn + 1);
            setShown(null);
            return;
        }
        if (outcome.kind === "tie") {
            setMine([...mine, turn]);
            setNumber(number + 1);
            setTurn(1);
            setRange([1, 100]);
            setShown(null);
            return;
        }
        props.finish(score);
    };

    const nameOf = (id: number) => (id === props.human.id ? "You" : (others.find((o) => o.hg.id === id)?.hg.name ?? "?"));
    const names = (ids: number[]) => ids.map(nameOf).join(", ");

    if (shown) {
        const { outcome, turn: t } = shown;
        const done = boardsDoneAt(t.salt);
        const verdict =
            outcome.kind === "next"
                ? "Nobody got it. Guess again!"
                : outcome.kind === "found"
                  ? `You got it: ${secret}, on guess ${turn}!`
                  : outcome.kind === "won"
                    ? `🏆 Only you got it: ${secret}! You win!`
                    : outcome.kind === "out"
                      ? `❌ ${names(t.found)} got it (${secret}). You're out.`
                      : outcome.kind === "tie"
                        ? `⚖️ It's ${secret}! You and ${names(outcome.withIds)} got it. New number, just you ${outcome.withIds.length > 1 ? "lot" : "two"}.`
                        : `⚖️ It's ${secret}, and you're still tied with ${names(t.found.filter((id) => id !== props.human.id))}. On to the tiebreaker!`;
        const label =
            outcome.kind === "next" ? "Next guess" : outcome.kind === "tie" ? "Next number" : "See how I did";
        return (
            <div className="bbb-reveal" key={t.salt} style={{ "--done": `${done}s` } as React.CSSProperties}>
                <Subtle>
                    Number {number + 1}, guess {turn}
                </Subtle>
                <AnswerBoards rows={t.rows} salt={t.salt} />
                <div className="bbb-reveal-late">
                    <Title>{verdict}</Title>
                </div>
                <BigButton kind="success" onClick={carryOn}>
                    {label}
                </BigButton>
            </div>
        );
    }

    return (
        <div>
            <Title>
                Number {number + 1}, guess {turn}
            </Title>
            {inNow.length > 0 ? (
                <Subtle>
                    Guessing with you: {inNow.map((o) => o.hg.name).join(", ")}
                </Subtle>
            ) : (
                <Subtle>Guess a number from 1 to 100.</Subtle>
            )}
            {turn > 1 && <Subtle>Remember the guesses: nobody will show you them again.</Subtle>}
            <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={3} submitLabel="Guess" />
        </div>
    );
}

export function formatGuessTurns(score: number): string {
    // the turn on each number they played (someone out on a turn shows the turn after it)
    const turns = decodeTurns(score).filter((t) => t > 0 && t < NOT_IN);
    return turns.length ? `guess ${turns.join(" → ")}` : "won";
}

export const GuessTheNumberComp: CompDefinition = {
    id: "guess-the-number",
    name: "Guess the Number",
    emoji: "💯",
    kind: "luck",
    rules:
        "One secret number from 1 to 100, and everyone guesses at once. Every guess is shown once, with higher or lower: keep track of them yourself. " +
        "The first time anyone gets it, everyone who didn't is out. Only one got it? They win. Two or more? They play a new number.",
    maxSeconds: 240,
    Component: GuessTheNumber,
    simulate: simulateGuessTheNumber,
    botScore: (p) => encodeTurns([clamp(Math.round(5 - 2 * p), 1, MAX_TURN), 4, 4, 4]),
    format: formatGuessTurns,
};
