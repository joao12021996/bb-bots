import React from "react";
import { nonEvictedHouseguests } from "../../model";
import { BigButton, pressable, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, bestOf, Reveal, revealRows, sumSoFar, useAnimationFrame } from "./compUi";
import { chance, clamp, gaussian, Rand, randInt, seededRand, shuffled } from "./random";

// ---------------- Whack-a-Houseguest ----------------

const HOLES = 9;
const WHACK_SECONDS = 40;

// Every pop-up, worked out from the seed before play starts: which hole, whose face, when it pops up and when it
// ducks back down. Everyone gets exactly the same board, whatever they hit (a hit only hides the face). The draws
// are the same, in the same order, as simulateWhack's, so the bots face the same pop-ups too.
export function whackPlan(rand: Rand, faceCount: number): { hole: number; face: number; at: number; until: number }[] {
    const plan: { hole: number; face: number; at: number; until: number }[] = [];
    const busyUntil = Array.from({ length: HOLES }, () => 0);
    let t = 0.6;
    while (t < WHACK_SECONDS) {
        const wanted = randInt(rand, 0, HOLES - 1);
        const face = randInt(rand, 0, Math.max(0, faceCount - 1));
        const life = Math.max(0.55, 1.15 - t / 60);
        let hole = wanted;
        for (let i = 0; i < HOLES; i++) {
            const h = (wanted + i) % HOLES;
            if (busyUntil[h] <= t) {
                hole = h;
                break;
            }
        }
        busyUntil[hole] = t + life;
        plan.push({ hole, face, at: t, until: t + life });
        t += 0.35 + rand() * 0.5;
    }
    return plan;
}

