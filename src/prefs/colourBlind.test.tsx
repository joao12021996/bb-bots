import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
// (the season's controller first: the comps and the screens import each other, and this is the order the app loads them in)
import { newGame } from "../playerMode/testing";
import { compById } from "../playerMode/comps";
import { colourBlind$, colourName } from "./colourBlind";
import { seededRand } from "../playerMode/comps/random";

const ColorClashComp = compById("color-clash");
const ReactionLightsComp = compById("reaction-lights");

function show(comp: typeof ColorClashComp): HTMLDivElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const gs = newGame(6);
    const props: any = {
        participants: gs.houseguests,
        human: gs.houseguests[0],
        gameState: gs,
        history: [],
        rand: seededRand(7),
        opponents: [],
        report: () => {},
        finish: () => {},
    };
    act(() => {
        ReactDOM.render(<comp.Component {...props} />, root);
    });
    return root;
}

describe("colour-blind mode", () => {
    afterEach(() => colourBlind$.next(false));

    it("Color Clash: off, colours only; on, every colour has its shape, on the card and on its button", () => {
        const plain = show(ColorClashComp);
        expect(plain.textContent).not.toMatch(/[▲●■★]/);
        colourBlind$.next(true);
        const marked = show(ColorClashComp);
        const buttons = Array.from(marked.querySelectorAll("button")).map((b) => b.textContent);
        expect(buttons).toEqual(["▲RED", "●BLUE", "■GREEN", "★YELLOW"]);
        // the card shows its ink's shape, named for screen readers
        const ink = marked.querySelector("[aria-label$=' ink']")!;
        expect(ink).not.toBeNull();
        expect("▲●■★").toContain(ink.textContent!);
    });

    it("Reaction Lights doesn't ask you to wait for green", () => {
        colourBlind$.next(true);
        const root = show(ReactionLightsComp);
        const start = Array.from(root.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Start"))!;
        act(() => {
            start.click();
        });
        expect(root.textContent).toContain("Wait…");
        expect(root.textContent).not.toContain("green");
    });

    it("names the colours a comic cover can have", () => {
        expect(colourName("#b91c1c")).toBe("RED");
        expect(colourName("#FACC15")).toBe("YELLOW");
        expect(colourName("none")).toBe("NONE");
    });
});
