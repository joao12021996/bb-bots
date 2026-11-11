import React from "react";
import { GameState, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { BigButton, Face, formatSeconds, Grid, Panel, Subtle, Title } from "../ui/common";
import { CompDefinition, EnduranceDeals, Opponent } from "./compTypes";
import { seededRand } from "./random";

export interface CompResult {
    id: number;
    score: number;
    answers?: boolean[]; // question comps: right/wrong per question
    picks?: (number | string)[]; // question comps: what they answered
    threw?: boolean; // a bot that lost on purpose
}

// Ranks results best first. Nobody wins a tie for free: a tie for first goes to a tiebreaker.
export function rankResults(results: CompResult[], _humanIds: number[] = []): CompResult[] {
    return [...results].sort((a, b) => b.score - a.score);
}

interface CompPlayProps {
    title: string; // e.g. "Head of House Competition"
    comp: CompDefinition;
    participants: Houseguest[];
    player: Houseguest; // who is playing now
    gameState: GameState;
    history: WeekRecord[];
    seed: number; // same seed for every player, so everyone gets the same comp
    opponents: Opponent[];
    moreToPlay: boolean; // another player still has to take their turn
    deals?: EnduranceDeals; // endurance HoH comps: deals on the wall
    onScore: (score: number, answers?: boolean[], picks?: (number | string)[]) => void;
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
    // the pause after each answer in question comps doesn't count against the time limit
    const pausedTotal = React.useRef(0);
    const pausedAt = React.useRef<number | null>(null);
    const answers = React.useRef<boolean[]>([]);
    const picks = React.useRef<(number | string)[]>([]);
    const pauseClock = React.useCallback((paused: boolean) => {
        if (paused && pausedAt.current === null) pausedAt.current = Date.now();
        if (!paused && pausedAt.current !== null) {
            pausedTotal.current += Date.now() - pausedAt.current;
            pausedAt.current = null;
        }
    }, []);
    const recordAnswer = React.useCallback((index: number, correct: boolean, pick?: number | string) => {
        answers.current[index] = correct;
        if (pick !== undefined) picks.current[index] = pick;
    }, []);
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

    const paused = pausedTotal.current + (pausedAt.current !== null ? now - pausedAt.current : 0);
    const remaining = phase === "play" ? Math.max(0, props.comp.maxSeconds - (now - playStart - paused) / 1000) : props.comp.maxSeconds;
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
                    pauseClock={pauseClock}
                    recordAnswer={recordAnswer}
                    deals={props.deals}
                />
            </Panel>
        );
    }

    return (
        <Panel>
            {header}
            <Title>Your result: {props.comp.format(score!)}</Title>
            <Subtle>{props.moreToPlay ? "Don't tell anyone! Pass the device to the next player." : "Let's see how everyone did…"}</Subtle>
            <BigButton
                onClick={() =>
                    props.onScore(score!, answers.current.length ? answers.current : undefined, picks.current.length ? picks.current : undefined)
                }
            >{props.moreToPlay ? "Next player" : "See the results"}</BigButton>
        </Panel>
    );
}

interface CompResultsProps {
    title: string;
    comp: CompDefinition;
    participants: Houseguest[];
    humanIds: number[];
    results: CompResult[];
    tiedIds?: number[]; // tied for first, with a player among them: a tiebreaker question decides the winner
    spectating?: boolean; // nobody watching is in it: reveal the standings from last place up
    sealed?: boolean; // a secret Head of House week: nobody sees who won
    onDone: (winnerId: number) => void;
}

// The leaderboard everyone sees after all players have taken their turn.
export function CompResults(props: CompResultsProps) {
    if (props.sealed) return <Sealed {...props} />;
    return props.spectating ? <Spectate {...props} /> : <Standings {...props} />;
}

