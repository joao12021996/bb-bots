import React from "react";
import ReactDOM from "react-dom";
import { act as syncAct } from "react-dom/test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import { nonEvictedHouseguests, PlayerProfile } from "../../model";
import { ALL_COMPS } from "../comps";
import { BBComicsComp, comicPile, comicsRight } from "../comps/iconicComps";
import { seededRand } from "../comps/random";
import { CompTestMode, testOpponents, testSeason } from "./compTestMode";

const act = (syncAct as unknown) as (cb: () => void | Promise<void>) => Promise<void>;
const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `Player${i}`, imageURL: "" } as PlayerProfile));

describe("BB Comics", () => {
    it("only comes up once there's a jury, and has a comic for every houseguest of the season", () => {
        const early = testSeason(cast, "early");
        const jury = testSeason(cast, "jury");
        expect(BBComicsComp.available!(early.gameState, early.history)).toBe(false);
        expect(BBComicsComp.available!(jury.gameState, jury.history)).toBe(true);
        const pile = comicPile(jury.gameState, jury.history, seededRand(9));
        // evicted or not, everyone's in it, in a mixed-up order
        expect(pile.cast.map((hg) => hg.id).sort((a, b) => a - b)).toEqual(jury.gameState.houseguests.map((hg) => hg.id));
        expect(pile.cast.some((hg) => hg.isEvicted)).toBe(true);
        expect(pile.cast.some((hg) => !hg.isEvicted)).toBe(true);
    });

    it("puts every juror's real cover and its forgeries on the table, the same for everyone", () => {
        const { gameState, history } = testSeason(cast, "jury");
        const pile = comicPile(gameState, history, seededRand(5));
        expect(JSON.stringify(comicPile(gameState, history, seededRand(5)))).toBe(JSON.stringify(pile));
        pile.cast.forEach((_, of) => {
            const mine = pile.covers.filter((c) => c.of === of);
            expect(mine.filter((c) => c.real).length).toBe(1);
            expect(mine.length).toBe(3);
            expect(new Set(mine.map((c) => JSON.stringify(c.cover))).size).toBe(3); // the fakes really differ
        });
        const right = pile.cast.map((_, of) => pile.covers.findIndex((c) => c.real && c.of === of));
        expect(comicsRight(pile, right)).toBe(pile.cast.length);
        expect(comicsRight(pile, [...right].reverse())).toBeLessThan(pile.cast.length);
    });

    it("a wrong order gets a red cross without saying what's wrong; the right one finishes", async () => {
        const { gameState, history } = testSeason(cast, "jury");
        const participants = nonEvictedHouseguests(gameState).slice(0, 4);
        const pile = comicPile(gameState, history, seededRand(77));
        const n = pile.cast.length;
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
        // the table, by cover: each keeps its place (a cover under a stack leaves an empty spot)
        const spot = (c: number) => div.querySelectorAll(".bbb-comics-pool > div")[c] as HTMLElement;
        const onTable = (c: number) => spot(c).querySelector(".bbb-comic") as HTMLButtonElement;
        const slot = (i: number) => div.querySelectorAll(".bbb-comic-slot")[i].querySelector("button") as HTMLButtonElement;
        const button = (t: string) => Array.from(div.querySelectorAll("button")).find((b) => b.textContent!.includes(t))!;
        const tap = (b: HTMLElement) => act(async () => b.click());
        expect(div.querySelectorAll(".bbb-comics-pool .bbb-comic").length).toBe(n * 3);

        // the review: the real covers, numbered, in two rows that roll across and are gone
        await act(async () => button("Review the comics").click());
        const strip = div.querySelector(".bbb-comic-strip")!;
        expect(strip.querySelectorAll(".bbb-comic").length).toBe(n);
        const rows = strip.querySelectorAll(".bbb-comic-strip-row");
        expect(rows.length).toBe(2);
        expect(rows[0].querySelectorAll(".bbb-comic").length).toBe(Math.ceil(n / 2));
        expect(Array.from(strip.querySelectorAll(".bbb-comic-strip-item > b")).map((b) => b.textContent)).toEqual(pile.cast.map((_, i) => `#${i + 1}`));
        expect(div.querySelector(".bbb-comics-pool")).toBeNull(); // the table's out of sight meanwhile
        await act(async () => {
            strip.dispatchEvent(new Event("animationend", { bubbles: true }));
        });
        expect(div.querySelector(".bbb-comic-strip")).toBeNull();
        expect(div.querySelector(".bbb-comics-pool")).not.toBeNull();

        // wrong: a forgery in the first slot
        const right = pile.cast.map((_, of) => pile.covers.findIndex((c) => c.real && c.of === of));
        const fake = pile.covers.findIndex((c) => !c.real && c.of === 0);
        const wrongOrder = [fake, ...right.slice(1)];
        for (let i = 0; i < n; i++) {
            await tap(onTable(wrongOrder[i])); // pick it up
            await tap(slot(i)); // put it in
        }
        expect(button("Lock it in").disabled).toBe(false);
        await act(async () => button("Lock it in").click());
        expect(div.querySelector(".bbb-comic-wrong")).not.toBeNull();
        expect(div.querySelector(".bbb-comic-wrong")!.textContent).not.toMatch(/#\d|slot|cover \d/i); // not told what
        expect(finished).toEqual([]);
        expect(reported).toEqual([n - 1]);

        // pick up the real one and put it in the first slot, over the fake (which goes back on the table): done
        await tap(onTable(right[0]));
        await tap(slot(0));
        expect(div.querySelector(".bbb-comic-wrong")).toBeNull();
        expect(spot(fake).className).not.toContain("is-used");
        await act(async () => button("Lock it in").click());
        expect(finished.length).toBe(1);
        expect(finished[0]).toBeGreaterThan(1000);
        expect(BBComicsComp.format(finished[0])).toMatch(/^done in \d+s$/);
        ReactDOM.unmountComponentAtNode(div);
        div.remove();
    });

    it("stacks two covers of the same houseguest; tapping the stack shows both, and you keep one", async () => {
        const { gameState, history } = testSeason(cast, "jury");
        const participants = nonEvictedHouseguests(gameState).slice(0, 2);
        const pile = comicPile(gameState, history, seededRand(12));
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
                    rand={seededRand(12)}
                    opponents={[]}
                    report={() => undefined}
                    finish={() => undefined}
                />,
                div
            );
        });
        const spot = (c: number) => div.querySelectorAll(".bbb-comics-pool > div")[c] as HTMLElement;
        const onTable = (c: number) => spot(c).querySelector(".bbb-comic") as HTMLButtonElement;
        const button = (t: string) => Array.from(div.querySelectorAll("button")).find((b) => b.textContent!.includes(t))!;
        const tap = (b: HTMLElement) => act(async () => b.click());
        const real = pile.covers.findIndex((c) => c.real && c.of === 0);
        const fake = pile.covers.findIndex((c) => !c.real && c.of === 0);
        const stranger = pile.covers.findIndex((c) => c.of === 1);

        // a different houseguest's cover doesn't stack: you just pick that one up instead
        await tap(onTable(fake));
        expect(spot(fake).className).toContain("is-held");
        await tap(onTable(stranger));
        expect(spot(stranger).className).toContain("is-held");
        expect(div.querySelector(".is-stack")).toBeNull();

        // the same houseguest's: the one in hand goes on top
        await tap(onTable(fake));
        await tap(onTable(real));
        expect(spot(fake).className).toContain("is-stack");
        expect(spot(real).querySelector(".bbb-comic")).toBeNull(); // it's underneath now
        expect(div.querySelectorAll(".bbb-comics-pool .bbb-comic").length).toBe(pile.covers.length - 1);

        // tap the stack: both, side by side, to choose from
        await tap(onTable(fake));
        expect(div.querySelectorAll(".bbb-comic-choice").length).toBe(2);
        const keepButtons = Array.from(div.querySelectorAll(".bbb-comic-choice button.button")) as HTMLButtonElement[];
        expect(keepButtons.length).toBe(2);
        await tap(keepButtons[1]); // the one that was underneath
        expect(div.querySelector(".bbb-comic-choice")).toBeNull();
        expect(div.querySelector(".is-stack")).toBeNull();
        expect(spot(real).className).toContain("is-held"); // kept: in your hand
        expect(onTable(fake)).not.toBeNull(); // the other's back on the table
        await tap(button("Put in #1"));
        expect((div.querySelectorAll(".bbb-comic-slot")[0] as HTMLElement).querySelector(".bbb-comic")).not.toBeNull();
        expect(spot(real).className).toContain("is-used");
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
        expect(html).toContain("Bots:");
    });

    it("plays against as many bots as you pick", async () => {
        const div = document.createElement("div");
        document.body.appendChild(div);
        await act(async () => {
            ReactDOM.render(<CompTestMode cast={cast} />, div);
        });
        const button = (t: string) => Array.from(div.querySelectorAll("button")).find((b) => (b.getAttribute("aria-label") || b.textContent!).includes(t))!;
        await act(async () => button("Fewer bots").click());
        await act(async () => button("Fewer bots").click());
        expect(button("Fewer bots").disabled).toBe(true); // one at least
        await act(async () => button("Stop the Clock").click());
        // the rules screen shows who's playing: you and the one bot
        expect(div.querySelectorAll("img[alt]").length).toBe(2);
        expect(div.textContent).toContain("I'm ready");
        ReactDOM.unmountComponentAtNode(div);
        div.remove();
        // and up to everyone still in the house
        const { gameState } = testSeason(cast, "early");
        expect(nonEvictedHouseguests(gameState).length - 1).toBeGreaterThanOrEqual(6);
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
