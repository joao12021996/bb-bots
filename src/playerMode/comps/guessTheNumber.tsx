import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { Keypad, StageContext } from "./compUi";
import { AnswerBoards, BoardRow, boardsDoneAt } from "./compVideo";
import { clamp, Rand, randInt, seededRand } from "./random";

// Guess the Number: a secret number from 1 to 100, and everyone still in guesses at once. Every guess is shown
// once, with "higher" or "lower" (nobody's shown the guesses again, or what's still possible: keeping track is up to
// you). A right guess stays hidden: whoever got it is locked in, and nobody sees the number. Once half the field
// has it, it's revealed: they go through to a new number, and everyone else is out. The last one standing wins.
//
// How it fits a comp where everyone takes their own turn: what anyone hands in is the turn they got each number on
// (a bot's are worked out up front; on screen its wrong guesses are made up to fit, closing in at the pace a player
// can). Once everyone's done, `settle` plays the knockout out from those turns, the same way the screen did, and
// gives the final scores. Online, the players in it see each other's real guesses: each guess goes out with the
// score so far, and a turn waits until everyone still guessing has made theirs.

const NUMBERS = 10; // numbers it can take (a tie on the last one goes to whoever took the fewest guesses overall)
const MAX_TURN = 5; // by the fifth turn there's only one number left to guess
// How wide the range of numbers still possible is, before each turn: everyone's guesses close it in this fast.
const WIDTHS = [100, 30, 9, 3, 1];
const BASE = 32;
const NOT_IN = BASE - 1; // never got it (out by then)
const WAIT_MS = 60000; // online: how long a turn waits on a player who's gone quiet

// The turn someone got each number on, into what they hand in (always below zero).
export function encodeTurns(turns: number[]): number {
    let x = 0;
    for (let i = 0; i < NUMBERS; i++) x = x * BASE + clamp(turns[i] ?? NOT_IN, 1, NOT_IN);
    return -x;
}

export function decodeTurns(score: number): number[] {
    if (score >= 0) return [];
    let x = Math.round(-score);
    if (x < BASE) return [x]; // older saves: just the number of guesses
    const turns: number[] = [];
    for (let i = 0; i < NUMBERS; i++) {
        turns.unshift(x % BASE);
        x = Math.floor(x / BASE);
    }
    return turns;
}

// How many it takes to end a number: half the field, rounded up; ten or more in it, 40% (rounded up: the bottom
// 60% are out, so 4 of 10, 5 of 11); with three or fewer left, the first to get it.
// Get it on the same turn as the last one needed and you're through too, so a tie just means another number.
export const throughCount = (field: number) => (field <= 3 ? 1 : field >= 10 ? Math.ceil((field * 2) / 5) : Math.ceil(field / 2));

// Final scores: the last one standing on top; anyone out, by the number they went out on.
const WON = 10000;
const outScore = (number: number, turn: number) => 100 * (number + 1) + (40 - Math.min(turn, NOT_IN));

