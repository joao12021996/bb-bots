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
import { installRenamer, names$, rename, renameCount, resetNames } from "./rename";
import { NamesDialog } from "../components/topbar/namesDialog";

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

describe("renaming", () => {
    // the renamer runs when the page reports its changes, just after them
    const flush = () => new Promise((r) => setTimeout(r, 0));
    afterEach(() => resetNames());

    it("swaps the player's words in on every screen, and puts the usual ones back", async () => {
        installRenamer();
        let setText: (s: string) => void = () => undefined;
        function Screen() {
            const [text, set] = React.useState("The Head of House nominates two houseguests. The HoH's veto is a Veto.");
            setText = set;
            return (
                <div>
                    <p id="line">{text}</p>
                    <button title="Head of House room">x</button>
                    <input id="field" defaultValue="Head of House" />
                    <div data-bbb-raw>
                        <span id="raw">Head of House</span>
                    </div>
                </div>
            );
        }
        const el = mount(<Screen />);
        const line = () => el.querySelector("#line")!.textContent;
        expect(renameCount()).toBe(0);

        act(() => names$.next({ terms: { "Head of House": "Leader of the House", HoH: "LoH", Houseguest: "Player" }, custom: [{ from: "veto", to: "golden key" }] }));
        await flush();
        expect(line()).toBe("The Leader of the House nominates two players. The LoH's golden key is a Golden key.");
        expect(el.querySelector("button")!.getAttribute("title")).toBe("Leader of the House room");
        expect((el.querySelector("#field") as HTMLInputElement).value).toBe("Head of House");
        expect(el.querySelector("#raw")!.textContent).toBe("Head of House");
        expect(renameCount()).toBe(4);

        // the screen changes its text: the new text is renamed too
        act(() => setText("A Houseguest became HoH."));
        await flush();
        expect(line()).toBe("A Player became LoH.");
        expect(rename("HOUSEGUEST BOTS")).toBe("PLAYER BOTS");

        act(() => resetNames());
        await flush();
        expect(line()).toBe("A Houseguest became HoH.");
        expect(el.querySelector("button")!.getAttribute("title")).toBe("Head of House room");
    });

    it("renames the French words when the game is in French", async () => {
        installRenamer();
        act(() => setLanguage("fr"));
        const el = mount(<p>Le Chef de la maison nomine.</p>);
        act(() => names$.next({ terms: { "Head of House": "Boss" }, custom: [] }));
        await flush();
        expect(el.textContent).toBe("Le Boss nomine.");
    });

    it("the rename dialog edits the words and keeps its own labels as they are", async () => {
        installRenamer();
        mount(<NamesDialog onClose={() => undefined} />);
        const dialog = document.querySelector(".bbb-names") as HTMLElement;
        const input = dialog.querySelector("input[placeholder='Head of House']") as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        act(() => {
            setter.call(input, "Boss");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await flush();
        expect(names$.value.terms["Head of House"]).toBe("Boss");
        expect(dialog.textContent).toContain("Head of House");
    });
});
