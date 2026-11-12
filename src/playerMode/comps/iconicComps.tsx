import React from "react";
import { GameState, getById, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { DAY_PART, dayLabel, dayOf } from "../days";
import { BigButton, Face, Grid, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { AnswerReveal, Keypad, Reveal, revealRows, rightSoFar, sumSoFar, useQuizClock } from "./compUi";
import { answerQuestion, chance, clamp, gaussian, pick, Rand, randInt, sample, seededRand, shuffled } from "./random";

// Comps in the style of the show's best-known formats: the oracle that sends you hunting for answers,
// hiding your veto somewhere in the house, comic book covers, counting, the days quiz and the face morph.

// right answers always beat speed: 100 per right answer, plus up to 99 for being quick
function quizScore(correct: number, seconds: number, perSecond: number = 0.66): number {
    return correct * 100 + Math.max(0, 99 - seconds * perSecond);
}

function formatQuiz(s: number): string {
    return `${Math.floor(s / 100)} right`;
}

// ---------------- OTEV ----------------

const OTEV_ROUNDS = 5;
const OTEV_SECONDS = 15; // per question
const OTEV_PENALTY = 5; // a wrong answer

interface OtevQuestion {
    prompt: string;
    answerId: number;
    field: Houseguest[];
}

function otevFacts(gs: GameState, history: WeekRecord[]): { prompt: string; answerId: number }[] {
    const facts: { prompt: string; answerId: number }[] = [];
    history.forEach((w) => {
        if (w.hohId !== undefined)
            facts.push({ prompt: `the Head of House crowned on ${dayLabel(gs, w.week, DAY_PART.hoh)}`, answerId: w.hohId });
        if (w.povId !== undefined)
            facts.push({ prompt: `the winner of the veto on ${dayLabel(gs, w.week, DAY_PART.veto)}`, answerId: w.povId });
        if (w.evictedIds.length > 0)
            facts.push({ prompt: `the houseguest evicted on ${dayLabel(gs, w.week, DAY_PART.eviction)}`, answerId: w.evictedIds[0] });
        if (w.blockbusterId !== undefined)
            facts.push({ prompt: `the houseguest who won the Last Chance comp on ${dayLabel(gs, w.week, DAY_PART.blockbuster)}`, answerId: w.blockbusterId });
    });
    return facts;
}

function otevQuestions(gs: GameState, history: WeekRecord[], rand: Rand): OtevQuestion[] {
    return sample(rand, otevFacts(gs, history), OTEV_ROUNDS).map((f) => ({ ...f, field: shuffled(rand, gs.houseguests) }));
}

function Otev(props: CompProps) {
    const [questions] = React.useState(() => otevQuestions(props.gameState, props.history, props.rand));
    const [index, setIndex] = React.useState(0);
    const [total, setTotal] = React.useState(0); // seconds, penalties included
    const [wrong, setWrong] = React.useState<number[]>([]);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [questionStart, setQuestionStart] = React.useState(() => clock.now());
    const [, tick] = React.useState(0);
    const { finish, report, recordAnswer } = props;
    const elapsed = (clock.now() - questionStart) / 1000;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 250);
        return () => clearInterval(t);
    }, []);

    // the question is over: found it (or time ran out). `seconds` includes penalties.
    const done = (seconds: number, found: boolean) => {
        if (reveal) return;
        const q = questions[index];
        const sum = total + seconds;
        setTotal(sum);
        report(-(sum + (questions.length - index - 1) * (OTEV_SECONDS + OTEV_PENALTY)));
        if (recordAnswer) recordAnswer(index, found, Math.round(seconds * 10) / 10);
        clock.pause();
        const who = getById(props.gameState, q.answerId).name;
        setReveal({
            index,
            verdict: found ? `🗿 Found ${who} in ${seconds.toFixed(1)}s` : "⏰ Time's up!",
            correctText: who,
            rows: revealRows(props, index, { correct: found, answer: `${seconds.toFixed(1)}s` }, (ok, pick) =>
                typeof pick === "number" ? `${pick.toFixed(1)}s` : ok ? "found it" : "ran out of time"
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= questions.length) finish(-total);
        else {
            setIndex(index + 1);
            setWrong([]);
            setQuestionStart(clock.now());
        }
    };

    React.useEffect(() => {
        if (!reveal && questions.length > 0 && elapsed >= OTEV_SECONDS) done(OTEV_SECONDS + OTEV_PENALTY + wrong.length * OTEV_PENALTY, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [elapsed, reveal]);

    if (questions.length === 0) return <Subtle>The oracle has nothing to ask yet.</Subtle>;
    const q = questions[index];
    return (
        <div>
            <Title>
                🗿 Question {index + 1} of {questions.length}
            </Title>
            <div className="bbb-quote">“Bring me… {q.prompt}!”</div>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= questions.length} onNext={next} />
            ) : (
                <>
                    <Subtle>
                        {Math.max(0, Math.ceil(OTEV_SECONDS - elapsed))}s · {total.toFixed(1)}s so far · a wrong answer costs {OTEV_PENALTY}s
                    </Subtle>
                    <Grid>
                        {q.field.map((hg) => (
                            <Face
                                key={hg.id}
                                hg={hg}
                                small={true}
                                dim={wrong.includes(hg.id)}
                                onClick={() => {
                                    if (wrong.includes(hg.id)) return;
                                    if (hg.id === q.answerId) done(elapsed + wrong.length * OTEV_PENALTY, true);
                                    else setWrong([...wrong, hg.id]);
                                }}
                            />
                        ))}
                    </Grid>
                </>
            )}
        </div>
    );
}

