import React from "react";
import { getById, PlayerProfile } from "../../model";
import { cast$, pushToMainContentStream } from "../../subjects/subjects";
import { Screens } from "../../components/topbar/topBar";
import { actorOf, Difficulty, PlayerModeController, PlayerSave, Prompt } from "../playerModeController";
import { NetSession, NetStatus, SessionOptions, setActiveSession } from "../net/netSession";
import { cleanRoomCode, joinLink, newRoomCode, openRoom, parseInvite } from "../net/room";
import { buildOnlineSeason, defaultSetup, houseOf, maxHouse, minHouse } from "../net/lobby";
import { inlineBlobImages, readOnlineSave } from "../save/serialize";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";
import { cartoonFor } from "../../cartoon/cartoon";
import { FaceEditor } from "./faceEditor";
import { castSource, launch, showSeasonSoFar, Stepper } from "./playerSetup";

// ---------- starting and joining ----------

const sessionOptions: SessionOptions = {
    launch: (controller: PlayerModeController, save: PlayerSave, fresh: boolean) => {
        showSeasonSoFar(save, fresh);
        launch(controller);
    },
};

// What the host builds the season from (only the host's device has it).
let hostCast: { cast: PlayerProfile[]; hohPlaysVeto: boolean } | null = null;

// The host's side: open a room right away. The house starts full of bots; friends take their places.
export async function hostOnlineGame(): Promise<void> {
    const source = castSource();
    // uploaded portraits only work on this device: inline them so everyone can see them
    const cast = source.cast.map((hg) => ({ ...hg }));
    await inlineBlobImages(cast);
    hostCast = { cast, hohPlaysVeto: source.hohPlaysVeto };
    const code = newRoomCode();
    const room = await openRoom(code);
    const cards = cast.map((hg) => ({ name: hg.name, imageURL: hg.imageURL }));
    const session = NetSession.hostLobby(room, code, defaultSetup(cast.length), cards, sessionOptions);
    setActiveSession(session);
    pushToMainContentStream(<OnlineLobby session={session} />, Screens.Ingame);
}

// The start screen's button: shows any trouble opening the room instead of failing silently.
export function HostOnlineButton(props: { disabled?: boolean }) {
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    return (
        <>
            <button
                className="button is-warning"
                disabled={props.disabled || busy}
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        await hostOnlineGame();
                    } catch (e) {
                        console.error(e);
                        setError("Couldn't open a room. Check your internet connection and try again.");
                        setBusy(false);
                    }
                }}
            >
                {busy ? "Opening a room…" : "Host a game"}
            </button>
            {error && <span style={{ color: "#f87171", flexBasis: "100%" }}>{error}</span>}
        </>
    );
}

// autoJoin: came from an invite link, so go straight in
export function showJoinScreen(code?: string, autoJoin: boolean = false) {
    pushToMainContentStream(<JoinOnline initialCode={code} autoJoin={autoJoin} />, Screens.Ingame);
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

// Sends the invite link through the phone's share sheet (WhatsApp, Messages…), or copies it.
function ShareLinkButton(props: { code: string }) {
    const [copied, setCopied] = React.useState(false);
    const link = joinLink(props.code);
    const canShare = typeof navigator !== "undefined" && typeof (navigator as any).share === "function";
    return (
        <button
            type="button"
            className="button is-warning"
            onClick={async () => {
                if (canShare) {
                    try {
                        await (navigator as any).share({ title: "Houseguest Bots", text: "Join my Houseguest Bots season!", url: link });
                        return;
                    } catch (e) {
                        // cancelled, or not allowed: copy it instead
                    }
                }
                try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                } catch (e) {
                    // no clipboard: the link is on screen to copy by hand
                }
            }}
        >
            {copied ? "✓ Link copied: send it to your friends" : canShare ? "📤 Share invite link" : "🔗 Copy invite link"}
        </button>
    );
}

// How friends get in: a link that drops them straight into the game (the code still works too).
function RoomCode(props: { code: string }) {
    const link = joinLink(props.code);
    return (
        <div className="bbb-room-code">
            <span>Send friends this link: opening it puts them straight in the game</span>
            <input className="input bbb-invite-link" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="bbb-room-actions">
                <ShareLinkButton code={props.code} />
            </div>
            <span className="bbb-room-fallback">
                or join from the start screen with code <b>{props.code}</b> <CopyButton text={props.code} label="📋" />
            </span>
        </div>
    );
}

// your name for online games, remembered on this device (never required: storage can be unavailable)
const NAME_KEY = "bbb-online-name";

