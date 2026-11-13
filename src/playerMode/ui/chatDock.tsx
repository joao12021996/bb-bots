import React from "react";
import { getById } from "../../model";
import { PlayerModeController } from "../playerModeController";
import { CHAT_MAX_LENGTH, ChatMessage, NetSession } from "../net/netSession";
import { Conversation, conversationOf, markSeen as markRead, seen$, unreadIn, useSubject } from "./playerChat";

// Online chat, in a corner of the screen: private messages with the other players still in the house, and, once
// you're evicted, the jury house (with what the jurors have been saying about the house).

export function ChatDock(props: { session: NetSession; controller: PlayerModeController }) {
    const { session, controller } = props;
    const messages = useSubject(session.chat$);
    useSubject(session.status$); // re-render when players come and go
    const [open, setOpen] = React.useState(false);
    const [with_, setWith] = React.useState<Conversation | null>(null);
    const seen = useSubject(seen$(session.code));
    const me = session.localPlayerId;
    if (me === null || controller.isRuleBreaker(me)) return null;
    const gs = controller.gameState;
    const meHg = getById(gs, me);
    if (!meHg) return null;
    const evicted = meHg.isEvicted;
    const others = controller.state.humanIds.filter((id) => session.mayChat(me, id));
    const conversations: Conversation[] = evicted ? ["jury"] : others;
    if (conversations.length === 0) return null;
    const current: Conversation | null = evicted ? "jury" : with_ !== null && conversations.includes(with_) ? with_ : conversations.length === 1 ? conversations[0] : null;

    const unread = (conv: Conversation) => unreadIn(messages, seen, me, conv);
    const totalUnread = conversations.reduce<number>((n, c) => n + unread(c), 0);

    const markSeen = (conv: Conversation) => markRead(session, me, conv);
    if (open && current !== null && unread(current) > 0) Promise.resolve().then(() => markSeen(current));

    const name = (id: number) => (id === me ? "You" : session.playerName(id));

    return (
        <div className="bbb-chat">
            {open && (
                <div className="bbb-chat-panel" role="dialog" aria-label="Chat">
                    <div className="bbb-chat-head">
                        {current !== null && !evicted && conversations.length > 1 && (
                            <button type="button" className="bbb-chat-back" onClick={() => setWith(null)} aria-label="All chats">
                                ‹
                            </button>
                        )}
                        <b>{current === "jury" ? "⚖️ Jury house" : current !== null ? `💬 ${name(current)}` : "💬 Private messages"}</b>
                        <button type="button" className="bbb-chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
                            ✕
                        </button>
                    </div>
                    {current === null ? (
                        <div className="bbb-chat-list">
                            {conversations.map((id) => {
                                const hg = getById(gs, id as number);
                                const n = unread(id);
                                return (
                                    <button key={id} type="button" className="bbb-chat-person" onClick={() => setWith(id)}>
                                        <img src={hg.imageURL} alt="" />
                                        <span>{hg.name}</span>
                                        {n > 0 && <span className="bbb-chat-badge">{n}</span>}
                                    </button>
                                );
                            })}
                            <p className="bbb-chat-note">Only the two of you can read a private chat.</p>
                        </div>
                    ) : (
                        <Thread
                            key={String(current)}
                            session={session}
                            controller={controller}
                            me={me}
                            conv={current}
                            messages={messages.filter((m) => conversationOf(m, me) === current)}
                            name={name}
                        />
                    )}
                </div>
            )}
            <button
                type="button"
                className="bbb-chat-button"
                onClick={() => setOpen(!open)}
                aria-label={totalUnread > 0 ? `Chat, ${totalUnread} unread` : "Chat"}
                title={evicted ? "Jury house chat" : "Private messages"}
            >
                {evicted ? "⚖️" : "💬"}
                {totalUnread > 0 && <span className="bbb-chat-badge">{totalUnread}</span>}
            </button>
        </div>
    );
}

function Thread(props: {
    session: NetSession;
    controller: PlayerModeController;
    me: number;
    conv: Conversation;
    messages: ChatMessage[];
    name: (id: number) => string;
}) {
    const [text, setText] = React.useState("");
    const end = React.useRef<HTMLDivElement>(null);
    // the jury house: what's been said there, and what the jurors think of the house (see recordEvictionGrudges)
    const log = props.conv === "jury" ? props.controller.juryHouseLog() : [];
    React.useEffect(() => {
        if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: "end" });
    }, [props.messages.length]);
    const send = () => {
        if (!text.trim()) return;
        props.session.sendChat(props.conv, text);
        setText("");
    };
    return (
        <>
            <div className="bbb-chat-thread">
                {log.map((line, i) => (
                    <div key={`log${i}`} className="bbb-chat-system">
                        Week {line.week}: {line.text}
                    </div>
                ))}
                {props.messages.length === 0 && log.length === 0 && (
                    <div className="bbb-chat-system">{props.conv === "jury" ? "Welcome to the jury house. Nobody in the house can read this." : "Say hi. Nobody else can read this."}</div>
                )}
                {props.messages.map((m) => (
                    <div key={m.id} className={`bbb-chat-msg${m.from === props.me ? " is-mine" : ""}`}>
                        {props.conv === "jury" && m.from !== props.me && <span className="bbb-chat-from">{props.name(m.from)}</span>}
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
                    placeholder="Message…"
                    aria-label="Message"
                    onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" className="button is-small is-warning" disabled={!text.trim()}>
                    Send
                </button>
            </form>
        </>
    );
}