function simulateOtev(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const questions = otevQuestions(ctx.gameState, ctx.history, seededRand(ctx.seed));
    const answers: boolean[] = [];
    const picks: number[] = [];
    questions.forEach(() => {
        const search = 2 + (1 - skill) * 5 + noise() * 2;
        const knows = chance(noise, 0.45 + 0.5 * skill);
        const seconds = knows ? search : search + OTEV_PENALTY * (1 + (chance(noise, 0.4) ? 1 : 0));
        answers.push(seconds < OTEV_SECONDS);
        picks.push(Math.round(seconds * 10) / 10);
    });
    return { score: -picks.reduce((a, b) => a + b, 0), answers, picks };
}

export const OtevComp: CompDefinition = {
    id: "otev",
    name: "The Oracle",
    emoji: "🗿",
    kind: "quiz",
    rules: `The oracle demands answers about this season. Each one is a houseguest: find their face in the pile and bring it back. ${OTEV_ROUNDS} questions, ${OTEV_SECONDS} seconds each, and every wrong face costs ${OTEV_PENALTY} seconds. The fastest total time wins.`,
    maxSeconds: OTEV_ROUNDS * OTEV_SECONDS + 15,
    Component: Otev,
    simulate: simulateOtev,
    botScore: (p) => -(OTEV_ROUNDS * (4 + (1 - p) * 9)),
    format: (s) => `${(-s).toFixed(1)}s`,
    progress: (r, n) => -sumSoFar(r, n),
    available: (gs, history) => otevFacts(gs, history).length >= OTEV_ROUNDS,
};

// ---------------- Hide and Go Veto ----------------

const SPOT_NAMES = [
    "Under the couch cushions",
    "In the fridge",
    "Inside the washing machine",
    "Behind the house wall",
    "In the cereal box",
    "Under a mattress",
    "In the hot tub filter",
    "Inside a pillowcase",
    "Behind the toilet",
    "In the freezer, under the ice",
    "In the pool table pocket",
    "Taped under the kitchen table",
];

interface HidingSpot {
    name: string;
    obvious: number; // 1 (nobody looks here) to 3 (the first place anyone looks)
    searchedAt: number; // 1 = searched first
}

// The same house for everyone: where the spots are, how obvious each one is, and the order they get searched.
function hidingSpots(rand: Rand): HidingSpot[] {
    const spots = shuffled(rand, SPOT_NAMES).map((name) => ({ name, obvious: randInt(rand, 1, 3), key: 0 }));
    // obvious spots tend to be torn apart first, but the search is chaos
    spots.forEach((s) => (s.key = rand() * (4 - s.obvious)));
    const order = [...spots].sort((a, b) => a.key - b.key);
    return spots.map((s) => ({ name: s.name, obvious: s.obvious, searchedAt: order.indexOf(s) + 1 }));
}

function HideAndGoVeto(props: CompProps) {
    const [spots] = React.useState(() => hidingSpots(props.rand));
    const [mine, setMine] = React.useState<number | null>(null);
    const [searched, setSearched] = React.useState(0); // how many spots have been searched
    const { finish, report } = props;

    React.useEffect(() => {
        if (mine === null) return;
        if (searched >= spots[mine].searchedAt || searched >= spots.length) {
            const t = setTimeout(() => finish(spots[mine].searchedAt), 900);
            return () => clearTimeout(t);
        }
        const t = setTimeout(() => setSearched(searched + 1), 700);
        return () => clearTimeout(t);
    }, [mine, searched, spots, finish]);

    const hide = (i: number) => {
        if (mine !== null) return;
        setMine(i);
        report(spots[i].searchedAt);
    };
    const found = mine !== null && searched >= spots[mine].searchedAt;
    const caught = props.opponents.filter((o) => o.score <= searched);
    return (
        <div>
            <Title>{mine === null ? "Hide your veto card" : found ? "They found your card!" : "The house is being torn apart…"}</Title>
            <Subtle>
                {mine === null
                    ? "🔍🔍🔍 is the first place anyone looks; 🔍 is somewhere nobody thinks of. But the search is chaos."
                    : `${searched} of ${spots.length} spots searched · ${caught.length} of ${props.opponents.length} other cards found`}
            </Subtle>
            <div className="bbb-spots">
                {spots.map((s, i) => {
                    const done = mine !== null && s.searchedAt <= searched;
                    return (
                        <button
                            type="button"
                            key={s.name}
                            className={`bbb-spot ${i === mine ? "is-mine" : ""} ${done ? "is-searched" : ""}`}
                            disabled={mine !== null}
                            onClick={() => hide(i)}
                        >
                            <b>{s.name}</b>
                            <span>
                                {"🔍".repeat(s.obvious)} {i === mine ? "· your card" : ""} {done ? "· searched" : ""}
                            </span>
                        </button>
                    );
                })}
            </div>
            {caught.length > 0 && <Subtle>Found so far: {caught.map((o) => o.hg.name).join(", ")}</Subtle>}
        </div>
    );
}

