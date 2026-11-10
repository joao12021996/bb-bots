import React from "react";
import { GameState, nonEvictedHouseguests } from "../../model";
import { Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps } from "./compTypes";
import { QuizScoreboard } from "./compUi";
import { pick, Rand, sample, shuffled } from "./random";

// Comps about the houseguests themselves. Scored as correct * 100 + a speed bonus, with a live scoreboard.

// ---------------- Zoom In ----------------

const ZOOM_ROUNDS = 6;
const ZOOM_SECONDS = 8;

function ZoomIn(props: CompProps) {
    const [rounds] = React.useState(() => {
        const pool = props.gameState.houseguests;
        return Array.from({ length: ZOOM_ROUNDS }, () => {
            const target = pick(props.rand, pool);
            const options = shuffled(props.rand, [target, ...sample(props.rand, pool.filter((h) => h.id !== target.id), 3)]);
            return { target, options, ox: 20 + props.rand() * 60, oy: 20 + props.rand() * 60 };
        });
    });
    const [round, setRound] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [bonus, setBonus] = React.useState(0);
    const [roundStart, setRoundStart] = React.useState(() => performance.now());
    const [, tick] = React.useState(0);
    const { finish, report } = props;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 100);
        return () => clearInterval(t);
    }, []);
    const secs = (performance.now() - roundStart) / 1000;

    const answer = React.useCallback(
        (id: number | null) => {
            const right = id === rounds[round].target.id;
            const c = correct + (right ? 1 : 0);
            const b = bonus + (right ? Math.max(0, (ZOOM_SECONDS - secs) / ZOOM_SECONDS) * (99 / ZOOM_ROUNDS) : 0);
            setCorrect(c);
            setBonus(b);
            report(c * 100);
            if (round + 1 >= ZOOM_ROUNDS) {
                finish(c * 100 + b);
                return;
            }
            setRound(round + 1);
            setRoundStart(performance.now());
        },
        [rounds, round, correct, bonus, secs, finish, report]
    );

    React.useEffect(() => {
        if (secs > ZOOM_SECONDS) answer(null);
    }, [secs, answer]);

    const r = rounds[round];
    const scale = Math.max(1, 7 - (secs / ZOOM_SECONDS) * 6);
    return (
        <div>
            <QuizScoreboard human={props.human} humanCorrect={correct} opponents={props.opponents} answered={round} total={ZOOM_ROUNDS} />
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 360, margin: "0 auto" }}>
                {r.options.map((o) => (
                    <button type="button" key={o.id} className="button is-medium" style={{ touchAction: "manipulation" }} onClick={() => answer(o.id)}>
                        {o.name}
                    </button>
                ))}
            </div>
            <Subtle>{Math.max(0, Math.ceil(ZOOM_SECONDS - secs))}s</Subtle>
        </div>
    );
}

export const ZoomInComp: CompDefinition = {
    id: "zoom-in",
    name: "Zoom In",
    emoji: "🔎",
    kind: "quiz",
    rules: `A super zoomed-in photo of a houseguest slowly zooms out. Name them as fast as you can. ${ZOOM_ROUNDS} rounds, ${ZOOM_SECONDS} seconds each. Most right wins; faster answers break ties.`,
    maxSeconds: ZOOM_ROUNDS * ZOOM_SECONDS + 20,
    Component: ZoomIn,
    botScore: (p) => {
        const c = Math.min(ZOOM_ROUNDS, Math.round(ZOOM_ROUNDS * (0.35 + 0.65 * p)));
        return c * 100 + c * (99 / ZOOM_ROUNDS) * (0.3 + 0.5 * p);
    },
    format: (s) => `${Math.floor(s / 100)}/${ZOOM_ROUNDS} right`,
};

// ---------------- Fact or Fiction ----------------

const FACTS = 10;
const FACT_SECONDS = 8;

interface Fact {
    text: string;
    truth: boolean;
}

