import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newPlayerSave, PlayerModeController, Prompt, Step } from "./playerModeController";
import { mentionsIn, readMessage, TALKS_MIN, TALKS_PER_BLOCK, talkLine, talkPatience } from "./social/botTalk";
import { answer, newGame } from "./testing";
import { nonEvictedHouseguests } from "../model";
import { BotTalkPanel } from "./ui/botTalkPanel";

const people = [
    { id: 1, name: "Alex" },
    { id: 2, name: "Jordan Lee" },
    { id: 3, name: "Sam" },
];

describe("reading what players say to bots", () => {
    const read = (text: string, iAmHoh = false) => readMessage(text, mentionsIn(text, people), { iAmHoh });

    it("finds houseguests by full or first name", () => {
        expect(mentionsIn("I think jordan and ALEX are close", people)).toEqual([2, 1]);
        expect(mentionsIn("Samantha is nice", people)).toEqual([]);
        expect(mentionsIn("Jordan Lee?", people)).toEqual([2]);
    });

    it("understands questions, offers and small talk", () => {
        expect(read("hey, who are you targeting this week?").kind).toBe("askTarget");
        expect(read("Who are you voting for?").kind).toBe("askVote");
        expect(read("are we good?").kind).toBe("askFeeling");
        expect(read("Do you trust me")).toEqual({ kind: "askFeeling" });
        expect(read("what do you think of Sam?")).toEqual({ kind: "askOpinion", aboutId: 3 });
        expect(read("who are you working with?").kind).toBe("askAllies");
        expect(read("final 2? you and me").kind).toBe("final2");
        expect(read('Want to start an alliance called "The Squad"?')).toEqual({ kind: "alliance", name: "The Squad" });
        expect(read("we need to get Alex out, they win every comp")).toEqual({ kind: "pitch", targetId: 1, reason: "comps" });
        expect(read("Sam is coming for you, they have to go")).toEqual({ kind: "pitch", targetId: 3, reason: "relationship" });
        // the same, with nothing asked of them: a rumour
        expect(read("Heads up, Sam is coming for you")).toEqual({ kind: "rumour", targetId: 3, rumour: "coming" });
        expect(read("Sam has a secret alliance with the others")).toEqual({ kind: "rumour", targetId: 3, rumour: "secretAlliance" });
        expect(read("Sam has been talking trash about you")).toEqual({ kind: "rumour", targetId: 3, rumour: "trashTalk" });
        expect(read("Is Sam coming for you?")).not.toEqual(expect.objectContaining({ kind: "rumour" }));
        expect(read("I'm voting to evict Jordan")).toEqual({ kind: "tellVote", targetId: 2 });
        expect(read("I'm putting up Sam", true)).toEqual({ kind: "tellTarget", targetId: 3 });
        expect(read("please keep me, I need this for my family")).toEqual({ kind: "keepMe", pity: true });
        expect(read("you're kind of cute").kind).toBe("flirt");
        expect(read("you're such a snake").kind).toBe("insult");
        expect(read("you're the best").kind).toBe("compliment");
        expect(read("how are you doing?").kind).toBe("howAreYou");
        expect(read("hey!").kind).toBe("greet");
        expect(read("I miss my dog so much")).toEqual({ kind: "small", topic: "home" });
        expect(read("what's your favourite colour?")).toEqual({ kind: "unknown", question: true });
    });

    it("gives friends more time for you than enemies, between 2 and 12 messages, with some luck either way", () => {
        const rolls = Array.from({ length: 50 }, (_, i) => i / 49);
        const avg = (rel: number) => rolls.reduce((sum, r) => sum + talkPatience(rel, 1, r), 0) / rolls.length;
        [-1, -0.5, 0, 0.5, 1].forEach((rel) =>
            [0.7, 1, 1.6].forEach((chats) =>
                rolls.forEach((r) => {
                    const n = talkPatience(rel, chats, r);
                    expect(n).toBeGreaterThanOrEqual(TALKS_MIN);
                    expect(n).toBeLessThanOrEqual(TALKS_PER_BLOCK);
                })
            )
        );
        expect(avg(-1)).toBeLessThan(avg(0));
        expect(avg(0)).toBeLessThan(avg(1));
        expect(talkPatience(-1, 1, 0)).toBe(TALKS_MIN);
        expect(talkPatience(1, 1, 1)).toBe(TALKS_PER_BLOCK);
        // it varies: a busy friend can have less time than a curious enemy
        expect(talkPatience(1, 1, 0)).toBeLessThan(talkPatience(-1, 1, 1));
    });

    it("answers in the bot's own voice, the same way every time", () => {
        const a = talkLine("villain", "targetIs", "k1", "Sam");
        expect(a).toBe(talkLine("villain", "targetIs", "k1", "Sam"));
        expect(a).toContain("Sam");
        expect(talkLine(undefined, "greet", "k2").length).toBeGreaterThan(0);
    });
});