function simulateHideAndGoVeto(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same house; smarter bots avoid the obvious spots
    const spots = hidingSpots(seededRand(ctx.seed));
    const weights = spots.map((s) => Math.pow(4 - s.obvious, 0.5 + skill * 2.5));
    let roll = noise() * weights.reduce((a, b) => a + b, 0);
    let choice = spots.length - 1;
    for (let i = 0; i < spots.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
            choice = i;
            break;
        }
    }
    return { score: spots[choice].searchedAt };
}

export const HideAndGoVetoComp: CompDefinition = {
    id: "hide-and-go-veto",
    name: "Hide the Veto",
    emoji: "🫣",
    kind: "luck",
    rules:
        "Everyone hides a veto card somewhere in the house, then the house gets torn apart looking for them. The card found last wins. " +
        "Obvious spots tend to get searched first, but nothing is certain. Share a spot with someone and you'll need a tiebreaker.",
    maxSeconds: 120,
    Component: HideAndGoVeto,
    simulate: simulateHideAndGoVeto,
    botScore: (p) => Math.round(3 + p * 6),
    format: (s) => (s >= SPOT_NAMES.length ? "never found!" : `found ${s}${s === 1 ? "st" : s === 2 ? "nd" : s === 3 ? "rd" : "th"}`),
};

// ---------------- BB Comics ----------------

const COMIC_FAKES = 2; // forgeries of each real cover
const COMIC_LIMIT = 480; // seconds
const COMIC_PASS = 1.3; // seconds per column of covers (two rows) rolling across the screen
const COMIC_ADJECTIVES = ["Amazing", "Incredible", "Uncanny", "Mighty", "Invincible", "Savage", "Sneaky", "Fearless"];
const COMIC_PROPS = ["⚡", "🔥", "💎", "🛡️", "☄️", "🐍", "👁️", "🌪️", "🔑", "🏆"];
const COMIC_COLORS = ["#b91c1c", "#1d4ed8", "#047857", "#7e22ce", "#c2410c", "#0f766e", "#be185d"];
const COMIC_SFX = ["KAPOW!", "ZAP!", "BOOM!", "WHAM!", "SPLAT!", "CRASH!", "BAM!"];
const COMIC_QUOTES = [
    "You're going on the block!",
    "The veto is mine!",
    "Trust no one!",
    "Backdoor activated!",
    "I'm playing both sides!",
    "Expect the unexpected!",
    "Not in my alliance!",
    "Pawn? Me?!",
];

// A comic book cover starring a houseguest: their portrait as the hero (maybe mirrored), a rival in the corner,
// a speech bubble, a sound effect, a prop, the title, the cover color and the issue number.
interface Cover {
    adjective: string;
    prop: string;
    color: string;
    issue: number;
    sfx: string;
    quote: string;
    rivalId: number;
    flipped: boolean;
}

function sameCover(a: Cover, b: Cover): boolean {
    return (Object.keys(a) as (keyof Cover)[]).every((k) => a[k] === b[k]);
}

function otherThan<T>(rand: Rand, list: T[], not: T): T {
    return pick(rand, list.filter((x) => x !== not));
}

// A copy of the cover with exactly one detail changed.
function forgery(rand: Rand, real: Cover, rivals: number[]): Cover {
    const details = ["adjective", "prop", "color", "issue", "sfx", "quote", "flipped", ...(rivals.length > 1 ? ["rivalId"] : [])];
    const detail = pick(rand, details);
    if (detail === "adjective") return { ...real, adjective: otherThan(rand, COMIC_ADJECTIVES, real.adjective) };
    if (detail === "prop") return { ...real, prop: otherThan(rand, COMIC_PROPS, real.prop) };
    if (detail === "color") return { ...real, color: otherThan(rand, COMIC_COLORS, real.color) };
    if (detail === "sfx") return { ...real, sfx: otherThan(rand, COMIC_SFX, real.sfx) };
    if (detail === "quote") return { ...real, quote: otherThan(rand, COMIC_QUOTES, real.quote) };
    if (detail === "flipped") return { ...real, flipped: !real.flipped };
    if (detail === "rivalId") return { ...real, rivalId: otherThan(rand, rivals, real.rivalId) };
    return { ...real, issue: real.issue + pick(rand, [-2, -1, 1, 2]) };
}

function ComicCover(props: { hg: Houseguest; rival?: Houseguest; cover: Cover; onClick?: () => void }) {
    const { hg, rival, cover } = props;
    const style = { "--comic-bg": cover.color } as React.CSSProperties;
    return (
        <button type="button" className="bbb-comic" style={style} disabled={!props.onClick} onClick={props.onClick}>
            <div className="bbb-comic-mast">
                <span>#{cover.issue}</span>
                <span className="bbb-comic-brand">BB COMICS</span>
            </div>
            <div className="bbb-comic-title">
                The {cover.adjective}
                <b>{hg.name}</b>
            </div>
            <div className="bbb-comic-panel">
                <img className={"bbb-comic-hero" + (cover.flipped ? " is-flipped" : "")} src={hg.imageURL} alt="" />
                <div className="bbb-comic-bubble">{cover.quote}</div>
                <div className="bbb-comic-sfx">{cover.sfx}</div>
                <div className="bbb-comic-prop">{cover.prop}</div>
                {rival && rival.id !== hg.id && (
                    <div className="bbb-comic-rival">
                        <img src={rival.imageURL} alt="" />
                        <span>VS</span>
                    </div>
                )}
            </div>
        </button>
    );
}

