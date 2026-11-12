import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { Keypad, StageScores, sumSoFar } from "./compUi";
import { chance, clamp, gaussian, pick, Rand, randInt, sample, seededRand, shuffled } from "./random";

// ---------------- Word Scramble ----------------

const WORDS = [
    "VETO", "EVICT", "JURY", "ALLIANCE", "BACKDOOR", "NOMINATE", "DIARY", "BLINDSIDE", "FLOATER", "PAWN",
    "SHOWMANCE", "HOUSEGUEST", "ENDURANCE", "FINALE", "TIEBREAKER", "CAMPAIGN", "TARGET", "SPLIT", "BLOCK", "VOTE",
];
const SCRAMBLE_WORDS = 5;

// The words and their scrambles, the same for every player and bot.
export function generateScramble(rand: Rand) {
    return sample(rand, WORDS, SCRAMBLE_WORDS).map((w) => {
        let letters = shuffled(rand, w.split(""));
        if (letters.join("") === w) letters = [...letters.slice(1), letters[0]];
        return { word: w, letters };
    });
}

function Scramble(props: CompProps) {
    const [words] = React.useState(() => generateScramble(props.rand));
    const [index, setIndex] = React.useState(0);
    const [used, setUsed] = React.useState<number[]>([]);
    const [solved, setSolved] = React.useState(0);
    const [shake, setShake] = React.useState(false);
    const [start] = React.useState(() => performance.now());
    const current = words[index];

    const advance = (s: number) => {
        props.report(s * 100);
        if (index + 1 >= words.length) {
            const secs = (performance.now() - start) / 1000;
            props.finish(s * 100 + Math.max(0, 99 - secs * 0.5));
            return;
        }
        setIndex(index + 1);
        setUsed([]);
    };

    const tapLetter = (i: number) => {
        if (used.includes(i)) return;
        const next = [...used, i];
        setUsed(next);
        if (next.length === current.word.length) {
            const guess = next.map((n) => current.letters[n]).join("");
            if (guess === current.word) {
                setSolved(solved + 1);
                advance(solved + 1);
            } else {
                setShake(true);
                setTimeout(() => {
                    setShake(false);
                    setUsed([]);
                }, 450);
            }
        }
    };

    return (
        <div>
            <Title>
                Word {index + 1} of {words.length}, solved {solved}
            </Title>
            <div
                style={{
                    minHeight: 52,
                    fontSize: "2rem",
                    fontWeight: 800,
                    letterSpacing: 4,
                    color: shake ? "#ff6b6b" : undefined,
                    transform: shake ? "translateX(6px)" : "none",
                    transition: "transform 60ms",
                }}
            >
                {used.map((n) => current.letters[n]).join("") || "…"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, maxWidth: 420, margin: "0 auto" }}>
                {current.letters.map((l, i) => (
                    <button
                        type="button"
                        key={i}
                        className="button is-medium"
                        disabled={used.includes(i)}
                        style={{ width: 48, fontWeight: 800, touchAction: "manipulation" }}
                        onClick={() => tapLetter(i)}
                    >
                        {l}
                    </button>
                ))}
            </div>
            <div style={{ marginTop: 8 }}>
                <BigButton kind="light" onClick={() => setUsed(used.slice(0, -1))}>
                    ⌫ Undo
                </BigButton>
                <BigButton kind="warning" onClick={() => advance(solved)}>
                    Skip
                </BigButton>
            </div>
        </div>
    );
}

function simulateScramble(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same five words; longer words are harder
    const words = generateScramble(seededRand(ctx.seed));
    let solved = 0;
    let seconds = 0;
    words.forEach(({ word }) => {
        if (chance(noise, clamp(0.35 + 0.6 * skill - (word.length - 5) * 0.05, 0.05, 0.98))) {
            solved++;
            seconds += 4 + word.length * (1.2 + (1 - skill) * 2);
        } else {
            seconds += 15;
        }
    });
    return { score: solved * 100 + Math.max(0, 99 - seconds * 0.5) };
}

