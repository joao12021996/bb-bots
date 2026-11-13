import React from "react";
import { NetSession, NetStatus } from "../net/netSession";
import { actorOf, PlayerModeController } from "../playerModeController";

function useStatus(session: NetSession): NetStatus {
    const [status, setStatus] = React.useState(session.status$.value);
    React.useEffect(() => {
        const sub = session.status$.subscribe((s) => setStatus(() => s));
        return () => sub.unsubscribe();
    }, [session]);
    return status;
}

function clock(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// Online, with a time limit: how long whoever's deciding has left, before a bot decides for them.
// `owner`: the player's own screen being shown (null: the screen everyone shares).
export function TurnClock(props: { session: NetSession; controller: PlayerModeController; owner: number | null }) {
    const { session, controller, owner } = props;
    const status = useStatus(session);
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    if (status.pause && status.pause.on) return null;
    const due = session.deadline(owner);
    const prompt = controller.prompt$.value;
    const id = owner !== null ? owner : prompt ? actorOf(prompt) : null;
    if (due === null || id === null) return null;
    const left = due - now;
    const mine = id === status.localPlayerId;
    const urgent = left < 20000;
    return (
        <div className={urgent ? "bbb-turn-clock is-urgent" : "bbb-turn-clock"} role="timer" aria-live={urgent ? "polite" : "off"}>
            ⏱️ {mine ? <b>{clock(left)} to decide</b> : <>{controller.player(id).name} has {clock(left)}</>}
            {mine && <span className="bbb-subtle"> · then a bot decides this one for you</span>}
        </div>
    );
}

// Online: ask for a pause, agree to one, and the screen that covers the game while it's on.
export function PauseBar(props: { session: NetSession; controller: PlayerModeController }) {
    const { session, controller } = props;
    const status = useStatus(session);
    const me = status.localPlayerId;
    const p = status.pause;
    if (!status.started || status.spectating) return null;
    const name = (id: number) => controller.player(id).name;
    const voters = session.pauseVoters();
    const canVote = me !== null && voters.includes(me);
    if (p && p.on) {
        return (
            <div className="bbb-pause-cover" role="dialog" aria-modal="true" aria-label="Paused">
                <div className="bbb-pause-card">
                    <div className="bbb-handoff-icon">⏸️</div>
                    <h3 className="title is-4">Paused</h3>
                    <p className="bbb-subtle">
                        {name(p.by)} asked for a pause, and {p.yes.length} of {voters.length} players agreed. Nothing happens and no clocks run until
                        it's over. The chat still works.
                    </p>
                    {me !== null && (p.yes.includes(me) || status.isHost) && (
                        <button type="button" className="button is-success" onClick={() => session.pause("end")}>
                            ▶️ Back to the game
                        </button>
                    )}
                </div>
            </div>
        );
    }
    if (p) {
        const voted = me !== null && (p.yes.includes(me) || p.no.includes(me));
        return (
            <div className="bbb-pause-ask" role="status">
                ⏸️ <b>{name(p.by)}</b> wants a pause: {p.yes.length} of {p.needed} needed
                {canVote && !voted && (
                    <>
                        {" "}
                        <button type="button" className="button is-small is-success" onClick={() => session.pause("yes")}>
                            Agree
                        </button>{" "}
                        <button type="button" className="button is-small is-light" onClick={() => session.pause("no")}>
                            No
                        </button>
                    </>
                )}
            </div>
        );
    }
    if (!canVote) return null;
    return (
        <div className="bbb-pause-row">
            <button type="button" className="button is-small is-light" onClick={() => session.pause("ask")}>
                ⏸️ Ask for a pause
            </button>
            <small className="bbb-subtle">
                {voters.length > 1 ? ` Needs ${Math.ceil(voters.length / 2)} of the ${voters.length} players in the house to agree.` : " Just you in the house: it pauses straight away."}
            </small>
        </div>
    );
}

// Online: back after being away, halfway through a comp. The bot standing in finishes it; then it's theirs again.
export function BackAfterComp(props: { session: NetSession; controller: PlayerModeController }) {
    const { session, controller } = props;
    const status = useStatus(session);
    const me = status.localPlayerId;
    if (me === null || !status.started || !controller.isAutopilot(me) || !controller.compOn()) return null;
    return (
        <div className="bbb-turn-clock" role="status">
            🤖 You're back! You can't join a comp halfway through, so the bot playing for you finishes this one (it can't win it for
            you). You're in control again right after.
        </div>
    );
}
