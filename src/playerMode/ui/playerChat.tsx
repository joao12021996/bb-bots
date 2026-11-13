import React from "react";
import { BehaviorSubject } from "rxjs";
import { getById } from "../../model";
import { isSocialStep, PlayerModeController } from "../playerModeController";
import { CHAT_MAX_LENGTH, ChatMessage, NetSession } from "../net/netSession";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";

// Online: texting the other players, from the social screen (the same chat box as talking to a bot) and the
// corner chat (see ChatDock). Both read the same messages and agree on what's been read.

export type Conversation = number | "jury"; // a player's id, or the jury house

export function conversationOf(m: ChatMessage, me: number): Conversation {
    if (m.to === "jury") return "jury";
    return m.from === me ? m.to : m.from;
}

// ---------- what's been read, on this device ----------

function seenKey(code: string): string {
    return `bbb-chat-seen:${code}`;
}

function loadSeen(code: string): { [conv: string]: number } {
    try {
        const json = localStorage.getItem(seenKey(code));
        const seen = json ? JSON.parse(json) : {};
        return seen && typeof seen === "object" ? seen : {};
    } catch (e) {
        return {};
    }
}

const seenStores: { [code: string]: BehaviorSubject<{ [conv: string]: number }> } = {};

// The last message read in each conversation (by when it was sent), for an online season.
export function seen$(code: string): BehaviorSubject<{ [conv: string]: number }> {
    if (!seenStores[code]) {
        const store = new BehaviorSubject(loadSeen(code));
        store.subscribe((seen) => {
            try {
                localStorage.setItem(seenKey(code), JSON.stringify(seen));
            } catch (e) {
                // no storage: unread counts start over after a reload
            }
        });
        seenStores[code] = store;
    }
    return seenStores[code];
}

export function markSeen(session: NetSession, me: number, conv: Conversation) {
    const store = seen$(session.code);
    const last = session.chat$.value.filter((m) => conversationOf(m, me) === conv).reduce((t, m) => Math.max(t, m.at), 0);
    if (last > (store.value[String(conv)] || 0)) store.next({ ...store.value, [String(conv)]: last });
}

export function unreadIn(messages: ChatMessage[], seen: { [conv: string]: number }, me: number, conv: Conversation): number {
    return messages.filter((m) => m.from !== me && conversationOf(m, me) === conv && m.at > (seen[String(conv)] || 0)).length;
}

export function useSubject<T>(subject: { value: T; subscribe: (fn: (v: T) => void) => { unsubscribe: () => void } }): T {
    const [value, setValue] = React.useState(subject.value);
    React.useEffect(() => {
        const sub = subject.subscribe((v) => setValue(() => v));
        return () => sub.unsubscribe();
    }, [subject]);
    return value;
}

// The players who've texted `me` and are waiting to be read, newest first.
export function useUnreadFrom(session: NetSession, me: number): number[] {
    const messages = useSubject(session.chat$);
    const seen = useSubject(seen$(session.code));
    const from: number[] = [];
    [...messages].reverse().forEach((m) => {
        if (m.to === "jury" || m.from === me || from.includes(m.from)) return;
        if (unreadIn(messages, seen, me, m.from) > 0) from.push(m.from);
    });
    return from;
}

// ---------- texts you're waiting on a reply to ----------

// When this device first showed a social block (by the season and the block), so "this block's texts" means the
// same thing across a player's screens. Only on this device: it's only for asking before moving on.
const blockStarts: { [key: string]: number } = {};

export function blockStart(session: NetSession, controller: PlayerModeController): number {
    const key = `${session.code}:${controller.gameState.phase}:${controller.state.step}`;
    if (blockStarts[key] === undefined) blockStarts[key] = Date.now() - 5000; // a little slack for clocks that disagree
    return blockStarts[key];
}

