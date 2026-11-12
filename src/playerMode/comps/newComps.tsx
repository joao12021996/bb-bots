import React from "react";
import { GameState, Houseguest } from "../../model";
import { hashcode } from "../../utils";
import { BigButton, Subtle, Title } from "../ui/common";
import { assignPersonalities, currentPersonalities, PersonalityId, Situation, voice } from "../social/personality";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, QuizScoreboard, Reveal, revealRows, rightSoFar, sumSoFar, useAnimationFrame, useQuizClock } from "./compUi";
import { answerQuestion, clamp, gaussian, pick, Rand, randInt, seededRand, shuffled } from "./random";

// ---------------- Balance Beam ----------------
// A plank on a pivot, with a ball on it. Gusts push it and it gets harder to keep level: lean against it to keep
// the ball on. Most seconds before the ball rolls off wins.

const BEAM_SECONDS = 60;
const TIP = 1; // the plank's tilt at which the ball rolls off

interface Gusts {
    a: number;
    b: number;
    c: number;
    phase: number;
}

function gustsFrom(rand: Rand): Gusts {
    return { a: 0.6 + rand() * 0.5, b: 1.3 + rand() * 0.7, c: 2.6 + rand() * 0.9, phase: rand() * Math.PI * 2 };
}

// the push at time t: a few waves on top of each other, getting stronger
function gust(g: Gusts, t: number): number {
    const strength = 0.35 + t / 40;
    return strength * (0.6 * Math.sin(g.a * t + g.phase) + 0.3 * Math.sin(g.b * t) + 0.25 * Math.sin(g.c * t + 1.3 * g.phase));
}

function BalanceBeam(props: CompProps) {
    const [gusts] = React.useState(() => gustsFrom(props.rand));
    const sim = React.useRef({ tilt: 0, speed: 0, push: 0, alive: true, seconds: 0, lastReport: 0 });
    const [view, setView] = React.useState({ tilt: 0, seconds: 0, alive: true });
    const { report, finish } = props;

    useAnimationFrame((t, dt) => {
        const s = sim.current;
        if (!s.alive) return false;
        // it tips the way it's leaning (more as time goes on), the gusts push it, and the player leans against it
        const unstable = 1.2 + t / 30;
        const accel = unstable * s.tilt + gust(gusts, t) - 2.4 * s.push - 1.1 * s.speed;
        s.speed += accel * dt;
        s.tilt += s.speed * dt;
        s.seconds = t;
        if (Math.abs(s.tilt) >= TIP || t >= BEAM_SECONDS) {
            s.alive = false;
            const score = Math.round(Math.min(t, BEAM_SECONDS) * 10) / 10;
            setView({ tilt: Math.sign(s.tilt) * TIP, seconds: score, alive: false });
            finish(score);
            return false;
        }
        if (t - s.lastReport > 0.5) {
            s.lastReport = t;
            report(Math.round(t * 10) / 10);
        }
        setView({ tilt: s.tilt, seconds: t, alive: true });
    });

    // the keyboard: hold the arrow keys to lean
    React.useEffect(() => {
        const keys = new Set<string>();
        const apply = () => (sim.current.push = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0));
        const down = (e: KeyboardEvent) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            keys.add(e.key);
            apply();
        };
        const up = (e: KeyboardEvent) => {
            keys.delete(e.key);
            apply();
        };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, []);

    const hold = (dir: number) => ({
        onPointerDown: (e: React.PointerEvent) => {
            e.preventDefault();
            sim.current.push = dir;
        },
        onPointerUp: () => (sim.current.push = 0),
        onPointerLeave: () => (sim.current.push = 0),
        onPointerCancel: () => (sim.current.push = 0),
    });
    const deg = view.tilt * 18;
    const ball = 50 + view.tilt * 42; // where the ball has rolled to, in % of the plank
    return (
        <div>
            <Title>{view.alive ? `${view.seconds.toFixed(1)}s balanced` : `The ball fell after ${view.seconds.toFixed(1)}s`}</Title>
            <Subtle>Hold the button on the side to push that side down (or hold the arrow keys). Keep the ball on the plank!</Subtle>
            <div style={{ position: "relative", height: 150, margin: "12px auto", maxWidth: 360 }}>
                <div
                    style={{
                        position: "absolute",
                        left: "5%",
                        right: "5%",
                        top: 70,
                        height: 12,
                        borderRadius: 6,
                        background: "linear-gradient(90deg, #a78bfa, #f472b6)",
                        transform: `rotate(${deg}deg)`,
                        transition: view.alive ? "none" : "transform 0.3s",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            left: `calc(${ball}% - 14px)`,
                            top: -28,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: view.alive ? "radial-gradient(circle at 35% 35%, #fff, #fbbf24)" : "#6b7280",
                        }}
                    />
                </div>
                <div style={{ position: "absolute", left: "calc(50% - 14px)", top: 82, width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderBottom: "40px solid #475569" }} />
            </div>
            {view.alive && (
                <div style={{ display: "flex", gap: 12, justifyContent: "center", touchAction: "none", userSelect: "none" }}>
                    <button type="button" className="button is-info is-large" aria-label="Push the left side down" {...hold(-1)}>
                        ⬅️ Push left
                    </button>
                    <button type="button" className="button is-info is-large" aria-label="Push the right side down" {...hold(1)}>
                        Push right ➡️
                    </button>
                </div>
            )}
        </div>
    );
}

