import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Panel, Subtle, Title } from "../ui/common";
import { HidingSpot, hidingSpots } from "./iconicComps";
import { Rand, seededRand } from "./random";

// The tiebreaker: Hide the Veto. Everyone tied for first hides one veto card somewhere in the house, then the
// house is searched, one spot at a time. A card that's found knocks its owner out; the last card standing wins.
// Cards found together at the very end (hidden in the same spot) are still tied, and they hide again.

export interface VetoHide {
    id: number;
    spot: number; // index into the house's spots
}

// The house for one round of the tiebreaker: the same for everyone in it.
export function tiebreakHouse(seed: number): HidingSpot[] {
    return hidingSpots(seededRand(seed));
}

// Where a bot hides its card: smarter bots stay away from the obvious spots (but the search is chaos).
export function botHide(spots: HidingSpot[], skill: number, noise: Rand): number {
    const weights = spots.map((s) => Math.pow(4 - s.obvious, 0.5 + skill * 2.5));
    let roll = noise() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < spots.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }
    return spots.length - 1;
}

// Who won: the card found last. Found together at the end, they're still tied.
export function hideOutcome(spots: HidingSpot[], hides: VetoHide[]): { winnerId?: number; tied: number[] } {
    const last = Math.max(...hides.map((h) => spots[h.spot].searchedAt));
    const tied = hides.filter((h) => spots[h.spot].searchedAt === last).map((h) => h.id);
    return tied.length === 1 ? { winnerId: tied[0], tied } : { tied };
}

const header = (title: string) => (
    <div className="bbb-comp-header">
        <div className="bbb-comp-emoji">🫣</div>
        <Title>Tiebreaker: Hide the Veto</Title>
        <Subtle>{title}</Subtle>
    </div>
);

const looks = (s: HidingSpot) => "🔍".repeat(s.obvious);

export function HideTiebreakPlay(props: {
    title: string;
    player: Houseguest;
    tied: Houseguest[];
    spots: HidingSpot[];
    moreToPlay: boolean;
    onHide: (spot: number) => void;
}) {
    const [chosen, setChosen] = React.useState<number | null>(null);
    const [sent, setSent] = React.useState(false);
    const hide = () => {
        if (sent || chosen === null) return;
        setSent(true);
        props.onHide(chosen);
    };
    return (
        <Panel>
            {header(props.title)}
            <p className="bbb-rules">
                It's a tie between {props.tied.map((hg) => hg.name).join(", ")}! Each of you hides one veto card somewhere in the house, then the house gets
                searched. The first card found loses: whoever's card is found last wins. 🔍🔍🔍 is the first place anyone looks; 🔍 is somewhere nobody
                thinks of. But the search is chaos.
            </p>
            {props.moreToPlay && <Subtle>Keep your spot a secret.</Subtle>}
            <Title>{props.player.name}, where do you hide your card?</Title>
            <div className="bbb-spots">
                {props.spots.map((s, i) => (
                    <button type="button" key={s.name} className={`bbb-spot ${i === chosen ? "is-mine" : ""}`} disabled={sent} onClick={() => setChosen(i)}>
                        <b>{s.name}</b>
                        <span>
                            {looks(s)} {i === chosen ? "· your card" : ""}
                        </span>
                    </button>
                ))}
            </div>
            <BigButton kind="success" disabled={chosen === null || sent} onClick={hide}>
                Hide it here
            </BigButton>
        </Panel>
    );
}

export function HideTiebreakResults(props: {
    title: string;
    spots: HidingSpot[];
    tied: Houseguest[];
    hides: VetoHide[];
    winnerId?: number; // none: still tied, and they hide again
    sealed?: boolean; // a secret Head of House week: nobody sees who won
    humanIds: number[];
    onDone: () => void;
}) {
    const { spots, hides, winnerId } = props;
    const at = (h: VetoHide) => spots[h.spot].searchedAt;
    // the search stops once it's decided: everyone else's card found (or, still tied, the last ones found together)
    const others = hides.filter((h) => h.id !== winnerId);
    const stopAt = Math.max(...(winnerId !== undefined ? others : hides).map(at));
    const [searched, setSearched] = React.useState(0);
    const done = searched >= stopAt;
    React.useEffect(() => {
        if (done || props.sealed) return;
        const t = setTimeout(() => setSearched((n) => n + 1), searched === 0 ? 900 : 650);
        return () => clearTimeout(t);
    }, [searched, done, props.sealed]);

    if (props.sealed) {
        return (
            <Panel>
                {header(props.title)}
                <Title>🕶️ The tiebreaker has been decided, in secret.</Title>
                <BigButton onClick={props.onDone}>{winnerId !== undefined ? "Continue" : "Hide again"}</BigButton>
            </Panel>
        );
    }
    const byId = (id: number) => props.tied.find((hg) => hg.id === id)!;
    const you = (id: number) => props.humanIds.includes(id) && props.humanIds.length === 1;
    const winner = winnerId !== undefined ? byId(winnerId) : null;
    // the cards, in the order they're found (the winner's last)
    const order = [...hides].sort((a, b) => at(a) - at(b) || (a.id === winnerId ? 1 : 0) - (b.id === winnerId ? 1 : 0));
    const stillTied = winnerId === undefined ? hides.filter((h) => at(h) === stopAt).map((h) => h.id) : [];
    return (
        <Panel>
            {header(props.title)}
            <Subtle>
                {done ? "The search is over." : `Searching the house… ${searched} of ${spots.length} spots`}
            </Subtle>
            <div className="bbb-answers">
                {order.map((h) => {
                    const found = at(h) <= searched;
                    const hg = byId(h.id);
                    const out = found && !stillTied.includes(h.id);
                    return (
                        <div key={h.id} className={`bbb-answer ${out ? "is-wrong" : done ? "is-right" : ""} ${you(h.id) ? "is-you" : ""}`}>
                            <img src={hg.imageURL} alt="" />
                            <b>{you(h.id) ? "You" : hg.name}</b>
                            <span className="bbb-answer-text">
                                {found ? `found ${spots[h.spot].name.toLowerCase()}` : done ? `never found: ${spots[h.spot].name.toLowerCase()}` : "still hidden"}
                            </span>
                            <span>{out ? "❌" : done ? "✅" : "🫣"}</span>
                        </div>
                    );
                })}
            </div>
            <div className="bbb-spots">
                {spots.map((s) => (
                    <div key={s.name} className={`bbb-spot ${s.searchedAt <= searched ? "is-searched" : ""}`}>
                        <b>{s.name}</b>
                        <span>
                            {looks(s)} {s.searchedAt <= searched ? "· searched" : ""}
                        </span>
                    </div>
                ))}
            </div>
            {done &&
                (winner ? (
                    <div className="bbb-winner">
                        <img src={winner.imageURL} alt="" />
                        <div>
                            <div className="bbb-winner-label">🏆 Winner</div>
                            <div className="bbb-winner-name">
                                {winner.name}
                                {you(winner.id) ? " (you!)" : ""}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bbb-winner">
                        <div>
                            <div className="bbb-winner-label">⚖️ Still tied!</div>
                            <div className="bbb-winner-name">{stillTied.map((id) => byId(id).name).join(" vs ")}</div>
                            <div>Their cards were found together. They hide again.</div>
                        </div>
                    </div>
                ))}
            {done ? (
                <BigButton onClick={props.onDone}>{winner ? "Continue" : "Hide again"}</BigButton>
            ) : (
                <BigButton kind="light" onClick={() => setSearched(stopAt)}>
                    Skip to the end
                </BigButton>
            )}
        </Panel>
    );
}
