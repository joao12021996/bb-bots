import { BehaviorSubject } from "rxjs";

// Things this device remembers between visits: settings, best scores, stats, achievements. Never required:
// storage can be unavailable (private windows, blocked site data), and then nothing is remembered.

const PREFIX = "bbb-pref:";

export function loadPref<T>(key: string, fallback: T): T {
    try {
        const json = window.localStorage.getItem(PREFIX + key);
        if (json === null) return fallback;
        const value = JSON.parse(json);
        return value === null || value === undefined ? fallback : (value as T);
    } catch (e) {
        return fallback;
    }
}

export function savePref<T>(key: string, value: T) {
    try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
        // fine: it just won't be remembered
    }
}

export function clearPref(key: string) {
    try {
        window.localStorage.removeItem(PREFIX + key);
    } catch (e) {
        // fine
    }
}

// A remembered setting that screens can follow as it changes.
export function prefSubject<T>(key: string, fallback: T): BehaviorSubject<T> {
    const subject = new BehaviorSubject<T>(loadPref(key, fallback));
    subject.subscribe((value) => savePref(key, value));
    return subject;
}

// Players' best scores in each comp, on this device (scores are always higher-is-better).
export function bestScore(compId: string): number | undefined {
    const bests = loadPref<{ [id: string]: number }>("bests", {});
    return bests[compId];
}

// Records a score; true if it's a new best.
export function recordScore(compId: string, score: number): boolean {
    const bests = loadPref<{ [id: string]: number }>("bests", {});
    const old = bests[compId];
    if (old !== undefined && old >= score) return false;
    bests[compId] = score;
    savePref("bests", bests);
    return true;
}
