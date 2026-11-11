import { hashcode, rng } from "../utils";

// Player mode reseeds the shared random generator before almost every decision, from keys like
// "…:vote:5" and "…:vote:6". Their hashes are consecutive integers, and xorshift128+ gives nearly the same
// first draws for nearby seeds, so neighbouring decisions came out correlated. Mixing the hash first
// (murmur3's finalizer) makes every key's draws independent.
export function mixSeed(h: number): number {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h | 0;
}

export function seedRng(key: string) {
    rng().seed(mixSeed(hashcode(key)));
}
