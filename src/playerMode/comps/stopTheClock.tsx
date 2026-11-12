import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, bestOf, Reveal, revealRows, sumSoFar } from "./compUi";
import { gaussian, Rand, randInt, seededRand } from "./random";

const ROUNDS = 3;
const VISIBLE_FOR = 1.5; // seconds the clock is visible before it hides

// The target times, the same for every player and bot.
export function generateTargets(rand: Rand): number[] {
    return Array.from({ length: ROUNDS }, () => randInt(rand, 5, 10));
}

function simulateStopTheClock(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const targets = generateTargets(seededRand(ctx.seed));
    // longer targets are harder to time
    const misses = targets.map((t) => Math.abs(gaussian(noise)) * (0.04 + (1 - skill) * 0.7) * (t / 7.5));
    return { score: -misses.reduce((a, b) => a + b, 0), picks: misses };
}

function StopTheClock(props: CompProps) {
    const [targets] = React.useState(() => generateTargets(props.rand));
    const [round, setRound] = React.useState(0);
    const [startedAt, setStartedAt] = React.useState<number | null>(null);
    const [stoppedAt, setStoppedAt] = React.useState<number | null>(null);
    const [errors, setErrors] = React.useState<number[]>([]);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const [, tick] = React.useState(0);

    const target = targets[round];
    const running = startedAt !== null && stoppedAt === null;

    React.useEffect(() => {
        if (!running) return;
        const t = setInterval(() => tick((n) => n + 1), 50);
        return () => clearInterval(t);
    }, [running]);

    const stop = React.useCallback(() => {
        if (startedAt === null || stoppedAt !== null) return;
        const now = Date.now();
        const elapsed = (now - startedAt) / 1000;
        const miss = Math.abs(elapsed - target);
        const newErrors = [...errors, miss];
        setStoppedAt(now);
        setErrors(newErrors);
        if (props.recordAnswer) props.recordAnswer(round, miss < 0.1, miss);
        if (props.pauseClock) props.pauseClock(true);
        const total = newErrors.reduce((a, b) => a + b, 0);
        // unplayed rounds count as a big miss if time runs out
        props.report(-(total + (ROUNDS - newErrors.length) * target));
        const off = (m: number) => `${m.toFixed(2)}s off`;
        const rows = revealRows(props, round, { correct: miss < 0.1, answer: `${elapsed.toFixed(2)}s (${off(miss)})` }, (_ok, pick) => off(Number(pick)));
        const misses: { [id: number]: number } = {};
        rows.forEach((r) => {
            if (r.you) misses[r.id] = miss;
            else if (r.answer !== undefined) misses[r.id] = parseFloat(r.answer);
        });
        setReveal({
            index: round,
            verdict: miss < 0.1 ? "🎯 Nailed it!" : `You stopped at ${elapsed.toFixed(2)}s`,
            correctText: (
                <>
                    <b>{target}.00s</b>. Closest: {bestOf(rows, (r) => misses[r.id], off, true)}
                </>
            ),
            answerLabel: "The target",
            rows,
        });
    }, [startedAt, stoppedAt, errors, target, props, round]);

    // auto-stop if the player waits far too long
    const elapsed = startedAt === null ? 0 : ((stoppedAt || Date.now()) - startedAt) / 1000;
    React.useEffect(() => {
        if (running && elapsed > target * 2) stop();
    }, [running, elapsed, target, stop]);

    const next = () => {
        if (props.pauseClock) props.pauseClock(false);
        if (round + 1 >= ROUNDS) {
            props.finish(-errors.reduce((a, b) => a + b, 0));
            return;
        }
        setRound(round + 1);
        setStartedAt(null);
        setStoppedAt(null);
    };

    const display = startedAt === null ? "0.00" : elapsed < VISIBLE_FOR || stoppedAt ? elapsed.toFixed(2) : "?.??";

    return (
        <div>
            <Title>
                Round {round + 1} of {ROUNDS}
            </Title>
            <Subtle>
                Stop the clock at exactly <b>{target}.00</b> seconds.
            </Subtle>
            <div style={{ fontSize: "4rem", fontFamily: "monospace", fontWeight: 700 }}>{display}</div>
            {startedAt === null && (
                <BigButton kind="success" onClick={() => setStartedAt(Date.now())}>
                    Start
                </BigButton>
            )}
            {running && (
                <button
                    type="button"
                    className="button is-danger is-large"
                    style={{ width: 220, height: 120, fontSize: "2rem", touchAction: "manipulation" }}
                    onPointerDown={stop}
                >
                    STOP
                </button>
            )}
            {stoppedAt !== null && reveal && <AnswerReveal reveal={reveal} last={round + 1 >= ROUNDS} onNext={next} nextLabel="Next round" />}
            {errors.length > 0 && (
                <Subtle>Total so far: {errors.reduce((a, b) => a + b, 0).toFixed(2)}s off</Subtle>
            )}
        </div>
    );
}

export const StopTheClockComp: CompDefinition = {
    id: "stop-the-clock",
    name: "Stop the Clock",
    emoji: "⏱️",
    kind: "skill",
    hideTimer: true,
    rules: `Three rounds. Press Start, and the clock counts up, but it disappears after ${VISIBLE_FOR} seconds. Press STOP when you think the target time has passed. The smallest total error wins.`,
    maxSeconds: 120,
    Component: StopTheClock,
    simulate: simulateStopTheClock,
    botScore: (p) => -(0.06 + 3 * Math.pow(1 - p, 2)),
    format: (s) => `${(-s).toFixed(2)}s off`,
    progress: (r, n) => -sumSoFar(r, n),
};
