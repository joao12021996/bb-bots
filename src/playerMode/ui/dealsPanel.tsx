import React from "react";
import { PlayerModeController } from "../playerModeController";
import { Pledge, reputation, reputationLabel } from "../social/promises";
import { aliveMembers } from "../social/alliances";

// The player's word: promises they made and were made, how each turned out, and their reputation.
export function PromiseList(props: { controller: PlayerModeController; actorId: number }) {
    const { controller, actorId } = props;
    const ledger = controller.ledger;
    const week = controller.gameState.phase;
    const name = (id: number) => controller.player(id).name;
    const mine = ledger.pledges
        .filter((p) => (p.fromId === actorId || p.toId === actorId) && p.status !== "void")
        // a promise to you that was broken behind your back stays "open" as far as you know
        .filter((p) => !(p.toId === actorId && p.status === "broken" && !p.known))
        .slice(-10)
        .reverse();
    const rep = reputationLabel(reputation(ledger, actorId));
    // pawns: who went up for whom (see askPawn), while both are still in the house
    const favors = (controller.state.pawnFavors || []).filter(
        (f) => (f.hohId === actorId || f.pawnId === actorId) && !controller.player(f.hohId).isEvicted && !controller.player(f.pawnId).isEvicted
    );
    const what = (p: Pledge) => {
        if (p.kind === "final2") return "final two together";
        if (p.kind === "vote") return "no vote to evict";
        if (p.kind === "veto") return "the veto";
        if (p.kind === "noVeto") return "nominations stay the same";
        if (p.week === week) return "safety this week";
        if (p.week === week + 1) return "safety next week";
        return "safety";
    };
    const status = (p: Pledge) => {
        if (p.status === "kept") return "✅ kept";
        if (p.status === "broken" && p.fromId === actorId && !p.known) return "🤫 broken (secretly)";
        if (p.status === "broken") return "💔 broken";
        return "⏳";
    };
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">
                📒 Your word · {rep.emoji} {rep.label}
            </div>
            {favors.map((f, i) => (
                <p key={`pawn-${i}`}>
                    {f.agreed ? "🙋" : "😠"}{" "}
                    {f.hohId === actorId
                        ? f.agreed
                            ? `${name(f.pawnId)} went up as your pawn (week ${f.week}): they're owed one`
                            : `You nominated ${name(f.pawnId)} after they said no (week ${f.week})`
                        : f.agreed
                        ? `You went up as ${name(f.hohId)}'s pawn (week ${f.week}): they owe you one`
                        : `${name(f.hohId)} nominated you after you said no (week ${f.week})`}
                </p>
            ))}
            {mine.length === 0 && favors.length === 0 ? (
                <p>No promises yet, either way.</p>
            ) : mine.length === 0 ? null : (
                mine.map((p) => (
                    <p key={p.id}>
                        {status(p)} {p.fromId === actorId ? `You → ${name(p.toId)}` : `${name(p.fromId)} → you`}: {what(p)}
                    </p>
                ))
            )}
        </div>
    );
}

// Vote counting: what everyone said they'd do (not necessarily what they'll do).
export function VoteCount(props: { controller: PlayerModeController; actorId: number }) {
    const { controller, actorId } = props;
    const nomIds = controller.state.week.nomineeIds || [];
    if (nomIds.length < 2) return null;
    const rows = controller.tally(actorId);
    const counts = nomIds.map((id) => ({ id, n: rows.filter((r) => r.said === id).length }));
    const unknown = rows.filter((r) => r.said === undefined).length;
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">🗳️ Your vote count</div>
            <p>
                {counts.map((c) => `${controller.player(c.id).name}: ${c.n}`).join(" · ")}
                {unknown > 0 ? ` · ${unknown} unknown` : ""}
            </p>
            {rows.map((r) => (
                <p key={r.hg.id} style={{ opacity: r.said === undefined ? 0.6 : 1 }}>
                    {r.hg.name}:{" "}
                    {r.said !== undefined
                        ? `says evict ${controller.player(r.said).name}`
                        : controller.isHuman(r.hg)
                        ? "a player, can't ask"
                        : "not asked yet"}
                </p>
            ))}
            <p style={{ opacity: 0.7 }}>People don't always tell the truth about their votes.</p>
        </div>
    );
}

// How much of a target the player is, and why.
export function ThreatMeter(props: { controller: PlayerModeController; actorId: number }) {
    const t = props.controller.threatOf(props.actorId);
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">
                🎯 Threat level: {t.emoji} {t.label}
            </div>
            <p>
                {t.reasons.length > 0 ? `The house sees: ${t.reasons.join(", ")}.` : "Nobody's worried about you. Yet."}
                {t.rank < 2 ? " Big threats get nominated, and voted out, especially late in the game." : ""}
            </p>
        </div>
    );
}

// Being in too many alliances gets you exposed.
export function AllianceCount(props: { controller: PlayerModeController; actorId: number }) {
    const n = props.controller.alliancesOf(props.actorId).length;
    if (n < 2) return null;
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">🕸️ You're in {n} alliances</div>
            <p>
                {n >= 3
                    ? "That's a lot of sides to play. The more alliances you're in, the likelier the house figures it out."
                    : "Careful: one more and people may start to notice you're playing every side."}
            </p>
        </div>
    );
}

// Alliances the player has overheard: who's in them, and who they're after.
export function Overheard(props: { controller: PlayerModeController; actorId: number }) {
    const { controller, actorId } = props;
    const gs = controller.gameState;
    const known = controller
        .overheardBy(actorId)
        .map((id) => controller.book.alliances.find((a) => a.id === id))
        .filter((a) => a && aliveMembers(gs, a).length >= 2 && !a.memberIds.includes(actorId));
    if (known.length === 0) return null;
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">👂 Alliances you've overheard</div>
            {known.map((a) => {
                const target = a!.target !== undefined && a!.targetWeek === gs.phase ? controller.player(a!.target) : null;
                return (
                    <p key={a!.id}>
                        <b>{a!.name}</b>: {aliveMembers(gs, a!).map((m) => m.name).join(", ")}
                        {target && !target.isEvicted ? ` · after ${target.id === actorId ? "YOU" : target.name}` : ""}
                    </p>
                );
            })}
        </div>
    );
}

// Jury management: what you did to each juror. You know what you did; you don't know how much each of them
// cares, or what they've heard from each other in the jury house.
export function JuryWatch(props: { controller: PlayerModeController; actorId: number }) {
    const rows = props.controller.juryView(props.actorId).map((r) => ({
        ...r,
        reasons: r.reasons.filter((reason) => !reason.startsWith("(heard from")),
    }));
    if (rows.length === 0) return null;
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">🧑‍⚖️ The jury so far</div>
            {rows.map((r) => (
                <p key={r.juror.id}>
                    <b>{r.juror.name}</b>:{" "}
                    {r.reasons.length === 0
                        ? "nothing personal, as far as you know"
                        : r.reasons.slice(0, 3).join("; ")}
                </p>
            ))}
        </div>
    );
}

// The secret power this player holds, if any. Only they can see it.
export function PowerCard(props: { controller: PlayerModeController; actorId: number }) {
    const power = props.controller.heldPower(props.actorId);
    if (!power) return null;
    return (
        <div className="bbb-card-box bbb-power">
            <div className="bbb-card-title">
                🤫 Your secret power: {power.emoji} {power.name}
            </div>
            <p>{power.howTo}</p>
            <p style={{ opacity: 0.7 }}>Nobody else knows you have it. When the moment comes, you'll be asked.</p>
        </div>
    );
}
