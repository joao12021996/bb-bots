import { GameState, getById } from "../../model";
import { WeekRecord } from "../history";
import { HOH, LAST_CHANCE, VETO } from "../terms";
import { MoveRecord } from "./awards";

// The finale montage: before the jury votes, a look back at each finalist's best moments, week by week.

export interface Moment {
    week: number;
    emoji: string;
    text: string;
    weight: number; // how much it mattered: the montage keeps the biggest
}

const MAX_MOMENTS = 6;

export function momentsFor(gs: GameState, history: WeekRecord[], moves: MoveRecord[], id: number): Moment[] {
    const out: Moment[] = [];
    const name = (x: number) => getById(gs, x).name;
    history.forEach((w) => {
        if (w.hohId === id) {
            const evicted = w.evictedIds.filter((e) => e !== id);
            out.push({
                week: w.week,
                emoji: "👑",
                text: `Won ${HOH}${evicted.length ? `, and sent ${evicted.map(name).join(" and ")} packing` : ""}.`,
                weight: 3,
            });
        }
        if (w.povId === id) {
            out.push({ week: w.week, emoji: "🛡️", text: `Won the ${VETO}.`, weight: 2.5 });
        }
        if (w.blockbusterId === id) {
            out.push({ week: w.week, emoji: "🎬", text: `Won the ${LAST_CHANCE} to get off the block.`, weight: 3 });
        }
        if (w.nomineeIds.includes(id) && !w.evictedIds.includes(id)) {
            const tally = w.votes ? Object.keys(w.votes).map((k) => w.votes![Number(k)]) : [];
            const total = tally.reduce((a, b) => a + b, 0);
            const against = w.votes ? w.votes[id] || 0 : undefined;
            const close = against !== undefined && total > 0 && against >= total / 2 - 1 && against > 0;
            out.push({
                week: w.week,
                emoji: "🎯",
                text:
                    against !== undefined && total > 0
                        ? `Survived the block${close ? " by a whisker" : ""}: ${against === 0 ? "not one vote" : `${against} vote${against === 1 ? "" : "s"}`} against.`
                        : "Survived the block.",
                weight: close ? 3.5 : 2,
            });
        }
    });
    moves
        .filter((m) => m.actorId === id)
        .forEach((m) => out.push({ week: m.week, emoji: m.kind === "backstab" ? "🔪" : "💣", text: sentence(m.text), weight: 2 + m.weight }));
    // the biggest ones, then back in the order they happened
    const kept = [...out].sort((a, b) => b.weight - a.weight).slice(0, MAX_MOMENTS);
    return kept.sort((a, b) => a.week - b.week || out.indexOf(a) - out.indexOf(b));
}

function sentence(text: string): string {
    const t = text.trim();
    return /[.!?]$/.test(t) ? t : `${t}.`;
}

// The montage, as lines for a scene.
export function montageLines(gs: GameState, history: WeekRecord[], moves: MoveRecord[], id: number): string[] {
    const hg = getById(gs, id);
    const moments = momentsFor(gs, history, moves, id);
    if (moments.length === 0) {
        return [`${hg.name} kept their head down, stayed off the radar, and made it all the way to the final two.`, "Was it a strategy? The jury will decide."];
    }
    return [`Let's look back at ${hg.name}'s journey.`, ...moments.map((m) => `${m.emoji} Week ${m.week}: ${m.text}`)];
}
