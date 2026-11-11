import React from "react";
import { nonEvictedHouseguests } from "../../model";
import { PlayerModeController } from "../playerModeController";
import { Alliance, aliveMembers, botBackup, botSuggestion, chemistryLabel, meetingSplit, positionsOf } from "../social/alliances";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";

interface AllianceScreenProps {
    controller: PlayerModeController;
    blockName: string;
}

type Tab = "target" | "backstab";

// The alliance didn't agree: talk it out. Argue for a target (maybe win people over), or go along with it.
function TalkItOut(props: { controller: PlayerModeController; alliance: Alliance; onDone: (lines: string[]) => void }) {
    const { controller, alliance: a } = props;
    const gs = controller.gameState;
    const me = controller.socialActor;
    const sides = positionsOf(gs, a);
    const name = (id: number) => (id === me.id ? "you" : controller.player(id).name);
    return (
        <div className="bbb-talk">
            <div className="bbb-card-title">💬 Not everyone agrees. Talk it out?</div>
            {sides.map((side) => (
                <p key={side.targetId}>
                    🎯 <b>{controller.player(side.targetId).name}</b>
                    {side.targetId === a.target ? " (the pick)" : ""}: {side.memberIds.map(name).join(", ")}
                </p>
            ))}
            <Subtle>Argue your case: allies who like you (and a high Social) are easier to win over. Push too hard and it grates.</Subtle>
            <div>
                {sides
                    .filter((side) => side.targetId !== me.id)
                    .map((side) => (
                        <button
                            key={side.targetId}
                            type="button"
                            className="button is-warning is-small"
                            style={{ margin: 4 }}
                            onClick={() => props.onDone(controller.allianceDiscuss(a.id, { kind: "argue", targetId: side.targetId }))}
                        >
                            Argue for {controller.player(side.targetId).name}
                        </button>
                    ))}
                {a.target !== undefined && a.target !== me.id && (
                    <button
                        type="button"
                        className="button is-light is-small"
                        style={{ margin: 4 }}
                        onClick={() => props.onDone(controller.allianceDiscuss(a.id, { kind: "concede" }))}
                    >
                        Go along with {controller.player(a.target).name}
                    </button>
                )}
            </div>
        </div>
    );
}

