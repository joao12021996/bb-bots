import { getComp, getSocial, Houseguest } from "../../model";
import { hashcode } from "../../utils";

// Everyone sees everyone else's game a little differently. Comp wins are facts, but how good someone *really*
// is at comps, and whether their social game is a threat or just friendliness, is in the eye of the beholder:
// - every pair has its own blind spot (a stable over- or under-estimate, the same all season)
// - sharp social players read people better (smaller blind spots)
// - people you like seem less dangerous (their charm is "genuine"); people you can't stand seem more so
//   ("they're playing everyone").

type Person = Pick<Houseguest, "id" | "name" | "relationships"> & Partial<Houseguest>;

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// A stable number in [-1, 1] for this observer, target and aspect.
function blindSpot(observer: Person, target: Person, aspect: string): number {
    const h = hashcode(`${observer.id}:${observer.name}|${target.id}:${target.name}|${aspect}`);
    return ((Math.abs(h) % 2001) - 1000) / 1000;
}

// How far off someone's read of others can be, in skill points (out of 10).
function readError(observer: Person): number {
    return clamp(3.2 - 0.25 * getSocial(observer as Houseguest), 0.8, 3);
}

function feelings(observer: Person, target: Person): number {
    return observer.relationships[target.id] ?? 0;
}

// How good at comps the observer thinks the target is (0 to 10, before counting their actual wins).
export function perceivedComp(observer: Person, target: Person): number {
    if (observer.id === target.id) return getComp(target as Houseguest);
    const seen = getComp(target as Houseguest) + readError(observer) * blindSpot(observer, target, "comp") - 0.8 * feelings(observer, target);
    return clamp(seen, 0, 10);
}

// How strong (and dangerous) the observer thinks the target's social game is (0 to 10).
export function perceivedSocial(observer: Person, target: Person): number {
    if (observer.id === target.id) return getSocial(target as Houseguest);
    const seen = getSocial(target as Houseguest) + readError(observer) * blindSpot(observer, target, "social") - 2 * feelings(observer, target);
    return clamp(seen, 0, 10);
}

// The observer's take, in words, for players' reads.
export function perceptionLabel(observer: Person, target: Person): { comp: string; social: string } {
    const comp = perceivedComp(observer, target) + 1.5 * ((target.hohWins || 0) + (target.povWins || 0));
    const social = perceivedSocial(observer, target);
    return {
        comp: comp >= 8 ? "a comp beast" : comp >= 6 ? "good at comps" : comp >= 4 ? "average at comps" : "no comp threat",
        social: social >= 7.5 ? "running the house socially" : social >= 5.5 ? "playing a good social game" : social >= 3.5 ? "flying under the radar" : "no social threat",
    };
}
