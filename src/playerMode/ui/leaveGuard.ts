import { playerModeScreen$ } from "../../subjects/subjects";
import { getActiveController } from "../playerModeController";
import { sessionFor } from "../net/netSession";

// Leaving a season that's in progress: ask first.

export function gameInProgress(): boolean {
    return !!playerModeScreen$.value;
}

function online(): boolean {
    const controller = getActiveController();
    return !!controller && !!sessionFor(controller);
}

// True if it's fine to leave the season's screen. `ends`: leaving ends the season on this device (a new cast).
export function okToLeaveGame(ends: boolean): boolean {
    if (!gameInProgress()) return true;
    const message = online()
        ? "You're in the middle of an online season. If you leave, a bot plays for you until you come back. Leave anyway?"
        : ends
        ? "You're in the middle of a season. It's saved: you can resume it from the start screen. Leave anyway?"
        : "You're in the middle of a season. Leave it for now? (You can go back to it from the top bar.)";
    try {
        return window.confirm(message);
    } catch (e) {
        return true; // no dialogs (tests)
    }
}

// Closing the tab or reloading during a season: the browser asks first.
let installed = false;
export function installLeaveWarning() {
    if (installed || typeof window === "undefined") return;
    installed = true;
    window.addEventListener("beforeunload", (e) => {
        if (!gameInProgress()) return;
        e.preventDefault();
        e.returnValue = "";
    });
}
