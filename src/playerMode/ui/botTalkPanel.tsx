import React from "react";
import { nonEvictedHouseguests } from "../../model";
import { PlayerModeController, Step } from "../playerModeController";
import { TALK_MAX_LENGTH, TALK_SUGGESTIONS } from "../social/botTalk";
import { RUMOURS } from "../social/drama";
import { PITCH_REASONS, PitchReason, reasonLine } from "../social/pitch";
import { hasFinal2 } from "../social/promises";
import { SocialAction, SocialOutcome } from "../social/socialActions";
import { HOH } from "../terms";
import { nomsSetStep } from "../week";
import { Face, Grid, Subtle, whenDone } from "./common";

// What you're in the middle of picking for an action (who to pitch, which rumour...).
type Picker =
    | { kind: "pitch"; only?: number[]; bus?: boolean }
    | { kind: "reason"; targetId: number; bus?: boolean }
    | { kind: "rumour" }
    | { kind: "rumourKind"; targetId: number }
    | { kind: "tell"; what: "tellVote" | "tellTarget" };

const chip = (kind: string) => `button is-small is-${kind}`;

// Talking to a houseguest, on the social screen: whatever they came to tell you, everything you can do with
// them (a deal, a pitch, a rumour... each uses up a social action, like it says), quick questions, and your own
// words. Questions and small talk are free.
export function BotTalkPanel(props: {
    controller: PlayerModeController;
    botId: number;
    onOutcome: (o: SocialOutcome | null) => void;
}) {
    const { controller, botId } = props;
    const me = controller.socialActor;
    const bot = controller.player(botId);
    const [text, setText] = React.useState("");
    const [picker, setPicker] = React.useState<Picker | null>(null);
    const [, rerender] = React.useState(0);
    const end = React.useRef<HTMLDivElement>(null);
    const lines = controller.talkWith(me.id, botId);
    const approaches = controller
        .approachesFor(me.id)
        .map((a, index) => ({ a, index }))
        .filter((x) => x.a.fromId === botId);
    React.useEffect(() => {
        if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: "nearest" });
    }, [lines.length, approaches.length]);

    const gs = controller.gameState;
    const actionsLeft = controller.actionsOf(me.id);
    const everyoneElse = nonEvictedHouseguests(gs).filter((hg) => hg.id !== me.id);
    const others = everyoneElse.filter((hg) => hg.id !== botId);
    const hohId = controller.publicHohId(me.id); // a secret HoH stays secret
    const nomineeIds = (controller.state.week.nomineeIds || []).filter(
        (id) => !controller.player(id).isEvicted,
    );
    const step = controller.state.step;
    const campaign = step === Step.SocialCampaign;
    const nomsSet =
        nomineeIds.length > 0 && nomsSetStep(step);
    // before the Veto Ceremony, the nominees and the HoH make their case to the veto holder
    const vetoCase =
        step === Step.SocialVeto &&
        botId === controller.state.week.povId &&
        !nomineeIds.includes(botId) &&
        (nomineeIds.includes(me.id) || me.id === hohId);
    const iAmNominee = nomineeIds.includes(me.id);
    const iAmHoh = me.id === hohId;
    const botVotes = botId !== hohId && !nomineeIds.includes(botId);
    const otherNoms = nomineeIds.filter((id) => id !== me.id);
    const joinable = controller.alliancesOf(me.id).filter((a) => !a.memberIds.includes(botId));
    const name = (id: number) => controller.player(id).name;
    // talking takes an action (once a block); then say all you want, for as long as they'll listen
    const started = controller.talkStarted(me.id, botId);
    const over = controller.talkOver(me.id, botId); // they ended it: nothing more to say this block
    const canTalk = !over && (started || actionsLeft > 0);

    const done = (result: { outcome?: SocialOutcome } | null) => {
        if (result && result.outcome) props.onOutcome(result.outcome);
        rerender((n) => n + 1);
    };
    const send = (message: string) => {
        if (!message.trim()) return;
        setText("");
        whenDone(controller.talkToBot(botId, message), done);
    };
    // an action from the menu: said in your words, done as picked
    const doAction = (said: string, action: SocialAction) => {
        setPicker(null);
        whenDone(controller.talkToBot(botId, said, action), done);
    };
    const pitch = (targetId: number, reason: PitchReason, bus?: boolean) =>
        doAction(
            `${bus ? `Vote out ${name(targetId)}, not me.` : `We should go after ${name(targetId)}.`} ${reasonLine(reason, name(targetId))}`,
            { kind: "pitch", botId, targetId, reason },
        );
    const answer = (index: number, accept: boolean) =>
        whenDone(controller.respondApproach(index, accept), (o) => done(o ? { outcome: o } : null));
    const sides = (index: number, side: "a" | "b" | null) =>
        whenDone(controller.respondSides(index, side), (o) => done(o ? { outcome: o } : null));

    const faces = (
        people: { id: number; name: string; imageURL: string }[],
        onPick: (id: number) => void,
    ) => (
        <Grid>
            {people.map((hg) => (
                <Face key={hg.id} hg={hg} small={true} onClick={() => onPick(hg.id)} />
            ))}
        </Grid>
    );

    let menu: React.ReactNode;
    if (picker && picker.kind === "pitch") {
        const pool = others.filter((hg) => !picker.only || picker.only.includes(hg.id));
        menu = (
            <>
                <Subtle>
                    {picker.bus
                        ? "Who do you throw under the bus?"
                        : `Who do you want to turn ${bot.name} against?`}
                </Subtle>
                {faces(pool, (id) => setPicker({ kind: "reason", targetId: id, bus: picker.bus }))}
            </>
        );
    } else if (picker && picker.kind === "reason") {
        menu = (
            <>
                <Subtle>
                    Why should {bot.name} go after {name(picker.targetId)}? Pick an argument {bot.name} will
                    believe.
                </Subtle>
                <div className="bbb-talk-chips">
                    {PITCH_REASONS.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            className={chip("warning")}
                            onClick={() => pitch(picker.targetId, r.id, picker.bus)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </>
        );
    } else if (picker && picker.kind === "rumour") {
        menu = (
            <>
                <Subtle>
                    Who do you want {bot.name} to hear a rumour about? It doesn't have to be true, but if it
                    isn't, it may come back to you.
                </Subtle>
                {faces(others, (id) => setPicker({ kind: "rumourKind", targetId: id }))}
            </>
        );
    } else if (picker && picker.kind === "rumourKind") {
        const about = name(picker.targetId);
        menu = (
            <>
                <Subtle>
                    What do you tell {bot.name} about {about}?
                </Subtle>
                <div className="bbb-talk-chips">
                    {RUMOURS.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            className={chip("warning")}
                            onClick={() =>
                                doAction(r.line(about), {
                                    kind: "rumour",
                                    botId,
                                    targetId: picker.targetId,
                                    rumour: r.id,
                                })
                            }
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </>
        );
    } else if (picker && picker.kind === "tell") {
        const vote = picker.what === "tellVote";
        const pool = vote
            ? nomineeIds.filter((id) => id !== botId).map((id) => controller.player(id))
            : others;
        menu = (
            <>
                <Subtle>
                    {vote
                        ? `Who do you tell ${bot.name} you're voting to evict?`
                        : `Who do you tell ${bot.name} is your real target?`}{" "}
                    It doesn't have to be true, but tell different people different things and they may
                    compare notes.
                    {vote && nomineeIds.includes(botId)
                        ? ` ${bot.name} is on the block: telling them you'll vote the other way is a promise.`
                        : ""}
                </Subtle>
                {faces(pool, (id) =>
                    doAction(
                        vote ? `I'm voting to evict ${name(id)}.` : `Between us, my target is ${name(id)}.`,
                        { kind: picker.what, botId, targetId: id },
                    ),
                )}
            </>
        );
    } else if (canTalk) {
        const meeting =
            actionsLeft >= (started ? 1 : 2) && !(controller.state.week.meetingBy || []).includes(me.id);
        menu = (
            <div className="bbb-talk-chips" aria-label="Actions">
                <button
                    type="button"
                    className={chip("danger")}
                    onClick={() =>
                        doAction("Is it just me, or is there something between us? 😏", {
                            kind: "flirt",
                            botId,
                        })
                    }
                >
                    💕 Flirt
                </button>
                <button
                    type="button"
                    className={chip("danger")}
                    onClick={() =>
                        doAction("We need to talk. I don't like how you've been playing me.", {
                            kind: "confront",
                            botId,
                        })
                    }
                >
                    🔥 Confront
                </button>
                {meeting && (
                    <button
                        type="button"
                        className={chip("danger")}
                        onClick={() =>
                            doAction(`House meeting! Everyone needs to hear about ${bot.name}.`, {
                                kind: "meeting",
                                botId,
                            })
                        }
                    >
                        📣 House meeting ({started ? "1 more action" : "2 actions"})
                    </button>
                )}
                {everyoneElse.length >= 3 && !hasFinal2(controller.ledger, me.id, botId) && (
                    <button
                        type="button"
                        className={chip("success")}
                        onClick={() => doAction("You and me, final two. Deal?", { kind: "final2", botId })}
                    >
                        🏁 Final two deal
                    </button>
                )}
                {vetoCase && (
                    <button
                        type="button"
                        className={chip("success")}
                        onClick={() =>
                            doAction(
                                iAmNominee
                                    ? "You've got the veto. Please, use it on me."
                                    : "Keep the nominations the same, okay? Don't use the veto.",
                                { kind: "vetoCase", botId },
                            )
                        }
                    >
                        🏅 {iAmNominee ? "Ask them to use the veto on you" : "Ask them not to use the veto"}
                    </button>
                )}
                {campaign && iAmNominee && botVotes && (
                    <>
                        <button
                            type="button"
                            className={chip("success")}
                            onClick={() =>
                                doAction(`Keep me this week, and you're safe if I win ${HOH}.`, {
                                    kind: "voteDeal",
                                    botId,
                                })
                            }
                        >
                            🤝 Vote deal
                        </button>
                        <button
                            type="button"
                            className={chip("info")}
                            onClick={() =>
                                doAction("Please... I really need your vote this week.", {
                                    kind: "pity",
                                    botId,
                                })
                            }
                        >
                            🥺 Pity pitch
                        </button>
                        {otherNoms.length > 0 && (
                            <button
                                type="button"
                                className={chip("warning")}
                                onClick={() =>
                                    otherNoms.length === 1
                                        ? setPicker({ kind: "reason", targetId: otherNoms[0], bus: true })
                                        : setPicker({ kind: "pitch", only: otherNoms, bus: true })
                                }
                            >
                                🚌 Under the bus
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    } else
        menu = over ? (
            <Subtle>{bot.name} has had enough talking for now. Try again next social time.</Subtle>
        ) : (
            <Subtle>You're out of actions: talking to {bot.name} will have to wait until next time.</Subtle>
        );

    return (
        <div className="bbb-talk">
            <div className="bbb-chat-thread">
                {!started && canTalk && (
                    <div className="bbb-chat-system">
                        Talking to {bot.name} uses 1 action. Then say all you want, for as long as they'll
                        listen: questions, deals, alliances, pitches, rumours. Pick something below, or say it
                        yourself (short, and about the game).
                    </div>
                )}
                {lines.map((l, i) =>
                    l.who === "note" ? (
                        <div key={i} className="bbb-chat-system">
                            {l.text}
                        </div>
                    ) : (
                        <div key={i} className={`bbb-chat-msg${l.who === "me" ? " is-mine" : ""}`}>
                            {l.text}
                        </div>
                    ),
                )}
                {approaches.map(({ a, index }) => (
                    <div key={`${a.kind}-${index}`} className="bbb-chat-approach">
                        <div className="bbb-chat-msg">{controller.approachText(a)}</div>
                        <div className="bbb-talk-chips">
                            {a.kind === "chat" ? (
                                <button
                                    type="button"
                                    className={chip("light")}
                                    onClick={() => answer(index, true)}
                                >
                                    OK
                                </button>
                            ) : a.kind === "sides" ? (
                                <>
                                    <button
                                        type="button"
                                        className={chip("warning")}
                                        onClick={() => sides(index, "a")}
                                    >
                                        {bot.name}
                                    </button>
                                    <button
                                        type="button"
                                        className={chip("warning")}
                                        onClick={() => sides(index, "b")}
                                    >
                                        {name(a.otherId)}
                                    </button>
                                    <button
                                        type="button"
                                        className={chip("light")}
                                        onClick={() => sides(index, null)}
                                    >
                                        Stay out of it
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={chip("success")}
                                        onClick={() => answer(index, true)}
                                    >
                                        {a.kind === "pitch"
                                            ? "I'm in"
                                            : a.kind === "final2"
                                              ? "🏁 Deal"
                                              : a.kind === "votePlea"
                                                ? "🗳️ You have my vote"
                                                : a.kind === "vetoPlea"
                                                ? "🏅 I'll use it on you"
                                                : a.kind === "vetoKeep"
                                                ? "👍 They'll stay the same"
                                                : "🤝 Accept"}
                                    </button>
                                    <button
                                        type="button"
                                        className={chip("light")}
                                        onClick={() => answer(index, false)}
                                    >
                                        {a.kind === "pitch"
                                            ? "Not so sure"
                                            : a.kind === "final2"
                                              ? "Not yet"
                                              : a.kind === "votePlea" || a.kind === "vetoPlea" || a.kind === "vetoKeep"
                                                ? "Can't promise"
                                                : "Decline"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={end} />
            </div>
            <div className="bbb-talk-menu">
                {menu}
                {picker && (
                    <button type="button" className={chip("light")} onClick={() => setPicker(null)}>
                        Cancel
                    </button>
                )}
            </div>
            {canTalk && (
                <div className="bbb-talk-chips" aria-label="Questions">
                    {[...TALK_SUGGESTIONS, ...joinable.map((a) => `Want to join ${a.name}?`)].map((t) => (
                        <button key={t} type="button" className={chip("light")} onClick={() => send(t)}>
                            {t}
                        </button>
                    ))}
                    {/* these need a who: pick them next */}
                    <button type="button" className={chip("light")} onClick={() => setPicker({ kind: "pitch" })}>
                        🗡️ Pitch a target
                    </button>
                    <button type="button" className={chip("light")} onClick={() => setPicker({ kind: "rumour" })}>
                        🗯️ Start a rumour
                    </button>
                    {nomsSet && !iAmHoh && !iAmNominee && (
                        <button
                            type="button"
                            className={chip("light")}
                            onClick={() => setPicker({ kind: "tell", what: "tellVote" })}
                        >
                            🗣️ Tell them my vote
                        </button>
                    )}
                    {nomsSet && iAmHoh && (
                        <button
                            type="button"
                            className={chip("light")}
                            onClick={() => setPicker({ kind: "tell", what: "tellTarget" })}
                        >
                            🎯 Tell them the target
                        </button>
                    )}
                </div>
            )}
            {canTalk && (
                <form
                    className="bbb-chat-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send(text);
                    }}
                >
                    <input
                        type="text"
                        value={text}
                        maxLength={TALK_MAX_LENGTH}
                        placeholder={`Say something to ${bot.name}…`}
                        aria-label={`Message to ${bot.name}`}
                        onChange={(e) => setText(e.target.value)}
                    />
                    {text.length > TALK_MAX_LENGTH - 30 && (
                        <span className="bbb-talk-count">{TALK_MAX_LENGTH - text.length}</span>
                    )}
                    <button type="submit" className="button is-small is-warning" disabled={!text.trim()}>
                        Send
                    </button>
                </form>
            )}
        </div>
    );
}
