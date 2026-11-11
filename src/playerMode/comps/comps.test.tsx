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
                    title="Head of House Competition"
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
                    title="Head of House Competition"
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

describe("fairness: everyone plays the same comp", () => {
    const { buildQuiz } = require("./beforeOrAfter");
    const { generateMemoryWall } = require("./memoryWall");
    const { makeFacts } = require("./houseComps");

    async function renderHtml(comp: any, seed: number, gs: GameState) {
        const participants = nonEvictedHouseguests(gs).slice(0, 4);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const Component = comp.Component;
        // this compares the starting layout: don't let an animation frame sneak in and move things
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = (() => 0) as any;
        try {
            await act(async () => {
                ReactDOM.render(
                    <Component
                        participants={participants}
                        human={participants[0]}
                        gameState={gs}
                        history={history}
                        rand={seededRand(seed)}
                        opponents={[]}
                        report={() => undefined}
                        finish={() => undefined}
                    />,
                    container
                );
            });
        } finally {
            window.requestAnimationFrame = raf;
        }
        // strip things that legitimately differ between renders (timers, a zoom animation in progress)
        const html = container.innerHTML.replace(/\d+(\.\d+)?s\b/g, "#s").replace(/\d+:\d\d/g, "#:##").replace(/scale\([\d.]+\)/g, "scale(#)");
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        return html;
    }

    it.each(ALL_COMPS.map((c) => [c.name, c]))("%s shows every player the identical layout for the same seed", async (_n, comp: any) => {
        const gs = game();
        const a = await renderHtml(comp, 4242, gs);
        const b = await renderHtml(comp, 4242, gs);
        expect(a).toBe(b);
    });

    it("bots roll the same dice the players roll in Bank or Bust", async () => {
        const comp = ALL_COMPS.find((c) => c.id === "bank-or-bust")!;
        const gs = game();
        const participants = nonEvictedHouseguests(gs).slice(0, 4);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const Component = comp.Component;
        await act(async () => {
            ReactDOM.render(
                <Component
                    participants={participants}
                    human={participants[0]}
                    gameState={gs}
                    history={history}
                    rand={seededRand(99)}
                    opponents={[]}
                    report={() => undefined}
                    finish={() => undefined}
                />,
                container
            );
        });
        const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
        const seen: number[] = [];
        for (let i = 0; i < 6; i++) {
            const roll = Array.from(container.querySelectorAll("button")).find((b) => b.textContent!.includes("Roll"));
            const next = Array.from(container.querySelectorAll("button")).find((b) => b.textContent!.includes("Next round"));
            await act(async () => (roll || next)!.click());
            const face = faces.findIndex((f) => container.textContent!.includes(f));
            if (roll && face >= 0) seen.push(face + 1);
        }
        const expected = seededRand(99);
        seen.forEach((die) => expect(die).toBe(1 + Math.floor(expected() * 6)));
        expect(seen.length).toBeGreaterThan(0);
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
    });

    it("bots answer exactly the questions the players get", () => {
        const gs = game();
        const ctx = { seed: 777, gameState: gs, history, participants: nonEvictedHouseguests(gs) };
        const counts: { [id: string]: number } = {
            "memory-wall": generateMemoryWall(seededRand(777), gs).questions.length,
            "before-or-after": buildQuiz(gs, history, seededRand(777)).length,
            "fact-or-fiction": makeFacts(gs, seededRand(777), history).length,
            "zoom-in": 6,
        };
        Object.entries(counts).forEach(([id, n]) => {
            const comp = ALL_COMPS.find((c) => c.id === id)!;
            const result = comp.simulate(ctx, 0.5, seededRand(1));
            expect(result.answers!.length).toBe(n);
            expect(Math.floor(result.score / 100)).toBe(result.answers!.filter(Boolean).length);
        });
    });

    it("bot results are reproducible, and better bots do better on every skill comp", () => {
        const gs = game();
        [1, 2].forEach((id) => (gs.houseguests.find((h) => h.id === id)!.isEvicted = true)); // as in the history
        ALL_COMPS.filter((c) => c.kind !== "luck").forEach((comp) => {
            let weak = 0;
            let strong = 0;
            for (let seed = 1; seed <= 40; seed++) {
                const ctx = { seed, gameState: gs, history, participants: nonEvictedHouseguests(gs) };
                const a = comp.simulate(ctx, 0.9, seededRand(seed * 7));
                const again = comp.simulate(ctx, 0.9, seededRand(seed * 7));
                expect(again.score).toBe(a.score);
                strong += a.score;
                weak += comp.simulate(ctx, 0.1, seededRand(seed * 7)).score;
            }
            if (strong <= weak) throw new Error(`${comp.name}: strong bots (${strong}) should beat weak bots (${weak})`);
        });
    });
});

