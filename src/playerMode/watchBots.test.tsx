import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { newPlayerSave, PlayerModeController, Prompt } from "./playerModeController";
import { createAlliance } from "./social/alliances";
import { InsideHouse } from "./ui/insideHouse";
import { answer, newGame } from "./testing";
import { clearSave, hasSave } from "./save/serialize";

// Watching the bots: a season with nobody playing, where the viewer sees what the bots do in private.
describe("watching the bots", () => {
    it("plays a whole season, showing what happened behind the scenes, why they nominated and how they voted", () => {
        clearSave();
        const save = newPlayerSave(newGame(10), []);
        save.watching = true;
        save.seed = 4242;
        const controller = new PlayerModeController(save);
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        const titles: string[] = [];
        let guard = 0;
        while (guard++ < 3000) {
            const p = prompt as Prompt | null;
            if (!p) throw new Error("No prompt");
            // nobody's playing: the viewer only ever watches
            expect(["scene", "compResults", "hideResults", "tiebreakResults", "knockout", "juryReveal", "gameOver"]).toContain(p.kind);
            if (p.kind === "scene") titles.push(p.scene.title);
            if (p.kind === "gameOver") break;
            if (p.kind === "scene") controller.continue();
            else answer(controller, p, "random", "random");
        }
        expect(prompt!.kind).toBe("gameOver");
        expect(titles.some((t) => t.startsWith("🔍 Behind the scenes"))).toBe(true);
        expect(titles).toContain("🔍 Why they're on the block");
        expect(titles).toContain("🔍 How the house voted");
        // a watched season never replaces the player's own saved season
        expect(hasSave()).toBe(false);
    });

    it("the viewer knows who the secret Head of Household is", () => {
        const save = newPlayerSave(newGame(8), []);
        save.watching = true;
        save.week = { hohId: 3, secretHoh: true };
        expect(new PlayerModeController(save).publicHohId()).toBe(3);
        save.watching = false;
        expect(new PlayerModeController(save).publicHohId()).toBeUndefined();
    });

    it("shows the alliances, who they're after, and how everyone's playing", () => {
        const save = newPlayerSave(newGame(8), []);
        save.watching = true;
        const controller = new PlayerModeController(save);
        const a = createAlliance(controller.gameState as any, controller.book, [1, 2, 3], "The Night Owls");
        a.target = 5;
        const div = document.createElement("div");
        act(() => {
            ReactDOM.render(<InsideHouse controller={controller} />, div);
        });
        expect(div.textContent).toContain("The Night Owls");
        expect(div.textContent).toContain(`after ${controller.player(5).name}`);
        expect(div.textContent).toContain(controller.player(7).name);
        ReactDOM.unmountComponentAtNode(div);
    });
});