export interface ComicPile {
    cast: Houseguest[]; // every houseguest of the season, in the order their comics go by
    // every cover on the table, real ones and forgeries, mixed up: `of` is whose it is (index in `cast`)
    covers: { of: number; real: boolean; cover: Cover }[];
}

// The covers: the same for every player and bot.
// Every houseguest of the season, evicted or not, gets a comic; they go by in a random order.
export function comicPile(gs: GameState, _history: WeekRecord[], rand: Rand): ComicPile {
    const cast = shuffled(rand, gs.houseguests);
    const covers: ComicPile["covers"] = [];
    cast.forEach((hg, of) => {
        const rivals = gs.houseguests.filter((h) => h.id !== hg.id).map((h) => h.id);
        const real: Cover = {
            adjective: pick(rand, COMIC_ADJECTIVES),
            prop: pick(rand, COMIC_PROPS),
            color: pick(rand, COMIC_COLORS),
            issue: randInt(rand, 3, 98),
            sfx: pick(rand, COMIC_SFX),
            quote: pick(rand, COMIC_QUOTES),
            rivalId: rivals.length > 0 ? pick(rand, rivals) : hg.id,
            flipped: rand() < 0.5,
        };
        covers.push({ of, real: true, cover: real });
        const fakes: Cover[] = [];
        for (let guard = 0; fakes.length < COMIC_FAKES && guard < 30; guard++) {
            const fake = forgery(rand, real, rivals);
            if (!sameCover(fake, real) && !fakes.some((f) => sameCover(f, fake))) fakes.push(fake);
        }
        fakes.forEach((cover) => covers.push({ of, real: false, cover }));
    });
    return { cast, covers: shuffled(rand, covers) };
}

// How many slots are right: slot i must hold the real cover of the i-th comic that went by.
export function comicsRight(pile: ComicPile, slots: (number | null)[]): number {
    return slots.filter((c, i) => c !== null && pile.covers[c].real && pile.covers[c].of === i).length;
}

