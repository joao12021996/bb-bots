import React from "react";
import ReactDOM from "react-dom";
import { act as syncAct } from "react-dom/test-utils";
import { GameState, nonEvictedHouseguests, PlayerProfile } from "../../model";
import { prepareNextWeek } from "../../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../../components/episode/bigBrotherEpisode";
import { ALL_COMPS } from ".";
import { seededRand } from "./random";
import { StageContext, StageInfo, StageScores } from "./compUi";

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
    it("is always a quick comp, never a long puzzle like Wine Cellar", () => {
        const { pickQuickComp, QUICK_COMPS } = require("./index");
        const gs = game();
        const seen = new Set<string>();
        const used: string[] = [];
        for (let i = 0; i < 40; i++) {
            const c = pickQuickComp(gs, history, used);
            used.push(c.id);
            seen.add(c.id);
            expect(c.id).not.toBe("wine-cellar");
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

describe("the score between stages", () => {
    const face = (id: number, name: string) => ({ id, name, imageURL: "" });
    const count = ALL_COMPS.find((c) => c.id === "count-em")!;
    const simon = ALL_COMPS.find((c) => c.id === "simon-says")!;
    const ctx = () => {
        const gs = game();
        return { seed: 5, gameState: gs, history, participants: nonEvictedHouseguests(gs) };
    };
    const draw = (info: StageInfo, el: React.ReactElement) => {
        const div = document.createElement("div");
        syncAct(() => {
            ReactDOM.render(<StageContext.Provider value={info}>{el}</StageContext.Provider>, div);
        });
        const rows = Array.from(div.querySelectorAll("li")).map(
            (r) => `${r.querySelector(".bbb-lb-name")!.textContent}: ${r.querySelector(".bbb-lb-score")!.textContent}`
        );
        ReactDOM.unmountComponentAtNode(div);
        return rows;
    };

    it("shows everyone's score after the rounds played so far, bots and players still playing included", () => {
        const info: StageInfo = {
            comp: count,
            ctx: ctx(),
            human: face(1, "Me"),
            mine: () => ({ picks: [1, 0] }),
            opponents: [{ hg: face(2, "Bot"), score: -9, picks: [3, 3, 1, 1, 1] }],
            playing: [
                { hg: face(3, "Ann"), score: -10, picks: [0] },
                { hg: face(4, "Cal"), score: null },
            ],
        };
        expect(draw(info, <StageScores done={2} />)).toEqual([
            "Ann ⏳ round 2: 0 off in total",
            "You: 1 off in total",
            "Bot: 6 off in total",
            "Cal ⏳ round 1: playing…",
        ]);
    });

    it("shows how far everyone got in a knockout", () => {
        const info: StageInfo = {
            comp: simon,
            ctx: ctx(),
            human: face(1, "Me"),
            mine: () => ({}),
            opponents: [
                { hg: face(2, "Bot"), score: 9 },
                { hg: face(4, "Out"), score: 4 },
                { hg: face(5, "Done"), score: 7, live: { done: true } },
            ],
            playing: [{ hg: face(3, "Ann"), score: null }],
        };
        expect(draw(info, <StageScores cleared={5} />)).toEqual([
            "Done: sequence of 7",
            "You: sequence of 5",
            "Bot: sequence of 5",
            "Out: sequence of 4",
            "Ann ⏳: playing…",
        ]);
    });

    it("every comp played in rounds can work out a bot's score after each round, adding up to its result", () => {
        const staged = ALL_COMPS.filter((c) => c.progress);
        expect(staged.length).toBeGreaterThanOrEqual(15);
        staged.forEach((comp) => {
            for (let seed = 1; seed <= 5; seed++) {
                const c = { ...ctx(), seed };
                if (comp.available && !comp.available(c.gameState, c.history)) continue;
                const r = comp.simulate(c, 0.6, seededRand(seed));
                expect(r.answers || r.picks).toBeTruthy();
                const rounds = Math.max(r.answers ? r.answers.length : 0, r.picks ? r.picks.length : 0);
                const end = comp.progress!(r, rounds, c);
                // speed bonuses aside, the last round's score is the result
                expect([comp.id, Math.abs(end - r.score) < 100]).toEqual([comp.id, true]);
                expect([comp.id, comp.progress!(r, 0, c) === 0]).toEqual([comp.id, true]);
            }
        });
    });
});

describe("after each round: your answer, everyone else's, then the right one", () => {
    async function mount(id: string, seed: number) {
        const comp = ALL_COMPS.find((c) => c.id === id)!;
        const gs = game();
        const participants = nonEvictedHouseguests(gs).slice(0, 3);
        const ctx = { seed, gameState: gs, history, participants };
        const opponents = participants.slice(1).map((hg, i) => ({ hg, ...comp.simulate(ctx, 0.5, seededRand(i + 1)) }));
        const finished: number[] = [];
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
                    rand={seededRand(seed)}
                    opponents={opponents}
                    report={() => undefined}
                    finish={(s: number) => finished.push(s)}
                />,
                container
            );
        });
        const button = (text: string) => {
            const all = Array.from(container.querySelectorAll("button"));
            return all.find((b) => b.textContent!.trim() === text) || all.find((b) => b.textContent!.includes(text));
        };
        const click = (text: string) => act(async () => button(text)!.click());
        const answers = () =>
            Array.from(container.querySelectorAll(".bbb-answer")).map((r) => `${r.querySelector("b")!.textContent}: ${r.querySelector(".bbb-answer-text")!.textContent}`);
        const done = () => {
            ReactDOM.unmountComponentAtNode(container);
            container.remove();
        };
        return { container, opponents, participants, button, click, answers, finished, done };
    }

    it("Count 'Em: everyone's count, and how many there really were", async () => {
        jest.useFakeTimers();
        try {
            const m = await mount("count-em", 31);
            const { generateCountRounds } = require("./memoryComps");
            const rounds = generateCountRounds(seededRand(31));
            for (let r = 0; r < rounds.length; r++) {
                await act(async () => {
                    jest.advanceTimersByTime(5000);
                });
                for (const d of String(rounds[r].answer + 1)) await m.click(d);
                await m.click("OK");
                const rows = m.answers();
                expect(rows[0]).toBe(`You: ${rounds[r].answer + 1} (1 off)`);
                m.opponents.forEach((o, i) => {
                    const miss = o.picks![r];
                    expect(rows[i + 1]).toMatch(/^\S+: \d+ \((spot on|\d+ off)\)$/);
                    expect(rows[i + 1]).toContain(`${o.hg.name}: `);
                    expect(rows[i + 1]).toContain(miss === 0 ? "(spot on)" : `(${miss} off)`);
                    expect(Math.abs(parseInt(rows[i + 1].split(": ")[1], 10) - rounds[r].answer)).toBe(miss);
                });
                expect(m.container.textContent).toContain(`The answer: ${rounds[r].answer}`);
                expect(m.finished).toEqual([]); // it waits for you
                await m.click(r + 1 < rounds.length ? "Next round" : "See how I did");
            }
            expect(m.finished.length).toBe(1);
            m.done();
        } finally {
            jest.useRealTimers();
        }
    });

    it("Higher or Lower: everyone's call, then the next card", async () => {
        const m = await mount("higher-or-lower", 8);
        for (let k = 0; k < 10; k++) {
            await m.click("Higher");
            const rows = m.answers();
            expect(rows[0]).toBe("You: ⬆️ Higher");
            m.opponents.forEach((o, i) => expect(rows[i + 1]).toBe(`${o.hg.name}: ${o.picks![k] ? "⬆️ Higher" : "⬇️ Lower"}`));
            expect(m.container.textContent).toContain("The next card:");
            await m.click(k < 9 ? "Next card" : "See how I did");
        }
        expect(m.finished.length).toBe(1);
        m.done();
    });
});
