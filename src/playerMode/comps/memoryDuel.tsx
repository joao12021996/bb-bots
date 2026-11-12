import React from "react";
import { Houseguest } from "../../model";
import { Panel, Subtle, Title } from "../ui/common";
import { sample, seededRand, shuffled } from "./random";

// Memory Duel: Concentration, head to head. Two houseguests share one board of face-down cards and take turns
// turning them over, one card at a time, two per turn. A pair is theirs, and they go again; a miss and the cards
// turn back, and it's the other one's turn. Whoever has more pairs once the board is clear wins the duel.
// The winner stays on to face the next challenger; the loser is out. The last one standing wins.

export const MEMORY_DUEL_ID = "memory-duel";
export const DUEL_PAIRS = 7; // an odd number of pairs: a duel can't end in a tie

export const MEMORY_DUEL_RULES =
    "🃏 Memory Duel! Everyone faces off one on one, at Concentration. Take turns turning over cards, one at a time, two a turn: " +
    `find a pair and it's yours, and you go again. Miss, and they turn back over. Most of the ${DUEL_PAIRS} pairs wins the duel. ` +
    "The winner stays on to face the next challenger; the loser is out. Watch your rival's cards too: the last one standing wins.";

const FACES = ["🍕", "🎸", "👑", "🔑", "🐍", "💎", "🎲", "🧸", "🍩", "🚀", "🌵", "🎩", "🦩", "🍉"];

// A duel's board, face down: the same for everyone, from the duel's seed.
export function duelDeck(seed: number): string[] {
    const rand = seededRand(seed);
    const faces = sample(rand, FACES, DUEL_PAIRS);
    return shuffled(rand, [...faces, ...faces]);
}

// One turn: the cards turned over (two, or one if the duel ended), and who turned them.
export interface DuelTurn {
    by: number;
    cards: number[];
}

export type Matched = { [card: number]: number }; // card -> who found the pair

const mix = (...ns: number[]) => ns.reduce((h, n) => (Math.imul(h ^ n, 0x5bd1e995) + 0x9e3779b9) >>> 0, 0x12345);

// The card a bot turns over next. It remembers each card it has seen turned over with a chance that grows with
// its skill and fades with time (decided from the seed, so a replay picks the same cards), takes a pair it
// remembers, and otherwise turns over a card nobody has seen yet.
export function botFlip(deck: string[], matched: Matched, seen: number[], open: number | null, skill: number, seed: number): number {
    const known = new Map<number, string>();
    seen.forEach((card, k) => {
        const age = seen.length - 1 - k;
        const memory = (0.45 + 0.5 * skill) * Math.pow(0.93 + 0.05 * skill, age);
        if (matched[card] === undefined && card !== open && seededRand(mix(seed, card, k))() < memory) known.set(card, deck[card]);
    });
    const hidden = deck.map((_, i) => i).filter((i) => matched[i] === undefined && i !== open);
    const unseen = hidden.filter((i) => !seen.includes(i));
    const rand = seededRand(mix(seed, seen.length, 77));
    const anyOf = (list: number[]) => list[Math.floor(rand() * list.length)];
    const entries = Array.from(known.entries());
    if (open === null) {
        // a pair it remembers: take it
        const pair = entries.find(([card, face]) => entries.some(([other, f]) => other !== card && f === face));
        return pair ? pair[0] : anyOf(unseen.length ? unseen : hidden);
    }
    // the second card: the first one's twin, if it remembers where that is
    const twin = entries.find(([card, face]) => card !== open && face === deck[open]);
    if (twin) return twin[0];
    // just seen the first card turned over: a new card might be its twin (no point turning over a known non-match)
    const fresh = unseen.filter((i) => !known.has(i));
    return anyOf(fresh.length ? fresh : unseen.length ? unseen : hidden.filter((i) => !known.has(i)).length ? hidden.filter((i) => !known.has(i)) : hidden);
}

const REPLAY_MS = 1300;