function BBComics(props: CompProps) {
    const [pile] = React.useState(() => comicPile(props.gameState, props.history, props.rand));
    const n = pile.cast.length;
    const [slots, setSlots] = React.useState<(number | null)[]>(() => Array(n).fill(null));
    const [held, setHeld] = React.useState<number | null>(null); // the cover picked up off the table
    // two of the same houseguest's covers, one on top of the other: under[top] is the one underneath
    const [under, setUnder] = React.useState<{ [top: number]: number }>({});
    const [comparing, setComparing] = React.useState<number | null>(null); // a stack, spread out to choose from
    const [reviewing, setReviewing] = React.useState(false);
    const [wrong, setWrong] = React.useState(0); // tries that weren't right
    const [checked, setChecked] = React.useState(false); // the red cross, until something changes
    const [start] = React.useState(() => Date.now());
    const hgOf = (c: number) => pile.cast[pile.covers[c].of];
    const rivalOf = (cover: Cover) => props.gameState.houseguests.find((h) => h.id === cover.rivalId);
    const cover = (c: number, onClick?: () => void) => <ComicCover hg={hgOf(c)} rival={rivalOf(pile.covers[c].cover)} cover={pile.covers[c].cover} onClick={onClick} />;
    const used = new Set(slots.filter((s): s is number => s !== null));
    const hidden = new Set(Object.values(under)); // underneath a stack
    const unstack = (top: number) => {
        const next = { ...under };
        delete next[top];
        setUnder(next);
    };

    const putIn = (i: number) => {
        if (held === null) return;
        const next = [...slots];
        next[i] = held; // whatever was there goes back on the table
        setSlots(next);
        setHeld(null);
        setChecked(false);
    };
    const tapTable = (c: number) => {
        if (under[c] !== undefined) {
            // a stack: spread it out and pick one
            setHeld(null);
            setComparing(c);
        } else if (held === c) setHeld(null);
        else if (held !== null && pile.covers[held].of === pile.covers[c].of) {
            // another of the same houseguest's covers: put the one in hand on top of it
            setUnder({ ...under, [held]: c });
            setHeld(null);
        } else setHeld(c);
    };
    const tapSlot = (i: number) => {
        if (held !== null) putIn(i);
        else if (slots[i] !== null) {
            const next = [...slots];
            next[i] = null;
            setSlots(next);
            setChecked(false);
        }
    };
    const keep = (top: number, c: number) => {
        // the one kept is in your hand; the other goes back to its place on the table
        unstack(top);
        setComparing(null);
        setHeld(c);
    };
    const lockIn = () => {
        const right = comicsRight(pile, slots);
        if (right === n) {
            const secs = (Date.now() - start) / 1000;
            props.finish(1000 + Math.max(0, COMIC_LIMIT - secs));
            return;
        }
        // wrong: they're told so, but not what
        props.report(right);
        setWrong(wrong + 1);
        setChecked(true);
    };

    if (reviewing) {
        // the real covers, in two rows, roll across the screen once and are gone: the top row first, then the bottom
        const reals = pile.covers.filter((c) => c.real).sort((a, b) => a.of - b.of);
        const half = Math.ceil(reals.length / 2);
        const row = (list: typeof reals) => (
            <div className="bbb-comic-strip-row">
                {list.map((c) => (
                    <div key={c.of} className="bbb-comic-strip-item">
                        <b>#{c.of + 1}</b>
                        <ComicCover hg={pile.cast[c.of]} rival={rivalOf(c.cover)} cover={c.cover} />
                    </div>
                ))}
            </div>
        );
        return (
            <div>
                <Title>📚 Watch closely…</Title>
                <div className="bbb-comics-review">
                    <div className="bbb-comic-strip" style={{ animationDuration: `${3 + half * COMIC_PASS}s` }} onAnimationEnd={() => setReviewing(false)}>
                        {row(reals.slice(0, half))}
                        {row(reals.slice(half))}
                    </div>
                </div>
                <BigButton kind="light" onClick={() => setReviewing(false)}>
                    Back to the table
                </BigButton>
            </div>
        );
    }
    const nextFree = slots.indexOf(null);
    return (
        <div>
            <Title>Put the real covers in order</Title>
            <Subtle>
                Tap a cover to pick it up, then tap a slot (in the order they went by). Tap another cover of the same houseguest to stack them; tap a
                stack to compare the two and keep one. Tap a filled slot to put its cover back.
            </Subtle>
            <div className="bbb-comic-slots">
                {slots.map((c, i) => (
                    <div key={i} className={"bbb-comic-slot" + (held !== null ? " is-target" : "")}>
                        <span>#{i + 1}</span>
                        {c === null ? (
                            <button type="button" className="bbb-comic-empty" aria-label={`Slot ${i + 1}`} onClick={() => tapSlot(i)} />
                        ) : (
                            cover(c, () => tapSlot(i))
                        )}
                    </div>
                ))}
            </div>
            {checked && (
                <div className="bbb-comic-wrong" role="alert">
                    ❌ <span>Not right. Something's wrong.</span>
                </div>
            )}
            {comparing !== null && under[comparing] !== undefined ? (
                <div className="bbb-comic-compare">
                    <Subtle>Which one do you keep? The other goes back on the table.</Subtle>
                    <div className="bbb-comics">
                        {[comparing, under[comparing]].map((c) => (
                            <div key={c} className="bbb-comic-choice">
                                {cover(c)}
                                <BigButton kind="success" onClick={() => keep(comparing, c)}>
                                    Keep this one
                                </BigButton>
                            </div>
                        ))}
                    </div>
                    <BigButton
                        kind="light"
                        onClick={() => {
                            unstack(comparing);
                            setComparing(null);
                        }}
                    >
                        Put both back
                    </BigButton>
                </div>
            ) : (
                held !== null && (
                    <div className="bbb-comic-held">
                        <span>
                            ✋ Holding {hgOf(held).name}'s cover: tap a slot, or another of {hgOf(held).name}'s covers to stack them.
                        </span>
                        {nextFree >= 0 && (
                            <button type="button" className="button is-small is-warning" onClick={() => putIn(nextFree)}>
                                Put in #{nextFree + 1}
                            </button>
                        )}
                        <button type="button" className="button is-small is-light" onClick={() => setHeld(null)}>
                            Put it down
                        </button>
                    </div>
                )
            )}
            <div className="bbb-comics-pool">
                {pile.covers.map((_, i) =>
                    hidden.has(i) ? (
                        <div key={i} className="is-under" />
                    ) : (
                        <div
                            key={i}
                            className={[used.has(i) ? "is-used" : "", held === i ? "is-held" : "", under[i] !== undefined ? "is-stack" : ""].join(" ").trim()}
                        >
                            {under[i] !== undefined && <div className="bbb-comic-stack-badge">2</div>}
                            {cover(i, used.has(i) || comparing !== null ? undefined : () => tapTable(i))}
                        </div>
                    )
                )}
            </div>
            <BigButton kind="info" onClick={() => setReviewing(true)}>
                📚 Review the comics
            </BigButton>
            <BigButton kind="success" disabled={used.size < n} onClick={lockIn}>
                Lock it in{wrong > 0 ? ` (try ${wrong + 1})` : ""}
            </BigButton>
        </div>
    );
}

function simulateBBComics(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const n = comicPile(ctx.gameState, ctx.history, seededRand(ctx.seed)).cast.length;
    // a look at the comics, then a cover at a time, with the odd wrong try
    const perCover = 6 + (1 - skill) * 22;
    const tries = Math.max(0, Math.round((1 - skill) * 2.5 + gaussian(noise)));
    const secs = 10 + n * perCover * (0.75 + 0.5 * noise()) + tries * (6 + 4 * noise());
    if (secs < COMIC_LIMIT) return { score: 1000 + (COMIC_LIMIT - secs) };
    return { score: clamp(Math.round(n * (0.3 + 0.6 * skill) + gaussian(noise)), 0, n - 1) };
}

