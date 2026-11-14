import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Face, Panel, Subtle, Title } from "../ui/common";
import { chance, clamp, pick, Rand } from "./random";

// Tainted Wine: two glasses, one of them tainted. Whoever holds the glasses knows which is which. They hand one
// to the other houseguest on stage and keep the other, and they can say whatever they like about it: the truth, or
// a bluff. The houseguest can drink what they were given or trade glasses. Then both drink. Drink the tainted wine
// twice and you're out, and two more take the stage. Whoever drank the tainted glass pours next. Last one standing wins.

export const TAINTED_WINE_ID = "tainted-wine";
export const STRIKES_OUT = 2;

export const TAINTED_WINE_RULES =
    "Tainted Wine! Two houseguests take the stage, with two glasses, one of them tainted. Whoever pours knows which is which: they offer " +
    "one glass to the other and keep the other, and they can tell the truth about it or bluff. The other drinks what they're given or trades glasses. " +
    `Then both drink, and whoever drank the tainted glass pours next. Drink the tainted wine ${STRIKES_OUT} times and you're out, and the next two take the stage. ` +
    "Nobody goes up again until everyone has had a turn. Last one standing wins.";

// what the pourer says about the glass they're offering
export type Claim = "clean" | "tainted" | "none";

export const CLAIMS: { id: Claim; line: string }[] = [
    { id: "clean", line: "This one's clean. Drink up." },
    { id: "tainted", line: "I'll be honest: that one's tainted. Trade me." },
    { id: "none", line: "(Say nothing. Just smile.)" },
];

export function claimLine(claim: Claim): string {
    return CLAIMS.find((c) => c.id === claim)!.line;
}

// Nervous tells a bot can give away when it hands over the tainted glass (and, sometimes, when it doesn't).
const TELLS = [
    "can't stop smirking",
    "won't look you in the eye",
    "slides the glass over a little too fast",
    "is drumming their fingers on the table",
    "laughs a bit too loudly",
];

export interface Pour {
    offerTainted: boolean; // the glass handed over is the tainted one
    claim: Claim;
    tell?: string; // a bot pourer's tell, if it gave one away
}

// A bot pours: it usually hands over the tainted glass, and what it says gives nothing away on its own.
// Shakier bots sometimes give the game away with a tell.
export function botPour(skill: number, rand: Rand): Pour {
    const offerTainted = chance(rand, 0.6);
    const r = rand();
    const claim: Claim = r < 0.6 ? "clean" : r < 0.8 ? "tainted" : "none";
    const tellChance = offerTainted ? 0.45 * (1 - skill) : 0.12 * (1 - skill);
    return { offerTainted, claim, tell: chance(rand, tellChance) ? pick(rand, TELLS) : undefined };
}

// A bot decides whether to trade glasses. Reading people is a skill: sharper bots read the pourer better, and a
// sharp pourer is harder to read. A tell, when there is one, is hard to miss.
export function botSwaps(pour: Pour, drinkerSkill: number, pourerSkill: number, rand: Rand): boolean {
    let right = clamp(0.5 + 0.25 * (drinkerSkill - pourerSkill), 0.3, 0.7);
    if (pour.tell) right = Math.max(right, 0.75);
    const readsIt = chance(rand, right);
    // reading it right means ending up with the clean glass
    return readsIt === pour.offerTainted;
}

// Who a bot offers the glass to: whoever it likes least, leaning towards anyone one sip from going out.
export function botTarget(pourer: Houseguest, options: Houseguest[], strikes: { [id: number]: number }, rand: Rand): Houseguest {
    const keyed = options.map((hg) => ({ hg, key: pourer.relationships[hg.id] - 0.25 * (strikes[hg.id] || 0) + 0.3 * rand() }));
    keyed.sort((a, b) => a.key - b.key);
    return keyed[0].hg;
}

function Glass(props: { tainted?: boolean; known?: boolean; label: string; selected?: boolean; onClick?: () => void }) {
    const cls = props.known && props.tainted ? "is-tainted" : props.selected ? "is-poured" : "";
    return (
        <button type="button" className={`bbb-wine bbb-wine-glass ${cls}`} disabled={!props.onClick} onClick={props.onClick}>
            <span>{props.known && props.tainted ? "☠️" : "🍷"}</span>
            {props.label}
        </button>
    );
}

