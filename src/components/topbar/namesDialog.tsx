import React from "react";
import ReactDOM from "react-dom";
import { t } from "../../i18n/i18n";
import { Names, names$, RENAMEABLE, renameCount, resetNames } from "../../i18n/rename";

function useNames(): Names {
    const [value, setValue] = React.useState(names$.value);
    React.useEffect(() => {
        const sub = names$.subscribe((v) => setValue(() => v));
        return () => sub.unsubscribe();
    }, []);
    return value;
}

// Settings > Rename: the player's own words for the game's terms. Changes show on the page as they're typed.
// The dialog itself is marked data-bbb-raw, so its labels keep showing the original terms.
export function NamesDialog(props: { onClose: () => void }): JSX.Element {
    const names = useNames();
    const set = (next: Partial<Names>) => names$.next({ ...names, ...next });
    const setTerm = (term: string, to: string) => {
        const terms = { ...names.terms };
        if (to) terms[term] = to;
        else delete terms[term];
        set({ terms });
    };
    const setCustom = (i: number, from: string, to: string) => {
        const custom = [...names.custom];
        custom[i] = { from, to };
        set({ custom });
    };
    const removeCustom = (i: number) => set({ custom: names.custom.filter((_, j) => j !== i) });
    return ReactDOM.createPortal(
        <div className="bbb-names-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
            <div
                className="bbb-names"
                role="dialog"
                aria-modal="true"
                aria-label={t("Rename things")}
                data-bbb-raw
                onKeyDown={(e) => e.key === "Escape" && props.onClose()}
            >
                <h2 className="title is-5">✏️ {t("Rename things")}</h2>
                <p className="bbb-subtle">
                    {t("Call anything in the game whatever you like. Leave a box empty to keep the usual word. Plurals and lowercase follow along (Houseguest → Player also turns houseguests into players).")}
                </p>
                {RENAMEABLE.map((g) => (
                    <fieldset key={g.group} className="bbb-names-group">
                        <legend>{t(g.group)}</legend>
                        {g.terms.map((term) => (
                            <label key={term} className="bbb-names-row">
                                <span>{t(term)}</span>
                                <input
                                    className="input is-small"
                                    value={names.terms[term] || ""}
                                    placeholder={t(term)}
                                    onChange={(e) => setTerm(term, e.target.value)}
                                />
                            </label>
                        ))}
                    </fieldset>
                ))}
                <fieldset className="bbb-names-group">
                    <legend>{t("Anything else")}</legend>
                    {names.custom.map((c, i) => (
                        <div key={i} className="bbb-names-row bbb-names-custom">
                            <input
                                className="input is-small"
                                value={c.from}
                                placeholder={t("Word or phrase")}
                                aria-label={t("Word or phrase")}
                                onChange={(e) => setCustom(i, e.target.value, c.to)}
                            />
                            <span aria-hidden="true">→</span>
                            <input
                                className="input is-small"
                                value={c.to}
                                placeholder={t("Your word")}
                                aria-label={t("Your word")}
                                onChange={(e) => setCustom(i, c.from, e.target.value)}
                            />
                            <button type="button" className="delete" aria-label={t("Remove")} onClick={() => removeCustom(i)} />
                        </div>
                    ))}
                    <button type="button" className="button is-small is-light" onClick={() => set({ custom: [...names.custom, { from: "", to: "" }] })}>
                        ➕ {t("Add a word")}
                    </button>
                </fieldset>
                <div className="bbb-names-actions">
                    <button type="button" className="button is-small is-light" disabled={renameCount(names) === 0} onClick={resetNames}>
                        ↺ {t("Back to the usual words")}
                    </button>
                    <button type="button" className="button is-small is-primary" onClick={props.onClose}>
                        {t("Done")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