export const BBComicsComp: CompDefinition = {
    id: "bb-comics",
    name: "BB Comics",
    emoji: "🦸",
    kind: "memory",
    rules:
        "A jury-phase classic: every houseguest of the season stars in their own comic book. All the covers are on the table, but next to each real one are forgeries that change one detail: " +
        "the title, the speech bubble, the sound effect, the rival, the prop, which way the hero faces, the color or the issue number. " +
        "Press Review and the real covers roll across the screen in two rows, numbered in order, then they're gone. Review as often as you like (the clock keeps running), then put the real ones in that order. " +
        "Stack two covers of the same houseguest to compare them and keep one. " +
        "When you lock it in, a red cross means something's wrong, but you won't be told what. Fastest to get it right wins.",
    maxSeconds: COMIC_LIMIT,
    available: (gs) => gs.houseguests.filter((hg) => hg.isJury).length >= 2,
    Component: BBComics,
    simulate: simulateBBComics,
    botScore: (p) => (p > 0.35 ? 1000 + Math.round(COMIC_LIMIT * 0.6 * p) : Math.round(4 * p)),
    format: (s) => (s >= 1000 ? `done in ${Math.round(COMIC_LIMIT - (s - 1000))}s` : `${Math.round(s)} in the right place`),
};

// ---------------- Over or Under (counting) ----------------

const COUNT_ROUNDS = 6;
const COUNT_LOOK = 3; // seconds
const COUNT_ITEMS = ["🍬", "🏀", "🥫", "🧦", "🍋", "🪙", "🧩", "🥨"];

interface CountRound {
    emoji: string;
    count: number;
    line: number; // "more or fewer than this?"
    spots: { x: number; y: number }[];
}

function countRounds(rand: Rand): CountRound[] {
    return Array.from({ length: COUNT_ROUNDS }, () => {
        const count = randInt(rand, 30, 120);
        const gap = Math.max(4, Math.round(count * (0.1 + rand() * 0.15)));
        const line = rand() < 0.5 ? count + gap : count - gap;
        const spots = Array.from({ length: count }, () => ({ x: Math.round(rand() * 940) / 10, y: Math.round(rand() * 900) / 10 }));
        return { emoji: pick(rand, COUNT_ITEMS), count, line, spots };
    });
}

function OverOrUnder(props: CompProps) {
    const [rounds] = React.useState(() => countRounds(props.rand));
    const [index, setIndex] = React.useState(0);
    const [looking, setLooking] = React.useState(true);
    const [correct, setCorrect] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [start] = React.useState(() => clock.now());
    const { finish, report, recordAnswer } = props;

    React.useEffect(() => {
        if (!looking) return;
        const t = setTimeout(() => setLooking(false), COUNT_LOOK * 1000);
        return () => clearTimeout(t);
    }, [looking, index]);

    const round = rounds[index];
    const label = (more: boolean) => (more ? "More" : "Fewer");
    const answer = (more: boolean) => {
        if (reveal) return;
        const truth = round.count > round.line;
        const right = more === truth;
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        report(c * 100);
        if (recordAnswer) recordAnswer(index, right, label(more));
        clock.pause();
        setReveal({
            index,
            verdict: right ? "✅ Right!" : "❌ Wrong!",
            correctText: `${label(truth)}: there were ${round.count} ${round.emoji} (the line was ${round.line})`,
            rows: revealRows(props, index, { correct: right, answer: label(more) }, (ok, pick) =>
                typeof pick === "string" ? pick : label(ok ? truth : !truth)
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= rounds.length) finish(quizScore(correct, (clock.now() - start) / 1000, 1.2));
        else {
            setIndex(index + 1);
            setLooking(true);
        }
    };
    return (
        <div>
            <Title>
                Round {index + 1} of {rounds.length} · {correct} right
            </Title>
            {looking ? (
                <>
                    <Subtle>No time to count them all. Trust your eyes.</Subtle>
                    <div className="bbb-tiebreak-box">
                        {round.spots.map((s, i) => (
                            <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                                {round.emoji}
                            </span>
                        ))}
                    </div>
                </>
            ) : reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= rounds.length} onNext={next} />
            ) : (
                <div>
                    <p style={{ fontSize: "1.2rem", margin: "14px 0" }}>
                        Were there MORE or FEWER than <b>{round.line}</b> {round.emoji}?
                    </p>
                    <BigButton kind="success" onClick={() => answer(true)}>
                        ⬆️ More
                    </BigButton>
                    <BigButton kind="danger" onClick={() => answer(false)}>
                        ⬇️ Fewer
                    </BigButton>
                </div>
            )}
        </div>
    );
}

function simulateOverOrUnder(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same piles: a bot's estimate is off by more the less skilled it is, and close calls go wrong
    const rounds = countRounds(seededRand(ctx.seed));
    const answers = rounds.map((r) => {
        const estimate = r.count * (1 + gaussian(noise) * (0.3 - 0.22 * skill));
        return (estimate > r.line) === (r.count > r.line);
    });
    return { score: quizScore(answers.filter(Boolean).length, rounds.length * (COUNT_LOOK + 1.5 + (1 - skill) * 3), 1.2), answers };
}

export const OverOrUnderComp: CompDefinition = {
    id: "over-or-under",
    name: "Over or Under",
    emoji: "🫙",
    kind: "skill",
    rules: `A counting comp. A pile of things flashes for ${COUNT_LOOK} seconds: far too many to count. Then you're given a number: were there more, or fewer? ${COUNT_ROUNDS} rounds. Most right wins; ties go to a tiebreaker.`,
    maxSeconds: COUNT_ROUNDS * (COUNT_LOOK + 10),
    Component: OverOrUnder,
    simulate: simulateOverOrUnder,
    botScore: (p) => quizScore(Math.round(COUNT_ROUNDS * (0.5 + 0.45 * p)), COUNT_ROUNDS * (COUNT_LOOK + 1.5 + (1 - p) * 3), 1.2),
    format: formatQuiz,
    progress: (r, n) => rightSoFar(r, n) * 100,
};

