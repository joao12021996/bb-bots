import React from "react";
import { Expression } from "../../cartoon/cartoon";
import { isCartoon, toonURL } from "../../cartoon/toon";
import { Houseguest } from "../../model";
import { CompKind } from "./compTypes";

// The comps' little "videos", drawn with everyone's own cartoon:
// - AnswerBoards: after a question, everyone stands in a row holding a board with their answer face down. The
//   boards flip one by one, then the right answer is in: the boards go green or red and the faces grin or sulk.
// - ResultsVideo: before the standings, everyone lines up. Results come in from last place up (a podium rises
//   under each of them, or, in an endurance comp, they drop off the wall), and the winner gets the crown.
// Pure CSS animation: nothing waits on it, so a click on Continue never has to.

type CssVars = React.CSSProperties & { [v: string]: string | number };

const FLIP_START = 0.3; // s before the boards flip, all of them at once
const FLIP_TIME = 0.45; // s the flip takes

export interface BoardRow {
    id: number;
    name: string;
    imageURL: string;
    you?: boolean;
    correct?: boolean; // undefined: not known (they haven't played yet, or there's no right or wrong)
    answer?: string;
}

// How someone takes it: a face and a move. Not always the same one, so a row of right answers isn't a row of clones;
// picked from who they are and which question it is, so it holds still while the screen redraws.
export type Move = "hop" | "wiggle" | "spin" | "nod" | "shake" | "slump" | "tremble" | "jump";
export interface Reaction {
    face: Expression;
    move: Move;
}
const GOOD: Reaction[] = [
    { face: "happy", move: "hop" },
    { face: "laugh", move: "wiggle" },
    { face: "wink", move: "nod" },
    { face: "smug", move: "nod" },
    { face: "laugh", move: "spin" },
    { face: "happy", move: "wiggle" },
];
const BAD: Reaction[] = [
    { face: "sad", move: "slump" },
    { face: "shocked", move: "tremble" },
    { face: "angry", move: "shake" },
    { face: "cry", move: "slump" },
    { face: "shocked", move: "shake" },
];
// the winner's, and only the winner's
export const WINNER: Reaction = { face: "ecstatic", move: "jump" };
const DOWN = new Set<Expression>(["sad", "cry", "angry", "shocked", "sick", "dead"]);

export function pickReaction(good: boolean, id: number, salt = 0): Reaction {
    const list = good ? GOOD : BAD;
    const h = Math.abs((id + 1) * 7919 + (salt + 1) * 104729) % 9973;
    return list[h % list.length];
}

// When the boards are all turned and the answer's in, for a row of `n`: the delay before the verdict.
// Everyone's answer is up together, then a hold of 1 to 3 seconds (a different one each question, to keep you
// guessing) before the right answer is in.
export function boardsDoneAt(salt = 0): number {
    const hold = 1 + (Math.abs((salt + 1) * 7919) % 201) / 100;
    return FLIP_START + FLIP_TIME + hold;
}

export function Toon(props: { hg: { name: string; imageURL: string }; react?: Reaction; className?: string }) {
    const { hg, react } = props;
    return (
        <div
            className={`bbb-toon${isCartoon(hg) ? "" : " is-photo"}${react ? ` do-${react.move}` : ""} ${props.className || ""}`}
        >
            <img src={toonURL(hg)} alt={hg.name} />
            {react && (
                <img
                    className={`is-react is-${react.face}${DOWN.has(react.face) ? " is-down" : ""}`}
                    src={toonURL(hg, react.face)}
                    alt=""
                />
            )}
        </div>
    );
}

