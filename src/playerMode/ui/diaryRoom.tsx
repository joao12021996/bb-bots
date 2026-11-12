import React from "react";
import { DiaryEntry } from "../social/diary";
import { Face, Subtle, Title } from "./common";

// The diary room, read out at the end of the season: what everyone told the cameras, week by week. Plus the whole
// season as plain text, to copy and send to friends.

export function DiaryRoom(props: {
    entries: DiaryEntry[];
    houseguest: (id: number) => { name: string; imageURL: string };
    recap: string;
}) {
    const weeks = Array.from(new Set(props.entries.map((e) => e.week))).sort((a, b) => a - b);
    const [open, setOpen] = React.useState<number | null>(null);
    return (
        <div style={{ marginTop: 24 }}>
            <Title>📔 Diary Room</Title>
            <Subtle>What everyone told the cameras, kept secret until now.</Subtle>
            {weeks.length === 0 && <Subtle>Nobody said a word.</Subtle>}
            {weeks.map((week) => (
                <div key={week} style={{ margin: "6px auto", maxWidth: 600, textAlign: "left" }}>
                    <button
                        type="button"
                        className="button is-small is-fullwidth is-dark"
                        onClick={() => setOpen(open === week ? null : week)}
                        aria-expanded={open === week}
                    >
                        {open === week ? "▾" : "▸"} Week {week}
                    </button>
                    {open === week &&
                        props.entries
                            .filter((e) => e.week === week)
                            .map((e) => (
                                <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 4px" }}>
                                    <div style={{ flex: "none" }}>
                                        <Face hg={props.houseguest(e.id)} small />
                                    </div>
                                    <div style={{ fontStyle: "italic" }}>
                                        {e.lines.map((line, i) => (
                                            <p key={i} style={{ margin: "0 0 4px" }}>
                                                “{line}”
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            ))}
                </div>
            ))}
            <RecapButtons text={props.recap} />
        </div>
    );
}

function RecapButtons(props: { text: string }) {
    const [copied, setCopied] = React.useState<"yes" | "no" | null>(null);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(props.text);
            setCopied("yes");
        } catch (e) {
            setCopied("no"); // no clipboard: show the text to copy by hand
        }
    };
    const download = () => {
        try {
            const url = URL.createObjectURL(new Blob([props.text], { type: "text/plain" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "season-recap.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            setCopied("no");
        }
    };
    return (
        <div style={{ marginTop: 14 }}>
            <div className="buttons is-centered">
                <button type="button" className="button is-warning" onClick={copy}>
                    {copied === "yes" ? "✓ Recap copied" : "📋 Copy season recap"}
                </button>
                <button type="button" className="button is-light" onClick={download}>
                    ⬇️ Save as text
                </button>
            </div>
            {copied === "no" && (
                <textarea
                    readOnly
                    value={props.text}
                    style={{ width: "100%", maxWidth: 600, height: 200, fontSize: "0.8rem" }}
                    onFocus={(e) => e.target.select()}
                />
            )}
        </div>
    );
}
