import { GameState, getById, Houseguest } from "../../model";
import { hashcode } from "../../utils";
import { WeekRecord } from "../history";
import { Pledge } from "./promises";
import { MoveRecord } from "./awards";
import { listNames } from "../../utils/listStrings";
import { HOH } from "../terms";

// The diary room: after each eviction, houseguests tell the cameras what the week was like for them. Written from
// what actually happened (comps, the block, votes, promises), kept secret all season, and read out at the end.

export interface DiaryEntry {
    week: number;
    id: number; // who's talking
    lines: string[];
}

export interface DiaryWeek {
    seed: number;
    week: number;
    gameState: GameState; // after the eviction
    record: WeekRecord | undefined;
    votes: { [voterId: number]: number };
    evictedIds: number[];
    playerIds: number[]; // the players: they get an entry every week they were in the house
    initialNoms: number[];
    secretHoh: boolean;
    haveNots: number[];
    pledges: Pledge[];
    moves: MoveRecord[];
    hohRoomSafe: number[];
}

// One of a few ways to say something, picked the same way every time for the same moment.
function pick(key: string, options: string[]): string {
    const h = Math.abs(hashcode(key));
    return options[h % options.length];
}

export function diaryEntries(w: DiaryWeek): DiaryEntry[] {
    const gs = w.gameState;
    const name = (id: number) => getById(gs, id).name;
    const names = (ids: number[]) => listNames(ids.map(name));
    const rec = w.record;
    const finalNoms = rec ? rec.nomineeIds : [];
    const everyNom = Array.from(new Set([...w.initialNoms, ...finalNoms]));
    const hohId = rec ? rec.hohId : undefined;
    const voteCount = (id: number) => Object.values(w.votes).filter((v) => v === id).length;
    const totalVotes = Object.keys(w.votes).length;
    // who talks: every player who was in the house this week, the Head of House, and whoever went home
    const talkers = new Set<number>();
    w.playerIds.forEach((id) => {
        const hg = getById(gs, id);
        if (!hg.isEvicted || w.evictedIds.includes(id)) talkers.add(id);
    });
    if (hohId !== undefined) talkers.add(hohId);
    w.evictedIds.forEach((id) => talkers.add(id));

    const entries: DiaryEntry[] = [];
    talkers.forEach((id) => {
        const key = (what: string) => `${w.seed}:${w.week}:${id}:${what}`;
        const lines: string[] = [];
        const evicted = w.evictedIds.includes(id);

        if (id === hohId) {
            const mine = w.initialNoms.filter((n) => n !== id);
            lines.push(
                w.secretHoh
                    ? `I won ${HOH}, and nobody knew it was me. ${mine.length ? `I put up ${names(mine)}, and I got to watch them guess.` : ""}`
                    : pick(key("hoh"), [
                          `I won ${HOH}. ${mine.length ? `I nominated ${names(mine)}.` : ""}`,
                          `The ${HOH} room is mine this week. ${mine.length ? `${names(mine)} had to go up.` : ""}`,
                          `Winning ${HOH} felt amazing, and then I had to nominate ${mine.length ? names(mine) : "people"}.`,
                      ])
            );
            const gone = w.evictedIds.filter((e) => e !== id);
            if (gone.length) lines.push(pick(key("hohout"), [`${names(gone)} went home on my watch.`, `Mission accomplished: ${names(gone)} is out.`]));
        }

        if (rec && rec.povId === id) {
            const saved = w.initialNoms.filter((n) => !finalNoms.includes(n) && n !== rec.blockbusterId);
            lines.push(
                saved.includes(id)
                    ? "I won the Veto with my back against the wall, and I took myself off the block."
                    : saved.length
                    ? `I won the Veto and used it on ${names(saved.filter((s) => s !== id))}.`
                    : pick(key("pov"), ["I won the Veto and kept the nominations the same.", "The Veto was mine. I didn't touch it."])
            );
        }

        if (rec && rec.blockbusterId === id) lines.push("Three of us on the block, and I won the Last Chance comp to get off it.");

        if (everyNom.includes(id) && !evicted && !(rec && (rec.povId === id || rec.blockbusterId === id))) {
            lines.push(
                finalNoms.includes(id)
                    ? pick(key("survived"), [
                          `I sat on the block on eviction night and I survived. ${totalVotes ? `${voteCount(id)} vote${voteCount(id) === 1 ? "" : "s"} against me.` : ""}`,
                          "I was on the block and I'm still here. That was way too close.",
                      ])
                    : "I got nominated, and I got off the block before eviction night."
            );
        }

        if (w.haveNots.includes(id)) lines.push(pick(key("slop"), ["Slop all week. I barely had the energy to talk to anyone.", "Have-Not week. Cold showers, slop, and a lot of lying in bed."]));

        if (w.votes[id] !== undefined) {
            const target = w.votes[id];
            const withHouse = w.evictedIds.includes(target);
            lines.push(
                withHouse
                    ? pick(key("vote"), [`I voted to evict ${name(target)}, with the house.`, `My vote went to ${name(target)}. Bye!`])
                    : pick(key("rogue"), [`I voted to evict ${name(target)}. I was on the wrong side of that one.`, `I voted against ${name(target)}, and they stayed. Now I have to hope nobody finds out.`])
            );
        }

        w.pledges
            .filter((p) => p.fromId === id && p.status === "broken" && p.week === w.week)
            .forEach((p) => lines.push(pick(key(`broke:${p.id}`), [`I broke my word to ${name(p.toId)}. It's a game.`, `I promised ${name(p.toId)}, and I didn't deliver. I'll live with it.`])));
        w.pledges
            .filter((p) => p.fromId === id && p.status === "kept" && p.week === w.week)
            .forEach((p) => lines.push(`I kept my word to ${name(p.toId)}.`));
        w.moves
            .filter((m) => m.actorId === id && m.kind === "backstab" && m.targetId !== undefined)
            .forEach((m) => lines.push(pick(key(`stab:${m.targetId}`), [`I had to turn on ${name(m.targetId!)}. Nothing personal.`, `Was it cold, going after ${name(m.targetId!)}? Maybe. It had to be done.`])));
        if (w.hohRoomSafe.includes(id) && !everyNom.includes(id)) lines.push("I went up to the HoH room and came back down with a promise. And it held.");

        if (evicted) {
            const votes = voteCount(id);
            lines.push(
                totalVotes > 0
                    ? pick(key("out"), [
                          `I'm out, ${votes} vote${votes === 1 ? "" : "s"} to ${totalVotes - votes}. ${getById(gs, id).isJury ? "See you all at the finale." : "I'm not done being mad about it."}`,
                          `${votes} of ${totalVotes} votes. I didn't see that coming. ${getById(gs, id).isJury ? "The jury house is going to hear about this." : ""}`,
                      ])
                    : `My game is over. ${getById(gs, id).isJury ? "I'll have my say on the jury." : ""}`
            );
        }

        if (lines.length === 0 && w.playerIds.includes(id))
            lines.push(pick(key("quiet"), ["Quiet week for me. In this house, that's the best kind.", "I stayed off everyone's radar this week. Exactly the plan.", "Nobody came for me this week. I'll take it."]));
        if (lines.length > 0) entries.push({ week: w.week, id, lines: lines.map((l) => l.trim()).filter((l) => l.length > 0) });
    });
    return entries;
}

