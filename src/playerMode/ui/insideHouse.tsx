import React from "react";
import { nonEvictedHouseguests } from "../../model";
import { listNames } from "../../utils/listStrings";
import { PlayerModeController } from "../playerModeController";
import { PERSONALITIES } from "../social/personality";
import { POWERS } from "../social/powers";
import { feelingLabel } from "../social/socialActions";

// Watching the bots: everything that's secret in the house, out in the open. Alliances and who they're after,
// showmances, secret powers and who holds them, and how every houseguest is playing.
export function InsideHouse(props: { controller: PlayerModeController }) {
    const { controller } = props;
    const gs = controller.gameState;
    const alive = nonEvictedHouseguests(gs);
    const name = (id: number) => controller.player(id).name;
    const isIn = (id: number) => alive.some((hg) => hg.id === id);

    const alliances = controller.book.alliances
        .map((a) => ({ a, members: a.memberIds.filter(isIn) }))
        .filter((x) => x.members.length >= 2);
    const showmances = controller.showmances.filter((sm) => isIn(sm.a) && isIn(sm.b));
    const powers = controller.powers.slots.filter((sl) => sl.holderId !== undefined && !sl.used && isIn(sl.holderId));
    const personalities = controller.personalities;

    return (
        <div className="bbb-inside">
            <section>
                <h4>🤝 Alliances</h4>
                {alliances.length === 0 ? (
                    <p className="bbb-subtle">No alliances yet.</p>
                ) : (
                    alliances.map(({ a, members }) => (
                        <p key={a.id}>
                            <b>{a.name}</b>: {listNames(members.map(name))}
                            {a.target !== undefined && isIn(a.target) && (
                                <>
                                    {" "}
                                    · 🎯 after <b>{name(a.target)}</b>
                                    {a.backup !== undefined && isIn(a.backup) && <> (plan B: {name(a.backup)})</>}
                                </>
                            )}
                        </p>
                    ))
                )}
            </section>
            {showmances.length > 0 && (
                <section>
                    <h4>💕 Showmances</h4>
                    {showmances.map((sm) => (
                        <p key={`${sm.a}-${sm.b}`}>
                            {name(sm.a)} & {name(sm.b)}
                        </p>
                    ))}
                </section>
            )}
            {powers.length > 0 && (
                <section>
                    <h4>🤫 Secret powers</h4>
                    {powers.map((sl) => (
                        <p key={`${sl.id}-${sl.week}`}>
                            {POWERS[sl.id].emoji} <b>{POWERS[sl.id].name}</b>: held by {name(sl.holderId!)}
                        </p>
                    ))}
                </section>
            )}
            <section>
                <h4>🧠 How they're playing</h4>
                <div className="bbb-inside-grid">
                    {alive.map((hg) => {
                        const others = alive.filter((o) => o.id !== hg.id);
                        const sorted = [...others].sort((x, y) => (hg.relationships[y.id] ?? 0) - (hg.relationships[x.id] ?? 0));
                        const friend = sorted[0];
                        const enemy = sorted[sorted.length - 1];
                        const target = hg.hitList.find((e) => isIn(e.id) && e.id !== hg.id);
                        const p = personalities[hg.id] ? PERSONALITIES[personalities[hg.id]] : null;
                        return (
                            <div key={hg.id} className="bbb-inside-hg">
                                <img src={hg.imageURL} alt="" />
                                <div>
                                    <b>{hg.name}</b>
                                    {p && (
                                        <small className="bbb-subtle">
                                            {" "}
                                            {p.emoji} {p.label}
                                        </small>
                                    )}
                                    <br />
                                    {friend && (
                                        <small>
                                            {feelingLabel(hg.relationships[friend.id] ?? 0).emoji} closest to {friend.name}
                                        </small>
                                    )}
                                    {enemy && enemy !== friend && (
                                        <small>
                                            {" "}
                                            · {feelingLabel(hg.relationships[enemy.id] ?? 0).emoji} coldest to {enemy.name}
                                        </small>
                                    )}
                                    {target && (
                                        <small>
                                            {" "}
                                            · 🎯 wants {name(target.id)} out
                                        </small>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