// The board: whose turn it is, the score, and the cards. `recent`: the turns since this player last looked,
// replayed one at a time (face up for a moment) before anyone can turn a card over.
export function MemoryDuelBoard(props: {
    title: string;
    players: Houseguest[]; // the two in this duel
    actorId: number; // whose turn it is
    deck: string[];
    matched: Matched;
    open: number[]; // turned over this turn, so far
    scores: { [id: number]: number };
    recent: DuelTurn[];
    note?: string; // e.g. "Duel 2 of 5"
    watching?: boolean; // online: someone else's turn
    onFlip?: (card: number) => void;
    onDone?: () => void; // the duel is over
}) {
    const { deck, open, recent, players } = props;
    const [replay, setReplay] = React.useState(0);
    const [sent, setSent] = React.useState(false);
    React.useEffect(() => {
        if (replay >= recent.length) return;
        const t = setTimeout(() => setReplay((r) => r + 1), REPLAY_MS);
        return () => clearTimeout(t);
    }, [replay, recent.length]);
    const replaying = replay < recent.length ? recent[replay] : null;
    // during the replay: the board as it was then (pairs found later aren't shown yet)
    const later = new Set(recent.slice(replay).flatMap((t) => (isPair(deck, t) ? t.cards : [])));
    const matched: Matched = {};
    Object.keys(props.matched).forEach((c) => {
        if (!replaying || !later.has(+c) || replaying.cards.includes(+c)) matched[+c] = props.matched[+c];
    });
    const scores: { [id: number]: number } = { ...props.scores };
    if (replaying) recent.slice(replay + 1).forEach((t) => isPair(deck, t) && (scores[t.by] = (scores[t.by] || 0) - 1));
    const shown = new Set(replaying ? replaying.cards : open);
    const byId = (id: number) => players.find((p) => p.id === id)!;
    const actor = byId(props.actorId);
    const over = !!props.onDone;
    const canFlip = !props.watching && !replaying && !sent && !!props.onFlip;
    const flip = (i: number) => {
        if (!canFlip || matched[i] !== undefined || open.includes(i)) return;
        setSent(true);
        props.onFlip!(i);
    };
    const winner = over ? [...players].sort((a, b) => (props.scores[b.id] || 0) - (props.scores[a.id] || 0))[0] : null;
    let status: string;
    if (replaying)
        status = `${byId(replaying.by).name} turned over ${replaying.cards.map((c) => deck[c]).join(" and ")}${
            replaying.cards.length < 2 ? "." : isPair(deck, replaying) ? ": a pair!" : ": no match."
        }`;
    else if (winner) status = `${winner.name} wins the duel, ${props.scores[winner.id] || 0} pairs to ${DUEL_PAIRS - (props.scores[winner.id] || 0)}!`;
    else if (canFlip)
        status =
            open.length === 0
                ? `${actor.name}, your turn: turn over a card.`
                : `${actor.name}, turn over one more. Where's the other ${deck[open[0]]}?`;
    else status = `${actor.name}'s turn…`;
    const turnId = replaying ? replaying.by : over ? -1 : props.actorId;
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">🃏</div>
                <Title>Memory Duel</Title>
                <Subtle>
                    {props.title}
                    {props.note ? ` · ${props.note}` : ""}
                </Subtle>
            </div>
            <div className="bbb-duel-score">
                {players.map((p, k) => (
                    <div key={p.id} className={`bbb-duel-player is-p${k}` + (p.id === turnId ? " is-turn" : "") + (winner && winner.id === p.id ? " is-winner" : "")}>
                        <img src={p.imageURL} alt="" />
                        <b>{p.name}</b>
                        <span className="bbb-duel-pairs">{scores[p.id] || 0}</span>
                    </div>
                ))}
            </div>
            <p className="bbb-duel-status" aria-live="polite">
                {status}
            </p>
            <div className="bbb-duel-cards">
                {deck.map((face, i) => {
                    const owner = matched[i];
                    const up = owner !== undefined || shown.has(i);
                    const side = owner !== undefined ? players.findIndex((p) => p.id === owner) : -1;
                    return (
                        <button
                            type="button"
                            key={i}
                            aria-label={up ? face : `Card ${i + 1}`}
                            className={
                                "bbb-duel-card" +
                                (up ? " is-up" : "") +
                                (owner !== undefined && !shown.has(i) ? ` is-matched is-p${side}` : "") +
                                (shown.has(i) ? " is-open" : "")
                            }
                            disabled={!canFlip || up}
                            onClick={() => flip(i)}
                        >
                            <span>{up ? face : ""}</span>
                        </button>
                    );
                })}
            </div>
            <div className="bbb-duel-actions">
                {replaying && (
                    <button type="button" className="button is-small is-light" onClick={() => setReplay(recent.length)}>
                        Skip ahead
                    </button>
                )}
                {over && !replaying && (
                    <button type="button" className="button is-primary" onClick={props.onDone}>
                        Continue
                    </button>
                )}
            </div>
        </Panel>
    );
}

function isPair(deck: string[], turn: DuelTurn): boolean {
    return turn.cards.length === 2 && deck[turn.cards[0]] === deck[turn.cards[1]];
}
