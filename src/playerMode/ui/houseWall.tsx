import React from "react";
import { PlayerModeController } from "../playerModeController";
import { DAY_PART, dayLabel } from "../days";
import { knownProfile$ } from "../../subjects/subjects";

// The memory wall: every houseguest's face, in the same spot all season. Faces go grey when they're evicted,
// the HoH wears the crown, the veto holder the necklace, and the nominees hold keys.
export function HouseWall(props: { controller: PlayerModeController }) {
    const { controller } = props;
    const gs = controller.gameState;
    const week = controller.state.week;
    // a secret Head of House wears no crown (except on their own screen, in single player)
    const viewer = controller.state.humanIds.length === 1 ? controller.state.humanIds[0] : undefined;
    const hohId = week.finalHoh !== undefined ? week.finalHoh : controller.publicHohId(viewer);
    const nominees = week.nomineeIds || [];
    const evictedOn = (id: number) => {
        const w = controller.state.history.find((h) => h.evictedIds.includes(id));
        return w ? dayLabel(gs, w.week, DAY_PART.eviction) : "";
    };
    return (
        <div className="bbb-mwall" aria-label="House wall">
            {gs.houseguests.map((hg) => {
                const out = hg.isEvicted;
                const badges: { cls: string; icon: string; label: string }[] = [];
                if (!out && hg.id === hohId) badges.push({ cls: "is-crown", icon: "👑", label: "Head of House" });
                if (!out && hg.id === week.povId) badges.push({ cls: "is-necklace", icon: "🏅", label: "Veto" });
                if (!out && nominees.includes(hg.id)) badges.push({ cls: "is-key", icon: "🔑", label: "Nominated" });
                return (
                    <div
                        key={hg.id}
                        className={`bbb-mwall-tile ${out ? "is-out" : ""} ${out && hg.isJury ? "is-jury" : ""} ${controller.isHuman(hg) ? "is-player" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => knownProfile$.next(hg.id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && knownProfile$.next(hg.id)}
                        title={[hg.name, ...badges.map((b) => b.label), out ? `Evicted ${evictedOn(hg.id)}` : ""].filter(Boolean).join(" · ")}
                    >
                        <div className="bbb-mwall-photo">
                            <img src={hg.imageURL} alt={hg.name} />
                            {badges.map((b) => (
                                <span key={b.cls} className={`bbb-mwall-badge ${b.cls}`}>
                                    {b.icon}
                                </span>
                            ))}
                        </div>
                        <div className="bbb-mwall-name">{hg.name}</div>
                        {out && <div className="bbb-mwall-sub">{hg.isJury ? "⚖️ Jury" : evictedOn(hg.id) || "Evicted"}</div>}
                    </div>
                );
            })}
        </div>
    );
}
