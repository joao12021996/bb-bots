import React from "react";
import { getById, Houseguest, nonEvictedHouseguests } from "../../model";
import { PlayerModeController, Step } from "../playerModeController";
import { hasFinal2 } from "../social/promises";
import { AllianceCount, JuryWatch, Overheard, PowerCard, PromiseList, ThreatMeter, VoteCount } from "./dealsPanel";
import { RUMOURS } from "../social/drama";
import { Approach, SocialAction, SocialOutcome } from "../social/socialActions";
import { suggestAllianceName } from "../social/alliances";
import { PITCH_REASONS, reasonLine } from "../social/pitch";
import { BigButton, Face, Grid, Panel, Subtle, Title, whenDone } from "./common";
import { HOH } from "../terms";
import { BotTalkPanel } from "./botTalkPanel";

interface SocialScreenProps {
    controller: PlayerModeController;
    blockName: string;
}

type Mode =
    | { kind: "pickBot" }
    | { kind: "pickAction"; botId: number }
    | { kind: "talk"; botId: number }
    | { kind: "pickTarget"; botId: number; only?: number[]; prompt?: string }
    | { kind: "tell"; botId: number; what: "tellVote" | "tellTarget" }
    | { kind: "rumourAbout"; botId: number }
    | { kind: "rumourKind"; botId: number; targetId: number }
    | { kind: "pickReason"; botId: number; targetId: number }
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

    const gs = controller.gameState;
    const human = controller.socialActor;
    const allies = controller.allyIds(human.id);
    const myAlliances = controller.alliancesOf(human.id);
    const approaches = controller.approachesFor(human.id);
    const everyoneElse = nonEvictedHouseguests(gs).filter((hg) => hg.id !== human.id);
    const actionsLeft = controller.state.actionsLeft;
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
        if (controller.isHuman(hg)) return <span>🎮 Player {tags}</span>;
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
                        ? `Who do you want to talk to? (${actionsLeft} action${actionsLeft === 1 ? "" : "s"} left)`
                        : "You're out of actions, but you can still talk to people."}
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
                                    : controller.isHuman(hg)
                                    ? undefined
                                    : () => setMode({ kind: "talk", botId: hg.id }) // out of actions: you can still talk
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
    } else if (mode.kind === "pickAction") {
        const bot = getById(gs, mode.botId);
        const step = controller.state.step;
        const campaign = step === Step.SocialCampaign;
        const nomsSet = nomineeIds.length > 0 && [Step.SocialAfternoon, Step.SocialBlockbuster, Step.SocialCampaign].includes(step);
        const iAmNominee = nomineeIds.includes(human.id);
        const iAmHoh = human.id === hohId;
        const botVotes = bot.id !== hohId && !nomineeIds.includes(bot.id);
        const otherNoms = nomineeIds.filter((id) => id !== human.id);
        const asked = ((controller.state.week.intel || {})[human.id] || {})[bot.id];
        body = (
            <div>
                <Face hg={bot} caption={caption(bot)} />
                <Subtle>
                    {readLine(bot.name, controller.readOf(human.id, bot.id), controller.trustReadOf(human.id, bot.id))}
                    {controller.showmancePartner(bot.id) !== undefined &&
                        ` ${bot.name} is in a showmance with ${
                            controller.showmancePartner(bot.id) === human.id ? "you" : controller.player(controller.showmancePartner(bot.id)!).name
                        }.`}
                </Subtle>
                <Subtle>What do you want to do with {bot.name}?</Subtle>
                <div>
                    <BigButton kind="primary" onClick={() => setMode({ kind: "talk", botId: bot.id })}>
                        ✍️ Talk (in your own words)
                    </BigButton>
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
                    <BigButton kind="danger" onClick={() => act({ kind: "flirt", botId: bot.id })}>
                        💕 Flirt
                    </BigButton>
                    <BigButton kind="warning" onClick={() => setMode({ kind: "rumourAbout", botId: bot.id })}>
                        🗯️ Start a rumour
                    </BigButton>
                </div>
                <div>
                    <BigButton kind="danger" onClick={() => act({ kind: "confront", botId: bot.id })}>
                        🔥 Confront
                    </BigButton>
                    {actionsLeft >= 2 && !(controller.state.week.meetingBy || []).includes(human.id) && (
                        <BigButton kind="danger" onClick={() => act({ kind: "meeting", botId: bot.id })}>
                            📣 House meeting (2 actions)
                        </BigButton>
                    )}
                    {everyoneElse.length >= 3 && !hasFinal2(controller.ledger, human.id, bot.id) && (
                        <BigButton kind="success" onClick={() => act({ kind: "final2", botId: bot.id })}>
                            🏁 Final two deal
                        </BigButton>
                    )}
                </div>
                {campaign && iAmNominee && botVotes && (
                    <div>
                        <Subtle>You're on the block. Campaign for {bot.name}'s vote:</Subtle>
                        <BigButton kind="success" onClick={() => act({ kind: "voteDeal", botId: bot.id })}>
                            🤝 Vote deal
                        </BigButton>
                        <BigButton kind="info" onClick={() => act({ kind: "pity", botId: bot.id })}>
                            🥺 Pity pitch
                        </BigButton>
                        <BigButton
                            kind="warning"
                            onClick={() =>
                                otherNoms.length === 1
                                    ? setMode({ kind: "pickReason", botId: bot.id, targetId: otherNoms[0] })
                                    : setMode({ kind: "pickTarget", botId: bot.id, only: otherNoms, prompt: `Who do you throw under the bus?` })
                            }
                        >
                            🚌 Under the bus
                        </BigButton>
                    </div>
                )}
                {nomsSet && (
                    <div>
                        {!iAmHoh && !iAmNominee && (
                            <BigButton kind="light" onClick={() => setMode({ kind: "tell", botId: bot.id, what: "tellVote" })}>
                                🗣️ Tell them my vote
                            </BigButton>
                        )}
                        {iAmHoh && (
                            <BigButton kind="light" onClick={() => setMode({ kind: "tell", botId: bot.id, what: "tellTarget" })}>
                                🎯 Tell them the target
                            </BigButton>
                        )}
                        {campaign && botVotes && asked === undefined && (
                            <BigButton
                                kind="light"
                                onClick={() => {
                                    whenDone(controller.askVote(bot.id), (said) => {
                                        if (said !== null && said !== undefined)
                                            record({
                                                text: `${bot.name}: "${controller.say(bot.id, "voteAnswer", "ask", controller.player(said).name)}"`,
                                                good: true,
                                            });
                                    });
                                }}
                            >
                                🗳️ Ask about the vote (free)
                            </BigButton>
                        )}
                    </div>
                )}
                <BigButton kind="light" onClick={() => setMode({ kind: "pickBot" })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "talk") {
        const bot = getById(gs, mode.botId);
        body = (
            <div>
                <Face hg={bot} caption={caption(bot)} small={true} />
                <Subtle>{actionsLeft > 0 ? `${actionsLeft} action${actionsLeft === 1 ? "" : "s"} left` : "Out of actions: offers will have to wait."}</Subtle>
                <BotTalkPanel controller={controller} botId={bot.id} onOutcome={record} />
                <BigButton kind="light" onClick={() => setMode(actionsLeft > 0 ? { kind: "pickAction", botId: bot.id } : { kind: "pickBot" })}>
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
    } else if (mode.kind === "pickReason") {
        const bot = getById(gs, mode.botId);
        const target = getById(gs, mode.targetId);
        body = (
            <div>
                <Face hg={target} small={true} />
                <Subtle>
                    Why should {bot.name} go after {target.name}? Pick an argument {bot.name} will believe.
                </Subtle>
                <div>
                    {PITCH_REASONS.map((r) => (
                        <BigButton
                            key={r.id}
                            kind="warning"
                            onClick={() => act({ kind: "pitch", botId: bot.id, targetId: target.id, reason: r.id })}
                        >
                            {r.label}
                        </BigButton>
                    ))}
                </div>
                <BigButton kind="light" onClick={() => setMode({ kind: "pickTarget", botId: bot.id })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "rumourAbout") {
        const bot = getById(gs, mode.botId);
        body = (
            <div>
                <Subtle>Who do you want {bot.name} to hear a rumour about? It doesn't have to be true, but if it isn't, it may come back to you.</Subtle>
                <Grid>
                    {everyoneElse
                        .filter((hg) => hg.id !== bot.id)
                        .map((hg) => (
                            <Face key={hg.id} hg={hg} small={true} onClick={() => setMode({ kind: "rumourKind", botId: bot.id, targetId: hg.id })} />
                        ))}
                </Grid>
                <BigButton kind="light" onClick={() => setMode({ kind: "pickAction", botId: bot.id })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "rumourKind") {
        const bot = getById(gs, mode.botId);
        const about = getById(gs, mode.targetId);
        body = (
            <div>
                <Face hg={about} small={true} />
                <Subtle>What do you tell {bot.name} about {about.name}?</Subtle>
                <div>
                    {RUMOURS.map((r) => (
                        <BigButton
                            key={r.id}
                            kind="warning"
                            onClick={() => act({ kind: "rumour", botId: bot.id, targetId: about.id, rumour: r.id })}
                        >
                            {r.label}
                        </BigButton>
                    ))}
                </div>
                <BigButton kind="light" onClick={() => setMode({ kind: "rumourAbout", botId: bot.id })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "tell") {
        const bot = getById(gs, mode.botId);
        const vote = mode.what === "tellVote";
        const options = vote
            ? nomineeIds.filter((id) => id !== bot.id).map((id) => getById(gs, id))
            : everyoneElse.filter((hg) => hg.id !== bot.id);
        body = (
            <div>
                <Face hg={bot} caption={caption(bot)} />
                <Subtle>
                    {vote
                        ? `Who do you tell ${bot.name} you're voting to evict? It doesn't have to be true, but tell different people different things and they may compare notes.`
                        : `Who do you tell ${bot.name} is your real target? It doesn't have to be true, but tell different people different things and they may compare notes.`}
                    {vote && nomineeIds.includes(bot.id) ? ` ${bot.name} is on the block: telling them you'll vote the other way is a promise.` : ""}
                </Subtle>
                <Grid>
                    {options.map((hg) => (
                        <Face key={hg.id} hg={hg} small={true} onClick={() => act({ kind: mode.what, botId: bot.id, targetId: hg.id })} />
                    ))}
                </Grid>
                <BigButton kind="light" onClick={() => setMode({ kind: "pickAction", botId: bot.id })}>
                    Back
                </BigButton>
            </div>
        );
    } else {
        const bot = getById(gs, mode.botId);
        const only = mode.only;
        body = (
            <div>
                <Subtle>{mode.prompt || `Who do you want to turn ${bot.name} against?`}</Subtle>
                <Grid>
                    {everyoneElse
                        .filter((hg) => hg.id !== bot.id && (!only || only.includes(hg.id)))
                        .map((hg) => (
                            <Face
                                key={hg.id}
                                hg={hg}
                                small={true}
                                onClick={() => setMode({ kind: "pickReason", botId: bot.id, targetId: hg.id })}
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
            <PowerCard controller={controller} actorId={human.id} />
            {controller.state.step === Step.SocialCampaign && <VoteCount controller={controller} actorId={human.id} />}
            <PromiseList controller={controller} actorId={human.id} />
            <ThreatMeter controller={controller} actorId={human.id} />
            <AllianceCount controller={controller} actorId={human.id} />
            <Overheard controller={controller} actorId={human.id} />
            <JuryWatch controller={controller} actorId={human.id} />
            {approaches.length > 0 && (
                <div className="bbb-card-box">
                    <div className="bbb-card-title">💬 Houseguests came to talk to you</div>
                    {approaches.map((a, i) => (
                        <ApproachCard
                            key={`${a.kind}-${a.fromId}-${i}`}
                            approach={a}
                            controller={controller}
                            onAnswer={(accept) => whenDone(controller.respondApproach(i, accept), record)}
                            onSides={(side) => whenDone(controller.respondSides(i, side), record)}
                        />
                    ))}
                </div>
            )}
            {body}
            <OutcomeList outcomes={outcomes} />
            <BigButton kind={actionsLeft > 0 ? "light" : "primary"} onClick={controller.endSocial}>
                {myAlliances.length === 0 || !controller.allianceTimeOpen()
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
