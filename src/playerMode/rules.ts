import { CompKind } from "./comps/compTypes";

// The season's rules, set up before it starts. Anything left out uses the default.

export type Difficulty = "easy" | "normal" | "hard" | "cutthroat";

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
    { id: "easy", label: "Casual", blurb: "Bots are weaker in comps, believe what they're told, keep their word, and often vote with their gut." },
    { id: "normal", label: "Normal", blurb: "Bots play comps like real people of their skill, and go after big threats as the season goes on." },
    { id: "hard", label: "Hard", blurb: "Bots are sharper in comps, and ruthlessly target threats with their nominations and votes." },
    {
        id: "cutthroat",
        label: "Cutthroat",
        blurb: "Bots are at their best in comps, hunt threats from day one, doubt everything you say, and break promises when it suits them.",
    },
];

export function difficultyLabel(d: Difficulty): string {
    const found = DIFFICULTIES.find((x) => x.id === d);
    return found ? found.label : d;
}

export const COMP_KINDS: { kind: CompKind; label: string }[] = [
    { kind: "skill", label: "🧠 Skill" },
    { kind: "memory", label: "🧩 Memory" },
    { kind: "reflex", label: "⚡ Reflex" },
    { kind: "quiz", label: "❓ Quiz" },
    { kind: "endurance", label: "🧗 Endurance" },
    { kind: "luck", label: "🎲 Luck" },
];

export type SpecialFormat = "knockout" | "taintedWine" | "memoryDuel";

export const SPECIAL_FORMATS: { id: SpecialFormat; label: string }[] = [
    { id: "knockout", label: "🥊 Knockout duels" },
    { id: "taintedWine", label: "🍷 Tainted Wine" },
    { id: "memoryDuel", label: "🃏 Memory Duel" },
];

export interface SeasonRules {
    lastChance: boolean; // big weeks: three nominees, and a Last Chance comp after the veto
    actions: number; // social actions per block
    kinds: CompKind[]; // which kinds of weekly comp can come up
    formats: SpecialFormat[]; // which special comp formats can come up
    together: boolean; // online: everyone's social time at once (off: players take turns)
}

export const DEFAULT_RULES: SeasonRules = {
    lastChance: true,
    actions: 3,
    kinds: COMP_KINDS.map((k) => k.kind),
    formats: SPECIAL_FORMATS.map((f) => f.id),
    together: true,
};

export const MIN_ACTIONS = 1;
export const MAX_ACTIONS = 6;

export function withDefaults(rules?: Partial<SeasonRules>): SeasonRules {
    const r = { ...DEFAULT_RULES, ...(rules || {}) };
    return {
        lastChance: !!r.lastChance,
        actions: Math.max(MIN_ACTIONS, Math.min(MAX_ACTIONS, Math.round(r.actions))),
        kinds: r.kinds.length > 0 ? r.kinds : DEFAULT_RULES.kinds,
        formats: r.formats,
        together: r.together !== false,
    };
}

export function isDefaultRules(rules: SeasonRules): boolean {
    return JSON.stringify(withDefaults(rules)) === JSON.stringify(DEFAULT_RULES);
}
