import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Panel, Subtle, Title } from "../ui/common";
import { Keypad } from "./compUi";
import { gaussian, pick, Rand, randInt, seededRand } from "./random";

// The tiebreaker: when a comp ends in a tie for first, the tied houseguests answer one closest-number question.
// A box of things flashes on screen, far too many to count in time. Closest guess wins.

export const TIEBREAK_LOOK_SECONDS = 8;

const THINGS: [string, string][] = [
    ["🔑", "keys"],
    ["🍷", "wine bottles"],
    ["🎲", "dice"],
    ["🐟", "fish"],
    ["🧀", "slices of cheese"],
    ["⭐", "stars"],
    ["🥚", "eggs"],
    ["🪙", "coins"],
];

export interface TiebreakQuestion {
    emoji: string;
    noun: string;
    answer: number;
    spots: { x: number; y: number; turn: number }[]; // percent positions inside the box
}

export function makeTiebreaker(seed: number): TiebreakQuestion {
    const rand = seededRand(seed);
    const [emoji, noun] = pick(rand, THINGS);
    const answer = randInt(rand, 45, 160);
    const spots = Array.from({ length: answer }, () => ({
        x: Math.round(rand() * 940) / 10,
        y: Math.round(rand() * 900) / 10,
        turn: randInt(rand, -40, 40),
    }));
    return { emoji, noun, answer, spots };
}

// A bot's guess: good competitors estimate better.
export function botGuess(question: TiebreakQuestion, skill: number, noise: Rand): number {
    const spread = 0.32 - 0.22 * skill;
    return Math.max(1, Math.round(question.answer * (1 + gaussian(noise) * spread)));
}

export interface TiebreakGuess {
    id: number;
    guess: number;
}

// Everyone whose guess was closest. More than one: still tied, and it's another question.
export function closestGuesses(answer: number, guesses: TiebreakGuess[]): number[] {
    const best = Math.min(...guesses.map((g) => Math.abs(g.guess - answer)));
    return guesses.filter((g) => Math.abs(g.guess - answer) === best).map((g) => g.id);
}

type Phase = "intro" | "look" | "guess";

export function TiebreakPlay(props: {
    title: string;
    player: Houseguest;
    tied: Houseguest[];
    question: TiebreakQuestion;
    moreToPlay: boolean;
    heading?: string; // knockout duels reuse this screen
    intro?: string;
    onGuess: (guess: number) => void;
}) {
    const { question } = props;
    const [phase, setPhase] = React.useState<Phase>("intro");
    const [left, setLeft] = React.useState(TIEBREAK_LOOK_SECONDS);
    const [value, setValue] = React.useState("");
    const [sent, setSent] = React.useState(false);

    React.useEffect(() => {
        if (phase !== "look") return;
        if (left <= 0) return setPhase("guess");
        const t = setTimeout(() => setLeft(left - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, left]);

    const submit = () => {
        const guess = parseInt(value, 10);
        if (sent || isNaN(guess)) return;
        setSent(true);
        props.onGuess(guess);
    };

    const header = (
        <div className="bbb-comp-header">
            <div className="bbb-comp-emoji">⚖️</div>
            <Title>{props.heading || "Tiebreaker"}</Title>
            <Subtle>{props.title}</Subtle>
        </div>
    );

    if (phase === "intro") {
        return (
            <Panel>
                {header}
                <p className="bbb-rules">
                    {props.intro || `It's a tie between ${props.tied.map((hg) => hg.name).join(", ")}! One question decides it.`} A box of{" "}
                    {question.noun}{" "}
                    will appear for {TIEBREAK_LOOK_SECONDS} seconds. How many are there? The closest guess wins.
                </p>
                <BigButton kind="success" onClick={() => setPhase("look")}>
                    {props.player.name}, I'm ready!
                </BigButton>
            </Panel>
        );
    }
    if (phase === "look") {
        return (
            <Panel>
                <div className="bbb-comp-bar">
                    <b>⚖️ How many {question.noun}?</b>
                    <span className="bbb-timer is-low">⏳ {left}</span>
                </div>
                <div className="bbb-tiebreak-box">
                    {question.spots.map((s, i) => (
                        <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `rotate(${s.turn}deg)` }}>
                            {question.emoji}
                        </span>
                    ))}
                </div>
            </Panel>
        );
    }
    return (
        <Panel>
            {header}
            <Title>
                How many {question.noun} {question.emoji} were in the box?
            </Title>
            <Subtle>{props.moreToPlay ? "Keep your answer secret. Closest guess wins." : "Closest guess wins."}</Subtle>
            <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={3} submitLabel="Lock it in" />
        </Panel>
    );
}

export function TiebreakResults(props: {
    title: string;
    question: TiebreakQuestion;
    tied: Houseguest[];
    guesses: TiebreakGuess[];
    winnerId?: number; // none: still tied, and the closest go to another question
    sealed?: boolean; // a secret Head of Household week: nobody sees who won
    humanIds: number[];
    onDone: () => void;
}) {
    const { question } = props;
    if (props.sealed) {
        return (
            <Panel>
                <div className="bbb-comp-header">
                    <div className="bbb-comp-emoji">⚖️</div>
                    <Title>Tiebreaker</Title>
                    <Subtle>{props.title}</Subtle>
                </div>
                <Title>🕶️ The tiebreaker has been decided, in secret.</Title>
                <BigButton onClick={props.onDone}>{props.winnerId !== undefined ? "Continue" : "Next question"}</BigButton>
            </Panel>
        );
    }
    const byId = (id: number) => props.tied.find((hg) => hg.id === id)!;
    const ranked = [...props.guesses].sort((a, b) => Math.abs(a.guess - question.answer) - Math.abs(b.guess - question.answer));
    const winner = props.winnerId !== undefined ? byId(props.winnerId) : null;
    const best = Math.abs(ranked[0].guess - question.answer);
    const stillTied = ranked.filter((g) => Math.abs(g.guess - question.answer) === best).map((g) => byId(g.id).name);
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">⚖️</div>
                <Title>Tiebreaker</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            <Title>
                There were {question.answer} {question.noun} {question.emoji}
            </Title>
            {winner ? (
                <div className="bbb-winner">
                    <img src={winner.imageURL} alt="" />
                    <div>
                        <div className="bbb-winner-label">🏆 Winner</div>
                        <div className="bbb-winner-name">
                            {winner.name}
                            {props.humanIds.includes(winner.id) && props.humanIds.length === 1 ? " (you!)" : ""}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bbb-winner">
                    <div>
                        <div className="bbb-winner-label">⚖️ Still tied!</div>
                        <div className="bbb-winner-name">{stillTied.join(" vs ")}</div>
                        <div>Dead even. Another question decides it.</div>
                    </div>
                </div>
            )}
            <ol className="bbb-leaderboard">
                {ranked.map((g) => (
                    <li key={g.id} className={props.humanIds.includes(g.id) ? "is-human" : ""}>
                        <img src={byId(g.id).imageURL} alt="" />
                        <span className="bbb-lb-name">
                            {byId(g.id).name}
                            {props.humanIds.includes(g.id) ? " 🎮" : ""}
                        </span>
                        <span className="bbb-lb-score">
                            guessed {g.guess} (off by {Math.abs(g.guess - question.answer)})
                        </span>
                    </li>
                ))}
            </ol>
            <BigButton onClick={props.onDone}>{winner ? "Continue" : "Next question"}</BigButton>
        </Panel>
    );
}
