import React from "react";
import { GameState, getById } from "../../model";
import { WeekRecord } from "../history";
import { HOH, LAST_CHANCE, VETO } from "../terms";

export interface Standing {
    name: string;
    threat: { label: string; emoji: string; reasons: string[] };
    reputation: { label: string; emoji: string };
    alliances: string[];
    warm: number; // houseguests who seemed to like you, last time you checked
    cold: number; // ...and who seemed wary of you
    unknown: number; // nobody you've had a read on
    tips: string[];
}

// The week that was, on one screen: the comps, the block, the vote, the house's biggest threats, and (for a
// player alone on their device) where they stand.
export function WeekReview(props: {
    gs: GameState;
    week: WeekRecord;
    secretHoh?: boolean;
    threats: { id: number; emoji: string; label: string }[];
    standing?: Standing;
}) {
    const { gs, week } = props;
    const name = (id: number) => getById(gs, id).name;
    const face = (id: number) => <img className="bbb-review-face" src={getById(gs, id).imageURL} alt="" />;
    const tally = week.votes
        ? Object.keys(week.votes)
              .map(Number)
              .sort((a, b) => week.votes![b] - week.votes![a])
              .map((id) => week.votes![id])
        : null;
    const unanimous = tally && tally.length > 1 && tally.slice(1).every((n) => n === 0);
    return (
        <div className="bbb-review">
            <div className="bbb-review-title">📋 Week {week.week} in review</div>
            <div className="bbb-review-grid">
                {week.hohId !== undefined && (
                    <div className="bbb-review-item">
                        <span className="bbb-review-label">👑 {HOH}</span>
                        <span>{props.secretHoh ? "🕶️ secret" : <>{face(week.hohId)} {name(week.hohId)}</>}</span>
                    </div>
                )}
                {week.povId !== undefined && (
                    <div className="bbb-review-item">
                        <span className="bbb-review-label">🛡️ {VETO}</span>
                        <span>
                            {face(week.povId)} {name(week.povId)}
                        </span>
                    </div>
                )}
                {week.blockbusterId !== undefined && (
                    <div className="bbb-review-item">
                        <span className="bbb-review-label">🎬 {LAST_CHANCE}</span>
                        <span>
                            {face(week.blockbusterId)} {name(week.blockbusterId)}
                        </span>
                    </div>
                )}
                <div className="bbb-review-item">
                    <span className="bbb-review-label">🎯 On the block</span>
                    <span>{week.nomineeIds.map(name).join(", ")}</span>
                </div>
                {week.evictedIds.length > 0 && (
                    <div className="bbb-review-item">
                        <span className="bbb-review-label">🚪 Evicted</span>
                        <span>
                            {week.evictedIds.map((id) => (
                                <React.Fragment key={id}>
                                    {face(id)} {name(id)}
                                </React.Fragment>
                            ))}
                            {tally && tally.length > 1 && (
                                <small className="bbb-review-tally">
                                    {" "}
                                    by a vote of {tally.join(" to ")}
                                    {unanimous ? " (unanimous)" : ""}
                                </small>
                            )}
                        </span>
                    </div>
                )}
            </div>
            {!props.secretHoh && week.why && week.why.noms && week.hohId !== undefined && Object.keys(week.why.noms).length > 0 && (
                <div className="bbb-review-why">
                    <b>🤔 Why {name(week.hohId)} nominated who they did</b>
                    {Object.keys(week.why.noms)
                        .map(Number)
                        .map((id) => (
                            <div key={id}>
                                <b>{name(id)}</b>: {week.why!.noms![id]}.
                            </div>
                        ))}
                </div>
            )}
            {props.threats.length > 0 && (
                <div className="bbb-review-threats">
                    <b>🔥 The house's biggest threats:</b>{" "}
                    {props.threats.map((t, i) => (
                        <span key={t.id} className="bbb-review-threat">
                            {face(t.id)} {name(t.id)}
                        </span>
                    ))}
                </div>
            )}
            {props.standing && <YourStanding standing={props.standing} />}
        </div>
    );
}

function YourStanding(props: { standing: Standing }) {
    const s = props.standing;
    return (
        <div className="bbb-review-you">
            <div className="bbb-review-you-title">🧭 Where you stand, {s.name}</div>
            <div className="bbb-review-chips">
                <span className="bbb-chip">
                    {s.threat.emoji} Threat: {s.threat.label}
                </span>
                <span className="bbb-chip">
                    {s.reputation.emoji} Reputation: {s.reputation.label}
                </span>
                <span className="bbb-chip">🙂 {s.warm} seem to like you</span>
                <span className="bbb-chip">😒 {s.cold} seem wary</span>
                {s.unknown > 0 && <span className="bbb-chip">❔ {s.unknown} you haven't read</span>}
            </div>
            {s.alliances.length > 0 ? (
                <div>🤝 Your alliances: {s.alliances.join(", ")}</div>
            ) : (
                <div>🤝 You're not in an alliance.</div>
            )}
            {s.threat.reasons.length > 0 && <div className="bbb-subtle">Why you're seen as a threat: {s.threat.reasons.join(", ")}.</div>}
            {s.tips.map((tip, i) => (
                <div key={i} className="bbb-review-tip">
                    💡 {tip}
                </div>
            ))}
        </div>
    );
}

// The season's end: every bot's nominations and votes, explained, week by week.
export function WhyTheyDidIt(props: { gs: GameState; history: WeekRecord[] }) {
    const { gs } = props;
    const name = (id: number) => getById(gs, id).name;
    const weeks = props.history.filter((w) => w.why && ((w.why.noms && Object.keys(w.why.noms).length) || (w.why.votes && Object.keys(w.why.votes).length)));
    if (weeks.length === 0) return null;
    return (
        <div>
            <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🤔 Why they did it</h3>
            {weeks.map((w) => (
                <details key={w.week} className="bbb-why-week">
                    <summary>
                        Week {w.week}
                        {w.evictedIds.length > 0 ? `: ${w.evictedIds.map(name).join(", ")} evicted` : ""}
                    </summary>
                    {w.why!.noms &&
                        w.hohId !== undefined &&
                        Object.keys(w.why!.noms)
                            .map(Number)
                            .map((id) => (
                                <p key={`n${id}`}>
                                    🎯 {name(w.hohId!)} nominated <b>{name(id)}</b>: {w.why!.noms![id]}.
                                </p>
                            ))}
                    {w.why!.votes &&
                        Object.keys(w.why!.votes)
                            .map(Number)
                            .map((id) => (
                                <p key={`v${id}`}>
                                    🗳️ {name(id)} voted to evict <b>{name(w.why!.votes![id].t)}</b>: {w.why!.votes![id].why}.
                                </p>
                            ))}
                </details>
            ))}
        </div>
    );
}
