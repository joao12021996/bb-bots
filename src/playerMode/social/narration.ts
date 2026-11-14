import { GameState, getById, Houseguest } from "../../model";
import { WeekRecord } from "../history";
import { HOH, LAST_CHANCE, SHOW_NAME, VETO } from "../terms";
import { listNames } from "../../utils/listStrings";

// The host: "Previously on…", "But first…", and the live eviction night framing.

// Last week, in a few lines. `secretHohName`: last week's secret Head of Household, revealed now.
export function previouslyOn(gs: GameState, last: WeekRecord | undefined, extra: string[], secretHohName?: string): string[] {
    if (!last) return [`Welcome to ${SHOW_NAME}. ${gs.houseguests.length} houseguests, one house, and only one winner.`];
    const name = (id: number) => getById(gs, id).name;
    const lines = [`🎬 Previously on ${SHOW_NAME}…`];
    if (last.hohId !== undefined) {
        lines.push(
            secretHohName
                ? `Nobody knew who the ${HOH} was. Tonight we can reveal it: it was ${secretHohName}.`
                : `${name(last.hohId)} won ${HOH} and put ${listNames(last.nomineeIds.map(name))} on the block.`
        );
    }
    if (last.povId !== undefined) lines.push(`${name(last.povId)} won the ${VETO}.`);
    if (last.blockbusterId !== undefined) lines.push(`${name(last.blockbusterId)} won the ${LAST_CHANCE} and came off the block.`);
    lines.push(...extra);
    if (last.evictedIds.length > 0) lines.push(`And in the end, ${listNames(last.evictedIds.map(name))} walked out the door.`);
    lines.push("Tonight: a new week, and a new Head of Household. But first, let's see how the house is taking it…");
    return lines;
}

// Eviction night, before the speeches and the vote.
export function evictionIntro(nominees: Houseguest[], remaining: number): string[] {
    return [
        `🎙️ Good evening, and welcome to a live eviction night on ${SHOW_NAME}.`,
        `Tonight, one of ${listNames(nominees.map((n) => n.name))} will be evicted, and ${remaining - 1} houseguests will remain.`,
        "But first, the nominees get one last chance to make their case. Then it's time for the live vote.",
    ];
}

// Finale night, before the jury votes.
export function finaleIntro(finalists: Houseguest[], jurors: number): string[] {
    return [
        `🎙️ Welcome to the finale of ${SHOW_NAME}!`,
        `${listNames(finalists.map((f) => f.name))} have outlasted everyone. Tonight, ${jurors} jurors decide who wins.`,
        "But first, the jury gets one last chance to talk it over.",
    ];
}
