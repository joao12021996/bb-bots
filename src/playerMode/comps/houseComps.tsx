import React from "react";
import { GameState } from "../../model";
import { WeekRecord } from "../history";
import { Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, QuizScoreboard, Reveal, revealRows, rightSoFar, useQuizClock, wrongOption } from "./compUi";
import { answerQuestion, chance, clamp, gaussian, pick, Rand, sample, seededRand, shuffled } from "./random";

// Comps about the houseguests themselves. Scored as correct * 100 + a speed bonus, with a live scoreboard.

// ---------------- Zoom In ----------------

const ZOOM_ROUNDS = 6;
const ZOOM_SECONDS = 8;

// The photos, answer choices and zoom points, the same for every player and bot.
export function generateZoomRounds(rand: Rand, gs: GameState) {
    const pool = gs.houseguests;
    return Array.from({ length: ZOOM_ROUNDS }, () => {
        const target = pick(rand, pool);
        const options = shuffled(rand, [target, ...sample(rand, pool.filter((h) => h.id !== target.id), 3)]);
        return { target, options, ox: 20 + rand() * 60, oy: 20 + rand() * 60 };
    });
}

function ZoomIn(props: CompProps) {
    const [rounds] = React.useState(() => generateZoomRounds(props.rand, props.gameState));
    const [round, setRound] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [bonus, setBonus] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [roundStart, setRoundStart] = React.useState(() => clock.now());
    const [, tick] = React.useState(0);
    const { finish, report, recordAnswer } = props;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 100);
        return () => clearInterval(t);
    }, []);
    const secs = (clock.now() - roundStart) / 1000;

    const answer = (id: number | null) => {
        if (reveal) return;
        const r = rounds[round];
        const right = id === r.target.id;
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        setBonus(bonus + (right ? Math.max(0, (ZOOM_SECONDS - secs) / ZOOM_SECONDS) * (99 / ZOOM_ROUNDS) : 0));
        report(c * 100);
        const mine = id === null ? "no answer" : r.options.find((o) => o.id === id)!.name;
        if (recordAnswer) recordAnswer(round, right, mine);
        clock.pause();
        const labels = r.options.map((o) => o.name);
        setReveal({
            index: round,
            verdict: right ? "✅ Right!" : id === null ? "⏰ Time's up!" : "❌ Wrong!",
            correctText: r.target.name,
            rows: revealRows(props, round, { correct: right, answer: mine }, (ok, pick, who) =>
                ok ? r.target.name : typeof pick === "string" ? pick : wrongOption(labels, r.target.name, `${who}:${round}`)
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (round + 1 >= ZOOM_ROUNDS) finish(correct * 100 + bonus);
        else {
            setRound(round + 1);
            setRoundStart(clock.now());
        }
    };

    React.useEffect(() => {
        if (!reveal && secs > ZOOM_SECONDS) answer(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secs, reveal]);

    const r = rounds[round];
    const scale = reveal ? 1 : Math.max(1, 7 - (secs / ZOOM_SECONDS) * 6);
    return (
        <div>
            <QuizScoreboard
                human={props.human}
                humanCorrect={correct}
                opponents={props.opponents}
                answered={reveal ? round + 1 : round}
                total={ZOOM_ROUNDS}
            />
            <Title>
                Who is it? ({round + 1}/{ZOOM_ROUNDS})
            </Title>
            <div style={{ width: 180, height: 180, margin: "8px auto", overflow: "hidden", borderRadius: 12, background: "#000" }}>
                <img
                    src={r.target.imageURL}
                    alt=""
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: `scale(${scale})`,
                        transformOrigin: `${r.ox}% ${r.oy}%`,
                    }}
                />
            </div>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={round + 1 >= ZOOM_ROUNDS} onNext={next} />
            ) : (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 360, margin: "0 auto" }}>
                        {r.options.map((o) => (
                            <button type="button" key={o.id} className="button is-medium" style={{ touchAction: "manipulation" }} onClick={() => answer(o.id)}>
                                {o.name}
                            </button>
                        ))}
                    </div>
                    <Subtle>{Math.max(0, Math.ceil(ZOOM_SECONDS - secs))}s</Subtle>
                </>
            )}
        </div>
    );
}

