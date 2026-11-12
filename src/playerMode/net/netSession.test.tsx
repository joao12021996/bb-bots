import { getById } from "../../model";
import { actorOf, newPlayerSave, PlayerModeController, Prompt, Step } from "../playerModeController";
import { answer, newGame } from "../testing";
import { NetSession, SessionOptions, stateHash } from "./netSession";
import { FakeHub } from "./room";
import { buildOnlineSeason, defaultSetup, houseOf } from "./lobby";
import { cast as testCast } from "../testing";

const opts: SessionOptions = { launch: (controller) => controller.start(), hostWaitMs: 50, hashDelayMs: 10 };

function prompt(s: NetSession): Prompt {
    return s.controller!.prompt$.value!;
}

// One round of moves, then deliver everything. Like the real screens, each device looks at its own prompts:
// players answer their own screens (all of them, at the same time), otherwise whoever the shared screen belongs to
// answers it. Moves reach the host and come back instantly, as the automatic player reads the season right after
// each move. Returns false once the season is over.
function step(hub: FakeHub, sessions: NetSession[]): boolean {
    const live = sessions.filter((s) => s.controller);
    const p = prompt(live[0]);
    if (p.kind === "gameOver") return false;
    hub.instant = true;
    try {
        let acted = false;
        for (let guard = 0; guard < 50; guard++) {
            const next = ownScreens(live)[0];
            if (!next) break;
            answer(next.session.controller!, next.prompt, "random", "random");
            acted = true;
        }
        if (!acted) {
            const mover = live.find((s) => s.mayActFor(actorOf(prompt(s))));
            if (!mover) throw new Error(`Nobody can answer ${p.kind} for ${actorOf(p)}`);
            answer(mover.controller!, prompt(mover), "random", "random");
        }
    } finally {
        hub.instant = false;
    }
    hub.flush();
    return true;
}

// players' own screens that a device may answer
function ownScreens(sessions: NetSession[]): { session: NetSession; owner: number; prompt: Prompt }[] {
    const found: { session: NetSession; owner: number; prompt: Prompt }[] = [];
    sessions.forEach((session) => {
        const own = session.controller!.personal$.value;
        Object.keys(own)
            .map(Number)
            .filter((owner) => session.mayActFor(owner))
            .forEach((owner) => found.push({ session, owner, prompt: own[owner] }));
    });
    return found;
}

// Plays on until at least `count` players have their own screens up at the same time.
function untilOwnScreens(hub: FakeHub, sessions: NetSession[], count: number): boolean {
    for (let guard = 0; guard < 5000; guard++) {
        const owners = new Set(ownScreens(sessions.filter((s) => s.controller)).map((o) => o.owner));
        if (owners.size >= count) return true;
        if (!step(hub, sessions)) return false;
    }
    return false;
}

// A few rounds of the host's sync check: a device that's off reloads, and if it's still off, everyone does.
function settle(hub: FakeHub, host: NetSession) {
    for (let i = 0; i < 3; i++) {
        host.sendHash();
        hub.flush();
    }
}

function expectInSync(sessions: NetSession[]) {
    const [first, ...rest] = sessions;
    const hash = stateHash(first.controller!.state);
    rest.forEach((s) => {
        expect(s.appliedInputs).toBe(first.appliedInputs);
        expect(prompt(s).kind).toBe(prompt(first).kind);
        expect(stateHash(s.controller!.state)).toBe(hash);
    });
}

function setup(n: number, humanIds: number[], seed: number) {
    const hub = new FakeHub();
    const save = newPlayerSave(newGame(n), humanIds);
    save.seed = seed;
    const host = NetSession.host(hub.join("h"), "TEST", save, opts);
    const clients = humanIds.slice(1).map((_, i) => NetSession.join(hub.join(`c${i}`), "TEST", opts));
    hub.flush();
    host.claim(humanIds[0]);
    clients.forEach((c, i) => c.claim(humanIds[i + 1]));
    hub.flush();
    host.start();
    hub.flush();
    return { hub, host, clients, all: [host, ...clients] };
}

