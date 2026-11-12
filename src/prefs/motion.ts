import { prefSubject } from "./prefs";

// Less motion: the device's own setting, or the switch in ⚙️ Settings. Animations become instant.
export const reduceMotion$ = prefSubject<boolean>("reduceMotion", false);

export function reducedMotion(): boolean {
    if (reduceMotion$.value) return true;
    try {
        return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
        return false;
    }
}

reduceMotion$.subscribe((on) => {
    if (typeof document === "undefined" || !document.body) return;
    document.body.classList.toggle("bbb-reduce-motion", on);
});
