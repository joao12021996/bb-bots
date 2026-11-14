import React from "react";
import { HasText } from "../layout/text";
import { t } from "../../i18n/i18n";
import { shareCounts$ } from "../../analytics/analytics";

export const CONTACT_EMAIL = "spotlegame@gmail.com";

// Whether ads (and their consent manager) are loaded on this copy of the game: see public/index.html.
function adsOn(): boolean {
    try {
        return !!(window as any).bbbAds;
    } catch (e) {
        return false;
    }
}

// Privacy: what the game keeps, where, and what leaves the device. Kept in step with what the code does:
// prefs.ts and serialize.ts (this device), room.ts and server/relay.js (online), analytics.ts (play counts),
// public/index.html (ads and fonts).
export function PrivacyPage(): JSX.Element {
    const [counts, setCounts] = React.useState(shareCounts$.value);
    React.useEffect(() => {
        const sub = shareCounts$.subscribe(setCounts);
        return () => sub.unsubscribe();
    }, []);
    return (
        <HasText>
            <div className="bbb-tutorial bbb-privacy">
                <div className="bbb-hero">
                    <div className="bbb-hero-kicker">{t("Privacy")}</div>
                    <h1>{t("What the game knows about you")}</h1>
                    <p>{t("Short version: there are no accounts, your seasons stay on your device, and we never learn who you are.")}</p>
                </div>

                <section className="bbb-tutorial-section">
                    <h2>💾 {t("On your device")}</h2>
                    <p>
                        {t(
                            "The game remembers things in your browser's storage, on this device only: your saved seasons, your stats and achievements, the Hall of Winners and Hall of Losers, your best comp scores, your settings, and the name you last used online. None of it is sent to us."
                        )}
                    </p>
                    <p>
                        {t(
                            "To erase it: Reset my stats on the My Stats page clears your career, and clearing this site's data in your browser clears everything. You can also save a copy to a file, or move it to another device, from My Stats."
                        )}
                    </p>
                </section>

                <section className="bbb-tutorial-section">
                    <h2>🌐 {t("Online games")}</h2>
                    <p>
                        {t(
                            "When you host or join an online game, your device talks to the other players' devices through our relay server. The relay passes messages along and does not keep them. The other players in your game see the name you chose, your houseguest's picture (including a photo, if you uploaded one), your chat messages, and what you do in the game."
                        )}
                    </p>
                    <p>
                        {t(
                            "A public game is listed on the start screen for anyone to join, with the host's name. Like any web server, the relay sees the internet address of each connection while it lasts; it uses it only to limit abuse, and does not store it."
                        )}
                    </p>
                </section>

                <section className="bbb-tutorial-section">
                    <h2>📊 {t("Anonymous play counts")}</h2>
                    <p>
                        {t(
                            "To see where people stop playing, the game sends our own server simple counts: a visit, a season started (and its difficulty and size), which week a season reached, which comps were played, and the week and step someone was on when they closed the page. A count is just a name, like \"week 3\". It carries no id and nothing about you or your device, no cookie is used, and counts can't be linked to each other or to a person. No other company is involved."
                        )}
                    </p>
                    <label className="bbb-toggle">
                        <input type="checkbox" checked={counts} onChange={(e) => shareCounts$.next(e.target.checked)} />
                        <span>{t("Share anonymous play counts")}</span>
                    </label>
                    <p className="bbb-subtle">{t("Also off automatically if your browser asks sites not to track you.")}</p>
                </section>

                <section className="bbb-tutorial-section">
                    <h2>📣 {t("Ads")}</h2>
                    {adsOn() ? (
                        <p>
                            {t(
                                "This site shows ads, provided by Ezoic and its partners. They use cookies and similar technology to choose and measure ads, and ask for your consent first where the law requires it; you can change your choice at any time from the consent notice. Ezoic explains what it collects in its own privacy policy:"
                            )}{" "}
                            <a href="https://www.ezoic.com/privacy-policy/" target="_blank" rel="noopener noreferrer">
                                ezoic.com/privacy-policy
                            </a>
                            .
                        </p>
                    ) : (
                        <p>{t("This copy of the game shows no ads. The copy on spotlegame.co.uk shows ads provided by Ezoic and its partners, who ask for your consent first where the law requires it.")}</p>
                    )}
                </section>

                <section className="bbb-tutorial-section">
                    <h2>🔤 {t("Fonts")}</h2>
                    <p>{t("The game's fonts are loaded from Google Fonts, so Google's servers see your internet address when the page loads, as with any website that uses them.")}</p>
                </section>

                <section className="bbb-tutorial-section">
                    <h2>🧒 {t("Children")}</h2>
                    <p>{t("The game asks for no personal information from anyone. Online chat is between the players of a game; please don't share personal details in it.")}</p>
                </section>

                <section className="bbb-tutorial-section">
                    <h2>✉️ {t("Questions")}</h2>
                    <p>
                        {t("Write to us at")} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                    </p>
                </section>
            </div>
        </HasText>
    );
}
