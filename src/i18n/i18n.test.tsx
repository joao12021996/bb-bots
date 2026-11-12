import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { language$, setLanguage, t, translated } from "./i18n";
import { tip, TIP_IDS } from "../playerMode/coach";
import { COMP_KINDS, DIFFICULTIES, SPECIAL_FORMATS } from "../playerMode/rules";
import { POWERS } from "../playerMode/social/powers";
import { TutorialPage } from "../components/tutorial/tutorialPage";
import { SettingsMenu } from "../components/topbar/topBar";
import { RulesEditor, DifficultyPicker } from "../playerMode/ui/rulesEditor";
import { DEFAULT_RULES } from "../playerMode/rules";
import { CoachTip } from "../playerMode/ui/playerModeScreen";

function mount(el: JSX.Element): HTMLDivElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
        ReactDOM.render(el, container);
    });
    return container;
}

afterEach(() => act(() => setLanguage("en")));

describe("translations", () => {
    it("falls back to English, fills in placeholders, and sets the page language", () => {
        setLanguage("en");
        expect(t("Player {n}", { n: 2 })).toBe("Player 2");
        expect(document.documentElement.lang).toBe("en");
        setLanguage("fr");
        expect(t("Player {n}", { n: 2 })).toBe("Joueur 2");
        expect(t("Something nobody translated")).toBe("Something nobody translated");
        expect(document.documentElement.lang).toBe("fr");
        expect(language$.value).toBe("fr");
    });

    it("French covers the coach, difficulties, house rules and secret powers", () => {
        const fr = new Set(translated("fr"));
        const needed: string[] = [];
        TIP_IDS.forEach((id) => {
            const x = tip(id);
            needed.push(x.title, ...x.lines);
        });
        DIFFICULTIES.forEach((d) => needed.push(d.label, d.blurb));
        COMP_KINDS.forEach((k) => needed.push(k.label));
        SPECIAL_FORMATS.forEach((f) => needed.push(f.label));
        Object.values(POWERS).forEach((p) => needed.push(p.name, p.blurb));
        expect(needed.filter((s) => !fr.has(s))).toEqual([]);
    });

    it("screens switch to French: the tutorial, settings, house rules and the coach", () => {
        const en = mount(<TutorialPage />);
        const sections = en.querySelectorAll("section").length;
        act(() => setLanguage("fr"));
        const tutorial = mount(<TutorialPage />);
        expect(tutorial.textContent).toContain("Le but");
        expect(tutorial.textContent).not.toContain("The goal");
        expect(tutorial.querySelectorAll("section").length).toBe(sections);

        const settings = mount(<SettingsMenu />);
        act(() => settings.querySelector("button")!.click());
        expect(settings.textContent).toContain("Langue");
        expect((settings.querySelector("select") as HTMLSelectElement).value).toBe("fr");

        const rules = mount(
            <>
                <DifficultyPicker value="easy" onChange={() => undefined} />
                <RulesEditor rules={{ ...DEFAULT_RULES, actions: 2 }} onChange={() => undefined} />
            </>
        );
        expect(rules.textContent).toContain("Détente");
        expect(rules.textContent).toContain("Règles de la maison");
        expect(rules.textContent).toContain("Épreuves possibles");

        const coach = mount(<CoachTip tip={tip("welcome")} onDismiss={() => undefined} onStop={() => undefined} />);
        expect(coach.textContent).toContain("Bienvenue dans la maison");
        expect(coach.textContent).toContain("Compris");
    });
});