describe("knockout rounds", () => {
    it("between rounds, shows who just dropped out and who's still in", () => {
        const { knockoutRound } = require("./compUi");
        const opp = [3, 4, 5, 6, 8].map((score, i) => ({ hg: { id: i, name: `B${i}`, imageURL: "" }, score }));
        // first round cleared at 4: everyone below 4 is out
        let r = knockoutRound(opp, 4, true);
        expect(r.out.map((o: any) => o.score)).toEqual([3]);
        expect(r.still.length).toBe(4);
        // clearing 6: only the one who stopped at 5 drops out now
        r = knockoutRound(opp, 6, false);
        expect(r.out.map((o: any) => o.score)).toEqual([5]);
        expect(r.still.map((o: any) => o.score)).toEqual([6, 8]);
    });
});

describe("Fact or Fiction", () => {
    const { makeFacts, FactOrFictionComp } = require("./houseComps");
    it("is a late-game comp, and only asks about former houseguests", () => {
        const gs = game();
        expect(FactOrFictionComp.available(gs, history)).toBe(false);
        expect(makeFacts(gs, seededRand(3), history)).toEqual([]);
        const gone = [1, 2, 5, 6];
        gone.forEach((id) => (gs.houseguests.find((h) => h.id === id)!.isEvicted = true));
        const hist = gone.map((id, i) => ({ week: i + 1, hohId: 0, nomineeIds: [id, 3], evictedIds: [id] }));
        expect(FactOrFictionComp.available(gs, hist)).toBe(true);
        const facts = makeFacts(gs, seededRand(3), hist);
        expect(facts.length).toBeGreaterThan(5);
        const stillIn = gs.houseguests.filter((h) => !h.isEvicted).map((h) => h.name);
        facts.forEach((f: any) => stillIn.forEach((name) => expect(f.text).not.toMatch(new RegExp(`\b${name}\b`))));
    });
});

describe("the Last Chance comp", () => {
    it("is always a quick comp, never a long puzzle like Tainted Wine", () => {
        const { pickQuickComp, QUICK_COMPS } = require("./index");
        const gs = game();
        const seen = new Set<string>();
        const used: string[] = [];
        for (let i = 0; i < 40; i++) {
            const c = pickQuickComp(gs, history, used);
            used.push(c.id);
            seen.add(c.id);
            expect(c.id).not.toBe("tainted-wine");
            expect(c.maxSeconds).toBeLessThanOrEqual(120);
        }
        expect(seen.size).toBe(QUICK_COMPS.length);
    });
});

describe("ties", () => {
    it("scores that read the same are tied, even with a hidden time bonus", () => {
        const { tiedForFirst } = require("./compRunner");
        const comp = { format: (s: number) => `${Math.floor(s / 100)} correct` };
        // 3 correct (fast), 3 correct (slow), 2 correct
        expect(tiedForFirst(comp, [{ id: 1, score: 312 }, { id: 2, score: 345 }, { id: 3, score: 290 }])).toEqual([2, 1]);
        // a clear winner stays a clear winner
        expect(tiedForFirst(comp, [{ id: 1, score: 412 }, { id: 2, score: 345 }])).toEqual([1]);
    });

    it("endurance comps are last one standing: outlasting by a hair still wins", () => {
        const { tiedForFirst } = require("./compRunner");
        const wall = { kind: "endurance", format: (s: number) => `lasted ${s.toFixed(1)}s` };
        // the last bot fell at 42.50s, the player let go a frame later
        expect(tiedForFirst(wall, [{ id: 1, score: 42.5 }, { id: 2, score: 42.52 }, { id: 3, score: 30 }])).toEqual([2]);
        // both lasted the full time: that's a real tie
        expect(tiedForFirst(wall, [{ id: 1, score: 300 }, { id: 2, score: 300 }])).toEqual([1, 2]);
    });
});