function simulateZoomIn(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same photos: a bot recognizes each one after some time (or never, and guesses)
    const rounds = generateZoomRounds(seededRand(ctx.seed), ctx.gameState);
    let bonus = 0;
    const answers = rounds.map((r) => {
        // average bots get most of them, weak ones run out of time (and guess) more often than not
        const seconds = 2 + (1 - skill) * 10 + 1.5 * gaussian(noise);
        if (seconds < ZOOM_SECONDS) {
            bonus += Math.max(0, (ZOOM_SECONDS - seconds) / ZOOM_SECONDS) * (99 / ZOOM_ROUNDS);
            return true;
        }
        return chance(noise, 1 / r.options.length);
    });
    return { score: answers.filter(Boolean).length * 100 + bonus, answers };
}

export const ZoomInComp: CompDefinition = {
    id: "zoom-in",
    name: "Zoom In",
    emoji: "🔎",
    kind: "quiz",
    rules: `A super zoomed-in photo of a houseguest slowly zooms out. Name them as fast as you can. ${ZOOM_ROUNDS} rounds, ${ZOOM_SECONDS} seconds each. Most right wins; faster answers break ties.`,
    maxSeconds: ZOOM_ROUNDS * ZOOM_SECONDS + 20,
    Component: ZoomIn,
    simulate: simulateZoomIn,
    botScore: (p) => {
        const c = Math.min(ZOOM_ROUNDS, Math.round(ZOOM_ROUNDS * (0.35 + 0.65 * p)));
        return c * 100 + c * (99 / ZOOM_ROUNDS) * (0.3 + 0.5 * p);
    },
    format: (s) => `${Math.floor(s / 100)}/${ZOOM_ROUNDS} right`,
    progress: (r, n) => rightSoFar(r, n) * 100,
};

// ---------------- Fact or Fiction ----------------

const FACTS = 10;
const FACT_SECONDS = 8;

interface Fact {
    text: string;
    truth: boolean;
}

// How many former houseguests Fact or Fiction needs: it's a late-game comp.
export const FACT_MIN_EVICTED = 4;