function loadName(): string {
    try {
        return window.localStorage.getItem(NAME_KEY) || "";
    } catch (e) {
        return "";
    }
}

function saveName(name: string) {
    try {
        window.localStorage.setItem(NAME_KEY, name);
    } catch (e) {
        // fine: it just won't be remembered
    }
}

// a photo, shrunk to a small data URL so it can be sent to everyone
async function photoURLFromBlob(url: string): Promise<string> {
    const hg = { imageURL: url };
    await inlineBlobImages([hg], 128);
    return hg.imageURL.startsWith("data:") ? hg.imageURL : "";
}

// ---------- the lobby ----------

export function OnlineLobby(props: { session: NetSession }) {
    const status = useStatus(props.session);
    if (status.setup) return <LobbyRoom session={props.session} status={status} />;
    return <SeatPicker session={props.session} status={status} />;
}

// Before the season: the house, full of bots, and everyone joining takes a bot's place.
function LobbyRoom(props: { session: NetSession; status: NetStatus }) {
    const { session, status } = props;
    const setup = status.setup!;
    const cast = status.cast;
    const mine = status.mySeat;
    const [name, setName] = React.useState(() => (mine ? mine.name : loadName()));
    const [photo, setPhoto] = React.useState<string | null>(mine && mine.castIndex === null ? mine.imageURL : null);
    const [starting, setStarting] = React.useState(false);
    const [startError, setStartError] = React.useState<string | null>(null);
    const [designing, setDesigning] = React.useState(false);
    const house = houseOf(setup, cast);
    const players = setup.seats.length;
    const bots = house.length - players;
    const connected = (peerId: string) => peerId === status.selfId || status.peers.includes(peerId);

    const joinAsMe = () => {
        const clean = name.trim();
        if (!clean) return;
        saveName(clean);
        session.takeSeat({ name: clean, imageURL: photo || cartoonFor(clean), castIndex: null });
    };

    const joinAs = (castIndex: number) => {
        const card = cast[castIndex];
        session.takeSeat({ name: card.name, imageURL: card.imageURL, castIndex });
    };

    const start = async () => {
        if (!hostCast) return;
        setStarting(true);
        setStartError(null);
        try {
            const { save, claims } = buildOnlineSeason(setup, hostCast.cast, cast$.value.options || {}, hostCast.hohPlaysVeto);
            session.startSeason(save, claims);
        } catch (e) {
            console.error(e);
            setStartError("Couldn't start the season. Try again.");
            setStarting(false);
        }
    };

    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">Online season</div>
                <Title>{status.isHost ? "Your house is open" : "You're in the lobby"}</Title>
                <Subtle>
                    Everyone plays on their own phone or computer. Each friend who joins takes a bot's place.
                    {status.isHost && " Keep this tab open while you play: your device runs the show."}
                </Subtle>
            </div>
            <RoomCode code={status.code} />

            <div className="bbb-lobby-me">
                {mine ? (
                    <div className="bbb-lobby-seated">
                        <img src={mine.imageURL} alt="" />
                        <div>
                            <b>You're in as {mine.name}</b>
                            <br />
                            <a onClick={() => session.leaveSeat()}>Leave the house</a>
                        </div>
                    </div>
                ) : (
                    <>
                        <b>Join the house</b>
                        <form
                            className="bbb-add-yourself"
                            onSubmit={(e) => {
                                e.preventDefault();
                                joinAsMe();
                            }}
                        >
                            <input
                                className="input"
                                type="text"
                                maxLength={24}
                                placeholder="Your name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <button type="button" className="button is-light" title="Design your avatar" onClick={() => setDesigning(!designing)}>
                                {photo ? <img className="bbb-lobby-avatar" src={photo} alt="" /> : "🎨"}
                            </button>
                            <button type="submit" className="button is-warning" disabled={!name.trim()}>
                                🎮 Join
                            </button>
                        </form>
                        {designing && (
                            <FaceEditor
                                original={{ name: name.trim() || "You", imageURL: cartoonFor(name.trim() || "You") }}
                                current={{ name: name.trim() || "You", imageURL: photo || cartoonFor(name.trim() || "You") }}
                                onSave={async (look) => {
                                    setName(look.name);
                                    // a photo goes to the other devices inline
                                    setPhoto(look.imageURL.startsWith("blob:") ? (await photoURLFromBlob(look.imageURL)) || null : look.imageURL);
                                    setDesigning(false);
                                }}
                                onCancel={() => setDesigning(false)}
                            />
                        )}
                        <Subtle>…or tap a houseguest below to play as them.</Subtle>
                    </>
                )}
                {status.notice && <Subtle style={{ color: "#fbbf24" }}>{status.notice}</Subtle>}
            </div>

            {status.isHost ? (
                <HostSettings session={session} status={status} />
            ) : (
                <Subtle>
                    <b>{house.length}</b> houseguests · {setup.difficulty} difficulty
                    {setup.powers === "surprise" && " · secret powers"}
                    {setup.battleBack && " · battle back"}
                    {setup.hideSkills && " · skill randomizer"}
                </Subtle>
            )}

            <div className="bbb-setup-summary">
                🎮 <b>{players}</b> player{players === 1 ? "" : "s"} · 🤖 <b>{bots}</b> bot{bots === 1 ? "" : "s"}
            </div>
            <Grid>
                {house.map((spot) =>
                    spot.kind === "player" ? (
                        <Face
                            key={`p-${spot.seat.peerId}`}
                            hg={spot.seat}
                            selected={spot.seat.peerId === status.selfId}
                            caption={
                                spot.seat.peerId === status.selfId ? (
                                    <b>🎮 You</b>
                                ) : (
                                    <span>{connected(spot.seat.peerId) ? "🎮 player" : "⚪ away"}</span>
                                )
                            }
                        />
                    ) : (
                        <Face
                            key={`b-${spot.castIndex}`}
                            hg={spot.card}
                            onClick={() => joinAs(spot.castIndex)}
                            caption={<span>🤖 tap to play</span>}
                        />
                    )
                )}
            </Grid>

            {status.isHost ? (
                <>
                    {!mine && <Subtle>Join the house yourself before you start.</Subtle>}
                    {startError && <Subtle style={{ color: "#f87171" }}>{startError}</Subtle>}
                    <BigButton kind="success" disabled={!mine || starting || !hostCast} onClick={start}>
                        {starting ? "Starting…" : `Start the season (${players} player${players === 1 ? "" : "s"})`}
                    </BigButton>
                </>
            ) : (
                <Subtle>⏳ The host starts the season when everyone's in.</Subtle>
            )}
        </Panel>
    );
}

