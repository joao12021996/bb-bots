import React from "react";
import { getById, Houseguest, nonEvictedHouseguests } from "../../model";
import { PlayerModeController, Step } from "../playerModeController";
import { hasFinal2 } from "../social/promises";
import { AllianceCount, JuryWatch, Overheard, PowerCard, PromiseList, ThreatMeter, VoteCount } from "./dealsPanel";
import { Approach, SocialAction, SocialOutcome } from "../social/socialActions";
import { suggestAllianceName } from "../social/alliances";
import { reasonLine } from "../social/pitch";
import { BigButton, Face, Grid, Panel, Subtle, Title, whenDone } from "./common";
import { HOH } from "../terms";
import { BotTalkPanel } from "./botTalkPanel";
import { sessionFor } from "../net/netSession";
import { blockStart, PlayerChatPanel, TextsBanner, unanswered, useSubject, useUnreadFrom } from "./playerChat";

const NO_CHAT = { value: [] as never[], subscribe: () => ({ unsubscribe: () => undefined }) };
const NO_SESSION: any = { chat$: NO_CHAT, code: "" };

interface SocialScreenProps {
    controller: PlayerModeController;
    blockName: string;
}

type Mode =
    | { kind: "pickBot" }
    | { kind: "talk"; botId: number } // a bot: everything you do with them is in the conversation (see BotTalkPanel)
    | { kind: "player"; id: number } // online: texting another player
    | { kind: "alliance"; botId: number }; // inviting another player

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
    onSides: (side: "a" | "b" | null) => void;
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
                <b>{from.name}</b> pulled you aside: "{controller.say(from.id, "pitch", `pitch:${target.id}`)} We need to get{" "}
                <b>{target.name}</b> out of here.
                {approach.reason ? ` ${reasonLine(approach.reason, target.name)}` : ""}"
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
    } else if (approach.kind === "sides") {
        const other = controller.player(approach.otherId);
        text = (
            <>
                💥 <b>{from.name}</b> and <b>{other.name}</b> blew up at each other, and the whole house is picking sides. Whose side are you on?
            </>
        );
        buttons = (
            <>
                <button type="button" className="button is-small is-warning" onClick={() => props.onSides("a")}>
                    {from.name}
                </button>
                <button type="button" className="button is-small is-warning" onClick={() => props.onSides("b")}>
                    {other.name}
                </button>
                <button type="button" className="button is-small is-light" onClick={() => props.onSides(null)}>
                    Stay out of it
                </button>
            </>
        );
    } else if (approach.kind === "final2") {
        text = (
            <>
                <b>{from.name}</b> pulled you aside: "{controller.say(from.id, "final2", "approach")}"
            </>
        );
        buttons = (
            <>
                <button type="button" className="button is-small is-success" onClick={() => props.onAnswer(true)}>
                    🏁 Deal
                </button>
                <button type="button" className="button is-small is-light" onClick={() => props.onAnswer(false)}>
                    Not yet
                </button>
            </>
        );
    } else if (approach.kind === "votePlea") {
        text = (
            <>
                <b>{from.name}</b> is on the block: "{controller.say(from.id, "votePlea", "approach")} If I win HoH, you're safe.
                Can I count on your vote?"
            </>
        );
        buttons = (
            <>
                <button type="button" className="button is-small is-success" onClick={() => props.onAnswer(true)}>
                    🗳️ You have my vote
                </button>
                <button type="button" className="button is-small is-light" onClick={() => props.onAnswer(false)}>
                    Can't promise
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

// What the player has picked up about someone, in words. Never the real numbers.
function readLine(
    name: string,
    read: { label: string; day: number } | null,
    trust: { label: string; day: number } | null
): string {
    const feel = read
        ? `Last time you two talked (Day ${read.day}), ${name} seemed ${read.label.toLowerCase()} toward you.`
        : `You don't have a read on ${name} yet. Talk to them.`;
    const belief = trust
        ? ` As of Day ${trust.day}, ${name} ${trust.label}.`
        : ` You don't know yet how much ${name} believes what you say.`;
    return feel + belief;
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
    const [confirming, setConfirming] = React.useState<number[] | null>(null);
    // online: everyone's social time is at once, and players text each other from here
    const session = controller.socialTogether ? sessionFor(controller) : null;
    const me = controller.socialActor.id;
    const chat = useSubject(session ? session.chat$ : NO_CHAT);
    const unreadFrom = useUnreadFrom(session || NO_SESSION, me);
    const since = React.useMemo(() => (session ? blockStart(session, controller) : 0), [session, controller]);
    // online: other players' moves land while you're here (an invitation, an alliance forming...)
    React.useEffect(() => {
        if (!session) return;
        const sub = controller.changed$.subscribe(() => rerender((n) => n + 1));
        return () => sub.unsubscribe();
    }, [session, controller]);

    const gs = controller.gameState;
    const human = controller.socialActor;
    const allies = controller.allyIds(human.id);
    const myAlliances = controller.alliancesOf(human.id);
    const approaches = controller.approachesFor(human.id);
    // bots who came to talk: what they want is in the conversation with them. Players' invitations: answered here.
    const fromPlayers = approaches.filter((a) => controller.isHuman({ id: a.fromId }));
    const approachers = approaches.map((a) => a.fromId).filter((id, i, all) => all.indexOf(id) === i && !controller.isHuman({ id }));
    const everyoneElse = nonEvictedHouseguests(gs).filter((hg) => hg.id !== human.id);
    const actionsLeft = controller.actionsOf(human.id);
    const hohId = controller.publicHohId(human.id); // a secret HoH stays secret
    const nomineeIds = controller.state.week.nomineeIds || [];

    const record = (outcome: SocialOutcome | null) => {
        if (outcome) setOutcomes((prev) => [outcome, ...prev]);
        rerender((n) => n + 1);
    };

    const act = (action: SocialAction) => {
        whenDone(controller.socialAct(action), record);
        setMode({ kind: "pickBot" });
    };

    const caption = (hg: Houseguest) => {
        const tags = [
            allies.includes(hg.id) ? "🤝" : "",
            hasFinal2(controller.ledger, human.id, hg.id) ? "🏁" : "",
            controller.showmancePartner(hg.id) !== undefined ? "💕" : "",
            hg.id === hohId ? "👑" : "",
            nomineeIds.includes(hg.id) ? "🎯" : "",
        ].join("");
        if (controller.isHuman(hg)) return <span>{unreadFrom.includes(hg.id) ? "📩 Texted you" : "🎮 Player"} {tags}</span>;
        // your last read on them (how they acted, which isn't necessarily how they feel), if you have one
        const read = controller.readOf(human.id, hg.id);
        return (
            <span title={read ? `Your read on them, as of Day ${read.day}` : "You don't have a read on them yet"}>
                {read ? `${read.emoji} ${read.label}${read.old ? " (old)" : ""}` : "❓ No read"} {tags}
            </span>
        );
    };

    let body: JSX.Element;
    if (mode.kind === "pickBot") {
        body = (
            <div>
                {controller.isHaveNot(human.id) && (
                    <Subtle>🥫 You're a Have-Not this week (bottom of the {HOH} comp): slop, cold showers, and only one social action per block.</Subtle>
                )}
                <Subtle>
                    {actionsLeft > 0
                        ? `Who do you want to talk to? Talking to someone uses 1 action, then talk for as long as they'll listen. (${actionsLeft} action${
                              actionsLeft === 1 ? "" : "s"
                          } left)`
                        : "You're out of actions. You can still answer whoever came to talk to you, and finish conversations you've started."}
                </Subtle>
                <Grid>
                    {everyoneElse.map((hg) => (
                        <Face
                            key={hg.id}
                            hg={hg}
                            caption={caption(hg)}
                            onClick={
                                !controller.isHuman(hg)
                                    ? actionsLeft > 0 || controller.talkStarted(human.id, hg.id) || approachers.includes(hg.id)
                                        ? () => setMode({ kind: "talk", botId: hg.id })
                                        : undefined // out of actions: no new conversations
                                    : session
                                    ? () => setMode({ kind: "player", id: hg.id }) // online: text them (and invite them from there)
                                    : actionsLeft > 0
                                    ? () => {
                                          setAllianceName(suggestAllianceName(controller.book));
                                          setMode({ kind: "alliance", botId: hg.id });
                                      }
                                    : undefined
                            }
                        />
                    ))}
                </Grid>
                {actionsLeft > 0 && (
                    <BigButton kind="light" onClick={() => act({ kind: "snoop" })}>
                        👂 Snoop around the house
                    </BigButton>
                )}
            </div>
        );
    } else if (mode.kind === "talk") {
        const bot = getById(gs, mode.botId);
        const partner = controller.showmancePartner(bot.id);
        body = (
            <div>
                <Face hg={bot} caption={caption(bot)} small={true} />
                <Subtle>
                    {readLine(bot.name, controller.readOf(human.id, bot.id), controller.trustReadOf(human.id, bot.id))}
                    {partner !== undefined && ` ${bot.name} is in a showmance with ${partner === human.id ? "you" : controller.player(partner).name}.`}
                </Subtle>
                <Subtle>
                    {controller.talkStarted(human.id, bot.id)
                        ? `You're talking: say all you want, while ${bot.name} will listen. ${actionsLeft} action${actionsLeft === 1 ? "" : "s"} left.`
                        : actionsLeft > 0
                        ? `Talking to ${bot.name} uses 1 action (${actionsLeft} left).`
                        : "You're out of actions."}
                </Subtle>
                <BotTalkPanel key={bot.id} controller={controller} botId={bot.id} onOutcome={record} />
                <BigButton kind="light" onClick={() => setMode({ kind: "pickBot" })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "player") {
        const other = getById(gs, mode.id);
        body = !session ? (
            <div />
        ) : (
            <div>
                <Face hg={other} caption={caption(other)} small={true} />
                <PlayerChatPanel session={session} controller={controller} me={me} otherId={other.id} />
                {actionsLeft > 0 && (
                    <BigButton
                        kind="success"
                        onClick={() => {
                            setAllianceName(suggestAllianceName(controller.book));
                            setMode({ kind: "alliance", botId: other.id });
                        }}
                    >
                        🤝 Invite to an alliance
                    </BigButton>
                )}
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
                        ? `${other.name} is a player. They'll answer your invitation ${session ? "on their screen" : "on their own social turn"}.`
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
                        onClick={() => setMode(isPlayer && session ? { kind: "player", id: other.id } : isPlayer ? { kind: "pickBot" } : { kind: "talk", botId: other.id })}
                    >
                        Back
                    </BigButton>
                </div>
            </div>
        );
    } else {
        body = <div />;
    }

    return (
        <Panel>
            <Title>🗣️ {props.blockName}</Title>
            {controller.multiplayer && !session && <Subtle>{human.name}'s turn</Subtle>}
            {session && mode.kind !== "player" && <TextsBanner session={session} me={me} onOpen={(id) => setMode({ kind: "player", id })} />}
            <Subtle>
                {controller.state.step === Step.SocialMorning ? "Social time (alliances meet once the Head of House is known)." : "Social time, then alliance time."} Bots who like you are less likely to nominate you or vote you out, and more
                likely to vote for you to win.
            </Subtle>
            <NewsList news={news} />
            <PowerCard controller={controller} actorId={human.id} />
            {controller.state.step === Step.SocialCampaign && <VoteCount controller={controller} actorId={human.id} />}
            <PromiseList controller={controller} actorId={human.id} />
            <ThreatMeter controller={controller} actorId={human.id} />
            <AllianceCount controller={controller} actorId={human.id} />
            <Overheard controller={controller} actorId={human.id} />
            <JuryWatch controller={controller} actorId={human.id} />
            {(fromPlayers.length > 0 || approachers.some((id) => !(mode.kind === "talk" && mode.botId === id))) && (
                <div className="bbb-card-box">
                    <div className="bbb-card-title">💬 Houseguests came to talk to you</div>
                    {approaches.map((a, i) =>
                        controller.isHuman({ id: a.fromId }) ? (
                            <ApproachCard
                                key={`${a.kind}-${a.fromId}-${i}`}
                                approach={a}
                                controller={controller}
                                onAnswer={(accept) => whenDone(controller.respondApproach(i, accept), record)}
                                onSides={(side) => whenDone(controller.respondSides(i, side), record)}
                            />
                        ) : null
                    )}
                    {approachers
                        .filter((id) => !(mode.kind === "talk" && mode.botId === id))
                        .map((id) => (
                            <div key={id} className="bbb-approach">
                                <img src={controller.player(id).imageURL} alt={controller.player(id).name} />
                                <div className="bbb-approach-text">
                                    <b>{controller.player(id).name}</b> wants to talk to you.
                                </div>
                                <div className="bbb-approach-buttons">
                                    <button type="button" className="button is-small is-warning" onClick={() => setMode({ kind: "talk", botId: id })}>
                                        💬 Talk to {controller.player(id).name}
                                    </button>
                                </div>
                            </div>
                        ))}
                </div>
            )}
            {body}
            <OutcomeList outcomes={outcomes} />
            {confirming && (
                <div className="bbb-confirm" role="alertdialog" aria-label="Move on without a reply?">
                    <p>
                        📩 You texted {confirming.map((id) => controller.player(id).name).join(" and ")} and{" "}
                        {confirming.length === 1 ? "they haven't" : "they haven't"} replied yet. Move on anyway?
                    </p>
                    <BigButton kind="primary" onClick={controller.endSocial}>
                        Move on
                    </BigButton>
                    <BigButton kind="light" onClick={() => setConfirming(null)}>
                        Wait for a reply
                    </BigButton>
                </div>
            )}
            <BigButton
                kind={actionsLeft > 0 ? "light" : "primary"}
                onClick={() => {
                    // online: texts you sent this block that nobody's answered yet: check first
                    const waiting = session ? unanswered(chat, me, since).filter((id) => controller.isHuman({ id }) && !controller.player(id).isEvicted) : [];
                    if (waiting.length > 0 && !confirming) setConfirming(waiting);
                    else controller.endSocial();
                }}
            >
                {controller.meetingAlliancesOf(human.id).length === 0
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
