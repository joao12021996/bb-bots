import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Face, Grid, Subtle, Title } from "../ui/common";
import { GameState } from "../../model";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, bestOf, Reveal, revealRows, sumSoFar } from "./compUi";
import { gaussian, pick, Rand, sample, seededRand, shuffled } from "./random";

const ROUNDS = 3;
const PER_ROUND = 5;

interface Criterion {
    label: string;
    // lower key = should be placed earlier
    key: (hg: Houseguest) => number | string;
}

const CRITERIA: Criterion[] = [
    { label: "Most HoH wins first", key: (hg) => -hg.hohWins },
    { label: "Most veto wins first", key: (hg) => -hg.povWins },
    { label: "Most times nominated first", key: (hg) => -hg.nominations },
];
const ALPHABETICAL: Criterion = { label: "Alphabetical order (A → Z)", key: (hg) => hg.name.toLowerCase() };
const REVERSE: Criterion = {
    label: "Reverse alphabetical order (Z → A)",
    key: (hg) =>
        hg.name
            .toLowerCase()
            .split("")
            .map((c) => String.fromCharCode(255 - c.charCodeAt(0)))
            .join(""),
};

function pickCriterion(hgs: Houseguest[], used: Set<string>, rand: Rand): Criterion {
    // only use stat criteria where the chosen houseguests actually differ
    const varied = CRITERIA.filter((c) => !used.has(c.label) && new Set(hgs.map(c.key)).size >= 3);
    if (varied.length > 0) return pick(rand, varied);
    return used.has(ALPHABETICAL.label) ? REVERSE : ALPHABETICAL;
}

// fraction of pairs in the right relative order (ties always count as right)
function pairScore(order: Houseguest[], criterion: Criterion): number {
    let right = 0;
    let total = 0;
    for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
            total++;
            if (criterion.key(order[i]) <= criterion.key(order[j])) right++;
        }
    }
    return total === 0 ? 1 : right / total;
}

// The three rounds (who to rank, and by what). Same for every player and bot.
export function generateRankRounds(rand: Rand, gs: GameState) {
    const used = new Set<string>();
    return Array.from({ length: ROUNDS }, () => {
        const hgs = sample(rand, gs.houseguests, PER_ROUND);
        const criterion = pickCriterion(hgs, used, rand);
        used.add(criterion.label);
        return { hgs, criterion };
    });
}

function simulateRankEm(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const rounds = generateRankRounds(seededRand(ctx.seed), ctx.gameState);
    let total = 0;
    const picks: number[] = [];
    rounds.forEach(({ hgs, criterion }) => {
        // start from the right order, then make some mistakes (adjacent swaps); weaker bots make more
        const order = [...hgs].sort((a, b) => (criterion.key(a) < criterion.key(b) ? -1 : criterion.key(a) > criterion.key(b) ? 1 : 0));
        const mistakes = Math.max(0, Math.round((1 - skill) * 3 + 0.8 * gaussian(noise)));
        for (let m = 0; m < mistakes; m++) {
            const i = Math.floor(noise() * (order.length - 1));
            [order[i], order[i + 1]] = [order[i + 1], order[i]];
        }
        const score = pairScore(order, criterion);
        picks.push(score);
        total += score;
    });
    const pct = (total / ROUNDS) * 100;
    const seconds = 40 + (1 - skill) * 100;
    return { score: pct + Math.max(0, 1 - seconds / 180) * 0.99, picks };
}