// Statements about former houseguests only: the people who've already left the house.
export function makeFacts(gs: GameState, rand: Rand, history: WeekRecord[] = []): Fact[] {
    const former = gs.houseguests.filter((hg) => hg.isEvicted);
    if (former.length < 2) return [];
    // eviction order, from the season's history
    const order = (id: number) => history.findIndex((w) => w.evictedIds.includes(id));
    const gens: (() => Fact | null)[] = [
        () => {
            const a = pick(rand, former);
            return { text: `${a.name} won Head of House at least once.`, truth: a.hohWins > 0 };
        },
        () => {
            const a = pick(rand, former);
            return { text: `${a.name} was never nominated.`, truth: a.nominations === 0 };
        },
        () => {
            const [a, b] = sample(rand, former, 2);
            return { text: `${a.name} was nominated more times than ${b.name}.`, truth: a.nominations > b.nominations };
        },
        () => {
            const [a, b] = sample(rand, former, 2);
            return { text: `${a.name} won more vetoes than ${b.name}.`, truth: a.povWins > b.povWins };
        },
        () => {
            const a = pick(rand, former);
            return { text: `${a.name} won the Veto at least once.`, truth: a.povWins > 0 };
        },
        () => {
            const a = pick(rand, former);
            return { text: `${a.name} made the jury.`, truth: !!a.isJury };
        },
        () => {
            const [a, b] = sample(rand, former, 2);
            if (order(a.id) < 0 || order(b.id) < 0 || order(a.id) === order(b.id)) return null;
            return { text: `${a.name} was evicted before ${b.name}.`, truth: order(a.id) < order(b.id) };
        },
    ];
    const facts: Fact[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (facts.length < FACTS && guard++ < 200) {
        const f = pick(rand, gens)();
        if (!f) continue;
        // keep roughly half true and half false
        const trues = facts.filter((x) => x.truth).length;
        if (seen.has(f.text)) continue;
        if (f.truth && trues >= FACTS / 2 + 1) continue;
        if (!f.truth && facts.length - trues >= FACTS / 2 + 1) continue;
        seen.add(f.text);
        facts.push(f);
    }
    return facts;
}

function FactOrFiction(props: CompProps) {
    const [facts] = React.useState(() => makeFacts(props.gameState, props.rand, props.history));
    const [index, setIndex] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [start] = React.useState(() => clock.now());
    const [qStart, setQStart] = React.useState(() => clock.now());
    const [, tick] = React.useState(0);
    const { finish, report, recordAnswer } = props;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 200);
        return () => clearInterval(t);
    }, []);
    const left = FACT_SECONDS - (clock.now() - qStart) / 1000;
    const label = (b: boolean) => (b ? "FACT" : "FICTION");

    const answer = (said: boolean | null) => {
        if (reveal) return;
        const right = said !== null && said === facts[index].truth;
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        report(c * 100);
        const mine = said === null ? "no answer" : label(said);
        if (recordAnswer) recordAnswer(index, right, mine);
        clock.pause();
        const truth = label(facts[index].truth);
        setReveal({
            index,
            verdict: right ? "✅ Right!" : said === null ? "⏰ Time's up!" : "❌ Wrong!",
            correctText: truth,
            rows: revealRows(props, index, { correct: right, answer: mine }, (ok, pick) =>
                ok ? truth : typeof pick === "string" ? pick : label(!facts[index].truth)
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= facts.length) finish(correct * 100 + Math.max(0, 99 - ((clock.now() - start) / 1000) * 1.2));
        else {
            setIndex(index + 1);
            setQStart(clock.now());
        }
    };
    React.useEffect(() => {
        if (facts.length === 0) {
            finish(0); // nobody has left the house yet: nothing to ask
            return;
        }
        if (!reveal && left <= 0) answer(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [left, reveal]);

    if (facts.length === 0) return <Subtle>Nobody has left the house yet: there's nothing to ask about.</Subtle>;
    return (
        <div>
            <QuizScoreboard
                human={props.human}
                humanCorrect={correct}
                opponents={props.opponents}
                answered={reveal ? index + 1 : index}
                total={facts.length}
            />
            <Title>
                Fact {index + 1} of {facts.length}
            </Title>
            <p style={{ fontSize: "1.3rem", margin: "12px auto", maxWidth: 480 }}>{facts[index].text}</p>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= facts.length} onNext={next} />
            ) : (
                <>
                    <div>
                        <button type="button" className="button is-success is-large" style={{ margin: 6, minWidth: 130 }} onClick={() => answer(true)}>
                            FACT
                        </button>
                        <button type="button" className="button is-danger is-large" style={{ margin: 6, minWidth: 130 }} onClick={() => answer(false)}>
                            FICTION
                        </button>
                    </div>
                    <Subtle>{Math.max(0, Math.ceil(left))}s</Subtle>
                </>
            )}
        </div>
    );
}

function simulateFactOrFiction(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same statements; a bot either knows the truth or guesses
    const facts = makeFacts(ctx.gameState, seededRand(ctx.seed), ctx.history);
    // nobody tracks every nomination and veto: an average bot knows about half, and guesses the rest
    const knows = clamp(0.15 + 0.7 * skill + 0.05 * gaussian(noise), 0.05, 0.95);
    const answers = facts.map(() => answerQuestion(noise, knows, 2));
    const seconds = facts.length * (2.5 + (1 - skill) * 3);
    return { score: answers.filter(Boolean).length * 100 + Math.max(0, 99 - seconds * 1.2), answers };
}

export const FactOrFictionComp: CompDefinition = {
    id: "fact-or-fiction",
    name: "Fact or Fiction",
    emoji: "📜",
    kind: "quiz",
    rules: `${FACTS} statements about the houseguests who've already left: HoH wins, nominations, vetoes, who went home when. Is each one FACT or FICTION? ${FACT_SECONDS} seconds each. Most right wins; ties go to a tiebreaker.`,
    maxSeconds: FACTS * FACT_SECONDS + 20,
    Component: FactOrFiction,
    simulate: simulateFactOrFiction,
    botScore: (p) => Math.min(FACTS, Math.round(FACTS * (0.45 + 0.5 * p))) * 100 + p * 60,
    format: (s) => `${Math.floor(s / 100)}/${FACTS} right`,
    progress: (r, n) => rightSoFar(r, n) * 100,
    // a late-game comp: there have to be enough former houseguests to ask about
    available: (gs) => gs.houseguests.filter((hg) => hg.isEvicted).length >= FACT_MIN_EVICTED,
};

