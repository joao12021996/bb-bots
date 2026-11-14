// A copy of everything this device remembers (stats, achievements, halls, best scores, settings and saved
// seasons), as a file: a backup, or the way to move to another phone or browser.
//
// What counts as "ours" in the browser's storage: the prefs (bbb-pref:...), the saved seasons and their index.
// Online games in progress and chat logs are left out: they belong to a room that the other device isn't in.

const OURS = (key: string) => key.startsWith("bbb-pref:") || key.startsWith("bb-bots-save:") || key === "bb-bots-saves" || key === "bb-bots-player-save";

export const BACKUP_KIND = "houseguest-bots-backup";

export interface Backup {
    kind: typeof BACKUP_KIND;
    version: 1;
    when: number;
    items: { [key: string]: string };
}

export function makeBackup(): Backup {
    const items: { [key: string]: string } = {};
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !OURS(key)) continue;
            const value = window.localStorage.getItem(key);
            if (value !== null) items[key] = value;
        }
    } catch (e) {
        // storage is blocked: an empty backup
    }
    return { kind: BACKUP_KIND, version: 1, when: Date.now(), items };
}

export function parseBackup(text: string): Backup | null {
    try {
        const b = JSON.parse(text);
        if (!b || b.kind !== BACKUP_KIND || typeof b.items !== "object" || !b.items) return null;
        const items: { [key: string]: string } = {};
        Object.keys(b.items).forEach((key) => {
            if (OURS(key) && typeof b.items[key] === "string") items[key] = b.items[key];
        });
        return { kind: BACKUP_KIND, version: 1, when: Number(b.when) || 0, items };
    } catch (e) {
        return null;
    }
}

// What a backup holds, to show before it replaces what's here.
export function describeBackup(b: Backup): { seasons: number; achievements: number; saves: number } {
    let seasons = 0;
    let achievements = 0;
    try {
        const career = JSON.parse(b.items["bbb-pref:career"] || "null");
        seasons = (career && career.seasons && career.seasons.length) || 0;
        achievements = (career && career.unlocked && Object.keys(career.unlocked).length) || 0;
    } catch (e) {
        // no career in it
    }
    return { seasons, achievements, saves: Object.keys(b.items).filter((k) => k.startsWith("bb-bots-save:")).length };
}

// Replaces what this device remembers with the backup. False: there wasn't room (what was here is put back).
export function restoreBackup(b: Backup): boolean {
    const before = makeBackup();
    const wipe = () => Object.keys(makeBackup().items).forEach((key) => window.localStorage.removeItem(key));
    try {
        wipe();
        Object.keys(b.items).forEach((key) => window.localStorage.setItem(key, b.items[key]));
        return true;
    } catch (e) {
        try {
            wipe();
            Object.keys(before.items).forEach((key) => window.localStorage.setItem(key, before.items[key]));
        } catch (e2) {
            // nothing more to try
        }
        return false;
    }
}

// Hands the player a file to keep.
export function downloadText(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Asks the player for a file, and reads it (null: they picked nothing, or it couldn't be read).
export function pickTextFile(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        };
        input.click();
    });
}
