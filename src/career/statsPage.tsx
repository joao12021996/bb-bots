import React from "react";
import { ACHIEVEMENTS, loadCareer, ordinal, resetCareer, totals } from "./career";
import { SeasonCard, placementText } from "./seasonCard";
import { ALL_COMPS } from "../playerMode/comps";
import { bestScore, clearPref } from "../prefs/prefs";
import { HasText } from "../components/layout/text";

// My Stats: everything this device remembers about your seasons.
export function StatsPage() {
    const [version, setVersion] = React.useState(0);
    const career = React.useMemo(() => loadCareer(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
    const t = totals(career);
    const [open, setOpen] = React.useState<string | null>(null);
    const bests = ALL_COMPS.filter((c) => bestScore(c.id) !== undefined);
    const unlockedCount = ACHIEVEMENTS.filter((a) => career.unlocked[a.id]).length;
    const recent = [...career.seasons].reverse();
    return (
        <HasText>
            <div className="bbb-stats-page">
                <div className="bbb-hero">
                    <div className="bbb-hero-kicker">My stats</div>
                    <h1>Your career</h1>
                    <p>Every season you've finished on this device, your records and your achievements.</p>
                </div>
                <div className="bbb-stat-tiles">
                    <Tile label="Seasons" value={t.seasons} />
                    <Tile label="Wins" value={t.wins} />
                    <Tile label="Win rate" value={t.seasons ? `${Math.round(t.winRate * 100)}%` : "–"} />
                    <Tile label="Final two" value={t.finals} />
                    <Tile label="Best finish" value={t.bestFinish ? ordinal(t.bestFinish) : "–"} />
                    <Tile label="Average finish" value={t.averageFinish ?? "–"} />
                    <Tile label="Comps won" value={t.comps} />
                    <Tile label="Times nominated" value={t.nominated} />
                </div>

                <section className="bbb-tutorial-section">
                    <h2>
                        🏅 Achievements{" "}
                        <small className="bbb-subtle">
                            {unlockedCount} of {ACHIEVEMENTS.length}
                        </small>
                    </h2>
                    <div className="bbb-ach-grid">
                        {ACHIEVEMENTS.map((a) => {
                            const got = career.unlocked[a.id];
                            return (
                                <div key={a.id} className={"bbb-ach" + (got ? " is-unlocked" : "")}>
                                    <span className="bbb-ach-emoji" aria-hidden="true">
                                        {got ? a.emoji : "🔒"}
                                    </span>
                                    <div>
                                        <b>{a.title}</b>
                                        <div className="bbb-subtle">{a.how}</div>
                                        {got && <small className="bbb-subtle">Unlocked {new Date(got.when).toLocaleDateString()}</small>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="bbb-tutorial-section">
                    <h2>📜 Your seasons</h2>
                    {recent.length === 0 && <p>No seasons yet. Finish one in player mode and it shows up here.</p>}
                    {recent.slice(0, 30).map((s) => (
                        <div key={s.key}>
                            <button type="button" className="bbb-season-row" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>
                                {s.imageURL && <img src={s.imageURL} alt="" />}
                                <span>
                                    <b>{s.name}</b>: {placementText(s)}
                                </span>
                                <small className="bbb-subtle">{new Date(s.when).toLocaleDateString()}</small>
                            </button>
                            {open === s.key && (
                                <SeasonCard summary={s} unlocked={ACHIEVEMENTS.filter((a) => career.unlocked[a.id] && career.unlocked[a.id].season === s.key)} />
                            )}
                        </div>
                    ))}
                </section>

                <section className="bbb-tutorial-section">
                    <h2>⭐ Best comp scores</h2>
                    {bests.length === 0 ? (
                        <p>No scores yet. Play comps in a season, or practise them in 🧪 Test a comp.</p>
                    ) : (
                        <div className="bbb-best-list">
                            {bests.map((c) => (
                                <div key={c.id}>
                                    {c.emoji} {c.name}: <b>{c.format(bestScore(c.id)!)}</b>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <p style={{ textAlign: "center" }}>
                    <button
                        type="button"
                        className="button is-small is-danger is-light"
                        onClick={() => {
                            let ok = true;
                            try {
                                ok = window.confirm("Forget every season, record and achievement on this device?");
                            } catch (e) {
                                ok = true;
                            }
                            if (!ok) return;
                            resetCareer();
                            clearPref("bests");
                            setVersion(version + 1);
                        }}
                    >
                        Reset my stats
                    </button>
                </p>
            </div>
        </HasText>
    );
}

function Tile(props: { label: string; value: React.ReactNode }) {
    return (
        <div className="bbb-stat-tile">
            <div className="bbb-stat-value">{props.value}</div>
            <div className="bbb-stat-label">{props.label}</div>
        </div>
    );
}
