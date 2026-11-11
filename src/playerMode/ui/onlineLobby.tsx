import React from "react";
import { getById } from "../../model";
import { pushToMainContentStream } from "../../subjects/subjects";
import { Screens } from "../../components/topbar/topBar";
import { actorOf, PlayerModeController, PlayerSave, Prompt } from "../playerModeController";
import { NetSession, NetStatus, SessionOptions, setActiveSession } from "../net/netSession";
import { cleanRoomCode, joinLink, newRoomCode, openRoom } from "../net/room";
import { readOnlineSave } from "../save/serialize";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";
import { launch, showSeasonSoFar } from "./playerSetup";

// ---------- starting and joining ----------

const sessionOptions: SessionOptions = {
    launch: (controller: PlayerModeController, save: PlayerSave, fresh: boolean) => {
        showSeasonSoFar(save, fresh);
        launch(controller);
    },
};

// The host's side: open a room for a season that's been set up, and wait in the lobby for everyone.
export async function startHosting(save: PlayerSave) {
    const code = newRoomCode();
    const room = await openRoom(code);
    const session = NetSession.host(room, code, save, sessionOptions);
    setActiveSession(session);
    pushToMainContentStream(<OnlineLobby session={session} />, Screens.Ingame);
}

export function showJoinScreen(code?: string) {
    pushToMainContentStream(<JoinOnline initialCode={code} />, Screens.Ingame);
}

// A `?join=CODE` link: open the join screen with the code filled in.
export function joinCodeFromUrl(): string | null {
    try {
        const code = new URLSearchParams(window.location.search).get("join");
        return code ? cleanRoomCode(code) : null;
    } catch (e) {
        return null;
    }
}

function useStatus(session: NetSession): NetStatus {
    const [status, setStatus] = React.useState(session.status$.value);
    React.useEffect(() => {
        const sub = session.status$.subscribe(setStatus);
        return () => sub.unsubscribe();
    }, [session]);
    return status;
}

function CopyButton(props: { text: string; label: string }) {
    const [copied, setCopied] = React.useState(false);
    return (
        <button
            type="button"
            className="button is-light is-small"
            onClick={() => {
                try {
                    navigator.clipboard.writeText(props.text).then(() => setCopied(true));
                } catch (e) {
                    // no clipboard: the code is on screen anyway
                }
            }}
        >
            {copied ? "✓ Copied" : props.label}
        </button>
    );
}

// ---------- the lobby ----------

export function OnlineLobby(props: { session: NetSession }) {
    const { session } = props;
    const status = useStatus(session);
    const mine = status.localPlayerId;
    const connected = (peerId?: string) => !!peerId && (peerId === status.selfId || status.peers.includes(peerId));
    const claimed = status.slots.filter((s) => connected(status.claims[s.id])).length;
    const watching = status.peers.length + 1 - claimed;
    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">Online season</div>
                <Title>{status.isHost ? "Invite your friends" : "You're in!"}</Title>
                <Subtle>
                    Everyone plays on their own phone or computer. {status.isHost && "Keep this tab open while you play: your device runs the show."}
                </Subtle>
            </div>
            <div className="bbb-room-code">
                <span>Room code</span>
                <b>{status.code}</b>
                <div className="bbb-room-actions">
                    <CopyButton text={status.code} label="📋 Copy code" />
                    <CopyButton text={joinLink(status.code)} label="🔗 Copy invite link" />
                </div>
            </div>
            {status.slots.length === 0 ? (
                <Subtle>Connecting to the room… If nothing happens, check the code, and that the host has the lobby open.</Subtle>
            ) : (
                <>
                    <Subtle>{mine === null ? "Who are you? Tap your houseguest." : "Waiting for everyone to pick who they are."}</Subtle>
                    <Grid>
                        {status.slots.map((slot) => {
                            const holder = status.claims[slot.id];
                            const isMine = mine === slot.id;
                            const taken = connected(holder) && !isMine;
                            return (
                                <Face
                                    key={slot.id}
                                    hg={slot}
                                    selected={isMine}
                                    dim={taken}
                                    onClick={taken || isMine ? undefined : () => session.claim(slot.id)}
                                    caption={isMine ? <b>🎮 You</b> : taken ? <span>🟢 joined</span> : <span>tap to play</span>}
                                />
                            );
                        })}
                    </Grid>
                    <Subtle>
                        {claimed}/{status.slots.length} players here
                        {watching > 0 && ` · ${watching} device${watching === 1 ? "" : "s"} still picking`}
                    </Subtle>
                </>
            )}
            {status.isHost ? (
                <>
                    {claimed < status.slots.length && (
                        <Subtle>You can start now: you'll play for anyone who hasn't joined, until they do.</Subtle>
                    )}
                    <BigButton kind="success" disabled={mine === null} onClick={() => session.start()}>
                        Enter the house
                    </BigButton>
                </>
            ) : (
                status.slots.length > 0 && <Subtle>⏳ The host starts the season once everyone's in.</Subtle>
            )}
        </Panel>
    );
}

