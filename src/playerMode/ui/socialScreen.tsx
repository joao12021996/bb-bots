import React from "react";
import { getById, Houseguest, nonEvictedHouseguests } from "../../model";
import { PlayerModeController } from "../playerModeController";
import { Approach, feelingLabel, SocialAction, SocialOutcome } from "../social/socialActions";
import { suggestAllianceName } from "../social/alliances";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";

interface SocialScreenProps {
    controller: PlayerModeController;
    blockName: string;
}

type Mode =
    | { kind: "pickBot" }
    | { kind: "pickAction"; botId: number }
    | { kind: "pickTarget"; botId: number }
    | { kind: "alliance"; botId: number };

function OutcomeList(props: { outcomes: SocialOutcome[] }) {
    if (props.outcomes.length === 0) return null;
    return (
        <div className="bbb-log">
            {props.outcomes.map((o, i) => (
                <p key={i} style={{ opacity: i === 0 ? 1 : 0.6 }}>
                    {o.good ? "👍" : "👎"} {o.text}
                </p>
            ))}
        </div>
    );
}

// Things that happened since this player's last social time (alliance news, betrayals, answers to invites).
export function NewsList(props: { news: string[] }) {
    if (props.news.length === 0) return null;
    return (
        <div className="bbb-card-box">
            <div className="bbb-card-title">📰 Since you last checked in</div>
            {props.news.map((line, i) => (
                <p key={i}>{line}</p>
            ))}
        </div>
    );
}

function ApproachCard(props: {
    approach: Approach;
    controller: PlayerModeController;
    onAnswer: (accept: boolean) => void;
}) {
    const { approach, controller } = props;
    const from = controller.player(approach.fromId);
    let text: React.ReactNode;
    let buttons: React.ReactNode = (
        <button type="button" className="button is-small is-light" onClick={() => props.onAnswer(true)}>
            OK
        </button>
    );
    if (approach.kind === "chat") {
        text = approach.text;
    } else if (approach.kind === "pitch") {
        const target = controller.player(approach.targetId);
        text = (
            <>
                <b>{from.name}</b> pulled you aside: "We need to get <b>{target.name}</b> out of here."
            </>
        );
        buttons = (
            <>
                <button type="button" className="button is-small is-success" onClick={() => props.onAnswer(true)}>
                    I'm in
                </button>
                <button type="button" className="button is-small is-light" onClick={() => props.onAnswer(false)}>
                    Not so sure
                </button>
            </>
        );
    } else {
        const existing = approach.allianceId !== undefined ? controller.book.alliances.find((a) => a.id === approach.allianceId) : undefined;
        const others = existing ? existing.memberIds.filter((m) => m !== from.id).map((m) => controller.player(m).name) : [];
        text = existing ? (
            <>
                <b>{from.name}</b> wants you to join <b>{approach.name}</b>
                {others.length > 0 && ` (with ${others.join(", ")})`}.
            </>
        ) : (
            <>
                <b>{from.name}</b> wants to start an alliance with you: <b>{approach.name}</b>.
            </>
        );
        buttons = (
            <>
                <button type="button" className="button is-small is-success" onClick={() => props.onAnswer(true)}>
                    🤝 Accept
                </button>
                <button type="button" className="button is-small is-light" onClick={() => props.onAnswer(false)}>
                    Decline
                </button>
            </>
        );
    }
    return (
        <div className="bbb-approach">
            <img src={from.imageURL} alt={from.name} />
            <div className="bbb-approach-text">{text}</div>
            <div className="bbb-approach-buttons">{buttons}</div>
        </div>
    );
}

