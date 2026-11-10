import React from "react";
import { Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps } from "./compTypes";
import { useAnimationFrame } from "./compUi";

// ---------------- Steady Hand ----------------

const STEADY_SECONDS = 40;

function SteadyHand(props: CompProps) {
    const [params] = React.useState(() => ({
        a: 0.9 + props.rand() * 0.6,
        b: 1.1 + props.rand() * 0.6,
        phase: props.rand() * Math.PI * 2,
    }));
    const box = React.useRef<HTMLDivElement>(null);
    const pointer = React.useRef<{ x: number; y: number } | null>(null);
    const [target, setTarget] = React.useState({ x: 0.5, y: 0.5 });
    const [inside, setInside] = React.useState(false);
    const [held, setHeld] = React.useState(0);
    const heldRef = React.useRef(0);
    const lastReport = React.useRef(0);
    const RADIUS = 0.13; // fraction of the box

    useAnimationFrame((t, dt) => {
        const speed = 1 + t / 25;
        const x = 0.5 + 0.36 * Math.sin(params.a * t * speed + params.phase);
        const y = 0.5 + 0.36 * Math.sin(params.b * t * speed);
        setTarget({ x, y });
        const p = pointer.current;
        const isIn = !!p && Math.hypot(p.x - x, p.y - y) < RADIUS;
        setInside(isIn);
        if (isIn) {
            heldRef.current += dt;
            setHeld(heldRef.current);
        }
        if (t - lastReport.current > 0.5) {
            props.report(Math.round(heldRef.current * 10) / 10);
            lastReport.current = t;
        }
    });

    const track = (e: React.PointerEvent) => {
        const r = box.current!.getBoundingClientRect();
        pointer.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };

    return (
        <div>
            <Title>{held.toFixed(1)}s in the spotlight</Title>
            <Subtle>Keep your finger (or mouse) inside the moving spotlight.</Subtle>
            <div
                ref={box}
                onPointerMove={track}
                onPointerDown={track}
                onPointerLeave={() => (pointer.current = null)}
                onPointerUp={(e) => e.pointerType === "touch" && (pointer.current = null)}
                style={{
                    position: "relative",
                    width: "min(86vw, 340px)",
                    ...({ aspectRatio: "1" } as any),
                    margin: "0 auto",
                    borderRadius: 16,
                    background: "#0b1020",
                    touchAction: "none",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: `${(target.x - RADIUS) * 100}%`,
                        top: `${(target.y - RADIUS) * 100}%`,
                        width: `${RADIUS * 200}%`,
                        height: `${RADIUS * 200}%`,
                        borderRadius: "50%",
                        background: inside
                            ? "radial-gradient(circle, #fde68a, #f59e0b)"
                            : "radial-gradient(circle, #fff7, #fff2)",
                        boxShadow: inside ? "0 0 30px #f59e0b" : "none",
                    }}
                />
            </div>
        </div>
    );
}

export const SteadyHandComp: CompDefinition = {
    id: "steady-hand",
    name: "Spotlight",
    emoji: "🔦",
    kind: "endurance",
    rules: `A spotlight drifts around a dark stage and speeds up over time. Keep your finger or mouse inside it. Most time in the spotlight after ${STEADY_SECONDS} seconds wins.`,
    maxSeconds: STEADY_SECONDS,
    Component: SteadyHand,
    botScore: (p) => Math.round((8 + 26 * p) * 10) / 10,
    format: (s) => `${s.toFixed(1)}s in the light`,
};

// ---------------- Catch the Keys ----------------

const CATCH_SECONDS = 45;

interface Falling {
    id: number;
    x: number;
    y: number;
    bomb: boolean;
    speed: number;
}

function CatchTheKeys(props: CompProps) {
    const [items, setItems] = React.useState<Falling[]>([]);
    const [basket, setBasket] = React.useState(0.5);
    const [score, setScore] = React.useState(0);
    const state = React.useRef({ items: [] as Falling[], basket: 0.5, score: 0, nextId: 0, nextSpawn: 0.3, lean: 0 });
    const area = React.useRef<HTMLDivElement>(null);
    const { rand, report } = props;

    useAnimationFrame((t, dt) => {
        const s = state.current;
        s.basket = Math.max(0.08, Math.min(0.92, s.basket + s.lean * dt * 0.9));
        if (t >= s.nextSpawn) {
            s.items.push({
                id: s.nextId++,
                x: 0.07 + rand() * 0.86,
                y: -0.05,
                bomb: rand() < 0.28,
                speed: 0.32 + t / 90 + rand() * 0.15,
            });
            s.nextSpawn = t + Math.max(0.35, 0.9 - t / 70);
        }
        const kept: Falling[] = [];
        for (const it of s.items) {
            it.y += it.speed * dt;
            if (it.y > 0.86 && it.y < 0.96 && Math.abs(it.x - s.basket) < 0.1) {
                s.score += it.bomb ? -2 : 1;
                report(s.score);
                continue;
            }
            if (it.y < 1.05) kept.push(it);
        }
        s.items = kept;
        setItems([...kept]);
        setBasket(s.basket);
        setScore(s.score);
    });

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") state.current.lean = -1;
            if (e.key === "ArrowRight") state.current.lean = 1;
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") state.current.lean = 0;
        };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, []);

    const drag = (e: React.PointerEvent) => {
        const r = area.current!.getBoundingClientRect();
        state.current.basket = Math.max(0.08, Math.min(0.92, (e.clientX - r.left) / r.width));
    };

    return (
        <div>
            <Title>Score: {score}</Title>
            <Subtle>Drag to move the basket. Catch 🔑 (+1), dodge 💣 (−2).</Subtle>
            <div
                ref={area}
                onPointerMove={drag}
                onPointerDown={drag}
                style={{
                    position: "relative",
                    width: "min(90vw, 380px)",
                    height: 360,
                    margin: "0 auto",
                    borderRadius: 16,
                    background: "linear-gradient(180deg, #1e1b4b, #312e81)",
                    overflow: "hidden",
                    touchAction: "none",
                }}
            >
                {items.map((it) => (
                    <span
                        key={it.id}
                        style={{ position: "absolute", left: `calc(${it.x * 100}% - 14px)`, top: `${it.y * 100}%`, fontSize: 28 }}
                    >
                        {it.bomb ? "💣" : "🔑"}
                    </span>
                ))}
                <span style={{ position: "absolute", left: `calc(${basket * 100}% - 24px)`, top: "88%", fontSize: 44 }}>🧺</span>
            </div>
        </div>
    );
}