function HostSettings(props: { session: NetSession; status: NetStatus }) {
    const { session, status } = props;
    const setup = status.setup!;
    const min = minHouse(setup);
    const max = maxHouse(setup, status.cast.length);
    return (
        <div className="bbb-lobby-settings">
            <div className="bbb-steppers">
                <Stepper label="🏠 Houseguests" value={setup.size} min={min} max={max} onChange={(size) => session.updateSetup({ size })} />
            </div>
            <div className="bbb-setting">
                <b>🎚️ Difficulty</b>
                <div className="bbb-segmented">
                    {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
                        <button
                            key={d}
                            type="button"
                            className={setup.difficulty === d ? "is-active" : ""}
                            onClick={() => session.updateSetup({ difficulty: d })}
                        >
                            {d === "easy" ? "Easy" : d === "normal" ? "Normal" : "Hard"}
                        </button>
                    ))}
                </div>
            </div>
            <div className="bbb-setting">
                <b>🤫 Secret powers</b>
                <div className="bbb-segmented">
                    {(["off", "surprise"] as const).map((m) => (
                        <button key={m} type="button" className={setup.powers === m ? "is-active" : ""} onClick={() => session.updateSetup({ powers: m })}>
                            {m === "off" ? "Off" : "Surprise me"}
                        </button>
                    ))}
                </div>
            </div>
            <label className="bbb-toggle">
                <input type="checkbox" checked={!!setup.battleBack} onChange={(e) => session.updateSetup({ battleBack: e.target.checked })} />
                <span>
                    🔙 <b>Battle Back</b>: right before the jury starts, everyone who's been evicted plays one comp, and the winner comes back.
                </span>
            </label>
            <label className="bbb-toggle">
                <input type="checkbox" checked={setup.hideSkills} onChange={(e) => session.updateSetup({ hideSkills: e.target.checked })} />
                <span>
                    🎲 <b>Skill randomizer</b>: secret, random Social and Comp scores for everyone, revealed when the season ends.
                </span>
            </label>
        </div>
    );
}

