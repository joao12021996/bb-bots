import React from "react";
import { Houseguest } from "../../model";
import { Opponent } from "./compTypes";

// The cast on an endurance comp, drawn as little cartoons: everyone still in wobbles about (more as time goes on),
// and when someone goes, you see them fall. The player's own cartoon moves with what they're doing.
//   beam: each one stands on a beam, arms out, and tumbles off it.
//   wall: each one hangs off a wall by their hands, swinging, and drops onto the mat.

export interface CrowdMember {
    id: number;
    name: string;
    imageURL: string;
    you?: boolean;
    fellAt?: number; // still in: undefined
    lean?: number; // the player: -1 to 1, how far they're leaning or swinging right now
}

// Who's down at `seconds`: an online player still playing reports their time so far, so they're only down once done.
export function crowdOf(human: Houseguest, humanFellAt: number | undefined, humanLean: number, opponents: Opponent[], seconds: number): CrowdMember[] {
    const you: CrowdMember = { id: human.id, name: "You", imageURL: human.imageURL, you: true, fellAt: humanFellAt, lean: humanLean };
    return [
        you,
        ...opponents.map((o) => {
            const down = o.score < seconds && (!o.live || o.live.done);
            return { id: o.hg.id, name: o.hg.name, imageURL: o.hg.imageURL, fellAt: down ? o.score : undefined };
        }),
    ];
}

// each bot moves at its own pace, so they don't all sway in step
function motionOf(id: number) {
    const h = Math.abs(Math.sin(id * 12.9898 + 4.1) * 43758.5453) % 1;
    return { duration: 1.1 + h * 1.2, delay: -h * 3, dir: id % 2 === 0 ? 1 : -1 };
}

function Figure({ mode }: { mode: "beam" | "wall" }) {
    const beam = mode === "beam";
    return (
        <svg className="bbb-crowd-body" viewBox="0 0 40 64" width="40" height="64" aria-hidden="true">
            {beam ? (
                <>
                    <line x1="20" y1="24" x2="20" y2="46" />
                    <line x1="20" y1="30" x2="2" y2="25" />
                    <line x1="20" y1="30" x2="38" y2="25" />
                    <line x1="20" y1="46" x2="13" y2="63" />
                    <line x1="20" y1="46" x2="27" y2="63" />
                </>
            ) : (
                <>
                    <line x1="20" y1="34" x2="20" y2="52" />
                    <line x1="20" y1="37" x2="6" y2="2" />
                    <line x1="20" y1="37" x2="34" y2="2" />
                    <line x1="20" y1="52" x2="14" y2="63" />
                    <line x1="20" y1="52" x2="26" y2="63" />
                </>
            )}
        </svg>
    );
}

export function EnduranceCrowd(props: { mode: "beam" | "wall"; people: CrowdMember[]; seconds: number; unit?: string }) {
    const { mode, seconds } = props;
    // how hard the ones still in are wobbling: it builds up over the comp
    const amp = Math.min(1, 0.3 + seconds / 60);
    return (
        <div className={`bbb-crowd is-${mode}`}>
            {props.people.map((p) => {
                const m = motionOf(p.id);
                const down = p.fellAt !== undefined;
                const style: React.CSSProperties & { [k: string]: string | number } = {
                    "--dir": p.you ? (Math.sign(p.lean || 0) || 1) : m.dir,
                    "--amp": amp,
                };
                if (!down && !p.you) {
                    style.animationDuration = `${m.duration}s`;
                    style.animationDelay = `${m.delay}s`;
                }
                if (p.you && !down) {
                    const lean = Math.max(-1, Math.min(1, p.lean || 0));
                    style.animationName = "none";
                    style.transform = mode === "beam" ? `rotate(${lean * 28}deg)` : `translateX(${lean * 16}px) rotate(${-lean * 14}deg)`;
                }
                return (
                    <div key={p.id} className={`bbb-crowd-member${down ? " is-down" : ""}${p.you ? " is-you" : ""}`}>
                        <div className="bbb-crowd-stage">
                            {mode === "beam" ? <div className="bbb-crowd-beam" /> : <div className="bbb-crowd-wall" />}
                            <div className="bbb-crowd-mat" />
                            <div className={`bbb-crowd-fig${down ? " is-falling" : " is-moving"}`} style={style}>
                                <Figure mode={mode} />
                                <img src={p.imageURL} alt="" />
                                {down && <span className="bbb-crowd-dizzy">💫</span>}
                            </div>
                        </div>
                        <span className="bbb-crowd-name">{p.name}</span>
                        <small>{down ? `fell at ${p.fellAt!.toFixed(0)}s` : mode === "beam" ? "balancing" : "on the wall"}</small>
                    </div>
                );
            })}
        </div>
    );
}
