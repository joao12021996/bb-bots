import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Panel, Subtle, Title } from "../ui/common";
import { pickReaction, Toon, WINNER } from "./compVideo";
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

// what each spot looks like in the search cartoon
const SPOT_ICON: { [name: string]: string } = {
    "Under the couch cushions": "🛋️",
    "In the fridge": "🥛",
    "Inside the washing machine": "🧺",
    "Behind the house wall": "🧱",
    "In the cereal box": "🥣",
    "Under a mattress": "🛏️",
    "In the hot tub filter": "🛁",
    "Inside a pillowcase": "🛌",
    "Behind the toilet": "🚽",
    "In the freezer, under the ice": "🧊",
    "In the pool table pocket": "🎱",
    "Taped under the kitchen table": "🍽️",
};

// The search, as a cartoon: the whole house, every spot in it, and someone tearing each one apart in turn (one of
// the others in the tie, never whoever hid a card there). A card that turns up pops out of its spot; down below,
// everyone in the tie sweats it out, and takes it their own way when their card is found (or isn't).
function SearchScene(props: {
    spots: HidingSpot[];
    tied: Houseguest[];
    hides: VetoHide[];
    searched: number;
    done: boolean;
    winnerId?: number;
    stillTied: number[];
    you: (id: number) => boolean;
}) {
    const { spots, tied, hides, searched, done } = props;
    const byId = (id: number) => tied.find((hg) => hg.id === id)!;
    const cardsAt = (i: number) => hides.filter((h) => h.spot === i).map((h) => byId(h.id));
    const now = spots.findIndex((s) => s.searchedAt === searched);
    // whoever's searching this spot: someone whose card isn't in it, taking turns
    let searcher: Houseguest | null = null;
    if (now >= 0) {
        const here = new Set(cardsAt(now).map((hg) => hg.id));
        const free = tied.filter((hg) => !here.has(hg.id));
        const pool = free.length ? free : tied;
        searcher = pool[(searched - 1) % pool.length];
    }
    return (
        <div className="bbb-search" aria-hidden="true">
            <div className="bbb-search-house">
                {spots.map((s, i) => {
                    const cards = cardsAt(i);
                    const isNow = i === now && !done;
                    const searchedHere = s.searchedAt <= searched;
                    const state = isNow ? "is-now" : searchedHere ? "is-done" : "";
                    return (
                        <div key={s.name} className={`bbb-search-spot ${state} ${searchedHere && cards.length ? "has-card" : ""}`}>
                            <div className="bbb-search-icon">{SPOT_ICON[s.name] || "📦"}</div>
                            <div className="bbb-search-label">{s.name}</div>
                            {isNow && searcher && (
                                <div className="bbb-search-searcher" key={searched}>
                                    <Toon hg={searcher} />
                                    <span className="bbb-search-glass">🔍</span>
                                </div>
                            )}
                            {searchedHere && cards.length > 0 && (
                                <div className="bbb-search-card">
                                    🃏
                                    {cards.map((hg) => (
                                        <img key={hg.id} src={hg.imageURL} alt="" />
                                    ))}
                                </div>
                            )}
                            {searchedHere && !cards.length && !isNow && <div className="bbb-search-empty">nothing</div>}
                        </div>
                    );
                })}
            </div>
            <div className="bbb-search-row">
                {tied
                    .filter((hg) => hides.some((h) => h.id === hg.id))
                    .map((hg) => {
                        const h = hides.find((x) => x.id === hg.id)!;
                        const found = spots[h.spot].searchedAt <= searched;
                        const out = found && !props.stillTied.includes(hg.id);
                        const react = !done
                            ? found
                                ? pickReaction(false, hg.id, h.spot)
                                : undefined
                            : props.winnerId === hg.id
                              ? WINNER
                              : pickReaction(!out, hg.id, h.spot);
                        const sweating = !found && !done;
                        return (
                            <div
                                key={`${hg.id}-${found}-${done}`}
                                className={`bbb-search-fig${out ? " is-out" : ""}${sweating ? " is-sweating" : ""}${props.you(hg.id) ? " is-you" : ""}`}
                            >
                                {props.winnerId === hg.id && done && <div className="bbb-search-crown">👑</div>}
                                <Toon hg={hg} react={react} />
                                <b>{props.you(hg.id) ? "You" : hg.name}</b>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

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
    sealed?: boolean; // a secret Head of Household week: nobody sees who won
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
            <SearchScene
                spots={spots}
                tied={props.tied}
                hides={hides}
                searched={searched}
                done={done}
                winnerId={winnerId}
                stillTied={stillTied}
                you={you}
            />
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
