// Seeded randomness for competitions, so every player in a pass-and-play game gets the same layout,
// and a resumed comp is the same comp.
export type Rand = () => number; // [0, 1)

export function seededRand(seed: number): Rand {
    let a = seed >>> 0 || 1;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randInt(rand: Rand, min: number, max: number): number {
    return min + Math.floor(rand() * (max - min + 1));
}

export function pick<T>(rand: Rand, arr: T[]): T {
    return arr[Math.floor(rand() * arr.length)];
}

export function shuffled<T>(rand: Rand, arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function sample<T>(rand: Rand, arr: T[], k: number): T[] {
    return shuffled(rand, arr).slice(0, Math.min(k, arr.length));
}
