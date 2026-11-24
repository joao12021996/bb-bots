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
        // the results video plays first (with a Skip); Continue is there all along
        expect(container.querySelector(".bbb-video .is-top")).not.toBeNull();
        await act(async () => {
            Array.from(container.querySelectorAll("button"))
                .find((b) => b.textContent === "Continue")!
                .click();
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

    it("ends once the player is the last one standing", () => {
        const { KnockoutPause } = require("./compUi");
        const opp = [3, 5].map((score, i) => ({ hg: { id: i, name: `B${i}`, imageURL: "" }, score }));
        const container = document.createElement("div");
        document.body.appendChild(container);
        let won = 0;
        let next = 0;
        const show = (cleared: number) =>
            syncAct(() => {
                ReactDOM.render(
                    <KnockoutPause opponents={opp} cleared={cleared} first={false} what={(n: number) => `${n}`} onNext={() => next++} onWin={() => won++} />,
                    container
                );
            });
        show(5); // B1 is still in
        expect(container.textContent).toContain("1 still in with you");
        expect(container.textContent).not.toContain("Finish");
        show(6); // nobody is
        expect(container.textContent).toContain("you win");
        const finish = Array.from(container.querySelectorAll("button")).find((b) => b.textContent!.includes("Finish"))!;
        syncAct(() => finish.click());
        expect(won).toBe(1);
        expect(next).toBe(0);
        ReactDOM.unmountComponentAtNode(container);
        container.remove();
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

describe("the daily season: memory comps skip what happened before you took over", () => {
    const { seenHistory } = require("../history");
    const { buildQuiz } = require("./beforeOrAfter");
    const { makeFacts } = require("./houseComps");
    const { generateRankRounds } = require("./rankEm");
    const { dayOf } = require("../days");
    const season = [
        { week: 1, hohId: 0, nomineeIds: [1, 2], povId: 3, evictedIds: [1] },
        { week: 2, hohId: 4, nomineeIds: [2, 5], povId: 6, evictedIds: [2] },
        { week: 3, hohId: 3, nomineeIds: [5, 6], povId: 7, evictedIds: [5] },
        { week: 4, hohId: 6, nomineeIds: [7, 0], povId: 4, evictedIds: [7] },
    ];

    it("trims the weeks before, and the part of the week before", () => {
        expect(seenHistory(season, undefined)).toBe(season);
        const seen = seenHistory(season, { week: 3, part: 0.35 });
        expect(seen.map((w: any) => w.week)).toEqual([3, 4]);
        expect(seen[0]).toMatchObject({ hohId: undefined, povId: 7, nomineeIds: [5, 6], evictedIds: [5] });
        expect(seenHistory(season, { week: 3, part: 0.9 })[0]).toMatchObject({ povId: undefined, nomineeIds: [], evictedIds: [5] });
        expect(seen[1]).toEqual(season[3]);
    });

    it("asks nothing about days before", () => {
        const gs = game();
        [1, 2, 5, 7].forEach((id) => (gs.houseguests.find((h) => h.id === id)!.isEvicted = true));
        const joinedAt = { week: 3, part: 0.35 };
        const seen = seenHistory(season, joinedAt);
        const joinedDay = dayOf(gs, 3, 0.35);
        const goneBefore = ["Houseguest1", "Houseguest2"];
        for (let seed = 0; seed < 20; seed++) {
            const quiz = buildQuiz(gs, seen, seededRand(seed));
            expect(quiz.length).toBeGreaterThan(0);
            quiz.forEach((q: any) => {
                const days = (q.prompt.match(/Day (\d+)/g) || []).map((d: string) => Number(d.slice(4)));
                days.forEach((d: number) => expect(d).toBeGreaterThanOrEqual(joinedDay));
                goneBefore.forEach((n) => expect(q.prompt).not.toContain(n));
                q.options.forEach((o: any) => o.hg && expect(goneBefore).not.toContain(o.hg.name));
            });
            makeFacts(gs, seededRand(seed), seen).forEach((f: any) => {
                goneBefore.forEach((n) => expect(f.text).not.toContain(n));
                if (/HoH|Head of Household|veto|block/.test(f.text)) expect(f.text).toContain(`since Day ${joinedDay}`);
            });
            generateRankRounds(seededRand(seed), gs, seen).forEach((r: any) =>
                r.hgs.forEach((hg: any) => expect(goneBefore).not.toContain(hg.name))
            );
        }
    });
});

describe("the Block Breaker", () => {
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
        // every quick comp that fits this early house (Face Off waits until halfway)
        expect(seen.size).toBe(QUICK_COMPS.filter((c: any) => !c.available || c.available(gs, history)).length);
    });
});

describe("Face Off", () => {
    it("only comes up once at least half the house is evicted", () => {
        const { FaceOffComp } = require("./faceOff");
        const gs = game();
        const total = gs.houseguests.length;
        gs.houseguests.forEach((hg: any, i: number) => (hg.isEvicted = i < Math.ceil(total / 2) - 1));
        expect(FaceOffComp.available(gs, history)).toBe(false);
        gs.houseguests.forEach((hg: any, i: number) => (hg.isEvicted = i < Math.ceil(total / 2)));
        expect(FaceOffComp.available(gs, history)).toBe(true);
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

    it("memory knockouts: getting through every round beats missing, and the fastest of those wins", () => {
        const { tiedForFirst } = require("./compRunner");
        const { speedScore, KNOCKOUT_ROUNDS } = require("./memoryComps");
        const key = ALL_COMPS.find((c) => c.id === "find-the-key")!;
        const fast = speedScore(KNOCKOUT_ROUNDS, 8.2);
        const slow = speedScore(KNOCKOUT_ROUNDS, 11.5);
        expect(key.format(fast)).toBe(`${KNOCKOUT_ROUNDS} keys found in 8.2s`);
        expect(key.format(4)).toBe("4 keys found");
        expect(tiedForFirst(key, [{ id: 1, score: slow }, { id: 2, score: fast }, { id: 3, score: KNOCKOUT_ROUNDS - 1 }])).toEqual([2]);
        // out in the same round: still a tie, for the tiebreaker
        expect(tiedForFirst(key, [{ id: 1, score: 6 }, { id: 2, score: 6 }, { id: 3, score: 3 }])).toEqual([1, 2]);
        // bots never go past the last round
        const simon = ALL_COMPS.find((c) => c.id === "simon-says")!;
        const gs = game();
        const ctx = { seed: 9, gameState: gs, history, participants: nonEvictedHouseguests(gs) };
        for (let i = 0; i < 50; i++) {
            const s = simon.simulate(ctx, 1, seededRand(i)).score;
            expect(s).toBeLessThan(13);
            if (s > 12) expect(simon.format(s)).toMatch(/^sequence of 12 in \d+\.\ds$/);
        }
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
    async function mount(id: string, seed: number, scores?: number[]) {
        const comp = ALL_COMPS.find((c) => c.id === id)!;
        const gs = game();
        const participants = nonEvictedHouseguests(gs).slice(0, 3);
        const ctx = { seed, gameState: gs, history, participants };
        const opponents = participants
            .slice(1)
            .map((hg, i) => ({ hg, ...(scores ? { score: scores[i] } : comp.simulate(ctx, 0.5, seededRand(i + 1))) }));
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
            Array.from(container.querySelectorAll(".bbb-board-fig")).map((r) => `${r.querySelector(".bbb-board-name")!.textContent}: ${r.querySelector(".bbb-board-front")!.textContent}`);
        const done = () => {
            ReactDOM.unmountComponentAtNode(container);
            container.remove();
        };
        return { container, opponents, participants, button, click, answers, finished, done };
    }

    it("Digit Span: everyone's number, then the real one; a wrong one waits for you before it ends", async () => {
        jest.useFakeTimers();
        try {
            const m = await mount("digit-span", 5);
            // the number, while it's up
            const shown = m.container.textContent!.match(/\d{4}$/)![0];
            await act(async () => {
                jest.advanceTimersByTime(5000);
            });
            for (const d of shown) await m.click(d);
            await m.click("OK");
            const rows = m.answers();
            expect(rows[0]).toBe(`You: ${shown}`);
            m.opponents.forEach((o) => {
                const row = rows.find((r) => r.startsWith(`${o.hg.name}: `))!;
                const typed = row.split(": ")[1];
                expect(typed).toHaveLength(4);
                if (o.score >= 4) expect(typed).toBe(shown);
                else expect(typed).not.toBe(shown);
            });
            expect(m.container.querySelector(".bbb-reveal-answer")!.textContent).toBe(`The number${shown}`);
            expect(m.finished).toEqual([]);
            await m.click("Next round");
            await act(async () => {
                jest.advanceTimersByTime(5000);
            });
            // round 2, wrong on purpose
            for (const d of "00000") await m.click(d);
            await m.click("OK");
            expect(m.container.textContent).toContain("you're out");
            expect(m.answers()[0]).toBe("You: 00000");
            expect(m.finished).toEqual([]);
            await m.click("See how I did");
            expect(m.finished).toEqual([4]);
            m.done();
        } finally {
            jest.useRealTimers();
        }
    });

    it("Guess the Number: right guesses stay hidden until half the field has them; they go through, the rest are out", async () => {
        const { encodeTurns, decodeTurns, settleGuesses, formatGuess } = require("./guessTheNumber");
        const { randInt } = require("./random");
        expect(decodeTurns(encodeTurns([2, 1, 3])).slice(0, 4)).toEqual([2, 1, 3, 31]);
        // 4 in it: the first 2 to get number 1 go through (here 3, tied on turn 2), then the first 2 of those 3
        const settled = settleGuesses([
            { id: 1, score: encodeTurns([2, 4, 1]) },
            { id: 2, score: encodeTurns([2, 2, 3]) },
            { id: 3, score: encodeTurns([1, 3, 2]) },
            { id: 4, score: encodeTurns([3, 1, 1]) },
        ]);
        expect(formatGuess(settled[4])).toBe("out on number 1");
        expect(formatGuess(settled[1])).toBe("out on number 2");
        expect(formatGuess(settled[2])).toBe("out on number 3");
        expect(formatGuess(settled[3])).toBe("🏆 last one standing");
        expect(formatGuess(encodeTurns([1]))).toBe("🤫"); // what's handed in gives nothing away
        jest.useFakeTimers();
        try {
            const r = seededRand(7);
            const secrets = Array.from({ length: 8 }, () => randInt(r, 1, 100));
            const wrong = (n: number) => String(n === 1 ? 2 : n - 1);
            const type = async (m: any, digits: string) => {
                for (const d of digits) await m.click(d);
                await m.click("Guess");
            };
            const board = (m: any, who: string) => m.answers().find((row: string) => row.startsWith(`${who}: `));

            // the bots get number 1 on guesses 2 and 3; the player never does, and is out once both have it
            const m = await mount("guess-the-number", 7, [encodeTurns([2, 1]), encodeTurns([3, 1])]);
            const [a, b] = m.opponents.map((o) => o.hg.name);
            await type(m, wrong(secrets[0]));
            expect(m.answers()).toHaveLength(3);
            expect(board(m, "You")).toMatch(/^You: \d+ (⬆️|⬇️)$/);
            expect(m.container.textContent).toContain("Nobody's got it yet");
            await m.click("Next guess");
            expect(m.container.textContent).not.toContain("It's between");
            await type(m, wrong(secrets[0]));
            expect(board(m, a)).toBe(`${a}: 🤫`); // got it, hidden
            expect(m.container.textContent).toContain("1 of the 2 needed has got it");
            await m.click("Next guess");
            await type(m, wrong(secrets[0]));
            expect(board(m, a)).toBe(`${a}: ${secrets[0]} ✅`);
            expect(board(m, b)).toBe(`${b}: ${secrets[0]} ✅`);
            expect(m.container.textContent).toContain("You're out");
            await m.click("See how I did");
            expect(m.finished).toEqual([encodeTurns([])]);
            m.done();

            // the player gets it first, locked in and hidden; once a bot has it too they go through, and on the
            // second number (two left: the first to get it wins) the player gets it alone
            const w = await mount("guess-the-number", 7, [encodeTurns([2, 2]), encodeTurns([3, 1])]);
            const [a2, b2] = w.opponents.map((o) => o.hg.name);
            await type(w, String(secrets[0]));
            expect(board(w, "You")).toBe("You: 🤫");
            await w.click("Next guess");
            expect(w.container.textContent).toContain("You've got it");
            await w.click("Next guesses");
            expect(board(w, "You")).toBe(`You: ${secrets[0]} ✅`);
            expect(board(w, a2)).toBe(`${a2}: ${secrets[0]} ✅`);
            expect(board(w, b2)).not.toContain("✅");
            await w.click("Next number");
            expect(w.answers()).toHaveLength(0);
            expect(w.container.textContent).toContain(`Still in: you and ${a2}`);
            await type(w, String(secrets[1]));
            expect(w.container.textContent).toContain("last one standing");
            await w.click("See how I did");
            expect(w.finished).toEqual([encodeTurns([1, 1])]);
            const final = settleGuesses([
                { id: 0, score: w.finished[0] },
                { id: 1, score: encodeTurns([2, 2]) },
                { id: 2, score: encodeTurns([3, 1]) },
            ]);
            expect(formatGuess(final[0])).toBe("🏆 last one standing");
            w.done();
        } finally {
            jest.useRealTimers();
        }
    });

    it("Guess the Number online: a turn waits for the other players' guesses, and shows the real ones", async () => {
        const { encodeTurns } = require("./guessTheNumber");
        const { randInt } = require("./random");
        const comp = ALL_COMPS.find((c) => c.id === "guess-the-number")!;
        const gs = game();
        const [me, rival, bot] = nonEvictedHouseguests(gs).slice(0, 3);
        const r = seededRand(7);
        const secret = randInt(r, 1, 100);
        const wrong = (n: number) => (n === 1 ? 2 : n - 1);
        const theirs = secret > 50 ? secret - 10 : secret + 10;
        const recorded: (number | string)[] = [];
        const container = document.createElement("div");
        document.body.appendChild(container);
        const render = (picks: string[]) =>
            act(async () => {
                ReactDOM.render(
                    <StageContext.Provider
                        value={{ comp, ctx: { seed: 7, gameState: gs, history, participants: [me, rival, bot] }, human: me, mine: () => ({}), opponents: [], playing: [{ hg: rival, score: null, picks }] } as StageInfo}
                    >
                        <comp.Component
                            participants={[me, rival, bot]}
                            human={me}
                            gameState={gs}
                            history={history}
                            rand={seededRand(7)}
                            opponents={[{ hg: bot, score: encodeTurns([4]) }]}
                            report={() => undefined}
                            finish={() => undefined}
                            recordAnswer={(_i: number, _c: boolean, pick?: number | string) => recorded.push(pick!)}
                        />
                    </StageContext.Provider>,
                    container
                );
            });
        await render([]);
        const click = (text: string) => act(async () => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent!.trim() === text) as HTMLButtonElement).click());
        for (const d of String(wrong(secret))) await click(d);
        await click("Guess");
        expect(recorded).toEqual([`0.1.${wrong(secret)}`]); // the guess goes out to the others
        expect(container.textContent).toContain(`Waiting for ${rival.name} to guess`);
        await render([`0.1.${theirs}`]); // theirs comes in
        const rows = Array.from(container.querySelectorAll(".bbb-board-fig")).map((f) => `${f.querySelector(".bbb-board-name")!.textContent}: ${f.querySelector(".bbb-board-front")!.textContent}`);
        expect(rows).toContain(`${rival.name}: ${theirs} ${theirs < secret ? "⬆️" : "⬇️"}`);
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });

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
                expect(m.container.textContent).toContain(`The answer${rounds[r].answer}`);
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
            expect(m.container.textContent).toContain("The next card");
            await m.click(k < 9 ? "Next card" : "See how I did");
        }
        expect(m.finished.length).toBe(1);
        m.done();
    });
});

describe("new comps", () => {
    const { makeQuotes, WhoSaidItComp, BuzzerBashComp, BalanceBeamComp } = require("./newComps");
    const { setPersonalitySource } = require("../social/personality");
    afterEach(() => setPersonalitySource(() => null));

    it("Who Said It? quotes the season's bots in their own voices, against bots that talk differently", () => {
        const gs = game();
        const ps: any = { 1: "villain", 2: "sweetheart", 3: "superfan", 4: "clown", 5: "paranoid", 6: "charmer", 7: "mastermind" };
        setPersonalitySource(() => ps);
        const quotes = makeQuotes(gs, seededRand(5));
        expect(quotes.length).toBe(6);
        quotes.forEach((q: any) => {
            expect(q.speakerId).not.toBe(0); // a player has no voice to quote
            expect(q.optionIds).toContain(q.speakerId);
            expect(new Set(q.optionIds.map((id: number) => ps[id])).size).toBe(q.optionIds.length);
            expect(q.text).not.toContain("{name}");
        });
        // and the same quotes for every player and bot
        expect(makeQuotes(gs, seededRand(5))).toEqual(quotes);
        const ctx = { seed: 5, gameState: gs, history, participants: nonEvictedHouseguests(gs) };
        const r = WhoSaidItComp.simulate(ctx, 0.5, seededRand(2));
        expect(r.answers.length).toBe(6);
        expect(Math.floor(r.score / 100)).toBe(r.answers.filter(Boolean).length);
    });

    it("Buzzer Bash bots play the boards the players get, and a buzzed round scores nothing", () => {
        const gs = game();
        const ctx = { seed: 11, gameState: gs, history, participants: nonEvictedHouseguests(gs) };
        for (let s = 1; s < 30; s++) {
            const r = BuzzerBashComp.simulate(ctx, 0.5, seededRand(s));
            expect(r.picks.length).toBe(3);
            r.picks.forEach((p: number, i: number) => {
                if (!r.answers[i]) expect(p).toBe(0);
                expect(p).toBeLessThanOrEqual(10);
            });
            expect(r.score).toBe(r.picks.reduce((a: number, b: number) => a + b, 0));
        }
    });

    it("Balance Beam lasts at most a minute", () => {
        const gs = game();
        for (let s = 1; s < 30; s++) {
            const r = BalanceBeamComp.simulate({ seed: s, gameState: gs, history, participants: [] }, s / 30, seededRand(s));
            expect(r.score).toBeGreaterThan(0);
            expect(r.score).toBeLessThanOrEqual(60);
        }
    });
});

// Fairness: every player gets exactly the same comp. Two different players play each comp with the same seed and
// tap the same things; what's on screen (questions, options, boards, layouts) must match. Names of the two players
// are masked (a comp may greet you by name), and so are positions and timers that move with the clock.
describe("every player gets exactly the same comp", () => {
    const screen = (el: HTMLElement) =>
        el.innerHTML
            .replace(/ style="[^"]*"/g, "")
            // how each of them takes an answer is picked from who they are: a face, not a different comp
            .replace(/ do-\w+/g, "")
            .replace(/is-react is-\w+( is-down)?/g, "is-react")
            .replace(/Houseguest[01]\b/g, "PLAYER")
            .replace(/\b\d+(\.\d+)?\s?s\b/g, "Ns")
            .replace(/\b\d+:\d\d\b/g, "N:NN");

    it.each(ALL_COMPS.map((c) => [c.name, c]))("%s", async (_name, comp: any) => {
        const gs = game();
        const participants = nonEvictedHouseguests(gs).slice(0, 4);
        const play = async (me: number) => {
            const container = document.createElement("div");
            document.body.appendChild(container);
            const Component = comp.Component;
            await act(async () => {
                ReactDOM.render(
                    <Component
                        participants={participants}
                        human={participants[me]}
                        gameState={gs}
                        history={history}
                        rand={seededRand(777)}
                        opponents={[]}
                        report={() => undefined}
                        finish={() => undefined}
                    />,
                    container
                );
            });
            const screens = [screen(container)];
            for (let i = 0; i < 6; i++) {
                const targets = Array.from(container.querySelectorAll("button:not([disabled]), [style*='cursor: pointer']")) as HTMLElement[];
                if (targets.length === 0) break;
                const t = targets[(i * 3) % targets.length];
                await act(async () => {
                    t.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
                    t.click();
                });
                screens.push(screen(container));
            }
            ReactDOM.unmountComponentAtNode(container);
            container.remove();
            return screens;
        };
        const a = await play(0);
        const b = await play(1);
        expect(b).toEqual(a);
    });
});

describe("Packing Day", () => {
    const { packingOrder, newTruck, settle, PACK_W, PACK_H } = require("./packingDay");

    it("deals the same boxes for the same seed, every shape once per seven", () => {
        const a = packingOrder(seededRand(5), 28);
        expect(packingOrder(seededRand(5), 28)).toEqual(a);
        for (let i = 0; i < 28; i += 7) expect([...a.slice(i, i + 7)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("loads a full row away, and stops when the boxes reach the top", () => {
        const order = [0, 0, 0, 0];
        const truck = newTruck(order);
        // a bottom row with just the last four spaces open, then a long box dropped into them
        truck.grid[PACK_H - 1] = Array.from({ length: PACK_W }, (_, c) => (c < PACK_W - 4 ? 1 : null));
        const loaded = settle({ ...truck, piece: { ...truck.piece, row: PACK_H - 1, col: PACK_W - 4 } }, order);
        expect(loaded.rows).toBe(1);
        expect(loaded.grid[PACK_H - 1].every((v: number | null) => v === null)).toBe(true);
        expect(loaded.over).toBe(false);
        const full = newTruck(order);
        full.grid = full.grid.map((row: (number | null)[], r: number) => (r === 0 ? row : row.map((_, c) => (c === 0 ? null : 1))));
        expect(settle({ ...full, piece: { ...full.piece, row: 0 } }, order).over).toBe(true);
    });
});

describe("comps played by colour", () => {
    it("are never picked while a Have-Not is competing", () => {
        const { pickWeeklyComp, pickQuickComp, WEEKLY_COMPS } = require("./index");
        const gs = game();
        const colour = WEEKLY_COMPS.filter((c: any) => c.needsColour).map((c: any) => c.id).sort();
        expect(colour).toEqual(["bb-comics", "color-clash", "reaction-lights"]);
        for (let i = 0; i < 60; i++) {
            expect(pickWeeklyComp(gs, history, [], undefined, true).needsColour).toBeFalsy();
            expect(pickQuickComp(gs, history, [], undefined, true).needsColour).toBeFalsy();
        }
        // with no Have-Not in it, they can come up
        const used = WEEKLY_COMPS.filter((c: any) => !c.needsColour).map((c: any) => c.id);
        expect(pickWeeklyComp(gs, history, used).needsColour).toBe(true);
    });
});
