import React from "react";
import { getById, Houseguest, nonEvictedHouseguests } from "../../model";
import { PlayerModeController } from "../playerModeController";
import { feelingLabel, SocialAction, SocialOutcome } from "../social/socialActions";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";

interface SocialScreenProps {
    controller: PlayerModeController;
    blockName: string;
}

type Mode = { kind: "pickBot" } | { kind: "pickAction"; botId: number } | { kind: "pickTarget"; botId: number };

// Social time: spend a few actions talking to houseguests, forming alliances, and pitching targets.
export function SocialScreen(props: SocialScreenProps) {
    const { controller } = props;
    const [mode, setMode] = React.useState<Mode>({ kind: "pickBot" });
    const [outcomes, setOutcomes] = React.useState<SocialOutcome[]>([]);
    const [, rerender] = React.useState(0);

    const gs = controller.gameState;
    const human = controller.socialActor;
    const allies = controller.socialMemory(human.id).allies;
    // you can talk to bots; other players are only pitch targets (talk to them for real!)
    const everyoneElse = nonEvictedHouseguests(gs).filter((hg) => hg.id !== human.id);
    const bots = everyoneElse.filter((hg) => !controller.isHuman(hg));
    const actionsLeft = controller.state.actionsLeft;
    const hohId = controller.state.week.hohId;
    const nomineeIds = controller.state.week.nomineeIds || [];

    const act = (action: SocialAction) => {
        const outcome = controller.socialAct(action);
        if (outcome) setOutcomes([outcome, ...outcomes]);
        setMode({ kind: "pickBot" });
        rerender((n) => n + 1);
    };

    const caption = (hg: Houseguest) => {
        const feeling = feelingLabel(human.relationships[hg.id]);
        const tags = [
            allies.includes(hg.id) ? "🤝" : "",
            hg.id === hohId ? "👑" : "",
            nomineeIds.includes(hg.id) ? "🎯" : "",
        ].join("");
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
                    {bots.map((hg) => (
                        <Face
                            key={hg.id}
                            hg={hg}
                            caption={caption(hg)}
                            onClick={actionsLeft > 0 ? () => setMode({ kind: "pickAction", botId: hg.id }) : undefined}
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
                        disabled={allies.includes(bot.id)}
                        onClick={() => act({ kind: "alliance", botId: bot.id })}
                    >
                        🤝 Propose alliance
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
                Build relationships and alliances. Bots who like you are less likely to nominate you or vote you out,
                and more likely to vote for you to win.
            </Subtle>
            {body}
            {outcomes.length > 0 && (
                <div style={{ margin: "12px auto", maxWidth: 520, textAlign: "left" }}>
                    {outcomes.map((o, i) => (
                        <p key={i} style={{ opacity: i === 0 ? 1 : 0.6 }}>
                            {o.good ? "👍" : "👎"} {o.text}
                        </p>
                    ))}
                </div>
            )}
            <BigButton kind={actionsLeft > 0 ? "light" : "primary"} onClick={controller.endSocial}>
                {actionsLeft > 0 ? "Skip the rest" : "Continue"}
            </BigButton>
        </Panel>
    );
}