function simulateBalanceBeam(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same gusts: rougher ones knock everyone off sooner
    const g = gustsFrom(seededRand(ctx.seed));
    const rough = (g.a + g.b / 2 + g.c / 3) / 2.2;
    const seconds = clamp(9 + 42 * skill + 6 * gaussian(noise) - (rough - 1) * 10, 3, BEAM_SECONDS);
    return { score: Math.round(seconds * 10) / 10 };
}

export const BalanceBeamComp: CompDefinition = {
    id: "balance-beam",
    name: "Balance Beam",
    emoji: "⚖️",
    kind: "endurance",
    rules: `A ball sits on a plank balanced on a pivot. Gusts push it, and it gets wobblier as time goes on. Hold a side to push that side down and keep the ball on. Longest balance wins (up to ${BEAM_SECONDS} seconds).`,
    maxSeconds: BEAM_SECONDS + 5,
    Component: BalanceBeam,
    simulate: simulateBalanceBeam,
    botScore: (p) => Math.round((9 + 42 * p) * 10) / 10,
    format: (s) => `${s.toFixed(1)}s`,
};

// ---------------- Who Said It? ----------------
// Lines in the bots' own voices: who said it? Players who've been listening to the house know how each one talks.

const QUOTES = 6;
const QUOTE_SECONDS = 15;
const SAID: Situation[] = ["pitch", "final2", "votePlea", "voteAnswer", "hohVisit"];
const DID: Situation[] = ["chat", "flirt"];

export interface Quote {
    text: string; // a quote, or something someone did ("Who ...?")
    did: boolean;
    speakerId: number;
    optionIds: number[];
}

// The season's personalities if a season is on; otherwise (practice) made up, the same every time.
function personalitiesFor(gs: GameState): { [id: number]: PersonalityId } {
    const live = currentPersonalities();
    if (live && gs.houseguests.some((hg) => live[hg.id])) return live;
    return assignPersonalities(gs.houseguests, Math.abs(hashcode(gs.houseguests.map((h) => h.name).join("|"))) || 1);
}

