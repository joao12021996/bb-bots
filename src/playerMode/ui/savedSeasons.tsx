import React from "react";
import { clearSave, exportSave, importSave, listSaves, MAX_SAVES, SaveInfo, saveFailed$ } from "../save/serialize";
import { downloadText, pickTextFile } from "../../prefs/backup";
import { difficultyLabel } from "../rules";
import { t } from "../../i18n/i18n";

function ago(when: number): string {
    const minutes = Math.max(0, Math.round((Date.now() - when) / 60000));
    if (minutes < 2) return t("just now");
    if (minutes < 60) return t("{n} minutes ago", { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? t("an hour ago") : t("{n} hours ago", { n: hours });
    const days = Math.round(hours / 24);
    return days === 1 ? t("yesterday") : t("{n} days ago", { n: days });
}

function confirmed(message: string): boolean {
    try {
        return window.confirm(message);
    } catch (e) {
        return true; // no dialogs (tests)
    }
}

// The seasons in progress on this device: pick one up, save one to a file, or delete it.
export function SavedSeasons(props: { onResume: (id: string) => void }): JSX.Element | null {
    const [saves, setSaves] = React.useState<SaveInfo[]>(() => listSaves());
    const [note, setNote] = React.useState("");
    const refresh = () => setSaves(listSaves());
    const load = async () => {
        const text = await pickTextFile();
        if (text === null) return;
        setNote(importSave(text) ? t("Season loaded.") : t("That file isn't a saved season, or there's no room for it."));
        refresh();
    };
    return (
        <div className="bbb-saves">
            <h3>
                💾 {t("Saved seasons")}{" "}
                <small className="bbb-subtle">
                    {saves.length} / {MAX_SAVES}
                </small>
            </h3>
            {saves.length === 0 && <p className="bbb-subtle">{t("No season in progress.")}</p>}
            {saves.map((s) => (
                <div key={s.id} className="bbb-save-row">
                    {s.image ? <img src={s.image} alt="" /> : <span className="bbb-save-noimage" aria-hidden="true">🏠</span>}
                    <div className="bbb-save-about">
                        <b>{s.players.join(", ") || t("A season")}</b>
                        <div className="bbb-subtle">
                            {t("Week {week}", { week: s.week })} · {t("{left} of {cast} left", { left: s.left, cast: s.cast })}
                            {s.difficulty ? ` · ${difficultyLabel(s.difficulty as any)}` : ""} · {ago(s.when)}
                        </div>
                    </div>
                    <div className="bbb-save-buttons">
                        <button className="button is-small is-warning" onClick={() => props.onResume(s.id)}>
                            ▶ {t("Resume")}
                        </button>
                        <button
                            className="button is-small is-light"
                            title={t("Save this season to a file, to keep or to move to another device")}
                            onClick={() => {
                                const json = exportSave(s.id);
                                if (json) downloadText(`houseguests-season-week-${s.week}.json`, json);
                            }}
                        >
                            ⬇ {t("File")}
                        </button>
                        <button
                            className="button is-small is-danger is-light"
                            aria-label={t("Delete this saved season")}
                            onClick={() => {
                                if (!confirmed(t("Delete this saved season? It can't be brought back."))) return;
                                clearSave(s.id);
                                refresh();
                            }}
                        >
                            🗑
                        </button>
                    </div>
                </div>
            ))}
            <div className="bbb-save-footer">
                <button className="button is-small is-light" onClick={load}>
                    ⬆ {t("Load a season from a file")}
                </button>
                {note && <small className="bbb-subtle">{note}</small>}
            </div>
            {saves.length >= MAX_SAVES && <small className="bbb-subtle">{t("The shelf is full: a new season replaces the one you left alone the longest.")}</small>}
        </div>
    );
}

// In a season: a warning when it couldn't be saved (storage is full or blocked), so closing the page isn't a surprise.
export function SaveWarning(): JSX.Element | null {
    const [failed, setFailed] = React.useState(saveFailed$.value);
    const [hidden, setHidden] = React.useState(false);
    React.useEffect(() => {
        const sub = saveFailed$.subscribe((f) => {
            setFailed(f);
            if (!f) setHidden(false);
        });
        return () => sub.unsubscribe();
    }, []);
    if (!failed || hidden) return null;
    const others = listSaves().length;
    return (
        <div className="bbb-save-warning" role="alert">
            <span>
                ⚠️{" "}
                {t("This season isn't being saved: your browser's storage for this site is full or blocked. If you close the page, you'll lose it.")}{" "}
                {others > 0 && t("Deleting an old saved season from the start screen makes room.")}
            </span>
            <button className="button is-small is-light" onClick={() => setHidden(true)}>
                {t("OK")}
            </button>
        </div>
    );
}
