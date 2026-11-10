import React from "react";
import { GameState, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { BigButton, Face, formatSeconds, Grid, Panel, Subtle, Title } from "../ui/common";
import { CompDefinition, Opponent } from "./compTypes";
import { seededRand } from "./random";

export interface CompResult {
    id: number;
    score: number;
    answers?: boolean[]; // quiz comps: right/wrong per question
}

// Ranks results best first. Players win ties against bots.
export function rankResults(results: CompResult[], humanIds: number[]): CompResult[] {
    const isHuman = (id: number) => humanIds.includes(id);
    return [...results].sort((a, b) => b.score - a.score || (isHuman(a.id) ? -1 : 0) - (isHuman(b.id) ? -1 : 0));
}

interface CompPlayProps {
    title: string; // e.g. "Head of Household Competition"
    comp: CompDefinition;
    participants: Houseguest[];
    player: Houseguest; // who is playing now
    gameState: GameState;
    history: WeekRecord[];
    seed: number; // same seed for every player, so everyone gets the same comp
    opponents: Opponent[];
    moreToPlay: boolean; // another player still has to take their turn
    onScore: (score: number) => void;
}

type Phase = "rules" | "countdown" | "play" | "done";

// One player's turn at a competition: rules -> countdown -> play (with a hard time limit) -> their score.
export function CompPlay(props: CompPlayProps) {
    const [phase, setPhase] = React.useState<Phase>("rules");
    const [count, setCount] = React.useState(3);
    const [score, setScore] = React.useState<number | null>(null);
    const [playStart, setPlayStart] = React.useState(0);
    const [now, setNow] = React.useState(Date.now());
    const [rand] = React.useState(() => seededRand(props.seed));
    const lastReported = React.useRef<number | null>(null);
    const done = React.useRef(false);

    const finish = React.useCallback((s: number) => {
        if (done.current) return;
        done.current = true;
        setScore(s);
        setPhase("done");
    }, []);
    const report = React.useCallback((s: number) => {
        lastReported.current = s;
    }, []);

    React.useEffect(() => {
        if (phase !== "countdown") return;
        if (count <= 0) {
            setPhase("play");
            setPlayStart(Date.now());
            return;
        }
        const t = setTimeout(() => setCount(count - 1), 800);
        return () => clearTimeout(t);
    }, [phase, count]);

    React.useEffect(() => {
        if (phase !== "play") return;
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, [phase]);

    const remaining = phase === "play" ? Math.max(0, props.comp.maxSeconds - (now - playStart) / 1000) : props.comp.maxSeconds;
    const { comp, gameState, history } = props;
    React.useEffect(() => {
        if (phase === "play" && remaining <= 0) {
            finish(lastReported.current ?? comp.botScore(0, { gameState, history }));
        }
    }, [phase, remaining, finish, comp, gameState, history]);

    const header = (
        <div className="bbb-comp-header">
            <div className="bbb-comp-emoji">{props.comp.emoji}</div>
            <Title>{props.comp.name}</Title>
            <Subtle>{props.title}</Subtle>
        </div>
    );

    if (phase === "rules") {
        return (
            <Panel>
                {header}
                <Grid>
                    {props.participants.map((hg) => (
                        <Face key={hg.id} hg={hg} selected={hg.id === props.player.id} small />
                    ))}
                </Grid>
                <p className="bbb-rules">{props.comp.rules}</p>
                <Subtle>{props.comp.hideTimer ? "There's a time limit, but no clock. That's the point!" : `Time limit: ${formatSeconds(props.comp.maxSeconds)}`}</Subtle>
                <BigButton kind="success" onClick={() => setPhase("countdown")}>
                    {props.player.name}, I'm ready!
                </BigButton>
            </Panel>
        );
    }

    if (phase === "countdown") {
        return (
            <Panel>
                {header}
                <div className="bbb-countdown">{count > 0 ? count : "GO!"}</div>
            </Panel>
        );
    }

    if (phase === "play") {
        const Component = props.comp.Component;
        return (
            <Panel>
                <div className="bbb-comp-bar">
                    <b>
                        {props.comp.emoji} {props.comp.name}
                    </b>
                    {!props.comp.hideTimer && (
                        <span className={`bbb-timer ${remaining < 15 ? "is-low" : ""}`}>⏳ {formatSeconds(remaining)}</span>
                    )}
                </div>
                <Component
                    participants={props.participants}
                    human={props.player}
                    gameState={props.gameState}
                    history={props.history}
                    rand={rand}
                    opponents={props.opponents}
                    report={report}
                    finish={finish}
                />
            </Panel>
        );
    }

    return (
        <Panel>
            {header}
            <Title>Your result: {props.comp.format(score!)}</Title>
            <Subtle>{props.moreToPlay ? "Don't tell anyone! Pass the device to the next player." : "Let's see how everyone did…"}</Subtle>
            <BigButton onClick={() => props.onScore(score!)}>{props.moreToPlay ? "Next player" : "See the results"}</BigButton>
        </Panel>
    );
}

interface CompResultsProps {
    title: string;
    comp: CompDefinition;
    participants: Houseguest[];
    humanIds: number[];
    results: CompResult[];
    onDone: (winnerId: number) => void;
}

// The leaderboard everyone sees after all players have taken their turn.
export function CompResults(props: CompResultsProps) {
    const ranked = rankResults(props.results, props.humanIds);
    const winner = ranked[0];
    const byId = (id: number) => props.participants.find((hg) => hg.id === id)!;
    const isHuman = (id: number) => props.humanIds.includes(id);
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">{props.comp.emoji}</div>
                <Title>{props.comp.name}</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            <div className="bbb-winner">
                <img src={byId(winner.id).imageURL} alt="" />
                <div>
                    <div className="bbb-winner-label">🏆 Winner</div>
                    <div className="bbb-winner-name">
                        {byId(winner.id).name}
                        {isHuman(winner.id) && props.humanIds.length === 1 ? " (you!)" : ""}
                    </div>
                </div>
            </div>
            <ol className="bbb-leaderboard">
                {ranked.map((r) => (
                    <li key={r.id} className={isHuman(r.id) ? "is-human" : ""}>
                        <img src={byId(r.id).imageURL} alt="" />
                        <span className="bbb-lb-name">
                            {byId(r.id).name}
                            {isHuman(r.id) ? " 🎮" : ""}
                        </span>
                        <span className="bbb-lb-score">{props.comp.format(r.score)}</span>
                    </li>
                ))}
            </ol>
            <BigButton onClick={() => props.onDone(winner.id)}>Continue</BigButton>
        </Panel>
    );
}
