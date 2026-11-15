import { prefSubject } from "../../prefs/prefs";

// Online seasons played slowly (a day between comps, friends in different time zones): the game tells you when
// it's your move, or when someone writes to you, while its tab is in the background.
//
// These are the browser's own notifications, shown by the open tab. There is no server pushing them: with the
// tab closed, nothing arrives (a bot plays for you once your time runs out, as always).

export const notify$ = prefSubject<boolean>("notify", false);

export type NotifyState = "on" | "off" | "blocked" | "unsupported";

function api(): any {
    try {
        return typeof window !== "undefined" ? (window as any).Notification : undefined;
    } catch (e) {
        return undefined;
    }
}

export function notifyState(): NotifyState {
    const N = api();
    if (!N) return "unsupported";
    if (N.permission === "denied") return "blocked";
    return notify$.value && N.permission === "granted" ? "on" : "off";
}

// Turns them on (asking the browser's permission the first time) or off. Resolves to how things stand after.
export async function setNotifications(on: boolean): Promise<NotifyState> {
    const N = api();
    if (!N) return "unsupported";
    if (!on) {
        notify$.next(false);
        return "off";
    }
    let permission = N.permission;
    if (permission === "default") {
        try {
            permission = await N.requestPermission();
        } catch (e) {
            permission = "denied";
        }
    }
    notify$.next(permission === "granted");
    return notifyState();
}

function hidden(): boolean {
    try {
        return document.hidden;
    } catch (e) {
        return false;
    }
}

// The tab's title while something's waiting: "● Your move · …". Put back when the player looks.
let titleBefore: string | null = null;
function flagTitle(text: string) {
    try {
        if (titleBefore === null) titleBefore = document.title;
        document.title = `● ${text} · ${titleBefore}`;
    } catch (e) {
        // fine
    }
}
export function clearTitleFlag() {
    try {
        if (titleBefore !== null) document.title = titleBefore;
    } catch (e) {
        // fine
    }
    titleBefore = null;
}

// Tells the player, if they're not looking at the game. `tag`: a newer notice of the same kind replaces the old
// one instead of piling up. Returns whether anything was shown (tests).
export function tell(title: string, body: string, tag: string): boolean {
    if (!hidden()) return false;
    flagTitle(title);
    if (notifyState() !== "on") return false;
    try {
        const N = api();
        const n = new N(title, { body, tag, renotify: true });
        n.onclick = () => {
            try {
                window.focus();
                n.close();
            } catch (e) {
                // fine
            }
        };
        return true;
    } catch (e) {
        return false; // some browsers only allow notifications from a service worker
    }
}

// What a device needs to know to decide: whether it's this player's move (and what the move is), and the
// messages they can read. Kept apart from the session so it can be tested on its own.
export interface TurnWatcher {
    update: (turn: string | null, describe: () => string) => void; // `turn`: a key for what's being asked (null: nothing)
    chat: (messages: { id: string; from: number; text: string }[], me: number | null, nameOf: (id: number) => string) => void;
}

export function turnWatcher(say: (title: string, body: string, tag: string) => void = tell): TurnWatcher {
    let lastTurn: string | null = null;
    let seen: Set<string> | null = null; // the messages already there when watching began
    return {
        update: (turn, describe) => {
            if (turn !== null && turn !== lastTurn) say("Your move", describe(), "turn");
            lastTurn = turn;
        },
        chat: (messages, me, nameOf) => {
            if (seen === null) {
                seen = new Set(messages.map((m) => m.id));
                return;
            }
            messages
                .filter((m) => !seen!.has(m.id))
                .forEach((m) => {
                    seen!.add(m.id);
                    if (m.from !== me) say(nameOf(m.from), m.text.slice(0, 120), "chat");
                });
        },
    };
}