function makeFacts(gs: GameState, rand: Rand): Fact[] {
    const everyone = gs.houseguests;
    const inHouse = nonEvictedHouseguests(gs);
    const gens: (() => Fact)[] = [
        () => {
            const a = pick(rand, everyone);
            return { text: `${a.name} has won Head of Household at least once.`, truth: a.hohWins > 0 };
        },
        () => {
            const a = pick(rand, everyone);
            return { text: `${a.name} has never been nominated.`, truth: a.nominations === 0 };
        },
        () => {
            const [a, b] = sample(rand, everyone, 2);
            return { text: `${a.name} has been nominated more times than ${b.name}.`, truth: a.nominations > b.nominations };
        },
        () => {
            const [a, b] = sample(rand, everyone, 2);
            return { text: `${a.name} has won more vetoes than ${b.name}.`, truth: a.povWins > b.povWins };
        },
        () => {
            const a = pick(rand, everyone);
            return { text: `${a.name} is still in the house.`, truth: !a.isEvicted };
        },
        () => {
            const a = pick(rand, inHouse);
            return { text: `${a.name} has won the Power of Veto.`, truth: a.povWins > 0 };
        },
    ];
    const facts: Fact[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (facts.length < FACTS && guard++ < 200) {
        const f = pick(rand, gens)();
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
    const [facts] = React.useState(() => makeFacts(props.gameState, props.rand));
    const [index, setIndex] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [start] = React.useState(() => performance.now());
    const [qStart, setQStart] = React.useState(() => performance.now());
    const [, tick] = React.useState(0);
    const { finish, report } = props;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 200);
        return () => clearInterval(t);
    }, []);
    const left = FACT_SECONDS - (performance.now() - qStart) / 1000;

    const answer = React.useCallback(
        (said: boolean | null) => {
            const c = correct + (said !== null && said === facts[index].truth ? 1 : 0);
            setCorrect(c);
            report(c * 100);
            if (index + 1 >= facts.length) {
                finish(c * 100 + Math.max(0, 99 - ((performance.now() - start) / 1000) * 1.2));
                return;
            }
            setIndex(index + 1);
            setQStart(performance.now());
        },
        [correct, facts, index, start, finish, report]
    );
    React.useEffect(() => {
        if (left <= 0) answer(null);
    }, [left, answer]);

    return (
        <div>
            <QuizScoreboard human={props.human} humanCorrect={correct} opponents={props.opponents} answered={index} total={facts.length} />
            <Title>
                Fact {index + 1} of {facts.length}
            </Title>
            <p style={{ fontSize: "1.3rem", margin: "12px auto", maxWidth: 480 }}>{facts[index].text}</p>
            <div>
                <button type="button" className="button is-success is-large" style={{ margin: 6, minWidth: 130 }} onClick={() => answer(true)}>
                    FACT
                </button>
                <button type="button" className="button is-danger is-large" style={{ margin: 6, minWidth: 130 }} onClick={() => answer(false)}>
                    FICTION
                </button>
            </div>
            <Subtle>{Math.max(0, Math.ceil(left))}s</Subtle>
        </div>
    );
}

export const FactOrFictionComp: CompDefinition = {
    id: "fact-or-fiction",
    name: "Fact or Fiction",
    emoji: "📜",
    kind: "quiz",
    rules: `${FACTS} statements about your fellow houseguests' games: HoH wins, nominations, vetoes. Is each one FACT or FICTION? ${FACT_SECONDS} seconds each. Most right wins; ties go to the fastest.`,
    maxSeconds: FACTS * FACT_SECONDS + 20,
    Component: FactOrFiction,
    botScore: (p) => Math.min(FACTS, Math.round(FACTS * (0.45 + 0.5 * p))) * 100 + p * 60,
    format: (s) => `${Math.floor(s / 100)}/${FACTS} right`,
    available: (_gs, history) => history.length >= 1,
};

