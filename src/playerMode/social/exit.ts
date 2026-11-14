import { GameState, getById } from "../../model";
import { WeekRecord } from "../history";
import { capitalize } from "./reasons";

// "Why you went home": what an evicted player is told on their way out. The vote stays secret in the house, but
// the one who's leaving gets the whole chain: who put them up and why, which bots voted them out and why, who
// looked them in the eye and lied about it, and what they might do differently next time.

export interface ExitFacts {
    gs: GameState;
    week: WeekRecord; // the week they were evicted
    evictedId: number;
    humanIds: number[]; // players' votes stay secret, even from the evicted
    nominatorId?: number; // who put them on the block (undefined: nobody knows)
    replacement: boolean; // they went up after the veto
    said: { [voterId: number]: number }; // what voters told them they'd do, when asked
    allies: number[]; // their alliance members still in the house
    compWins: number;
    timesNominated: number;
    brokenPromises: number;
    threatRank: number; // 0: the biggest threat in the house, as the house sees it (-1: unknown)
    houseSize: number; // before the eviction
}

export interface ExitReport {
    headline: string;
    block: string[]; // how they ended up on the block
    against: { name: string; why: string; lied: boolean }[]; // bots who voted them out
    kept: string[]; // bots who voted to keep them
    secretVotes: number; // votes from players: not shown
    lessons: string[];
}

export function exitReport(f: ExitFacts): ExitReport {
    const { gs, week, evictedId } = f;
    const name = (id: number) => getById(gs, id).name;
    const tally = week.votes || {};
    const mine = tally[evictedId] ?? 0;
    const others = Object.keys(tally)
        .map(Number)
        .filter((id) => id !== evictedId)
        .map((id) => tally[id]);
    const headline = others.length > 0 ? `You were evicted by a vote of ${mine} to ${others.join(" to ")}.` : "You were evicted.";

    const block: string[] = [];
    const why = week.why && week.why.noms ? week.why.noms[evictedId] : undefined;
    if (f.nominatorId === undefined) block.push("Nobody knows who put you on the block this week.");
    else if (f.replacement) block.push(`${name(f.nominatorId)} put you up after the veto was used: a backdoor. You never got to play for the veto.`);
    else block.push(`${name(f.nominatorId)} nominated you.`);
    if (why) block.push(`The reason: ${why}.`);

    const votes = (week.why && week.why.votes) || {};
    const voterIds = Object.keys(votes).map(Number);
    const against = voterIds
        .filter((v) => votes[v].t === evictedId)
        .map((v) => ({ name: name(v), why: capitalize(votes[v].why), lied: f.said[v] !== undefined && f.said[v] !== evictedId }));
    const kept = voterIds.filter((v) => votes[v].t !== evictedId).map(name);
    const secretVotes = Math.max(0, mine - against.length);

    const lessons: string[] = [];
    const liars = against.filter((a) => a.lied);
    if (liars.length > 0)
        lessons.push(
            `${liars.map((l) => l.name).join(" and ")} told you they were keeping you, and voted you out. A count is only as good as the people in it: lean on the ones who've kept their word before.`
        );
    const turned = voterIds.filter((v) => votes[v].t === evictedId && f.allies.includes(v));
    if (turned.length > 0) lessons.push(`Your own alliance turned on you: ${turned.map(name).join(", ")} voted you out. An alliance that never meets about a target drifts apart.`);
    else if (f.allies.length === 0) lessons.push("You had no alliance left in the house. Nobody was obliged to keep you, and nobody did the counting for you.");
    if (f.threatRank >= 0 && f.threatRank < Math.max(1, Math.ceil(f.houseSize / 4)))
        lessons.push(
            f.compWins >= 2
                ? `The house saw you as one of its biggest threats (${f.compWins} comp wins). Winning everything early makes you the easy name: it's fine to lose one you don't need.`
                : "The house saw you as one of its biggest threats: well liked, with friends everywhere. That's a target too, once people start thinking about the end."
        );
    if (f.brokenPromises > 0)
        lessons.push(`You broke your word ${f.brokenPromises === 1 ? "once" : `${f.brokenPromises} times`} this season. People stopped believing your deals, and a nominee with no deals has nothing to campaign with.`);
    if (f.replacement) lessons.push("You were backdoored: the plan was made in the HoH room before the veto. Visiting the Head of Household, and being close to whoever wins the veto, is how you hear about it in time.");
    if (f.timesNominated >= 3) lessons.push(`This was your ${f.timesNominated === 3 ? "third" : `${f.timesNominated}th`} time on the block. Surviving it is impressive, but every time costs you: the house gets used to seeing your name up there.`);
    if (mine > 0 && kept.length + 1 >= mine && against.length > 0 && lessons.length < 3)
        lessons.push(`It was close. ${against.length === 1 ? "One more vote" : "A vote or two"} your way and you'd still be in the house: campaign time is worth spending on the people in the middle.`);
    if (lessons.length === 0) lessons.push("Sometimes it's just your week: the wrong person won Head of Household. Next time, make sure whoever wins has a reason to look elsewhere.");
    return { headline, block, against, kept, secretVotes, lessons: lessons.slice(0, 4) };
}
