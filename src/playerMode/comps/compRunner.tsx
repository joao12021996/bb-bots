import React from "react";
import { GameState, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { BigButton, Face, formatSeconds, Grid, Panel, Subtle, Title } from "../ui/common";
import { CompDefinition, EnduranceDeals, isStaged, Opponent } from "./compTypes";
import { seededRand } from "./random";
import { StageContext, StageInfo } from "./compUi";
import { compsInPlay$ } from "../../subjects/subjects";

export interface CompResult {
    id: number;
    score: number;
    answers?: boolean[]; // question comps: right/wrong per question
    picks?: (number | string)[]; // question comps: what they answered
    threw?: boolean; // a bot that lost on purpose
}

// Everyone tied for first. A tie is what the houseguests see: scores that read the same (the same number right,
// the same rounded time) are tied, even if a hidden time bonus would split them. Endurance comps are last one
// standing: whoever outlasts the rest wins, however close it was, so only an exactly equal score ties there.
export function tiedForFirst(comp: { format: (score: number) => string; kind?: string }, results: CompResult[]): number[] {
    if (results.length === 0) return [];
    const top = Math.max(...results.map((r) => r.score));
    const shown = comp.format(top);
    const exact = comp.kind === "endurance";
    const tied = results.filter((r) => r.score === top || (!exact && comp.format(r.score) === shown));
    // the best score first, so a lone winner is tied[0]
    return tied.sort((a, b) => b.score - a.score).map((r) => r.id);
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
    // the player started playing (saved, so reloading mid-comp can't get them a do-over)
    onStart?: () => void;
    // the player's score so far (and answers, in question comps), saved now and then: reloading mid-comp
    // leaves them with it. Online, the other players see it come in.
    onReport?: (score: number, answers?: boolean[], picks?: (number | string)[]) => void;
    // online: the other players in it, playing at the same time
    live?: LiveScore[];
    // they left in the middle of their turn: no do-overs, this is their score
    forfeitScore?: number;
    // online: hand in the score as soon as it's done (the standings come next, while the others finish)
    autoSubmit?: boolean;
}

// Another player's score in a comp everyone's playing at the same time.
export interface LiveScore {
    id: number;
    score: number | null; // null: nothing yet
    answers?: boolean[];
    picks?: (number | string)[];
    done: boolean;
}

// The other players in a comp being played at the same time, as opponents the comp can show: those done with
// their final score. Endurance comps are last one standing, so those still going count as still up.
export function liveOpponents(comp: CompDefinition, participants: Houseguest[], live: LiveScore[]): Opponent[] {
    const out: Opponent[] = [];
    live.forEach((l) => {
        const hg = participants.find((p) => p.id === l.id);
        if (!hg) return;
        if (l.done && l.score !== null) out.push({ hg, score: l.score, answers: l.answers, picks: l.picks, live: { done: true } });
        else if (!l.done && comp.kind === "endurance") out.push({ hg, score: Infinity, live: { done: false } });
    });
    return out;
}

// How the other players are doing, while you play.
function LiveStrip(props: { comp: CompDefinition; participants: Houseguest[]; live: LiveScore[] }) {
    if (props.live.length === 0) return null;
    return (
        <div className="bbb-live-strip">
            {props.live.map((l) => {
                const hg = props.participants.find((p) => p.id === l.id);
                if (!hg) return null;
                const text = l.done
                    ? `✓ ${l.score !== null ? props.comp.format(l.score) : "done"}`
                    : l.score !== null
                    ? `${props.comp.format(l.score)} so far`
                    : "playing…";
                return (
                    <span key={l.id} className={`bbb-live-chip ${l.done ? "is-done" : ""}`}>
                        <img src={hg.imageURL} alt="" />
                        <b>{hg.name}</b> {text}
                    </span>
                );
            })}
        </div>
    );
}

type Phase = "rules" | "countdown" | "play" | "done";

// One player's turn at a competition: rules -> countdown -> play (with a hard time limit) -> their score.
export function CompPlay(props: CompPlayProps) {
    const forfeited = props.forfeitScore !== undefined;
    const [phase, setPhase] = React.useState<Phase>(forfeited ? "done" : "rules");
    const [count, setCount] = React.useState(3);
    const [score, setScore] = React.useState<number | null>(forfeited ? props.forfeitScore! : null);
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
    const done = React.useRef(false);

    const { onReport, onStart, onScore, autoSubmit } = props;
    const sofar = () => [answers.current.length ? [...answers.current] : undefined, picks.current.length ? [...picks.current] : undefined] as const;
    const recordAnswer = React.useCallback(
        (index: number, correct: boolean, pick?: number | string) => {
            answers.current[index] = correct;
            if (pick !== undefined) picks.current[index] = pick;
            // online: the others see the round come in
            if (onReport && lastReported.current !== null) onReport(lastReported.current, ...sofar());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [onReport]
    );
    const submit = React.useCallback(
        (s: number) => onScore(s, answers.current.length ? [...answers.current] : undefined, picks.current.length ? [...picks.current] : undefined),
        [onScore]
    );
    const finish = React.useCallback(
        (s: number) => {
            if (done.current) return;
            done.current = true;
            setScore(s);
            setPhase("done");
            if (autoSubmit) submit(s);
        },
        [autoSubmit, submit]
    );
    const report = React.useCallback(
        (s: number) => {
            lastReported.current = s;
            if (onReport) onReport(s, ...sofar());
        },
        [onReport]
    );
    // the other players, as opponents the comp can show (only changes when their scores do). A comp played in
    // one go shows nobody's score until everyone's done (endurance: who's still up is the comp itself).
    const staged = isStaged(props.comp);
    const showLive = staged || props.comp.kind === "endurance";
    const liveKey = JSON.stringify((showLive && props.live) || []);
    const baseOpponents = props.opponents;
    const opponents = React.useMemo(
        () => [...baseOpponents, ...liveOpponents(props.comp, props.participants, JSON.parse(liveKey))],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [baseOpponents, liveKey]
    );

    // for the screens between stages: everyone's score so far
    const stage = React.useMemo<StageInfo>(() => {
        const playing = (JSON.parse(liveKey) as LiveScore[])
            .filter((l) => !l.done)
            .map((l) => ({ hg: props.participants.find((p) => p.id === l.id)!, score: l.score, answers: l.answers }))
            .filter((p) => !!p.hg);
        return {
            comp: props.comp,
            ctx: { seed: props.seed, gameState: props.gameState, history: props.history, participants: props.participants },
            human: props.player,
            mine: () => ({ answers: answers.current, picks: picks.current }),
            opponents,
            playing,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opponents, liveKey, props.player, props.comp, props.seed]);

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

    // while the comp is on, the arrow keys are the comp's, not the sidebar's
    const playing = phase === "countdown" || phase === "play";
    React.useEffect(() => {
        if (!playing) return;
        compsInPlay$.next(compsInPlay$.value + 1);
        return () => compsInPlay$.next(Math.max(0, compsInPlay$.value - 1));
    }, [playing]);

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
                <BigButton
                    kind="success"
                    onClick={() => {
                        if (onStart) onStart();
                        setPhase("countdown");
                    }}
                >
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
                {staged && props.live && <LiveStrip comp={props.comp} participants={props.participants} live={props.live} />}
                <StageContext.Provider value={stage}>
                    <Component
                        participants={props.participants}
                        human={props.player}
                        gameState={props.gameState}
                        history={props.history}
                        rand={rand}
                        opponents={opponents}
                        report={report}
                        finish={finish}
                        pauseClock={pauseClock}
                        recordAnswer={recordAnswer}
                        deals={props.deals}
                    />
                </StageContext.Provider>
            </Panel>
        );
    }

    return (
        <Panel>
            {header}
            {forfeited && <Subtle>⏱️ You left in the middle of your turn. No do-overs: your score stands.</Subtle>}
            <Title>Your result: {props.comp.format(score!)}</Title>
            {autoSubmit && !forfeited ? (
                <Subtle>Waiting for the others…</Subtle>
            ) : (
                <>
                    <Subtle>{props.moreToPlay ? "Don't tell anyone! Pass the device to the next player." : "Let's see how everyone did…"}</Subtle>
                    <BigButton onClick={() => submit(score!)}>{props.moreToPlay ? "Next player" : forfeited ? "Continue" : "See the results"}</BigButton>
                </>
            )}
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
                        <div>A tiebreaker decides it: Hide the Veto.</div>
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

// While players are still playing a comp (online): everyone's score so far, best first. Bots' results are in;
// players still going show their score so far.
export function LiveStandings(props: { comp: CompDefinition; participants: Houseguest[]; bots: CompResult[]; live: LiveScore[]; youId?: number }) {
    const rows = [
        ...props.bots.map((b) => ({ id: b.id, score: b.score as number | null, done: true, human: false })),
        ...props.live.map((l) => ({ id: l.id, score: l.score, done: l.done, human: true })),
    ].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    const byId = (id: number) => props.participants.find((hg) => hg.id === id);
    return (
        <ol className="bbb-leaderboard bbb-live-standings">
            {rows.map((r) => {
                const hg = byId(r.id);
                if (!hg) return null;
                const score = r.score === null ? "—" : props.comp.format(r.score);
                return (
                    <li key={r.id} className={r.human ? "is-human" : ""}>
                        <img src={hg.imageURL} alt="" />
                        <span className="bbb-lb-name">
                            {r.id === props.youId ? "You" : hg.name}
                            {r.human ? " 🎮" : ""}
                        </span>
                        <span className="bbb-lb-score">{r.done ? score : r.score === null ? "playing…" : `${score} so far`}</span>
                    </li>
                );
            })}
        </ol>
    );
}
