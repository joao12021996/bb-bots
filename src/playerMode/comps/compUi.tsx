import React from "react";

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
    opponents: { hg: { id: number; name: string; imageURL: string }; score: number }[];
    answered: number;
    total: number;
}) {
    const rows = [
        { hg: props.human, correct: props.humanCorrect, you: true },
        ...props.opponents.map((o) => ({
            hg: o.hg,
            correct: opponentCorrectAfter(o.hg.id, o.score, props.total, props.answered),
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
