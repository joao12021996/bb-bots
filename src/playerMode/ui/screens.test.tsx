import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { GameState, getById, MutableGameState, PlayerProfile } from "../../model";
import { newPlayerSave, PlayerModeController, Prompt, Step } from "../playerModeController";
import { generateNomCeremonyScene } from "../../components/episode/scenes/nomCeremonyScene";
import { withDefaults } from "../rules";
import { rulesSummary } from "./rulesEditor";
import { createAlliance } from "../social/alliances";
import { AUTO_SKIP_MS, SocialScreen } from "./socialScreen";
import { openPledges } from "../social/promises";
import { AllianceScreen } from "./allianceScreen";
import { FaceEditor } from "./faceEditor";
import { TutorialPage } from "../../components/tutorial/tutorialPage";
import { cueFor } from "./playerModeScreen";
import { bestScore, loadPref, recordScore, savePref } from "../../prefs/prefs";
import { Scene } from "../../components/episode/scenes/scene";
import { cartoonURL, lookFromURL, randomLook } from "../../cartoon/cartoon";
import { HohRoomScreen, HohVisitScreen } from "./hohRoomScreen";
import { openHohRoom } from "../social/hohRoom";
import { SpeechPrompt } from "./speechPrompt";
import { makeTiebreaker, TiebreakPlay, TiebreakResults } from "../comps/tiebreaker";
import { HideTiebreakPlay, HideTiebreakResults, tiebreakHouse } from "../comps/hideTiebreak";
import { duelDeck, MemoryDuelBoard } from "../comps/memoryDuel";
import { PlayerModeScreen } from "./playerModeScreen";
import { JuryReveal } from "./finaleScreens";
import { HouseWall } from "./houseWall";
import { CompResults } from "../comps/compRunner";
import { FactOrFictionComp } from "../comps/houseComps";
import { FindTheKeyComp, KNOCKOUT_ROUNDS } from "../comps/memoryComps";
import { seededRand } from "../comps/random";
import { useQuizClock } from "../comps/compUi";

// Mounts the social, alliance and face editor screens, clicks through them, and checks nothing throws.

function mount(el: JSX.Element): HTMLDivElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
        ReactDOM.render(el, container);
    });
    return container;
}

function click(container: HTMLElement, text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent || "").includes(text));
    if (!button) throw new Error(`No button with "${text}"`);
    act(() => {
        button.click();
    });
}

// A controller sitting at the first social time of a 7-player game, with an alliance and someone approaching.
function controllerAtSocial(): PlayerModeController {
    const cast: PlayerProfile[] = Array.from({ length: 7 }, (_, i) => ({ name: `HG${i}`, imageURL: "", social: 8 }));
    const controller = new PlayerModeController(newPlayerSave(new GameState({ players: cast, jury: 3 }), [0]));
    let prompt: Prompt | null = null;
    controller.prompt$.subscribe((p) => (prompt = p));
    controller.start();
    (prompt as unknown as { kind: string }).kind === "scene" && controller.continue();
    expect((prompt as unknown as Prompt).kind).toBe("social");
    const gs = new MutableGameState(controller.gameState);
    createAlliance(gs, controller.state.book, [0, 1, 2], "The Vault");
    controller.state.gameState = new GameState(gs);
    controller.state.approaches[0] = [
        { kind: "invite", fromId: 3, name: "Night Owls" },
        { kind: "pitch", fromId: 4, targetId: 5 },
        { kind: "chat", fromId: 6, text: "HG6 came by to chat." },
    ];
    return controller;
}

// Plays a player's decision on any screen that isn't a scene: always the first option, winning or losing comps.
function autoplay(controller: PlayerModeController, p: Prompt, win: boolean) {
    const { rankResults } = require("../comps/compRunner");
        if (p.kind === "handoff") p.next();
        else if (p.kind === "social") controller.endSocial();
        else if (p.kind === "alliance") controller.endAlliance();
        else if (p.kind === "compPlay") p.onScore(win ? 1e9 : -1e9);
        else if (p.kind === "compResults") p.onDone(rankResults(p.results)[0].id);
        else if (p.kind === "tiebreak") p.onGuess(p.question.answer);
        else if (p.kind === "hideTiebreak") p.onHide(0);
        else if (p.kind === "tiebreakResults" || p.kind === "hideResults" || p.kind === "knockout" || p.kind === "juryReveal") p.onDone();
        else if (p.kind === "choose") p.resolve(p.noneLabel ? [] : p.options.slice(0, p.count).map((o) => o.id));
        else if (p.kind === "speech") {
            p.deliver(p.tones[0].id, p.tones[0].pick ? [p.tones[0].pick.options[0].id] : []);
            p.next();
        } else if (p.kind === "hohVisit") {
            controller.hohVisit(p.actorId, null);
            controller.continue();
        } else if (p.kind === "hohRoom") controller.endHohRoom();
        else if (p.kind === "winePour") p.onPour({ offerTainted: true, claim: "clean" });
        else if (p.kind === "memoryDuel") p.onDone ? p.onDone() : p.onFlip!(p.deck.findIndex((_, i) => p.matched[i] === undefined && !p.open.includes(i)));
        else if (p.kind === "wineDrink") p.onDecide(false);
        else if (p.kind === "ownMoves") p.onDone([]);
        else if (p.kind === "juryQuestion") p.onAnswer("own");
        else throw new Error(`unhandled ${(p as any).kind}`);
}

