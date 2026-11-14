import { getById, MutableGameState } from "../model";
import { PlayerModeController, newPlayerSave } from "./playerModeController";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { createAlliance } from "./social/alliances";
import { PERSONALITIES, PERSONALITY_IDS, voice } from "./social/personality";
import { talkLine } from "./social/botTalk";
import { jurorType } from "./social/jury";
import { botAnswer } from "./social/finale";
import { newGame } from "./testing";

function season(n = 10): PlayerModeController {
    return new PlayerModeController(newPlayerSave(prepareNextWeek(newGame(n), BigBrotherVanilla), [0]));
}

describe("the rookie, the gossip, the floater hunter and the diplomat", () => {
    it("are personalities like the others: a blurb, tells, and a voice", () => {
        (["rookie", "gossip", "hunter", "diplomat"] as const).forEach((p) => {
            expect(PERSONALITY_IDS).toContain(p);
            expect(PERSONALITIES[p].blurb.length).toBeGreaterThan(20);
            expect(PERSONALITIES[p].tells.length).toBe(3);
            expect(voice(p, "voteAnswer", "k", "Zed")).toContain("Zed");
            expect(talkLine(p, "greet", "k").length).toBeGreaterThan(3);
        });
    });

    it("a rookie votes with its heart on the jury and says sorry; a hunter owns its game", () => {
        expect(jurorType("rookie", "k")).toBe("bitter");
        expect(jurorType("hunter", "k")).toBe("objective");
        expect(jurorType("diplomat", "k")).toBe("objective");
        expect(botAnswer("rookie")).toBe("sorry");
        expect(botAnswer("hunter")).toBe("own");
        expect(botAnswer("gossip")).toBe("deny");
    });

    it("a floater hunter HoH goes after someone who's won nothing and never seen the block", () => {
        const controller = season(8);
        const c: any = controller;
        controller.state.personalities = { ...controller.personalities, 3: "hunter" };
        // two weeks in (too early before that: nobody's had the chance to do anything)
        expect(c.personalityTargets(3)).toEqual([]);
        controller.state.history = [{ week: 1 } as any, { week: 2 } as any];
        controller.gameState.houseguests.forEach((hg) => {
            if (hg.id !== 3) hg.hohWins = 1;
        });
        getById(controller.gameState, 5).hohWins = 0; // coasting
        getById(controller.gameState, 6).hohWins = 0;
        getById(controller.gameState, 6).nominations = 2; // has at least fought off the block
        expect(c.personalityTargets(3)).toEqual([5]);
        // nobody coasting: no target of that kind
        getById(controller.gameState, 5).povWins = 1;
        expect(c.personalityTargets(3)).toEqual([]);
    });

    it("a diplomat HoH goes after whoever the house likes least", () => {
        const controller = season(8);
        const c: any = controller;
        controller.state.personalities = { ...controller.personalities, 3: "diplomat" };
        controller.gameState.houseguests.forEach((hg) => (hg.popularity = 0.2));
        getById(controller.gameState, 6).popularity = -0.9;
        expect(c.personalityTargets(3)).toEqual([6]);
    });

    it("a gossip lets slip an alliance among the others, and it goes in your notes", () => {
        const controller = season(8);
        const c: any = controller;
        controller.state.personalities = { ...controller.personalities, 2: "gossip" };
        const gs = new MutableGameState(controller.gameState);
        createAlliance(gs, controller.state.book, [4, 5], "The Vault");
        controller.state.gameState = gs as any;
        const said: string = c.gossipFrom(2, 0, 0);
        expect(said).toContain("The Vault");
        expect(said).toContain(getById(controller.gameState, 4).name);
        expect(controller.intelOn(0, 4).some((i) => i.text.includes("The Vault"))).toBe(true);
        expect(controller.intelOn(0, 5).some((i) => i.text.includes("The Vault"))).toBe(true);
    });

    it("a gossip never gives away an alliance the player is in", () => {
        const controller = season(6);
        const c: any = controller;
        const gs = new MutableGameState(controller.gameState);
        createAlliance(gs, controller.state.book, [0, 4], "Us Two");
        controller.state.gameState = gs as any;
        for (let roll = 0; roll < 1; roll += 0.1) {
            const said: string | null = c.gossipFrom(2, 0, roll);
            if (said) expect(said).not.toContain("Us Two");
        }
    });
});