describe("talking to bots in a season", () => {
    it("bots answer, questions are free, offers use an action, and bots get tired", () => {
        const controller = new PlayerModeController(newPlayerSave(newGame(8), [0]));
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        let socialTurns = 0;
        let deals = 0;
        let outside = 0;
        const maxes = new Set<number>();
        let guard = 0;
        while (guard++ < 6000) {
            const p = prompt as Prompt | null;
            if (!p) throw new Error("No prompt");
            if (p.kind === "gameOver") break;
            if (p.kind === "social" && controller.socialActor.id === 0) {
                socialTurns++;
                const bots = nonEvictedHouseguests(controller.gameState).filter((hg) => hg.id !== 0);
                const bot = bots[socialTurns % bots.length];
                const before = controller.state.actionsLeft;
                const hi = controller.talkToBot(bot.id, "hey, how are you?")!;
                expect(hi.lines.map((l) => l.who)).toEqual(["me", "bot"]);
                // starting to talk takes an action; then the whole conversation is covered
                expect(controller.state.actionsLeft).toBe(before - 1);
                expect(controller.talkStarted(0, bot.id)).toBe(true);
                // how long they'll talk for: set when you start, between 2 and 12
                const max = controller.state.talks![0][bot.id].max!;
                expect(max).toBeGreaterThanOrEqual(TALKS_MIN);
                expect(max).toBeLessThanOrEqual(TALKS_PER_BLOCK);
                maxes.add(max);
                controller.talkToBot(bot.id, "who are you targeting?");
                const told = controller.state.talks![0][bot.id].target;
                expect(told).not.toBe(0); // nobody names you as their target to your face
                if (max >= 3) {
                    const again = controller.talkToBot(bot.id, "who are you targeting?")!;
                    expect(controller.state.talks![0][bot.id].target).toBe(told); // asked twice, same answer
                    if (told !== null && told !== undefined) expect(again.lines[1].text).toContain(controller.player(told).name);
                    expect(again.lines.length).toBe(2);
                }
                expect(controller.state.actionsLeft).toBe(before - 1);
                if (max >= 4 && bots.length >= 3) {
                    const offer = controller.talkToBot(bot.id, "final two, you and me?")!;
                    if (offer.outcome) {
                        deals++;
                        expect(controller.state.actionsLeft).toBe(before - 1); // part of the conversation
                        expect(offer.lines.map((l) => l.who)).toEqual(["me", "bot", "note"]);
                    }
                }
                // once they're out of time, they're out of time (it doesn't change mid-chat)
                while (controller.state.talks![0][bot.id].n < max) controller.talkToBot(bot.id, "lol");
                expect(controller.state.talks![0][bot.id].max).toBe(max);
                const n = controller.state.actionsLeft;
                const tired = controller.talkToBot(bot.id, "final two?")!;
                expect(tired.outcome).toBeUndefined();
                expect(controller.state.actionsLeft).toBe(n);
                // not to other players, or the evicted
                expect(controller.talkToBot(0, "hi")).toBeNull();
                const html = renderToStaticMarkup(<BotTalkPanel controller={controller} botId={bot.id} onOutcome={() => undefined} />);
                expect(html).toContain(hi.lines[1].text.replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));
            }
            if (p.kind !== "social" && p.kind !== "alliance") {
                outside++;
                const bot = nonEvictedHouseguests(controller.gameState).find((hg) => hg.id !== 0)!;
                expect([p.kind, controller.state.step, controller.talkToBot(bot.id, "hi")]).toEqual([p.kind, controller.state.step, null]); // only in social time
            }
            answer(controller, p, "random", false);
        }
        expect(outside).toBeGreaterThan(10);
        expect(controller.state.step).toBe(Step.GameOver);
        expect(socialTurns).toBeGreaterThan(2);
        expect(deals).toBeGreaterThan(0);
        expect(maxes.size).toBeGreaterThan(1); // not the same every time
        // what was said survives a save
        const saved = JSON.parse(JSON.stringify(controller.state));
        expect(Object.keys(saved.talks[0]).length).toBeGreaterThan(0);
    });
});