describe("player mode screens", () => {
    it("sounds: nominations, evictions, your own comp win or loss, and the finale each have their own", () => {
        const scene = (title: string) => ({ kind: "scene", scene: new Scene({ title }) } as Prompt);
        expect(cueFor(scene("Nomination Ceremony"), [0])).toBe("nominate");
        expect(cueFor(scene("Live Eviction"), [0])).toBe("evict");
        expect(cueFor(scene("Eviction Speech"), [0])).toBeNull();
        expect(cueFor(scene("Veto Winner"), [0])).toBe("reveal");
        const results = (top: number) => ({ kind: "compResults", results: [{ id: top, score: 9 }, { id: 5, score: 3 }] } as any as Prompt);
        expect(cueFor(results(0), [0])).toBe("win");
        expect(cueFor(results(2), [0])).toBe("reveal"); // not in it
        expect(cueFor({ kind: "compResults", results: [{ id: 2, score: 9 }, { id: 0, score: 3 }] } as any, [0])).toBe("lose");
        expect(cueFor({ kind: "gameOver", content: <div /> }, [0])).toBe("fanfare");
    });

    it("remembers settings and best scores on this device", () => {
        savePref("test.x", { a: 1 });
        expect(loadPref("test.x", null)).toEqual({ a: 1 });
        expect(loadPref("test.missing", 7)).toBe(7);
        expect(recordScore("zz-comp", 5)).toBe(true);
        expect(recordScore("zz-comp", 3)).toBe(false);
        expect(recordScore("zz-comp", 8)).toBe(true);
        expect(bestScore("zz-comp")).toBe(8);
    });

    it("my stats: tiles, achievements (locked and unlocked), past seasons and best scores", () => {
        const { recordSeason, resetCareer } = require("../../career/career");
        const { StatsPage } = require("../../career/statsPage");
        resetCareer();
        recordSeason({
            key: "x:1", when: Date.now(), name: "Juno", placement: 2, castSize: 10, won: false, hohWins: 1, vetoWins: 0, lastChanceWins: 0,
            nominated: 2, survivedBlock: 2, juryVotesFor: 2, juryVotesTotal: 5, backstabs: 0, bigMoves: 0, brokePromises: 0,
            keptPromises: 0, alliances: 1, showmance: false, cameBack: false, difficulty: "normal", online: false, players: 1,
        });
        const c = mount(<StatsPage />);
        expect(c.textContent).toContain("Runner-up");
        expect(c.querySelectorAll(".bbb-ach.is-unlocked").length).toBeGreaterThan(0);
        expect(c.querySelectorAll(".bbb-ach:not(.is-unlocked)").length).toBeGreaterThan(5);
        act(() => (c.querySelector(".bbb-season-row") as HTMLButtonElement).click());
        expect(c.textContent).toContain("Share my season");
    });

    it("how to play: every section, with a contents link to each, and none of the old show names", () => {
        const c = mount(<TutorialPage />);
        const sections = c.querySelectorAll(".bbb-tutorial-section");
        expect(sections.length).toBeGreaterThan(5);
        const links = c.querySelectorAll(".bbb-tutorial-toc a");
        expect(links.length).toBe(sections.length);
        sections.forEach((sec) => expect(c.querySelector(`a[href="#${sec.id}"]`)).not.toBeNull());
        expect(c.textContent).toContain("Head of House");
        expect(c.textContent).not.toMatch(/Big Brother|BB /);
    });

    it("social time: answers approaches, chats, and proposes an alliance", () => {
        const controller = controllerAtSocial();
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("came to talk to you");
        // whoever came to talk: what they want is in the conversation with them
        expect(c.textContent).toContain("HG3 wants to talk to you");
        click(c, "Talk to HG3");
        expect(c.textContent).toContain("Night Owls");
        click(c, "Accept");
        expect(controller.alliancesOf(0).some((a) => a.name === "Night Owls")).toBe(true);
        expect(c.textContent).toContain("I'm in!"); // your answer stays in the conversation
        expect(controller.talkWith(0, 3).length).toBe(3);
        click(c, "Back");
        click(c, "Talk to HG4");
        click(c, "I'm in");
        click(c, "Back");
        click(c, "Talk to HG6");
        expect(c.textContent).toContain("HG6 came by to chat.");
        click(c, "OK");
        expect(controller.approachesFor(0).length).toBe(0);
        click(c, "Back");
        expect(c.textContent).not.toContain("came to talk to you");
        // talk to HG4: everything is done from the conversation
        const faces = Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"));
        act(() => faces[0].click());
        click(c, "Chat");
        expect(controller.state.actionsLeft).toBe(2);
        expect(c.textContent).toContain("Got a minute?");
        click(c, "Alliance");
        expect(c.textContent).toContain("Invite to The Vault");
        click(c, "Start it");
        expect(controller.state.actionsLeft).toBe(2); // talking to HG4 took one action: the rest of the conversation is part of it
        // pitch HG5 to HG4, with a reason
        click(c, "Pitch a target");
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        expect(c.textContent).toContain("Why should HG4 go after HG5?");
        click(c, "Great social game");
        expect(controller.state.actionsLeft).toBe(2);
        expect(c.textContent).toContain("Everybody loves HG5"); // the pitch, in your words
        click(c, "Back");
        // the morning is before the HoH comp: no alliance time
        expect(c.textContent).not.toContain("alliance time");
        click(c, "Skip the rest");
        expect(controller.state.step).not.toBe("SocialMorning");
    });

    it("nominations are revealed one at a time", () => {
        const controller = controllerAtSocial();
        const [, scene] = generateNomCeremonyScene(controller.gameState, [controller.player(0)], {
            forcedNominees: [controller.player(1), controller.player(2)],
            reveal: true,
        });
        const c = mount(<div>{scene.render}</div>);
        const buttons = () => Array.from(c.querySelectorAll("button")).map((b) => b.textContent || "");
        expect(buttons().some((b) => b.includes("Reveal the first nominee"))).toBe(true);
        expect(buttons()).not.toContain("Continue");
        expect(c.textContent).not.toContain("I have nominated you");
        for (const which of ["first", "second"]) {
            const b = Array.from(c.querySelectorAll("button")).find((x) => (x.textContent || "").includes(`Reveal the ${which}`))!;
            act(() => b.click());
        }
        expect(buttons()).toContain("Continue");
        expect(c.textContent).toContain("I have nominated you");
    });

    it("alliances meet before social time, then again after it", () => {
        const controller = controllerAtSocial();
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        const s = controller.state;
        s.step = Step.SocialAfternoon;
        s.week.hohId = 3;
        s.week.nomineeIds = [4, 5];
        controller.continue();
        const first = prompt as unknown as Prompt;
        expect(first.kind).toBe("alliance");
        expect((first as { blockName: string }).blockName).toContain("alliances first");
        expect(controller.allianceRound()).toBe("before");
        controller.endAlliance();
        expect((prompt as unknown as Prompt).kind).toBe("social");
        expect(controller.allianceRound()).toBe("after");
        controller.endSocial();
        expect((prompt as unknown as Prompt).kind).toBe("alliance");
    });

    it("after the veto comp, the nominees and the HoH make their case to the veto holder", () => {
        const controller = controllerAtSocial();
        const s = controller.state;
        s.step = Step.SocialVeto;
        s.week.hohId = 1;
        s.week.nomineeIds = [2, 3];
        s.week.povId = 0;
        s.approachKey = {};
        s.approaches[0] = [];
        (controller as any).startSocialTime(controller.player(0));
        const list = controller.approachesFor(0);
        expect(list.filter((a) => a.kind === "vetoPlea").map((a) => a.fromId).sort()).toEqual([2, 3]);
        expect(list.some((a) => a.kind === "vetoKeep" && a.fromId === 1)).toBe(true);
        // promise HG2 the veto, then don't use it: HG2 won't forget
        const i = list.findIndex((a) => a.kind === "vetoPlea" && a.fromId === 2);
        expect(controller.respondApproach(i, true)!.good).toBe(true);
        const before = controller.player(2).relationships[0];
        (controller as any).settleVetoPromises(0, null);
        expect(controller.player(2).relationships[0]).toBeLessThan(before - 0.2);
        // a nominee asks a bot veto holder: if it works, the bot uses the veto on them
        s.week = { hohId: 1, nomineeIds: [0, 3], povId: 2 };
        s.actionsLeft = 3;
        const outcome = controller.socialAct({ kind: "vetoCase", botId: 2 })!;
        expect(s.week.vetoCases![0]).toBe(outcome.good);
        s.week.vetoCases = { 0: true };
        const sway = (controller as any).swayVeto({ decision: null, reason: "" }, controller.player(2), [controller.player(0), controller.player(3)], controller.player(1));
        expect(sway.decision.id).toBe(0);
        // the HoH asked them to keep the nominations the same, and is closer to them
        s.week.vetoCases = { 1: true };
        const kept = (controller as any).swayVeto({ decision: controller.player(3), reason: "" }, controller.player(2), [controller.player(0), controller.player(3)], controller.player(1));
        expect(kept.decision).toBeNull();
    });

    it("a HoH can ask allies to go up as a pawn, and they remember it when they win HoH", () => {
        const controller = controllerAtSocial();
        const s = controller.state;
        s.step = Step.HohRoom;
        s.week.hohId = 0;
        s.week.room = openHohRoom(new MutableGameState(controller.gameState), s.book, 0, s.humanIds, []);
        expect(controller.askPawn(5)).toBeNull(); // not an ally
        expect(controller.askPawn(1)).not.toBeNull();
        expect(controller.askPawn(1)).toBeNull(); // asked already
        const c = mount(<HohRoomScreen controller={controller} actorId={0} />);
        expect(c.textContent).toContain("Pawns");
        expect(c.textContent).toContain("Ask HG2");
        s.week.room!.pawns = [
            { id: 1, yes: true },
            { id: 2, yes: false },
        ];
        (controller as any).settlePawnAsks(0, [1, 2]);
        expect(s.pawnFavors!.map((f) => [f.pawnId, f.agreed])).toEqual([
            [1, true],
            [2, false],
        ]);
        // HG1 went up for them: HG1 keeps them safe. HG2 said no and went up anyway: HG2 comes after them.
        s.week = { hohId: 1 };
        expect((controller as any).roomSway().protect).toContain(0);
        s.week = { hohId: 2 };
        expect((controller as any).roomSway().targets).toContain(0);
    });

    it("online, social time can be everyone at once or one player at a time", () => {
        expect(withDefaults({}).together).toBe(true);
        expect(withDefaults({ together: false }).together).toBe(false);
        expect(rulesSummary(withDefaults({ together: false }))).toContain("social time one player at a time");
        expect(controllerAtSocial().socialTogether).toBe(false); // one device: always turns
    });

    it("veto promises go in the ledger: kept if the veto holder does what they said, broken if not", () => {
        const controller = controllerAtSocial();
        const s = controller.state;
        s.step = Step.SocialVeto;
        s.week.hohId = 1;
        s.week.nomineeIds = [2, 3];
        s.week.povId = 0;
        s.approachKey = {};
        s.approaches[0] = [];
        (controller as any).startSocialTime(controller.player(0));
        const list = controller.approachesFor(0);
        controller.respondApproach(list.findIndex((a) => a.kind === "vetoPlea" && a.fromId === 2), true);
        controller.respondApproach(controller.approachesFor(0).findIndex((a) => a.kind === "vetoPlea" && a.fromId === 3), true);
        const ledger = controller.ledger;
        expect(openPledges(ledger, "veto").map((p) => [p.fromId, p.toId]).sort()).toEqual([
            [0, 2],
            [0, 3],
        ]);
        (controller as any).settleVetoPromises(0, 2); // saved HG2: kept their word to HG2, broke it to HG3
        const status = (to: number) => ledger.pledges.find((p) => p.kind === "veto" && p.toId === to)!.status;
        expect(status(2)).toBe("kept");
        expect(status(3)).toBe("broken");
    });

    it("social time before the veto ceremony only happens when there's someone to name as a replacement", () => {
        const controller = controllerAtSocial();
        const usable = (noms: number[], pov: number, hoh: number) => (controller as any).vetoUsable(noms, pov, hoh);
        expect(usable([1, 2], 3, 0)).toBe(true);
        const gs = new MutableGameState(controller.gameState);
        [4, 5, 6].forEach((id) => {
            getById(gs, id).isEvicted = true;
            gs.nonEvictedHouseguests.delete(id);
        });
        controller.state.gameState = new GameState(gs);
        expect(usable([1, 2], 3, 0)).toBe(false); // final four: everyone is the HoH, the veto holder or a nominee
        expect(usable([1, 2], 1, 0)).toBe(true); // a nominee holds it: HG3 can go up
    });

    it("bot nominees beg the veto holder in the house feed; a player veto holder hears it in person", () => {
        const controller = controllerAtSocial();
        const s = controller.state;
        s.step = Step.SocialVeto;
        s.week = { hohId: 3, nomineeIds: [4, 5], povId: 6 };
        const before = (s.feed || []).length;
        (controller as any).vetoLobbying();
        const lines = (s.feed || []).slice(before).map((l) => l.text);
        lines.forEach((l) => expect(l).toContain("HG6"));
        s.week = { hohId: 3, nomineeIds: [4, 5], povId: 0 };
        const after = (s.feed || []).length;
        (controller as any).vetoLobbying();
        expect((s.feed || []).length).toBe(after);
    });

    it("a HoH's backdoor plan: an ally who wins the veto pulls a pawn off", () => {
        const controller = controllerAtSocial();
        const s = controller.state;
        s.step = Step.HohRoom;
        s.week.hohId = 1;
        s.week.room = openHohRoom(new MutableGameState(controller.gameState), s.book, 1, s.humanIds, []);
        controller.planBackdoor(5);
        expect(s.week.backdoor).toBe(5);
        s.week.nomineeIds = [3, 4];
        // HG2 is in The Vault with the HoH
        const sway = (controller as any).swayVeto({ decision: null, reason: "" }, controller.player(2), [controller.player(3), controller.player(4)], controller.player(1));
        expect([3, 4]).toContain(sway.decision.id);
        expect(sway.reason).toContain("part of the plan");
        // HG6 isn't
        const other = (controller as any).swayVeto({ decision: null, reason: "" }, controller.player(6), [controller.player(3), controller.player(4)], controller.player(1));
        expect(other.reason).not.toContain("part of the plan");
        controller.planBackdoor(null);
        expect(s.week.backdoor).toBeUndefined();
    });

    it("players asked to be a pawn answer on their own screen before the nominations", () => {
        const controller = controllerAtSocial();
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        const s = controller.state;
        s.humanIds = [0, 1];
        s.step = Step.HohRoom;
        s.week.hohId = 2;
        const room = openHohRoom(new MutableGameState(controller.gameState), s.book, 2, s.humanIds, []);
        s.week.room = room;
        // a player HoH can ask another player (an ally): they answer later
        s.week.hohId = 0;
        room.hohId = 0;
        const asked = controller.askPawn(1)!;
        expect(asked.text).toContain("before the nomination ceremony");
        expect(room.pawnPending).toEqual([1]);
        expect(controller.askPawn(1)).toBeNull();
        (controller as any).answerPawnAsks(room);
        let p = prompt as unknown as Prompt;
        if (p.kind === "handoff") {
            p.next();
            p = prompt as unknown as Prompt;
        }
        expect(p.kind).toBe("choose");
        if (p.kind !== "choose") return;
        expect(p.actorId).toBe(1);
        p.resolve([0]);
        expect(room.pawns).toEqual([{ id: 1, yes: true }]);
        expect(room.pawnPending).toEqual([]);
    });

    it("alliances only meet before social time when something changed since they last met", () => {
        const controller = controllerAtSocial();
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        const s = controller.state;
        s.step = Step.SocialAfternoon;
        s.week.hohId = 3;
        s.week.nomineeIds = [4, 5];
        s.allianceMet = (controller as any).allianceSituation; // they met after the nominations, nothing new since
        controller.continue();
        expect((prompt as unknown as Prompt).kind).toBe("social");
        expect(controller.allianceRound()).toBe("after");
    });

    it("out of actions with nobody waiting: social time moves on by itself, unless the player wants to stay", () => {
        jest.useFakeTimers();
        try {
            const controller = controllerAtSocial();
            const s = controller.state;
            s.approaches[0] = [];
            s.actionsLeft = 0;
            const end = jest.spyOn(controller, "endSocial").mockImplementation(() => undefined);
            const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
            expect(c.textContent).toContain("Moving on in a moment");
            act(() => {
                jest.advanceTimersByTime(AUTO_SKIP_MS + 10);
            });
            expect(end).toHaveBeenCalledTimes(1);
            const c2 = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
            click(c2, "Wait, I'm not done");
            act(() => {
                jest.advanceTimersByTime(AUTO_SKIP_MS + 10);
            });
            expect(end).toHaveBeenCalledTimes(1);
            expect(c2.textContent).not.toContain("Moving on in a moment");
        } finally {
            jest.useRealTimers();
        }
    });

    it("flirting again too soon is creepy, and creeping someone out twice is for good", () => {
        const controller = controllerAtSocial();
        controller.state.actionsLeft = 10;
        controller.socialAct({ kind: "flirt", botId: 4 });
        const second = controller.socialAct({ kind: "flirt", botId: 4 })!;
        expect(second.tone).toBe("creepy");
        expect(controller.isCreepTo(0, 4)).toBe(false); // once: they'll get over it
        // a week later still counts as too soon
        (controller.state.gameState as { phase: number }).phase += 1;
        const third = controller.socialAct({ kind: "flirt", botId: 4 })!;
        expect(third.tone).toBe("creepy");
        expect(third.text).toContain("you're a creep now");
        expect(controller.isCreepTo(0, 4)).toBe(true);
        expect(controller.player(4).relationships[0]).toBeLessThanOrEqual(-0.8);
        // and nothing changes that
        controller.socialAct({ kind: "chat", botId: 4 });
        controller.socialAct({ kind: "final2", botId: 4 });
        expect(controller.player(4).relationships[0]).toBeLessThanOrEqual(-0.8);
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        const face = Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").startsWith("HG4"))!;
        expect(face.textContent).toContain("🚩");
    });

    it("talking takes one action per houseguest: then the conversation goes on for free", () => {
        const controller = controllerAtSocial();
        controller.state.actionsLeft = 1;
        expect(controller.talkToBot(4, "hey, how are you?")).not.toBeNull();
        expect(controller.state.actionsLeft).toBe(0);
        expect(controller.talkToBot(4, "who are you targeting?")).not.toBeNull(); // still talking
        expect(controller.state.actionsLeft).toBe(0);
        expect(controller.talkToBot(5, "hi")).toBeNull(); // out of actions: no new conversations
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("finish conversations you've started");
    });

    it("alliance time: shows allies' picks, suggests a target, renames, and backstabs", () => {
        const controller = controllerAtSocial();
        // right after the HoH comp: the alliance the new HoH is in meets about nominations
        controller.state.step = "AllianceHoh" as any;
        controller.state.week.hohId = 1;
        const c = mount(<AllianceScreen controller={controller} blockName="Before nominations" />);
        expect(c.textContent).toContain("The Vault");
        expect(c.textContent).toContain("HG1 won Head of House and wants your alliance's help");
        expect(c.textContent).toMatch(/HG1 (wants to go after|has no one in mind)/);
        // pick a target and suggest it
        const outsider = Array.from(c.querySelectorAll("button")).find((b) => b.textContent === "HG5")!;
        act(() => outsider.click());
        click(c, "Suggest HG5");
        expect(controller.state.book.alliances.find((a) => a.name === "The Vault")!.met).toBe(true);
        // rename
        click(c, "✏️");
        const input = c.querySelector(".bbb-alliance-head input") as HTMLInputElement;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setter.call(input, "The Bank");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        click(c, "Save");
        expect(controller.alliancesOf(0)[0].name).toBe("The Bank");
        // backstab: leak to HG6
        click(c, "Backstab");
        act(() => Array.from(c.querySelectorAll("button")).find((b) => b.textContent === "HG6")!.click());
        click(c, "Leak to HG6");
        expect(c.textContent).toMatch(/You told HG6 all about The Bank/);
        click(c, "Done");
    });

    // A controller with the HoH room open: `hohId` won HoH in a 7-player game where HG0 is the player.
    function controllerInHohRoom(hohId: number): PlayerModeController {
        const controller = controllerAtSocial();
        controller.state.week.hohId = hohId;
        const gs = new MutableGameState(controller.gameState);
        controller.state.week.room = openHohRoom(gs, controller.state.book, hohId, [0], []);
        controller.state.gameState = new GameState(gs);
        return controller;
    }

    it("HoH room: the HoH hears visitors one by one and makes promises", () => {
        const controller = controllerInHohRoom(0);
        const room = controller.room!;
        room.visitors = [
            { kind: "plea", fromId: 3 },
            { kind: "deal", fromId: 4 },
            { kind: "target", fromId: 5, targetId: 6 },
            { kind: "chat", fromId: 1 },
        ];
        const c = mount(<HohRoomScreen controller={controller} actorId={0} />);
        expect(c.textContent).toContain("Visitor 1 of 4");
        click(c, "You're safe");
        expect(room.promised).toEqual([3]);
        expect(c.textContent).toContain("Visitor 2 of 4");
        click(c, "No deal");
        expect(controller.deals.length).toBe(0);
        click(c, "HG6 is going up");
        expect(room.targets).toEqual([{ fromId: 5, targetId: 6 }]);
        click(c, "Thanks for coming up");
        expect(c.textContent).toContain("You owe safety to: HG3");
        expect(c.textContent).toContain("Didn't come up: HG2, HG6");
        click(c, "Nomination Ceremony");
        expect(room.done).toBe(true);
    });

    it("HoH room: a player goes up to pitch a nominee, or stays downstairs", () => {
        const controller = controllerInHohRoom(2);
        const c = mount(<HohVisitScreen controller={controller} actorId={0} />);
        expect(c.textContent).toContain("HG2 is Head of House");
        click(c, "Pitch a nominee");
        act(() => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").startsWith("HG5"))!.click());
        expect(c.textContent).toContain("Why should HG2 nominate HG5?");
        click(c, "Comp threat");
        expect(controller.room!.asked).toEqual([0]);
        expect(c.textContent).toMatch(/HG5/);
        expect(c.textContent).toMatch(/heading up to the HoH room|Nobody else was seen/);

        const stay = controllerInHohRoom(2);
        const c2 = mount(<HohVisitScreen controller={stay} actorId={0} />);
        click(c2, "Stay downstairs");
        expect(c2.textContent).toContain("You stayed downstairs");
        expect(stay.room!.promised).toEqual([]);
    });

    it("speech: pick a tone, pick who it's aimed at, and see how it landed", () => {
        const controller = controllerAtSocial();
        const hgs = [1, 2].map((id) => controller.player(id));
        const given: [string, number[]][] = [];
        let done = false;
        const c = mount(
            <SpeechPrompt
                title="Nomination Speech"
                text="Pick a tone."
                actor={controller.player(0)}
                tones={[
                    { id: "gracious", label: "Gracious", blurb: "Nothing personal." },
                    { id: "pawn", label: "Pawn talk", blurb: "Not the target.", pick: { text: "Who?", options: hgs, max: 2 } },
                ]}
                deliver={(tone, ids) => {
                    given.push([tone, ids]);
                    return ["“You are not my target.”", "HG1 believes you."];
                }}
                next={() => (done = true)}
            />
        );
        click(c, "Pawn talk");
        act(() => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").startsWith("HG1"))!.click());
        click(c, "Give the speech");
        expect(given).toEqual([["pawn", [1]]]);
        expect(c.textContent).toContain("HG1 believes you.");
        click(c, "Continue");
        expect(done).toBe(true);
    });

    it("tiebreaker: shows the box, takes a guess, and shows who was closest", () => {
        const controller = controllerAtSocial();
        const tied = [0, 1].map((id) => controller.player(id));
        const question = makeTiebreaker(9);
        let guess = -1;
        const c = mount(
            <TiebreakPlay title="HoH Competition" player={tied[0]} tied={tied} question={question} moreToPlay={false} onGuess={(g) => (guess = g)} />
        );
        expect(c.textContent).toContain("It's a tie between HG0, HG1");
        click(c, "I'm ready");
        expect(c.querySelectorAll(".bbb-tiebreak-box span").length).toBe(question.answer);
        const r = mount(
            <TiebreakResults
                title="HoH Competition"
                question={question}
                tied={tied}
                guesses={[
                    { id: 0, guess: question.answer + 2 },
                    { id: 1, guess: question.answer - 20 },
                ]}
                winnerId={0}
                humanIds={[0]}
                onDone={() => undefined}
            />
        );
        expect(r.textContent).toContain(`There were ${question.answer}`);
        expect(r.textContent).toContain("off by 20");
        expect(guess).toBe(-1);
    });

    it("memory duel: replays the rival's turn, then lets the player turn over one card at a time", () => {
        jest.useFakeTimers();
        try {
            const controller = controllerAtSocial();
            const players = [0, 1].map((id) => controller.player(id));
            const deck = duelDeck(4);
            const twin = deck.indexOf(deck[0], 1);
            const miss = deck.findIndex((f, i) => i > 0 && f !== deck[0]);
            const flipped: number[] = [];
            const c = mount(
                <MemoryDuelBoard
                    title="HoH Competition"
                    note="Duel 1 of 3"
                    players={players}
                    actorId={0}
                    deck={deck}
                    matched={{ 0: 1, [twin]: 1 }}
                    open={[]}
                    scores={{ 0: 0, 1: 1 }}
                    recent={[{ by: 1, cards: [0, twin] }, { by: 1, cards: [miss, miss + 1 === twin ? miss + 2 : miss + 1] }]}
                    onFlip={(card) => flipped.push(card)}
                />
            );
            // the rival's pair, face up, and nothing to click until the replay is over
            expect(c.textContent).toContain(`${players[1].name} turned over ${deck[0]} and ${deck[0]}: a pair!`);
            const cards = () => Array.from(c.querySelectorAll(".bbb-duel-card")) as HTMLButtonElement[];
            expect(cards().every((b) => b.disabled)).toBe(true);
            act(() => {
                jest.advanceTimersByTime(1300);
            });
            expect(c.textContent).toContain("no match");
            click(c, "Skip ahead");
            expect(c.textContent).toContain(`${players[0].name}, your turn`);
            // the pair stays face up; the rest can be turned over, once
            expect(cards()[0].disabled).toBe(true);
            act(() => cards()[miss].click());
            act(() => cards()[miss].click());
            expect(flipped).toEqual([miss]);
        } finally {
            jest.useRealTimers();
        }
    });

    it("hide the veto tiebreaker: hide a card, then the search knocks out whoever's found first", () => {
        const controller = controllerAtSocial();
        const tied = [0, 1].map((id) => controller.player(id));
        const spots = tiebreakHouse(9);
        let hid = -1;
        const c = mount(<HideTiebreakPlay title="HoH Competition" player={tied[0]} tied={tied} spots={spots} moreToPlay={true} onHide={(s) => (hid = s)} />);
        expect(c.textContent).toContain("It's a tie between HG0, HG1");
        expect(c.textContent).toContain("Keep your spot a secret");
        expect((Array.from(c.querySelectorAll("button")).find((b) => b.textContent!.includes("Hide it here")) as HTMLButtonElement).disabled).toBe(true);
        act(() => (c.querySelectorAll(".bbb-spot")[3] as HTMLButtonElement).click());
        click(c, "Hide it here");
        expect(hid).toBe(3);
        // the search: HG1's card is found first, so HG0 wins
        const at = (n: number) => spots.findIndex((s) => s.searchedAt === n);
        let done = false;
        const r = mount(
            <HideTiebreakResults
                title="HoH Competition"
                spots={spots}
                tied={tied}
                hides={[{ id: 0, spot: at(8) }, { id: 1, spot: at(4) }]}
                winnerId={0}
                humanIds={[0]}
                onDone={() => (done = true)}
            />
        );
        expect(r.textContent).toContain("still hidden");
        click(r, "Skip to the end");
        expect(r.textContent).toContain("🏆 Winner");
        expect(r.textContent).toContain("HG0 (you!)");
        expect(r.textContent).toContain(`found ${spots[at(4)].name.toLowerCase()}`);
        click(r, "Continue");
        expect(done).toBe(true);
    });

    it("campaign time: a nominee can make a vote deal, count votes, and see their promises", () => {
        const controller = controllerAtSocial();
        controller.state.step = "SocialCampaign" as any;
        controller.state.week.hohId = 1;
        controller.state.week.nomineeIds = [0, 2];
        controller.state.actionsLeft = 3;
        const c = mount(<SocialScreen controller={controller} blockName="Campaign time" />);
        expect(c.textContent).toContain("Your vote count");
        expect(c.textContent).toContain("Your word");
        controller.state.approachKey[0] = `${controller.gameState.phase}:SocialCampaign`; // their social time has started
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"))[0].click());
        click(c, "Who are you voting for?");
        expect(c.textContent).toMatch(/Who are you voting for\?.*HG[02]/); // in HG4's own words
        expect(controller.state.actionsLeft).toBe(2); // talking takes an action
        click(c, "Vote deal");
        expect(controller.state.actionsLeft).toBe(2); // ...and the conversation covers the deal
        click(c, "Back");
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        click(c, "Under the bus");
        expect(c.textContent).toContain("Why should HG5 go after HG2?");
    });

    it("you only see what you've picked up: no read until you talk to someone, and bots can fake it", () => {
        const controller = controllerAtSocial();
        controller.state.personalities = { 4: "mastermind", 5: "loyalSoldier" };
        controller.state.reads = {};
        controller.state.approaches[0] = [];
        const me = controller.player(0);
        [4, 5].forEach((id) => {
            me.relationships[id] = -0.8;
            controller.player(id).relationships[0] = -0.8;
        });
        controller.state.showmances = [{ a: 5, b: 6, week: 1 }];
        const caption = (c: HTMLElement, name: string) =>
            Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").startsWith(name))!.textContent!;
        const before = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(caption(before, "HG4")).toContain("No read");
        expect(caption(before, "HG5")).toContain("No read");
        expect(before.textContent).not.toMatch(/Enemy|Wary|Friendly|Close friend/);
        expect(caption(before, "HG6")).toContain("💕"); // showmances are public knowledge
        // after talking to them, you have a read: the mastermind smiles, the loyal soldier doesn't hide it
        controller.noteRead(0, 4);
        controller.noteRead(0, 5);
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(caption(c, "HG4")).not.toContain("Enemy");
        expect(caption(c, "HG5")).toContain("Enemy");
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        expect(c.textContent).toContain("in a showmance with HG6");
        expect(c.textContent).toContain("Last time you two talked (Day 1)");
        expect(c.textContent).toContain("don't know yet how much HG5 believes");
        // dealing with them tells you how much they believe you
        click(c, "Flirt");
        expect(controller.state.actionsLeft).toBe(2);
        expect(c.textContent).toMatch(/As of Day 1, HG5 (takes you at your word|mostly believes you|has doubts about you|doesn't believe a word you say)/);
    });

    it("drama: pick a side in a fight, snoop, start a rumour, and see your threat level", () => {
        const controller = controllerAtSocial();
        controller.state.approaches[0] = [{ kind: "sides", fromId: 3, otherId: 4 }];
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("Threat level");
        click(c, "Talk to HG3");
        expect(c.textContent).toContain("Whose side are you on?");
        click(c, "Stay out of it");
        expect(controller.approachesFor(0).length).toBe(0);
        click(c, "Back");
        click(c, "Snoop around the house");
        expect(controller.state.actionsLeft).toBe(2);
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        click(c, "Start a rumour");
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG6"))[0].click());
        click(c, "coming after you");
        expect(controller.state.actionsLeft).toBe(1);
        expect(c.textContent).toContain("HG6 is coming after you. I heard it myself.");
        expect(c.textContent).toContain("House meeting (1 more action)"); // two in all: talking, and one more
        click(c, "Confront");
        expect(controller.state.actionsLeft).toBe(1);
        expect(c.textContent).toContain("had it out");
    });

    it("finale night: votes are read one at a time until someone clinches", () => {
        const controller = controllerAtSocial();
        const [a, b] = [controller.player(1), controller.player(2)];
        const jurors = [3, 4, 5, 6, 0].map((id) => controller.player(id));
        let done = false;
        const c = mount(
            <JuryReveal
                finalists={[a, b]}
                jurors={jurors}
                votes={[
                    { jurorId: 3, finalistId: 1 },
                    { jurorId: 4, finalistId: 2 },
                    { jurorId: 5, finalistId: 1 },
                    { jurorId: 6, finalistId: 1 },
                    { jurorId: 0, finalistId: 2 },
                ]}
                onDone={() => (done = true)}
            />
        );
        expect(c.textContent).toContain("3 votes wins");
        click(c, "Read the first vote");
        expect(c.textContent).toContain("HG3's key");
        click(c, "Read the next vote");
        click(c, "Read the next vote");
        expect(c.textContent).not.toContain("The winner of The Houseguests");
        click(c, "Read the next vote");
        expect(c.textContent).toContain("The winner of The Houseguests");
        expect(c.textContent).toContain("The remaining 1 votes won't be read");
        click(c, "Continue");
        expect(done).toBe(true);
    });

    it("memory wall: crown on the HoH, necklace on the veto holder, keys on the nominees, grey faces for the evicted", () => {
        const controller = controllerAtSocial();
        const gs = new MutableGameState(controller.gameState);
        gs.houseguests.find((hg) => hg.id === 6)!.isEvicted = true;
        controller.state.gameState = new GameState(gs);
        controller.state.week.hohId = 1;
        controller.state.week.povId = 2;
        controller.state.week.nomineeIds = [2, 3];
        const c = mount(<HouseWall controller={controller} />);
        const tile = (name: string) => Array.from(c.querySelectorAll(".bbb-mwall-tile")).find((t) => t.textContent!.includes(name))!;
        expect(tile("HG1").querySelector(".is-crown")).not.toBeNull();
        expect(tile("HG2").querySelector(".is-necklace")).not.toBeNull();
        expect(tile("HG2").querySelector(".is-key")).not.toBeNull();
        expect(tile("HG3").querySelector(".is-key")).not.toBeNull();
        expect(tile("HG4").querySelector(".bbb-mwall-badge")).toBeNull();
        expect(tile("HG6").className).toContain("is-out");
        expect(tile("HG0").className).toContain("is-player");
        // and it sits on top of the player mode screen, collapsible
        const screen = mount(<PlayerModeScreen controller={controller} />);
        expect(screen.querySelector(".bbb-mwall")).not.toBeNull();
        click(screen, "House wall");
        expect(screen.querySelector(".bbb-mwall")).toBeNull();
        click(screen, "House wall");
        expect(screen.querySelector(".bbb-mwall")).not.toBeNull();
    });

    it("watching a comp: results come in from last place, or skip straight to them", () => {
        const controller = controllerAtSocial();
        const bots = [1, 2, 3].map((id) => controller.player(id));
        let winner = -1;
        const c = mount(
            <CompResults
                title="Veto Competition"
                comp={FactOrFictionComp}
                participants={bots}
                humanIds={[0]}
                results={[
                    { id: 1, score: 300 },
                    { id: 2, score: 900 },
                    { id: 3, score: 500 },
                ]}
                spectating={true}
                onDone={(id) => (winner = id)}
            />
        );
        expect(c.textContent).toContain("watching from the sidelines");
        expect(c.textContent).toContain("3 still in it");
        click(c, "Skip to the results");
        expect(c.textContent).toContain("Winner");
        click(c, "Continue");
        expect(winner).toBe(2);
    });

    it("question comps pause after each answer and show what everyone else answered", () => {
        const controller = controllerAtSocial();
        const gs = controller.gameState;
        const [me, bot1, bot2] = [0, 1, 2].map((id) => controller.player(id));
        const paused: boolean[] = [];
        const history = [3, 4, 5, 6].map((id, i) => ({ week: i + 1, hohId: 1, nomineeIds: [2, id], povId: 0, evictedIds: [id] }));
        [3, 4, 5, 6].forEach((id) => (getById(gs, id).isEvicted = true)); // Fact or Fiction asks about former houseguests
        const Component = FactOrFictionComp.Component;
        const c = mount(
            <Component
                participants={[me, bot1, bot2]}
                human={me}
                gameState={gs}
                history={history}
                rand={seededRand(5)}
                opponents={[
                    { hg: bot1, score: 900, answers: Array(10).fill(true) },
                    { hg: bot2, score: 100, answers: Array(10).fill(false) },
                ]}
                report={() => undefined}
                finish={() => undefined}
                pauseClock={(p: boolean) => paused.push(p)}
                recordAnswer={() => undefined}
            />
        );
        expect(c.textContent).toContain("Fact 1 of 10");
        click(c, "FACT");
        expect(c.textContent).toMatch(/Right!|Wrong!/);
        expect(c.textContent).toContain("The answer:");
        const rows = Array.from(c.querySelectorAll(".bbb-answer")).map((r) => r.textContent);
        expect(rows.find((r) => r!.startsWith("HG1"))).toContain("✅");
        expect(rows.find((r) => r!.startsWith("HG2"))).toContain("❌");
        expect(paused).toEqual([true]);
        click(c, "Next question");
        expect(paused).toEqual([true, false]);
        expect(c.textContent).toContain("Fact 2 of 10");
    });

    it("the quiz clock stops while the answers are being revealed", () => {
        let clock: ReturnType<typeof useQuizClock> | null = null;
        function Probe() {
            clock = useQuizClock();
            return null;
        }
        mount(<Probe />);
        const realNow = performance.now;
        let t = 1000;
        (performance as any).now = () => t;
        try {
            const start = clock!.now();
            t += 500;
            clock!.pause();
            t += 10000; // a long pause
            clock!.resume();
            t += 500;
            expect(clock!.now() - start).toBe(1000);
        } finally {
            (performance as any).now = realNow;
        }
    });

    it("find the key: the boxes shuffle, you pick one, and it goes on until you miss (it used to get stuck)", async () => {
        jest.useFakeTimers();
        try {
            const controller = controllerAtSocial();
            const me = controller.player(0);
            const Component = FindTheKeyComp.Component;
            const finished: number[] = [];
            const c = mount(
                <Component
                    participants={[me]}
                    human={me}
                    gameState={controller.gameState}
                    history={[]}
                    rand={seededRand(3)}
                    opponents={[]}
                    report={() => undefined}
                    finish={(s: number) => finished.push(s)}
                />
            );
            const wait = async (ms: number) => {
                for (let i = 0; i < ms / 100; i++) {
                    // eslint-disable-next-line no-loop-func
                    await (act as any)(async () => {
                        jest.advanceTimersByTime(100);
                        await Promise.resolve();
                    });
                }
            };
            // mid-swap: the two moving boxes take opposite paths (one over, one under), never through each other
            await wait(1400);
            const lifts = Array.from(c.querySelectorAll("button[aria-label^='Box']")).map((b) => (b as HTMLElement).style.transform);
            expect(lifts.some((t) => t.includes("translateY(-62px)"))).toBe(true);
            expect(lifts.some((t) => t.includes("translateY(62px)"))).toBe(true);
            // one wrong box and you're out; get through every round and it's a speed score
            for (let round = 1; round <= KNOCKOUT_ROUNDS; round++) {
                for (let t = 0; t < 400 && !c.textContent!.includes("Which box has the key?"); t++) await wait(100);
                expect(c.textContent).toContain(`Round ${round} of ${KNOCKOUT_ROUNDS}`);
                const box = c.querySelector("button[aria-label^='Box']") as HTMLButtonElement;
                act(() => box.click());
                expect(c.textContent).toMatch(/You found it!|Wrong box!/);
                await wait(1100);
                if (finished.length) break;
            }
            expect(finished.length).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it("a player finalist can answer every jury question, not just the first", () => {
        const controller = controllerAtSocial();
        const container = mount(<PlayerModeScreen controller={controller} />);
        const answered: string[] = [];
        const ask = (i: number) =>
            (controller as any).show({
                kind: "juryQuestion",
                actorId: 0,
                jurorId: i + 1,
                question: { jurorId: i + 1, finalistId: 0, secondhand: false, question: `Question ${i + 1}?` },
                onAnswer: (a: string) => {
                    answered.push(`${i + 1}:${a}`);
                    if (i < 2) ask(i + 1);
                },
            });
        act(() => ask(0));
        for (let i = 0; i < 3; i++) {
            expect(container.textContent).toContain(`Question ${i + 1}?`);
            const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent!.includes("Talk up"))!;
            expect(button.disabled).toBe(false);
            act(() => button.click());
        }
        expect(answered).toEqual(["1:own", "2:own", "3:own"]);
    });

    it("every scene in a season can be continued with its own Continue button (the finale used to get stuck)", () => {
        for (const humanId of [0, 3]) {
            const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `HG${i}`, imageURL: "", social: 5, comp: 5 }));
            const controller = new PlayerModeController(newPlayerSave(new GameState({ players: cast, jury: 3 }), [humanId]));
            controller.state.seed = 900 + humanId;
            let prompt: Prompt | null = null;
            controller.prompt$.subscribe((p) => (prompt = p));
            controller.start();
            const container = mount(<PlayerModeScreen controller={controller} />);
            const titles = new Set<string>();
            for (let guard = 0; guard < 3000; guard++) {
                const p = prompt as unknown as Prompt;
                if (p.kind === "gameOver") break;
                if (p.kind === "scene") {
                    titles.add(p.scene.title);
                    // the nominations are revealed one at a time
                    for (let r = 0; r < 3; r++) {
                        const reveal = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Reveal the"));
                        if (reveal) act(() => reveal.click());
                    }
                    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Continue");
                    if (!button) throw new Error(`The "${p.scene.title}" scene has no Continue button`);
                    act(() => button.click());
                    if ((prompt as unknown as Prompt) === p) throw new Error(`Continue did nothing on "${p.scene.title}"`);
                    continue;
                }
                act(() => autoplay(controller, p, humanId === 0));
            }
            expect((prompt as unknown as Prompt).kind).toBe("gameOver");
            if (humanId === 0) expect(titles.has("Final Two")).toBe(true);
            expect(titles.has("Jury Roundtable")).toBe(true);
        }
    });

    it("secret powers: only the holder sees their power card; sealed results hide the winner; the live feed ticks", () => {
        const { LiveFeed } = require("./liveFeed");
        const { PowerCard } = require("./dealsPanel");
        const controller = controllerAtSocial();
        controller.state.powers = { enabled: ["immunity"], slots: [{ id: "immunity", week: 1, holderId: 0 }] };
        expect(mount(<PowerCard controller={controller} actorId={0} />).textContent).toContain("Hidden Immunity");
        expect(mount(<PowerCard controller={controller} actorId={1} />).textContent).toBe("");
        // on the social screen too
        expect(mount(<SocialScreen controller={controller} blockName="Morning in the house" />).textContent).toContain("Your secret power");

        const bots = [1, 2, 3].map((id) => controller.player(id));
        const sealed = mount(
            <CompResults
                title="Head of House Competition"
                comp={FactOrFictionComp}
                participants={bots}
                humanIds={[0]}
                results={[
                    { id: 1, score: 300 },
                    { id: 2, score: 900 },
                    { id: 3, score: 500 },
                ]}
                sealed={true}
                onDone={() => undefined}
            />
        );
        expect(sealed.textContent).toContain("Results sealed");
        expect(sealed.textContent).not.toContain("HG2");

        controller.state.feed = [
            { day: 3, text: "HG4 is cooking dinner for the whole house." },
            { day: 3, text: "HG5 and HG6 are whispering by the pool." },
        ];
        const feed = mount(<LiveFeed controller={controller} />);
        expect(feed.textContent).toContain("LIVE");
        expect(feed.textContent).toMatch(/HG4 is cooking|HG5 and HG6/);
    });

    it("the main screen shows the day of the season", () => {
        const controller = controllerAtSocial();
        const c = mount(<PlayerModeScreen controller={controller} />);
        expect(c.textContent).toContain("📅 Day 1");
    });

    it("avatar builder: changes the name and steps through features, and saves a cartoon", () => {
        let saved: { name: string; imageURL: string } | null = null;
        const start = cartoonURL(randomLook(seededRand(3)));
        const c = mount(
            <FaceEditor original={{ name: "Pip", imageURL: start }} current={{ name: "Pip", imageURL: start }} onSave={(look) => (saved = look)} onCancel={() => undefined} />
        );
        const input = c.querySelector("input[type=text]") as HTMLInputElement;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setter.call(input, "Juno");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        const before = lookFromURL(start)!;
        const next = c.querySelector('[aria-label="Next Glasses"]') as HTMLButtonElement;
        act(() => next.click());
        click(c, "Save");
        expect(saved!.name).toBe("Juno");
        const after = lookFromURL(saved!.imageURL)!;
        expect(after.glasses).toBe((before.glasses + 1) % 6);
        expect({ ...after, glasses: before.glasses }).toEqual(before);
    });
});

describe("house rules editor", () => {
    const { RulesEditor, DifficultyPicker, rulesSummary } = require("./rulesEditor");
    const { DEFAULT_RULES, withDefaults } = require("../rules");

    it("lists all four difficulties, and opens the house rules to change them", () => {
        let picked = "normal";
        const d = mount(<DifficultyPicker value="normal" onChange={(x: string) => (picked = x)} />);
        const buttons = Array.from(d.querySelectorAll("button")).map((b) => b.textContent);
        expect(buttons).toEqual(["Casual", "Normal", "Hard", "Cutthroat"]);
        act(() => (d.querySelectorAll("button")[3] as HTMLButtonElement).click());
        expect(picked).toBe("cutthroat");

        let rules = DEFAULT_RULES;
        let jury = 3;
        const c = mount(
            <RulesEditor rules={rules} onChange={(r: any) => (rules = r)} jury={{ value: 3, min: 1, max: 7, onChange: (n: number) => (jury = n) }} />
        );
        expect(c.textContent).toContain("(the usual)");
        act(() => (c.querySelector(".bbb-rules-toggle") as HTMLButtonElement).click());
        const lastChance = Array.from(c.querySelectorAll("label")).find((l) => l.textContent!.includes("Big weeks"))!.querySelector("input")!;
        act(() => lastChance.click());
        expect(rules.lastChance).toBe(false);
        const plus = Array.from(c.querySelectorAll(".bbb-stepper")).find((s) => s.textContent!.includes("Jury"))!.querySelectorAll("button")[1] as HTMLButtonElement;
        act(() => plus.click());
        expect(jury).toBe(4); // the setup screen turns this into the next odd size
        expect(rulesSummary(withDefaults({ lastChance: false, actions: 5 }))).toEqual(["always two nominees", "5 actions per block"]);
    });
});

describe("sharing a cast on the casting screen", () => {
    it("shares the cast as a link, and loads a pasted code in its place", () => {
        const { CastingScreen } = require("../../components/castingScreen/castingScreen");
        const { encodeCast } = require("../../cartoon/castCode");
        const { cartoonCast } = require("../../cartoon/cartoon");
        const c = mount(<CastingScreen cast={cartoonCast(5)} />);
        const button = (label: string) => Array.from(c.querySelectorAll("button")).find((b) => b.textContent!.includes(label)) as HTMLButtonElement;
        act(() => button("Share this cast").click());
        expect((c.querySelector('input[aria-label="Cast link"]') as HTMLInputElement).value).toContain("?cast=C1");

        const friend = cartoonCast(7);
        friend[0].name = "From A Friend";
        act(() => button("Load a cast").click());
        const input = c.querySelector('input[aria-label="Cast code or link"]') as HTMLInputElement;
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
        act(() => {
            setValue.call(input, encodeCast(friend).code);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => (Array.from(c.querySelectorAll("button")).find((b) => b.textContent === "Load") as HTMLButtonElement).click());
        expect(c.textContent).toContain("From A Friend");
    });
});

describe("guided seasons", () => {
    it("the coach explains each part of the week once, in order, and can be turned off", () => {
        const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `HG${i}`, imageURL: "", social: 5, comp: 5 }));
        const controller = new PlayerModeController(newPlayerSave(new GameState({ players: cast, jury: 3 }), [0], undefined, false, { guided: true }));
        controller.state.seed = 901;
        let prompt: Prompt | null = null;
        controller.prompt$.subscribe((p) => (prompt = p));
        controller.start();
        const container = mount(<PlayerModeScreen controller={controller} />);
        const shown: string[] = [];
        for (let guard = 0; guard < 3000; guard++) {
            const p = prompt as unknown as Prompt;
            if (p.kind === "gameOver") break;
            const tip = container.querySelector(".bbb-coach");
            if (tip) {
                shown.push(tip.querySelector("b")!.textContent || "");
                click(tip as HTMLElement, "Got it");
                expect(container.querySelector(".bbb-coach")).toBeNull();
            }
            if (p.kind === "scene") act(() => controller.continue());
            else act(() => autoplay(controller, p, true));
        }
        expect((prompt as unknown as Prompt).kind).toBe("gameOver");
        expect(shown[0]).toBe("Welcome to the house!");
        expect(new Set(shown).size).toBe(shown.length); // never twice
        ["Social time", "Head of House", "Nominations", "The Veto", "Eviction night", "Facing the jury"].forEach((t) => expect(shown).toContain(t));
        expect(controller.state.tipsSeen!.length).toBe(shown.length);

        // turned off: no more tips, and it stays off
        const quiet = new PlayerModeController(newPlayerSave(new GameState({ players: cast, jury: 3 }), [0], undefined, false, { guided: true }));
        quiet.start();
        const c2 = mount(<PlayerModeScreen controller={quiet} />);
        click(c2.querySelector(".bbb-coach") as HTMLElement, "Turn off tips");
        expect(quiet.state.guided).toBe(false);
        act(() => quiet.continue());
        expect(c2.querySelector(".bbb-coach")).toBeNull();
    });

    it("no coach in a normal season", () => {
        const cast: PlayerProfile[] = Array.from({ length: 6 }, (_, i) => ({ name: `HG${i}`, imageURL: "", social: 5, comp: 5 }));
        const controller = new PlayerModeController(newPlayerSave(new GameState({ players: cast, jury: 3 }), [0]));
        controller.start();
        const c = mount(<PlayerModeScreen controller={controller} />);
        expect(c.querySelector(".bbb-coach")).toBeNull();
    });
});