// ---------------- The Days Quiz ----------------

const DAYS_QUESTIONS = 5;

interface DayQuestion {
    prompt: string;
    answer: number;
}

function dayFacts(gs: GameState, history: WeekRecord[]): DayQuestion[] {
    const name = (id: number) => getById(gs, id).name;
    const facts: DayQuestion[] = [];
    history.forEach((w) => {
        if (w.hohId !== undefined)
            facts.push({ prompt: `On which day did ${name(w.hohId)} win the Head of House that put ${w.nomineeIds.map(name).join(" and ")} on the block?`, answer: dayOf(gs, w.week, DAY_PART.hoh) });
        if (w.povId !== undefined && w.evictedIds.length > 0)
            facts.push({ prompt: `On which day did ${name(w.povId)} win the veto, the week ${name(w.evictedIds[0])} went home?`, answer: dayOf(gs, w.week, DAY_PART.veto) });
        w.evictedIds.forEach((id) => facts.push({ prompt: `On which day was ${name(id)} evicted?`, answer: dayOf(gs, w.week, DAY_PART.eviction) }));
    });
    return facts;
}

function dayQuestions(gs: GameState, history: WeekRecord[], rand: Rand): DayQuestion[] {
    return sample(rand, dayFacts(gs, history), DAYS_QUESTIONS);
}

// A guess within this many days of the answer counts as close enough for a check mark.
const DAYS_CLOSE = 2;

function DaysQuiz(props: CompProps) {
    const [questions] = React.useState(() => dayQuestions(props.gameState, props.history, props.rand));
    const [index, setIndex] = React.useState(0);
    const [value, setValue] = React.useState("");
    const [off, setOff] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const { finish, report, recordAnswer } = props;

    if (questions.length === 0) return <Subtle>The season is too young for a days quiz.</Subtle>;
    const q = questions[index];
    const describe = (guess: number) => `Day ${guess} (${Math.abs(guess - q.answer) === 0 ? "exact!" : `${Math.abs(guess - q.answer)} off`})`;
    const submit = () => {
        const guess = parseInt(value, 10);
        if (isNaN(guess) || reveal) return;
        const miss = Math.abs(guess - q.answer);
        const total = off + miss;
        setOff(total);
        setValue("");
        report(-(total + (questions.length - index - 1) * 30));
        if (recordAnswer) recordAnswer(index, miss <= DAYS_CLOSE, guess);
        clock.pause();
        setReveal({
            index,
            verdict: miss === 0 ? "🎯 Exactly right!" : miss <= DAYS_CLOSE ? `✅ Close: ${miss} off` : `❌ ${miss} days off`,
            correctText: `Day ${q.answer}`,
            rows: revealRows(props, index, { correct: miss <= DAYS_CLOSE, answer: describe(guess) }, (ok, pick) =>
                typeof pick === "number" ? describe(pick) : ok ? "close" : "way off"
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= questions.length) finish(-off);
        else setIndex(index + 1);
    };
    return (
        <div>
            <Title>
                Question {index + 1} of {questions.length} · {off} days off so far
            </Title>
            <p style={{ fontSize: "1.2rem", margin: "8px auto", maxWidth: 560 }}>{q.prompt}</p>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= questions.length} onNext={next} />
            ) : (
                <>
                    <Subtle>Answer with a day of the season, from 1 to 90.</Subtle>
                    <Keypad value={value} onChange={setValue} onSubmit={submit} maxLength={2} submitLabel="Lock in" />
                </>
            )}
        </div>
    );
}

function simulateDaysQuiz(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const questions = dayQuestions(ctx.gameState, ctx.history, seededRand(ctx.seed));
    const picks = questions.map((q) => {
        const miss = Math.round(Math.abs(gaussian(noise)) * (0.5 + (1 - skill) * 9));
        const guess = q.answer + (noise() < 0.5 ? -miss : miss);
        return clamp(guess, 1, 90);
    });
    const misses = picks.map((p, i) => Math.abs(p - questions[i].answer));
    return { score: -misses.reduce((a, b) => a + b, 0), answers: misses.map((m) => m <= DAYS_CLOSE), picks };
}

export const DaysQuizComp: CompDefinition = {
    id: "days-quiz",
    name: "The Days Quiz",
    emoji: "📅",
    kind: "quiz",
    rules: `How well have you kept track of the days? ${DAYS_QUESTIONS} questions about when things happened this season. Answer each with a day number. The fewest total days off wins.`,
    maxSeconds: DAYS_QUESTIONS * 30,
    Component: DaysQuiz,
    simulate: simulateDaysQuiz,
    botScore: (p) => -Math.round(DAYS_QUESTIONS * (1 + (1 - p) * 7)),
    format: (s) => (s === 0 ? "perfect!" : `${-s} days off`),
    progress: (r, n, ctx) => {
        const questions = dayQuestions(ctx.gameState, ctx.history, seededRand(ctx.seed));
        return -(r.picks || []).slice(0, n).reduce<number>((sum, p, i) => sum + Math.abs(Number(p) - questions[i].answer), 0);
    },
    available: (gs, history) => dayFacts(gs, history).length >= DAYS_QUESTIONS,
};

