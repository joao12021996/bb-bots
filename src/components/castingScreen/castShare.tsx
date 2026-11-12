import React from "react";
import { PlayerProfile } from "../../model";
import { castLink, decodeCast, encodeCast, SharedCast } from "../../cartoon/castCode";

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        return false;
    }
}

// Share this cast as a code or link, or load one a friend sent.
export function CastShare(props: {
    cast: PlayerProfile[];
    relationships?: { [a: number]: { [b: number]: number } };
    onImport: (shared: SharedCast) => void;
}) {
    const [mode, setMode] = React.useState<"closed" | "share" | "import">("closed");
    const [text, setText] = React.useState("");
    const [status, setStatus] = React.useState<string | null>(null);
    const shared = React.useMemo(() => (mode === "share" ? encodeCast(props.cast, props.relationships) : null), [mode, props.cast, props.relationships]);
    const link = shared ? castLink(shared.code) : "";

    const doImport = () => {
        const found = decodeCast(text);
        if (!found) {
            setStatus("That isn't a cast code. Paste the whole code or link.");
            return;
        }
        props.onImport(found);
        setText("");
        setStatus(null);
        setMode("closed");
    };

    return (
        <div className="bbb-cast-share">
            <div className="bbb-cast-share-buttons">
                <button
                    type="button"
                    className={"button is-small" + (mode === "share" ? " is-info" : " is-light")}
                    disabled={props.cast.length === 0}
                    onClick={() => {
                        setStatus(null);
                        setMode(mode === "share" ? "closed" : "share");
                    }}
                >
                    📤 Share this cast
                </button>
                <button
                    type="button"
                    className={"button is-small" + (mode === "import" ? " is-info" : " is-light")}
                    onClick={() => {
                        setStatus(null);
                        setMode(mode === "import" ? "closed" : "import");
                    }}
                >
                    📥 Load a cast
                </button>
            </div>
            {mode === "share" && shared && (
                <div className="bbb-cast-share-panel">
                    <p>Send this link to a friend: it opens the game with this cast ready to play.</p>
                    <div className="bbb-cast-share-row">
                        <input className="input is-small" readOnly value={link} aria-label="Cast link" onFocus={(e) => e.target.select()} />
                        <button type="button" className="button is-small is-primary" onClick={async () => setStatus((await copy(link)) ? "Link copied!" : "Select the link and copy it.")}>
                            🔗 Copy link
                        </button>
                        <button type="button" className="button is-small is-light" onClick={async () => setStatus((await copy(shared.code)) ? "Code copied!" : "Couldn't copy the code.")}>
                            Copy code
                        </button>
                    </div>
                    {shared.photosLeftOut > 0 && (
                        <p className="bbb-subtle">
                            {shared.photosLeftOut === 1 ? "1 uploaded photo is" : `${shared.photosLeftOut} uploaded photos are`} too big for a link, so
                            your friend will see a cartoon instead.
                        </p>
                    )}
                </div>
            )}
            {mode === "import" && (
                <div className="bbb-cast-share-panel">
                    <p>Paste a cast code or link a friend sent you. It replaces the cast here.</p>
                    <div className="bbb-cast-share-row">
                        <input
                            className="input is-small"
                            value={text}
                            placeholder="C1… or https://…?cast=C1…"
                            aria-label="Cast code or link"
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && doImport()}
                        />
                        <button type="button" className="button is-small is-primary" disabled={!text.trim()} onClick={doImport}>
                            Load
                        </button>
                    </div>
                </div>
            )}
            {status && <p className="bbb-subtle" role="status">{status}</p>}
        </div>
    );
}
