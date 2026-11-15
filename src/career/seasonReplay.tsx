import React from "react";
import { houseAt, SharedSeason } from "./seasonShare";
import { ordinal } from "./career";
import { HasText } from "../components/layout/text";
import { HOH, LAST_CHANCE, VETO } from "../playerMode/terms";

// A shared season, played back: the house, then one week at a time (who won what, who went up, how the vote
// went, who left), then the finale and the jury's vote. Opened from a `?season=` link.
export function SeasonReplay(props: { season: SharedSeason; onDone?: () => void }): JSX.Element {
    const { season } = props;
    const last = season.weeks.length; // the finale's step
    const [step, setStep] = React.useState(-1); // -1: the cast, before anything happens
    const [playing, setPlaying] = React.useState(false);
    React.useEffect(() => {
        if (!playing) return;
        if (step >= last) {
            setPlaying(false);
            return;
        }
        const timer = setTimeout(() => setStep((s) => Math.min(last, s + 1)), 2600);
        return () => clearTimeout(timer);
    }, [playing, step, last]);

    const name = (id: number | undefined) => (id === undefined ? "?" : season.cast[id].name);
    const names = (ids: number[]) => ids.map(name).join(", ");
    const house = step < 0 ? { out: new Set<number>(), returned: [] as number[] } : houseAt(season, step);
    const week = step >= 0 && step < last ? season.weeks[step] : null;
    const finale = step >= last;
    const winner = season.winner;
    const tag = (id: number): string => {
        if (finale) return id === winner ? "🏆" : id === season.runnerUp ? "🥈" : "";
        if (!week) return season.players.includes(id) ? "🎮" : "";
        if (week.evicted.includes(id)) return "🚪";
        if (week.hoh === id) return "👑";
        if (week.noms.includes(id)) return "🎯";
        if (week.pov === id) return "🏅";
        return "";
    };
    const votesFor = (finalist: number | undefined) => season.jury.filter(([, v]) => v === finalist).length;
    const people = season.players.map(name);

    return (
        <HasText>
            <div className="bbb-replay">
                <div className="bbb-hero small">
                    <div className="bbb-hero-kicker">A season to watch</div>
                    <h1>{finale ? "Finale" : week ? `Week ${step + 1}` : "The house"}</h1>
                    <p>
                        {season.cast.length} houseguests
                        {people.length > 0 && ` · played by ${people.join(", ")}`}
                        {season.difficulty ? ` · ${season.difficulty}` : ""}
                    </p>
                </div>

                <div className="bbb-replay-wall" aria-label="The house">
                    {season.cast.map((hg, id) => {
                        const gone = house.out.has(id) && !(week && week.evicted.includes(id));
                        return (
                            <div key={id} className={"bbb-replay-face" + (gone ? " is-out" : "") + (season.players.includes(id) ? " is-player" : "")}>
                                <img src={hg.imageURL} alt="" />
                                <span>
                                    {tag(id)} {hg.name}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="bbb-replay-story" aria-live="polite">
                    {step < 0 && <p>{season.cast.length} strangers move in. Press play to see how it went.</p>}
                    {week && (
                        <>
                            {house.returned.length > 0 && <p>🔙 {names(house.returned)} won the way back into the house.</p>}
                            {week.hoh !== undefined ? (
                                <p>
                                    👑 <b>{name(week.hoh)}</b> won {HOH}.
                                </p>
                            ) : (
                                <p>👑 A {HOH} was crowned.</p>
                            )}
                            {week.noms.length > 0 && (
                                <p>
                                    🎯 On the block at the end of the week: <b>{names(week.noms)}</b>.
                                </p>
                            )}
                            {week.pov !== undefined && (
                                <p>
                                    🏅 <b>{name(week.pov)}</b> won the {VETO}.
                                </p>
                            )}
                            {week.breaker !== undefined && (
                                <p>
                                    🧱 <b>{name(week.breaker)}</b> won the {LAST_CHANCE} and came off the block.
                                </p>
                            )}
                            {week.evicted.length > 0 && (
                                <p>
                                    🚪 <b>{names(week.evicted)}</b> {week.evicted.length === 1 ? "was" : "were"} evicted
                                    {week.votes.length === week.noms.length && week.votes.some((v) => v > 0) ? `, ${[...week.votes].sort((a, b) => b - a).join(" to ")}` : ""}
                                    {week.evicted.map((id) => ` (${ordinal(season.placements[id])} place)`).join("")}.
                                </p>
                            )}
                        </>
                    )}
                    {finale && (
                        <>
                            <p>
                                🏆 <b>{name(winner)}</b> won the season
                                {season.jury.length > 0 ? `, ${votesFor(winner)} to ${votesFor(season.runnerUp)}` : ""}, over <b>{name(season.runnerUp)}</b>.
                            </p>
                            {season.jury.length > 0 && (
                                <p>
                                    ⚖️ The jury: {season.jury.map(([juror, vote]) => `${name(juror)} → ${name(vote)}`).join(" · ")}
                                </p>
                            )}
                            {season.players.length > 0 && (
                                <p>🎮 {season.players.map((id) => `${name(id)} finished ${ordinal(season.placements[id])}`).join("; ")}.</p>
                            )}
                        </>
                    )}
                </div>

                <div className="bbb-replay-controls">
                    <button type="button" className="button is-light" disabled={step < 0} onClick={() => {
                            setPlaying(false);
                            setStep(step - 1);
                        }}>
                        ‹ Back
                    </button>
                    <button type="button" className="button is-warning" onClick={() => {
                            if (step >= last) setStep(-1);
                            setPlaying(step >= last ? true : !playing);
                        }}>
                        {step >= last ? "↻ From the start" : playing ? "⏸ Pause" : "▶ Play"}
                    </button>
                    <button type="button" className="button is-light" disabled={step >= last} onClick={() => {
                            setPlaying(false);
                            setStep(step + 1);
                        }}>
                        Next ›
                    </button>
                    <small className="bbb-subtle">
                        {step < 0 ? "Before week 1" : finale ? "The end" : `Week ${step + 1} of ${last}`}
                    </small>
                </div>
                {props.onDone && (
                    <p style={{ textAlign: "center" }}>
                        <button type="button" className="button is-success" onClick={props.onDone}>
                            🎮 Play a season of your own
                        </button>
                    </p>
                )}
            </div>
        </HasText>
    );
}