describe("online play", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it.each([
        [8, [0, 3], 11],
        [10, [1, 4, 7], 23],
    ])("keeps every device's %i-person season identical, input by input (players %j)", (n, humanIds, seed) => {
        const { hub, host, all } = setup(n, humanIds, seed);
        all.forEach((s) => expect(s.localPlayerId).toBe(humanIds[all.indexOf(s)]));
        expectInSync(all);
        let guard = 0;
        while (guard++ < 5000 && step(hub, all)) {
            // hashing the whole season is slow-ish: check every few moves
            if (guard % 15 === 0) {
                expectInSync(all);
                host.sendHash();
                hub.flush();
            }
        }
        all.forEach((s) => expect(s.controller!.state.step).toBe(Step.GameOver));
        expectInSync(all);
        // nobody ever needed the season sent again
        all.forEach((s) => expect(s.resyncs).toBe(0));
    });

    it("lets players decide at the same time", () => {
        const { hub, host, all } = setup(10, [1, 4, 7], 23);
        expect(untilOwnScreens(hub, all, 2)).toBe(true);
        expect(prompt(host).kind).toBe("waiting");
        const screens = ownScreens(all);
        const before = host.appliedInputs;
        // everyone answers before any of it reaches anyone else
        screens.forEach(({ session, prompt: p }) => answer(session.controller!, p, "first", "random"));
        hub.flush();
        expect(host.appliedInputs).toBe(before + screens.length);
        all.forEach((s) => expect(Object.keys(s.controller!.personal$.value)).toEqual([]));
        settle(hub, host);
        expectInSync(all);
        all.forEach((s) => expect(s.resyncs).toBe(0));
    });

    it("ignores an answer to a screen that's already been answered", () => {
        const { hub, host, clients, all } = setup(10, [1, 4, 7], 23);
        expect(untilOwnScreens(hub, all, 2)).toBe(true);
        const mine = ownScreens(clients).find((o) => o.session !== host)!;
        const before = host.appliedInputs;
        // a double tap: both reach the host, which only takes the first
        answer(mine.session.controller!, mine.prompt, "first", "random");
        answer(mine.session.controller!, mine.prompt, "first", "random");
        hub.flush();
        expect(host.appliedInputs).toBe(before + 1);
        expect(mine.session.controller!.personal$.value[mine.owner]).toBeUndefined();
        settle(hub, host);
        expectInSync(all);
        all.forEach((s) => expect(s.resyncs).toBe(0));
    });

    it("keeps the answers already given when a player reloads mid-vote", () => {
        const { hub, host, clients, all } = setup(10, [1, 4, 7], 23);
        expect(untilOwnScreens(hub, all, 2)).toBe(true);
        const [first, second] = ownScreens(all);
        hub.instant = true;
        answer(first.session.controller!, first.prompt, "first", "random");
        hub.instant = false;
        hub.flush();
        // the other player's device reloads
        const leaving = second.session;
        expect(leaving).not.toBe(host);
        leaving.leave();
        hub.flush();
        const back = NetSession.join(hub.join("c9"), "TEST", opts, { playerId: second.owner, json: "{}" });
        hub.flush();
        const now = [host, ...clients.filter((c) => c !== leaving), back];
        // resuming from the last save can leave it a screen behind the host: the sync check sorts that out
        settle(hub, host);
        expectInSync(now);
        // then only they are asked: the answer already given still stands
        let answered = false;
        for (let guard = 0; guard < 50 && !answered; guard++) {
            const owners = ownScreens(now).map((o) => o.owner);
            expect(owners).not.toContain(first.owner);
            const theirs = ownScreens(now).find((o) => o.owner === second.owner);
            hub.instant = true;
            if (theirs) {
                answer(theirs.session.controller!, theirs.prompt, "first", "random");
                answered = true;
            } else {
                const mover = now.find((s) => s.mayActFor(actorOf(prompt(s))))!;
                answer(mover.controller!, prompt(mover), "first", "random");
            }
            hub.instant = false;
            hub.flush();
        }
        expect(answered).toBe(true);
        settle(hub, host);
        expectInSync(now);
        now.forEach((s) => expect(s.resyncs).toBeLessThanOrEqual(2));
    });

    it("plays comps at the same time, with everyone's score coming in live", () => {
        const { hub, host, all } = setup(10, [1, 4, 7], 23);
        let comps: ReturnType<typeof ownScreens> = [];
        for (let guard = 0; guard < 5000; guard++) {
            comps = ownScreens(all).filter((o) => o.prompt.kind === "compPlay");
            if (comps.length >= 2) break;
            expect(step(hub, all)).toBe(true);
        }
        expect(comps.length).toBeGreaterThanOrEqual(2);
        const [a, b] = comps;
        const pa = a.prompt as Extract<Prompt, { kind: "compPlay" }>;
        const pb = b.prompt as Extract<Prompt, { kind: "compPlay" }>;
        expect(pa.live!.humanIds).toContain(b.owner);
        // the bots are opponents up front; the other players come in live
        expect(pa.opponents.map((o) => o.hg.id)).not.toContain(b.owner);
        hub.instant = true;
        pa.onStart!();
        pa.onReport!(7);
        hub.instant = false;
        hub.flush();
        all.forEach((s) => expect(s.controller!.liveScores(pa.seed, [a.owner])).toEqual([{ id: a.owner, score: 7, answers: undefined, done: false }]));
        // b's screen re-reads them as they come in
        expect(b.session.controller!.liveScores(pb.seed, pb.live!.humanIds).find((l) => l.id === a.owner)!.score).toBe(7);
        hub.instant = true;
        pa.onScore(9);
        hub.instant = false;
        hub.flush();
        all.forEach((s) => expect(s.controller!.liveScores(pa.seed, [a.owner])[0]).toMatchObject({ score: 9, done: true }));
        // done: a's device shows the standings while the others play on
        const waiting = prompt(a.session);
        expect(waiting.kind).toBe("waiting");
        expect(waiting.kind === "waiting" && waiting.comp && waiting.comp.humanIds).toContain(b.owner);
        settle(hub, host);
        expectInSync(all);
        all.forEach((s) => expect(s.resyncs).toBe(0));
    });

    it("a player who reloads mid-comp keeps the score they had, everywhere", () => {
        const { hub, host, clients, all } = setup(10, [1, 4, 7], 23);
        let mine: ReturnType<typeof ownScreens>[number] | undefined;
        for (let guard = 0; guard < 5000 && !mine; guard++) {
            mine = ownScreens(clients).find((o) => o.prompt.kind === "compPlay" && o.session !== host && ownScreens(all).length >= 2);
            if (!mine) expect(step(hub, all)).toBe(true);
        }
        const play = mine!.prompt as Extract<Prompt, { kind: "compPlay" }>;
        hub.instant = true;
        play.onStart!();
        play.onReport!(5);
        hub.instant = false;
        hub.flush();
        const leaving = mine!.session;
        leaving.leave();
        hub.flush();
        const back = NetSession.join(hub.join("c9"), "TEST", opts, { playerId: mine!.owner, json: "{}" });
        hub.flush();
        const now = [host, ...clients.filter((c) => c !== leaving), back];
        const again = back.controller!.personal$.value[mine!.owner] as Extract<Prompt, { kind: "compPlay" }>;
        expect(again.kind).toBe("compPlay");
        expect(again.forfeitScore).toBe(5);
        hub.instant = true;
        again.onScore(again.forfeitScore!); // what the screen hands in
        hub.instant = false;
        hub.flush();
        now.forEach((s) => expect(s.controller!.liveScores(play.seed, [mine!.owner])[0]).toMatchObject({ score: 5, done: true }));
        settle(hub, host);
        expectInSync(now);
    });

    it("only lets the player a prompt belongs to answer it", () => {
        const { hub, host, clients, all } = setup(8, [0, 3], 5);
        let guard = 0;
        // play until it's the client's turn, then check the host can't answer for them
        while (guard++ < 2000) {
            const p = prompt(host);
            if (actorOf(p) === 3) break;
            step(hub, all);
        }
        const before = host.appliedInputs;
        const p = prompt(host);
        expect(host.mayActFor(3)).toBe(false);
        expect(clients[0].mayActFor(3)).toBe(true);
        expect(clients[0].mayActFor(null)).toBe(false);
        // whatever the host's screen tries, nothing happens
        Object.keys(p).forEach((key) => {
            const value = (p as any)[key];
            if (typeof value === "function") value();
        });
        host.controller!.continue();
        host.controller!.endSocial();
        hub.flush();
        expect(host.appliedInputs).toBe(before);
    });

    it("fixes a device that drifted, from the host's save", () => {
        const { hub, host, clients, all } = setup(8, [0, 3], 7);
        for (let i = 0; i < 40; i++) step(hub, all);
        const client = clients[0];
        const real = getById(client.controller!.gameState, 5).relationships[6];
        getById(client.controller!.gameState, 5).relationships[6] = real + 0.5;
        expect(stateHash(client.controller!.state)).not.toBe(stateHash(host.controller!.state));
        host.sendHash();
        hub.flush();
        expect(client.resyncs).toBe(1);
        // a reload from the last save can come out slightly differently from the host's live season: if it
        // does, the next check has everyone reload together
        host.sendHash();
        hub.flush();
        host.sendHash();
        hub.flush();
        expect(client.resyncs).toBeLessThanOrEqual(2);
        expectInSync(all);
        let guard = 0;
        // a device that reloaded can match the host but still take a slightly different path a few moves later
        // (it rebuilt what the save doesn't hold): the host checks after every move, so that gets caught and
        // everyone reloads together. Check as the app does, then make sure they end up the same.
        while (guard++ < 5000 && step(hub, all)) {
            host.sendHash();
            hub.flush();
            if (guard % 25 === 0) expectInSync(all);
        }
        expectInSync(all);
        expect(prompt(host).kind).toBe("gameOver");
    });

    it("plays for a player who dropped out, and lets them rejoin where the season is", () => {
        const { hub, host, clients } = setup(10, [0, 3, 6], 31);
        let all = [host, ...clients];
        for (let i = 0; i < 60; i++) step(hub, all);
        const leaving = clients[1];
        leaving.leave();
        hub.flush();
        all = [host, clients[0]];
        expect(host.mayActFor(6)).toBe(true); // the host plays for them meanwhile
        for (let i = 0; i < 60; i++) step(hub, all);
        expectInSync(all);
        // they come back on a fresh page, with their own (stale) copy of the season
        const back = NetSession.join(hub.join("c9"), "TEST", opts, { playerId: 6, json: "{}" });
        hub.flush();
        all = [host, clients[0], back];
        expect(back.localPlayerId).toBe(6);
        expect(host.mayActFor(6)).toBe(false);
        settle(hub, host);
        expectInSync(all);
        // resuming from the last save and replaying the inputs since can end up somewhere slightly different
        // from the host's live season; if so, everyone reloads together once
        let guard = 0;
        while (guard++ < 5000 && step(hub, all)) {
            if (guard % 25 === 0) {
                settle(hub, host);
                expectInSync(all);
            }
        }
        settle(hub, host);
        expectInSync(all);
        expect(prompt(back).kind).toBe("gameOver");
    });

    it("carries on when the host leaves: another device takes over", () => {
        const { hub, host, clients } = setup(8, [0, 3, 5], 13);
        for (let i = 0; i < 50; i++) step(hub, [host, ...clients]);
        host.leave();
        hub.flush();
        const next = clients.find((c) => c.amHost)!;
        expect(next).toBeDefined();
        expect(clients.filter((c) => c.amHost).length).toBe(1);
        let guard = 0;
        while (guard++ < 5000 && step(hub, clients)) if (guard % 25 === 0) expectInSync(clients);
        expectInSync(clients);
        expect(prompt(clients[0]).kind).toBe("gameOver");
    });

    it("a returning device with nobody else around carries on alone, as the host", () => {
        const hub = new FakeHub();
        const save = newPlayerSave(newGame(8), [0, 3]);
        const solo = new PlayerModeController(save);
        const { serialize } = require("../save/serialize");
        const back = NetSession.join(hub.join("z"), "TEST", opts, { playerId: 3, json: serialize(solo.state) });
        hub.flush();
        jest.advanceTimersByTime(100);
        expect(back.amHost).toBe(true);
        expect(back.localPlayerId).toBe(3);
        let guard = 0;
        while (guard++ < 5000 && step(hub, [back])) {}
        expect(prompt(back).kind).toBe("gameOver");
    });

    it("a lobby starts full of bots, and everyone who joins takes a bot's place", () => {
        const hub = new FakeHub();
        const cast = testCast(8);
        const cards = cast.map((hg) => ({ name: hg.name, imageURL: hg.imageURL }));
        const setup = { ...defaultSetup(cast.length), size: 6 };
        const host: NetSession | null = NetSession.hostLobby(hub.join("h"), "TEST", setup, cards, opts);
        const a = NetSession.join(hub.join("a"), "TEST", opts);
        const b = NetSession.join(hub.join("b"), "TEST", opts);
        hub.flush();
        const status = () => host!.status$.value;
        const kinds = () => houseOf(status().setup!, cards).map((s) => s.kind);
        expect(kinds()).toEqual(["bot", "bot", "bot", "bot", "bot", "bot"]);
        // a joiner sees the lobby too
        expect(a.status$.value.setup!.size).toBe(6);

        host!.takeSeat({ name: "Host", imageURL: "", castIndex: null });
        a.takeSeat({ name: "Ana", imageURL: "", castIndex: null });
        const botToPlay = houseOf(status().setup!, cards).find((s) => s.kind === "bot") as { castIndex: number };
        b.takeSeat({ name: "", imageURL: "", castIndex: botToPlay.castIndex });
        hub.flush();
        // the house stays at 6: three players, three bots, and B plays as the cast member they tapped
        expect(kinds()).toEqual(["player", "player", "player", "bot", "bot", "bot"]);
        expect(b.status$.value.mySeat!.castIndex).toBe(botToPlay.castIndex);
        // nobody else can take the same houseguest
        a.takeSeat({ name: "", imageURL: "", castIndex: botToPlay.castIndex });
        hub.flush();
        expect(a.status$.value.mySeat!.name).toBe("Ana");
        expect(a.status$.value.notice).toBeDefined();

        // the host shrinks the house: never below the players
        host!.updateSetup({ size: 2 });
        hub.flush();
        expect(status().setup!.size).toBe(4);
        // someone leaving gives their place back to a bot
        b.leave();
        hub.flush();
        expect(kinds()).toEqual(["player", "player", "bot", "bot"]);

        // start: the season has exactly these players, and each device plays its own
        const { save, claims } = buildOnlineSeason(status().setup!, cast, {}, true);
        expect(save.gameState.houseguests.length).toBe(4);
        expect(save.humanIds.length).toBe(2);
        host!.startSeason(save, claims);
        hub.flush();
        const all = [host!, a];
        const names = all.map((s) => getById(s.controller!.gameState, s.localPlayerId!).name);
        expect(names).toEqual(["Host", "Ana"]);
        let guard = 0;
        while (guard++ < 5000 && step(hub, all)) {
            host!.sendHash();
            hub.flush();
        }
        expectInSync(all);
        expect(prompt(a).kind).toBe("gameOver");
    });

    it("the house grows when more people join than there are bots", () => {
        const hub = new FakeHub();
        const cast = testCast(4);
        const cards = cast.map((hg) => ({ name: hg.name, imageURL: hg.imageURL }));
        const host = NetSession.hostLobby(hub.join("h"), "TEST", defaultSetup(cast.length), cards, opts);
        const others = ["a", "b", "c", "d"].map((id) => NetSession.join(hub.join(id), "TEST", opts));
        hub.flush();
        host.takeSeat({ name: "H", imageURL: "", castIndex: null });
        others.forEach((s, i) => s.takeSeat({ name: `P${i}`, imageURL: "", castIndex: null }));
        hub.flush();
        const setup = host.status$.value.setup!;
        expect(setup.seats.length).toBe(5);
        expect(setup.size).toBe(5);
        expect(houseOf(setup, cards).every((s) => s.kind === "player")).toBe(true);
    });
});