export const ScrambleComp: CompDefinition = {
    id: "word-scramble",
    name: "Word Scramble",
    emoji: "🔤",
    kind: "skill",
    rules: `Unscramble ${SCRAMBLE_WORDS} reality show words by tapping the letters in order. Skip any you can't get. Most words solved wins; ties go to a tiebreaker.`,
    maxSeconds: 180,
    Component: Scramble,
    simulate: simulateScramble,
    botScore: (p) => Math.round(1 + 4 * p) * 100 + p * 60,
    format: (s) => `${Math.floor(s / 100)} words`,
};

// ---------------- Odd One Out ----------------

const PAIRS = [
    ["😀", "😃"], ["🐶", "🐱"], ["🍎", "🍅"], ["⭐", "🌟"], ["😺", "😸"], ["🌕", "🌖"], ["🍩", "🍪"],
    ["🙂", "🙃"], ["🔒", "🔓"], ["🌲", "🌳"], ["🐢", "🐊"], ["🎈", "🎀"],
];

// Levels come from the comp's seed in order, so level N is the same for everyone.
export function makeOddLevel(rand: Rand, level: number) {
    const size = Math.min(7, 3 + Math.floor(level / 2));
    const [common, odd] = shuffled(rand, pick(rand, PAIRS));
    return { size, common, odd, at: randInt(rand, 0, size * size - 1) };
}

function OddOneOut(props: CompProps) {
    const { rand } = props;
    const makeLevel = React.useCallback((level: number) => makeOddLevel(rand, level), [rand]);
    const [level, setLevel] = React.useState(0);
    const [board, setBoard] = React.useState(() => makeLevel(0));
    const [score, setScore] = React.useState(0);

    const tap = (i: number) => {
        const hit = i === board.at;
        const s = score + (hit ? 1 : -1);
        setScore(s);
        props.report(s);
        if (hit) {
            setLevel(level + 1);
            setBoard(makeLevel(level + 1));
        }
    };

    return (
        <div>
            <Title>Found {score}</Title>
            <Subtle>Tap the one that's different.</Subtle>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${board.size}, 1fr)`,
                    width: "min(90vw, 380px)",
                    margin: "0 auto",
                    gap: 2,
                    fontSize: `${Math.max(1.2, 3.2 - board.size * 0.3)}rem`,
                }}
            >
                {Array.from({ length: board.size * board.size }, (_, i) => (
                    <div key={i} onPointerDown={() => tap(i)} style={{ cursor: "pointer", touchAction: "manipulation", userSelect: "none" }}>
                        {i === board.at ? board.odd : board.common}
                    </div>
                ))}
            </div>
        </div>
    );
}

function simulateOddOneOut(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same levels in the same order; bigger grids take longer to scan
    const rand = seededRand(ctx.seed);
    let time = 0;
    let found = 0;
    for (let level = 0; ; level++) {
        const board = makeOddLevel(rand, level);
        time += Math.max(0.4, (0.5 + board.size * board.size * 0.05) * (1.8 - skill) + 0.2 * gaussian(noise));
        if (time > 45) break;
        found++;
    }
    found -= Math.max(0, Math.round((1 - skill) * 2 * noise()));
    return { score: found };
}

export const OddOneOutComp: CompDefinition = {
    id: "odd-one-out",
    name: "Odd One Out",
    emoji: "🔍",
    kind: "reflex",
    rules: "A grid of identical icons hides one that's slightly different. Tap it! The grid grows every level. +1 per find, −1 per wrong tap. 45 seconds.",
    maxSeconds: 45,
    Component: OddOneOut,
    simulate: simulateOddOneOut,
    botScore: (p) => Math.round(5 + 18 * p),
    format: (s) => `${s} found`,
};

// ---------------- Maze Runner ----------------

const MAZE = 8;
const MAZE_LIMIT = 150;

type Walls = { n: boolean; s: boolean; e: boolean; w: boolean }[];

