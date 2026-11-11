import { getById } from "../../model";
import { actorOf, newPlayerSave, PlayerModeController, Prompt, Step } from "../playerModeController";
import { answer, newGame } from "../testing";
import { NetSession, SessionOptions, stateHash } from "./netSession";
import { FakeHub } from "./room";

const opts: SessionOptions = { launch: (controller) => controller.start(), hostWaitMs: 50, hashDelayMs: 10 };

function prompt(s: NetSession): Prompt {
    return s.controller!.prompt$.value!;
}

// One move by whichever device's turn it is, then deliver everything. Returns false once the season is over.
function step(hub: FakeHub, sessions: NetSession[]): boolean {
    const live = sessions.filter((s) => s.controller);
    const p = prompt(live[0]);
    if (p.kind === "gameOver") return false;
    // like the real screens: each device looks at its own prompt
    const mover = live.find((s) => s.mayActFor(actorOf(prompt(s))));
    if (!mover) throw new Error(`Nobody can answer ${p.kind} for ${actorOf(p)}`);
    answer(mover.controller!, prompt(mover), "random", "random");
    hub.flush();
    return true;
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
});
