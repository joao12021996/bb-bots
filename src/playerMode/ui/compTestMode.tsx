import React from "react";
import { defaultJurySize, GameState, Houseguest, nonEvictedHouseguests, PlayerProfile } from "../../model";
import { WeekRecord } from "../history";
import { ALL_COMPS } from "../comps";
import { CompPlay, CompResult, CompResults, tiedForFirst } from "../comps/compRunner";
import { CompDefinition, Opponent } from "../comps/compTypes";
import { seededRand } from "../comps/random";
import { botHide, HideTiebreakPlay, HideTiebreakResults, hideOutcome, tiebreakHouse, VetoHide } from "../comps/hideTiebreak";
import { cartoonFor } from "../../cartoon/cartoon";
import { BigButton, Panel, Subtle, Title } from "./common";
import { bestScore, recordScore } from "../../prefs/prefs";
import { play as playCue } from "../../sound/sound";

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
    for (let i = players.length; i < 12; i++) {
        const name = `Houseguest ${i + 1}`;
        players.push({ name, imageURL: cartoonFor(name) } as PlayerProfile);
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

// A bot's skill in test mode: a mix, the same for the same seed.
const testSkill = (seed: number, id: number) => 0.25 + 0.6 * seededRand(seed * 31 + id)();

// The bots, as they'd play this comp.
export function testOpponents(comp: CompDefinition, gs: GameState, history: WeekRecord[], participants: Houseguest[], seed: number): Opponent[] {
    const ctx = { seed, gameState: gs, history, participants };
    return participants.slice(1).map((hg) => ({ hg, ...comp.simulate(ctx, testSkill(seed, hg.id), seededRand(seed * 7 + hg.id)) }));
}

// A tie for first, as in a season: Hide the Veto, again and again until someone wins it.
type Tiebreak = { ids: number[]; round: number; hides?: VetoHide[] };

type Game = { comp: CompDefinition; seed: number; gameState: GameState; history: WeekRecord[]; participants: Houseguest[]; opponents: Opponent[] };

export function CompTestMode(props: { cast: PlayerProfile[] }) {
    const [stage, setStage] = React.useState<TestStage>("jury");
    const [game, setGame] = React.useState<Game | null>(null);
    const [results, setResults] = React.useState<CompResult[] | null>(null);
    const [tiebreak, setTiebreak] = React.useState<Tiebreak | null>(null);
    const [wantBots, setBots] = React.useState(3);
    const [newBest, setNewBest] = React.useState<number | null>(null);
    const season = React.useMemo(() => testSeason(props.cast, stage), [props.cast, stage]);
    const maxBots = nonEvictedHouseguests(season.gameState).length - 1;
    const bots = Math.max(1, Math.min(wantBots, maxBots));

    const play = (comp: CompDefinition) => {
        const { gameState, history } = testSeason(props.cast, stage);
        const seed = Math.floor(Math.random() * 1e9);
        const participants = nonEvictedHouseguests(gameState).slice(0, bots + 1);
        setResults(null);
        setTiebreak(null);
        setGame({ comp, seed, gameState, history, participants, opponents: testOpponents(comp, gameState, history, participants, seed) });
    };

    const done = () => {
        setResults(null);
        setTiebreak(null);
        setGame(null);
    };
    const house = (g: Game, round: number) => tiebreakHouse(g.seed * 13 + round);
    const botHides = (g: Game, ids: number[], round: number): VetoHide[] =>
        ids
            .filter((id) => id !== g.participants[0].id)
            .map((id) => ({ id, spot: botHide(house(g, round), testSkill(g.seed, id), seededRand(g.seed * 17 + round * 101 + id)) }));
    // you're not in it: the bots hide straight away, and you watch the search
    const startTiebreak = (g: Game, ids: number[], round: number) =>
        setTiebreak({ ids, round, hides: ids.includes(g.participants[0].id) ? undefined : botHides(g, ids, round) });
    if (game && tiebreak) {
        const me = game.participants[0];
        const tied = tiebreak.ids.map((id) => game.participants.find((hg) => hg.id === id)!);
        const spots = house(game, tiebreak.round);
        if (!tiebreak.hides) {
            return (
                <div className="bbb-test-mode">
                    <HideTiebreakPlay
                        key={tiebreak.round}
                        title="🧪 Test mode"
                        player={me}
                        tied={tied}
                        spots={spots}
                        moreToPlay={false}
                        onHide={(spot) => setTiebreak({ ...tiebreak, hides: [{ id: me.id, spot }, ...botHides(game, tiebreak.ids, tiebreak.round)] })}
                    />
                </div>
            );
        }
        const outcome = hideOutcome(spots, tiebreak.hides);
        return (
            <div className="bbb-test-mode">
                <HideTiebreakResults
                    key={tiebreak.round}
                    title="🧪 Test mode"
                    spots={spots}
                    tied={tied}
                    hides={tiebreak.hides}
                    winnerId={outcome.winnerId}
                    humanIds={[me.id]}
                    onDone={() => (outcome.winnerId === undefined ? startTiebreak(game, outcome.tied, tiebreak.round + 1) : done())}
                />
            </div>
        );
    }
    if (game && results) {
        const tiedIds = tiedForFirst(game.comp, results);
        const tie = tiedIds.length > 1;
        return (
            <div className="bbb-test-mode">
                <CompResults
                    title="🧪 Test mode"
                    comp={game.comp}
                    participants={game.participants}
                    humanIds={[game.participants[0].id]}
                    results={results}
                    tiedIds={tie ? tiedIds : undefined}
                    onDone={() => (tie ? startTiebreak(game, tiedIds, 0) : done())}
                />
                {newBest !== null && <div className="bbb-new-best">⭐ New personal best: {game.comp.format(newBest)}</div>}
                {newBest === null && bestScore(game.comp.id) !== undefined && (
                    <Subtle>Your best: {game.comp.format(bestScore(game.comp.id)!)}</Subtle>
                )}
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
                    onScore={(score, answers, picks) => {
                        const all = [
                            { id: game.participants[0].id, score, answers, picks },
                            ...game.opponents.map((o) => ({ id: o.hg.id, score: o.score, answers: o.answers, picks: o.picks })),
                        ];
                        setNewBest(recordScore(game.comp.id, score) ? score : null);
                        playCue(Math.max(...all.map((r) => r.score)) === score ? "win" : "lose");
                        setResults(all);
                    }}
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
                Practise any competition on its own against bots. Your best score in each one is remembered on this device. You play as{" "}
                {season.gameState.houseguests[0].name}.
            </Subtle>
            <div className="bbb-test-stage">
                <button type="button" className={`button is-small ${stage === "early" ? "is-warning" : "is-light"}`} onClick={() => setStage("early")}>
                    Early in the season
                </button>
                <button type="button" className={`button is-small ${stage === "jury" ? "is-warning" : "is-light"}`} onClick={() => setStage("jury")}>
                    Jury phase
                </button>
            </div>
            <div className="bbb-test-stage">
                <span>🤖 Bots:</span>
                <button type="button" className="button is-small is-light" aria-label="Fewer bots" disabled={bots <= 1} onClick={() => setBots(bots - 1)}>
                    −
                </button>
                <b aria-live="polite">
                    {bots}
                </b>
                <button type="button" className="button is-small is-light" aria-label="More bots" disabled={bots >= maxBots} onClick={() => setBots(bots + 1)}>
                    +
                </button>
            </div>
            {KINDS.map(({ kind, label }) => {
                const comps = ALL_COMPS.filter((c) => c.kind === kind && !c.tiebreakOnly);
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
                                        {bestScore(c.id) !== undefined && <span className="bbb-test-best">⭐ {c.format(bestScore(c.id)!)}</span>}
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