export function makeMaze(rand: () => number): Walls {
    const walls: Walls = Array.from({ length: MAZE * MAZE }, () => ({ n: true, s: true, e: true, w: true }));
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
        const c = stack[stack.length - 1];
        const r = Math.floor(c / MAZE);
        const col = c % MAZE;
        const options: [number, "n" | "s" | "e" | "w", "n" | "s" | "e" | "w"][] = [];
        if (r > 0 && !seen.has(c - MAZE)) options.push([c - MAZE, "n", "s"]);
        if (r < MAZE - 1 && !seen.has(c + MAZE)) options.push([c + MAZE, "s", "n"]);
        if (col > 0 && !seen.has(c - 1)) options.push([c - 1, "w", "e"]);
        if (col < MAZE - 1 && !seen.has(c + 1)) options.push([c + 1, "e", "w"]);
        if (options.length === 0) {
            stack.pop();
            continue;
        }
        const [next, dir, back] = pick(rand, options);
        walls[c][dir] = false;
        walls[next][back] = false;
        seen.add(next);
        stack.push(next);
    }
    return walls;
}

function MazeRunner(props: CompProps) {
    const [walls] = React.useState(() => makeMaze(props.rand));
    const [pos, setPos] = React.useState(0);
    const [start] = React.useState(() => performance.now());
    const goal = MAZE * MAZE - 1;
    const posRef = React.useRef(0);
    const { report, finish } = props;

    const move = React.useCallback(
        (dir: "n" | "s" | "e" | "w") => {
            const c = posRef.current;
            if (walls[c][dir]) return;
            const next = dir === "n" ? c - MAZE : dir === "s" ? c + MAZE : dir === "e" ? c + 1 : c - 1;
            posRef.current = next;
            setPos(next);
            const dist = (MAZE - 1 - Math.floor(next / MAZE)) + (MAZE - 1 - (next % MAZE));
            report((2 * (MAZE - 1) - dist) * 5);
            if (next === goal) finish(1000 + Math.max(0, MAZE_LIMIT - (performance.now() - start) / 1000));
        },
        [walls, goal, report, finish, start]
    );

    React.useEffect(() => {
        const keys: { [k: string]: "n" | "s" | "e" | "w" } = { ArrowUp: "n", ArrowDown: "s", ArrowLeft: "w", ArrowRight: "e" };
        const handler = (e: KeyboardEvent) => {
            if (keys[e.key]) {
                e.preventDefault();
                move(keys[e.key]);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [move]);

    const border = (on: boolean) => (on ? "2px solid #e5e7eb" : "2px solid transparent");
    const arrow = (dir: "n" | "s" | "e" | "w", label: string) => (
        <button type="button" className="button is-info is-medium" style={{ width: 64, height: 56, touchAction: "manipulation" }} onClick={() => move(dir)}>
            {label}
        </button>
    );
    return (
        <div>
            <Title>Reach the 🏁</Title>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${MAZE}, 1fr)`, width: "min(84vw, 320px)", margin: "0 auto", background: "#111827" }}>
                {walls.map((w, i) => (
                    <div
                        key={i}
                        style={{
                            ...({ aspectRatio: "1" } as any),
                            borderTop: border(w.n),
                            borderBottom: border(w.s),
                            borderLeft: border(w.w),
                            borderRight: border(w.e),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1rem",
                        }}
                    >
                        {i === pos ? "🙂" : i === goal ? "🏁" : ""}
                    </div>
                ))}
            </div>
            <div style={{ marginTop: 10 }}>
                <div>{arrow("n", "▲")}</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, margin: "6px 0" }}>
                    {arrow("w", "◀")}
                    {arrow("s", "▼")}
                    {arrow("e", "▶")}
                </div>
            </div>
        </div>
    );
}

// Length of the shortest path from the start to the flag.
export function mazePathLength(walls: Walls): number {
    const goal = MAZE * MAZE - 1;
    const dist = new Map<number, number>([[0, 0]]);
    const queue = [0];
    while (queue.length) {
        const c = queue.shift()!;
        if (c === goal) return dist.get(c)!;
        const moves: [boolean, number][] = [
            [!walls[c].n, c - MAZE],
            [!walls[c].s, c + MAZE],
            [!walls[c].e, c + 1],
            [!walls[c].w, c - 1],
        ];
        moves.forEach(([open, next]) => {
            if (open && !dist.has(next)) {
                dist.set(next, dist.get(c)! + 1);
                queue.push(next);
            }
        });
    }
    return 0;
}

function simulateMazeRunner(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same maze: a longer route takes longer, and weaker bots take more wrong turns
    const steps = mazePathLength(makeMaze(seededRand(ctx.seed)));
    const seconds = 4 + steps * (0.35 + (1 - skill) * 0.7) + 3 * gaussian(noise);
    if (seconds < MAZE_LIMIT) return { score: 1000 + (MAZE_LIMIT - Math.max(4, seconds)) };
    return { score: Math.round(40 + 30 * skill) };
}

export const MazeRunnerComp: CompDefinition = {
    id: "maze-runner",
    name: "Maze Runner",
    emoji: "🌀",
    kind: "skill",
    rules: "Guide your marker through the maze to the flag using the arrow buttons (or the arrow keys). Fastest escape wins. If time runs out, whoever got closest wins.",
    maxSeconds: MAZE_LIMIT,
    Component: MazeRunner,
    simulate: simulateMazeRunner,
    botScore: (p) => {
        const t = 25 + (1 - p) * 110;
        return t < MAZE_LIMIT ? 1000 + (MAZE_LIMIT - t) : Math.round(40 + 30 * p);
    },
    format: (s) => (s >= 1000 ? `escaped in ${Math.round(MAZE_LIMIT - (s - 1000))}s` : "didn't escape"),
};

// ---------------- Math Rush ----------------

// Questions come from the comp's seed in order, so question N is the same for everyone.
export function makeMathQuestion(rand: Rand, n: number) {
    const level = Math.min(4, Math.floor(n / 4));
    const op = pick(rand, level < 1 ? ["+", "−"] : ["+", "−", "×"]);
    const max = 10 + level * 10;
    let a = randInt(rand, 2, op === "×" ? 6 + level * 2 : max);
    let b = randInt(rand, 2, op === "×" ? 9 : max);
    if (op === "−" && b > a) [a, b] = [b, a];
    const answer = op === "+" ? a + b : op === "−" ? a - b : a * b;
    const wrong = new Set<number>();
    while (wrong.size < 2) {
        const w = answer + pick(rand, [-10, -2, -1, 1, 2, 10]);
        if (w !== answer && w >= 0) wrong.add(w);
    }
    return { text: `${a} ${op} ${b}`, op, answer, options: shuffled(rand, [answer, ...Array.from(wrong)]) };
}

function MathRush(props: CompProps) {
    const { rand } = props;
    const make = React.useCallback((n: number) => makeMathQuestion(rand, n), [rand]);
    const [n, setN] = React.useState(0);
    const [q, setQ] = React.useState(() => make(0));
    const [score, setScore] = React.useState(0);
    const answer = (v: number) => {
        const s = score + (v === q.answer ? 1 : -1);
        setScore(s);
        props.report(s);
        setN(n + 1);
        setQ(make(n + 1));
    };
    return (
        <div>
            <Title>Score: {score}</Title>
            <div style={{ fontSize: "3rem", fontWeight: 800, margin: "16px 0" }}>{q.text} = ?</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                {q.options.map((o) => (
                    <button type="button" key={o} className="button is-large" style={{ minWidth: 90, touchAction: "manipulation" }} onClick={() => answer(o)}>
                        {o}
                    </button>
                ))}
            </div>
        </div>
    );
}

function simulateMathRush(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same questions in the same order; multiplication is slower and trickier
    const rand = seededRand(ctx.seed);
    let time = 0;
    let score = 0;
    for (let n = 0; ; n++) {
        const q = makeMathQuestion(rand, n);
        const times = q.op === "×";
        time += Math.max(0.5, 1.0 + (1 - skill) * 2.2 + (times ? 0.6 : 0) + 0.25 * gaussian(noise));
        if (time > 60) break;
        score += chance(noise, 0.82 + 0.17 * skill - (times ? 0.05 : 0)) ? 1 : -1;
    }
    return { score };
}

export const MathRushComp: CompDefinition = {
    id: "math-rush",
    name: "Math Rush",
    emoji: "➗",
    kind: "skill",
    rules: "Answer as many math problems as you can in 60 seconds. +1 if right, −1 if wrong. They get harder as you go.",
    maxSeconds: 60,
    Component: MathRush,
    simulate: simulateMathRush,
    botScore: (p) => Math.round(5 + 22 * p),
    format: (s) => `${s} points`,
};

// ---------------- Guess the Number ----------------

const GUESS_ROUNDS = 3;

function GuessTheNumber(props: CompProps) {
    const [secrets] = React.useState(() => Array.from({ length: GUESS_ROUNDS }, () => randInt(props.rand, 1, 100)));
    const [round, setRound] = React.useState(0);
    const [value, setValue] = React.useState("");
    const [guesses, setGuesses] = React.useState(0);
    const [hint, setHint] = React.useState("Guess a number from 1 to 100.");
    const [range, setRange] = React.useState<[number, number]>([1, 100]);
    const [before, setBefore] = React.useState(0); // guesses on the numbers already found
    const [found, setFound] = React.useState<number | null>(null); // the scores after finding a number

    const submit = () => {
        const g = parseInt(value, 10);
        const total = guesses + 1;
        setGuesses(total);
        setValue("");
        const secret = secrets[round];
        if (g === secret) {
            if (props.recordAnswer) props.recordAnswer(round, true, total - before);
            if (round + 1 >= GUESS_ROUNDS) {
                props.finish(-total);
                return;
            }
            props.report(-(total + (GUESS_ROUNDS - round - 1) * 10));
            if (props.pauseClock) props.pauseClock(true);
            setFound(secret);
        } else {
            props.report(-(total + (GUESS_ROUNDS - round) * 10));
            if (g < secret) {
                setRange([Math.max(range[0], g + 1), range[1]]);
                setHint(`${g} is too LOW ⬆️`);
            } else {
                setRange([range[0], Math.min(range[1], g - 1)]);
                setHint(`${g} is too HIGH ⬇️`);
            }
        }
    };
    const nextNumber = () => {
        if (props.pauseClock) props.pauseClock(false);
        setHint(`Got it: ${found}! New number, 1 to 100.`);
        setFound(null);
        setBefore(guesses);
        setRound(round + 1);
        setRange([1, 100]);
    };
    if (found !== null) {
        return (
            <div>
                <Title>
                    Got it: {found}, in {guesses - before} {guesses - before === 1 ? "guess" : "guesses"}!
                </Title>
                <StageScores done={round + 1} />
                <BigButton kind="success" onClick={nextNumber}>
                    Next number
                </BigButton>
            </div>
        );
    }
    return (
        <div>
            <Title>
                Number {round + 1} of {GUESS_ROUNDS}, {guesses} guesses so far
            </Title>
            <Subtle>{hint}</Subtle>
            <Subtle>
                It's between {range[0]} and {range[1]}.
            </Subtle>
            <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={3} submitLabel="Guess" />
        </div>
    );
}

function simulateGuessTheNumber(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same secret numbers; good bots binary-search, weaker ones guess sloppily
    const rand = seededRand(ctx.seed);
    const secrets = Array.from({ length: GUESS_ROUNDS }, () => randInt(rand, 1, 100));
    let guesses = 0;
    const picks: number[] = [];
    secrets.forEach((secret) => {
        const before = guesses;
        let lo = 1;
        let hi = 100;
        for (let k = 0; k < 30; k++) {
            guesses++;
            const g = clamp(Math.round((lo + hi) / 2 + gaussian(noise) * (1 - skill) * 12), lo, hi);
            if (g === secret) break;
            if (g < secret) lo = g + 1;
            else hi = g - 1;
        }
        picks.push(guesses - before);
    });
    return { score: -guesses, answers: picks.map(() => true), picks };
}

export const GuessTheNumberComp: CompDefinition = {
    id: "guess-the-number",
    name: "Guess the Number",
    emoji: "💯",
    kind: "skill",
    rules: `Find ${GUESS_ROUNDS} secret numbers between 1 and 100. After each guess you're told higher or lower. Fewest total guesses wins.`,
    maxSeconds: 150,
    Component: GuessTheNumber,
    simulate: simulateGuessTheNumber,
    botScore: (p) => -Math.round(16 + (1 - p) * 10),
    format: (s) => `${-s} guesses`,
    progress: (r, n) => -sumSoFar(r, n),
};