function RankEm(props: CompProps) {
    const [rounds] = React.useState(() => generateRankRounds(props.rand, props.gameState));
    const [round, setRound] = React.useState(0);
    const [order, setOrder] = React.useState<Houseguest[]>(() => shuffled(props.rand, rounds[0].hgs));
    const [picked, setPicked] = React.useState<number | null>(null);
    const [scores, setScores] = React.useState<number[]>([]);
    const [start] = React.useState(Date.now());
    const [between, setBetween] = React.useState<Reveal | null>(null); // everyone's rankings after a round
    const final = React.useRef(0);
    const pausedAt = React.useRef(0);
    const paused = React.useRef(0); // time spent on the scores between rounds doesn't count

    const tap = (i: number) => {
        if (picked === null) {
            setPicked(i);
            return;
        }
        const next = [...order];
        [next[picked], next[i]] = [next[i], next[picked]];
        setOrder(next);
        setPicked(null);
    };

    const lockIn = () => {
        const score = pairScore(order, rounds[round].criterion);
        const newScores = [...scores, score];
        setScores(newScores);
        if (props.recordAnswer) props.recordAnswer(round, score === 1, score);
        const pct = (newScores.reduce((a, b) => a + b, 0) / ROUNDS) * 100;
        props.report(pct);
        const secs = (Date.now() - start - paused.current) / 1000;
        final.current = pct + Math.max(0, 1 - secs / 180) * 0.99;
        pausedAt.current = Date.now();
        if (props.pauseClock) props.pauseClock(true);
        const { hgs, criterion } = rounds[round];
        const right = [...hgs].sort((a, b) => (criterion.key(a) < criterion.key(b) ? -1 : criterion.key(a) > criterion.key(b) ? 1 : 0));
        const pctOf = (x: number) => `${Math.round(x * 100)}% right`;
        const rows = revealRows(props, round, { correct: score === 1, answer: pctOf(score) }, (_ok, pick) => pctOf(Number(pick)));
        rows.forEach((r) => r.answer && r.correct === undefined && (r.correct = r.answer === pctOf(1) ? true : undefined));
        setBetween({
            index: round,
            verdict: score === 1 ? "🎯 Perfect order!" : `${Math.round(score * 100)}% right`,
            correctText: (
                <>
                    {right.map((hg, i) => `${i + 1}. ${hg.name}`).join(", ")}. Best: {bestOf(rows, (r) => (r.answer ? parseInt(r.answer, 10) : undefined), (v) => `${v}%`)}
                </>
            ),
            answerLabel: "The right order",
            rows,
        });
    };
    const nextRound = () => {
        paused.current += Date.now() - pausedAt.current;
        if (props.pauseClock) props.pauseClock(false);
        if (round + 1 >= ROUNDS) {
            props.finish(final.current);
            return;
        }
        setBetween(null);
        setRound(round + 1);
        setOrder(shuffled(props.rand, rounds[round + 1].hgs));
        setPicked(null);
    };

    if (between) {
        return <AnswerReveal reveal={between} last={round + 1 >= ROUNDS} onNext={nextRound} nextLabel="Next round" />;
    }
    return (
        <div>
            <Title>
                Round {round + 1} of {ROUNDS}
            </Title>
            <p style={{ fontSize: "1.2rem" }}>
                <b>{rounds[round].criterion.label}</b>
            </p>
            <Subtle>Tap two houseguests to swap them. First place is top-left.</Subtle>
            <Grid>
                {order.map((hg, i) => (
                    <Face
                        key={hg.id}
                        hg={hg}
                        selected={picked === i}
                        caption={<b>#{i + 1}</b>}
                        onClick={() => tap(i)}
                    />
                ))}
            </Grid>
            <BigButton kind="success" onClick={lockIn}>
                Lock it in
            </BigButton>
        </div>
    );
}

export const RankEmComp: CompDefinition = {
    id: "rank-em",
    name: "Rank 'Em",
    emoji: "📊",
    kind: "skill",
    rules: `Three rounds. Each round, put ${PER_ROUND} houseguests in order: by HoH wins, veto wins, nominations, or alphabetically. Tap two to swap them. The most accurate rankings win; ties go to a tiebreaker.`,
    maxSeconds: 180,
    Component: RankEm,
    simulate: simulateRankEm,
    botScore: (p) => Math.min(100, 45 + 55 * Math.pow(p, 0.8)) + p * 0.9,
    format: (s) => `${Math.floor(s)}% correct`,
    progress: (r, n) => (sumSoFar(r, n) / ROUNDS) * 100,
};
