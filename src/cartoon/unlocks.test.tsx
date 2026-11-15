import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { cartoonCast, cartoonSVG, CartoonLook, LOOK_PARTS, randomLook, unlockFor, UNLOCKS, withoutLocked } from "./cartoon";
import { ACHIEVEMENTS } from "../career/career";
import { savePref } from "../prefs/prefs";
import { AvatarBuilder } from "../playerMode/ui/faceEditor";

const hats = LOOK_PARTS.find((p) => p.key === "hat")!.options;
const plain = (): CartoonLook => ({ skin: 0, face: 0, hair: 0, hairColor: 0, eyes: 0, eyeColor: 0, brows: 0, nose: 0, mouth: 0, glasses: 0, facialHair: 0, extra: 0, hat: 0, shirt: 0, bg: 0 });

describe("avatar options to earn", () => {
    beforeEach(() => window.localStorage.clear());

    it("each one goes with a real achievement, and is drawn", () => {
        UNLOCKS.forEach((u) => {
            expect(ACHIEVEMENTS.some((a) => a.id === u.achievement)).toBe(true);
            const part = LOOK_PARTS.find((p) => p.key === u.part)!;
            expect(part.options[u.index]).toBeDefined();
            expect(cartoonSVG({ ...plain(), [u.part]: u.index })).not.toEqual(cartoonSVG(plain()));
        });
        expect(unlockFor("hat", hats.indexOf("Crown"))).toBe("first-win");
        expect(unlockFor("hat", 1)).toBeUndefined();
    });

    it("bots and dealt casts never wear them", () => {
        let seed = 7;
        const rand = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        for (let i = 0; i < 500; i++) {
            const look = randomLook(rand);
            UNLOCKS.forEach((u) => expect(look[u.part]).not.toBe(u.index));
        }
        // the same seed still deals the same cast as before there was anything to earn
        expect(cartoonCast(6, 42)).toEqual(cartoonCast(6, 42));
    });

    it("something not earned comes off", () => {
        const crowned = { ...plain(), hat: hats.indexOf("Crown") };
        expect(withoutLocked(crowned, () => false).hat).toBe(0);
        expect(withoutLocked(crowned, (a) => a === "first-win").hat).toBe(hats.indexOf("Crown"));
    });

    function hatsReached(): string[] {
        const root = document.createElement("div");
        document.body.appendChild(root);
        let look = plain();
        const draw = () =>
            act(() => {
                ReactDOM.render(<AvatarBuilder look={look} onChange={(next) => (look = next)} />, root);
            });
        draw();
        const seen: string[] = [];
        for (let i = 0; i < hats.length; i++) {
            const next = root.querySelector('button[aria-label="Next Hat"]') as HTMLButtonElement;
            act(() => {
                next.click();
            });
            draw();
            seen.push(hats[look.hat]);
        }
        const text = root.textContent || "";
        ReactDOM.unmountComponentAtNode(root);
        root.remove();
        return [...seen, text];
    }

    it("the editor skips what you haven't earned, and says what there is to earn", () => {
        const out = hatsReached();
        const text = out.pop()!;
        expect(out).not.toContain("Crown");
        expect(out).not.toContain("Halo");
        expect(out).toContain("Bow");
        expect(text).toContain("more to earn");
        expect(text).toContain("Crown");
    });

    it("once you've won a season, the crown is yours", () => {
        savePref("career", { seasons: [], unlocked: { "first-win": { when: 1, season: "x" } } });
        const out = hatsReached();
        out.pop();
        expect(out).toContain("Crown");
        expect(out).not.toContain("Halo");
    });
});
