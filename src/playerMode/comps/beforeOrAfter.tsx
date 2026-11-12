import React from "react";
import { DAY_PART, dayLabel } from "../days";
import { GameState, getById, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { Face, Grid, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { answerQuestion, clamp, gaussian, Rand, sample, seededRand, shuffled } from "./random";
import { AnswerReveal, QuizScoreboard, Reveal, revealRows, rightSoFar, useQuizClock, wrongOption } from "./compUi";

const MAX_QUESTIONS = 8;
const SECONDS_PER_QUESTION = 15;

interface Question {
    prompt: string;
    options: { key: string; label?: string; hg?: Houseguest }[];
    answer: string;
}

function faceOptions(gs: GameState, answer: Houseguest, rand: Rand): Question["options"] {
    const wrong = sample(
        rand,
        gs.houseguests.filter((hg) => hg.id !== answer.id),
        3
    );
    return shuffled(rand, [answer, ...wrong]).map((hg) => ({ key: `${hg.id}`, hg }));
}

const yesNo = [
    { key: "yes", label: "Yes" },
    { key: "no", label: "No" },
];

export function buildQuiz(gs: GameState, history: WeekRecord[], rand: Rand): Question[] {
    const qs: Question[] = [];
    history.forEach((w) => {
        if (w.hohId !== undefined) {
            qs.push({
                prompt: `Who won Head of House on ${dayLabel(gs, w.week, DAY_PART.hoh)}?`,
                options: faceOptions(gs, getById(gs, w.hohId), rand),
                answer: `${w.hohId}`,
            });
        }
        if (w.povId !== undefined) {
            qs.push({
                prompt: `Who won the Veto on ${dayLabel(gs, w.week, DAY_PART.veto)}?`,
                options: faceOptions(gs, getById(gs, w.povId), rand),
                answer: `${w.povId}`,
            });
        }
        if (w.evictedIds.length > 0) {
            qs.push({
                prompt: `Who was evicted on ${dayLabel(gs, w.week, DAY_PART.eviction)}?`,
                options: faceOptions(gs, getById(gs, w.evictedIds[0]), rand),
                answer: `${w.evictedIds[0]}`,
            });
        }
    });
    // "Was A evicted before B?"
    const evictionOrder = history.flatMap((w) => w.evictedIds);
    if (evictionOrder.length >= 2) {
        for (let k = 0; k < 3; k++) {
            const [a, b] = sample(rand, evictionOrder, 2);
            const aFirst = evictionOrder.indexOf(a) < evictionOrder.indexOf(b);
            qs.push({
                prompt: `Was ${getById(gs, a).name} evicted BEFORE ${getById(gs, b).name}?`,
                options: yesNo,
                answer: aFirst ? "yes" : "no",
            });
        }
    }
    // "Was A ever nominated?"
    sample(rand, gs.houseguests, 3).forEach((hg) => {
        const nominated = history.some((w) => w.nomineeIds.includes(hg.id));
        qs.push({
            prompt: `Did ${hg.name} ever face eviction on the block (after the veto ceremony)?`,
            options: yesNo,
            answer: nominated ? "yes" : "no",
        });
    });
    return sample(rand, qs, MAX_QUESTIONS);
}

function simulateBeforeOrAfter(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const questions = buildQuiz(ctx.gameState, ctx.history, seededRand(ctx.seed));
    // how well this bot remembers the season
    const memory = clamp(0.3 + 0.65 * skill + 0.08 * gaussian(noise), 0.05, 0.98);
    const answers = questions.map((q) => answerQuestion(noise, memory, q.options.length));
    const correct = answers.filter(Boolean).length;
    const seconds = 30 + (1 - skill) * 70;
    return { score: correct * 100 + Math.max(0, 99 - seconds * 0.66), answers };
}

function BeforeOrAfter(props: CompProps) {
    const [questions] = React.useState(() => buildQuiz(props.gameState, props.history, props.rand));
    const [index, setIndex] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [start] = React.useState(() => clock.now());
    const [questionStart, setQuestionStart] = React.useState(() => clock.now());
    const [, tick] = React.useState(0);
    const { finish, report, recordAnswer } = props;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 250);
        return () => clearInterval(t);
    }, []);

    const labelOf = (q: Question, key: string) => {
        const o = q.options.find((x) => x.key === key);
        return o ? (o.hg ? o.hg.name : o.label || key) : key;
    };

    const answer = (key: string | null) => {
        if (reveal) return;
        const q = questions[index];
        const right = key === q.answer;
        const c = correct + (right ? 1 : 0);
        const mine = key === null ? "no answer" : labelOf(q, key);
        setCorrect(c);
        report(c * 100);
        if (recordAnswer) recordAnswer(index, right, mine);
        clock.pause();
        const labels = q.options.map((o) => labelOf(q, o.key));
        const truth = labelOf(q, q.answer);
        setReveal({
            index,
            verdict: right ? "✅ Right!" : key === null ? "⏰ Time's up!" : "❌ Wrong!",
            correctText: truth,
            rows: revealRows(props, index, { correct: right, answer: mine }, (ok, pick, id) =>
                ok ? truth : typeof pick === "string" ? pick : wrongOption(labels, truth, `${id}:${index}`)
            ),
        });
    };

    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= questions.length) {
            finish(correct * 100 + Math.max(0, 99 - ((clock.now() - start) / 1000) * 0.66));
        } else {
            setIndex(index + 1);
            setQuestionStart(clock.now());
        }
    };

    const left = SECONDS_PER_QUESTION - (clock.now() - questionStart) / 1000;
    React.useEffect(() => {
        if (!reveal && questions.length > 0 && left <= 0) answer(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [left, reveal]);

    if (questions.length === 0) {
        return <Subtle>No questions available.</Subtle>;
    }
    const q = questions[index];
    return (
        <div>
            <QuizScoreboard
                human={props.human}
                humanCorrect={correct}
                opponents={props.opponents}
                answered={reveal ? index + 1 : index}
                total={questions.length}
            />
            <Title>
                Question {index + 1} of {questions.length}
            </Title>
            <p style={{ fontSize: "1.2rem", margin: "8px 0" }}>{q.prompt}</p>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= questions.length} onNext={next} />
            ) : (
                <>
                    <Subtle>{Math.max(0, Math.ceil(left))}s</Subtle>
                    <Grid>
                        {q.options.map((o) =>
                            o.hg ? (
                                <Face key={o.key} hg={o.hg} onClick={() => answer(o.key)} />
                            ) : (
                                <button
                                    type="button"
                                    key={o.key}
                                    className="button is-medium"
                                    style={{ minWidth: 120, touchAction: "manipulation" }}
                                    onClick={() => answer(o.key)}
                                >
                                    {o.label}
                                </button>
                            )
                        )}
                    </Grid>
                </>
            )}
        </div>
    );
}