// The whole season as plain text, to copy and share.
export function recapText(input: {
    gameState: GameState;
    history: WeekRecord[];
    diary: DiaryEntry[];
    winnerId?: number;
    battleBack?: { id: number; week: number };
}): string {
    const gs = input.gameState;
    const hg = (id: number): Houseguest => getById(gs, id);
    const name = (id: number) => hg(id).name;
    const out: string[] = [];
    out.push("📺 SEASON RECAP");
    if (input.winnerId !== undefined) out.push(`🏆 Winner: ${name(input.winnerId)}`);
    out.push("");
    const weeks = Array.from(new Set([...input.history.map((w) => w.week), ...input.diary.map((d) => d.week)])).sort((a, b) => a - b);
    weeks.forEach((week) => {
        const rec = input.history.find((w) => w.week === week);
        out.push(`— Week ${week} —`);
        if (rec) {
            if (rec.hohId !== undefined) out.push(`👑 ${HOH}: ${name(rec.hohId)}`);
            if (rec.nomineeIds.length) out.push(`🎯 On the block: ${listNames(rec.nomineeIds.map(name))}`);
            if (rec.povId !== undefined) out.push(`🏅 Veto: ${name(rec.povId)}`);
            if (rec.blockbusterId !== undefined) out.push(`🎬 Last Chance comp: ${name(rec.blockbusterId)}`);
            if (rec.evictedIds.length) out.push(`🚪 Evicted: ${listNames(rec.evictedIds.map(name))}`);
        }
        if (input.battleBack && input.battleBack.week === week + 1) out.push(`🔙 ${name(input.battleBack.id)} won the Battle Back and returned to the house!`);
        input.diary
            .filter((d) => d.week === week)
            .forEach((d) => out.push(`📔 ${name(d.id)}: "${d.lines.join(" ")}"`));
        out.push("");
    });
    return out.join("\n").trim() + "\n";
}