// After the season started: a returning (or late) device picks which player it is.
function SeatPicker(props: { session: NetSession; status: NetStatus }) {
    const { session, status } = props;
    const mine = status.localPlayerId;
    const connected = (peerId?: string) => !!peerId && (peerId === status.selfId || status.peers.includes(peerId));
    const claimed = status.slots.filter((s) => connected(status.claims[s.id])).length;
    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">Online season</div>
                <Title>{status.started ? "The season's already on" : "Connecting…"}</Title>
                <Subtle>Everyone plays on their own phone or computer.</Subtle>
            </div>
            <RoomCode code={status.code} />
            {status.slots.length === 0 ? (
                <Subtle>Connecting to the room… If nothing happens, check the code, and that the host has the game open.</Subtle>
            ) : (
                <>
                    <Subtle>{mine === null ? "Which player are you? Tap yourself to jump back in." : "Loading the season…"}</Subtle>
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
                                    caption={isMine ? <b>🎮 You</b> : taken ? <span>🟢 playing</span> : <span>tap if this is you</span>}
                                />
                            );
                        })}
                    </Grid>
                    <Subtle>
                        {claimed}/{status.slots.length} players connected
                    </Subtle>
                </>
            )}
        </Panel>
    );
}

// ---------- joining ----------

export function JoinOnline(props: { initialCode?: string; autoJoin?: boolean }) {
    const saved = readOnlineSave();
    const [text, setText] = React.useState(props.initialCode || "");
    const code = parseInvite(text);
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

    // opened from an invite link: join right away (rejoining if it's the season this device was playing)
    const autoJoined = React.useRef(false);
    React.useEffect(() => {
        if (!props.autoJoin || autoJoined.current || code.length !== 6) return;
        autoJoined.current = true;
        join(code, !!saved && saved.code === code);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (session) return <OnlineLobby session={session} />;
    const valid = code.length === 6;
    if (props.autoJoin && valid && !error) {
        return (
            <Panel>
                <div className="bbb-hero small">
                    <div className="bbb-hero-kicker">Online season</div>
                    <Title>Joining the game…</Title>
                    <Subtle>Connecting to your friends. This takes a few seconds.</Subtle>
                </div>
            </Panel>
        );
    }
    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">Online season</div>
                <Title>Join a game</Title>
                <Subtle>Paste the invite link your host sent you, or type the room code from their screen.</Subtle>
            </div>
            <form
                className="bbb-add-yourself"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (valid) join(code, !!saved && saved.code === code);
                }}
            >
                <input
                    className="input"
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="Invite link or code (ABC123)"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" className="button is-warning" disabled={!valid || busy}>
                    {busy ? "Connecting…" : "Join"}
                </button>
            </form>
            {text.trim() && !valid && <Subtle>That doesn't look like an invite link or a 6-letter code.</Subtle>}
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
                {status.isHost && " · 👑 host"} <CopyButton text={joinLink(status.code)} label="🔗 invite link" />
            </span>
            <span className="bbb-online-players">
                {status.slots.map((slot) => {
                    const on = props.session.isConnected(slot.id);
                    const bot = props.controller.isAutopilot(slot.id);
                    const title = on ? `${slot.name} is connected` : bot ? `${slot.name} isn't connected: a bot is playing for them` : `${slot.name} isn't connected`;
                    return (
                        <span key={slot.id} className={on ? "is-on" : ""} title={title}>
                            <img src={getById(props.controller.gameState, slot.id).imageURL} alt="" />
                            {slot.id === me ? "You" : slot.name}
                            {bot && " 🤖"}
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
        case "hideTiebreak":
            return "is hiding their veto card";
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
        case "memoryDuel":
            return "is turning over a card in the Memory Duel";
        default:
            return "is making a move";
    }
}

// Shown while several players decide at the same time, once this device's player has (or isn't asked).
export function WaitingOnPlayers(props: {
    session: NetSession;
    controller: PlayerModeController;
    title: string;
    waitingOn: number[];
    children?: React.ReactNode; // shown below, e.g. a comp's standings so far
}) {
    useStatus(props.session); // re-render when people come and go
    const me = props.session.localPlayerId;
    return (
        <Panel>
            <div className="bbb-handoff">
                <div className="bbb-handoff-icon bbb-waiting-pulse">⏳</div>
                <Title>{props.title}</Title>
                <Subtle>Waiting for {props.waitingOn.length === 1 ? "one player" : `${props.waitingOn.length} players`}…</Subtle>
                <div className="bbb-waiting-on">
                    {props.waitingOn.map((id) => {
                        const hg = getById(props.controller.gameState, id);
                        const away = !props.session.isConnected(id);
                        return (
                            <span key={id} title={away ? `${hg.name} isn't connected: if they don't come back soon, a bot plays for them` : undefined}>
                                <img src={hg.imageURL} alt="" />
                                {id === me ? "You" : hg.name}
                                {away && " (away)"}
                            </span>
                        );
                    })}
                </div>
            </div>
            {props.children}
        </Panel>
    );
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
                {away && <Subtle>{hg.name} isn't connected right now. If they don't come back soon, a bot 🤖 takes over for them.</Subtle>}
            </div>
        </Panel>
    );
}
