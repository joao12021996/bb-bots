import React from "react";
import { BigButton, formatSeconds, pressable, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, Reveal, revealRows, sumSoFar, useAnimationFrame } from "./compUi";
import { chance, clamp, gaussian, Rand, randInt, seededRand, shuffled } from "./random";

// Two more luck comps (Mystery Doors, Lucky Dice) and two more endurance comps (Roll Call, Hot Hands).
// Like every comp, each one is dealt from the comp's seed, so every player and bot gets the same doors, dice
// and timings.

// ---------------- Mystery Doors ----------------

const DOOR_ROUNDS = 6;
const DOORS = 3;

// What's behind each door, each round: a big prize, a small one and nothing, in a random order.
export function doorRounds(rand: Rand): number[][] {
    return Array.from({ length: DOOR_ROUNDS }, () => shuffled(rand, [randInt(rand, 8, 12), randInt(rand, 2, 5), 0]));
}

function MysteryDoors(props: CompProps) {
    const [rounds] = React.useState(() => doorRounds(props.rand));
    const [i, setI] = React.useState(0);
    const [score, setScore] = React.useState(0);
    const [picked, setPicked] = React.useState<number | null>(null);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);

    const open = (door: number) => {
        if (picked !== null) return;
        const won = rounds[i][door];
        const s = score + won;
        setPicked(door);
        setScore(s);
        if (props.recordAnswer) props.recordAnswer(i, won > 0, won);
        props.report(s);
        if (props.pauseClock) props.pauseClock(true);
        const best = Math.max(...rounds[i]);
        setReveal({
            index: i,
            verdict: won === best ? `🎉 The big one: ${won} points!` : won > 0 ? `👍 ${won} points` : "🕸️ Nothing behind that one",
            correctText: <b>door {rounds[i].indexOf(best) + 1} had {best} points</b>,
            answerLabel: "The best door",
            rows: revealRows(props, i, { correct: won > 0, answer: `${won} points` }, (_ok, pick) => `${Number(pick) || 0} points`),
        });
    };
    const next = () => {
        if (props.pauseClock) props.pauseClock(false);
        setReveal(null);
        setPicked(null);
        if (i + 1 >= DOOR_ROUNDS) props.finish(score);
        else setI(i + 1);
    };
    return (
        <div>
            <Title>
                Round {Math.min(i + 1, DOOR_ROUNDS)} of {DOOR_ROUNDS}: {score} points
            </Title>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "12px 0" }}>
                {rounds[i].map((value, door) => {
                    const shown = picked !== null;
                    return (
                        <button
                            key={door}
                            type="button"
                            className="bbb-door"
                            aria-label={shown ? `Door ${door + 1}: ${value} points` : `Door ${door + 1}`}
                            disabled={shown}
                            onClick={() => open(door)}
                            style={{
                                width: 92,
                                height: 140,
                                borderRadius: "46px 46px 8px 8px",
                                border: `3px solid ${picked === door ? "#fde047" : "#7c5a2e"}`,
                                background: shown ? (value > 5 ? "#14532d" : value > 0 ? "#1e3a8a" : "#3f3f46") : "#a16207",
                                color: "white",
                                fontSize: shown ? "1.6rem" : "2rem",
                                fontWeight: 800,
                                cursor: shown ? "default" : "pointer",
                                touchAction: "manipulation",
                            }}
                        >
                            {shown ? (value > 0 ? `+${value}` : "🕸️") : door + 1}
                        </button>
                    );
                })}
            </div>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={i + 1 >= DOOR_ROUNDS} onNext={next} nextLabel="Next doors" />
            ) : (
                <Subtle>One door hides a big prize, one a small one, and one nothing at all. Pick a door.</Subtle>
            )}
        </div>
    );
}

function simulateMysteryDoors(ctx: SimContext, _skill: number, noise: Rand): SimResult {
    const rounds = doorRounds(seededRand(ctx.seed));
    const picks = rounds.map((r) => r[randInt(noise, 0, DOORS - 1)]);
    return { score: picks.reduce((a, b) => a + b, 0), answers: picks.map((p) => p > 0), picks };
}