// A secret Head of House week: the results are sealed. Only a lone player who won gets to know.
function Sealed(props: CompResultsProps) {
    const ranked = rankResults(props.results, props.humanIds);
    const top = ranked[0];
    const tied = props.tiedIds && props.tiedIds.length > 1;
    const yours = !tied && props.humanIds.length === 1 && top && top.id === props.humanIds[0];
    const mine = props.results.find((r) => props.humanIds.length === 1 && r.id === props.humanIds[0]);
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">{props.comp.emoji}</div>
                <Title>{props.comp.name}</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            <div className="bbb-winner">
                <div>
                    <div className="bbb-winner-label">🕶️ Results sealed</div>
                    <div className="bbb-winner-name">The winner stays a secret</div>
                    {tied && <div>There was a tie: a tiebreaker will decide it, in private.</div>}
                </div>
            </div>
            {mine && <Subtle>Your result: {props.comp.format(mine.score)}</Subtle>}
            {yours && <Subtle>🤫 You won. Nobody else knows.</Subtle>}
            <BigButton onClick={() => props.onDone(top.id)}>Continue</BigButton>
        </Panel>
    );
}

// Watching a comp you're not in: everyone's result comes in, from last place up to the winner.
function Spectate(props: CompResultsProps) {
    const ranked = rankResults(props.results, props.humanIds);
    const [shown, setShown] = React.useState(0); // how many results are in, counting from last place
    const done = shown >= ranked.length;
    React.useEffect(() => {
        if (done) return;
        const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 900 : 1300);
        return () => clearTimeout(t);
    }, [shown, done]);
    if (done) return <Standings {...props} spectating={false} />;
    const byId = (id: number) => props.participants.find((hg) => hg.id === id)!;
    const revealed = ranked.slice(ranked.length - shown);
    const still = ranked.slice(0, ranked.length - shown);
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">{props.comp.emoji}</div>
                <Title>{props.comp.name}</Title>
                <Subtle>{props.title} · You're watching from the sidelines</Subtle>
            </div>
            <p className="bbb-rules">{props.comp.rules}</p>
            <Subtle>{still.length > 1 ? `${still.length} still in it…` : "Down to the last one…"}</Subtle>
            <Grid>
                {still.map((r) => (
                    <Face key={r.id} hg={byId(r.id)} small={true} caption="still in it" />
                ))}
            </Grid>
            <ol className="bbb-leaderboard" start={still.length + 1}>
                {revealed.map((r) => (
                    <li key={r.id}>
                        <img src={byId(r.id).imageURL} alt="" />
                        <span className="bbb-lb-name">{byId(r.id).name}</span>
                        <span className="bbb-lb-score">{props.comp.format(r.score)}</span>
                    </li>
                ))}
            </ol>
            <BigButton kind="light" onClick={() => setShown(ranked.length)}>
                Skip to the results
            </BigButton>
        </Panel>
    );
}

function Standings(props: CompResultsProps) {
    const ranked = rankResults(props.results, props.humanIds);
    const winner = ranked[0];
    const byId = (id: number) => props.participants.find((hg) => hg.id === id)!;
    const isHuman = (id: number) => props.humanIds.includes(id);
    const tied = props.tiedIds && props.tiedIds.length > 1 ? props.tiedIds : null;
    const threw = props.results.filter((r) => r.threw && r.id !== winner.id);
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">{props.comp.emoji}</div>
                <Title>{props.comp.name}</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            {tied ? (
                <div className="bbb-winner">
                    <div>
                        <div className="bbb-winner-label">⚖️ It's a tie!</div>
                        <div className="bbb-winner-name">{tied.map((id) => byId(id).name).join(" vs ")}</div>
                        <div>A tiebreaker question will decide it.</div>
                    </div>
                </div>
            ) : (
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
            )}
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
            {threw.length > 0 && (
                <Subtle>👀 Didn't look like they were trying very hard: {threw.map((r) => byId(r.id).name).join(", ")}</Subtle>
            )}
            <BigButton onClick={() => props.onDone(winner.id)}>{tied ? "On to the tiebreaker" : "Continue"}</BigButton>
        </Panel>
    );
}
