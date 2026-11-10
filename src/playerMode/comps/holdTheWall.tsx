import React from "react";
import { Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { clamp, gaussian, Rand, seededRand } from "./random";

const LIMIT = 300;
const PUSH = 2.0; // strength of the player's lean
const ZONE = 1; // marker falls off past |x| > ZONE

// Endurance: the wall sways in random gusts that grow stronger over time. Lean against the gusts
// to keep the marker on the wall. Holding a button on a phone, or the arrow keys on a computer.
function HoldTheWall(props: CompProps) {
    const [x, setX] = React.useState(0);
    const [fallen, setFallen] = React.useState(false);
    const [survived, setSurvived] = React.useState(0);
    const lean = React.useRef(0); // -1, 0, 1
    const finished = React.useRef(false);
    const { report, finish, rand } = props;

    React.useEffect(() => {
        let raf = 0;
        let last = performance.now();
        const start = last;
        let pos = 0;
        let vel = 0;
        let wind = 0;
        let windTarget = 0;
        let nextGust = 1;
        let lastReport = 0;
        const frame = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const t = (now - start) / 1000;
            if (t >= nextGust) {
                const amplitude = 0.6 + 0.012 * t;
                windTarget = (rand() * 2 - 1) * amplitude;
                nextGust = t + 0.6 + rand() * 1.4;
            }
            wind += (windTarget - wind) * Math.min(1, dt * 3);
            // a slight push away from the center, so standing still is never safe
            const instability = pos * 0.8;
            vel += (wind + instability + lean.current * PUSH) * dt;
            vel *= Math.pow(0.4, dt);
            pos += vel * dt;
            setX(pos);
            setSurvived(t);
            if (t - lastReport > 1) {
                report(t);
                lastReport = t;
            }
            if (Math.abs(pos) > ZONE) {
                setFallen(true);
                if (!finished.current) {
                    finished.current = true;
                    finish(t);
                }
                return;
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        const down = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") lean.current = -1;
            if (e.key === "ArrowRight") lean.current = 1;
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") lean.current = 0;
        };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, [report, finish, rand]);

    const leanButton = (dir: -1 | 1, label: string) => (
        <button
            type="button"
            className="button is-info is-large"
            style={{ width: "45%", maxWidth: 180, height: 110, fontSize: "1.4rem", touchAction: "none", userSelect: "none" }}
            onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                lean.current = dir;
            }}
            onPointerUp={() => (lean.current = 0)}
            onPointerCancel={() => (lean.current = 0)}
            onContextMenu={(e) => e.preventDefault()}
        >
            {label}
        </button>
    );

    // last one standing: once every opponent has fallen, you've won the endurance comp
    const everyoneElseDown = props.opponents.length > 0 && props.opponents.every((o) => o.score < survived);
    React.useEffect(() => {
        if (everyoneElseDown && !finished.current) {
            finished.current = true;
            finish(survived);
        }
    }, [everyoneElseDown, survived, finish]);

    const pct = ((Math.max(-ZONE, Math.min(ZONE, x)) + ZONE) / (2 * ZONE)) * 100;
    const danger = Math.abs(x) > 0.7;
    return (
        <div>
            <Title>{fallen ? "You fell!" : "Hang on!"}</Title>
            <Subtle>{survived.toFixed(1)} seconds on the wall</Subtle>
            <div
                style={{
                    position: "relative",
                    height: 40,
                    maxWidth: 420,
                    margin: "16px auto",
                    borderRadius: 20,
                    background: "linear-gradient(90deg, #9d4c43, #3f783f 30%, #3f783f 70%, #9d4c43)",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: `calc(${pct}% - 18px)`,
                        top: 2,
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        background: danger ? "#ffdd57" : "white",
                        boxShadow: "0 0 6px black",
                    }}
                />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 420, margin: "0 auto" }}>
                {leanButton(-1, "◀ Lean")}
                {leanButton(1, "Lean ▶")}
            </div>
            <Subtle>Hold a button to lean against the wind (or use the ← → keys).</Subtle>
            <div className="bbb-wall">
                {[{ hg: props.human, score: fallen ? survived : Infinity }, ...props.opponents].map((o) => {
                    const standing = o.score > survived || (o.hg.id === props.human.id && !fallen);
                    return (
                        <div key={o.hg.id} className={`bbb-wall-player ${standing ? "" : "is-down"}`}>
                            <img src={o.hg.imageURL} alt="" />
                            <span>{o.hg.id === props.human.id ? "You" : o.hg.name}</span>
                            <small>{standing ? "on the wall" : `fell at ${Math.min(o.score, survived).toFixed(0)}s`}</small>
                        </div>
                    );
                })}
            </div>
            <Subtle>
                {props.opponents.filter((o) => o.score > survived).length} of {props.opponents.length} opponents still
                standing
            </Subtle>
        </div>
    );
}

function simulateHoldTheWall(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the exact same gusts as the players face; a bot falls at the first gust stronger than it can hold
    const rand = seededRand(ctx.seed);
    const strength = clamp(0.7 + 1.3 * skill + 0.1 * gaussian(noise), 0.4, 2.4);
    let nextGust = 1;
    while (nextGust < LIMIT) {
        const t = nextGust;
        const amplitude = 0.6 + 0.012 * t;
        const wind = (rand() * 2 - 1) * amplitude;
        nextGust = t + 0.6 + rand() * 1.4;
        if (Math.abs(wind) > strength) return { score: t + 0.5 };
    }
    return { score: LIMIT };
}

export const HoldTheWallComp: CompDefinition = {
    id: "hold-the-wall",
    name: "Hold the Wall",
    emoji: "🧗",
    kind: "endurance",
    finaleOnly: true,
    rules: `Endurance! You're hanging on a swaying wall. Gusts push you around and get stronger over time. Hold the lean buttons to stay in the green. The last one on the wall wins. If you last ${
        LIMIT / 60
    } minutes, you've done all you can.`,
    maxSeconds: LIMIT,
    Component: HoldTheWall,
    simulate: simulateHoldTheWall,
    botScore: (p) => 25 + 245 * Math.pow(p, 1.2),
    format: (s) => `lasted ${s.toFixed(1)}s`,
};