// Social time: answer whoever came to talk to you, then spend a few actions talking to houseguests,
// forming alliances, and pitching targets.
export function SocialScreen(props: SocialScreenProps) {
    const { controller } = props;
    const [mode, setMode] = React.useState<Mode>({ kind: "pickBot" });
    const [outcomes, setOutcomes] = React.useState<SocialOutcome[]>([]);
    const [allianceName, setAllianceName] = React.useState("");
    const [news] = React.useState(() => controller.newsFor(controller.socialActor.id));
    const [, rerender] = React.useState(0);

    const gs = controller.gameState;
    const human = controller.socialActor;
    const allies = controller.allyIds(human.id);
    const myAlliances = controller.alliancesOf(human.id);
    const approaches = controller.approachesFor(human.id);
    const everyoneElse = nonEvictedHouseguests(gs).filter((hg) => hg.id !== human.id);
    const actionsLeft = controller.state.actionsLeft;
    const hohId = controller.state.week.hohId;
    const nomineeIds = controller.state.week.nomineeIds || [];

    const record = (outcome: SocialOutcome | null) => {
        if (outcome) setOutcomes((prev) => [outcome, ...prev]);
        rerender((n) => n + 1);
    };

    const act = (action: SocialAction) => {
        record(controller.socialAct(action));
        setMode({ kind: "pickBot" });
    };

    const caption = (hg: Houseguest) => {
        const tags = [
            allies.includes(hg.id) ? "🤝" : "",
            hg.id === hohId ? "👑" : "",
            nomineeIds.includes(hg.id) ? "🎯" : "",
        ].join("");
        if (controller.isHuman(hg)) return <span>🎮 Player {tags}</span>;
        const feeling = feelingLabel(human.relationships[hg.id]);
        return (
            <span title={feeling.label}>
                {feeling.emoji} {feeling.label} {tags}
            </span>
        );
    };

    let body: JSX.Element;
    if (mode.kind === "pickBot") {
        body = (
            <div>
                <Subtle>
                    {actionsLeft > 0
                        ? `Who do you want to talk to? (${actionsLeft} action${actionsLeft === 1 ? "" : "s"} left)`
                        : "You're out of time for now."}
                </Subtle>
                <Grid>
                    {everyoneElse.map((hg) => (
                        <Face
                            key={hg.id}
                            hg={hg}
                            caption={caption(hg)}
                            onClick={
                                actionsLeft > 0
                                    ? () => {
                                          if (controller.isHuman(hg)) {
                                              setAllianceName(suggestAllianceName(controller.book));
                                              setMode({ kind: "alliance", botId: hg.id });
                                          } else setMode({ kind: "pickAction", botId: hg.id });
                                      }
                                    : undefined
                            }
                        />
                    ))}
                </Grid>
            </div>
        );
    } else if (mode.kind === "pickAction") {
        const bot = getById(gs, mode.botId);
        body = (
            <div>
                <Face hg={bot} caption={caption(bot)} />
                <Subtle>What do you want to do with {bot.name}?</Subtle>
                <div>
                    <BigButton kind="info" onClick={() => act({ kind: "chat", botId: bot.id })}>
                        💬 Chat
                    </BigButton>
                    <BigButton
                        kind="success"
                        onClick={() => {
                            setAllianceName(suggestAllianceName(controller.book));
                            setMode({ kind: "alliance", botId: bot.id });
                        }}
                    >
                        🤝 Alliance
                    </BigButton>
                    <BigButton kind="warning" onClick={() => setMode({ kind: "pickTarget", botId: bot.id })}>
                        🗡️ Pitch a target
                    </BigButton>
                </div>
                <BigButton kind="light" onClick={() => setMode({ kind: "pickBot" })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "alliance") {
        const other = getById(gs, mode.botId);
        const joinable = myAlliances.filter((a) => !a.memberIds.includes(other.id));
        const isPlayer = controller.isHuman(other);
        body = (
            <div>
                <Face hg={other} caption={caption(other)} />
                <Subtle>
                    {isPlayer
                        ? `${other.name} is a player. They'll answer your invitation on their own social turn.`
                        : `Ask ${other.name} to start a new alliance with you${joinable.length > 0 ? ", or to join one of yours" : ""}.`}
                </Subtle>
                <form
                    className="bbb-inline-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        act({ kind: "alliance", botId: other.id, name: allianceName });
                    }}
                >
                    <input
                        className="input"
                        type="text"
                        maxLength={30}
                        placeholder="Alliance name"
                        value={allianceName}
                        onChange={(e) => setAllianceName(e.target.value)}
                    />
                    <button type="submit" className="button is-success">
                        🤝 Start it
                    </button>
                </form>
                {joinable.map((a) => (
                    <BigButton key={a.id} kind="info" onClick={() => act({ kind: "alliance", botId: other.id, allianceId: a.id })}>
                        ➕ Invite to {a.name}
                    </BigButton>
                ))}
                <div>
                    <BigButton
                        kind="light"
                        onClick={() => setMode(isPlayer ? { kind: "pickBot" } : { kind: "pickAction", botId: other.id })}
                    >
                        Back
                    </BigButton>
                </div>
            </div>
        );
    } else {
        const bot = getById(gs, mode.botId);
        body = (
            <div>
                <Subtle>Who do you want to turn {bot.name} against?</Subtle>
                <Grid>
                    {everyoneElse
                        .filter((hg) => hg.id !== bot.id)
                        .map((hg) => (
                            <Face
                                key={hg.id}
                                hg={hg}
                                small={true}
                                onClick={() => act({ kind: "pitch", botId: bot.id, targetId: hg.id })}
                            />
                        ))}
                </Grid>
                <BigButton kind="light" onClick={() => setMode({ kind: "pickAction", botId: bot.id })}>
                    Back
                </BigButton>
            </div>
        );
    }

    return (
        <Panel>
            <Title>🗣️ {props.blockName}</Title>
            {controller.multiplayer && <Subtle>{human.name}'s turn</Subtle>}
            <Subtle>
                Social time, then alliance time. Bots who like you are less likely to nominate you or vote you out, and more
                likely to vote for you to win.
            </Subtle>
            <NewsList news={news} />
            {approaches.length > 0 && (
                <div className="bbb-card-box">
                    <div className="bbb-card-title">💬 Houseguests came to talk to you</div>
                    {approaches.map((a, i) => (
                        <ApproachCard
                            key={`${a.kind}-${a.fromId}-${i}`}
                            approach={a}
                            controller={controller}
                            onAnswer={(accept) => record(controller.respondApproach(i, accept))}
                        />
                    ))}
                </div>
            )}
            {body}
            <OutcomeList outcomes={outcomes} />
            <BigButton kind={actionsLeft > 0 ? "light" : "primary"} onClick={controller.endSocial}>
                {myAlliances.length === 0
                    ? actionsLeft > 0
                        ? "Skip the rest"
                        : "Continue"
                    : actionsLeft > 0
                    ? "Skip to alliance time"
                    : "Continue to alliance time"}
            </BigButton>
        </Panel>
    );
}
