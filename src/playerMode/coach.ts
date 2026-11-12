import { HOH, LAST_CHANCE, VETO } from "./terms";

// The coach: in a guided season, a short tip the first time each part of the week comes up. Tips never change
// what happens in the game; they only explain it.

export interface Tip {
    id: string;
    title: string;
    lines: string[];
}

const TIPS: { [id: string]: Omit<Tip, "id"> } = {
    welcome: {
        title: "Welcome to the house!",
        lines: [
            "Each week has the same rhythm: a competition crowns the Head of House, they nominate, the Veto can save someone, and the house votes one nominee out.",
            "Stay off the block, make friends, win when it counts, and get to the final two. Then the evicted houseguests on the jury pick the winner.",
            "I'll pop up the first time each part of the week comes around. You can turn me off whenever you like.",
        ],
    },
    social: {
        title: "Social time",
        lines: [
            "Between competitions you get a few actions. Spend them talking to houseguests: chatting builds a bond, and you can ask what they think or who they're after.",
            "Your read on someone (the emoji next to their name) is your best guess at how they feel about you. It can go stale, so check in.",
            "Bots remember everything: what you promised, who you were seen with, and whether you kept your word.",
        ],
    },
    alliance: {
        title: "Alliances",
        lines: [
            "An alliance is a group that agrees to protect each other. Members suggest targets and vote together, mostly.",
            "Invite houseguests who like you. Too many alliances and people start to notice you're playing every side.",
        ],
    },
    comp: {
        title: "Your first competition",
        lines: [
            "Competitions are real mini-games: what you score is what you get. The bots play the same game, with scores that depend on their Comp skill.",
            "Read the instructions on the next screen, then give it your best. If you lose, the social game can still keep you safe.",
        ],
    },
    hoh: {
        title: `${HOH}`,
        lines: [
            `The ${HOH} is safe for the week and picks who goes on the block. Winning keeps you safe, but every nominee will remember it was you.`,
            "You can't win it two weeks in a row.",
        ],
    },
    hohVisit: {
        title: `Visiting the ${HOH}`,
        lines: [
            `Before nominations, houseguests go up to the ${HOH}'s room to plead their case. Going up can keep you off the block, especially if you two get along.`,
            "Offer a deal (your safety for theirs next week) if you need to. Just remember you'll be expected to keep it.",
        ],
    },
    hohRoom: {
        title: "Your room, your rules",
        lines: [
            "As Head of House, people come up to your room to make their case. Listen: who's scared tells you who's guilty.",
            "Promising safety is free now and costly later. A broken promise is remembered by the whole house.",
        ],
    },
    nominate: {
        title: "Nominations",
        lines: [
            "Pick who goes on the block. One of them is likely to leave this week, unless the Veto saves them.",
            "Nominate a big threat and you might take them out, but miss and they'll come for you. Some HoHs nominate a 'pawn' they don't want gone, as cover.",
        ],
    },
    noms: {
        title: "Nominations",
        lines: [
            `The ${HOH} has named the nominees. If you're on the block, don't panic: win the ${VETO} or win the votes.`,
            "If you're safe, think about who you'd rather see go, and who'd be grateful if you helped them stay.",
        ],
    },
    veto: {
        title: `The ${VETO}`,
        lines: [
            `The ${HOH}, the nominees and a few houseguests drawn at random play for the ${VETO}. The winner can take a nominee off the block.`,
            `Then the ${HOH} names a replacement, so using it always puts someone else in danger.`,
        ],
    },
    useVeto: {
        title: `Using the ${VETO}`,
        lines: [
            "Save a nominee, or keep the nominations the same. Saving an ally earns their loyalty. Saving someone the HoH wanted gone makes an enemy.",
            "If you're on the block yourself, use it on yourself.",
        ],
    },
    lastChance: {
        title: `The ${LAST_CHANCE}`,
        lines: [
            `In big weeks there are three nominees. After the ${VETO}, they play one more comp, and the winner comes off the block.`,
            "That leaves two nominees for the vote.",
        ],
    },
    speeches: {
        title: "Eviction speeches",
        lines: [
            "Nominees get one last speech before the vote. Keep it gracious, promise safety to win a vote, or call out the nominee next to you. Each lands differently with each voter.",
        ],
    },
    vote: {
        title: "Your vote",
        lines: [
            "Voting is secret, but the house will try to work out who voted which way. Voting against the house paints a target on your back.",
            "If you promised someone your vote, breaking that promise is a backstab they won't forget.",
        ],
    },
    eviction: {
        title: "Eviction night",
        lines: [
            "The house votes and the nominee with the most votes leaves. If it ties, the Head of House breaks the tie.",
            "Later in the season, evicted houseguests join the jury. Keep them happy: they decide the winner.",
        ],
    },
    finale: {
        title: "The final three",
        lines: [
            `The final ${HOH} is played in three parts. The winner of Part 3 takes one person to the final two and evicts the other.`,
            "Who you take matters: the jury is more likely to vote for whoever played the better game.",
        ],
    },
    jury: {
        title: "Facing the jury",
        lines: [
            "The jury asks the finalists questions, then votes for a winner. Own your big moves, be honest about your betrayals, and speak to what each juror cares about.",
            "Jurors you backstabbed are bitter. Jurors you were loyal to remember that too.",
        ],
    },
};

export const TIP_IDS = Object.keys(TIPS);

export function tip(id: string): Tip {
    return { id, ...TIPS[id] };
}

// What the coach could say about a screen: a tip id for each kind of screen, and for each step of the week
// (which covers the screens everyone watches).
export function tipIdsFor(prompt: { kind: string; title?: string; sceneTitle?: string }, step: string, week: number): string[] {
    const ids: string[] = [];
    const title = prompt.title || prompt.sceneTitle || "";
    if (week <= 1) ids.push("welcome"); // the first thing the coach says, whatever the first screen is
    switch (prompt.kind) {
        case "scene":
            if (/Eviction/.test(title) && !/Speech/.test(title)) ids.push("eviction");
            break;
        case "social":
            ids.push("social");
            break;
        case "alliance":
            ids.push("alliance");
            break;
        case "hohVisit":
            ids.push("hohVisit");
            break;
        case "hohRoom":
            ids.push("hohRoom");
            break;
        case "compPlay":
        case "knockout":
        case "memoryDuel":
        case "winePour":
            ids.push("comp");
            break;
        case "speech":
            if (/Eviction/.test(title)) ids.push("speeches");
            break;
        case "choose":
            if (/Nomination Ceremony/.test(title)) ids.push("nominate");
            else if (/Veto Ceremony/.test(title)) ids.push("useVeto");
            else if (/Live Eviction/.test(title)) ids.push("vote");
            break;
    }
    const byStep: { [step: string]: string } = {
        Hoh: "hoh",
        Noms: "noms",
        Veto: "veto",
        Blockbuster: "lastChance",
        Speeches: "speeches",
        Eviction: "eviction",
        FinaleHoh1: "finale",
        FinalTwo: "jury",
        Jury: "jury",
    };
    if (byStep[step]) ids.push(byStep[step]);
    // while choosing nominees, "noms" (about being nominated) doesn't fit
    if (ids.includes("nominate")) return ids.filter((id) => id !== "noms");
    return ids;
}

// The first tip for this screen the player hasn't seen yet.
export function nextTip(ids: string[], seen: string[]): Tip | null {
    const id = ids.find((x) => TIPS[x] && !seen.includes(x));
    return id ? tip(id) : null;
}
