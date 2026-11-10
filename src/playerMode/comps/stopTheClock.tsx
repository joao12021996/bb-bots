import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps } from "./compTypes";
import { randInt } from "./random";

const ROUNDS = 3;
const VISIBLE_FOR = 1.5; // seconds the clock is visible before it hides

function StopTheClock(props: CompProps) {
    const [targets] = React.useState(() =>
        Array.from({ length: ROUNDS }, () => randInt(props.rand, 5, 10))
    );
    const [round, setRound] = React.useState(0);
    const [startedAt, setStartedAt] = React.useState<number | null>(null);
    const [stoppedAt, setStoppedAt] = React.useState<number | null>(null);
    const [errors, setErrors] = React.useState<number[]>([]);
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
        const newErrors = [...errors, Math.abs(elapsed - target)];
        setStoppedAt(now);
        setErrors(newErrors);
        const total = newErrors.reduce((a, b) => a + b, 0);
        // unplayed rounds count as a big miss if time runs out
        props.report(-(total + (ROUNDS - newErrors.length) * target));
    }, [startedAt, stoppedAt, errors, target, props]);

    // auto-stop if the player waits far too long
    const elapsed = startedAt === null ? 0 : ((stoppedAt || Date.now()) - startedAt) / 1000;
    React.useEffect(() => {
        if (running && elapsed > target * 2) stop();
    }, [running, elapsed, target, stop]);

    const next = () => {
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
            {stoppedAt !== null && (
                <div>
                    <p>
                        You were <b>{errors[errors.length - 1].toFixed(2)}s</b> off.
                    </p>
                    <BigButton onClick={next}>{round + 1 >= ROUNDS ? "Finish" : "Next round"}</BigButton>
                </div>
            )}
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
    botScore: (p) => -(0.06 + 3 * Math.pow(1 - p, 2)),
    format: (s) => `${(-s).toFixed(2)}s off`,
};
