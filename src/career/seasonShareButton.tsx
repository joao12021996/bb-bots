import React from "react";
import { encodeSeason, seasonLink, SharedSeason } from "./seasonShare";

// At the end of a season: a link anyone can open to watch it back, week by week.
export function ShareSeasonLink(props: { season: SharedSeason }): JSX.Element {
    const [status, setStatus] = React.useState<"idle" | "copied" | "show">("idle");
    const link = React.useMemo(() => seasonLink(encodeSeason(props.season)), [props.season]);
    const share = async () => {
        try {
            const nav = navigator as any;
            if (nav.share) {
                await nav.share({ title: "Watch my season", url: link });
                return;
            }
            await navigator.clipboard.writeText(link);
            setStatus("copied");
            setTimeout(() => setStatus("idle"), 2500);
        } catch (e) {
            // no sharing, no clipboard (or it was turned down): show the link to copy by hand
            setStatus("show");
        }
    };
    return (
        <div className="bbb-share-season">
            <button type="button" className="button is-light is-small" onClick={share}>
                {status === "copied" ? "✅ Link copied" : "🔗 A link to watch this season"}
            </button>
            <small className="bbb-subtle">Anyone who opens it sees the season play back week by week.</small>
            {status === "show" && <input className="input is-small" type="text" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="The link to this season" />}
        </div>
    );
}
