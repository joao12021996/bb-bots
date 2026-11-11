import { getComp, getSocial, Houseguest } from "../../model";
import { hashcode } from "../../utils";
import { mixSeed } from "../seeding";
import { seededRand } from "../comps/random";

// Bot personalities. Each one plays differently (comp effort, loyalty, lying, scheming, how much they
// socialize), hides its true feelings to a different degree, and talks in its own voice.
// Personalities are secret until the end of the season; their dialogue gives them away.

export type PersonalityId = "mastermind" | "compBeast" | "floater" | "loyalSoldier" | "villain" | "superfan" | "wildcard";

export interface PersonalityInfo {
    id: PersonalityId;
    label: string;
    emoji: string;
    blurb: string;
    fake: number; // how far they hide their real feelings behind friendliness (negative: they act colder than they feel)
    lies: number; // multiplies their chance of lying about their vote
    honor: number; // added to their chance of keeping their word
    compBoost: number; // added to their comp performance percentile
    throws: number; // multiplies their chance of throwing a comp
    scheming: number; // multiplies how often they turn their friends against their targets
    chats: number; // multiplies how often they socialize
}

export const PERSONALITIES: { [id in PersonalityId]: PersonalityInfo } = {
    mastermind: {
        id: "mastermind",
        label: "Mastermind",
        emoji: "🧠",
        blurb: "Plays three moves ahead, smiles at everyone, and lets others get blood on their hands.",
        fake: 0.7,
        lies: 1.5,
        honor: -0.1,
        compBoost: 0,
        throws: 1.6,
        scheming: 2,
        chats: 1.2,
    },
    compBeast: {
        id: "compBeast",
        label: "Comp Beast",
        emoji: "💪",
        blurb: "Lives for competitions and never throws one. Goes after other comp threats.",
        fake: 0.15,
        lies: 0.8,
        honor: 0,
        compBoost: 0.1,
        throws: 0,
        scheming: 0.6,
        chats: 0.8,
    },
    floater: {
        id: "floater",
        label: "Floater",
        emoji: "🛟",
        blurb: "Friendly with everyone, loyal to no one, and happy to lose a comp to stay out of trouble.",
        fake: 0.6,
        lies: 1.2,
        honor: -0.05,
        compBoost: -0.05,
        throws: 2,
        scheming: 0.3,
        chats: 1.6,
    },
    loyalSoldier: {
        id: "loyalSoldier",
        label: "Loyal Soldier",
        emoji: "🫡",
        blurb: "Keeps their word, wears their heart on their sleeve, and rarely lies.",
        fake: 0.05,
        lies: 0.3,
        honor: 0.25,
        compBoost: 0,
        throws: 0.5,
        scheming: 0.8,
        chats: 1,
    },
    villain: {
        id: "villain",
        label: "Villain",
        emoji: "😈",
        blurb: "Abrasive, vindictive and proud of it. Goes after whoever they can't stand.",
        fake: -0.3,
        lies: 1.4,
        honor: -0.25,
        compBoost: 0.03,
        throws: 0.3,
        scheming: 1.6,
        chats: 0.7,
    },
    superfan: {
        id: "superfan",
        label: "Superfan",
        emoji: "📺",
        blurb: "Has watched every season. Great at quizzes, loves a big move, talks about the game constantly.",
        fake: 0.3,
        lies: 0.9,
        honor: 0.05,
        compBoost: 0.02,
        throws: 0.7,
        scheming: 1.2,
        chats: 1.4,
    },
    wildcard: {
        id: "wildcard",
        label: "Wildcard",
        emoji: "🃏",
        blurb: "Nobody knows what they'll do next, including them.",
        fake: 0.2,
        lies: 1.2,
        honor: 0,
        compBoost: 0,
        throws: 1,
        scheming: 1,
        chats: 1,
    },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

// A stable pseudo-random number in [0, 1) for a key.
export function hash01(key: string): number {
    return ((mixSeed(hashcode(key)) >>> 0) % 1000000) / 1000000;
}

// Gives every bot a personality, leaning on their stats (social players scheme, comp players compete),
// and avoiding a house full of one type.
export function assignPersonalities(bots: Houseguest[], seed: number): { [id: number]: PersonalityId } {
    const rand = seededRand(mixSeed(seed) >>> 0 || 1);
    const used: { [p: string]: number } = {};
    const out: { [id: number]: PersonalityId } = {};
    bots.forEach((hg) => {
        const social = getSocial(hg);
        const comp = getComp(hg);
        const base: { [p in PersonalityId]: number } = {
            mastermind: social * 0.8,
            compBeast: comp * 1.1,
            floater: (11 - comp) * 0.5 + social * 0.3,
            loyalSoldier: 5,
            villain: 3,
            superfan: 4,
            wildcard: 3,
        };
        const weights = PERSONALITY_IDS.map((p) => base[p] / (1 + 2 * (used[p] || 0)));
        let roll = rand() * weights.reduce((a, b) => a + b, 0);
        let choice: PersonalityId = PERSONALITY_IDS[PERSONALITY_IDS.length - 1];
        for (let i = 0; i < PERSONALITY_IDS.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                choice = PERSONALITY_IDS[i];
                break;
            }
        }
        used[choice] = (used[choice] || 0) + 1;
        out[hg.id] = choice;
    });
    return out;
}

// How friendly a bot acts toward someone, which isn't always how it feels. `revealed`: the mask slipped
// (it nominated you, or broke its word to you), so you see the truth for now.
export function apparentRelationship(trueRel: number, p: PersonalityId | undefined, key: string, revealed: boolean): number {
    if (!p) return trueRel;
    let fake = PERSONALITIES[p].fake;
    if (p === "wildcard") fake = -0.3 + hash01(`${key}:mood`); // changes week to week
    if (revealed) fake = 0;
    const noise = (hash01(key) - 0.5) * 0.16;
    return Math.max(-1, Math.min(1, trueRel + fake * (0.45 - trueRel) + noise));
}

