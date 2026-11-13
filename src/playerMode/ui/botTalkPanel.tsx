import React from "react";
import { PlayerModeController } from "../playerModeController";
import { TALK_MAX_LENGTH, TALK_SUGGESTIONS } from "../social/botTalk";
import { SocialOutcome } from "../social/socialActions";
import { whenDone } from "./common";

// Talking to a houseguest in your own words, on the social screen. Questions and small talk are free; asking
// for a deal, pitching a target and the like use up a social action, like the buttons do.
export function BotTalkPanel(props: { controller: PlayerModeController; botId: number; onOutcome: (o: SocialOutcome | null) => void }) {
    const { controller, botId } = props;
    const me = controller.socialActor.id;
    const bot = controller.player(botId);
    const [text, setText] = React.useState("");
    const [, rerender] = React.useState(0);
    const end = React.useRef<HTMLDivElement>(null);
    const lines = controller.talkWith(me, botId);
    React.useEffect(() => {
        if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: "nearest" });
    }, [lines.length]);
    const send = (message: string) => {
        if (!message.trim()) return;
        setText("");
        whenDone(controller.talkToBot(botId, message), (result) => {
            if (result && result.outcome) props.onOutcome(result.outcome);
            rerender((n) => n + 1);
        });
    };
    return (
        <div className="bbb-talk">
            <div className="bbb-chat-thread">
                {lines.length === 0 && (
                    <div className="bbb-chat-system">
                        Keep it short and about the game: ask {bot.name} who they're targeting or voting for, how they feel about you or someone
                        else, or make them an offer (a final two, an alliance, a target). Questions are free; offers use an action.
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
                    )
                )}
                <div ref={end} />
            </div>
            <div className="bbb-talk-chips">
                {TALK_SUGGESTIONS.map((t) => (
                    <button key={t} type="button" className="button is-small is-light" onClick={() => send(t)}>
                        {t}
                    </button>
                ))}
            </div>
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
                    placeholder={`Ask ${bot.name} about the game…`}
                    aria-label={`Message to ${bot.name}`}
                    onChange={(e) => setText(e.target.value)}
                />
                {text.length > TALK_MAX_LENGTH - 30 && <span className="bbb-talk-count">{TALK_MAX_LENGTH - text.length}</span>}
                <button type="submit" className="button is-small is-warning" disabled={!text.trim()}>
                    Send
                </button>
            </form>
        </div>
    );
}