export const CatchTheKeysComp: CompDefinition = {
    id: "catch-the-keys",
    name: "Catch the Keys",
    emoji: "🧺",
    kind: "reflex",
    rules: `Keys and bombs rain down. Drag the basket (or use ← →) to catch keys for +1 and dodge bombs worth −2. Highest score after ${CATCH_SECONDS} seconds wins.`,
    maxSeconds: CATCH_SECONDS,
    Component: CatchTheKeys,
    botScore: (p) => Math.round(6 + 26 * p),
    format: (s) => `${s} points`,
};

// ---------------- Tower Stack ----------------

function TowerStack(props: CompProps) {
    const [blocks, setBlocks] = React.useState<{ left: number; width: number }[]>([{ left: 0.2, width: 0.6 }]);
    const [moving, setMoving] = React.useState({ left: 0, width: 0.6 });
    const [over, setOver] = React.useState(false);
    const dir = React.useRef(props.rand() < 0.5 ? 1 : -1);
    const mv = React.useRef({ left: 0, width: 0.6 });

    useAnimationFrame((_t, dt) => {
        const speed = 0.45 + blocks.length * 0.05;
        let left = mv.current.left + dir.current * speed * dt;
        if (left < 0) {
            left = 0;
            dir.current = 1;
        }
        if (left + mv.current.width > 1) {
            left = 1 - mv.current.width;
            dir.current = -1;
        }
        mv.current = { ...mv.current, left };
        setMoving(mv.current);
    }, !over);

    const drop = () => {
        if (over) return;
        const top = blocks[blocks.length - 1];
        const m = mv.current;
        const l = Math.max(top.left, m.left);
        const r = Math.min(top.left + top.width, m.left + m.width);
        const width = r - l;
        if (width <= 0.01) {
            setOver(true);
            props.finish(blocks.length - 1);
            return;
        }
        const next = [...blocks, { left: l, width }];
        setBlocks(next);
        props.report(next.length - 1);
        mv.current = { left: dir.current > 0 ? 0 : 1 - width, width };
    };

    const visible = blocks.slice(-9);
    const height = 30;
    return (
        <div>
            <Title>Height: {blocks.length - 1}</Title>
            <div
                onPointerDown={drop}
                style={{
                    position: "relative",
                    width: "min(86vw, 340px)",
                    height: 360,
                    margin: "0 auto",
                    borderRadius: 16,
                    background: "linear-gradient(180deg, #0f172a, #1e293b)",
                    overflow: "hidden",
                    touchAction: "manipulation",
                    cursor: "pointer",
                }}
            >
                {visible.map((b, i) => (
                    <div
                        key={blocks.length - visible.length + i}
                        style={{
                            position: "absolute",
                            left: `${b.left * 100}%`,
                            width: `${b.width * 100}%`,
                            bottom: i * height,
                            height: height - 2,
                            borderRadius: 4,
                            background: `hsl(${(blocks.length - visible.length + i) * 25}, 70%, 55%)`,
                        }}
                    />
                ))}
                {!over && (
                    <div
                        style={{
                            position: "absolute",
                            left: `${moving.left * 100}%`,
                            width: `${moving.width * 100}%`,
                            bottom: visible.length * height,
                            height: height - 2,
                            borderRadius: 4,
                            background: "white",
                        }}
                    />
                )}
            </div>
            <Subtle>Tap anywhere on the tower to drop the block.</Subtle>
        </div>
    );
}

export const TowerStackComp: CompDefinition = {
    id: "tower-stack",
    name: "Tower Stack",
    emoji: "🏗️",
    kind: "skill",
    rules: "A block slides back and forth. Tap to drop it on the tower. Any overhang gets chopped off, so your blocks shrink. Miss completely and you're done. The tallest tower wins.",
    maxSeconds: 120,
    Component: TowerStack,
    botScore: (p) => Math.round(4 + 18 * p),
    format: (s) => `${s} blocks high`,
};