export const MysteryDoorsComp: CompDefinition = {
    id: "mystery-doors",
    name: "Mystery Doors",
    emoji: "🚪",
    kind: "luck",
    rules: `${DOOR_ROUNDS} rounds, three doors each time: a big prize, a small one, and nothing. Pick a door and take what's behind it. Most points wins. Pure luck.`,
    maxSeconds: 120,
    Component: MysteryDoors,
    simulate: simulateMysteryDoors,
    botScore: (p) => Math.round(18 + 24 * p),
    format: (s) => `${s} points`,
    progress: (r, n) => sumSoFar(r, n),
};

// ---------------- Lucky Dice ----------------

const DICE_ROUNDS = 5;
const DIE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// Each round's first roll, and the roll you'd get if you rolled again: two dice each.
export function diceRounds(rand: Rand): { first: [number, number]; again: [number, number] }[] {
    const roll = (): [number, number] => [randInt(rand, 1, 6), randInt(rand, 1, 6)];
    return Array.from({ length: DICE_ROUNDS }, () => ({ first: roll(), again: roll() }));
}

function LuckyDice(props: CompProps) {
    const [rounds] = React.useState(() => diceRounds(props.rand));
    const [i, setI] = React.useState(0);
    const [score, setScore] = React.useState(0);
    const [kept, setKept] = React.useState<[number, number] | null>(null);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);

    const take = (again: boolean) => {
        if (kept) return;
        const dice = again ? rounds[i].again : rounds[i].first;
        const won = dice[0] + dice[1];
        const s = score + won;
        setKept(dice);
        setScore(s);
        // a good call: kept a roll that beat the reroll, or rerolled into something better
        const other = again ? rounds[i].first : rounds[i].again;
        const good = won >= other[0] + other[1];
        if (props.recordAnswer) props.recordAnswer(i, good, won);
        props.report(s);
        if (props.pauseClock) props.pauseClock(true);
        setReveal({
            index: i,
            verdict: again ? `🎲 Rolled again: ${won}` : `✋ Kept ${won}`,
            correctText: (
                <b>
                    {again ? `the first roll was ${other[0] + other[1]}` : `rolling again would have given ${other[0] + other[1]}`}
                </b>
            ),
            answerLabel: "The other way",
            rows: revealRows(props, i, { correct: good, answer: `${won} points` }, (_ok, pick) => `${Number(pick) || 0} points`),
        });
    };
    const next = () => {
        if (props.pauseClock) props.pauseClock(false);
        setReveal(null);
        setKept(null);
        if (i + 1 >= DICE_ROUNDS) props.finish(score);
        else setI(i + 1);
    };
    const shown = kept || rounds[i].first;
    return (
        <div>
            <Title>
                Roll {Math.min(i + 1, DICE_ROUNDS)} of {DICE_ROUNDS}: {score} points
            </Title>
            <div style={{ fontSize: "5rem", lineHeight: 1.1, margin: "6px 0" }} aria-label={`${shown[0]} and ${shown[1]}`}>
                {DIE[shown[0] - 1]} {DIE[shown[1] - 1]}
            </div>
            <Subtle>
                <b>{shown[0] + shown[1]}</b>
            </Subtle>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={i + 1 >= DICE_ROUNDS} onNext={next} nextLabel="Next roll" />
            ) : (
                <div>
                    <Subtle>Keep this roll, or roll both dice again? If you roll again, you're stuck with the new one.</Subtle>
                    <BigButton kind="success" onClick={() => take(false)}>
                        ✋ Keep {shown[0] + shown[1]}
                    </BigButton>
                    <BigButton kind="warning" onClick={() => take(true)}>
                        🎲 Roll again
                    </BigButton>
                </div>
            )}
        </div>
    );
}