// ---------------- Face Morph ----------------

const MORPH_ROUNDS = 5;
const MORPH_SECONDS = 15;

function morphRounds(gs: GameState, rand: Rand): [Houseguest, Houseguest][] {
    return Array.from({ length: MORPH_ROUNDS }, () => {
        const [a, b] = sample(rand, gs.houseguests, 2);
        return [a, b] as [Houseguest, Houseguest];
    });
}

function FaceMorph(props: CompProps) {
    const [rounds] = React.useState(() => morphRounds(props.gameState, props.rand));
    const [cast] = React.useState(() => [...props.gameState.houseguests].sort((a, b) => a.name.localeCompare(b.name)));
    const [index, setIndex] = React.useState(0);
    const [picked, setPicked] = React.useState<number[]>([]);
    const [correct, setCorrect] = React.useState(0);
    const [reveal, setReveal] = React.useState<Reveal | null>(null);
    const clock = useQuizClock(props.pauseClock);
    const [start] = React.useState(() => clock.now());
    const [roundStart, setRoundStart] = React.useState(() => clock.now());
    const [, tick] = React.useState(0);
    const { finish, report, recordAnswer } = props;
    const left = MORPH_SECONDS - (clock.now() - roundStart) / 1000;

    React.useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 250);
        return () => clearInterval(t);
    }, []);

    const lockIn = (ids: number[]) => {
        if (reveal) return;
        const pair = rounds[index];
        const got = ids.filter((id) => pair.some((hg) => hg && hg.id === id)).length;
        const c = correct + got;
        setCorrect(c);
        report(c * 100);
        if (recordAnswer) recordAnswer(index, got === 2, got);
        clock.pause();
        const names = pair.map((hg) => hg.name).join(" and ");
        setReveal({
            index,
            verdict: got === 2 ? "✅ Both faces!" : got === 1 ? "🙂 One of two" : "❌ Neither",
            correctText: names,
            rows: revealRows(props, index, { correct: got === 2, answer: `${got}/2 faces` }, (ok, pick) =>
                typeof pick === "number" ? `${pick}/2 faces` : ok ? "2/2 faces" : "missed"
            ),
        });
    };
    const next = () => {
        setReveal(null);
        clock.resume();
        if (index + 1 >= rounds.length) finish(quizScore(correct, (clock.now() - start) / 1000, 1));
        else {
            setIndex(index + 1);
            setPicked([]);
            setRoundStart(clock.now());
        }
    };

    React.useEffect(() => {
        if (!reveal && left <= 0) lockIn(picked);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [left, reveal]);

    const [a, b] = rounds[index];
    if (!a || !b) return <Subtle>Not enough faces to morph.</Subtle>;
    const toggle = (id: number) => {
        if (reveal) return;
        if (picked.includes(id)) return setPicked(picked.filter((p) => p !== id));
        const chosen = [...picked, id].slice(-2);
        if (chosen.length === 2) lockIn(chosen);
        setPicked(chosen);
    };
    return (
        <div>
            <Title>
                Morph {index + 1} of {rounds.length} · {correct} faces right
            </Title>
            <Subtle>{reveal ? "Here's who it was." : `${Math.max(0, Math.ceil(left))}s · Two houseguests have been blended into one. Tap both.`}</Subtle>
            <div className="bbb-morph">
                <img src={a.imageURL} alt="" />
                <img src={b.imageURL} alt="" />
            </div>
            {reveal ? (
                <AnswerReveal reveal={reveal} last={index + 1 >= rounds.length} onNext={next} />
            ) : (
                <Grid>
                    {cast.map((hg) => (
                        <Face key={hg.id} hg={hg} small={true} selected={picked.includes(hg.id)} onClick={() => toggle(hg.id)} />
                    ))}
                </Grid>
            )}
        </div>
    );
}

function simulateFaceMorph(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const rounds = morphRounds(ctx.gameState, seededRand(ctx.seed));
    const options = Math.max(2, ctx.gameState.houseguests.length);
    const picks = rounds.map(() => [0, 1].filter(() => answerQuestion(noise, 0.3 + 0.65 * skill, options)).length);
    const correct = picks.reduce((x, y) => x + y, 0);
    return { score: quizScore(correct, rounds.length * (3 + (1 - skill) * 8), 1), answers: picks.map((p) => p === 2), picks };
}

export const FaceMorphComp: CompDefinition = {
    id: "face-morph",
    name: "Face Morph",
    emoji: "🎭",
    kind: "memory",
    rules: `Two houseguests' faces have been morphed into one. Name them both. ${MORPH_ROUNDS} morphs, ${MORPH_SECONDS} seconds each, one point for every face you get right. Most points wins; ties go to a tiebreaker.`,
    maxSeconds: MORPH_ROUNDS * MORPH_SECONDS + 10,
    Component: FaceMorph,
    simulate: simulateFaceMorph,
    botScore: (p) => quizScore(Math.round(MORPH_ROUNDS * 2 * clamp(0.3 + 0.65 * p, 0, 1)), MORPH_ROUNDS * (3 + (1 - p) * 8), 1),
    format: (s) => `${Math.floor(s / 100)} faces`,
    progress: (r, n) => sumSoFar(r, n) * 100,
    available: (gs) => gs.houseguests.length >= 4,
};