function Whack(props: CompProps) {
    const faces = React.useMemo(() => nonEvictedHouseguests(props.gameState), [props.gameState]);
    const { rand, report } = props;
    const [plan] = React.useState(() => whackPlan(rand, faces.length));
    const [now, setNow] = React.useState(0);
    const [hitIds, setHitIds] = React.useState<number[]>([]);
    const [score, setScore] = React.useState(0);
    const start = React.useRef(performance.now());

    React.useEffect(() => {
        const t = setInterval(() => setNow((performance.now() - start.current) / 1000), 60);
        return () => clearInterval(t);
    }, []);

    const moles = plan.map((m, i) => ({ ...m, i })).filter((m) => m.at <= now && now < m.until && !hitIds.includes(m.i));

    const tap = (hole: number) => {
        const mole = moles.find((m) => m.hole === hole);
        const s = score + (mole ? 1 : -1);
        setScore(s);
        report(s);
        if (mole) setHitIds([...hitIds, mole.i]);
    };

    return (
        <div>
            <Title>Score: {score}</Title>
            <Subtle>Tap the faces as they pop up. Missing the face costs a point.</Subtle>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    width: "min(86vw, 330px)",
                    margin: "0 auto",
                }}
            >
                {Array.from({ length: HOLES }, (_, hole) => {
                    const mole = moles.find((m) => m.hole === hole);
                    return (
                        <div
                            key={hole}
                            onPointerDown={() => tap(hole)}
                            {...pressable(() => tap(hole), mole ? `Hole ${hole + 1}: someone popped up!` : `Hole ${hole + 1}`)}
                            style={{
                                ...({ aspectRatio: "1" } as any),
                                borderRadius: "50%",
                                background: "#1f1a14",
                                border: "4px solid #5a4632",
                                overflow: "hidden",
                                touchAction: "manipulation",
                                cursor: "pointer",
                            }}
                        >
                            {mole && (
                                <img
                                    src={faces[mole.face].imageURL}
                                    alt=""
                                    style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function simulateWhack(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same pop-ups as on the players' screens: each uses a hole, a face, and the time to the next one
    const rand = seededRand(ctx.seed);
    let t = 0.6;
    let score = 0;
    while (t < WHACK_SECONDS) {
        rand(); // hole
        rand(); // face
        const life = Math.max(0.55, 1.15 - t / 60);
        if (chance(noise, clamp((0.3 + 0.65 * skill) * Math.sqrt(life / 1.15), 0.05, 0.97))) score++;
        t += 0.35 + rand() * 0.5;
    }
    score -= Math.max(0, Math.round((1 - skill) * 3 + gaussian(noise)));
    return { score };
}

export const WhackComp: CompDefinition = {
    id: "whack",
    name: "Whack-a-Houseguest",
    emoji: "🔨",
    kind: "reflex",
    rules: `Houseguests pop out of holes for a split second. Tap them before they hide! +1 per hit, −1 for tapping an empty hole. ${WHACK_SECONDS} seconds.`,
    maxSeconds: WHACK_SECONDS,
    Component: Whack,
    simulate: simulateWhack,
    botScore: (p) => Math.round(6 + 28 * p),
    format: (s) => `${s} points`,
};

// ---------------- Reaction Lights ----------------

const LIGHT_ROUNDS = 5;

function ReactionLights(props: CompProps) {
    const [delays] = React.useState(() => Array.from({ length: LIGHT_ROUNDS }, () => 1.2 + props.rand() * 2.8));
    const [round, setRound] = React.useState(0);
    const [phase, setPhase] = React.useState<"idle" | "wait" | "go" | "done">("idle");
    const [times, setTimes] = React.useState<number[]>([]);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const goAt = React.useRef(0);
    const timer = React.useRef<any>(null);

    React.useEffect(() => () => clearTimeout(timer.current), []);

    const record = (ms: number) => {
        const t = [...times, ms];
        setTimes(t);
        if (props.recordAnswer) props.recordAnswer(t.length - 1, ms < 1000, ms);
        const avg = t.reduce((a, b) => a + b, 0) / t.length;
        props.report(-Math.round((avg * t.length + 1000 * (LIGHT_ROUNDS - t.length)) / LIGHT_ROUNDS));
        if (props.pauseClock) props.pauseClock(true);
        const said = (n: number) => (n >= 1000 ? "too early!" : `${n} ms`);
        const k = t.length - 1;
        const rows = revealRows(props, k, { correct: ms < 1000, answer: said(ms) }, (_ok, pick) => said(Number(pick)));
        const fastest = rows.some((r) => r.answer && r.answer !== said(1000))
            ? bestOf(rows, (r) => (r.answer && r.answer !== said(1000) ? parseInt(r.answer, 10) : undefined), said, true)
            : "nobody, everyone jumped the gun";
        setReveal({ index: k, verdict: ms >= 1000 ? "🚫 Too early!" : `⚡ ${ms} ms`, correctText: fastest, answerLabel: "Fastest this round", rows });
        setPhase("done");
    };
    const next = () => {
        if (props.pauseClock) props.pauseClock(false);
        setReveal(null);
        if (times.length >= LIGHT_ROUNDS) {
            props.finish(-Math.round(times.reduce((a, b) => a + b, 0) / times.length));
            return;
        }
        setRound(round + 1);
        begin(round + 1);
    };

    const begin = (r: number = round) => {
        setPhase("wait");
        timer.current = setTimeout(() => {
            goAt.current = performance.now();
            setPhase("go");
        }, delays[r] * 1000);
    };

    const tap = () => {
        if (phase === "wait") {
            clearTimeout(timer.current);
            record(1000); // false start
        } else if (phase === "go") {
            record(Math.round(performance.now() - goAt.current));
        }
    };

    const colors = { idle: "#444", wait: "#b33", go: "#2b2", done: "#444" };
    const last = times[times.length - 1];
    return (
        <div>
            <Title>
                Round {Math.min(round + 1, LIGHT_ROUNDS)} of {LIGHT_ROUNDS}
            </Title>
            <div
                onPointerDown={tap}
                {...pressable(tap, "Tap when the light turns green")}
                style={{
                    height: 220,
                    maxWidth: 420,
                    margin: "8px auto",
                    borderRadius: 16,
                    background: colors[phase],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2rem",
                    fontWeight: 800,
                    touchAction: "manipulation",
                    userSelect: "none",
                    cursor: "pointer",
                }}
            >
                {phase === "wait" ? "Wait for green…" : phase === "go" ? "TAP!" : phase === "done" ? (last >= 1000 ? "Too early!" : `${last} ms`) : "Ready?"}
            </div>
            {phase === "done" && reveal && <AnswerReveal reveal={reveal} last={times.length >= LIGHT_ROUNDS} onNext={next} nextLabel="Next round" />}
            {phase === "idle" && (
                <BigButton kind="success" onClick={() => begin()}>
                    Start
                </BigButton>
            )}
        </div>
    );
}

function simulateReactionLights(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const rand = seededRand(ctx.seed);
    const delays = Array.from({ length: LIGHT_ROUNDS }, () => 1.2 + rand() * 2.8);
    // long waits tempt false starts
    const times = delays.map((d) =>
        chance(noise, (1 - skill) * 0.05 * d) ? 1000 : Math.max(150, 190 + (1 - skill) * 300 + 40 * gaussian(noise))
    );
    return { score: -Math.round(times.reduce((a, b) => a + b, 0) / times.length), answers: times.map((t) => t < 1000), picks: times.map(Math.round) };
}

export const ReactionLightsComp: CompDefinition = {
    id: "reaction-lights",
    name: "Reaction Lights",
    emoji: "🚦",
    kind: "reflex",
    rules: `${LIGHT_ROUNDS} rounds. The light turns red, then green after a random wait. Tap as soon as it turns green. Tapping too early counts as 1 second. The fastest average wins.`,
    maxSeconds: 90,
    Component: ReactionLights,
    simulate: simulateReactionLights,
    botScore: (p) => -Math.round(210 + (1 - p) * 330),
    format: (s) => `${-s} ms average`,
    progress: (r, n) => (n > 0 ? -Math.round(sumSoFar(r, n) / Math.min(n, (r.picks || []).length || 1)) : 0),
};

// ---------------- Color Clash ----------------

const COLORS = [
    { name: "RED", css: "#ff4d4d" },
    { name: "BLUE", css: "#5b8cff" },
    { name: "GREEN", css: "#3ecf5a" },
    { name: "YELLOW", css: "#ffd23f" },
];

// Cards come from the comp's seed in order, so card N is the same for everyone.
export function nextColorCard(rand: Rand) {
    const word = randInt(rand, 0, 3);
    let ink = randInt(rand, 0, 3);
    if (ink === word && rand() < 0.75) ink = (ink + randInt(rand, 1, 3)) % 4;
    return { word, ink };
}

function ColorClash(props: CompProps) {
    const { rand } = props;
    const next = React.useCallback(() => nextColorCard(rand), [rand]);
    const [card, setCard] = React.useState(next);
    const [score, setScore] = React.useState(0);
    const answer = (i: number) => {
        const s = score + (i === card.ink ? 1 : -1);
        setScore(s);
        props.report(s);
        setCard(next());
    };
    return (
        <div>
            <Title>Score: {score}</Title>
            <Subtle>Tap the COLOR of the ink, not the word.</Subtle>
            <div style={{ fontSize: "3.5rem", fontWeight: 900, color: COLORS[card.ink].css, margin: "12px 0" }}>
                {COLORS[card.word].name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 340, margin: "0 auto" }}>
                {COLORS.map((c, i) => (
                    <button
                        type="button"
                        key={c.name}
                        className="button is-medium"
                        style={{ touchAction: "manipulation" }}
                        onClick={() => answer(i)}
                    >
                        {c.name}
                    </button>
                ))}
            </div>
        </div>
    );
}

function simulateColorClash(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const rand = seededRand(ctx.seed);
    let time = 0;
    let score = 0;
    while (true) {
        const card = nextColorCard(rand);
        const tricky = card.word !== card.ink;
        time += 0.8 + (1 - skill) * 1.5 + Math.abs(0.2 * gaussian(noise)) + (tricky ? 0.2 : 0);
        if (time > 45) break;
        score += chance(noise, tricky ? 0.75 + 0.23 * skill : 0.97) ? 1 : -1;
    }
    return { score };
}

export const ColorClashComp: CompDefinition = {
    id: "color-clash",
    name: "Color Clash",
    emoji: "🎨",
    kind: "reflex",
    rules: "A color word appears in a different color of ink. Tap the button for the INK color. +1 if right, −1 if wrong. 45 seconds.",
    maxSeconds: 45,
    Component: ColorClash,
    simulate: simulateColorClash,
    botScore: (p) => Math.round(6 + 26 * p),
    format: (s) => `${s} points`,
};

// ---------------- Number Grid ----------------

const GRID_MAX = 20;
const GRID_LIMIT = 90;

function NumberGrid(props: CompProps) {
    const [cells] = React.useState(() => shuffled(props.rand, Array.from({ length: GRID_MAX }, (_, i) => i + 1)));
    const [nextN, setNextN] = React.useState(1);
    const [penalty, setPenalty] = React.useState(0);
    const [wrong, setWrong] = React.useState<number | null>(null);
    const [start] = React.useState(() => performance.now());

    const tap = (n: number) => {
        if (n !== nextN) {
            setPenalty(penalty + 1);
            setWrong(n);
            props.report(-(GRID_LIMIT + (GRID_MAX - nextN + 1) * 3));
            return;
        }
        setWrong(null);
        if (n === GRID_MAX) {
            props.finish(-((performance.now() - start) / 1000 + penalty));
            return;
        }
        setNextN(n + 1);
        props.report(-(GRID_LIMIT + (GRID_MAX - n) * 3));
    };
    return (
        <div>
            <Title>Find {nextN}</Title>
            <Subtle>Tap 1 to {GRID_MAX} in order. Wrong taps add 1 second. Penalties: {penalty}s</Subtle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, maxWidth: 340, margin: "0 auto" }}>
                {cells.map((n) => (
                    <button
                        type="button"
                        key={n}
                        className={`button is-medium ${n < nextN ? "is-success" : ""} ${wrong === n ? "is-danger" : ""}`}
                        style={{ touchAction: "manipulation" }}
                        onClick={() => tap(n)}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}

function simulateNumberGrid(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    const seconds = Math.max(8, 14 + (1 - skill) * 36 + 4 * gaussian(noise));
    const penalties = Math.max(0, Math.round((1 - skill) * 3 * noise() * 2));
    return { score: seconds + penalties > GRID_LIMIT ? -(GRID_LIMIT + 10) : -(seconds + penalties) };
}

export const NumberGridComp: CompDefinition = {
    id: "number-grid",
    name: "Number Grid",
    emoji: "🔢",
    kind: "reflex",
    rules: `The numbers 1 to ${GRID_MAX} are scattered on a grid. Tap them in order as fast as you can. Each wrong tap adds a 1-second penalty. The fastest time wins.`,
    maxSeconds: GRID_LIMIT,
    Component: NumberGrid,
    simulate: simulateNumberGrid,
    botScore: (p) => -(16 + (1 - p) * 38),
    format: (s) => (s < -GRID_LIMIT ? "didn't finish" : `${(-s).toFixed(1)}s`),
};

// ---------------- Bullseye ----------------

const THROWS = 5;

function Bullseye(props: CompProps) {
    const [phase0] = React.useState(() => props.rand() * Math.PI * 2);
    const [throws, setThrows] = React.useState<number[]>([]);
    const [pos, setPos] = React.useState(0);
    const posRef = React.useRef(0);
    const done = throws.length >= THROWS;
    useAnimationFrame((t) => {
        const speed = 2.2 + throws.length * 0.7;
        posRef.current = Math.sin(phase0 + t * speed);
        setPos(posRef.current);
    }, !done);

    const toss = () => {
        if (done) return;
        const pts = Math.round(100 * (1 - Math.abs(posRef.current)));
        const t = [...throws, pts];
        setThrows(t);
        const total = t.reduce((a, b) => a + b, 0);
        props.report(total);
        if (t.length >= THROWS) props.finish(total);
    };
    const total = throws.reduce((a, b) => a + b, 0);
    return (
        <div>
            <Title>
                Throw {Math.min(throws.length + 1, THROWS)} of {THROWS}, total {total}
            </Title>
            <div
                style={{
                    position: "relative",
                    height: 50,
                    maxWidth: 420,
                    margin: "16px auto",
                    borderRadius: 25,
                    background: "linear-gradient(90deg, #444, #888 40%, #f5c542 49%, #f5c542 51%, #888 60%, #444)",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: `calc(${((pos + 1) / 2) * 100}% - 4px)`,
                        top: -6,
                        width: 8,
                        height: 62,
                        background: "white",
                        borderRadius: 4,
                        boxShadow: "0 0 4px black",
                    }}
                />
            </div>
            <button
                type="button"
                className="button is-danger is-large"
                style={{ width: 220, height: 90, touchAction: "manipulation" }}
                onPointerDown={toss}
                disabled={done}
            >
                THROW
            </button>
            <Subtle>{throws.map((t) => `${t}`).join(" · ")}</Subtle>
        </div>
    );
}

function simulateBullseye(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    let total = 0;
    for (let i = 0; i < THROWS; i++) {
        const speed = 2.2 + i * 0.7; // the needle speeds up each throw, same as for players
        const miss = Math.abs(gaussian(noise)) * (0.05 + (1 - skill) * 0.35) * (speed / 2.2);
        total += Math.round(100 * (1 - Math.min(1, miss)));
    }
    return { score: total };
}

export const BullseyeComp: CompDefinition = {
    id: "bullseye",
    name: "Bullseye",
    emoji: "🎯",
    kind: "reflex",
    rules: `A needle swings back and forth across the target. Tap THROW when it's on the gold center line. Up to 100 points per throw, ${THROWS} throws, and the needle gets faster each time.`,
    maxSeconds: 90,
    Component: Bullseye,
    simulate: simulateBullseye,
    botScore: (p) => Math.round(180 + 300 * p),
    format: (s) => `${s} points`,
};