function simulateLuckyDice(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const rounds = diceRounds(seededRand(ctx.seed));
    const answers: boolean[] = [];
    const picks: number[] = [];
    rounds.forEach((r) => {
        const first = r.first[0] + r.first[1];
        const second = r.again[0] + r.again[1];
        // the odds say: roll again under 7. Sharper bots play them more often
        const again = chance(noise, 0.6 + 0.4 * skill) ? first < 7 : noise() < 0.5;
        const won = again ? second : first;
        picks.push(won);
        answers.push(won >= (again ? first : second));
    });
    return { score: picks.reduce((a, b) => a + b, 0), answers, picks };
}

export const LuckyDiceComp: CompDefinition = {
    id: "lucky-dice",
    name: "Lucky Dice",
    emoji: "🎲",
    kind: "luck",
    rules: `${DICE_ROUNDS} rolls of two dice. After each roll, keep it or roll both dice again, but then you're stuck with the new roll. Highest total wins.`,
    maxSeconds: 100,
    Component: LuckyDice,
    simulate: simulateLuckyDice,
    botScore: (p) => Math.round(32 + 14 * p),
    format: (s) => `${s} points`,
    progress: (r, n) => sumSoFar(r, n),
};

// ---------------- Roll Call ----------------

const CALL_MAX = 150; // seconds: anyone still answering by then has outlasted the clock

export interface Call {
    at: number; // when it rings (seconds in)
    window: number; // how long there is to answer
    decoy: boolean; // a wrong name: don't answer
}

// The calls: they come faster and leave less time as it goes on, and now and then it's someone else's name.
export function rollCalls(rand: Rand): Call[] {
    const calls: Call[] = [];
    let t = 2.5;
    while (t < CALL_MAX) {
        const late = t / CALL_MAX;
        calls.push({ at: t, window: 1.7 - 1.15 * late, decoy: calls.length > 2 && rand() < 0.22 });
        t += 1.6 + (3.8 - 2.3 * late) * rand() + (1.7 - 1.15 * late);
    }
    return calls;
}

function RollCall(props: CompProps) {
    const [calls] = React.useState(() => rollCalls(props.rand));
    const [started, setStarted] = React.useState(false);
    const [now, setNow] = React.useState(0);
    const [out, setOut] = React.useState<string | null>(null);
    const state = React.useRef({ next: 0, answered: false, t: 0, over: false });

    const end = (why: string, t: number) => {
        if (state.current.over) return;
        state.current.over = true;
        setOut(why);
        props.finish(Math.round(t * 10) / 10);
    };

    useAnimationFrame((t) => {
        const st = state.current;
        if (st.over) return false;
        st.t = t;
        const call = calls[st.next];
        if (!call) return end("You outlasted the clock!", CALL_MAX);
        if (t > call.at + call.window) {
            // the call's over
            if (!call.decoy && !st.answered) return end("You missed your name.", call.at + call.window);
            st.next++;
            st.answered = false;
            props.report(Math.round(t * 10) / 10);
        }
        setNow(t);
    }, started && !out);

    const tap = () => {
        const st = state.current;
        if (!started || st.over) return;
        const call = calls[st.next];
        const live = call && st.t >= call.at && st.t <= call.at + call.window;
        if (!live) return end("You answered when nobody called.", st.t);
        if (call.decoy) return end("That wasn't your name.", st.t);
        st.answered = true;
    };

    const call = calls[state.current.next];
    const ringing = started && !out && call && now >= call.at && now <= call.at + call.window;
    const mine = ringing && !call.decoy;
    const answered = ringing && state.current.answered;
    const others = props.participants.filter((p) => p.id !== props.human.id);
    const decoyName = others.length > 0 ? others[state.current.next % others.length].name : "Somebody else";
    return (
        <div>
            <Title>⏱️ {formatSeconds(now)}</Title>
            <div
                onPointerDown={tap}
                {...pressable(tap, "Answer the roll call")}
                style={{
                    height: 200,
                    maxWidth: 420,
                    margin: "8px auto",
                    borderRadius: 16,
                    border: "3px solid " + (ringing ? "#fde047" : "transparent"),
                    background: out ? "#3f3f46" : answered ? "#14532d" : ringing ? "#1e3a8a" : "#27272a",
                    color: "white",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.7rem",
                    fontWeight: 800,
                    touchAction: "manipulation",
                    userSelect: "none",
                    cursor: "pointer",
                }}
            >
                {out ? (
                    out
                ) : !started ? (
                    "Ready?"
                ) : answered ? (
                    "✅ Here!"
                ) : ringing ? (
                    <>
                        <span>🔔 {mine ? props.human.name : decoyName}!</span>
                        <span style={{ fontSize: "1rem", fontWeight: 600 }}>{mine ? "Tap: that's you" : "Not you: don't tap"}</span>
                    </>
                ) : (
                    "…"
                )}
            </div>
            {!started && (
                <BigButton kind="success" onClick={() => setStarted(true)}>
                    Start
                </BigButton>
            )}
            <Subtle>Tap when your name is called. Don't tap for anyone else's, or when it's quiet. It gets faster.</Subtle>
        </div>
    );
}

