import { BehaviorSubject } from "rxjs";
import { prefSubject } from "./prefs";

// Light or dark: the device's own setting unless the player picks one in ⚙️ Settings.
export type ThemeChoice = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

export const themeChoice$ = prefSubject<ThemeChoice>("theme", "system");

function deviceQuery(): MediaQueryList | null {
    try {
        return window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    } catch (e) {
        return null;
    }
}

function resolve(choice: ThemeChoice): Scheme {
    if (choice !== "system") return choice;
    const query = deviceQuery();
    return query && query.matches ? "light" : "dark";
}

// The scheme on screen right now.
export const scheme$ = new BehaviorSubject<Scheme>(resolve(themeChoice$.value));

themeChoice$.subscribe((choice) => scheme$.value !== resolve(choice) && scheme$.next(resolve(choice)));

// follow the device when it switches (e.g. at sunset), if the player left it on "system"
const query = deviceQuery();
if (query) {
    const onChange = () => themeChoice$.value === "system" && scheme$.value !== resolve("system") && scheme$.next(resolve("system"));
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if ((query as any).addListener) (query as any).addListener(onChange);
}

scheme$.subscribe((scheme) => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", scheme);
});
