import React from "react";
import { COMP_KINDS, DEFAULT_RULES, Difficulty, DIFFICULTIES, isDefaultRules, MAX_ACTIONS, MIN_ACTIONS, SeasonRules, SPECIAL_FORMATS } from "../rules";
import { HOH, LAST_CHANCE, VETO } from "../terms";
import { Subtle } from "./common";
import { Stepper } from "./common";
import { t } from "../../i18n/i18n";

export function DifficultyPicker(props: { value: Difficulty; onChange: (d: Difficulty) => void }) {
    const current = DIFFICULTIES.find((d) => d.id === props.value) || DIFFICULTIES[1];
    return (
        <div className="bbb-setting">
            <b>🎚️ {t("Difficulty")}</b>
            <div className="bbb-segmented" role="radiogroup" aria-label={t("Difficulty")}>
                {DIFFICULTIES.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={props.value === d.id} className={props.value === d.id ? "is-active" : ""} onClick={() => props.onChange(d.id)}>
                        {t(d.label)}
                    </button>
                ))}
            </div>
            <Subtle>{t(current.blurb)}</Subtle>
        </div>
    );
}

// House rules: jury size, whether the HoH plays in the veto, Block Breaker weeks, social actions per block, and
// which comps can come up.
export function RulesEditor(props: {
    rules: SeasonRules;
    onChange: (rules: SeasonRules) => void;
    jury?: { value: number; min: number; max: number; onChange: (n: number) => void };
    hohPlaysVeto?: { value: boolean; onChange: (on: boolean) => void };
    online?: boolean; // social time can be everyone at once, or one player at a time
}) {
    const { rules, onChange } = props;
    const [open, setOpen] = React.useState(!isDefaultRules(rules));
    const set = (patch: Partial<SeasonRules>) => onChange({ ...rules, ...patch });
    const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item));
    return (
        <div className="bbb-setting bbb-rules">
            <button type="button" className="bbb-rules-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                📜 <b>{t("House rules")}</b> {isDefaultRules(rules) ? <span className="bbb-subtle">({t("the usual")})</span> : <span className="bbb-chip">{t("custom")}</span>} {open ? "▾" : "▸"}
            </button>
            {open && (
                <div className="bbb-rules-body">
                    <div className="bbb-steppers">
                        {props.jury && <Stepper label={"⚖️ " + t("Jury")} value={props.jury.value} min={props.jury.min} max={props.jury.max} onChange={props.jury.onChange} />}
                        <Stepper label={"💬 " + t("Actions per social block")} value={rules.actions} min={MIN_ACTIONS} max={MAX_ACTIONS} onChange={(actions) => set({ actions })} />
                    </div>
                    {props.hohPlaysVeto && (
                        <label className="bbb-toggle">
                            <input type="checkbox" checked={props.hohPlaysVeto.value} onChange={(e) => props.hohPlaysVeto!.onChange(e.target.checked)} />
                            <span>👑 {t("The {hoh} plays in the {veto} comp", { hoh: t(HOH), veto: t(VETO) })}</span>
                        </label>
                    )}
                    {props.online && (
                        <label className="bbb-toggle">
                            <input type="checkbox" checked={rules.together} onChange={(e) => set({ together: e.target.checked })} />
                            <span>👥 {t("Social time for everyone at once (off: players take turns)")}</span>
                        </label>
                    )}
                    <label className="bbb-toggle">
                        <input type="checkbox" checked={rules.lastChance} onChange={(e) => set({ lastChance: e.target.checked })} />
                        <span>
                            🎬 {t("Big weeks: three nominees, and a {lastChance} after the {veto} (off: always two nominees)", { lastChance: t(LAST_CHANCE), veto: t(VETO) })}
                        </span>
                    </label>
                    <div>
                        <b>{t("Comps that can come up")}</b>
                        <div className="bbb-rules-checks">
                            {COMP_KINDS.map((k) => (
                                <label key={k.kind} className="bbb-check">
                                    <input
                                        type="checkbox"
                                        checked={rules.kinds.includes(k.kind)}
                                        disabled={rules.kinds.length === 1 && rules.kinds.includes(k.kind)}
                                        onChange={(e) => set({ kinds: toggle(rules.kinds, k.kind, e.target.checked) })}
                                    />
                                    {t(k.label)}
                                </label>
                            ))}
                        </div>
                        <div className="bbb-rules-checks">
                            {SPECIAL_FORMATS.map((f) => (
                                <label key={f.id} className="bbb-check">
                                    <input type="checkbox" checked={rules.formats.includes(f.id)} onChange={(e) => set({ formats: toggle(rules.formats, f.id, e.target.checked) })} />
                                    {t(f.label)}
                                </label>
                            ))}
                        </div>
                        <Subtle>{t("The final {hoh} is always the classic three parts.", { hoh: t(HOH) })}</Subtle>
                    </div>
                    {!isDefaultRules(rules) && (
                        <button type="button" className="button is-small is-light" onClick={() => onChange(DEFAULT_RULES)}>
                            {t("Back to the usual rules")}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// One line about rules that aren't the usual, for players who can't change them (online guests).
export function rulesSummary(rules: SeasonRules): string[] {
    const out: string[] = [];
    if (!rules.lastChance) out.push("always two nominees");
    if (!rules.together) out.push("social time one player at a time");
    if (rules.actions !== DEFAULT_RULES.actions) out.push(`${rules.actions} actions per block`);
    if (rules.kinds.length < COMP_KINDS.length) out.push(`only ${COMP_KINDS.filter((k) => rules.kinds.includes(k.kind)).map((k) => k.label.split(" ")[1].toLowerCase()).join(", ")} comps`);
    if (rules.formats.length < SPECIAL_FORMATS.length) out.push("fewer special comps");
    return out;
}