function simulateRollCall(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const calls = rollCalls(seededRand(ctx.seed));
    for (const call of calls) {
        // a shorter window is easier to miss; a decoy is easier to fall for when you're tired
        const tired = call.at / CALL_MAX;
        const slip = call.decoy ? 0.04 + 0.2 * tired : 0.02 + 0.5 * Math.max(0, 1.1 - call.window) * (0.4 + tired);
        if (chance(noise, clamp(slip * (1.35 - skill), 0.005, 0.9))) {
            const at = call.decoy ? call.at + 0.3 + 0.2 * Math.abs(gaussian(noise)) : call.at + call.window;
            return { score: Math.round(at * 10) / 10 };
        }
    }
    return { score: CALL_MAX };
}

export const RollCallComp: CompDefinition = {
    id: "roll-call",
    name: "Roll Call",
    emoji: "🔔",
    kind: "endurance",
    rules: "Names are called, faster and faster. Tap when it's yours, in time. Tap for someone else's name, or when nobody called, and you're out. Miss your own and you're out. Last one answering wins.",
    maxSeconds: CALL_MAX + 10,
    Component: RollCall,
    simulate: simulateRollCall,
    botScore: (p) => Math.round(25 + 110 * p),
    format: (s) => (s >= CALL_MAX ? "outlasted the clock" : `${formatSeconds(s)} (${s.toFixed(1)}s)`),
};

// ---------------- Hot Hands ----------------

const HANDS_MAX = 150;

export interface Burn {
    at: number; // when the plate turns hot (seconds in)
    react: number; // how long there is to let go
    cool: number; // how long it stays hot
    back: number; // how long there is to get your hand back on once it cools
}

// When the plate turns hot. The warnings get shorter as it goes on.
export function burns(rand: Rand): Burn[] {
    const out: Burn[] = [];
    let t = 3;
    while (t < HANDS_MAX) {
        const late = t / HANDS_MAX;
        const burn = { at: t, react: 1.1 - 0.7 * late, cool: 1 + 1.5 * rand(), back: 1.6 - 0.9 * late };
        out.push(burn);
        t += burn.cool + burn.back + 2 + (4.5 - 3 * late) * rand();
    }
    return out;
}