// The players `me` texted this block who haven't answered since.
export function unanswered(messages: ChatMessage[], me: number, since: number): number[] {
    const last: { [id: number]: ChatMessage } = {};
    messages.forEach((m) => {
        if (m.to === "jury") return;
        const other = m.from === me ? m.to : m.from;
        if (m.from !== me && m.to !== me) return;
        last[other as number] = m;
    });
    return Object.keys(last)
        .map(Number)
        .filter((id) => last[id].from === me && last[id].at >= since);
}

// ---------- the chat box ----------

// A conversation with another player, in the same chat box as talking to a bot. No limit to speak of: players
// write to each other however they like.
export function PlayerChatPanel(props: { session: NetSession; controller: PlayerModeController; me: number; otherId: number }) {
    const { session, me, otherId } = props;
    const messages = useSubject(session.chat$).filter((m) => m.to !== "jury" && conversationOf(m, me) === otherId);
    const [text, setText] = React.useState("");
    const end = React.useRef<HTMLDivElement>(null);
    const name = session.playerName(otherId);
    React.useEffect(() => {
        markSeen(session, me, otherId);
        if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: "end" });
    }, [messages.length, session, me, otherId]);
    const send = () => {
        if (!text.trim()) return;
        session.sendChat(otherId, text);
        setText("");
    };
    return (
        <div className="bbb-talk">
            <div className="bbb-chat-thread">
                {messages.length === 0 && (
                    <div className="bbb-chat-system">{name} is a player. Text them anything: only the two of you can read this.</div>
                )}
                {messages.map((m) => (
                    <div key={m.id} className={`bbb-chat-msg${m.from === me ? " is-mine" : ""}`}>
                        {m.text}
                    </div>
                ))}
                <div ref={end} />
            </div>
            <form
                className="bbb-chat-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    send();
                }}
            >
                <input
                    type="text"
                    value={text}
                    maxLength={CHAT_MAX_LENGTH}
                    placeholder={`Text ${name}…`}
                    aria-label={`Message to ${name}`}
                    onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" className="button is-small is-warning" disabled={!text.trim()}>
                    Send
                </button>
            </form>
        </div>
    );
}

// ---------- you've got a text ----------

// Who's texted you and not been read yet, with a button to read it (onOpen) or, past social time, to go back to it.
export function TextsBanner(props: { session: NetSession; me: number; onOpen: (id: number) => void; action?: string }) {
    const from = useUnreadFrom(props.session, props.me);
    if (from.length === 0) return null;
    return (
        <div className="bbb-texts-banner" role="status">
            {from.map((id) => (
                <div key={id} className="bbb-texts-row">
                    <span>
                        📩 <b>{props.session.playerName(id)}</b> texted you
                    </span>
                    <button type="button" className="button is-small is-warning" onClick={() => props.onOpen(id)}>
                        {props.action || "Read it"}
                    </button>
                </div>
            ))}
        </div>
    );
}

// Online: done with social time while others are still at it. A text that comes in can take you back.
export function SocialDoneScreen(props: { session: NetSession; controller: PlayerModeController; actorId: number; blockName: string }) {
    const { session, controller, actorId } = props;
    useSubject(session.status$);
    const by = controller.state.socialBy || {};
    const busy = Object.keys(by)
        .map(Number)
        .filter((id) => id !== actorId && by[id].stage !== "done");
    return (
        <Panel>
            <Title>🗣️ {props.blockName}</Title>
            <Subtle>You're done for now. Waiting on {busy.length > 0 ? busy.map((id) => controller.player(id).name).join(", ") : "the others"}.</Subtle>
            <Grid>
                {busy.map((id) => (
                    <Face key={id} hg={getById(controller.gameState, id)} small={true} />
                ))}
            </Grid>
            {isSocialStep(controller.state.step) && (
                <>
                    <TextsBanner session={session} me={actorId} onOpen={() => controller.backToSocial()} action="Go back and answer" />
                    <BigButton kind="light" onClick={() => controller.backToSocial()}>
                        ↩️ Back to social time
                    </BigButton>
                </>
            )}
        </Panel>
    );
}
