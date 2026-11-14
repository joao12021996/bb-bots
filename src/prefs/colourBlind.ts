import React from "react";
import { prefSubject } from "./prefs";

// Colour-blind mode (⚙️ Settings): nothing in the game is told apart by colour alone. Comps that are played by
// colour add a shape or a written name to every colour, and use colours that stay distinct for the common kinds
// of colour blindness. It only changes how this device draws things: the comps themselves (their questions,
// cards and covers) stay the same for everyone, so it works online too.
export const colourBlind$ = prefSubject<boolean>("colourBlind", false);

export function useColourBlind(): boolean {
    const [on, setOn] = React.useState(colourBlind$.value);
    React.useEffect(() => {
        const sub = colourBlind$.subscribe(setOn);
        return () => sub.unsubscribe();
    }, []);
    return on;
}

// The colours used on comic covers and costumes, by name (see iconicComps.tsx).
const NAMES: { [hex: string]: string } = {
    // cover backgrounds
    "#b91c1c": "RED",
    "#1d4ed8": "BLUE",
    "#047857": "GREEN",
    "#7e22ce": "PURPLE",
    "#c2410c": "ORANGE",
    "#0f766e": "TEAL",
    "#be185d": "PINK",
    // heroes' suits
    "#dc2626": "RED",
    "#2563eb": "BLUE",
    "#16a34a": "GREEN",
    "#9333ea": "PURPLE",
    "#ea580c": "ORANGE",
    "#0891b2": "CYAN",
    "#facc15": "YELLOW",
    "#db2777": "PINK",
    // villains' suits
    "#111827": "BLACK",
    "#4c1d95": "VIOLET",
    "#14532d": "FOREST",
    "#7f1d1d": "MAROON",
    "#1e1b4b": "NAVY",
    "#3f3f46": "GREY",
    "#365314": "OLIVE",
    "#701a75": "PLUM",
    // capes
    "#991b1b": "CRIMSON",
    "#1e3a8a": "ROYAL",
    "#f8fafc": "WHITE",
    none: "NONE",
};

export function colourName(hex: string): string {
    return NAMES[hex.toLowerCase()] || hex;
}
