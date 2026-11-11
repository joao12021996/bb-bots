import React from "react";
import { Houseguest } from "../../model";
import { Answer, answerLabels, JuryQuestion, Move } from "../social/finale";
import { BigButton, Panel, Subtle, Title } from "./common";

// The final-two speech: tick the moves you'll own up to.
export function OwnMovesPrompt(props: { finalist: Houseguest; moves: Move[]; onDone: (ids: string[]) => void }) {
    const [owned, setOwned] = React.useState<string[]>([]);
    const [sent, setSent] = React.useState(false);
    const toggle = (id: string) => setOwned(owned.includes(id) ? owned.filter((o) => o !== id) : [...owned, id]);
    const section = (kind: "grudge" | "credit", title: string, hint: string) => {
        const list = props.moves.filter((m) => m.kind === kind);
        if (list.length === 0) return null;
        return (
            <div className="bbb-card-box">
                <div className="bbb-card-title">{title}</div>
                <p style={{ opacity: 0.75 }}>{hint}</p>
                {list.map((m) => (
                    <label key={m.id} className="bbb-move">
                        <input type="checkbox" checked={owned.includes(m.id)} onChange={() => toggle(m.id)} />
                        <span>{m.text}</span>
                    </label>
                ))}
            </div>
        );
    };
    return (
        <Panel>
            <Title>🎤 Final two speech</Title>
            <Subtle>
                {props.finalist.name}, this is your last chance to make your case to the jury. Which moves will you own up to? Jurors who
                judge the game respect a player who owns it. Jurors who vote with their hearts want honesty, but not bragging.
            </Subtle>
            {section("grudge", "😬 What the jury holds against you", "Dodge these, and the jurors who were on the other end of them will notice.")}
            {section("credit", "🏆 Your game", "Take credit for your game. Don't overdo it.")}
            <BigButton
                kind="success"
                disabled={sent}
                onClick={() => {
                    setSent(true);
                    props.onDone(owned);
                }}
            >
                Give my speech ({owned.length} owned)
            </BigButton>
        </Panel>
    );
}

// A juror asks a finalist a question.
export function JuryQuestionPrompt(props: { juror: Houseguest; finalist: Houseguest; question: JuryQuestion; onAnswer: (a: Answer) => void }) {
    const [sent, setSent] = React.useState(false);
    const labels = answerLabels(props.question);
    const pick = (a: Answer) => {
        if (sent) return;
        setSent(true);
        props.onAnswer(a);
    };
    return (
        <Panel>
            <Title>❓ A question from the jury</Title>
            <div className="bbb-asker">
                <img src={props.juror.imageURL} alt="" />
                <b>{props.juror.name}</b>
            </div>
            <div className="bbb-quote">“{props.question.question}”</div>
            <Subtle>{props.finalist.name}, how do you answer?</Subtle>
            <div>
                {(["own", "sorry", "deny"] as Answer[]).map((a) => (
                    <BigButton key={a} kind={a === "deny" ? "warning" : a === "own" ? "info" : "success"} disabled={sent} onClick={() => pick(a)}>
                        {labels[a]}
                    </BigButton>
                ))}
            </div>
        </Panel>
    );
}

// Finale night: the votes are read one at a time, until someone has enough to win.
export function JuryReveal(props: {
    finalists: Houseguest[];
    jurors: Houseguest[];
    votes: { jurorId: number; finalistId: number }[]; // in reading order
    onDone: () => void;
}) {
    const [read, setRead] = React.useState(0);
    const majority = Math.floor(props.votes.length / 2) + 1;
    const shown = props.votes.slice(0, read);
    const count = (id: number) => shown.filter((v) => v.finalistId === id).length;
    const winner = props.finalists.find((f) => count(f.id) >= majority);
    const juror = (id: number) => props.jurors.find((j) => j.id === id)!;
    const last = shown[shown.length - 1];
    return (
        <Panel>
            <Title>🗳️ Finale night</Title>
            <Subtle>
                {winner
                    ? `That's ${majority} votes.`
                    : read === 0
                    ? `The jury has voted. I'll now read the votes. ${majority} votes wins The Houseguests.`
                    : "Next vote…"}
            </Subtle>
            <div className="bbb-reveal-board">
                {props.finalists.map((f) => (
                    <div key={f.id} className={`bbb-reveal-finalist ${winner && winner.id === f.id ? "is-winner" : ""}`}>
                        <img src={f.imageURL} alt="" />
                        <b>{f.name}</b>
                        <div className="bbb-reveal-keys">
                            {shown
                                .filter((v) => v.finalistId === f.id)
                                .map((v) => (
                                    <span key={v.jurorId} title={juror(v.jurorId).name}>
                                        🔑
                                    </span>
                                ))}
                        </div>
                        <div className="bbb-reveal-count">{count(f.id)}</div>
                    </div>
                ))}
            </div>
            {last && !winner && (
                <div className="bbb-quote" key={read}>
                    🔑 {juror(last.jurorId).name}'s key: “I vote for {props.finalists.find((f) => f.id === last.finalistId)!.name} to win The Houseguests.”
                </div>
            )}
            {winner ? (
                <div>
                    <div className="bbb-winner">
                        <img src={winner.imageURL} alt="" />
                        <div>
                            <div className="bbb-winner-label">🏆 The winner of The Houseguests</div>
                            <div className="bbb-winner-name">{winner.name}</div>
                        </div>
                    </div>
                    {props.votes.length > read && <Subtle>The remaining {props.votes.length - read} votes won't be read.</Subtle>}
                    <BigButton onClick={props.onDone}>Continue</BigButton>
                </div>
            ) : (
                <BigButton kind="success" onClick={() => setRead(read + 1)}>
                    {read === 0 ? "Read the first vote" : "Read the next vote"}
                </BigButton>
            )}
        </Panel>
    );
}
