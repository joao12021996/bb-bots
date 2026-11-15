import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
// (the model first: this is the order the app loads things in)
import { newGame } from "../playerMode/testing";
import { cartoonCast } from "../cartoon/cartoon";
import { decodeSeason, encodeSeason, houseAt, SharedSeason } from "./seasonShare";
import { SeasonReplay } from "./seasonReplay";

function season(): SharedSeason {
    const cast = cartoonCast(6, 11).map((p) => ({ name: p.name, imageURL: p.imageURL }));
    return {
        cast,
        weeks: [
            { hoh: 0, noms: [1, 2], pov: 3, evicted: [1], votes: [3, 0] },
            { hoh: 3, noms: [0, 4], pov: 0, breaker: undefined, evicted: [4], votes: [1, 2] },
            // 1 is back (the Battle Back), and wins HoH
            { hoh: 1, noms: [0, 5], pov: 5, evicted: [0], votes: [2, 1] },
        ],
        placements: [4, 3, 1, 2, 5, 6].map((p) => p),
        winner: 2,
        runnerUp: 3,
        jury: [
            [0, 2],
            [1, 2],
            [5, 3],
        ],
        players: [2],
        difficulty: "Normal",
    };
}

describe("a season as a link", () => {
    it("goes into a code and comes back the same", () => {
        const s = season();
        const code = encodeSeason(s);
        expect(code).toMatch(/^S1[A-Za-z0-9_-]+$/);
        expect(code.length).toBeLessThan(1500);
        const back = decodeSeason(code)!;
        expect(back.cast).toEqual(s.cast);
        expect(back.weeks).toEqual(s.weeks);
        expect(back.winner).toBe(2);
        expect(back.runnerUp).toBe(3);
        expect(back.jury).toEqual(s.jury);
        expect(back.players).toEqual([2]);
        expect(back.placements).toEqual(s.placements);
        // and out of a link
        expect(decodeSeason(`https://example.com/houseguests/?season=${code}`)!.winner).toBe(2);
    });

    it("turns away what isn't a season, and ids that aren't in the cast", () => {
        expect(decodeSeason("hello")).toBeNull();
        expect(decodeSeason("S1!!!")).toBeNull();
        expect(decodeSeason("C1abc")).toBeNull();
        const s = season();
        s.weeks[0].hoh = 99;
        s.weeks[0].noms = [1, 77];
        const back = decodeSeason(encodeSeason(s))!;
        expect(back.weeks[0].hoh).toBeUndefined();
        expect(back.weeks[0].noms).toEqual([1]);
    });

    it("a photo doesn't travel: whoever opens the link sees a cartoon", () => {
        const s = season();
        s.cast[0].imageURL = "data:image/jpeg;base64,AAAA";
        const back = decodeSeason(encodeSeason(s))!;
        expect(back.cast[0].name).toBe(s.cast[0].name);
        expect(back.cast[0].imageURL).toContain("image/svg+xml");
    });

    it("knows who's out each week, and who came back", () => {
        const s = season();
        expect(Array.from(houseAt(s, 0).out)).toEqual([]);
        expect(Array.from(houseAt(s, 1).out)).toEqual([1]);
        // week 3: 1 is in the week's events again, so they came back
        const third = houseAt(s, 2);
        expect(third.returned).toEqual([1]);
        expect(Array.from(third.out).sort()).toEqual([4]);
        // the finale: only the two finalists are left
        expect(Array.from(houseAt(s, 3).out).sort()).toEqual([0, 1, 4, 5]);
    });

    it("plays back: the house, each week, then the winner and the jury's vote", () => {
        const s = season();
        const root = document.createElement("div");
        document.body.appendChild(root);
        act(() => {
            ReactDOM.render(<SeasonReplay season={s} />, root);
        });
        const press = (label: string) =>
            act(() => {
                (Array.from(root.querySelectorAll("button")).find((b) => (b.textContent || "").includes(label)) as HTMLButtonElement).click();
            });
        expect(root.textContent).toContain("6 strangers move in");
        press("Next");
        expect(root.textContent).toContain("Week 1");
        expect(root.textContent).toContain(`${s.cast[0].name} won`);
        expect(root.textContent).toContain(`${s.cast[1].name} was evicted, 3 to 0`);
        press("Next");
        press("Next");
        expect(root.textContent).toContain(`${s.cast[1].name} won the way back`);
        press("Next");
        expect(root.textContent).toContain("Finale");
        expect(root.textContent).toContain(`${s.cast[2].name} won the season, 2 to 1, over ${s.cast[3].name}`);
        expect(root.querySelectorAll(".bbb-replay-face.is-out").length).toBe(4);
        press("Back");
        expect(root.textContent).toContain("Week 3");
        ReactDOM.unmountComponentAtNode(root);
        root.remove();
        expect(newGame(4).houseguests.length).toBe(4);
    });
});
