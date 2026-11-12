import React from "react";
import { Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, guessFrom, KnockoutPause, Keypad, Reveal, revealRows, sleep, rightSoFar, sumSoFar, useQuizClock, useRivalsPlaying } from "./compUi";
import { chance, clamp, gaussian, pick, Rand, randInt, sample, seededRand, shuffled } from "./random";

const EMOJIS = ["🍕", "🎸", "👑", "🔑", "🐍", "💎", "🎲", "🧸", "🍩", "🚀", "🌵", "🎩"];

// ---------------- Simon Says ----------------

const PADS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];

function SimonSays(props: CompProps) {
    const rivals = useRivalsPlaying(); // online: other players still playing
    const [sequence] = React.useState(() => Array.from({ length: 40 }, () => randInt(props.rand, 0, 3)));
    const [level, setLevel] = React.useState(3);
    const [lit, setLit] = React.useState<number | null>(null);
    const [showing, setShowing] = React.useState(true);
    const [input, setInput] = React.useState(0);
    const [cleared, setCleared] = React.useState<number | null>(null); // between rounds: who's out
    const alive = React.useRef(true);

    React.useEffect(() => () => void (alive.current = false), []);
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setShowing(true);
            await sleep(700);
            const on = Math.max(260, 480 - level * 15);
            for (let i = 0; i < level && !cancelled; i++) {
                setLit(sequence[i]);
                await sleep(on);
                setLit(null);
                await sleep(160);
            }
            if (!cancelled) {
                setShowing(false);
                setInput(0);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [level, sequence]);

    const tap = (pad: number) => {
        if (showing) return;
        setLit(pad);
        setTimeout(() => alive.current && setLit(null), 150);
        if (pad !== sequence[input]) {
            props.finish(level - 1);
            return;
        }
        if (input + 1 === level) {
            props.report(level);
            if (props.opponents.length > 0 || rivals) {
                if (props.pauseClock) props.pauseClock(true);
                setCleared(level);
            } else setLevel(level + 1);
        } else {
            setInput(input + 1);
        }
    };

    if (cleared !== null) {
        return (
            <KnockoutPause
                opponents={props.opponents}
                cleared={cleared}
                first={cleared === 3}
                what={(n) => `sequence of ${n}`}
                onNext={() => {
                    if (props.pauseClock) props.pauseClock(false);
                    setCleared(null);
                    setLevel(cleared + 1);
                }}
            />
        );
    }
    return (
        <div>
            <Title>Sequence of {level}</Title>
            <Subtle>{showing ? "Watch closely…" : `Your turn: ${input}/${level}`}</Subtle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "min(80vw, 300px)", margin: "0 auto" }}>
                {PADS.map((c, i) => (
                    <div
                        key={i}
                        onPointerDown={() => tap(i)}
                        style={{
                            ...({ aspectRatio: "1" } as any),
                            borderRadius: 18,
                            background: c,
                            opacity: lit === i ? 1 : 0.35,
                            transform: lit === i ? "scale(1.04)" : "none",
                            transition: "opacity 80ms, transform 80ms",
                            touchAction: "manipulation",
                            cursor: showing ? "default" : "pointer",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function simulateSimonSays(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the longest sequence this bot repeats correctly
    return { score: clamp(Math.round(2 + 10 * skill + 1.5 * gaussian(noise)), 0, 39) };
}

export const SimonSaysComp: CompDefinition = {
    id: "simon-says",
    name: "Simon Says",
    emoji: "🟩",
    kind: "memory",
    rules: "Watch the pads light up, then tap them back in the same order. Each round adds one more. One mistake and you're out. The longest sequence wins.",
    maxSeconds: 180,
    Component: SimonSays,
    simulate: simulateSimonSays,
    botScore: (p) => 2 + Math.round(10 * p),
    format: (s) => `sequence of ${s}`,
    staged: true,
};

// ---------------- Concentration ----------------

const CONC_LIMIT = 180;

// The face-down deck, the same for every player and bot.
export function generateConcentrationDeck(rand: Rand): string[] {
    const icons = sample(rand, EMOJIS, 6);
    return shuffled(rand, [...icons, ...icons]);
}

function Concentration(props: CompProps) {
    const [cards] = React.useState(() => generateConcentrationDeck(props.rand));
    const [open, setOpen] = React.useState<number[]>([]);
    const [matched, setMatched] = React.useState<Set<number>>(new Set());
    const [start] = React.useState(() => performance.now());
    const busy = open.length === 2;

    const flip = (i: number) => {
        if (busy || open.includes(i) || matched.has(i)) return;
        const next = [...open, i];
        setOpen(next);
        if (next.length === 2) {
            if (cards[next[0]] === cards[next[1]]) {
                const m = new Set(matched);
                next.forEach((n) => m.add(n));
                setMatched(m);
                setOpen([]);
                props.report((m.size / 2) * 10);
                if (m.size === cards.length) {
                    props.finish(1000 + Math.max(0, CONC_LIMIT - (performance.now() - start) / 1000));
                }
            } else {
                setTimeout(() => setOpen([]), 700);
            }
        }
    };

    return (
        <div>
            <Title>{matched.size / 2} of 6 pairs</Title>
            <Subtle>Flip two cards at a time and find all the matching pairs.</Subtle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, width: "min(88vw, 360px)", margin: "0 auto" }}>
                {cards.map((c, i) => {
                    const shown = open.includes(i) || matched.has(i);
                    return (
                        <button
                            type="button"
                            key={i}
                            onClick={() => flip(i)}
                            className="bbb-card-flip"
                            style={{
                                ...({ aspectRatio: "3 / 4" } as any),
                                fontSize: "2rem",
                                borderRadius: 10,
                                border: "none",
                                background: matched.has(i) ? "#1f4d2c" : shown ? "#2c3e66" : "linear-gradient(135deg, #6d28d9, #db2777)",
                                color: "white",
                                touchAction: "manipulation",
                                cursor: "pointer",
                            }}
                        >
                            {shown ? c : "?"}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function simulateConcentration(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the bot plays the actual deck, remembering cards it has seen (better memory with more skill)
    const deck = generateConcentrationDeck(seededRand(ctx.seed));
    const memory = clamp(0.4 + 0.55 * skill + 0.05 * gaussian(noise), 0.1, 0.99);
    const known = new Map<number, string>();
    const matched = new Set<number>();
    const unseen = () => deck.map((_, i) => i).filter((i) => !matched.has(i) && !known.has(i));
    const see = (i: number) => chance(noise, memory) && known.set(i, deck[i]);
    let turns = 0;
    while (matched.size < deck.length && turns < 200) {
        turns++;
        // a pair we already know?
        const pair = Array.from(known.entries()).find(
            ([i, icon]) => !matched.has(i) && Array.from(known.entries()).some(([j, other]) => j !== i && other === icon && !matched.has(j))
        );
        if (pair) {
            const [i, icon] = pair;
            const j = Array.from(known.entries()).find(([k, other]) => k !== i && other === icon && !matched.has(k))![0];
            matched.add(i).add(j);
            known.delete(i);
            known.delete(j);
            continue;
        }
        const options = unseen();
        const a = options.length ? options[Math.floor(noise() * options.length)] : deck.findIndex((_, i) => !matched.has(i));
        const remembered = Array.from(known.entries()).find(([k, icon]) => k !== a && icon === deck[a] && !matched.has(k));
        const rest = unseen().filter((i) => i !== a);
        const b = remembered ? remembered[0] : rest.length ? rest[Math.floor(noise() * rest.length)] : deck.findIndex((_, i) => i !== a && !matched.has(i));
        if (deck[a] === deck[b]) {
            matched.add(a).add(b);
            known.delete(a);
            known.delete(b);
        } else {
            see(a);
            see(b);
        }
    }
    const seconds = turns * (1.6 + (1 - skill) * 0.8);
    if (matched.size === deck.length && seconds < CONC_LIMIT) return { score: 1000 + (CONC_LIMIT - seconds) };
    return { score: Math.floor(matched.size / 2) * 10 };
}

export const ConcentrationComp: CompDefinition = {
    id: "concentration",
    name: "Concentration",
    emoji: "🃏",
    kind: "memory",
    rules: "Twelve face-down cards hide six pairs. Flip two at a time to find matches. Clear the board fastest to win.",
    maxSeconds: CONC_LIMIT,
    Component: Concentration,
    simulate: simulateConcentration,
    botScore: (p) => {
        const t = 25 + (1 - p) * 130;
        return t < CONC_LIMIT ? 1000 + (CONC_LIMIT - t) : Math.round(2 + 3 * p) * 10;
    },
    format: (s) => (s >= 1000 ? `cleared in ${Math.round(CONC_LIMIT - (s - 1000))}s` : `${s / 10} pairs`),
};

// ---------------- Digit Span ----------------

function DigitSpan(props: CompProps) {
    const rivals = useRivalsPlaying(); // online: other players still playing
    const [length, setLength] = React.useState(4);
    const [digits, setDigits] = React.useState(() => Array.from({ length: 4 }, () => randInt(props.rand, 0, 9)).join(""));
    const [phase, setPhase] = React.useState<"show" | "enter">("show");
    const [value, setValue] = React.useState("");
    const [cleared, setCleared] = React.useState<number | null>(null); // between rounds: who's out

    React.useEffect(() => {
        if (phase !== "show") return;
        const t = setTimeout(() => setPhase("enter"), 700 + length * 550);
        return () => clearTimeout(t);
    }, [phase, length]);

    const submit = () => {
        if (value !== digits) {
            props.finish(length - 1);
            return;
        }
        props.report(length);
        if (props.opponents.length > 0 || rivals) {
            if (props.pauseClock) props.pauseClock(true);
            setCleared(length);
        } else nextRound();
    };
    const nextRound = () => {
        const n = length + 1;
        setLength(n);
        setDigits(Array.from({ length: n }, () => randInt(props.rand, 0, 9)).join(""));
        setValue("");
        setPhase("show");
    };

    if (cleared !== null) {
        return (
            <KnockoutPause
                opponents={props.opponents}
                cleared={cleared}
                first={cleared === 4}
                what={(n) => `${n} digits`}
                onNext={() => {
                    if (props.pauseClock) props.pauseClock(false);
                    setCleared(null);
                    nextRound();
                }}
            />
        );
    }

    return (
        <div>
            <Title>{length} digits</Title>
            {phase === "show" ? (
                <div style={{ fontSize: "3rem", fontFamily: "monospace", letterSpacing: 6, margin: "24px 0" }}>{digits}</div>
            ) : (
                <div>
                    <Subtle>Type the number you saw.</Subtle>
                    <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={length} />
                </div>
            )}
        </div>
    );
}

function simulateDigitSpan(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    return { score: clamp(Math.round(4 + 6 * skill + gaussian(noise)), 3, 15) };
}

export const DigitSpanComp: CompDefinition = {
    id: "digit-span",
    name: "Digit Span",
    emoji: "🔟",
    kind: "memory",
    rules: "A number flashes on screen. Type it back from memory. Each round adds a digit, and one mistake ends your run. The longest number wins.",
    maxSeconds: 180,
    Component: DigitSpan,
    simulate: simulateDigitSpan,
    botScore: (p) => 4 + Math.round(6 * p),
    format: (s) => `${s} digits`,
    staged: true,
};

// ---------------- Count 'Em ----------------

const COUNT_ROUNDS = 5;
const COUNT_LOOK_SECONDS = 5; // how long each pile stays up

// The piles and the questions, the same for every player and bot.
export function generateCountRounds(rand: Rand) {
    return Array.from({ length: COUNT_ROUNDS }, (_, r) => {
        const types = sample(rand, EMOJIS, 4);
        const size = 20 + r * 4;
        const grid = Array.from({ length: size }, () => pick(rand, types));
        const target = pick(rand, types);
        return { grid, target, answer: grid.filter((g) => g === target).length };
    });
}

function CountEm(props: CompProps) {
    const [rounds] = React.useState(() => generateCountRounds(props.rand));
    const [round, setRound] = React.useState(0);
    const [phase, setPhase] = React.useState<"show" | "answer" | "feedback">("show");
    const [value, setValue] = React.useState("");
    const [errors, setErrors] = React.useState<number[]>([]);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);

    React.useEffect(() => {
        if (phase !== "show") return;
        const t = setTimeout(() => setPhase("answer"), COUNT_LOOK_SECONDS * 1000);
        return () => clearTimeout(t);
    }, [phase]);

    const r = rounds[round];
    const submit = () => {
        const said = parseInt(value, 10) || 0;
        const miss = Math.abs(said - r.answer);
        const errs = [...errors, miss];
        setErrors(errs);
        if (props.recordAnswer) props.recordAnswer(round, miss === 0, miss);
        if (props.pauseClock) props.pauseClock(true);
        const total = errs.reduce((a, b) => a + b, 0);
        props.report(-(total + (COUNT_ROUNDS - errs.length) * 10));
        // what everyone said: bots are known by how far off they were
        const off = (m: number) => (m === 0 ? "spot on" : `${m} off`);
        setReveal({
            index: round,
            verdict: miss === 0 ? "🎯 Spot on!" : `You were ${miss} off`,
            correctText: (
                <>
                    <b>{r.answer}</b> <span style={{ fontSize: "1.4rem" }}>{r.target}</span>
                </>
            ),
            rows: revealRows(props, round, { correct: miss === 0, answer: `${said} (${off(miss)})` }, (_ok, pick, id) => {
                const m = Number(pick) || 0;
                return `${guessFrom(r.answer, m, `count:${round}:${id}`)} (${off(m)})`;
            }),
        });
        setPhase("feedback");
    };
    const next = () => {
        if (props.pauseClock) props.pauseClock(false);
        if (round + 1 >= COUNT_ROUNDS) {
            props.finish(-errors.reduce((a, b) => a + b, 0));
            return;
        }
        setRound(round + 1);
        setValue("");
        setPhase("show");
    };

    return (
        <div>
            <Title>
                Round {round + 1} of {COUNT_ROUNDS}
            </Title>
            {phase === "show" && (
                <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 360, margin: "0 auto", fontSize: "1.8rem" }}>
                    {r.grid.map((g, i) => (
                        <span key={i} style={{ width: "16.6%" }}>
                            {g}
                        </span>
                    ))}
                </div>
            )}
            {phase === "answer" && (
                <div>
                    <Subtle>
                        How many <span style={{ fontSize: "1.8rem" }}>{r.target}</span> were there?
                    </Subtle>
                    <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={2} />
                </div>
            )}
            {phase === "feedback" && reveal && <AnswerReveal reveal={reveal} last={round + 1 >= COUNT_ROUNDS} onNext={next} nextLabel="Next round" />}
        </div>
    );
}

function simulateCountEm(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // same piles: bigger counts are harder to get exactly right
    const rounds = generateCountRounds(seededRand(ctx.seed));
    const misses = rounds.map((r) => Math.round(Math.abs(gaussian(noise)) * (0.3 + (1 - skill) * 2.5) * (r.answer / 6)));
    return { score: -misses.reduce((a, b) => a + b, 0), answers: misses.map((m) => m === 0), picks: misses };
}

export const CountEmComp: CompDefinition = {
    id: "count-em",
    name: "Count 'Em",
    emoji: "🧮",
    kind: "memory",
    rules: `${COUNT_ROUNDS} rounds. A pile of items flashes for ${COUNT_LOOK_SECONDS} seconds, then you're asked how many of one kind there were. The smallest total error wins.`,
    maxSeconds: 150,
    Component: CountEm,
    simulate: simulateCountEm,
    botScore: (p) => -Math.round((1 - p) * 14),
    format: (s) => `${-s} off in total`,
    progress: (r, n) => -sumSoFar(r, n),
};

// ---------------- Find the Key ----------------

const KEY_ROUNDS = 5;
const SLOTS = 3;

function FindTheKey(props: CompProps) {
    const [round, setRound] = React.useState(0);
    const [slots, setSlots] = React.useState([0, 1, 2]); // slots[cup] = position
    const [keyCup, setKeyCup] = React.useState(0);
    const [phase, setPhase] = React.useState<"reveal" | "shuffle" | "pick" | "result">("reveal");
    const [picked, setPicked] = React.useState<number | null>(null);
    const [correct, setCorrect] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    // during a swap, one box lifts over the top (-1) and the other dips underneath (+1), so they never
    // slide through each other and you can always follow the one with the key
    const [lift, setLift] = React.useState([0, 0, 0]);
    const [stepMs, setStepMs] = React.useState(180);
    const { rand, report, finish, recordAnswer, pauseClock } = props;
    const clock = useQuizClock(pauseClock);

    // One round: show the key, shuffle, then let the player pick. This runs once per round. (It used to
    // re-run on every phase change, which cancelled the shuffle after one swap and left the round stuck.)
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const cup = randInt(rand, 0, SLOTS - 1);
            setSlots([0, 1, 2]);
            setKeyCup(cup);
            setPicked(null);
            setPhase("reveal");
            await sleep(1300);
            if (cancelled) return;
            setPhase("shuffle");
            const swaps = 4 + round * 2;
            const ms = Math.max(200, 520 - round * 75);
            // each swap is three moves: lift apart, cross, settle back into the row
            const step = Math.max(110, Math.round(ms / 3));
            setStepMs(step);
            setLift([0, 0, 0]);
            let current = [0, 1, 2];
            for (let i = 0; i < swaps; i++) {
                if (cancelled) return;
                const a = randInt(rand, 0, SLOTS - 1);
                const b = (a + randInt(rand, 1, SLOTS - 1)) % SLOTS;
                const next = [...current];
                const cupA = next.indexOf(a);
                const cupB = next.indexOf(b);
                // the box heading right goes over the top; the one heading left goes underneath
                const lifted = [0, 0, 0];
                lifted[a < b ? cupA : cupB] = -1;
                lifted[a < b ? cupB : cupA] = 1;
                setLift(lifted);
                await sleep(step);
                if (cancelled) return;
                next[cupA] = b;
                next[cupB] = a;
                current = next;
                setSlots(next);
                await sleep(step);
                if (cancelled) return;
                setLift([0, 0, 0]);
                await sleep(step);
            }
            if (!cancelled) setPhase("pick");
        })();
        return () => {
            cancelled = true;
        };
    }, [round, rand]);

    const choose = (cup: number) => {
        if (phase !== "pick") return;
        setPicked(cup);
        const right = cup === keyCup;
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        report(c);
        if (recordAnswer) recordAnswer(round, right);
        setPhase("result");
        clock.pause();
        setReveal({
            index: round,
            verdict: right ? "🔑 You found it!" : "📦 Wrong box!",
            correctText: "the box with the key",
            rows: revealRows(props, round, { correct: right, answer: right ? "found it" : "wrong box" }, (ok) =>
                ok ? "found it" : "wrong box"
            ),
        });
    };

    const next = () => {
        setReveal(null);
        clock.resume();
        if (round + 1 >= KEY_ROUNDS) finish(correct);
        else setRound(round + 1);
    };

    const showKey = phase === "reveal" || phase === "result";
    return (
        <div>
            <Title>
                Round {round + 1} of {KEY_ROUNDS}, found {correct}
            </Title>
            <Subtle>
                {phase === "reveal"
                    ? "Watch where the key is…"
                    : phase === "shuffle"
                    ? "Keep your eye on it!"
                    : phase === "pick"
                    ? "Which box has the key?"
                    : picked === keyCup
                    ? "You found it!"
                    : "Wrong box!"}
            </Subtle>
            <div style={{ position: "relative", height: 250, width: "min(90vw, 360px)", margin: "0 auto" }}>
                {[0, 1, 2].map((cup) => (
                    <button
                        type="button"
                        key={cup}
                        aria-label={`Box ${slots[cup] + 1}`}
                        onClick={() => choose(cup)}
                        disabled={phase !== "pick"}
                        style={{
                            position: "absolute",
                            left: `${slots[cup] * 33.3 + 1.5}%`,
                            width: "30%",
                            top: 70,
                            transform: `translateY(${lift[cup] * 62}px) scale(${lift[cup] === -1 ? 1.06 : lift[cup] === 1 ? 0.94 : 1})`,
                            zIndex: lift[cup] === -1 ? 2 : lift[cup] === 1 ? 0 : 1,
                            height: 110,
                            transition: `left ${stepMs}ms ease-in-out, transform ${stepMs}ms ease-in-out`,
                            borderRadius: 14,
                            border: "none",
                            color: "inherit",
                            opacity: 1,
                            background: picked === cup ? "#7c3aed" : "linear-gradient(180deg, #f59e0b, #b45309)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "2.6rem",
                            cursor: phase === "pick" ? "pointer" : "default",
                            touchAction: "manipulation",
                            boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                        }}
                    >
                        {showKey && cup === keyCup ? "🔑" : "📦"}
                    </button>
                ))}
            </div>
            {reveal && <AnswerReveal reveal={reveal} last={round + 1 >= KEY_ROUNDS} onNext={next} />}
        </div>
    );
}

function simulateFindTheKey(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    // each round has more and faster shuffles, the same as for players
    const answers: boolean[] = [];
    for (let round = 0; round < KEY_ROUNDS; round++) {
        const p = clamp(0.98 - (1 - skill) * 0.25 - round * 0.08 * (1 - skill), 1 / SLOTS, 0.98);
        answers.push(chance(noise, p));
    }
    return { score: answers.filter(Boolean).length, answers };
}

export const FindTheKeyComp: CompDefinition = {
    id: "find-the-key",
    name: "Find the Key",
    emoji: "🔑",
    kind: "memory",
    rules: `A key goes in one of three boxes, then the boxes shuffle. Pick the box with the key. ${KEY_ROUNDS} rounds, and the shuffles get faster. Most keys found wins.`,
    maxSeconds: 120,
    Component: FindTheKey,
    simulate: simulateFindTheKey,
    botScore: (p) => Math.round(1 + 4 * p),
    format: (s) => `${s} of ${KEY_ROUNDS} found`,
    progress: (r, n) => rightSoFar(r, n),
};
