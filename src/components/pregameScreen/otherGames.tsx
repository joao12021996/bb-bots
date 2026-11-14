import React from "react";
import { t } from "../../i18n/i18n";

// The other games on spotlegame.co.uk. Full links, so they work wherever this copy of the game is hosted.
const GAMES = [
    { emoji: "🟩", name: "Spotle", blurb: "The incognito daily word puzzle", url: "https://spotlegame.co.uk/" },
    { emoji: "6️⃣", name: "6potle", blurb: "Spotle with six-letter words", url: "https://spotlegame.co.uk/six" },
    { emoji: "🔎", name: "Find Donald", blurb: "Spot Donald Trump in the White House crowd, against the clock", url: "https://spotlegame.co.uk/finddonald/" },
];

export function OtherGames(): JSX.Element {
    return (
        <div className="bbb-mode-card bbb-public-games">
            <h3>🕹️ {t("Other games")}</h3>
            <div className="bbb-public-list">
                {GAMES.map((g) => (
                    <a key={g.name} className="bbb-public-game bbb-other-game" href={g.url}>
                        <span>
                            <b>
                                {g.emoji} {g.name}
                            </b>
                            <small className="bbb-subtle">{t(g.blurb)}</small>
                        </span>
                        <span aria-hidden="true">→</span>
                    </a>
                ))}
            </div>
        </div>
    );
}