export const BeforeOrAfterComp: CompDefinition = {
    id: "before-or-after",
    name: "Before or After",
    emoji: "❓",
    kind: "quiz",
    finaleOnly: true,
    rules: `How well do you know this season? Answer up to ${MAX_QUESTIONS} questions about past HoHs, vetoes, nominations and evictions. ${SECONDS_PER_QUESTION} seconds per question. Most right answers wins; ties go to a tiebreaker.`,
    maxSeconds: MAX_QUESTIONS * SECONDS_PER_QUESTION + 15,
    Component: BeforeOrAfter,
    simulate: simulateBeforeOrAfter,
    botScore: (p, ctx) => {
        const n = Math.min(MAX_QUESTIONS, Math.max(1, buildQuizSize(ctx.history, ctx.gameState)));
        const c = Math.min(n, Math.round(n * (0.3 + 0.7 * p)));
        return c * 100 + Math.max(0, 99 - (30 + (1 - p) * 70) * 0.66);
    },
    format: (s) => `${Math.floor(s / 100)} correct`,
    progress: (r, n) => rightSoFar(r, n) * 100,
    available: (_gs, history) => history.filter((w) => w.evictedIds.length > 0).length >= 2,
};

function buildQuizSize(history: WeekRecord[], gs: GameState): number {
    return buildQuiz(gs, history, seededRand(1)).length;
}
