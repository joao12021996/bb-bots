import React from "react";
import ReactDOM from "react-dom";
import { act as syncAct } from "react-dom/test-utils";
import { GameState, nonEvictedHouseguests, PlayerProfile } from "../../model";
import { prepareNextWeek } from "../../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../../components/episode/bigBrotherEpisode";
import { ALL_COMPS } from ".";
import { seededRand } from "./random";

// Mounts every competition, clicks around a bit, and checks nothing throws.

// this React version's typings only describe the synchronous act(); the async form works at runtime
const act = (syncAct as unknown) as (cb: () => void | Promise<void>) => Promise<void>;

function game(): GameState {
    const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `Houseguest${i}`, imageURL: "" }));
    return prepareNextWeek(new GameState({ players: cast, jury: 5 }), BigBrotherVanilla);
}

const history = [
    { week: 1, hohId: 0, nomineeIds: [1, 2], povId: 3, evictedIds: [1] },
    { week: 2, hohId: 4, nomineeIds: [2, 5], povId: 6, evictedIds: [2] },
];

describe.each(ALL_COMPS.map((c) => [c.name, c]))("%s", (_name, comp: any) => {
    it("renders and survives some taps", async () => {
        const gs = game();
        const participants = nonEvictedHouseguests(gs).slice(0, 4);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const reported: number[] = [];
        const finished: number[] = [];
        const Component = comp.Component;
        await act(async () => {
            ReactDOM.render(
                <Component
                    participants={participants}
                    human={participants[0]}
                    gameState={gs}
                    history={history}
                    rand={seededRand(123)}
                    opponents={participants.slice(1).map((hg, i) => ({ hg, score: comp.botScore(0.3 + i * 0.2, { gameState: gs, history }) }))}
                    report={(s: number) => reported.push(s)}
                    finish={(s: number) => finished.push(s)}
                />,
                container
            );
        });
        // click up to 15 buttons / tappable things
        for (let i = 0; i < 15; i++) {
            const targets = Array.from(container.querySelectorAll("button:not([disabled]), [style*='cursor: pointer']")) as HTMLElement[];
            if (targets.length === 0) break;
            const t = targets[i % targets.length];
            await act(async () => {
                t.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
                t.click();
                await new Promise((r) => setTimeout(r, 20));
            });
        }
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(container.innerHTML.length).toBeGreaterThan(0);
        [...reported, ...finished].forEach((s) => expect(Number.isFinite(s)).toBe(true));
        expect(Number.isFinite(comp.botScore(0.5, { gameState: gs, history }))).toBe(true);
        expect(typeof comp.format(comp.botScore(0.5, { gameState: gs, history }))).toBe("string");
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });
});

describe("comp runner screens", () => {
    it("renders the rules screen and the results leaderboard", async () => {
        const { CompPlay, CompResults } = require("./compRunner");
        const gs = game();
        const participants = nonEvictedHouseguests(gs).slice(0, 4);
        const container = document.createElement("div");
        document.body.appendChild(container);
        await act(async () => {
            ReactDOM.render(
                <CompPlay
                    title="Head of Household Competition"
                    comp={ALL_COMPS[1]}
                    participants={participants}
                    player={participants[0]}
                    gameState={gs}
                    history={history}
                    seed={7}
                    opponents={[]}
                    moreToPlay={true}
                    onScore={() => undefined}
                />,
                container
            );
        });
        expect(container.textContent).toContain("Stop the Clock");
        expect(container.textContent).toContain("no clock"); // hidden-timer comps say so instead of showing a limit
        let winner = -1;
        await act(async () => {
            ReactDOM.render(
                <CompResults
                    title="Head of Household Competition"
                    comp={ALL_COMPS[0]}
                    participants={participants}
                    humanIds={[participants[2].id]}
                    results={participants.map((hg, i) => ({ id: hg.id, score: i === 2 ? 500 : i * 100 }))}
                    onDone={(id: number) => (winner = id)}
                />,
                container
            );
        });
        expect(container.textContent).toContain("Winner");
        expect(container.querySelectorAll(".bbb-leaderboard li").length).toBe(4);
        await act(async () => {
            (container.querySelector("button") as HTMLButtonElement).click();
        });
        expect(winner).toBe(participants[2].id);
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
    });
});
