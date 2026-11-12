import React from "react";
import ReactDOM from "react-dom";
import { act as syncAct } from "react-dom/test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import { nonEvictedHouseguests, PlayerProfile } from "../../model";
import { ALL_COMPS } from "../comps";
import { BBComicsComp, comicJurors, comicPile, comicsRight } from "../comps/iconicComps";
import { seededRand } from "../comps/random";
import { CompTestMode, testOpponents, testSeason } from "./compTestMode";

const act = (syncAct as unknown) as (cb: () => void | Promise<void>) => Promise<void>;
const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `Player${i}`, imageURL: "" } as PlayerProfile));

describe("BB Comics", () => {
    it("only comes up once there's a jury, and is about the jurors, in the order they left", () => {
        const early = testSeason(cast, "early");
        const jury = testSeason(cast, "jury");
        expect(BBComicsComp.available!(early.gameState, early.history)).toBe(false);
        expect(BBComicsComp.available!(jury.gameState, jury.history)).toBe(true);
        const jurors = comicJurors(jury.gameState, jury.history);
        const evictedOrder = jury.history.map((w) => w.evictedIds[0]).filter((id) => jury.gameState.houseguests[id].isJury);
        expect(jurors.map((j) => j.id)).toEqual(evictedOrder);
        expect(jurors.length).toBeGreaterThanOrEqual(2);
    });

    it("puts every juror's real cover and its forgeries on the table, the same for everyone", () => {
        const { gameState, history } = testSeason(cast, "jury");
        const pile = comicPile(gameState, history, seededRand(5));
        expect(JSON.stringify(comicPile(gameState, history, seededRand(5)))).toBe(JSON.stringify(pile));
        pile.jurors.forEach((_, of) => {
            const mine = pile.covers.filter((c) => c.of === of);
            expect(mine.filter((c) => c.real).length).toBe(1);
            expect(mine.length).toBe(3);
            expect(new Set(mine.map((c) => JSON.stringify(c.cover))).size).toBe(3); // the fakes really differ
        });
        const right = pile.jurors.map((_, of) => pile.covers.findIndex((c) => c.real && c.of === of));
        expect(comicsRight(pile, right)).toBe(pile.jurors.length);
        expect(comicsRight(pile, [...right].reverse())).toBeLessThan(pile.jurors.length);
    });

    it("a wrong order gets a red cross without saying what's wrong; the right one finishes", async () => {
        const { gameState, history } = testSeason(cast, "jury");
        const participants = nonEvictedHouseguests(gameState).slice(0, 4);
        const pile = comicPile(gameState, history, seededRand(77));
        const n = pile.jurors.length;
        const finished: number[] = [];
        const reported: number[] = [];
        const div = document.createElement("div");
        document.body.appendChild(div);
        const Comp = BBComicsComp.Component;
        await act(async () => {
            ReactDOM.render(
                <Comp
                    participants={participants}
                    human={participants[0]}
                    gameState={gameState}
                    history={history}
                    rand={seededRand(77)}
                    opponents={[]}
                    report={(s: number) => reported.push(s)}
                    finish={(s: number) => finished.push(s)}
                />,
                div
            );
        });
        const pool = () => Array.from(div.querySelectorAll(".bbb-comics-pool .bbb-comic")) as HTMLButtonElement[];
        const slots = () => Array.from(div.querySelectorAll(".bbb-comic-slot .bbb-comic")) as HTMLButtonElement[];
        const button = (t: string) => Array.from(div.querySelectorAll("button")).find((b) => b.textContent!.includes(t))!;
        expect(pool().length).toBe(n * 3);

        // the review: the real covers, in order, sliding in
        await act(async () => button("Review the comics").click());
        expect(div.querySelectorAll(".bbb-comic-slide").length).toBe(n);
        await act(async () => button("Back to the table").click());

        // wrong: a forgery in the first slot
        const right = pile.jurors.map((_, of) => pile.covers.findIndex((c) => c.real && c.of === of));
        const fake = pile.covers.findIndex((c) => !c.real && c.of === 0);
        const wrongOrder = [fake, ...right.slice(1)];
        for (const c of wrongOrder) await act(async () => pool()[c].click());
        expect(button("Lock it in").disabled).toBe(false);
        await act(async () => button("Lock it in").click());
        expect(div.querySelector(".bbb-comic-wrong")).not.toBeNull();
        expect(div.querySelector(".bbb-comic-wrong")!.textContent).not.toMatch(/#\d|slot|cover \d/i); // not told what
        expect(finished).toEqual([]);
        expect(reported).toEqual([n - 1]);

        // take the first slot back, put the real one in: done
        await act(async () => slots()[0].click());
        expect(div.querySelector(".bbb-comic-wrong")).toBeNull();
        await act(async () => pool()[right[0]].click());
        await act(async () => button("Lock it in").click());
        expect(finished.length).toBe(1);
        expect(finished[0]).toBeGreaterThan(1000);
        expect(BBComicsComp.format(finished[0])).toMatch(/^done in \d+s$/);
        ReactDOM.unmountComponentAtNode(div);
        div.remove();
    });

    it("bots that are better are faster", () => {
        const { gameState, history } = testSeason(cast, "jury");
        const avg = (skill: number) => {
            let t = 0;
            for (let s = 1; s <= 100; s++) t += BBComicsComp.simulate({ seed: s, gameState, history, participants: [] }, skill, seededRand(s)).score;
            return t / 100;
        };
        expect(avg(0.9)).toBeGreaterThan(avg(0.5));
        expect(avg(0.5)).toBeGreaterThan(avg(0.1));
    });
});

describe("test mode", () => {
    it("lists every comp, and marks the ones that wouldn't come up yet", () => {
        const html = renderToStaticMarkup(<CompTestMode cast={cast} />);
        ALL_COMPS.forEach((c) => expect(html).toContain(c.name.replace(/'/g, "&#x27;")));
        expect(html).toContain("Jury phase");
    });

    it("every comp can be set up with bots, early or at the jury stage", () => {
        (["early", "jury"] as const).forEach((stage) => {
            const { gameState, history } = testSeason(cast, stage);
            const participants = nonEvictedHouseguests(gameState).slice(0, 4);
            expect(participants.length).toBe(4);
            ALL_COMPS.forEach((comp) => {
                const opponents = testOpponents(comp, gameState, history, participants, 123);
                expect(opponents.length).toBe(3);
                opponents.forEach((o) => expect(Number.isFinite(o.score)).toBe(true));
            });
        });
    });

    it("works with a small cast too", () => {
        const { gameState } = testSeason(cast.slice(0, 3), "jury");
        expect(nonEvictedHouseguests(gameState).length).toBeGreaterThanOrEqual(4);
    });
});
