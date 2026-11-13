import React from "react";
import { Hall, HALL_MIN, loadHalls } from "../../career/halls";
import { PlayerProfile } from "../../model";
import { t } from "../../i18n/i18n";

// Casting: a season of every past first boot, or every past winner, as the same bots they were.
export function HallButtons(props: { onLoad: (cast: PlayerProfile[]) => void }) {
    const halls = loadHalls();
    const button = (hall: Hall, label: string) => {
        const n = halls[hall].length;
        const short = n < HALL_MIN;
        return (
            <button
                type="button"
                className="button is-small is-light"
                disabled={short}
                title={short ? t("Needs {n} seasons played in Player Mode", { n: HALL_MIN }) : undefined}
                onClick={() => props.onLoad(halls[hall].map((e) => ({ ...e.profile })))}
            >
                {label} ({n})
            </button>
        );
    };
    return (
        <div className="bbb-cast-share-buttons">
            {button("losers", `🥾 ${t("Hall of Losers")}`)}
            {button("winners", `🏆 ${t("Hall of Winners")}`)}
        </div>
    );
}
