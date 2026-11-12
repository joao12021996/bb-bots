import React from "react";
import { defaultJurySize, GameState, Houseguest, nonEvictedHouseguests, PlayerProfile } from "../../model";
import { WeekRecord } from "../history";
import { ALL_COMPS } from "../comps";
import { CompPlay, CompResult, CompResults } from "../comps/compRunner";
import { CompDefinition, Opponent } from "../comps/compTypes";
import { seededRand } from "../comps/random";
import { initialsAvatar } from "./avatar";
import { BigButton, Panel, Subtle, Title } from "./common";

// Test mode: play any single comp against a few bots, outside a season. Nothing is saved.

export type TestStage = "early" | "jury";

const KINDS: { kind: CompDefinition["kind"]; label: string }[] = [
    { kind: "skill", label: "🧠 Skill" },
    { kind: "memory", label: "🧩 Memory" },
    { kind: "reflex", label: "⚡ Reflex" },
    { kind: "quiz", label: "❓ Quiz" },
    { kind: "endurance", label: "🧗 Endurance" },
    { kind: "luck", label: "🎲 Luck" },
];

// A made-up season to play a comp in: a few weeks gone, and (at the jury stage) a few jurors.
export function testSeason(cast: PlayerProfile[], stage: TestStage): { gameState: GameState; history: WeekRecord[] } {
    const players: PlayerProfile[] = [...cast];
    for (let i = players.length; i < 10; i++) {
        const name = `Houseguest ${i + 1}`;
        players.push({ name, imageURL: initialsAvatar(name) } as PlayerProfile);
    }
    const gs = new GameState({ players, jury: defaultJurySize(players.length) });
    const evictions = stage === "jury" ? Math.min(players.length - 4, 2 + 3) : Math.min(players.length - 4, 2);
    const preJury = stage === "jury" ? 2 : evictions;
    const history: WeekRecord[] = [];
    // evict from the end of the cast, so the first few (you among them) are still in the house
    for (let w = 0; w < evictions; w++) {
        const out = gs.houseguests[gs.houseguests.length - 1 - w];
        const inside = gs.houseguests.filter((hg) => !hg.isEvicted && hg.id !== out.id);
        const hoh = inside[w % inside.length];
        const pov = inside[(w + 2) % inside.length];
        const other = inside[(w + 1) % inside.length];
        hoh.hohWins++;
        pov.povWins++;
        out.nominations++;
        other.nominations++;
        out.isEvicted = true;
        if (w >= preJury) out.isJury = true;
        gs.nonEvictedHouseguests.delete(out.id);
        history.push({ week: w + 1, hohId: hoh.id, nomineeIds: [out.id, other.id], povId: pov.id, evictedIds: [out.id] } as WeekRecord);
    }
    Object.assign(gs, { remainingPlayers: gs.nonEvictedHouseguests.size, phase: evictions + 1 });
    return { gameState: gs, history };
}

// The bots, as they'd play this comp: a mix of skills, the same for the same seed.
export function testOpponents(comp: CompDefinition, gs: GameState, history: WeekRecord[], participants: Houseguest[], seed: number): Opponent[] {
    const ctx = { seed, gameState: gs, history, participants };
    return participants.slice(1).map((hg) => {
        const skill = 0.25 + 0.6 * seededRand(seed * 31 + hg.id)();
        return { hg, ...comp.simulate(ctx, skill, seededRand(seed * 7 + hg.id)) };
    });
}

type Game = { comp: CompDefinition; seed: number; gameState: GameState; history: WeekRecord[]; participants: Houseguest[]; opponents: Opponent[] };

export function CompTestMode(props: { cast: PlayerProfile[] }) {
    const [stage, setStage] = React.useState<TestStage>("jury");
    const [game, setGame] = React.useState<Game | null>(null);
    const [results, setResults] = React.useState<CompResult[] | null>(null);
    const season = React.useMemo(() => testSeason(props.cast, stage), [props.cast, stage]);

    const play = (comp: CompDefinition) => {
        const { gameState, history } = testSeason(props.cast, stage);
        const seed = Math.floor(Math.random() * 1e9);
        const participants = nonEvictedHouseguests(gameState).slice(0, 4);
        setResults(null);
        setGame({ comp, seed, gameState, history, participants, opponents: testOpponents(comp, gameState, history, participants, seed) });
    };

    if (game && results) {
        return (
            <div className="bbb-test-mode">
                <CompResults
                    title="🧪 Test mode"
                    comp={game.comp}
                    participants={game.participants}
                    humanIds={[game.participants[0].id]}
                    results={results}
                    onDone={() => {
                        setResults(null);
                        setGame(null);
                    }}
                />
                <BigButton kind="info" onClick={() => play(game.comp)}>
                    🔁 Play {game.comp.name} again
                </BigButton>
            </div>
        );
    }
    if (game) {
        return (
            <div className="bbb-test-mode">
                <CompPlay
                    key={game.seed}
                    title="🧪 Test mode"
                    comp={game.comp}
                    participants={game.participants}
                    player={game.participants[0]}
                    gameState={game.gameState}
                    history={game.history}
                    seed={game.seed}
                    opponents={game.opponents}
                    moreToPlay={false}
                    onScore={(score, answers, picks) =>
                        setResults([
                            { id: game.participants[0].id, score, answers, picks },
                            ...game.opponents.map((o) => ({ id: o.hg.id, score: o.score, answers: o.answers, picks: o.picks })),
                        ])
                    }
                />
                <BigButton kind="light" onClick={() => setGame(null)}>
                    ← Back to the list
                </BigButton>
            </div>
        );
    }
    return (
        <Panel className="bbb-test-mode">
            <Title>🧪 Test a comp</Title>
            <Subtle>
                Play any competition on its own against three bots. Nothing is saved. You play as {season.gameState.houseguests[0].name}.
            </Subtle>
            <div className="bbb-test-stage">
                <button type="button" className={`button is-small ${stage === "early" ? "is-warning" : "is-light"}`} onClick={() => setStage("early")}>
                    Early in the season
                </button>
                <button type="button" className={`button is-small ${stage === "jury" ? "is-warning" : "is-light"}`} onClick={() => setStage("jury")}>
                    Jury phase
                </button>
            </div>
            {KINDS.map(({ kind, label }) => {
                const comps = ALL_COMPS.filter((c) => c.kind === kind);
                if (comps.length === 0) return null;
                return (
                    <div key={kind} className="bbb-test-group">
                        <h4>{label}</h4>
                        <div className="bbb-test-comps">
                            {comps.map((c) => {
                                const fits = !c.available || c.available(season.gameState, season.history);
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className={`button is-small ${fits ? "is-dark" : "is-dark is-outlined"}`}
                                        title={fits ? c.rules : "Wouldn't come up at this point in a real season, but you can still try it."}
                                        onClick={() => play(c)}
                                    >
                                        {c.emoji} {c.name}
                                        {!fits ? " *" : ""}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
            <Subtle>* wouldn't come up at this point in a real season</Subtle>
        </Panel>
    );
}