function strikesText(n: number): string {
    return n === 0 ? "no sips of the tainted wine yet" : `${n} of ${STRIKES_OUT} tainted sips`;
}

// The pourer's private screen: pick which glass to hand over, and what to say about it.
export function WinePour(props: {
    title: string;
    pourer: Houseguest;
    target: Houseguest;
    strikes: { [id: number]: number };
    onPour: (pour: Pour) => void;
}) {
    const [offerTainted, setOfferTainted] = React.useState<boolean | null>(null);
    const [claim, setClaim] = React.useState<Claim | null>(null);
    const [done, setDone] = React.useState(false);
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">🍷</div>
                <Title>Tainted Wine</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            <Face hg={props.target} caption={strikesText(props.strikes[props.target.id] || 0)} />
            <p>
                You're pouring for <b>{props.target.name}</b>. Only you know which glass is tainted. Tap the glass you'll hand them: you drink the
                other one.
            </p>
            <div className="bbb-wine-rack">
                <Glass label="Clean" known={true} selected={offerTainted === false} onClick={() => setOfferTainted(false)} />
                <Glass label="Tainted" known={true} tainted={true} selected={offerTainted === true} onClick={() => setOfferTainted(true)} />
            </div>
            {offerTainted !== null && (
                <Subtle>
                    {offerTainted ? "You're handing over the tainted glass." : "You're handing over the clean glass."} What do you tell them?
                </Subtle>
            )}
            {offerTainted !== null && (
                <div className="bbb-choices">
                    {CLAIMS.map((c) => (
                        <button
                            type="button"
                            key={c.id}
                            className={`button ${claim === c.id ? "is-link" : ""}`}
                            style={{ margin: 4, height: "auto", whiteSpace: "normal" }}
                            onClick={() => setClaim(c.id)}
                        >
                            “{c.line}”
                        </button>
                    ))}
                </div>
            )}
            <BigButton
                kind="danger"
                disabled={offerTainted === null || claim === null || done}
                onClick={() => {
                    setDone(true);
                    props.onPour({ offerTainted: offerTainted!, claim: claim! });
                }}
            >
                Hand over the glass
            </BigButton>
        </Panel>
    );
}

// The drinker's private screen: hear the pourer out, then drink or trade glasses.
export function WineDrink(props: {
    title: string;
    pourer: Houseguest;
    drinker: Houseguest;
    claim: Claim;
    tell?: string;
    strikes: { [id: number]: number };
    onDecide: (swap: boolean) => void;
}) {
    const [swapped, setSwapped] = React.useState(false);
    const [done, setDone] = React.useState(false);
    const mine = props.strikes[props.drinker.id] || 0;
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">🍷</div>
                <Title>Tainted Wine</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            <Face hg={props.pourer} caption={strikesText(props.strikes[props.pourer.id] || 0)} />
            <p>
                <b>{props.pourer.name}</b> hands you a glass and keeps the other.
            </p>
            <div className="bbb-quote">“{claimLine(props.claim)}”</div>
            {props.tell && (
                <Subtle>
                    👀 {props.pourer.name} {props.tell}.
                </Subtle>
            )}
            <div className="bbb-wine-rack">
                <Glass label={swapped ? `${props.pourer.name}'s pour` : "Offered"} selected={true} />
                <Glass label={swapped ? "Offered" : `${props.pourer.name}'s`} />
            </div>
            <Subtle>
                You're holding {swapped ? `the glass ${props.pourer.name} kept for themself` : "the glass you were offered"}. Trade back and forth as much
                as you like until you drink. You have {strikesText(mine)}
                {mine === STRIKES_OUT - 1 ? ": one more and you're out!" : "."}
            </Subtle>
            <div>
                <BigButton kind="light" disabled={done} onClick={() => setSwapped(!swapped)}>
                    🔄 Trade glasses
                </BigButton>
                <BigButton
                    kind="danger"
                    disabled={done}
                    onClick={() => {
                        setDone(true);
                        props.onDecide(swapped);
                    }}
                >
                    🍷 Drink
                </BigButton>
            </div>
        </Panel>
    );
}