// ---------- joining ----------

export function JoinOnline(props: { initialCode?: string }) {
    const saved = readOnlineSave();
    const [code, setCode] = React.useState(props.initialCode || "");
    const [session, setSession] = React.useState<NetSession | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const join = async (target: string, rejoin: boolean) => {
        setBusy(true);
        setError(null);
        try {
            const room = await openRoom(target);
            const s = NetSession.join(room, target, sessionOptions, rejoin && saved ? { playerId: saved.playerId, json: saved.json } : undefined);
            setActiveSession(s);
            setSession(s);
        } catch (e) {
            console.error(e);
            setError("Couldn't connect. Check your internet connection and try again.");
        }
        setBusy(false);
    };

    if (session) return <OnlineLobby session={session} />;
    const valid = code.length === 6;
    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">Online season</div>
                <Title>Join a game</Title>
                <Subtle>Enter the room code from the host's screen.</Subtle>
            </div>
            <form
                className="bbb-add-yourself"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (valid) join(code, !!saved && saved.code === code);
                }}
            >
                <input
                    className="input bbb-code-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="ABC123"
                    value={code}
                    onChange={(e) => setCode(cleanRoomCode(e.target.value))}
                />
                <button type="submit" className="button is-warning" disabled={!valid || busy}>
                    {busy ? "Connecting…" : "Join"}
                </button>
            </form>
            {saved && saved.code !== code && (
                <p style={{ marginTop: 12 }}>
                    <button type="button" className="button is-light" disabled={busy} onClick={() => join(saved.code, true)}>
                        ↩ Rejoin your last online season ({saved.code})
                    </button>
                </p>
            )}
            {error && <Subtle style={{ color: "#f87171" }}>{error}</Subtle>}
        </Panel>
    );
}

// ---------- in the game ----------

// The strip at the top of an online game: the room code and who's connected.
export function OnlineBar(props: { session: NetSession; controller: PlayerModeController }) {
    const status = useStatus(props.session);
    const me = status.localPlayerId;
    return (
        <div className="bbb-online-bar">
            <span>
                🌐 <b>{status.code}</b>
                {status.isHost && " · 👑 host"}
            </span>
            <span className="bbb-online-players">
                {status.slots.map((slot) => {
                    const on = props.session.isConnected(slot.id);
                    return (
                        <span key={slot.id} className={on ? "is-on" : ""} title={on ? `${slot.name} is connected` : `${slot.name} isn't connected`}>
                            <img src={getById(props.controller.gameState, slot.id).imageURL} alt="" />
                            {slot.id === me ? "You" : slot.name}
                        </span>
                    );
                })}
            </span>
            {status.notice && <span className="bbb-online-notice">{status.notice}</span>}
        </div>
    );
}

function activity(prompt: Prompt): string {
    switch (prompt.kind) {
        case "compPlay":
            return `is playing the ${prompt.comp.name}`;
        case "tiebreak":
            return "is answering the tiebreaker";
        case "social":
            return "is having their social time";
        case "alliance":
            return "is meeting with their alliances";
        case "hohRoom":
            return "is hearing people out in the HoH room";
        case "hohVisit":
            return "is deciding whether to go up to the HoH room";
        case "speech":
            return "is getting ready to speak";
        case "choose":
            return `is deciding: ${prompt.title}`;
        case "ownMoves":
        case "juryQuestion":
            return "is facing the jury";
        case "winePour":
        case "wineDrink":
            return "is making their move in Tainted Wine";
        default:
            return "is making a move";
    }
}

// Shown while another player makes a decision.
export function WaitingFor(props: { session: NetSession; controller: PlayerModeController; prompt: Prompt }) {
    useStatus(props.session); // re-render when people come and go
    const actor = actorOf(props.prompt);
    if (actor === null) return null;
    const hg = getById(props.controller.gameState, actor);
    const away = !props.session.isConnected(actor);
    return (
        <Panel>
            <div className="bbb-handoff">
                <div className="bbb-handoff-icon bbb-waiting-pulse">⏳</div>
                <img src={hg.imageURL} alt="" />
                <Title>{hg.name}</Title>
                <Subtle>{activity(props.prompt)}…</Subtle>
                {away && <Subtle>{hg.name} isn't connected right now, so the host is playing for them.</Subtle>}
            </div>
        </Panel>
    );
}
