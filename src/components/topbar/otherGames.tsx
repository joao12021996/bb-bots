import React from "react";
import { t } from "../../i18n/i18n";

// The other games on spotlegame.co.uk. Full links, so they work wherever this copy of the game is hosted.
const GAMES = [
    { emoji: "🟩", name: "Spotle", blurb: "The incognito daily word puzzle", url: "https://spotlegame.co.uk/" },
    { emoji: "6️⃣", name: "6potle", blurb: "Spotle with six-letter words", url: "https://spotlegame.co.uk/six" },
    { emoji: "🔎", name: "Find Donald", blurb: "Spot Donald Trump in the White House crowd, against the clock", url: "https://spotlegame.co.uk/finddonald/" },
];

// Top bar: "Other games", opening a small panel of links. Closes on Escape or a click outside it.
export function OtherGamesMenu(): JSX.Element {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLSpanElement>(null);
    React.useEffect(() => {
        if (!open) return;
        const outside = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
        document.addEventListener("mousedown", outside);
        return () => document.removeEventListener("mousedown", outside);
    }, [open]);
    return (
        <span className="bbb-settings bbb-other-games" ref={ref} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
            <button type="button" className="bbb-nav-button" aria-expanded={open} onClick={() => setOpen(!open)}>
                🕹️ {t("Other games")} ▾
            </button>
            {open && (
                <div className="bbb-settings-panel bbb-other-games-panel" role="menu" aria-label={t("Other games")}>
                    {GAMES.map((g) => (
                        <a key={g.name} className="bbb-other-game" role="menuitem" href={g.url}>
                            <b>
                                {g.emoji} {g.name}
                            </b>
                            <small className="bbb-subtle">{t(g.blurb)}</small>
                        </a>
                    ))}
                </div>
            )}
        </span>
    );
}