export function makeQuotes(gs: GameState, rand: Rand): Quote[] {
    const ps = personalitiesFor(gs);
    const speakers = gs.houseguests.filter((hg) => ps[hg.id]);
    const distinct = new Set(speakers.map((hg) => ps[hg.id])).size;
    if (speakers.length < 2 || distinct < 2) return [];
    const quotes: Quote[] = [];
    const used = new Set<string>();
    let guard = 0;
    while (quotes.length < QUOTES && guard++ < 100) {
        const speaker = pick(rand, speakers);
        const p = ps[speaker.id];
        const did = rand() < 0.3;
        const situation = pick(rand, did ? DID : SAID);
        const others = gs.houseguests.filter((hg) => hg.id !== speaker.id);
        const about: Houseguest = others.length ? pick(rand, others) : speaker;
        const line = voice(p, situation, `${quotes.length}:${randInt(rand, 0, 99999)}`, about.name);
        if (used.has(line)) continue;
        used.add(line);
        // the others to choose from: different personalities, so the voice gives it away
        const decoys: Houseguest[] = [];
        const seen = new Set<PersonalityId>([p]);
        shuffled(rand, speakers).forEach((hg) => {
            if (decoys.length < 3 && hg.id !== speaker.id && !seen.has(ps[hg.id])) {
                decoys.push(hg);
                seen.add(ps[hg.id]);
            }
        });
        if (decoys.length === 0) continue;
        quotes.push({ text: line, did, speakerId: speaker.id, optionIds: shuffled(rand, [speaker.id, ...decoys.map((d) => d.id)]) });
    }
    return quotes;
}

function nameOf(gs: GameState, id: number): string {
    const hg = gs.houseguests.find((h) => h.id === id);
    return hg ? hg.name : "?";
}