function HotHands(props: CompProps) {
    const [plan] = React.useState(() => burns(props.rand));
    const [now, setNow] = React.useState(0);
    const [out, setOut] = React.useState<string | null>(null);
    const [holding, setHolding] = React.useState(false);
    const [started, setStarted] = React.useState(false);
    const state = React.useRef({ next: 0, down: false, t: 0, over: false, released: false });

    const end = (why: string, t: number) => {
        if (state.current.over) return;
        state.current.over = true;
        setOut(why);
        props.finish(Math.round(Math.max(0, t) * 10) / 10);
    };

    useAnimationFrame((t) => {
        const st = state.current;
        if (st.over) return false;
        st.t = t;
        const burn = plan[st.next];
        if (!burn) return end("You outlasted the clock!", HANDS_MAX);
        const hotUntil = burn.at + burn.cool;
        if (t >= burn.at && t < hotUntil) {
            // hot: off within the warning, and stay off
            if (st.down && t > burn.at + burn.react) return end("Too slow: you got burned.", t);
            if (!st.down) st.released = true;
        } else if (t >= hotUntil) {
            // cooled down: back on in time
            if (!st.down && t > hotUntil + burn.back) return end("You left it too long to put your hand back.", t);
            if (st.down) {
                st.next++;
                st.released = false;
                props.report(Math.round(t * 10) / 10);
            }
        } else if (!st.down && t > 0.2) {
            return end("You let go when it was cool.", t);
        }
        setNow(t);
    }, started && !out);

    const press = (down: boolean) => {
        const st = state.current;
        if (st.over) return;
        if (!started) {
            if (!down) return;
            st.down = true;
            setHolding(true);
            setStarted(true);
            return;
        }
        st.down = down;
        setHolding(down);
        const burn = plan[st.next];
        // back on while it's still hot
        if (down && burn && st.t >= burn.at && st.t < burn.at + burn.cool && st.released) end("It was still hot.", st.t);
    };

    const burn = plan[state.current.next];
    const hot = started && !out && burn && now >= burn.at && now < burn.at + burn.cool;
    const cooled = started && !out && burn && now >= burn.at + burn.cool;
    return (
        <div>
            <Title>⏱️ {formatSeconds(now)}</Title>
            <div
                onPointerDown={(e) => {
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    press(true);
                }}
                onPointerUp={() => press(false)}
                onPointerCancel={() => press(false)}
                onKeyDown={(e) => {
                    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                        e.preventDefault();
                        press(true);
                    }
                }}
                onKeyUp={(e) => {
                    if (e.key === " " || e.key === "Enter") press(false);
                }}
                role="button"
                tabIndex={0}
                aria-label="The plate: press and hold, and let go when it's hot"
                style={{
                    height: 200,
                    maxWidth: 420,
                    margin: "8px auto",
                    borderRadius: 16,
                    border: "3px solid " + (holding ? "#fde047" : "transparent"),
                    background: out ? "#3f3f46" : hot ? "#b91c1c" : "#1e3a8a",
                    color: "white",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.7rem",
                    fontWeight: 800,
                    touchAction: "none",
                    userSelect: "none",
                    cursor: "pointer",
                }}
            >
                {out ? out : !started ? "Press and hold to start" : hot ? "🔥 HOT! Let go!" : cooled && !holding ? "🧊 Cool: hand back on!" : "✋ Hold…"}
            </div>
            <Subtle>Keep your hand on the plate. When it turns hot, let go fast; when it cools, get it back on. The warnings get shorter.</Subtle>
        </div>
    );
}

function simulateHotHands(ctx: SimContext, skill: number, noise: Rand): SimResult {
    for (const burn of burns(seededRand(ctx.seed))) {
        const tired = burn.at / HANDS_MAX;
        // a reaction time against the warning, then getting back on in time
        const reaction = 0.28 + (1 - skill) * 0.42 + 0.09 * Math.abs(gaussian(noise)) + 0.12 * tired;
        if (reaction > burn.react) return { score: Math.round((burn.at + burn.react) * 10) / 10 };
        if (chance(noise, clamp((0.03 + 0.12 * tired) * (1.3 - skill), 0.003, 0.5))) return { score: Math.round((burn.at + burn.cool + burn.back) * 10) / 10 };
    }
    return { score: HANDS_MAX };
}

export const HotHandsComp: CompDefinition = {
    id: "hot-hands",
    name: "Hot Hands",
    emoji: "🔥",
    kind: "endurance",
    rules: "Press and hold the plate. When it turns hot, let go before you're burned; when it cools, get your hand back on. Let go at the wrong time, or too late, and you're out. Last one holding wins.",
    maxSeconds: HANDS_MAX + 10,
    Component: HotHands,
    simulate: simulateHotHands,
    botScore: (p) => Math.round(20 + 115 * p),
    format: (s) => (s >= HANDS_MAX ? "outlasted the clock" : `${formatSeconds(s)} (${s.toFixed(1)}s)`),
};