function AllianceCard(props: { controller: PlayerModeController; alliance: Alliance; onChange: () => void }) {
    const { controller, alliance: a } = props;
    const gs = controller.gameState;
    const me = controller.socialActor;
    const [result, setResult] = React.useState<string[] | null>(null);
    const [picked, setPicked] = React.useState<number | null>(null);
    const [backup, setBackup] = React.useState<number | null>(null); // plan B
    const [renaming, setRenaming] = React.useState(false);
    const [name, setName] = React.useState(a.name);
    const [panel, setPanel] = React.useState<Tab>("target");
    const [leakTo, setLeakTo] = React.useState<number | null>(null);
    const [gone, setGone] = React.useState(false);

    const members = aliveMembers(gs, a);
    const outsiders = nonEvictedHouseguests(gs).filter((hg) => !a.memberIds.includes(hg.id));
    // after the veto, the target has to be on the block, even if that's one of your own
    const block = controller.targetBlock();
    const exclude = controller.targetExclude(); // the new HoH can't be nominated
    const targetOptions = block
        ? block.filter((id) => id !== me.id).map((id) => controller.player(id))
        : outsiders.filter((hg) => !exclude.includes(hg.id));
    const chem = chemistryLabel(a.chemistry);
    const myPick = a.suggestions[me.id];

    const opinions = members
        .filter((m) => m.id !== me.id)
        .map((m) => {
            const pick = controller.isHuman(m) ? a.suggestions[m.id] : botSuggestion(gs, a, m.id, block, exclude);
            const plan = !controller.planBWeek
                ? null
                : controller.isHuman(m)
                ? (a.backupSuggestions || {})[m.id]
                : pick === null
                ? null
                : botBackup(gs, a, m.id, pick, block, exclude);
            return { m, pick: pick === undefined ? undefined : pick, plan };
        });

    if (gone) {
        return (
            <div className="bbb-card-box">
                <div className="bbb-card-title">{a.name}</div>
                {result && result.map((line, i) => <p key={i}>{line}</p>)}
            </div>
        );
    }

    return (
        <div className="bbb-card-box">
            <div className="bbb-alliance-head">
                {renaming ? (
                    <form
                        className="bbb-inline-form"
                        onSubmit={(e) => {
                            e.preventDefault();
                            controller.renameAlliance(a.id, name);
                            setName(a.name);
                            setRenaming(false);
                        }}
                    >
                        <input className="input" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
                        <button type="submit" className="button is-success">
                            Save
                        </button>
                    </form>
                ) : (
                    <div className="bbb-card-title">
                        🤝 {a.name}{" "}
                        <button type="button" className="button is-small is-light" title="Rename" onClick={() => setRenaming(true)}>
                            ✏️
                        </button>
                    </div>
                )}
                <div className="bbb-chemistry" title={`Chemistry: ${chem.label}`}>
                    <span>
                        {chem.emoji} {chem.label}
                    </span>
                    <div className="bbb-chemistry-bar">
                        <div style={{ width: `${Math.round(a.chemistry * 100)}%` }} />
                    </div>
                </div>
            </div>
            {a.target !== undefined && a.targetWeek === gs.phase && !controller.player(a.target).isEvicted && (
                <Subtle>
                    🎯 Current target: <b>{controller.player(a.target).name}</b>
                    {a.backup !== undefined && !controller.player(a.backup).isEvicted && (
                        <>
                            {" "}
                            · 🔁 Plan B: <b>{controller.player(a.backup).name}</b>
                        </>
                    )}
                </Subtle>
            )}
            <Grid>
                {members.map((m) => (
                    <Face key={m.id} hg={m} small={true} caption={m.id === me.id ? "(you)" : controller.isHuman(m) ? "🎮" : undefined} />
                ))}
            </Grid>
            <div className="bbb-tabs">
                <button type="button" className={`button is-small ${panel === "target" ? "is-primary" : "is-light"}`} onClick={() => setPanel("target")}>
                    🎯 Pick a target
                </button>
                <button type="button" className={`button is-small ${panel === "backstab" ? "is-danger" : "is-light"}`} onClick={() => setPanel("backstab")}>
                    🐍 Backstab
                </button>
            </div>
            {panel === "target" &&
                (result ? (
                    <div className="bbb-log">
                        {result.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                        {meetingSplit(gs, a) && a.memberIds.includes(me.id) && (
                            <TalkItOut
                                controller={controller}
                                alliance={a}
                                onDone={(lines) => {
                                    setResult([...result, ...lines]);
                                    props.onChange();
                                }}
                            />
                        )}
                    </div>
                ) : a.met ? (
                    <Subtle>{a.name} already met this round.</Subtle>
                ) : myPick !== undefined ? (
                    <Subtle>You've made your pick. Waiting on the others.</Subtle>
                ) : (
                    <div>
                        <div className="bbb-opinions">
                            {opinions.map(({ m, pick, plan }) => (
                                <div key={m.id}>
                                    <b>{m.name}</b>{" "}
                                    {pick === undefined
                                        ? "hasn't weighed in yet."
                                        : pick === null
                                        ? "has no one in mind."
                                        : `wants to go after ${controller.player(pick).name}${
                                              plan !== null && plan !== undefined ? `, with ${controller.player(plan).name} as plan B` : ""
                                          }.`}
                                </div>
                            ))}
                        </div>
                        <Subtle>
                            {block
                                ? `The veto ceremony is over: ${a.name}'s target has to be someone on the block${
                                      block.some((id) => a.memberIds.includes(id) && id !== me.id) ? ", even if that means one of your own" : ""
                                  }.`
                                : `Who should ${a.name} go after?`}{" "}
                            Persuasive (high Social) members have more sway.
                        </Subtle>
                        <Grid>
                            {targetOptions.map((hg) => (
                                <Face
                                    key={hg.id}
                                    hg={hg}
                                    small={true}
                                    selected={picked === hg.id}
                                    onClick={() => {
                                        setPicked(hg.id);
                                        if (backup === hg.id) setBackup(null);
                                    }}
                                />
                            ))}
                        </Grid>
                        {picked !== null && controller.planBWeek && targetOptions.length > 1 && (
                            <>
                                <Subtle>
                                    🔁 Plan B (optional): who {a.name} goes after if {controller.player(picked).name}{" "}
                                    {block ? "wins the Last Chance comp" : "comes off the block (a used veto, a Last Chance comp)"}.
                                </Subtle>
                                <Grid>
                                    {targetOptions
                                        .filter((hg) => hg.id !== picked)
                                        .map((hg) => (
                                            <Face
                                                key={hg.id}
                                                hg={hg}
                                                small={true}
                                                selected={backup === hg.id}
                                                onClick={() => setBackup(backup === hg.id ? null : hg.id)}
                                            />
                                        ))}
                                </Grid>
                            </>
                        )}
                        <button
                            type="button"
                            className="button is-warning"
                            disabled={picked === null}
                            onClick={() => {
                                setResult(controller.allianceSuggest(a.id, picked, backup));
                                props.onChange();
                            }}
                        >
                            🎯 Suggest {picked !== null ? controller.player(picked).name : "a target"}
                            {picked !== null && backup !== null ? ` (plan B: ${controller.player(backup).name})` : ""}
                        </button>{" "}
                        <button
                            type="button"
                            className="button is-light"
                            onClick={() => {
                                setResult(controller.allianceSuggest(a.id, null));
                                props.onChange();
                            }}
                        >
                            No suggestion
                        </button>
                    </div>
                ))}
            {panel === "backstab" && (
                <div>
                    <Subtle>
                        Leak {a.name}'s plans to someone outside it. They'll trust you more and turn on the rest of the
                        alliance, but if you get caught, you're out. Higher Social makes you harder to catch.
                    </Subtle>
                    <Grid>
                        {outsiders.map((hg) => (
                            <Face key={hg.id} hg={hg} small={true} selected={leakTo === hg.id} onClick={() => setLeakTo(hg.id)} />
                        ))}
                    </Grid>
                    <button
                        type="button"
                        className="button is-danger"
                        disabled={leakTo === null}
                        onClick={() => {
                            const out = controller.leak(a.id, leakTo!);
                            setResult(out.map((o) => `${o.good ? "👍" : "👎"} ${o.text}`));
                            setPanel("target");
                            if (!a.memberIds.includes(me.id)) setGone(true);
                            props.onChange();
                        }}
                    >
                        🐍 Leak to {leakTo !== null ? controller.player(leakTo).name : "…"}
                    </button>{" "}
                    <button
                        type="button"
                        className="button is-light"
                        onClick={() => {
                            const out = controller.leave(a.id);
                            if (out) setResult([out.text]);
                            setGone(true);
                            props.onChange();
                        }}
                    >
                        🚪 Leave {a.name}
                    </button>
                </div>
            )}
        </div>
    );
}

// Alliance time: each of the player's alliances meets to pick a target. Players can also backstab.
export function AllianceScreen(props: AllianceScreenProps) {
    const { controller } = props;
    const me = controller.socialActor;
    // keep showing alliances the player leaves or gets kicked out of during this screen
    const [alliances] = React.useState(() => controller.alliancesOf(me.id));
    const [, rerender] = React.useState(0);
    return (
        <Panel>
            <Title>🤝 Alliance time</Title>
            <Subtle>{props.blockName}</Subtle>
            {controller.multiplayer && <Subtle>{me.name}'s turn</Subtle>}
            <Subtle>
                Your alliances meet to agree on a target. Allies protect each other, so a strong alliance keeps you safe. When
                an alliance can't agree, its chemistry drops.
            </Subtle>
            {alliances.map((a) => (
                <AllianceCard key={a.id} controller={controller} alliance={a} onChange={() => rerender((n) => n + 1)} />
            ))}
            <BigButton kind="primary" onClick={controller.endAlliance}>
                Done
            </BigButton>
        </Panel>
    );
}
