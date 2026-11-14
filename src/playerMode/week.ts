import { DAY_PART } from "./days";

// The steps of a season, and everything about them in one table: the social blocks (their names and what comes
// after them), where each step falls in the week, the real-time breaks, and which blocks have the nominations set.

export enum Step {
    BattleBack = "BattleBack", // evicted houseguests compete to come back, before the week starts
    WeekStart = "WeekStart",
    SocialMorning = "SocialMorning",
    Hoh = "Hoh",
    AllianceHoh = "AllianceHoh", // alliances meet once the new HoH is known, before nominations
    HohRoom = "HohRoom",
    Noms = "Noms",
    PawnTalk = "PawnTalk",
    SocialAfternoon = "SocialAfternoon",
    Veto = "Veto",
    SocialVeto = "SocialVeto", // after the veto comp: the nominees and the HoH work on the veto holder
    VetoCeremony = "VetoCeremony",
    SocialBlockbuster = "SocialBlockbuster",
    Blockbuster = "Blockbuster",
    SocialCampaign = "SocialCampaign",
    Speeches = "Speeches",
    Eviction = "Eviction",
    Fallout = "Fallout",
    SocialFinale1 = "SocialFinale1",
    FinaleHoh1 = "FinaleHoh1",
    SocialFinale2 = "SocialFinale2",
    FinaleHoh2 = "FinaleHoh2",
    SocialFinale3 = "SocialFinale3",
    FinaleHoh3 = "FinaleHoh3",
    FinalEviction = "FinalEviction",
    FinalTwo = "FinalTwo",
    Jury = "Jury",
    GameOver = "GameOver",
}

interface StepInfo {
    block?: string; // a social block: its name
    then?: Step; // a social block: the step after it
    day?: number; // where in the week it happens (see DAY_PART); left out: eviction night
    noms?: boolean; // a social block with the nominations already set
    breakFor?: string; // real time: the season takes a break before it, and this is what players wait for
}

// A regular week, in order.
export const REGULAR_WEEK: Step[] = [
    Step.SocialMorning,
    Step.Hoh,
    Step.AllianceHoh,
    Step.HohRoom,
    Step.Noms,
    Step.PawnTalk,
    Step.SocialAfternoon,
    Step.Veto,
    Step.SocialVeto,
    Step.VetoCeremony,
    Step.SocialBlockbuster,
    Step.Blockbuster,
    Step.SocialCampaign,
    Step.Speeches,
    Step.Eviction,
];

// The final three, in order.
export const FINAL_THREE: Step[] = [
    Step.SocialFinale1,
    Step.FinaleHoh1,
    Step.SocialFinale2,
    Step.FinaleHoh2,
    Step.SocialFinale3,
    Step.FinaleHoh3,
    Step.FinalEviction,
];

const STEPS: { [step: string]: StepInfo } = {
    [Step.SocialMorning]: { block: "Morning in the house", then: Step.Hoh, day: DAY_PART.hoh },
    [Step.Hoh]: { day: DAY_PART.hoh, breakFor: "the Head of Household comp" },
    [Step.AllianceHoh]: { day: DAY_PART.nominations },
    [Step.HohRoom]: { day: DAY_PART.nominations },
    [Step.Noms]: { day: DAY_PART.nominations },
    [Step.PawnTalk]: { day: DAY_PART.nominations },
    [Step.SocialAfternoon]: {
        block: "Afternoon in the house",
        then: Step.Veto,
        day: DAY_PART.veto,
        noms: true,
    },
    [Step.Veto]: { day: DAY_PART.veto, breakFor: "the Veto comp" },
    [Step.SocialVeto]: {
        block: "Before the Veto Ceremony",
        then: Step.VetoCeremony,
        day: DAY_PART.vetoCeremony,
        noms: true,
    },
    [Step.VetoCeremony]: { day: DAY_PART.vetoCeremony },
    [Step.SocialBlockbuster]: {
        block: "Before the Last Chance comp",
        then: Step.Blockbuster,
        day: DAY_PART.blockbuster,
        noms: true,
    },
    [Step.Blockbuster]: { day: DAY_PART.blockbuster },
    [Step.SocialCampaign]: { block: "Campaign time", then: Step.Speeches, noms: true },
    [Step.Eviction]: { breakFor: "eviction night" },
    [Step.SocialFinale1]: { block: "Final 3: before Part 1", then: Step.FinaleHoh1, day: 0 },
    [Step.FinaleHoh1]: { day: 0, breakFor: "Part 1 of the final Head of Household comp" },
    [Step.SocialFinale2]: { block: "Final 3: before Part 2", then: Step.FinaleHoh2, day: 0.35 },
    [Step.FinaleHoh2]: { day: 0.35, breakFor: "Part 2 of the final Head of Household comp" },
    [Step.SocialFinale3]: { block: "Final 3: before Part 3", then: Step.FinaleHoh3, day: 0.7 },
    [Step.FinaleHoh3]: { day: 0.7, breakFor: "Part 3 of the final Head of Household comp" },
    [Step.FinalTwo]: { breakFor: "finale night" },
};

function info(step: Step): StepInfo {
    return STEPS[step] || {};
}

// A social block's name (undefined: not a social block).
export function blockName(step: Step): string | undefined {
    return info(step).block;
}

export function isSocialStep(step: Step): boolean {
    return blockName(step) !== undefined;
}

// What comes after a social block.
export function afterSocial(step: Step): Step {
    const then = info(step).then;
    if (!then) throw new Error(`${step} isn't a social block`);
    return then;
}

// Where in the week a step falls (DAY_PART.hoh: the week's first day; DAY_PART.eviction: eviction night).
export function dayPartOf(step: Step): number {
    const day = info(step).day;
    return day === undefined ? DAY_PART.eviction : day;
}

// A social block the nominations are already set for.
export function nomsSetStep(step: Step): boolean {
    return !!info(step).noms;
}

// Real time: what players wait for during the break before a step (undefined: no break before it).
export function breakBefore(step: Step): string | undefined {
    return info(step).breakFor;
}

// Weeks with 7 or more houseguests are Blockbuster weeks: three nominees, the veto, then the Blockbuster.
export const BLOCKBUSTER_MIN_PLAYERS = 7;