// The knockout, played out from everyone's turns, exactly as the screen plays it.
export function settleGuesses(results: { id: number; score: number }[]): { [id: number]: number } {
    const turns: { [id: number]: number[] } = {};
    results.forEach((r) => (turns[r.id] = decodeTurns(r.score)));
    const t = (id: number, n: number) => {
        const v = turns[id][n];
        return v && v > 0 && v < NOT_IN ? v : NOT_IN;
    };
    const scores: { [id: number]: number } = {};
    let field = results.map((r) => r.id);
    let reached = 0; // the number it stopped on
    for (let n = 0; n < NUMBERS && field.length > 1; n++) {
        reached = n;
        const got = field
            .map((id) => t(id, n))
            .filter((v) => v < NOT_IN)
            .sort((a, b) => a - b);
        if (got.length === 0) break; // nobody ever got it (they all ran out of time)
        const need = throughCount(field.length);
        const cutoff = got.length === 0 ? 0 : got[Math.min(need, got.length) - 1];
        const through = field.filter((id) => t(id, n) <= cutoff);
        field.filter((id) => !through.includes(id)).forEach((id) => (scores[id] = outScore(n, t(id, n))));
        field = through;
    }
    // never a tiebreaker: still level after every number, the fewest guesses overall wins
    const total = (id: number) => turns[id].reduce((a, _v, i) => a + t(id, i), 0);
    const order = [...field].sort((a, b) => total(a) - total(b) || a - b);
    order.forEach((id, i) => (scores[id] = i === 0 ? WON : outScore(reached, t(id, reached))));
    return scores;
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

// A guess, as it goes out to the other players: "number.turn.guess".
const pickOf = (number: number, turn: number, guess: number) => `${number}.${turn}.${guess}`;
function guessIn(picks: (number | string)[] | undefined, number: number, turn: number): number | undefined {
    const head = `${number}.${turn}.`;
    const p = (picks || []).find((x) => typeof x === "string" && x.startsWith(head));
    return p === undefined ? undefined : Number(String(p).slice(head.length));
}

interface Shown {
    rows: BoardRow[];
    salt: number;
    lockedNow: number; // how many have it so far (hidden)
    need: number;
    through?: number[]; // it's out: who got through
}

function GuessTheNumber(props: CompProps) {
    const info = React.useContext(StageContext);
    const me = props.human.id;
    const [secrets] = React.useState(() => secretsFrom(props.rand));
    const [noise] = React.useState(() => seededRand(Math.floor(props.rand() * 1e9)));
    const [number, setNumber] = React.useState(0); // which number (0-based)
    const [turn, setTurn] = React.useState(1);
    const [mine, setMine] = React.useState<number[]>([]); // the turn the player got each number on
    const [myTurn, setMyTurn] = React.useState<number | null>(null); // got this number, on this turn (hidden)
    const [range, setRange] = React.useState<[number, number]>([1, 100]); // for making up wrong guesses
    const [value, setValue] = React.useState("");
    const [shown, setShown] = React.useState<Shown | null>(null);
    const [pending, setPending] = React.useState<{ guess: number | null; since: number } | null>(null);
    const [now, setNow] = React.useState(Date.now());
    const sent = React.useRef(0);

    // everyone else: bots and players done (their turns known), and online, players still playing (their guesses
    // coming in)
    const known = props.opponents.map((o) => ({ id: o.hg.id, hg: o.hg, turns: decodeTurns(o.score), picks: o.picks }));
    const playing = info ? info.playing.filter((p) => !known.some((k) => k.id === p.hg.id)) : [];
    const blind = known.length === 0 && playing.length === 0 && props.participants.length > 1;
    const [field, setField] = React.useState<number[]>(() => [me, ...known.map((k) => k.id), ...playing.map((p) => p.hg.id)]);
    const lastNumber = blind ? Math.min(NUMBERS, Math.ceil(Math.log2(props.participants.length)) + 1) : NUMBERS;
    const secret = secrets[number];
    const faceOf = (id: number) =>
        id === me ? props.human : (known.find((k) => k.id === id)?.hg ?? playing.find((p) => p.hg.id === id)?.hg ?? { name: "?", imageURL: "" });
    const nameOf = (id: number) => (id === me ? "You" : faceOf(id).name);

    const { report } = props;
    React.useEffect(() => void report(encodeTurns([NOT_IN])), [report]); // so the guesses go out from the first one

    // someone else's guess on this number, on turn k: undefined while it hasn't come in, NaN for a made-up wrong one
    const theirGuess = (id: number, k: number): number | undefined => {
        const k1 = known.find((x) => x.id === id);
        if (k1) {
            const real = guessIn(k1.picks, number, k);
            if (real !== undefined) return real;
            return k1.turns[number] === k ? secret : NaN;
        }
        const p = playing.find((x) => x.hg.id === id);
        return p ? guessIn(p.picks, number, k) : NaN;
    };
    // the turn someone got this number on (up to turn `upTo`), or null
    const gotOn = (id: number, upTo: number): number | null => {
        if (id === me) return myTurn !== null && myTurn <= upTo ? myTurn : null;
        for (let k = 1; k <= upTo; k++) if (theirGuess(id, k) === secret) return k;
        return null;
    };

    // a turn: everyone still guessing shows their guess. `guess`: the player's (null: locked in already)
    const resolve = (guess: number | null, force = false): boolean => {
        const k = turn;
        const guessing = field.filter((id) => id !== me && gotOn(id, k - 1) === null);
        if (!force && guessing.some((id) => theirGuess(id, k) === undefined)) return false;
        const [lo, hi] = range;
        const next = WIDTHS[Math.min(k, WIDTHS.length - 1)];
        const guesses: { [id: number]: number | null } = {};
        guessing.forEach((id) => {
            const g = theirGuess(id, k);
            guesses[id] = g === undefined ? null : Number.isNaN(g) ? wrongGuess(noise, secret, lo, hi, next) : g;
        });
        if (guess !== null) guesses[me] = guess;
        const myT = myTurn ?? (guess === secret ? k : null);
        const got = field.filter((id) => (id === me ? myT !== null : gotOn(id, k - 1) !== null || guesses[id] === secret));
        const need = throughCount(field.length);
        const out = got.length >= need;
        let [nlo, nhi] = range;
        Object.values(guesses).forEach((x) => {
            if (x === null) return;
            if (x < secret) nlo = Math.max(nlo, x + 1);
            if (x > secret) nhi = Math.min(nhi, x - 1);
        });
        const arrow = (x: number) => (x < secret ? "⬆️" : "⬇️");
        const rows: BoardRow[] = field.map((id) => {
            const hg = faceOf(id);
            const base = { id, name: hg.name, imageURL: hg.imageURL, you: id === me };
            const g = guesses[id];
            const locked = id === me ? myTurn !== null : gotOn(id, k - 1) !== null;
            if (locked) return { ...base, answer: out ? `${secret} ✅` : "🔒", correct: out ? true : undefined };
            if (g === null || g === undefined) return { ...base, answer: "…", correct: out ? false : undefined };
            if (g === secret) return { ...base, answer: out ? `${secret} ✅` : "🤫", correct: out ? true : undefined };
            return { ...base, answer: `${g} ${arrow(g)}`, correct: out ? false : undefined };
        });
        if (myT !== null && myTurn === null) setMyTurn(myT);
        setRange([nlo, nhi]);
        setPending(null);
        if (props.pauseClock) props.pauseClock(true);
        // while it's hidden, the score so far doesn't give it away
        report(encodeTurns([...mine, out && myT !== null ? myT : NOT_IN]));
        setShown({ rows, salt: number * 10 + k, lockedNow: got.length, need, through: out ? got : undefined });
        return true;
    };

    const submit = () => {
        const g = parseInt(value, 10);
        setValue("");
        if (!(g >= 1 && g <= 100)) return;
        if (props.recordAnswer) props.recordAnswer(sent.current++, false, pickOf(number, turn, g));
        if (!resolve(g)) setPending({ guess: g, since: Date.now() });
    };
    const waitLocked = () => {
        if (!resolve(null)) setPending({ guess: null, since: Date.now() });
    };

    // online: try again as the others' guesses come in (and stop waiting on anyone who's gone quiet)
    React.useEffect(() => {
        if (!pending) return;
        if (resolve(pending.guess, Date.now() - pending.since > WAIT_MS)) return;
        const t = setTimeout(() => setNow(Date.now()), 1000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pending, info, now]);

    const carryOn = () => {
        if (!shown) return;
        if (props.pauseClock) props.pauseClock(false);
        const through = shown.through;
        if (!through) {
            setTurn(turn + 1);
            setShown(null);
            return;
        }
        if (!through.includes(me)) return props.finish(encodeTurns([...mine, NOT_IN]));
        const all = [...mine, myTurn!];
        if ((through.length === 1 && !blind) || number + 1 >= lastNumber) return props.finish(encodeTurns(all));
        setMine(all);
        setField(through);
        setNumber(number + 1);
        setTurn(1);
        setMyTurn(null);
        setRange([1, 100]);
        setShown(null);
    };

    const names = (ids: number[]) => ids.map(nameOf).join(", ");

    if (shown) {
        const through = shown.through;
        const lockedIn = myTurn !== null;
        let verdict: string;
        let label = "Next guess";
        if (!through) {
            verdict =
                shown.lockedNow === 0
                    ? "Nobody's got it yet. Guess again!"
                    : `🤫 ${shown.lockedNow} of the ${shown.need} needed ${shown.lockedNow === 1 ? "has" : "have"} got it${lockedIn ? ", you included" : ""}.`;
        } else if (blind) {
            verdict = `You got it: ${secret}, on guess ${myTurn}!`;
            label = number + 1 >= lastNumber ? "See how I did" : "Next number";
        } else if (!through.includes(me)) {
            verdict = `❌ It was ${secret}. Through: ${names(through)}. You're out.`;
            label = "See how I did";
        } else if (through.length === 1) {
            verdict = `🏆 It was ${secret}, and you're the last one standing!`;
            label = "See how I did";
        } else if (number + 1 >= lastNumber) {
            verdict = `⚖️ It was ${secret}. Still level after ${NUMBERS} numbers: the fewest guesses overall wins.`;
            label = "See how I did";
        } else {
            verdict = `✅ It was ${secret}! Through to a new number: ${names(through)}.`;
            label = "Next number";
        }
        return (
            <div className="bbb-reveal" key={shown.salt} style={{ "--done": `${boardsDoneAt(shown.salt)}s` } as React.CSSProperties}>
                <Subtle>
                    Number {number + 1}, guess {turn}
                </Subtle>
                <AnswerBoards rows={shown.rows} salt={shown.salt} />
                <div className="bbb-reveal-late">
                    <Title>{verdict}</Title>
                </div>
                <BigButton kind="success" onClick={carryOn}>
                    {label}
                </BigButton>
            </div>
        );
    }

    const others = field.filter((id) => id !== me);
    const waitingOn = pending ? others.filter((id) => gotOn(id, turn - 1) === null && theirGuess(id, turn) === undefined) : [];
    return (
        <div>
            <Title>
                Number {number + 1}, guess {turn}
            </Title>
            {others.length > 0 ? (
                <Subtle>
                    Still in: you and {names(others)}.{" "}
                    {field.length <= 3 ? "The first to get it wins." : `Once ${throughCount(field.length)} of you get it, the rest are out.`}
                </Subtle>
            ) : (
                <Subtle>Guess a number from 1 to 100.</Subtle>
            )}
            {turn > 1 && <Subtle>Remember the guesses: nobody will show you them again.</Subtle>}
            {pending ? (
                <Subtle>⏳ Waiting for {names(waitingOn)} to guess…</Subtle>
            ) : myTurn !== null ? (
                <div>
                    <Title>🤫 You've got it: {secret}.</Title>
                    <Subtle>It stays hidden until half of you have it.</Subtle>
                    <BigButton kind="success" onClick={waitLocked}>
                        Next guesses
                    </BigButton>
                </div>
            ) : (
                <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={3} submitLabel="Guess" />
            )}
        </div>
    );
}

// Final scores are settled (0 and up); what anyone hands in before that stays hidden.
export function formatGuess(score: number): string {
    if (score < 0) return "🤫";
    if (score >= WON) return "🏆 last one standing";
    return `out on number ${Math.floor(score / 100)}`;
}

export const GuessTheNumberComp: CompDefinition = {
    id: "guess-the-number",
    name: "Guess the Number",
    emoji: "💯",
    kind: "luck",
    rules:
        "A secret number from 1 to 100, and everyone guesses at once. Every guess is shown once, with higher or lower: keep track of them yourself. " +
        "Get it and you're locked in, but it stays hidden until half of you have it (40% with ten or more of you). Then those go through to a new number, and the rest are out. " +
        "Down to three or fewer, the first to get it wins (a tie on the same guess: another number).",
    maxSeconds: 600,
    Component: GuessTheNumber,
    simulate: simulateGuessTheNumber,
    botScore: (p) => encodeTurns(Array(NUMBERS).fill(clamp(Math.round(5 - 2 * p), 1, MAX_TURN))),
    format: formatGuess,
    staged: true, // online: the players in it see each other's guesses as they come in
    settle: settleGuesses,
};
