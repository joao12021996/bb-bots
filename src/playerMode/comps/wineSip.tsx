import React from "react";
import { cartoonURL, Expression, lookFromURL, skinColor } from "../../cartoon/cartoon";
import { Houseguest } from "../../model";

// Tainted Wine, after every glass: the two on stage clink glasses and drink, drawn as their own cartoons. Whoever
// drank the clean glass grins; whoever drank the tainted one turns green and foams at the mouth, and if that was
// their last sip, they fake their own death. Plays once (it can be replayed), like a little GIF.

export interface Sip {
    pourerId: number;
    drinkerId: number;
    victimId: number; // who drank the tainted glass
    out: boolean; // and it was their last sip
}

type Role = "clean" | "tainted" | "out";

// bubbles of foam around the mouth, as a share of the picture: [left %, top %, size px, delay s]
const FOAM: [number, number, number, number][] = [
    [50, 70, 13, 0],
    [44, 71, 9, 0.12],
    [56, 71, 10, 0.2],
    [47, 74, 8, 0.3],
    [53, 75, 9, 0.38],
    [41, 73, 6, 0.45],
    [59, 74, 7, 0.5],
];
// and the ones that dribble down the chin, again and again
const DRIPS: [number, number, number, number][] = [
    [46, 73, 6, 0.3],
    [53, 74, 7, 0.9],
    [50, 74, 5, 1.5],
];

function Glass(props: { hand: string }) {
    return (
        <svg className="bbb-sip-glass" viewBox="0 0 30 46" aria-hidden="true">
            <path d="M4 2 L26 2 Q27 16 15 21 Q3 16 4 2 Z" fill="rgba(255,255,255,0.35)" stroke="#1f1720" strokeWidth="1.4" />
            <path className="bbb-sip-wine" d="M5.5 8 L24.5 8 Q24 16 15 19.5 Q6 16 5.5 8 Z" fill="#9f1239" />
            <path d="M15 21 L15 40 M8 42 L22 42" stroke="#1f1720" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="15" cy="31" r="5.5" fill={props.hand} stroke="#1f1720" strokeWidth="1.2" />
        </svg>
    );
}

function Figure(props: { hg: Houseguest; side: "left" | "right"; role: Role }) {
    const { hg, side, role } = props;
    const look = lookFromURL(hg.imageURL);
    const face = (e?: Expression) => (look ? cartoonURL(look, { bare: true, expression: e }) : hg.imageURL);
    const react: Expression = role === "clean" ? "happy" : "sick";
    return (
        <div className={`bbb-sip-fig is-${side} is-${role}${look ? "" : " is-photo"}`}>
            <div className="bbb-sip-body">
                <img className="bbb-sip-face" src={face()} alt={hg.name} />
                <img className="bbb-sip-face is-react" src={face(react)} alt="" />
                {role === "out" && <img className="bbb-sip-face is-dead" src={face("dead")} alt="" />}
                {role !== "clean" && (
                    <div className="bbb-sip-foam" aria-hidden="true">
                        {FOAM.map(([x, y, size, delay], i) => (
                            <span key={i} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${2.5 + delay}s` }} />
                        ))}
                        {DRIPS.map(([x, y, size, delay], i) => (
                            <span key={`d${i}`} className="is-drip" style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${2.7 + delay}s` }} />
                        ))}
                    </div>
                )}
                <div className="bbb-sip-hand">
                    <Glass hand={look ? skinColor(look) : "#e8ad7e"} />
                </div>
            </div>
            <div className="bbb-sip-name">{hg.name}</div>
        </div>
    );
}

export function WineSip(props: { sip: Sip; pourer: Houseguest; drinker: Houseguest }) {
    const { sip } = props;
    const [take, setTake] = React.useState(0);
    const role = (id: number): Role => (id !== sip.victimId ? "clean" : sip.out ? "out" : "tainted");
    const victim = sip.victimId === props.pourer.id ? props.pourer : props.drinker;
    return (
        <div className="bbb-sip-wrap">
            <div className="bbb-sip" key={take}>
                <Figure hg={props.pourer} side="left" role={role(props.pourer.id)} />
                <span className="bbb-sip-clink" aria-hidden="true">
                    ✨
                </span>
                <Figure hg={props.drinker} side="right" role={role(props.drinker.id)} />
            </div>
            <div className="bbb-sip-caption">
                {sip.out ? `☠️ ${victim.name} drank the tainted wine again, and is out!` : `🤢 ${victim.name} drank the tainted wine!`}{" "}
                <button type="button" className="bbb-sip-replay" onClick={() => setTake(take + 1)}>
                    ↻ Replay
                </button>
            </div>
        </div>
    );
}
