import React from "react";
import { PlayerModeController } from "../playerModeController";

// The live feeds: what the house has been up to lately, one line at a time.
export function LiveFeed(props: { controller: PlayerModeController }) {
    const lines = props.controller.feedLines();
    const [index, setIndex] = React.useState(Math.max(0, lines.length - 1));
    React.useEffect(() => {
        if (lines.length < 2) return;
        const t = setInterval(() => setIndex((i) => (i + 1) % lines.length), 4500);
        return () => clearInterval(t);
    }, [lines.length]);
    if (lines.length === 0) return null;
    const line = lines[Math.min(index, lines.length - 1)];
    return (
        <div className="bbb-feed" aria-live="polite">
            <span className="bbb-feed-live">📺 LIVE</span>
            <span className="bbb-feed-day">Day {line.day}</span>
            <span className="bbb-feed-text" key={`${index}:${line.text}`}>
                {line.text}
            </span>
        </div>
    );
}
