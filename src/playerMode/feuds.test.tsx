import { getById } from "../model";
import { PlayerModeController, newPlayerSave } from "./playerModeController";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { houseFeed, madeUp } from "./social/feed";
import { newGame } from "./testing";

function season(n = 8): PlayerModeController {
    return new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(n), BigBrotherVanilla), [0]));
}

const feedText = (c: PlayerModeController) => c.feedLines().map((l) => l.text).join("\n");

describe("feuds", () => {
    it("a blow-up starts one: the feed says so, and it's in the player's notes on both", () => {
        const controller = season();
        const c: any = controller;
        c.startRivalry(3, 4);
        const [a, b] = [getById(controller.gameState, 3).name, getById(controller.gameState, 4).name];
        expect(controller.rivalsOf(3)).toEqual([4]);
        expect(controller.rivalsOf(4)).toEqual([3]);
        expect(feedText(controller)).toContain(`${a} and ${b} had it out`);
        expect(controller.intelOn(0, 3).some((i) => i.text.includes(`Feuding with ${b}`))).toBe(true);
        expect(controller.intelOn(0, 4).some((i) => i.text.includes(`Feuding with ${a}`))).toBe(true);
        // the same two again: still one feud
        c.startRivalry(4, 3);
        expect(controller.rivalries.length).toBe(1);
    });

    it("ends when the two make up (not the week it started), or one of them leaves", () => {
        const controller = season();
        const c: any = controller;
        const gs = controller.gameState;
        c.startRivalry(3, 4);
        c.startRivalry(5, 6);
        const friendly = (x: number, y: number, v: number) => {
            getById(gs, x).relationships[y] = v;
            getById(gs, y).relationships[x] = v;
        };
        friendly(3, 4, 0.3);
        friendly(5, 6, -0.8);
        expect(madeUp(gs, controller.rivalries[0])).toBe(true);
        // the week it started: too soon
        c.settleRivalries();
        expect(controller.rivalries.length).toBe(2);
        controller.rivalries.forEach((r) => (r.week -= 1));
        c.settleRivalries();
        expect(controller.rivalsOf(3)).toEqual([]);
        expect(controller.rivalsOf(5)).toEqual([6]);
        expect(feedText(controller)).toContain("buried the hatchet");
        getById(gs, 6).isEvicted = true;
        expect(controller.rivalsOf(5)).toEqual([]);
        c.settleRivalries();
        expect(controller.rivalries.length).toBe(0);
    });

    it("a bot HoH usually puts its rival up", () => {
        const controller = season();
        const c: any = controller;
        expect(c.rivalTarget(3)).toEqual([]);
        c.startRivalry(3, 4);
        let hits = 0;
        for (let i = 0; i < 40; i++) hits += c.rivalTarget(3).includes(4) ? 1 : 0;
        expect(hits).toBeGreaterThan(15);
        expect(hits).toBeLessThan(40);
    });

    it("feuds and showmances turn up in the house feed", () => {
        const controller = season();
        const gs = controller.gameState;
        let i = 0;
        const rand = () => ((i++ * 7) % 10) / 10;
        let all = "";
        for (let n = 0; n < 30; n++) {
            all += houseFeed(gs, { humanIds: [0], nomineeIds: [], showmances: [{ a: 1, b: 2, week: 1 } as any], personalities: controller.personalities, rivalries: [{ a: 3, b: 4, week: 1 }] }, rand).join("\n");
        }
        const name = (id: number) => getById(gs, id).name;
        expect(all).toMatch(new RegExp(`(${name(3)}|${name(4)}).*(${name(4)}|${name(3)})`));
        expect(all).not.toContain("{a}");
        expect(all).not.toContain("{place}");
    });
});
