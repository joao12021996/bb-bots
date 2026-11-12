import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { GameState, getById, MutableGameState, PlayerProfile } from "../../model";
import { newPlayerSave, PlayerModeController, Prompt } from "../playerModeController";
import { createAlliance } from "../social/alliances";
import { SocialScreen } from "./socialScreen";
import { AllianceScreen } from "./allianceScreen";
import { FaceEditor } from "./faceEditor";
import { HohRoomScreen, HohVisitScreen } from "./hohRoomScreen";
import { openHohRoom } from "../social/hohRoom";
import { SpeechPrompt } from "./speechPrompt";
import { makeTiebreaker, TiebreakPlay, TiebreakResults } from "../comps/tiebreaker";
import { HideTiebreakPlay, HideTiebreakResults, tiebreakHouse } from "../comps/hideTiebreak";
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

describe("player mode screens", () => {
    it("social time: answers approaches, chats, and proposes an alliance", () => {
        const controller = controllerAtSocial();
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("came to talk to you");
        click(c, "Accept");
        expect(controller.alliancesOf(0).some((a) => a.name === "Night Owls")).toBe(true);
        click(c, "I'm in");
        click(c, "OK");
        expect(controller.approachesFor(0).length).toBe(0);
        // talk to HG4: chat, then open the alliance form
        const faces = Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"));
        act(() => faces[0].click());
        click(c, "Chat");
        expect(controller.state.actionsLeft).toBe(2);
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"))[0].click());
        click(c, "Alliance");
        expect(c.textContent).toContain("Invite to The Vault");
        click(c, "Start it");
        expect(controller.state.actionsLeft).toBe(1);
        // pitch HG5 to HG4, with a reason
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"))[0].click());
        click(c, "Pitch a target");
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        expect(c.textContent).toContain("Why should HG4 go after HG5?");
        click(c, "Great social game");
        expect(controller.state.actionsLeft).toBe(0);
        click(c, "alliance time");
        expect(controller.state.socialStage).toBe("alliance");
    });

    it("alliance time: shows allies' picks, suggests a target, renames, and backstabs", () => {
        const controller = controllerAtSocial();
        controller.endSocial();
        const c = mount(<AllianceScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("The Vault");
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
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG4"))[0].click());
        expect(c.textContent).toContain("Campaign for HG4's vote");
        click(c, "Ask about the vote");
        expect(c.textContent).toMatch(/HG4: ".*HG[02]/); // in HG4's own words
        expect(controller.state.actionsLeft).toBe(3); // asking is free
        click(c, "Vote deal");
        expect(controller.state.actionsLeft).toBe(2);
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
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        expect(c.textContent).toMatch(/As of Day 1, HG5 (takes you at your word|mostly believes you|has doubts about you|doesn't believe a word you say)/);
    });

    it("drama: pick a side in a fight, snoop, start a rumour, and see your threat level", () => {
        const controller = controllerAtSocial();
        controller.state.approaches[0] = [{ kind: "sides", fromId: 3, otherId: 4 }];
        const c = mount(<SocialScreen controller={controller} blockName="Morning in the house" />);
        expect(c.textContent).toContain("blew up at each other");
        expect(c.textContent).toContain("Threat level");
        click(c, "Stay out of it");
        expect(controller.approachesFor(0).length).toBe(0);
        click(c, "Snoop around the house");
        expect(controller.state.actionsLeft).toBe(2);
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        click(c, "Start a rumour");
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG6"))[0].click());
        click(c, "coming after you");
        expect(controller.state.actionsLeft).toBe(1);
        act(() => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").startsWith("HG5"))[0].click());
        expect(c.textContent).not.toContain("House meeting"); // needs two actions
        click(c, "Confront");
        expect(controller.state.actionsLeft).toBe(0);
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
        const { rankResults } = require("../comps/compRunner");
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
                    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Continue");
                    if (!button) throw new Error(`The "${p.scene.title}" scene has no Continue button`);
                    act(() => button.click());
                    if ((prompt as unknown as Prompt) === p) throw new Error(`Continue did nothing on "${p.scene.title}"`);
                    continue;
                }
                act(() => {
                    if (p.kind === "handoff") p.next();
                    else if (p.kind === "social") controller.endSocial();
                    else if (p.kind === "alliance") controller.endAlliance();
                    else if (p.kind === "compPlay") p.onScore(humanId === 0 ? 1e9 : -1e9);
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
                    else if (p.kind === "wineDrink") p.onDecide(false);
                    else if (p.kind === "ownMoves") p.onDone([]);
                    else if (p.kind === "juryQuestion") p.onAnswer("own");
                    else throw new Error(`unhandled ${(p as any).kind}`);
                });
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

    it("face editor: changes the name and picks an emoji face", () => {
        let saved: { name: string; imageURL: string } | null = null;
        const c = mount(
            <FaceEditor
                original={{ name: "Janelle", imageURL: "https://example.com/janelle.png" }}
                current={{ name: "Janelle", imageURL: "https://example.com/janelle.png" }}
                onSave={(look) => (saved = look)}
                onCancel={() => undefined}
            />
        );
        const options = c.querySelectorAll(".bbb-face-options button");
        expect(options.length).toBeGreaterThan(10);
        act(() => (options[3] as HTMLButtonElement).click());
        click(c, "Save");
        expect(saved).not.toBeNull();
        expect(saved!.imageURL.startsWith("data:image/svg+xml")).toBe(true);
    });
});