// ---------- dialogue ----------

export type Situation = "chat" | "pitch" | "final2" | "votePlea" | "voteAnswer" | "hohVisit" | "flirt";

const LINES: { [p in PersonalityId]: { [s in Situation]: string[] } } = {
    mastermind: {
        chat: [
            "pulled you aside to talk strategy, and somehow you did most of the talking.",
            "asked a lot of very specific questions about who you're close with.",
            "brought you coffee and a plan.",
        ],
        pitch: ["Think three moves ahead with me.", "I've done the math, and it only works one way."],
        final2: ["You and me are the two smartest people in this house. Final two?"],
        votePlea: ["Keep me, and I'll make sure you never see the block. I always have a plan."],
        voteAnswer: ["Between us? {name} has to go.", "Off the record: {name}."],
        hohVisit: ["Congratulations. Now, let's talk about how you use this.", "Big week. Let's make sure it's the right move."],
        flirt: ["smiled, but you get the feeling they're calculating something."],
    },
    compBeast: {
        chat: ["challenged you to a push-up contest by the pool.", "talked your ear off about the last comp, rep by rep."],
        pitch: ["I'm not scared of anyone in a comp, but still.", "I'd beat them anyway, but why risk it?"],
        final2: ["Nobody can beat us in a comp. Final two, and we run the table."],
        votePlea: ["Keep me, and I'll win the next HoH and keep you safe. You've seen what I can do."],
        voteAnswer: ["{name}. Simple.", "{name}. I don't overthink it."],
        hohVisit: ["Enjoy it. I'm winning the next one.", "Good comp. Next one's mine, though."],
        flirt: ["flexed. Was that flirting? It might have been flirting."],
    },
    floater: {
        chat: ["hung out with you on the hammock, like they do with everyone.", "agreed with everything you said, which was nice."],
        pitch: ["Everybody's saying it, not just me.", "I'm just repeating what I heard."],
        final2: ["I'm with whoever you're with. Final two?"],
        votePlea: ["I've never come after anyone. Please keep me?"],
        voteAnswer: ["I'm going with the house. So, {name}.", "Whatever everyone else is doing. {name}, I think?"],
        hohVisit: ["Whatever you decide, I'm good with it!", "I'm cool with anything, just so you know."],
        flirt: ["laughed at all your jokes. They laugh at everyone's jokes, though."],
    },
    loyalSoldier: {
        chat: ["told you they'd take a bullet for their people.", "made you breakfast and asked how your alliance is holding up."],
        pitch: ["For the good of the group.", "I wouldn't say it if I didn't mean it."],
        final2: ["When I give my word, I keep it. Final two, ride or die."],
        votePlea: ["I've been loyal since day one. Keep me and I'll prove it again."],
        voteAnswer: ["{name}. You have my word.", "{name}. I don't lie about my vote."],
        hohVisit: ["Whatever you need from me, I'm in.", "I'm proud of you. Tell me what you need."],
        flirt: ["blushed and changed the subject, but they meant it."],
    },
    villain: {
        chat: ["made a snide comment about everyone else, then smiled at you.", "told you exactly who in this house they can't stand."],
        pitch: ["I'll say what everyone's thinking.", "Somebody has to say it, so I will."],
        final2: ["I'd rather sit next to you than any of these clowns. Don't make me regret it."],
        votePlea: ["Keep me, or I'll make this house miserable for whoever's left."],
        voteAnswer: ["{name}, obviously. Did you even have to ask?", "{name}. And I'll tell them to their face."],
        hohVisit: ["Nice win. Don't screw this up.", "Don't waste it on someone harmless."],
        flirt: ["rolled their eyes, then sat a little closer."],
    },
    superfan: {
        chat: [
            "explained, at length, why this is already one of the all-time great seasons.",
            "quizzed you on twists from past seasons.",
        ],
        pitch: ["This is textbook. Every great player knows it.", "If you've watched this show, you know what happens next."],
        final2: ["Final two deals are how legends are made. You and me?"],
        votePlea: ["I've watched this show my whole life. Please don't let it end like this."],
        voteAnswer: ["Classic vote. {name}.", "The fans would want {name} gone."],
        hohVisit: ["I've dreamed about seeing this room! Okay, okay, focus.", "This is a huge moment for your game. Huge."],
        flirt: ["said a showmance would be 'so iconic' and didn't seem to be joking."],
    },
    wildcard: {
        chat: [
            "talked to you for an hour about absolutely nothing. You're still not sure what happened.",
            "announced they might do something crazy this week.",
        ],
        pitch: ["Hear me out, this is going to sound wild.", "New idea. Just go with it."],
        final2: ["Final two? Sure, why not! Probably!"],
        votePlea: ["Keep me. It'll be way more fun, I promise."],
        voteAnswer: ["Today? {name}. Ask me again tomorrow.", "{name}. Or not. No, {name}."],
        hohVisit: ["Nominate whoever. I'm just here for the snacks.", "Can I jump on the bed? Also, congrats."],
        flirt: ["kissed you on the cheek and ran off. What does that mean?"],
    },
};

// A line in this personality's voice. `{name}` is filled in.
export function voice(p: PersonalityId | undefined, situation: Situation, key: string, name: string = ""): string {
    const lines = LINES[p || "loyalSoldier"][situation];
    return lines[Math.floor(hash01(key) * lines.length)].split("{name}").join(name);
}
