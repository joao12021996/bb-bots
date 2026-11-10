import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { GameState, MutableGameState, PlayerProfile } from "../../model";
import { newPlayerSave, PlayerModeController, Prompt } from "../playerModeController";
import { createAlliance } from "../social/alliances";
import { SocialScreen } from "./socialScreen";
import { AllianceScreen } from "./allianceScreen";
import { FaceEditor } from "./faceEditor";

// Mounts the social, alliance and face editor screens, clicks through them, and checks nothing throws.

function mount(el: JSX.Element): HTMLDivElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
        ReactDOM.render(el, container);
    });
    return container;
}

function click(container: HTMLElement, text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent || "").includes(text));
    if (!button) throw new Error(`No button with "${text}"`);
    act(() => {
        button.click();
    });
}

// A controller sitting at the first social time of a 7-player game, with an alliance and someone approaching.
function controllerAtSocial(): PlayerModeController {
    const cast: PlayerProfile[] = Array.from({ length: 7 }, (_, i) => ({ name: `HG${i}`, imageURL: "", social: 8 }));
    const controller = new PlayerModeController(newPlayerSave(new GameState({ players: cast, jury: 3 }), [0]));
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    (prompt as unknown as { kind: string }).kind === "scene" && controller.continue();
    expect((prompt as unknown as Prompt).kind).toBe("social");
    const gs = new MutableGameState(controller.gameState);
    createAlliance(gs, controller.state.book, [0, 1, 2], "The Vault");
    controller.state.gameState = new GameState(gs);
    controller.state.approaches[0] = [
        { kind: "invite", fromId: 3, name: "Night Owls" },
        { kind: "pitch", fromId: 4, targetId: 5 },
        { kind: "chat", fromId: 6, text: "HG6 came by to chat." },
    ];
    return controller;
}

describe("player mode screens", () => {
    it("social time: answers approaches, chats, and proposes an alliance", () => {
        const controller = controllerAtSocial();
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("came to talk to you");
        click(c, "Accept");
        expect(controller.alliancesOf(0).some((a) => a.name === "Night Owls")).toBe(true);
        click(c, "I'm in");
        click(c, "OK");
        expect(controller.approachesFor(0).length).toBe(0);
        // talk to HG4: chat, then open the alliance form
        const faces = Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"));
        act(() => faces[0].click());
        click(c, "Chat");
        expect(controller.state.actionsLeft).toBe(2);
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"))[0].click());
        click(c, "Alliance");
        expect(c.textContent).toContain("Invite to The Vault");
        click(c, "Start it");
        expect(controller.state.actionsLeft).toBe(1);
        click(c, "alliance time");
        expect(controller.state.socialStage).toBe("alliance");
    });

    it("alliance time: shows allies' picks, suggests a target, renames, and backstabs", () => {
        const controller = controllerAtSocial();
        controller.endSocial();
        const c = mount(<AllianceScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("The Vault");
        expect(c.textContent).toMatch(/HG1 (wants to go after|has no one in mind)/);
        // pick a target and suggest it
        const outsider = Array.from(c.querySelectorAll("button")).find((b) => b.textContent === "HG5")!;
        act(() => outsider.click());
        click(c, "Suggest HG5");
        expect(controller.state.book.alliances.find((a) => a.name === "The Vault")!.met).toBe(true);
        // rename
        click(c, "✏️");
        const input = c.querySelector(".bbb-alliance-head input") as HTMLInputElement;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setter.call(input, "The Bank");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        click(c, "Save");
        expect(controller.alliancesOf(0)[0].name).toBe("The Bank");
        // backstab: leak to HG6
        click(c, "Backstab");
        act(() => Array.from(c.querySelectorAll("button")).find((b) => b.textContent === "HG6")!.click());
        click(c, "Leak to HG6");
        expect(c.textContent).toMatch(/You told HG6 all about The Bank/);
        click(c, "Done");
    });

    it("face editor: changes the name and picks an emoji face", () => {
        let saved: { name: string; imageURL: string } | null = null;
        const c = mount(
            <FaceEditor
                original={{ name: "Janelle", imageURL: "https://example.com/janelle.png" }}
                current={{ name: "Janelle", imageURL: "https://example.com/janelle.png" }}
                onSave={(look) => (saved = look)}
                onCancel={() => undefined}
            />
        );
        const options = c.querySelectorAll(".bbb-face-options button");
        expect(options.length).toBeGreaterThan(10);
        act(() => (options[3] as HTMLButtonElement).click());
        click(c, "Save");
        expect(saved).not.toBeNull();
        expect(saved!.imageURL.startsWith("data:image/svg+xml")).toBe(true);
    });
});