function WhoSaidIt(props: CompProps) {
    const [quotes] = React.useState(() => makeQuotes(props.gameState, props.rand));
    const [index, setIndex] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [start] = React.useState(() => clock.now());
    const [qStart, setQStart] = React.useState(() => clock.now());
    const [, tick] = React.useState(0);
    const { finish, report, recordAnswer, gameState } = props;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 200);
        return () => clearInterval(t);
    }, []);
    const left = QUOTE_SECONDS - (clock.now() - qStart) / 1000;

    const answer = (id: number | null) => {
        if (reveal) return;
        const q = quotes[index];
        const right = id === q.speakerId;
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        report(c * 100);
        const mine = id === null ? "no answer" : nameOf(gameState, id);
        if (recordAnswer) recordAnswer(index, right, mine);
        clock.pause();
        const truth = nameOf(gameState, q.speakerId);
        setReveal({
            index,
            verdict: right ? "✅ Right!" : id === null ? "⏰ Time's up!" : "❌ Wrong!",
            correctText: truth,
            answerLabel: q.did ? "It was" : "Said by",
            rows: revealRows(props, index, { correct: right, answer: mine }, (ok, pickName) =>
                ok ? truth : typeof pickName === "string" ? pickName : nameOf(gameState, q.optionIds.find((o) => o !== q.speakerId)!)
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= quotes.length) finish(correct * 100 + Math.max(0, 99 - ((clock.now() - start) / 1000) * 1.2));
        else {
            setIndex(index + 1);
            setQStart(clock.now());
        }
    };
    React.useEffect(() => {
        if (quotes.length === 0) {
            finish(0);
            return;
        }
        if (!reveal && left <= 0) answer(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [left, reveal]);

    if (quotes.length === 0) return <Subtle>Not enough different voices in the house to quote.</Subtle>;
    const q = quotes[index];
    return (
        <div>
            <QuizScoreboard human={props.human} humanCorrect={correct} opponents={props.opponents} answered={reveal ? index + 1 : index} total={quotes.length} />
            <Title>
                {q.did ? "Who did it?" : "Who said it?"} ({index + 1} of {quotes.length})
            </Title>
            <p className="bbb-quote" style={{ fontSize: "1.25rem", margin: "12px auto", maxWidth: 520, fontStyle: q.did ? "normal" : "italic" }}>
                {q.did ? `Who ${q.text}` : `“${q.text}”`}
            </p>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= quotes.length} onNext={next} />
            ) : (
                <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                        {q.optionIds.map((id) => {
                            const hg = gameState.houseguests.find((h) => h.id === id)!;
                            return (
                                <button key={id} type="button" className="button is-light bbb-quote-option" onClick={() => answer(id)}>
                                    {hg.imageURL && <img src={hg.imageURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", marginRight: 6 }} />}
                                    {hg.name}
                                </button>
                            );
                        })}
                    </div>
                    <Subtle>{Math.max(0, Math.ceil(left))}s</Subtle>
                </>
            )}
        </div>
    );
}

function simulateWhoSaidIt(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same quotes; a bot that's paid attention to how everyone talks knows, otherwise it guesses
    const quotes = makeQuotes(ctx.gameState, seededRand(ctx.seed));
    const knows = clamp(0.1 + 0.65 * skill + 0.05 * gaussian(noise), 0.05, 0.9);
    const answers = quotes.map((q) => answerQuestion(noise, knows, q.optionIds.length));
    const picks = quotes.map((q, i) => nameOf(ctx.gameState, answers[i] ? q.speakerId : q.optionIds.filter((o) => o !== q.speakerId)[Math.floor(noise() * (q.optionIds.length - 1))]));
    const seconds = quotes.length * (3 + (1 - skill) * 4);
    return { score: answers.filter(Boolean).length * 100 + Math.max(0, 99 - seconds * 1.2), answers, picks };
}

export const WhoSaidItComp: CompDefinition = {
    id: "who-said-it",
    name: "Who Said It?",
    emoji: "🗣️",
    kind: "quiz",
    rules: `${QUOTES} things houseguests say (and do), in their own words. Who said it? Everyone has their own way of talking: if you've been listening, you'll know. ${QUOTE_SECONDS} seconds each; most right wins.`,
    maxSeconds: QUOTES * QUOTE_SECONDS + 20,
    Component: WhoSaidIt,
    simulate: simulateWhoSaidIt,
    botScore: (p) => Math.min(QUOTES, Math.round(QUOTES * (0.3 + 0.55 * p))) * 100 + p * 60,
    format: (s) => `${Math.floor(s / 100)}/${QUOTES} right`,
    progress: (r, n) => rightSoFar(r, n) * 100,
};

// ---------------- Buzzer Bash ----------------
// Push your luck: a board of buttons, a few of them buzzers. Every safe press scores; hit a buzzer and the round's
// points are gone. Stop whenever you like. Three rounds.

const BUZZ_ROUNDS = 3;
const BUZZ_BUTTONS = 12;
const BUZZERS = 2;

function boards(rand: Rand): boolean[][] {
    return Array.from({ length: BUZZ_ROUNDS }, () => {
        const buzz = new Set<number>();
        while (buzz.size < BUZZERS) buzz.add(randInt(rand, 0, BUZZ_BUTTONS - 1));
        return Array.from({ length: BUZZ_BUTTONS }, (_, i) => buzz.has(i));
    });
}

function BuzzerBash(props: CompProps) {
    const [board] = React.useState(() => boards(props.rand));
    const [round, setRound] = React.useState(0);
    const [pressed, setPressed] = React.useState<number[]>([]);
    const [banked, setBanked] = React.useState<number[]>([]); // each finished round's points
    const [over, setOver] = React.useState<"banked" | "buzzed" | null>(null);
    const { report, finish, recordAnswer } = props;
    const total = banked.reduce((a, b) => a + b, 0);
    const safe = pressed.filter((i) => !board[round][i]).length;

    const press = (i: number) => {
        if (over || pressed.includes(i)) return;
        const next = [...pressed, i];
        setPressed(next);
        if (board[round][i]) {
            setOver("buzzed");
            if (recordAnswer) recordAnswer(round, false, 0);
        } else if (next.length === BUZZ_BUTTONS - BUZZERS) {
            endRound(next.length);
        }
    };
    const endRound = (points: number) => {
        setOver("banked");
        if (recordAnswer) recordAnswer(round, true, points);
        report(total + points);
    };
    const nextRound = () => {
        const points = over === "banked" ? safe : 0;
        const all = [...banked, points];
        setBanked(all);
        setPressed([]);
        setOver(null);
        if (round + 1 >= BUZZ_ROUNDS) finish(all.reduce((a, b) => a + b, 0));
        else setRound(round + 1);
    };
    return (
        <div>
            <Title>
                Round {round + 1} of {BUZZ_ROUNDS} · {total} banked
            </Title>
            <Subtle>
                {BUZZERS} of these {BUZZ_BUTTONS} buttons are buzzers. Each safe press is a point; a buzzer loses this round's points. Bank whenever you like.
            </Subtle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, maxWidth: 320, margin: "12px auto" }}>
                {board[round].map((buzz, i) => {
                    const open = pressed.includes(i) || over !== null;
                    return (
                        <button
                            key={i}
                            type="button"
                            className="button"
                            aria-label={open ? (buzz ? "Buzzer" : "Safe") : `Button ${i + 1}`}
                            disabled={open}
                            onClick={() => press(i)}
                            style={{
                                height: 56,
                                fontSize: "1.4rem",
                                background: open ? (buzz ? "#ef4444" : "#22c55e") : "linear-gradient(#fbbf24, #f59e0b)",
                                opacity: open && !pressed.includes(i) ? 0.45 : 1,
                            }}
                        >
                            {open ? (buzz ? "🚨" : "✓") : ""}
                        </button>
                    );
                })}
            </div>
            {over === null && (
                <BigButton kind="success" onClick={() => endRound(safe)} disabled={safe === 0}>
                    💰 Bank {safe} point{safe === 1 ? "" : "s"}
                </BigButton>
            )}
            {over !== null && (
                <div>
                    <Title>{over === "buzzed" ? `🚨 Buzzed! This round's ${safe} point${safe === 1 ? "" : "s"} are gone.` : `💰 Banked ${safe}!`}</Title>
                    <BigButton kind="success" onClick={nextRound}>
                        {round + 1 >= BUZZ_ROUNDS ? "See how I did" : "Next round"}
                    </BigButton>
                </div>
            )}
        </div>
    );
}

