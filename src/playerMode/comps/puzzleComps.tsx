import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps } from "./compTypes";
import { Keypad } from "./compUi";
import { pick, randInt, sample, shuffled } from "./random";

// ---------------- Word Scramble ----------------

const WORDS = [
    "VETO", "EVICT", "JURY", "ALLIANCE", "BACKDOOR", "NOMINATE", "DIARY", "BLINDSIDE", "FLOATER", "PAWN",
    "SHOWMANCE", "HOUSEGUEST", "ENDURANCE", "FINALE", "TIEBREAKER", "CAMPAIGN", "TARGET", "SPLIT", "BLOCK", "VOTE",
];
const SCRAMBLE_WORDS = 5;

function Scramble(props: CompProps) {
    const [words] = React.useState(() =>
        sample(props.rand, WORDS, SCRAMBLE_WORDS).map((w) => {
            let letters = shuffled(props.rand, w.split(""));
            if (letters.join("") === w) letters = [...letters.slice(1), letters[0]];
            return { word: w, letters };
        })
    );
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

export const ScrambleComp: CompDefinition = {
    id: "word-scramble",
    name: "Word Scramble",
    emoji: "🔤",
    kind: "skill",
    rules: `Unscramble ${SCRAMBLE_WORDS} Big Brother words by tapping the letters in order. Skip any you can't get. Most words solved wins; ties go to the fastest.`,
    maxSeconds: 180,
    Component: Scramble,
    botScore: (p) => Math.round(1 + 4 * p) * 100 + p * 60,
    format: (s) => `${Math.floor(s / 100)} words`,
};

// ---------------- Odd One Out ----------------

const PAIRS = [
    ["😀", "😃"], ["🐶", "🐱"], ["🍎", "🍅"], ["⭐", "🌟"], ["😺", "😸"], ["🌕", "🌖"], ["🍩", "🍪"],
    ["🙂", "🙃"], ["🔒", "🔓"], ["🌲", "🌳"], ["🐢", "🐊"], ["🎈", "🎀"],
];

function OddOneOut(props: CompProps) {
    const makeLevel = React.useCallback(
        (level: number) => {
            const size = Math.min(7, 3 + Math.floor(level / 2));
            const [common, odd] = shuffled(props.rand, pick(props.rand, PAIRS));
            return { size, common, odd, at: randInt(props.rand, 0, size * size - 1) };
        },
        [props.rand]
    );
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

export const OddOneOutComp: CompDefinition = {
    id: "odd-one-out",
    name: "Odd One Out",
    emoji: "🔍",
    kind: "reflex",
    rules: "A grid of identical icons hides one that's slightly different. Tap it! The grid grows every level. +1 per find, −1 per wrong tap. 45 seconds.",
    maxSeconds: 45,
    Component: OddOneOut,
    botScore: (p) => Math.round(5 + 18 * p),
    format: (s) => `${s} found`,
};

// ---------------- Maze Runner ----------------

const MAZE = 8;
const MAZE_LIMIT = 150;

type Walls = { n: boolean; s: boolean; e: boolean; w: boolean }[];

function makeMaze(rand: () => number): Walls {
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

export const MazeRunnerComp: CompDefinition = {
    id: "maze-runner",
    name: "Maze Runner",
    emoji: "🌀",
    kind: "skill",
    rules: "Guide your marker through the maze to the flag using the arrow buttons (or the arrow keys). Fastest escape wins. If time runs out, whoever got closest wins.",
    maxSeconds: MAZE_LIMIT,
    Component: MazeRunner,
    botScore: (p) => {
        const t = 25 + (1 - p) * 110;
        return t < MAZE_LIMIT ? 1000 + (MAZE_LIMIT - t) : Math.round(40 + 30 * p);
    },
    format: (s) => (s >= 1000 ? `escaped in ${Math.round(MAZE_LIMIT - (s - 1000))}s` : "didn't escape"),
};

// ---------------- Math Rush ----------------

function MathRush(props: CompProps) {
    const make = React.useCallback(
        (n: number) => {
            const level = Math.min(4, Math.floor(n / 4));
            const op = pick(props.rand, level < 1 ? ["+", "−"] : ["+", "−", "×"]);
            const max = 10 + level * 10;
            let a = randInt(props.rand, 2, op === "×" ? 6 + level * 2 : max);
            let b = randInt(props.rand, 2, op === "×" ? 9 : max);
            if (op === "−" && b > a) [a, b] = [b, a];
            const answer = op === "+" ? a + b : op === "−" ? a - b : a * b;
            const wrong = new Set<number>();
            while (wrong.size < 2) {
                const w = answer + pick(props.rand, [-10, -2, -1, 1, 2, 10]);
                if (w !== answer && w >= 0) wrong.add(w);
            }
            return { text: `${a} ${op} ${b}`, answer, options: shuffled(props.rand, [answer, ...Array.from(wrong)]) };
        },
        [props.rand]
    );
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

export const MathRushComp: CompDefinition = {
    id: "math-rush",
    name: "Math Rush",
    emoji: "➗",
    kind: "skill",
    rules: "Answer as many math problems as you can in 60 seconds. +1 if right, −1 if wrong. They get harder as you go.",
    maxSeconds: 60,
    Component: MathRush,
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

    const submit = () => {
        const g = parseInt(value, 10);
        const total = guesses + 1;
        setGuesses(total);
        setValue("");
        const secret = secrets[round];
        if (g === secret) {
            if (round + 1 >= GUESS_ROUNDS) {
                props.finish(-total);
                return;
            }
            props.report(-(total + (GUESS_ROUNDS - round - 1) * 10));
            setRound(round + 1);
            setRange([1, 100]);
            setHint(`Got it: ${secret}! New number, 1 to 100.`);
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

export const GuessTheNumberComp: CompDefinition = {
    id: "guess-the-number",
    name: "Guess the Number",
    emoji: "💯",
    kind: "skill",
    rules: `Find ${GUESS_ROUNDS} secret numbers between 1 and 100. After each guess you're told higher or lower. Fewest total guesses wins.`,
    maxSeconds: 150,
    Component: GuessTheNumber,
    botScore: (p) => -Math.round(16 + (1 - p) * 10),
    format: (s) => `${-s} guesses`,
};
