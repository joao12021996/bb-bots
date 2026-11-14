import { BehaviorSubject } from "rxjs";

// Whether someone is at this tab: it's on screen and has been used lately. A public game is only listed on
// the front page while its host is here, so the list doesn't fill up with houses nobody is running.

export const AWAY_HIDDEN_MS = 5 * 60 * 1000; // tab in the background (or the phone locked) this long: away
export const AWAY_IDLE_MS = 30 * 60 * 1000; // on screen but nobody's touched it this long: away

export const present$ = new BehaviorSubject<boolean>(true);

let timer: any = null;
let lastInput = Date.now();

function check() {
    clearTimeout(timer);
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (hidden) {
        // a little grace: the host may be in WhatsApp sending the invite
        timer = setTimeout(() => set(false), AWAY_HIDDEN_MS);
        return;
    }
    const idle = Date.now() - lastInput;
    if (idle >= AWAY_IDLE_MS) return set(false);
    set(true);
    timer = setTimeout(check, AWAY_IDLE_MS - idle);
}

function set(value: boolean) {
    if (present$.value !== value) present$.next(value);
}

let lastSeen = 0;
function input() {
    lastInput = Date.now();
    // input comes in bursts: only recheck when it brings the tab back, or now and then
    if (!present$.value || lastInput - lastSeen > 60000) {
        lastSeen = lastInput;
        check();
    }
}

// not in tests: they run whole seasons on fake clocks, and nobody is ever "at" a test
if (typeof document !== "undefined" && typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
    document.addEventListener("visibilitychange", check);
    ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"].forEach((e) => window.addEventListener(e, input, { passive: true, capture: true }));
    check();
}