// `salt`: which question it is, so the same person doesn't take every one the same way
export function AnswerBoards(props: { rows: BoardRow[]; salt?: number }) {
    const done = boardsDoneAt(props.salt);
    return (
        <div className="bbb-boards" style={{ "--done": `${done}s` } as CssVars}>
            {props.rows.map((r) => {
                const state =
                    r.answer === undefined
                        ? "is-blank"
                        : r.correct === true
                          ? "is-right"
                          : r.correct === false
                            ? "is-wrong"
                            : "";
                return (
                    <div
                        key={r.id}
                        className={`bbb-board-fig ${state} ${r.you ? "is-you" : ""}`}
                        style={{ "--flip": `${FLIP_START}s` } as CssVars}
                    >
                        <Toon
                            hg={r}
                            react={r.correct === undefined ? undefined : pickReaction(r.correct, r.id, props.salt)}
                        />
                        <div className="bbb-board">
                            <div className="bbb-board-card">
                                <div className="bbb-board-back">?</div>
                                <div className="bbb-board-front">
                                    {r.answer !== undefined ? r.answer : "not yet"}
                                </div>
                            </div>
                        </div>
                        <b className="bbb-board-name">{r.you ? "You" : r.name}</b>
                    </div>
                );
            })}
        </div>
    );
}

const STEP = 0.5; // s between results
const START = 0.5;

// How long the results take to come in, for `n` competitors: the standings show after that.
export function videoLength(n: number): number {
    return START + n * STEP + 0.6;
}

export function ResultsVideo(props: {
    kind: CompKind;
    participants: Houseguest[];
    ranked: { id: number; score: number }[]; // best first
    format: (score: number) => string;
    tiedIds?: number[];
    humanIds: number[];
    onSkip?: () => void;
}) {
    const { ranked } = props;
    const n = ranked.length;
    const tied = props.tiedIds && props.tiedIds.length > 1 ? props.tiedIds : null;
    const winnerId = tied ? null : ranked[0].id;
    const wall = props.kind === "endurance";
    // standing in the order they came in, so the line-up gives nothing away
    const lineup = props.participants.filter((hg) => ranked.some((r) => r.id === hg.id));
    const end = START + n * STEP;
    return (
        <div
            className={`bbb-video ${wall ? "is-wall" : "is-podium"}`}
            style={{ "--end": `${end}s` } as CssVars}
            aria-hidden="true"
        >
            {wall && <div className="bbb-video-wall" />}
            <div className="bbb-video-row">
                {lineup.map((hg) => {
                    const place = ranked.findIndex((r) => r.id === hg.id); // 0: first
                    const from = n - 1 - place; // 0: comes in first (last place)
                    const top = winnerId === hg.id || (tied !== null && tied.includes(hg.id));
                    // the winner is over the moon; whoever's last (or off the wall) isn't; second place is pleased
                    const react: Reaction | undefined =
                        winnerId === hg.id
                            ? WINNER
                            : top
                              ? pickReaction(true, hg.id, n)
                              : wall || (place === n - 1 && n > 2)
                                ? pickReaction(false, hg.id, n)
                                : place === 1 && n > 3
                                  ? pickReaction(true, hg.id, n + 1)
                                  : undefined;
                    const height = n > 1 ? 14 + Math.round((70 * (n - 1 - place)) / (n - 1)) : 60;
                    return (
                        <div
                            key={hg.id}
                            className={`bbb-video-fig${top ? " is-top" : ""}${props.humanIds.includes(hg.id) ? " is-you" : ""}`}
                            style={
                                {
                                    "--at": `${top ? end : START + from * STEP}s`,
                                    "--h": `${height}px`,
                                } as CssVars
                            }
                        >
                            <div className="bbb-video-score">
                                {tied && top ? "⚖️ " : ""}
                                {props.format(ranked[place].score)}
                            </div>
                            {winnerId === hg.id && <div className="bbb-video-crown">👑</div>}
                            <Toon hg={hg} react={react} />
                            {!wall && (
                                <div className="bbb-video-podium">
                                    <span>{place + 1}</span>
                                </div>
                            )}
                            <div className="bbb-video-name">{hg.name}</div>
                        </div>
                    );
                })}
            </div>
            {winnerId !== null && (
                <div className="bbb-video-confetti">
                    {Array.from({ length: 14 }, (_, i) => (
                        <span
                            key={i}
                            style={
                                {
                                    left: `${(i * 37) % 100}%`,
                                    animationDelay: `calc(var(--end) + ${(i % 5) * 0.08}s)`,
                                } as CssVars
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
