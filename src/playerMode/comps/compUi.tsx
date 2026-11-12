import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, RoundData, SimContext } from "./compTypes";
import { hashcode } from "../../utils";

// Shared controls for competitions.

// On-screen number pad (phones don't need to open a keyboard).
export function Keypad(props: { value: string; onChange: (v: string) => void; onSubmit: () => void; maxLength?: number; submitLabel?: string }) {
    const max = props.maxLength || 3;
    const press = (k: string) => {
        if (k === "⌫") props.onChange(props.value.slice(0, -1));
        else if (props.value.length < max) props.onChange(props.value + k);
    };
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"];
    return (
        <div style={{ maxWidth: 260, margin: "8px auto" }}>
            <div
                style={{
                    fontSize: "2rem",
                    fontFamily: "monospace",
                    minHeight: 48,
                    border: "2px solid #777",
                    borderRadius: 6,
                    marginBottom: 6,
                    letterSpacing: 4,
                }}
            >
                {props.value || " "}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {keys.map((k) => (
                    <button
                        type="button"
                        key={k}
                        className="button is-medium"
                        style={{ touchAction: "manipulation" }}
                        onClick={() => press(k)}
                    >
                        {k}
                    </button>
                ))}
                <button
                    type="button"
                    className="button is-medium is-success"
                    style={{ touchAction: "manipulation" }}
                    disabled={props.value.length === 0}
                    onClick={props.onSubmit}
                >
                    {props.submitLabel || "OK"}
                </button>
            </div>
        </div>
    );
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs a callback every animation frame with the time since start (seconds) and the frame delta.
export function useAnimationFrame(callback: (t: number, dt: number) => boolean | void, running: boolean = true) {
    const ref = React.useRef(callback);
    ref.current = callback;
    React.useEffect(() => {
        if (!running) return;
        let raf = 0;
        const start = performance.now();
        let last = start;
        const frame = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (ref.current((now - start) / 1000, dt) === false) return;
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [running]);
}

// ---------- live quiz scoreboard ----------

// For quiz comps scored as correct * 100 + speed bonus: which questions an opponent got right,
// spread deterministically so their running total grows as the quiz goes on.
export function opponentCorrectAfter(opponentId: number, finalScore: number, total: number, answered: number): number {
    const correct = Math.max(0, Math.min(total, Math.floor(finalScore / 100)));
    // rank questions by a per-opponent hash; the `correct` lowest-ranked ones are the ones they got right
    const hash = (i: number) => Math.abs(Math.sin((opponentId + 1) * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const order = Array.from({ length: total }, (_, i) => i).sort((a, b) => hash(a) - hash(b));
    const right = new Set(order.slice(0, correct));
    let count = 0;
    for (let i = 0; i < Math.min(answered, total); i++) if (right.has(i)) count++;
    return count;
}

export function QuizScoreboard(props: {
    human: { id: number; name: string; imageURL: string };
    humanCorrect: number;
    opponents: { hg: { id: number; name: string; imageURL: string }; score: number; answers?: boolean[] }[];
    answered: number;
    total: number;
}) {
    const rows = [
        { hg: props.human, correct: props.humanCorrect, you: true },
        ...props.opponents.map((o) => ({
            hg: o.hg,
            // bots answered the same questions: show their real results so far
            correct: o.answers
                ? o.answers.slice(0, props.answered).filter(Boolean).length
                : opponentCorrectAfter(o.hg.id, o.score, props.total, props.answered),
            you: false,
        })),
    ];
    const best = Math.max(...rows.map((r) => r.correct));
    return (
        <div className="bbb-scoreboard">
            {rows.map((r) => (
                <div key={r.hg.id} className={`bbb-score ${r.you ? "is-you" : ""} ${r.correct === best && best > 0 ? "is-leader" : ""}`}>
                    <img src={r.hg.imageURL} alt="" />
                    <span className="bbb-score-name">{r.you ? "You" : r.hg.name}</span>
                    <span className="bbb-score-value">{r.correct}</span>
                </div>
            ))}
        </div>
    );
}

// ---------- the pause after each answer ----------

// A clock for question comps that stops while the answers are being revealed, so the pause never costs
// time (or a speed bonus). It also pauses the comp's overall time limit.
export function useQuizClock(pauseClock?: (paused: boolean) => void) {
    const pausedTotal = React.useRef(0);
    const pausedAt = React.useRef<number | null>(null);
    const now = React.useCallback(
        () => performance.now() - pausedTotal.current - (pausedAt.current !== null ? performance.now() - pausedAt.current : 0),
        []
    );
    const pause = React.useCallback(() => {
        if (pausedAt.current !== null) return;
        pausedAt.current = performance.now();
        if (pauseClock) pauseClock(true);
    }, [pauseClock]);
    const resume = React.useCallback(() => {
        if (pausedAt.current === null) return;
        pausedTotal.current += performance.now() - pausedAt.current;
        pausedAt.current = null;
        if (pauseClock) pauseClock(false);
    }, [pauseClock]);
    return { now, pause, resume };
}

export interface RevealRow {
    id: number;
    name: string;
    imageURL: string;
    you?: boolean;
    correct?: boolean; // undefined: unknown (they haven't played yet)
    answer?: string;
}

export interface Reveal {
    index: number; // the question just answered
    verdict: string; // "✅ Right!"
    correctText: React.ReactNode; // the right answer
    rows: RevealRow[];
}

// A wrong answer for someone we only know got it wrong: one of the wrong options, the same one every time.
export function wrongOption(options: string[], correct: string, key: string): string {
    const wrong = options.filter((o) => o !== correct);
    if (wrong.length === 0) return "?";
    return wrong[Math.abs(hashcode(key)) % wrong.length];
}

// Everyone's answer to question `index`: the player's, and what's known about everyone else's.
// `describe` turns someone's result (right or wrong, and their pick if recorded) into the answer they gave.
export function revealRows(
    props: CompProps,
    index: number,
    mine: { correct: boolean; answer: string },
    describe: (correct: boolean, pick: number | string | undefined, id: number) => string
): RevealRow[] {
    return [
        { id: props.human.id, name: props.human.name, imageURL: props.human.imageURL, you: true, ...mine },
        ...props.opponents.map((o) => {
            const correct = o.answers ? o.answers[index] : undefined;
            const pick = o.picks ? o.picks[index] : undefined;
            return {
                id: o.hg.id,
                name: o.hg.name,
                imageURL: o.hg.imageURL,
                correct,
                answer: correct === undefined ? undefined : describe(correct, pick, o.hg.id),
            };
        }),
    ];
}

// ---------- the score so far, between stages ----------

type Face = { id: number; name: string; imageURL: string };

// What the screens between a comp's rounds need to show everyone's score so far (given by CompPlay).
export interface StageInfo {
    comp: CompDefinition;
    ctx: SimContext;
    human: Face;
    mine: () => RoundData; // the player's rounds so far
    opponents: { hg: Face; score: number; answers?: boolean[]; picks?: (number | string)[]; live?: { done: boolean } }[]; // bots, and players done
    playing: { hg: Face; score: number | null; answers?: boolean[]; picks?: (number | string)[] }[]; // online: other players still playing
}

export const StageContext = React.createContext<StageInfo | null>(null);

// Online: other players are still playing (so there's someone to compare with even before anyone's done).
export function useRivalsPlaying(): boolean {
    const info = React.useContext(StageContext);
    return !!info && info.playing.length > 0;
}

// For comps' progress(): right answers, and the sum of the picks, in the first n rounds.
export const rightSoFar = (r: RoundData, n: number) => (r.answers || []).slice(0, n).filter(Boolean).length;
export const sumSoFar = (r: RoundData, n: number) => (r.picks || []).slice(0, n).reduce<number>((a, b) => a + (Number(b) || 0), 0);
const roundsPlayed = (r: RoundData) => Math.max(r.answers ? r.answers.length : 0, r.picks ? r.picks.length : 0);

// Everyone's score so far, bots included, between a comp's rounds: after the first `done` rounds, or, in
// knockout comps, once the player has cleared round `cleared` (everyone else: the last round they got through).
export function StageScores(props: { done: number } | { cleared: number }) {
    const info = React.useContext(StageContext);
    if (!info) return null;
    const { comp, ctx } = info;
    const rows: { hg: Face; value: number | null; you?: boolean; note?: string }[] = [];
    if ("done" in props) {
        const progress = comp.progress;
        if (!progress) return null;
        const n = props.done;
        rows.push({ hg: info.human, value: progress(info.mine(), n, ctx), you: true });
        info.opponents.forEach((o) => (o.answers || o.picks) && rows.push({ hg: o.hg, value: progress(o, n, ctx) }));
        info.playing.forEach((p) => {
            // they may not be this far yet: their score so far
            const k = Math.min(n, roundsPlayed(p));
            rows.push({ hg: p.hg, value: k > 0 ? progress(p, k, ctx) : null, note: k < n ? `⏳ round ${k + 1}` : "⏳" });
        });
    } else {
        const n = props.cleared;
        rows.push({ hg: info.human, value: n, you: true });
        // bots: how far they've got by this round; players done: how far they got
        info.opponents.forEach((o) => rows.push({ hg: o.hg, value: o.live ? o.score : Math.min(o.score, n) }));
        info.playing.forEach((p) => rows.push({ hg: p.hg, value: p.score, note: "⏳" }));
    }
    if (rows.length < 2) return null;
    rows.sort((x, y) => (y.value ?? -Infinity) - (x.value ?? -Infinity));
    return (
        <div className="bbb-stage-scores">
            <Subtle>🏆 Current score</Subtle>
            <ol className="bbb-leaderboard">
                {rows.map((r) => (
                    <li key={r.hg.id} className={r.you ? "is-human" : ""}>
                        <img src={r.hg.imageURL} alt="" />
                        <span className="bbb-lb-name">
                            {r.you ? "You" : r.hg.name}
                            {r.note ? ` ${r.note}` : ""}
                        </span>
                        <span className="bbb-lb-score">{r.value === null ? "playing…" : comp.format(r.value)}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

// The pause after an answer: the right answer, and what everyone else said.
export function AnswerReveal(props: { reveal: Reveal; last: boolean; onNext: () => void }) {
    const { reveal } = props;
    return (
        <div className="bbb-reveal">
            <Title>{reveal.verdict}</Title>
            <Subtle>The answer: {reveal.correctText}</Subtle>
            <div className="bbb-answers">
                {reveal.rows.map((r) => (
                    <div
                        key={r.id}
                        className={`bbb-answer ${r.correct === true ? "is-right" : r.correct === false ? "is-wrong" : ""} ${r.you ? "is-you" : ""}`}
                    >
                        <img src={r.imageURL} alt="" />
                        <b>{r.you ? "You" : r.name}</b>
                        <span className="bbb-answer-text">{r.answer !== undefined ? r.answer : "hasn't played yet"}</span>
                        <span>{r.correct === true ? "✅" : r.correct === false ? "❌" : ""}</span>
                    </div>
                ))}
            </div>
            <StageScores done={reveal.index + 1} />
            <BigButton kind="success" onClick={props.onNext}>
                {props.last ? "See how I did" : "Next question"}
            </BigButton>
        </div>
    );
}

// ---------- who's out, between rounds ----------

// "One mistake and you're out" comps: after each round the player clears, who else made it, and who just
// dropped out. An opponent's score is the last round they cleared.
export function knockoutRound<T extends { score: number }>(opponents: T[], cleared: number, first: boolean) {
    const out = opponents.filter((o) => o.score < cleared && (first || o.score >= cleared - 1));
    const still = opponents.filter((o) => o.score >= cleared);
    return { out, still };
}

export function KnockoutPause(props: {
    opponents: { hg: { id: number; name: string; imageURL: string }; score: number }[];
    cleared: number; // the round the player just got through
    first: boolean; // the first round: everyone who couldn't even do that is out
    what: (n: number) => string; // "sequence of 5"
    onNext: () => void;
}) {
    const { out, still } = knockoutRound(props.opponents, props.cleared, props.first);
    const face = (o: { hg: { id: number; name: string; imageURL: string } }, isOut: boolean) => (
        <div key={o.hg.id} className={`bbb-answer ${isOut ? "is-wrong" : "is-right"}`}>
            <img src={o.hg.imageURL} alt="" />
            <b>{o.hg.name}</b>
            <span className="bbb-answer-text">{isOut ? "out!" : "still in"}</span>
            <span>{isOut ? "❌" : "✅"}</span>
        </div>
    );
    return (
        <div className="bbb-reveal">
            <Title>✅ You got the {props.what(props.cleared)}!</Title>
            <Subtle>
                {out.length === 0 ? "Nobody dropped out this round." : `${out.map((o) => o.hg.name).join(", ")} ${out.length === 1 ? "is" : "are"} out.`}{" "}
                {still.length === 0 ? "You're the last one standing! Keep going for the record." : `${still.length} still in with you.`}
            </Subtle>
            <div className="bbb-answers">
                {out.map((o) => face(o, true))}
                {still.map((o) => face(o, false))}
            </div>
            <StageScores cleared={props.cleared} />
            <BigButton kind="success" onClick={props.onNext}>
                Next round
            </BigButton>
        </div>
    );
}
