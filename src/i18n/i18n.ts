import React from "react";
import { BehaviorSubject } from "rxjs";
import { loadPref, savePref } from "../prefs/prefs";
import { FR } from "./fr";

// Translations. Text is written in English in the code and wrapped in t(): the English is the key, so anything
// without a translation simply stays in English. Placeholders like {name} are filled from `vars`.
//
// To add a language: add it to LANGUAGES, write a dictionary like fr.ts (English → translation), and add it to
// DICTIONARIES. Missing entries fall back to English, so a translation can be done a screen at a time.

export type Lang = "en" | "fr";

export const LANGUAGES: { id: Lang; label: string }[] = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
];

const DICTIONARIES: { [lang in Lang]?: { [english: string]: string } } = { fr: FR };

function detect(): Lang {
    try {
        const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
        return nav.toLowerCase().startsWith("fr") ? "fr" : "en";
    } catch (e) {
        return "en";
    }
}

function initial(): Lang {
    const saved = loadPref<string | null>("language", null);
    return LANGUAGES.some((l) => l.id === saved) ? (saved as Lang) : detect();
}

export const language$ = new BehaviorSubject<Lang>(initial());

export function setLanguage(lang: Lang) {
    savePref("language", lang);
    language$.next(lang);
}

language$.subscribe((lang) => {
    if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = lang;
});

export function t(english: string, vars?: { [key: string]: string | number }): string {
    const dict = DICTIONARIES[language$.value];
    let text = (dict && dict[english]) || english;
    if (vars) Object.keys(vars).forEach((k) => (text = text.split(`{${k}}`).join(String(vars[k]))));
    return text;
}

// The language, for components that should re-render when it changes.
export function useLanguage(): Lang {
    const [lang, setLang] = React.useState(language$.value);
    React.useEffect(() => {
        const sub = language$.subscribe((l) => setLang(() => l));
        return () => sub.unsubscribe();
    }, []);
    return lang;
}

// Every English string that has a translation, for tests.
export function translated(lang: Lang): string[] {
    return Object.keys(DICTIONARIES[lang] || {});
}