function simulateBuzzerBash(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same boards: each bot has a number of presses it dares, a little smarter (closer to the best odds) if skilled
    const b = boards(seededRand(ctx.seed));
    const picks: number[] = [];
    const answers: boolean[] = [];
    b.forEach((board) => {
        const dare = clamp(Math.round(3 + 2 * skill + 2 * gaussian(noise)), 1, BUZZ_BUTTONS - BUZZERS);
        const order = shuffled(noise, board.map((_, i) => i));
        let points = 0;
        let buzzed = false;
        for (let k = 0; k < dare; k++) {
            if (board[order[k]]) {
                buzzed = true;
                break;
            }
            points++;
        }
        answers.push(!buzzed);
        picks.push(buzzed ? 0 : points);
    });
    return { score: picks.reduce((a, c) => a + c, 0), answers, picks };
}

export const BuzzerBashComp: CompDefinition = {
    id: "buzzer-bash",
    name: "Buzzer Bash",
    emoji: "🚨",
    kind: "luck",
    rules: `${BUZZ_ROUNDS} rounds of ${BUZZ_BUTTONS} buttons, ${BUZZERS} of them buzzers. Every safe press is a point. Bank your points whenever you like, but hit a buzzer and that round's points are gone. Most points wins.`,
    maxSeconds: 120,
    Component: BuzzerBash,
    simulate: simulateBuzzerBash,
    botScore: (p) => Math.round(3 * (2 + 2 * p)),
    format: (s) => `${s} point${s === 1 ? "" : "s"}`,
    progress: (r, n) => sumSoFar(r, n),
};
