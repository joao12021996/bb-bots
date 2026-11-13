import React from "react";
import { Houseguest, nonEvictedHouseguests } from "../../model";
import { PlayerModeController } from "../playerModeController";
import { HohVisitor, RoomOutcome, VisitPitch } from "../social/hohRoom";
import { PITCH_REASONS, reasonLine } from "../social/pitch";
import { BigButton, Face, Grid, Panel, Subtle, Title, whenDone } from "./common";

interface HohRoomProps {
    controller: PlayerModeController;
    actorId: number;
}

function names(controller: PlayerModeController, ids: number[]): string {
    return ids.map((id) => controller.player(id).name).join(", ");
}

function Outcomes(props: { outcomes: RoomOutcome[] }) {
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

// What the visitor says, and the two ways the HoH can answer.
function visitorPitch(
    controller: PlayerModeController,
    v: HohVisitor,
): { line: string; yes: string; no?: string } {
    if (v.kind === "chat")
        return {
            line: "Congrats on the win! I just came up to see the room and hang out.",
            yes: "Thanks for coming up",
        };
    if (v.kind === "plea")
        return {
            line: "I'm not coming after you, I swear. Can you keep me off the block this week?",
            yes: "🛡️ You're safe",
            no: "No promises",
        };
    if (v.kind === "deal")
        return {
            line: "Let's make a deal. Keep me off the block this week, and if I win HoH next week, you're safe with me.",
            yes: "🤝 Deal",
            no: "No deal",
        };
    const target = controller.player(v.targetId).name;
    return {
        line: `If I were you, I'd put ${target} on the block. ${reasonLine(v.reason, target)}`,
        yes: `🎯 ${target} is going up`,
        no: "I'll think about it",
    };
}

// The HoH's side: whoever came up gets a one-on-one, one at a time.
export function HohRoomScreen(props: HohRoomProps) {
    const { controller } = props;
    const [outcomes, setOutcomes] = React.useState<RoomOutcome[]>([]);
    const [, rerender] = React.useState(0);
    const room = controller.room;
    if (!room) return null;
    const hoh = controller.player(room.hohId);
    const visitor = room.visitors[room.index];
    const cameIds = room.visitors.map((v) => v.fromId);
    const stayedAway = nonEvictedHouseguests(controller.gameState).filter(
        (hg) => hg.id !== hoh.id && !cameIds.includes(hg.id),
    );
    const allies = controller.allyIds(hoh.id);

    const answer = (accept: boolean) => {
        whenDone(controller.hohAnswer(accept), (outcome) => {
            if (outcome) setOutcomes((prev) => [outcome, ...prev]);
            rerender((n) => n + 1);
        });
    };

    // allies the HoH can ask about going up as a pawn (players answer before the nomination ceremony)
    const askable = allies.filter((id) => !controller.player(id).isEvicted);
    const asked = room.pawns || [];
    const pending = room.pawnPending || [];
    // the backdoor plan: anyone outside the HoH's alliances
    const backdoorable = nonEvictedHouseguests(controller.gameState).filter((hg) => hg.id !== hoh.id && !allies.includes(hg.id));
    const backdoor = controller.state.week.backdoor;
    const backdoorBox = (
        <div className="bbb-card-box">
            <div className="bbb-card-title">🚪 Backdoor plan</div>
            <Subtle>
                Nominate pawns, then put your real target up once the veto is used. Your alliances hear the plan, and an
                ally who wins the veto will use it to make room.
            </Subtle>
            <select
                className="input"
                aria-label="Backdoor target"
                value={backdoor === undefined ? "" : String(backdoor)}
                onChange={(e) => {
                    controller.planBackdoor(e.target.value === "" ? null : Number(e.target.value));
                    rerender((n) => n + 1);
                }}
            >
                <option value="">No backdoor plan</option>
                {backdoorable.map((hg) => (
                    <option key={hg.id} value={hg.id}>
                        {hg.name}
                    </option>
                ))}
            </select>
        </div>
    );
    const ask = (id: number) => {
        whenDone(controller.askPawn(id), (outcome) => {
            if (outcome) setOutcomes((prev) => [outcome, ...prev]);
            rerender((n) => n + 1);
        });
    };
    const pawnBox = askable.length > 0 && (
        <div className="bbb-card-box">
            <div className="bbb-card-title">🙋 Pawns</div>
            <Subtle>
                Ask an ally if they're okay going up as a pawn. Whatever they say, they'll remember it if they
                ever win HoH.
            </Subtle>
            <div>
                {askable.map((id) => {
                    const answer = asked.find((p) => p.id === id);
                    const name = controller.player(id).name;
                    return answer || pending.includes(id) ? (
                        <span key={id} className="bbb-chip">
                            {answer ? (answer.yes ? "🙋" : "🙅") : "⏳"} {name}
                        </span>
                    ) : (
                        <button
                            key={id}
                            type="button"
                            className="button is-small is-light"
                            onClick={() => ask(id)}
                        >
                            Ask {name}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    let body: JSX.Element;
    if (visitor) {
        const from = controller.player(visitor.fromId);
        const pitch = visitorPitch(controller, visitor);
        const read = controller.readOf(hoh.id, from.id);
        // bots open in their own voice
        const opener = controller.isHuman(from) ? "" : `${controller.say(from.id, "hohVisit", "room")} `;
        body = (
            <div>
                <Subtle>
                    Visitor {room.index + 1} of {room.visitors.length}
                </Subtle>
                <Face
                    hg={from}
                    caption={
                        <span
                            title={read ? `Your read on them, as of Day ${read.day}` : "No read on them yet"}
                        >
                            {controller.isHuman(from)
                                ? "🎮 Player"
                                : read
                                  ? `${read.emoji} ${read.label}`
                                  : "❓ No read"}
                            {allies.includes(from.id) ? " 🤝" : ""}
                            {room.promised.includes(from.id) ? " 🛡️" : ""}
                        </span>
                    }
                />
                <div className="bbb-quote">
                    “{opener}
                    {pitch.line}”
                </div>
                <div>
                    <BigButton kind="success" onClick={() => answer(true)}>
                        {pitch.yes}
                    </BigButton>
                    {pitch.no && (
                        <BigButton kind="light" onClick={() => answer(false)}>
                            {pitch.no}
                        </BigButton>
                    )}
                </div>
            </div>
        );
    } else {
        body = (
            <div>
                <Subtle>
                    {room.visitors.length === 0
                        ? "Nobody came up to see you this week."
                        : "That's everyone who wanted to talk. Time to make your nominations."}
                </Subtle>
                <BigButton kind="primary" onClick={controller.endHohRoom}>
                    On to the Nomination Ceremony
                </BigButton>
            </div>
        );
    }

    return (
        <Panel>
            <Title>👑 HoH room one-on-ones</Title>
            {controller.multiplayer && <Subtle>{hoh.name}'s turn</Subtle>}
            <Subtle>
                Before nominations, houseguests come up one by one to make their case. What you promise up
                here is remembered: break your word and it will cost you.
            </Subtle>
            {body}
            {pawnBox}
            {backdoorable.length > 0 && backdoorBox}
            <Outcomes outcomes={outcomes} />
            {(room.promised.length > 0 || room.targets.length > 0 || (!visitor && stayedAway.length > 0)) && (
                <div className="bbb-card-box">
                    <div className="bbb-card-title">📝 Where things stand</div>
                    {room.promised.length > 0 && (
                        <p>🛡️ You owe safety to: {names(controller, room.promised)}</p>
                    )}
                    {room.targets.length > 0 && (
                        <p>
                            🎯 You said you'd nominate:{" "}
                            {room.targets
                                .map(
                                    (t) =>
                                        `${controller.player(t.targetId).name} (told ${controller.player(t.fromId).name})`,
                                )
                                .join(", ")}
                        </p>
                    )}
                    {!visitor && stayedAway.length > 0 && (
                        <p>
                            🚪 Didn't come up:{" "}
                            {names(
                                controller,
                                stayedAway.map((hg) => hg.id),
                            )}
                        </p>
                    )}
                </div>
            )}
        </Panel>
    );
}

type VisitMode =
    | { kind: "menu" }
    | { kind: "pickTarget" }
    | { kind: "pickReason"; targetId: number }
    | { kind: "done"; outcome: RoomOutcome };

// A houseguest's side: go up to the HoH room with a pitch, or stay downstairs.
export function HohVisitScreen(props: HohRoomProps) {
    const { controller, actorId } = props;
    const [mode, setMode] = React.useState<VisitMode>({ kind: "menu" });
    const room = controller.room;
    if (!room) return null;
    const me = controller.player(actorId);
    const hoh = controller.player(room.hohId);
    const hohIsPlayer = controller.isHuman(hoh);
    const read = controller.readOf(me.id, hoh.id);
    const others = nonEvictedHouseguests(controller.gameState).filter(
        (hg) => hg.id !== me.id && hg.id !== hoh.id,
    );
    const allies = controller.allyIds(me.id);

    const go = (pitch: VisitPitch | null) => {
        whenDone(controller.hohVisit(actorId, pitch), (outcome) => {
            if (outcome) setMode({ kind: "done", outcome });
        });
    };

    const hohFace = (
        <Face
            hg={hoh}
            caption={
                <span title={read ? `Your read on them, as of Day ${read.day}` : "No read on them yet"}>
                    👑 {hohIsPlayer ? "🎮 Player" : read ? `${read.emoji} ${read.label}` : "❓ No read"}
                    {allies.includes(hoh.id) ? " 🤝" : ""}
                </span>
            }
        />
    );

    let body: JSX.Element;
    if (mode.kind === "menu") {
        body = (
            <div>
                {hohFace}
                <Subtle>
                    {hoh.name} is Head of House and is taking one-on-ones before nominations. Do you go up? A
                    good pitch can keep you off the block. A bad one can put you on {hoh.name}'s radar.
                </Subtle>
                {room.promised.includes(me.id) && (
                    <Subtle>
                        🛡️ {hoh.name} owes you safety this week from your deal. Whether they keep their word
                        is up to them.
                    </Subtle>
                )}
                <div>
                    <BigButton kind="info" onClick={() => go({ kind: "plea" })}>
                        🙏 Ask for safety
                    </BigButton>
                    <BigButton kind="success" onClick={() => go({ kind: "deal" })}>
                        🤝 Offer a deal
                    </BigButton>
                    {others.length > 0 && (
                        <BigButton kind="warning" onClick={() => setMode({ kind: "pickTarget" })}>
                            🗡️ Pitch a nominee
                        </BigButton>
                    )}
                </div>
                <Subtle>
                    A deal: {hoh.name} keeps you safe this week, and you keep them safe if you win HoH next
                    week.
                </Subtle>
                <BigButton kind="light" onClick={() => go(null)}>
                    Stay downstairs
                </BigButton>
            </div>
        );
    } else if (mode.kind === "pickTarget") {
        body = (
            <div>
                <Subtle>Who do you want {hoh.name} to nominate?</Subtle>
                <Grid>
                    {others.map((hg: Houseguest) => (
                        <Face
                            key={hg.id}
                            hg={hg}
                            small={true}
                            caption={allies.includes(hg.id) ? "🤝" : undefined}
                            onClick={() => setMode({ kind: "pickReason", targetId: hg.id })}
                        />
                    ))}
                </Grid>
                <BigButton kind="light" onClick={() => setMode({ kind: "menu" })}>
                    Back
                </BigButton>
            </div>
        );
    } else if (mode.kind === "pickReason") {
        const target = controller.player(mode.targetId);
        body = (
            <div>
                <Face hg={target} small={true} />
                <Subtle>
                    Why should {hoh.name} nominate {target.name}? Pick an argument {hoh.name} will believe.
                </Subtle>
                <div>
                    {PITCH_REASONS.map((r) => (
                        <BigButton
                            key={r.id}
                            kind="warning"
                            onClick={() => go({ kind: "target", targetId: target.id, reason: r.id })}
                        >
                            {r.label}
                        </BigButton>
                    ))}
                </div>
                <BigButton kind="light" onClick={() => setMode({ kind: "pickTarget" })}>
                    Back
                </BigButton>
            </div>
        );
    } else {
        const seen = room.wentUp.filter((id) => id !== me.id);
        body = (
            <div>
                {hohFace}
                <div className="bbb-log">
                    <p>
                        {mode.outcome.good ? "👍" : "👎"} {mode.outcome.text}
                    </p>
                </div>
                {!hohIsPlayer && (
                    <Subtle>
                        {seen.length > 0
                            ? `Also seen heading up to the HoH room: ${names(controller, seen)}.`
                            : "Nobody else was seen going up to the HoH room."}
                    </Subtle>
                )}
                <BigButton kind="primary" onClick={controller.continue}>
                    Continue
                </BigButton>
            </div>
        );
    }

    return (
        <Panel>
            <Title>🚪 The HoH room is open</Title>
            {controller.multiplayer && <Subtle>{me.name}'s turn</Subtle>}
            {body}
        </Panel>
    );
}
