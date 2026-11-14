interface InitPlayerProfile {
    readonly name: string;
    readonly imageURL: string;
    readonly social?: number;
    readonly comp?: number;
}

// A returning houseguest's last season, in short.
export interface PastSeason {
    placement: number;
    castSize: number;
    won: boolean;
    comps: number; // comp wins
    story: string; // "Won a 12-person season", "Runner-up of 16", "First out of 12"...
    // what happened between them and the player they shared that season with (by the player's name)
    withPlayer?: { name: string; feeling: number; why: string };
}

// Stats range from MIN_STAT to MAX_STAT. DEFAULT_STAT is neutral (no advantage or disadvantage).
export const MIN_STAT = 1;
export const MAX_STAT = 10;
export const DEFAULT_STAT = 5;

export class PlayerProfile {
    public name: string = "";
    public imageURL: string = "";
    public castingScreenId?: number | undefined = 0;
    // High social: other houseguests like you more, so you make more friends and get more jury votes.
    public social?: number = DEFAULT_STAT;
    // High comp: you win more competitions.
    public comp?: number = DEFAULT_STAT;
    // Hall seasons: the same bot as in the season they came from (see career/halls.ts)
    public personality?: string;
    public throws?: number;
    // All-Stars: what they did in the season they're coming back from (see career/halls.ts)
    public past?: PastSeason;
    constructor(init: InitPlayerProfile) {
        if (!init) {
            return;
        }
        Object.assign(this, init);
    }
}

export function clampStat(n: number | undefined): number {
    if (n === undefined || isNaN(n)) return DEFAULT_STAT;
    return Math.min(MAX_STAT, Math.max(MIN_STAT, Math.round(n)));
}

export function getSocial(profile: { social?: number }): number {
    return clampStat(profile.social);
}

export function getComp(profile: { comp?: number }): number {
    return clampStat(profile.comp);
}
