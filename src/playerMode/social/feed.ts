import { GameState, getById, Houseguest, nonEvictedHouseguests } from "../../model";
import { Rand } from "../comps/random";
import { PersonalityId } from "./personality";
import { Showmance } from "./showmance";

// The live feeds: short, observable updates about what the house is up to. Only what a camera would see
// (who's hanging out with whom, who's in the HoH room, who's pacing), never anyone's numbers. Players'
// own actions are theirs to keep: the feed only follows the bots.

export interface FeedLine {
    day: number;
    text: string;
}

const PLACES = ["in the backyard", "by the pool", "in the kitchen", "on the hammock", "in the bathroom", "in the storage room", "on the couch"];

const SOLO: { [p in PersonalityId]: string[] } = {
    mastermind: ["is quietly watching everyone from the kitchen.", "is doing laps around the backyard, thinking."],
    compBeast: ["is working out in the backyard gym.", "is practicing for the next comp. Again."],
    floater: ["is napping on the hammock.", "is floating in the pool, as usual."],
    loyalSoldier: ["is cooking dinner for the whole house.", "is doing everyone's dishes."],
    villain: ["is complaining loudly about the dishes.", "slammed a door. Nobody knows why."],
    superfan: ["is talking to the cameras about the game.", "is reciting comp history to anyone who'll listen."],
    wildcard: ["is wearing a costume for no apparent reason.", "is having a conversation with the house plants."],
    charmer: ["is flirting with the camera.", "is doing their hair in the mirror. Again."],
    paranoid: ["is listening at the bedroom door.", "is counting who sat with whom at dinner."],
    sweetheart: ["is baking cookies for the whole house.", "is writing a kind note for someone who had a rough day."],
    clown: ["is putting on a talent show nobody asked for.", "is wearing a lampshade, and the house loves it."],
    rookie: ["is reading the house rules. Again.", "just found out the backyard has a pool, and is thrilled."],
    gossip: ["is going from room to room with news.", "is whispering in the storage room. With whom keeps changing."],
    hunter: ["is keeping a tally of comp wins on a napkin.", "is running drills in the backyard and glaring at the hammock."],
    diplomat: ["is making peace between two people who argued at breakfast.", "is checking in on everyone, one at a time."],
};

export interface FeedContext {
    humanIds: number[];
    hohId?: number;
    secretHoh?: boolean;
    nomineeIds: number[];
    showmances: Showmance[];
    personalities: { [id: number]: PersonalityId };
    rivalries?: Rivalry[];
}

// Two houseguests who blew up at each other and haven't made up: the house knows, and so does the feed.
export interface Rivalry {
    a: number;
    b: number;
    week: number; // when it started
}

const FEUDING = [
    "{a} walked out of the kitchen the moment {b} walked in.",
    "{a} and {b} still aren't speaking.",
    "{a} is telling anyone who'll listen what {b} said. Again.",
    "{a} and {b} are at opposite ends of the backyard, pointedly.",
    "{b} rolled their eyes when {a} started talking at dinner.",
];

const SMITTEN = [
    "{a} and {b} are cuddled up {place}.",
    "{a} made {b} breakfast. The house is rolling its eyes.",
    "{a} and {b} have been whispering {place} for an hour, and it isn't about the game.",
    "{a} is wearing {b}'s hoodie.",
];

// Rivals who've made up: both feel all right about each other again.
export function madeUp(gs: GameState, r: Rivalry): boolean {
    const a = getById(gs, r.a);
    const b = getById(gs, r.b);
    return a.relationships[b.id] > -0.15 && b.relationships[a.id] > -0.15;
}

// A few lines for the feed, from what the house is doing right now.
export function houseFeed(gs: GameState, ctx: FeedContext, rand: Rand): string[] {
    const house = nonEvictedHouseguests(gs);
    const bots = house.filter((hg) => !ctx.humanIds.includes(hg.id));
    if (bots.length === 0) return [];
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const lines: string[] = [];
    const bestFriend = (hg: Houseguest) =>
        house.filter((o) => o.id !== hg.id).sort((a, b) => hg.relationships[b.id] - hg.relationships[a.id])[0];
    // a couple of bots hanging out
    const a = pick(bots);
    const b = bestFriend(a);
    if (b) lines.push(`${a.name} and ${b.name} are whispering ${pick(PLACES)}.`);
    // someone doing their thing
    const solo = pick(bots);
    const p = ctx.personalities[solo.id];
    if (p) lines.push(`${solo.name} ${pick(SOLO[p])}`);
    // a showmance
    const fill = (line: string, a: number, b: number) =>
        line.split("{a}").join(getById(gs, a).name).split("{b}").join(getById(gs, b).name).split("{place}").join(pick(PLACES));
    const couples = ctx.showmances.filter((s) => !getById(gs, s.a).isEvicted && !getById(gs, s.b).isEvicted);
    if (couples.length > 0 && rand() < 0.6) {
        const couple = pick(couples);
        lines.push(rand() < 0.5 ? fill(pick(SMITTEN), couple.a, couple.b) : fill(pick(SMITTEN), couple.b, couple.a));
    }
    // a feud
    const feuds = (ctx.rivalries || []).filter((r) => !getById(gs, r.a).isEvicted && !getById(gs, r.b).isEvicted);
    if (feuds.length > 0 && rand() < 0.6) {
        const feud = pick(feuds);
        lines.push(rand() < 0.5 ? fill(pick(FEUDING), feud.a, feud.b) : fill(pick(FEUDING), feud.b, feud.a));
    }
    // the HoH room, unless the HoH is a secret
    if (ctx.hohId !== undefined && !ctx.secretHoh && !ctx.humanIds.includes(ctx.hohId) && rand() < 0.7) {
        const hoh = getById(gs, ctx.hohId);
        const guest = bestFriend(hoh);
        if (guest) lines.push(`${hoh.name} is up in the HoH room with ${guest.name}.`);
    }
    // the nominees
    const nom = ctx.nomineeIds.map((id) => getById(gs, id)).find((hg) => !hg.isEvicted && !ctx.humanIds.includes(hg.id));
    if (nom && rand() < 0.7) lines.push(`${nom.name} is pacing in the bedroom. Being on the block will do that.`);
    return lines;
}
