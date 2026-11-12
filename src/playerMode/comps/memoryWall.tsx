import React from "react";
import { GameState, nonEvictedHouseguests } from "../../model";
import { BigButton, Face, Grid, Subtle, Title, useElapsed } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { answerQuestion, chance, clamp, gaussian, Rand, sample, seededRand, shuffled } from "./random";
import { AnswerReveal, QuizScoreboard, Reveal, revealRows, rightSoFar, useQuizClock, wrongOption } from "./compUi";

const ITEMS = ["🍕", "🎸", "👑", "🔑", "🐍", "💎", "🎲", "🧸", "🍩", "🚀", "🌵", "🎩"];
const QUESTIONS = 8;
const STUDY_SECONDS = 25;

interface Card {
    hg: { id: number; name: string; imageURL: string };
    item: string;
}

interface Question {
    prompt: React.ReactNode;
    // face options carry the houseguest: they're drawn as a tappable Face (a Face is itself a button)
    options: { key: string; node?: React.ReactNode; hg?: Card["hg"] }[];
    answer: string;
    about: number; // id of the houseguest whose card the question is about
}

function buildQuestions(cards: Card[], rand: Rand): Question[] {
    const questions: Question[] = [];
    for (let i = 0; i < QUESTIONS; i++) {
        const card = cards[i % cards.length];
        const others = cards.filter((c) => c !== card);
        if (i % 2 === 0) {
            // "What did NAME have?"
            const wrong = sample(
                rand,
                ITEMS.filter((it) => it !== card.item),
                3
            );
            questions.push({
                prompt: (
                    <span>
                        What item did <b>{card.hg.name}</b> have?
                    </span>
                ),
                options: shuffled(rand, [card.item, ...wrong]).map((it) => ({
                    key: it,
                    node: <span style={{ fontSize: "2rem" }}>{it}</span>,
                })),
                answer: card.item,
                about: card.hg.id,
            });
        } else {
            // "Who had ITEM?"
            const wrong = sample(rand, others, 3);
            questions.push({
                prompt: (
                    <span>
                        Who had the <span style={{ fontSize: "1.6rem" }}>{card.item}</span>?
                    </span>
                ),
                options: shuffled(rand, [card, ...wrong]).map((c) => ({
                    key: `${c.hg.id}`,
                    hg: c.hg,
                })),
                answer: `${card.hg.id}`,
                about: card.hg.id,
            });
        }
    }
    return shuffled(rand, questions);
}

// The wall and its questions. Players and bots all get the same one from the comp's seed.
export function generateMemoryWall(rand: Rand, gs: GameState): { cards: Card[]; questions: Question[] } {
    const people = sample(rand, nonEvictedHouseguests(gs), 6);
    const items = sample(rand, ITEMS, people.length);
    const cards = people.map((hg, i) => ({ hg, item: items[i] }));
    return { cards, questions: buildQuestions(cards, rand) };
}

function simulateMemoryWall(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const { cards, questions } = generateMemoryWall(seededRand(ctx.seed), ctx.gameState);
    // the bot remembers each card on the wall (or not), then answers the same questions
    const recall = clamp(0.25 + 0.7 * skill + 0.08 * gaussian(noise), 0.05, 0.98);
    const remembers = new Set(cards.filter(() => chance(noise, recall)).map((c) => c.hg.id));
    const answers = questions.map((q) => answerQuestion(noise, remembers.has(q.about) ? 1 : 0, q.options.length));
    const correct = answers.filter(Boolean).length;
    const seconds = 25 + (1 - skill) * 80 + 6 * gaussian(noise);
    return { score: correct * 100 + Math.max(0, 99 - seconds), answers };
}

function MemoryWall(props: CompProps) {
    const [{ cards, questions }] = React.useState(() => generateMemoryWall(props.rand, props.gameState));
    const [phase, setPhase] = React.useState<"study" | "quiz">("study");
    const [index, setIndex] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [quizStart, setQuizStart] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const elapsed = useElapsed(phase === "study");

    React.useEffect(() => {
        if (phase === "study" && elapsed >= STUDY_SECONDS) {
            setPhase("quiz");
            setQuizStart(clock.now());
        }
    }, [phase, elapsed, clock]);

    if (phase === "study") {
        return (
            <div>
                <Title>Memorize the wall!</Title>
                <Subtle>{Math.max(0, Math.ceil(STUDY_SECONDS - elapsed))} seconds left</Subtle>
                <Grid>
                    {cards.map((c) => (
                        <Face key={c.hg.id} hg={c.hg} caption={<span style={{ fontSize: "2rem" }}>{c.item}</span>} />
                    ))}
                </Grid>
                <BigButton
                    onClick={() => {
                        setPhase("quiz");
                        setQuizStart(clock.now());
                    }}
                >
                    I'm ready
                </BigButton>
            </div>
        );
    }

    const q = questions[index];
    const labelOf = (key: string) => {
        const card = cards.find((c) => `${c.hg.id}` === key);
        return card ? card.hg.name : key;
    };
    const answer = (key: string) => {
        if (reveal) return;
        const right = key === q.answer;
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        props.report(c * 100);
        if (props.recordAnswer) props.recordAnswer(index, right, labelOf(key));
        clock.pause();
        const labels = q.options.map((o) => labelOf(o.key));
        const truth = labelOf(q.answer);
        setReveal({
            index,
            verdict: right ? "✅ Right!" : "❌ Wrong!",
            correctText: truth,
            rows: revealRows(props, index, { correct: right, answer: labelOf(key) }, (ok, pick, id) =>
                ok ? truth : typeof pick === "string" ? pick : wrongOption(labels, truth, `${id}:${index}`)
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= questions.length) {
            const secs = (clock.now() - quizStart) / 1000;
            props.finish(correct * 100 + Math.max(0, 99 - secs));
        } else {
            setIndex(index + 1);
        }
    };
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
                <Grid>
                    {q.options.map((o) =>
                        o.hg ? (
                            <Face key={o.key} hg={o.hg} onClick={() => answer(o.key)} />
                        ) : (
                        <button
                            type="button"
                            key={o.key}
                            className="button"
                            style={{ height: "auto", padding: 6, touchAction: "manipulation" }}
                            onClick={() => answer(o.key)}
                        >
                            {o.node}
                        </button>
                        )
                    )}
                </Grid>
            )}
        </div>
    );
}

export const MemoryWallComp: CompDefinition = {
    id: "memory-wall",
    name: "Who Had What",
    emoji: "🧠",
    kind: "memory",
    rules: `Houseguests appear with a mystery item each. You have ${STUDY_SECONDS} seconds to memorize who had what, then answer ${QUESTIONS} questions. Most right answers wins; ties go to a tiebreaker.`,
    maxSeconds: 180,
    Component: MemoryWall,
    simulate: simulateMemoryWall,
    botScore: (p) => {
        const correct = Math.min(QUESTIONS, Math.round(QUESTIONS * (0.25 + 0.75 * p)));
        return correct * 100 + Math.max(0, 99 - (25 + (1 - p) * 80));
    },
    format: (s) => `${Math.floor(s / 100)}/${QUESTIONS} correct`,
    progress: (r, n) => rightSoFar(r, n) * 100,
};
