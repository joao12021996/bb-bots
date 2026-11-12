import React from "react";
import { knownProfile$ } from "../../subjects/subjects";
import { getActiveController, PlayerModeController } from "../playerModeController";

// Whose notes to show: the only player, or (pass-and-play) whoever's turn it is right now.
export function profileViewer(controller: PlayerModeController): number | undefined {
    const humans = controller.state.humanIds;
    if (humans.length === 1) return humans[0];
    const prompt: any = controller.prompt$.value;
    return prompt && typeof prompt.actorId === "number" && humans.includes(prompt.actorId) && prompt.kind !== "handoff"
        ? prompt.actorId
        : undefined;
}

// Clicking a houseguest in player mode: what you've found out about them. Never their real relationships.
export function KnownProfileCard(props: { controller: PlayerModeController; viewerId?: number; otherId: number; onClose: () => void }) {
    const { controller, viewerId, otherId } = props;
    const hg = controller.player(otherId);
    const self = viewerId === otherId;
    const p = viewerId !== undefined && !self ? controller.knownProfile(viewerId, otherId) : null;
    return (
        <div className="bbb-profile" role="dialog" aria-label={`What you know about ${hg.name}`}>
            <button className="bbb-profile-close" onClick={props.onClose} aria-label="Close">
                ✕
            </button>
            <div className="bbb-profile-head">
                <img src={hg.imageURL} alt={hg.name} />
                <div>
                    <div className="bbb-card-title">{hg.name}</div>
                    <div style={{ opacity: 0.7 }}>
                        {hg.isEvicted ? (hg.isJury ? "⚖️ On the jury" : "Evicted") : "In the house"} · 👑 {hg.hohWins} · 🏅 {hg.povWins} · Nominated{" "}
                        {hg.nominations}×
                    </div>
                </div>
            </div>
            {self && <p>That's you.</p>}
            {viewerId === undefined && <p>Open this on your own turn to see your notes on {hg.name}.</p>}
            {p && (
                <>
                    <h4>How they seem with you</h4>
                    <p>
                        {p.read ? `${p.read.emoji} ${p.read.label} (Day ${p.read.day}${p.read.old ? ", a while ago" : ""})` : "❔ No read yet: talk to them."}
                        {p.trust && ` · 🤝 ${p.trust.label}`}
                    </p>
                    {p.voteSaid && <p>🗳️ Told you they're voting to evict {p.voteSaid}.</p>}
                    <h4>Who they're with</h4>
                    {p.alliances.length === 0 && !p.showmance && <p style={{ opacity: 0.7 }}>Nothing you know of.</p>}
                    {p.showmance && <p>💕 Showmance with {p.showmance}</p>}
                    {p.alliances.map((a, i) => (
                        <p key={i}>
                            {a.yours ? "🤝" : "👂"} <b>{a.name}</b>
                            {a.members.length ? `: ${a.members.join(", ")}` : ""}
                            {a.yours ? " (your alliance)" : " (overheard)"}
                        </p>
                    ))}
                    {p.pledges.length > 0 && (
                        <>
                            <h4>Promises</h4>
                            {p.pledges.map((x, i) => (
                                <p key={i}>
                                    {x.text}: {x.status === "open" ? "standing" : x.status}
                                </p>
                            ))}
                        </>
                    )}
                    {p.notes.length > 0 && (
                        <>
                            <h4>What you've picked up</h4>
                            {p.notes.map((n, i) => (
                                <p key={i}>
                                    <span style={{ opacity: 0.7 }}>Day {n.day}</span> {n.text}
                                </p>
                            ))}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// Mounted once at the top of the app: opens whenever a houseguest is clicked during a player mode season.
export function KnownProfileModal() {
    const [id, setId] = React.useState<number | null>(knownProfile$.value);
    React.useEffect(() => {
        const sub = knownProfile$.subscribe(setId);
        return () => sub.unsubscribe();
    }, []);
    const controller = getActiveController();
    if (id === null || !controller || !controller.gameState.houseguests.some((h) => h.id === id)) return null;
    const close = () => knownProfile$.next(null);
    return (
        <div className="bbb-profile-backdrop" onClick={close} onKeyDown={(e) => e.key === "Escape" && close()}>
            <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <KnownProfileCard controller={controller} viewerId={profileViewer(controller)} otherId={id} onClose={close} />
            </div>
        </div>
    );
}
