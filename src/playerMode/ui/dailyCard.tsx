import React from "react";
import { dailyBest, dailyKey, dailyNumber, dailyResult, dailyShareText, dailyStreak, msUntilNextDaily } from "../../career/daily";
import { ordinal } from "../../career/career";
import { loadPref, savePref } from "../../prefs/prefs";
import { listSaves } from "../save/serialize";
import { t } from "../../i18n/i18n";

function untilNext(ms: number): string {
    const minutes = Math.ceil(ms / 60000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// The daily season: today's, to play or to pick back up; or today's result, to share.
// `onPlay` and `onResume` are wired by the start screen (left out at the end of a season: there's only a result).
export function DailyCard(props: { onPlay?: (name: string) => void; onResume?: (id: string) => void }): JSX.Element | null {
    const key = dailyKey();
    const [name, setName] = React.useState(() => loadPref<string>("dailyName", ""));
    const [copied, setCopied] = React.useState(false);
    const [, tick] = React.useState(0);
    React.useEffect(() => {
        const timer = setInterval(() => tick((n) => n + 1), 30000);
        return () => clearInterval(timer);
    }, []);
    const result = dailyResult(key);
    const streak = dailyStreak(key);
    const best = dailyBest();
    // today's season, still going on this device
    const going = !result && props.onResume ? listSaves().find((s) => s.daily === key) : undefined;

    const share = async () => {
        if (!result) return;
        const text = dailyShareText(result, streak);
        try {
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (e) {
            // the box below has the text, to copy by hand
        }
    };

    if (!result && !props.onPlay) return null;
    return (
        <div className="bbb-daily">
            <h3>
                📅 {t("Today's season")} <small className="bbb-subtle">#{dailyNumber(key)}</small>
            </h3>
            {result ? (
                <>
                    <p>
                        {result.won
                            ? t("You won today's season. Come back tomorrow for a new house.")
                            : t("You finished {place} of {n} today. Come back tomorrow for a new house.", { place: ordinal(result.placement), n: result.castSize })}
                    </p>
                    <pre className="bbb-daily-share">{dailyShareText(result, streak)}</pre>
                    <div className="bbb-daily-row">
                        <button type="button" className="button is-warning" onClick={share}>
                            {copied ? `✅ ${t("Copied")}` : `📤 ${t("Share your result")}`}
                        </button>
                        <small className="bbb-subtle">
                            {t("Next season in {time}", { time: untilNext(msUntilNextDaily()) })}
                            {best.played > 1 && ` · ${t("{n} played", { n: best.played })} · ${t("{n} won", { n: best.wins })}`}
                        </small>
                    </div>
                </>
            ) : (
                <>
                    <p>
                        {t(
                            "One season a day, the same for everyone: the same eleven houseguests, the same comps, the same twists. How far can you get? Share your result and compare."
                        )}
                    </p>
                    {going ? (
                        <div className="bbb-daily-row">
                            <button type="button" className="button is-warning" onClick={() => props.onResume!(going.id)}>
                                ▶ {t("Carry on (week {week})", { week: going.week })}
                            </button>
                        </div>
                    ) : (
                        <form
                            className="bbb-daily-row"
                            onSubmit={(e) => {
                                e.preventDefault();
                                const clean = name.trim();
                                if (!clean) return;
                                savePref("dailyName", clean);
                                props.onPlay!(clean);
                            }}
                        >
                            <input
                                className="input"
                                type="text"
                                maxLength={24}
                                aria-label={t("Your name")}
                                placeholder={t("Your name")}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <button type="submit" className="button is-warning" disabled={!name.trim()}>
                                {t("Play today's season")}
                            </button>
                        </form>
                    )}
                    <small className="bbb-subtle">
                        {streak > 0 && `🔥 ${t("{n} days in a row", { n: streak })} · `}
                        {t("A new one in {time}", { time: untilNext(msUntilNextDaily()) })}
                    </small>
                </>
            )}
        </div>
    );
}
