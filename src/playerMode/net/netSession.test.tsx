import { getById } from "../../model";
import { actorOf, newPlayerSave, PlayerModeController, Prompt, Step } from "../playerModeController";
import { answer, newGame } from "../testing";
import { NetSession, SessionOptions, stateHash } from "./netSession";
import { FakeHub } from "./room";
import { buildOnlineSeason, defaultSetup, houseOf } from "./lobby";
import { cast as testCast } from "../testing";
import { SeasonRules, withDefaults } from "../rules";

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
        // the screens up now: ones that come up while answering them wait for the next round, as on a real
        // device (so the end of everyone's social time doesn't answer the comp that follows in the same round)
        const up = ownScreens(live).map((o) => o.prompt);
        for (let guard = 0; guard < 50; guard++) {
            const next = ownScreens(live).find((o) => up.includes(o.prompt));
            if (!next) break;
            // like the screen does: what's done there is for the player whose screen it is
            next.session.focus(next.owner);
            try {
                answer(next.session.controller!, next.prompt, "random", "random");
            } finally {
                next.session.focus(null);
            }
            acted = true;
        }
        if (!acted) moveOn(live);
    } finally {
        hub.instant = false;
    }
    hub.flush();
    return true;
}

// The shared screen: whoever it belongs to answers it. One everyone watches waits for every player to press
// Continue (the host last, as its press is what happens).
function moveOn(live: NetSession[]) {
    const p = prompt(live[0]);
    if (actorOf(p) === null && live.some((s) => s.everyoneContinues)) {
        // (an expelled player only watches: their Continue isn't waited for)
        const pressers = live.filter((s) => s.localPlayerId !== null && !s.controller!.isRuleBreaker(s.localPlayerId));
        const host = pressers.filter((s) => s.amHost);
        [...pressers.filter((s) => !s.amHost), ...host].forEach((s) => {
            // the others' presses may have moved the screen on already
            const mine = prompt(s);
            if (actorOf(mine) === null && mine.kind === p.kind) answer(s.controller!, mine, "random", "random");
        });
        return;
    }
    const mover = live.find((s) => s.mayActFor(actorOf(prompt(s))));
    if (!mover) throw new Error(`Nobody can answer ${p.kind} for ${actorOf(p)}`);
    answer(mover.controller!, prompt(mover), "random", "random");
}

// players' own screens that a device may answer
function ownScreens(sessions: NetSession[]): { session: NetSession; owner: number; prompt: Prompt }[] {
    const found: { session: NetSession; owner: number; prompt: Prompt }[] = [];
    sessions.forEach((session) => {
        const own = session.controller!.personal$.value;
        Object.keys(own)
            .map(Number)
            // (done with social time, waiting on the others: nothing to answer)
            .filter((owner) => session.mayActFor(owner) && own[owner].kind !== "socialDone")
            .forEach((owner) => found.push({ session, owner, prompt: own[owner] }));
    });
    return found;
}

// Plays on until at least `count` players have their own screens up at the same time.
function untilOwnScreens(hub: FakeHub, sessions: NetSession[], count: number): boolean {
    for (let guard = 0; guard < 5000; guard++) {
        // (social time is everyone at once too, but with a whole screen of moves: these are one-answer decisions)
        const owners = new Set(
            ownScreens(sessions.filter((s) => s.controller))
                .filter((o) => !["social", "alliance"].includes(o.prompt.kind))
                .map((o) => o.owner)
        );
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

function setup(
    n: number,
    humanIds: number[],
    seed: number,
    pace?: { gapMs: number; startedAt: number },
    turnLimit?: number,
    rules?: Partial<SeasonRules>
) {
    const hub = new FakeHub();
    const save = newPlayerSave(newGame(n), humanIds);
    save.seed = seed;
    if (rules) save.rules = withDefaults(rules);
    if (pace) save.pace = pace;
    if (turnLimit) save.turnLimit = turnLimit;
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

    it("with social time one player at a time, players take turns and every device stays in sync", () => {
        const { hub, host, all } = setup(8, [0, 3], 17, undefined, undefined, { together: false });
        expect(host.controller!.socialTogether).toBe(false);
        let guard = 0;
        let turns = 0;
        while (guard++ < 5000 && step(hub, all)) {
            // one player's turn at a time, on the screen everyone shares: nobody has social time of their own
            const own = host.controller!.personal$.value;
            expect([0, 3].some((id) => own[id] && (own[id].kind === "social" || own[id].kind === "alliance"))).toBe(false);
            const p = prompt(host);
            if (p.kind === "social" || p.kind === "alliance") turns++;
            if (guard % 25 === 0) expectInSync(all);
        }
        expect(turns).toBeGreaterThan(0);
        all.forEach((s) => expect(s.controller!.state.step).toBe(Step.GameOver));
        expectInSync(all);
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
                moveOn(now);
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

    // plays on until `when` holds, then the player it picks opens the inspect tools; the season then plays to the end
    function caught(pick: (c: PlayerModeController) => number | undefined) {
        const { hub, host, all } = setup(10, [1, 4, 7], 23);
        let id: number | undefined;
        for (let guard = 0; guard < 5000 && id === undefined; guard++) {
            id = pick(host.controller!);
            if (id === undefined) expect(step(hub, all)).toBe(true);
        }
        const theirs = all.find((s) => s.localPlayerId === id)!;
        const others = all.filter((s) => s !== theirs);
        // the host takes a report only from the player's own device
        const forged = { kind: "method", name: "ruleBreak", args: [], owner: id };
        others.forEach((s) => expect((host as any).valid(forged, (s as any).room.selfId)).toBe(false));
        expect((host as any).valid(forged, (theirs as any).room.selfId)).toBe(true);
        const before = { history: host.controller!.state.history.length, step: host.controller!.state.step };
        theirs.reportRuleBreak();
        hub.flush();
        all.forEach((s) => {
            expect(s.controller!.state.ruleBreakers).toEqual([id]);
            expect(s.controller!.player(id!).isEvicted).toBe(true);
        });
        expect(prompt(host).kind).toBe("scene"); // everyone hears about it
        settle(hub, host);
        expectInSync(all);
        return { hub, host, all, id: id!, before };
    }

    it("expels a nominee who opens the inspect tools, with no eviction vote", () => {
        const { hub, host, all, id, before } = caught((c) => {
            const s = c.state;
            const nom = (s.week.nomineeIds || []).find((n) => [1, 4, 7].includes(n) && !c.player(n).isEvicted);
            return s.step === Step.Veto || s.step === Step.SocialCampaign ? nom : undefined;
        });
        const c = host.controller!;
        expect(before.step).not.toBe(Step.Fallout);
        expect(c.state.history.length).toBe(before.history + 1);
        expect(c.state.history[c.state.history.length - 1].evictedIds).toEqual([id]);
        expect(c.state.step).toBe(Step.Fallout);
        // and the season goes on to the end, everyone in sync
        for (let guard = 0; guard < 8000 && step(hub, all); guard++);
        expect(prompt(host).kind).toBe("gameOver");
        settle(hub, host);
        expectInSync(all);
        expect(c.state.history.flatMap((w) => w.evictedIds).filter((e) => e === id)).toHaveLength(1);
    });

    it("a player caught in the middle of a comp is out, and the comp goes on without them", () => {
        const { hub, host, all, id } = caught((c) => {
            const own = c.personal$.value;
            const playing = Object.keys(own).map(Number).filter((o) => own[o].kind === "compPlay");
            return playing.length >= 2 ? playing[playing.length - 1] : undefined;
        });
        const c = host.controller!;
        expect(c.player(id).isJury).toBe(false);
        for (let guard = 0; guard < 8000 && step(hub, all); guard++) {
            all.forEach((s) => expect(Object.keys(s.controller!.personal$.value)).not.toContain(String(id)));
        }
        expect(prompt(host).kind).toBe("gameOver");
        settle(hub, host);
        expectInSync(all);
    });

    it("a finalist caught in the final three or the final two can't win", () => {
        for (const at of [Step.FinaleHoh1, Step.FinalTwo]) {
            let tries = 0;
            for (const seed of [23, 5, 9, 31, 44, 12, 77]) {
                const { hub, host, all } = setup(10, [1, 4, 7], seed);
                let id: number | undefined;
                for (let guard = 0; guard < 8000; guard++) {
                    const c = host.controller!;
                    if (c.state.step === at) id = [1, 4, 7].find((n) => !c.player(n).isEvicted);
                    if (id !== undefined || !step(hub, all)) break;
                }
                if (id === undefined) continue; // every player was out before then
                tries++;
                all.find((x) => x.localPlayerId === id)!.reportRuleBreak();
                hub.flush();
                for (let guard = 0; guard < 8000 && step(hub, all); guard++);
                expect(prompt(host).kind).toBe("gameOver");
                settle(hub, host);
                expectInSync(all);
                const c = host.controller!;
                if (at === Step.FinalTwo) {
                    expect(Object.values(c.juryBook.reasons || {}).every((r) => r === "The other finalist broke the rules.")).toBe(true);
                } else expect(c.player(id).isEvicted).toBe(true);
                break;
            }
            expect(tries).toBe(1);
        }
    });

    it("a screen everyone watches moves on once every player has pressed Continue", () => {
        const { hub, host, clients, all } = setup(10, [1, 4, 7], 23);
        const [a, b] = clients;
        for (let guard = 0; guard < 2000 && prompt(host).kind !== "scene"; guard++) step(hub, all);
        expect(prompt(host).kind).toBe("scene");
        const before = host.appliedInputs;
        hub.instant = true;
        a.controller!.continue();
        a.controller!.continue(); // a second tap changes nothing
        hub.instant = false;
        hub.flush();
        expect(host.appliedInputs).toBe(before);
        expect(a.waitingText).toBe(`⏳ Waiting for ${host.playerName(1)} and ${host.playerName(7)}`);
        expect(b.waitingText).toBeNull(); // they haven't pressed theirs
        hub.instant = true;
        host.controller!.continue();
        hub.instant = false;
        hub.flush();
        expect(host.appliedInputs).toBe(before);
        expect(a.waitingText).toBe(`⏳ Waiting for ${host.playerName(7)}`);
        hub.instant = true;
        b.controller!.continue();
        hub.instant = false;
        hub.flush();
        expect(host.appliedInputs).toBe(before + 1);
        all.forEach((s) => expect(s.waitingText).toBeNull());
        settle(hub, host);
        expectInSync(all);
    });

    it("stops waiting for a player who leaves", () => {
        const { hub, host, clients, all } = setup(10, [1, 4, 7], 23);
        for (let guard = 0; guard < 2000 && prompt(host).kind !== "scene"; guard++) step(hub, all);
        const before = host.appliedInputs;
        hub.instant = true;
        host.controller!.continue();
        clients[0].controller!.continue();
        hub.instant = false;
        hub.flush();
        expect(host.appliedInputs).toBe(before);
        clients[1].leave();
        hub.flush();
        expect(host.appliedInputs).toBe(before + 1);
        settle(hub, host);
        expectInSync([host, clients[0]]);
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

    it("a late joiner can watch live: in sync, never asked to act, never waited for, and never made host", () => {
        const { hub, host, clients } = setup(8, [0, 3, 5], 17);
        for (let i = 0; i < 40; i++) step(hub, [host, ...clients]);
        // "a0" sorts before every player's device: it would be next in line to host if it were playing
        const fan = NetSession.join(hub.join("a0"), "TEST", opts);
        hub.flush();
        expect(fan.localPlayerId).toBe(null);
        expect(fan.controller).toBe(null);
        fan.watch();
        hub.flush();
        expect(fan.spectating).toBe(true);
        expect(fan.status$.value.spectating).toBe(true);
        expect(fan.controller).not.toBe(null);
        settle(hub, host);
        let all = [host, ...clients, fan];
        expectInSync(all);
        expect(fan.everyoneContinues).toBe(false);
        expect(fan.mayActFor(null)).toBe(false);
        [0, 3, 5].forEach((id) => expect(fan.mayActFor(id)).toBe(false));
        for (let i = 0; i < 40; i++) step(hub, all);
        // (a device that started from a save can drift from the live season: the host's hash check fixes it)
        settle(hub, host);
        expectInSync(all);
        // the host leaves: a player's device takes over, not the spectator's
        host.leave();
        hub.flush();
        all = [...clients, fan];
        expect(fan.amHost).toBe(false);
        expect(clients.filter((c) => c.amHost).length).toBe(1);
        let guard = 0;
        while (guard++ < 5000 && step(hub, all)) if (guard % 25 === 0) settle(hub, clients.find((c) => c.amHost)!);
        settle(hub, clients.find((c) => c.amHost)!);
        expectInSync(all);
        expect(prompt(fan).kind).toBe("gameOver");
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

    it("a bot plays for a player who's been gone a while, until they're back", () => {
        const { hub, host, clients } = setup(10, [0, 3, 6], 31);
        let all = [host, ...clients];
        for (let i = 0; i < 40; i++) step(hub, all);
        clients[1].leave();
        hub.flush();
        all = [host, clients[0]];
        jest.advanceTimersByTime(5000);
        hub.flush();
        expect(host.controller!.isAutopilot(6)).toBe(false); // not yet: they might be right back
        jest.advanceTimersByTime(11000);
        hub.flush();
        expect(host.controller!.isAutopilot(6)).toBe(true);
        expect(clients[0].controller!.isAutopilot(6)).toBe(true);
        // nothing waits on them any more: no screen of theirs comes up
        for (let i = 0; i < 80 && step(hub, all); i++) {
            expect(actorOf(prompt(host))).not.toBe(6);
            expect(host.controller!.personal$.value[6]).toBeUndefined();
        }
        settle(hub, host);
        expectInSync(all);
        // they come back, and they're in control again
        const back = NetSession.join(hub.join("c9"), "TEST", opts, { playerId: 6, json: "{}" });
        hub.flush();
        all = [host, clients[0], back];
        expect(back.localPlayerId).toBe(6);
        // back halfway through a comp: the bot finishes it first
        for (let i = 0; i < 500 && host.controller!.compOn(); i++) step(hub, all);
        jest.advanceTimersByTime(2000);
        hub.flush();
        expect(host.controller!.isAutopilot(6)).toBe(false);
        settle(hub, host);
        expectInSync(all);
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

    it("a bot takes over a comp the player had up when they went away, and the others keep playing", () => {
        const { hub, host, clients } = setup(8, [0, 3, 5], 19);
        const all = [host, ...clients];
        expect(untilOwnScreens(hub, all, 3)).toBe(true);
        clients[1].leave();
        hub.flush();
        jest.advanceTimersByTime(16000);
        hub.flush();
        expect(host.controller!.isAutopilot(5)).toBe(true);
        expect(host.controller!.personal$.value[5]).toBeUndefined();
        // the other two still have theirs
        expect(host.controller!.personal$.value[0]).toBeDefined();
        expect(host.controller!.personal$.value[3]).toBeDefined();
        let guard = 0;
        while (guard++ < 5000 && step(hub, [host, clients[0]])) if (guard % 25 === 0) settle(hub, host);
        settle(hub, host);
        expectInSync([host, clients[0]]);
        expect(prompt(host).kind).toBe("gameOver");
    });

    it("a player back halfway through a comp doesn't join it: the bot finishes it, then they're in control", () => {
        const { hub, host, clients } = setup(8, [0, 3, 5], 19);
        let all = [host, ...clients];
        let guard = 0;
        while (guard++ < 5000 && !(host.controller!.compOn() && host.controller!.personal$.value[5])) step(hub, all);
        expect(host.controller!.compOn()).toBe(true);
        clients[1].leave();
        hub.flush();
        jest.advanceTimersByTime(16000);
        hub.flush();
        expect(host.controller!.isAutopilot(5)).toBe(true);
        const back = NetSession.join(hub.join("c9"), "TEST", opts, { playerId: 5, json: "{}" });
        hub.flush();
        all = [host, clients[0], back];
        expect(back.localPlayerId).toBe(5);
        // still the bot's comp
        jest.advanceTimersByTime(3000);
        hub.flush();
        expect(host.controller!.compOn()).toBe(true);
        expect(host.controller!.isAutopilot(5)).toBe(true);
        expect(host.controller!.personal$.value[5]).toBeUndefined();
        // once it's over, they're back
        while (guard++ < 5000 && host.controller!.compOn()) {
            expect(host.controller!.isAutopilot(5)).toBe(true);
            step(hub, all);
        }
        jest.advanceTimersByTime(2000);
        hub.flush();
        expect(host.controller!.isAutopilot(5)).toBe(false);
        settle(hub, host);
        expectInSync(all);
    });

    it("a device whose connection drops and comes back gets its seat back", () => {
        const { hub, host, clients, all } = setup(8, [0, 3], 5);
        for (let i = 0; i < 20; i++) step(hub, all);
        hub.drop("c0");
        hub.flush();
        expect(host.status$.value.claims[3]).toBeUndefined();
        hub.restore("c0");
        hub.flush();
        expect(clients[0].localPlayerId).toBe(3);
        expect(host.status$.value.claims[3]).toBe("c0");
        settle(hub, host);
        expectInSync(all);
    });

    it("private messages reach only the two players; evicted players talk in the jury house", () => {
        localStorage.clear();
        const { hub, host, clients, all } = setup(8, [0, 3, 5, 6], 13);
        const of = (id: number) => all.find((s) => s.localPlayerId === id)!;
        const texts = (s: NetSession) => s.chat$.value.map((m) => m.text);
        of(0).sendChat(3, "hi 3");
        of(3).sendChat(0, "hey 0");
        hub.flush();
        expect(texts(of(3))).toEqual(["hi 3", "hey 0"]);
        expect(texts(of(0))).toEqual(["hi 3", "hey 0"]);
        expect(texts(of(5))).toEqual([]);
        // nobody can pretend to be someone else, or write to the jury house from inside the house
        (of(5) as any).room.send("chatSend", { id: "fake", from: 0, to: 3, text: "fake", at: 0 }, "h");
        of(5).sendChat("jury", "hello jury");
        hub.flush();
        expect(texts(of(3))).toEqual(["hi 3", "hey 0"]);
        expect(texts(of(5))).toEqual([]);
        const evicted = () => [0, 3, 5, 6].filter((id) => getById(host.controller!.gameState, id).isEvicted);
        let guard = 0;
        while (guard++ < 5000 && evicted().length < 1 && step(hub, all)) {}
        const [first] = evicted();
        const alive = [0, 3, 5, 6].filter((id) => !evicted().includes(id));
        of(first).sendChat("jury", "the jury is in session");
        of(first).sendChat(alive[0], "can I still talk to you?"); // no: evicted players only have the jury house
        hub.flush();
        expect(texts(of(first))).toContain("the jury is in session");
        expect(texts(of(first))).not.toContain("can I still talk to you?");
        alive.forEach((id) => expect(texts(of(id))).not.toContain("the jury is in session"));
        while (guard++ < 5000 && evicted().length < 2 && step(hub, all)) {}
        const second = evicted().find((id) => id !== first)!;
        // the new juror gets what's been said in the jury house so far
        expect(texts(of(second))).toContain("the jury is in session");
        of(second).sendChat("jury", "hi everyone");
        hub.flush();
        expect(texts(of(first))).toContain("hi everyone");
    });

    it("social time is everyone's at once, with their own actions, and a player who moved on can go back", () => {
        const { hub, host, clients, all } = setup(8, [0, 3], 13);
        const client = clients[0];
        const own = (s: NetSession, id: number) => s.controller!.personal$.value[id];
        let guard = 0;
        while (guard++ < 500 && !(own(host, 0) && own(host, 0).kind === "social" && own(client, 3) && own(client, 3).kind === "social")) step(hub, all);
        expect(own(host, 0).kind).toBe("social");
        expect(own(client, 3).kind).toBe("social");
        expect(prompt(host).kind).toBe("waiting");
        // each has their own actions
        const c = host.controller!;
        const start0 = c.actionsOf(0);
        const start3 = c.actionsOf(3);
        const bot = c.gameState.houseguests.find((hg) => !hg.isEvicted && hg.id !== 0 && hg.id !== 3)!;
        client.focus(3);
        client.controller!.socialAct({ kind: "chat", botId: bot.id });
        client.focus(null);
        hub.flush();
        expect(c.actionsOf(3)).toBe(start3 - 1);
        expect(c.actionsOf(0)).toBe(start0);
        // the client moves on (no alliances yet: straight to done) while the host is still at it
        client.focus(3);
        client.controller!.endSocial();
        client.focus(null);
        hub.flush();
        expect(own(client, 3).kind).toBe("socialDone");
        expect(own(host, 0).kind).toBe("social");
        expect((prompt(host) as any).waitingOn).toEqual([0]);
        // ...then goes back to answer a text
        host.sendChat(3, "wait, come back!");
        hub.flush();
        client.focus(3);
        client.controller!.backToSocial();
        client.focus(null);
        hub.flush();
        expect(own(client, 3).kind).toBe("social");
        expect(c.actionsOf(3)).toBe(start3 - 1); // the actions they had left
        // once everyone's done, the block moves on
        [
            [client, 3],
            [host, 0],
        ].forEach(([s, id]) => {
            const session = s as NetSession;
            session.focus(id as number);
            session.controller!.endSocial();
            session.focus(null);
            hub.flush();
        });
        all.forEach((s) => expect(s.controller!.personal$.value[0] === undefined || s.controller!.personal$.value[0].kind !== "social").toBe(true));
        settle(hub, host);
        expectInSync(all);
        all.forEach((s) => expect(s.resyncs).toBe(0));
    });

    it("a player's conversation with a bot reaches every device, and answers the same everywhere", () => {
        const { hub, host, clients, all } = setup(8, [0, 3], 31);
        const client = clients[0];
        let talked = 0;
        for (let guard = 0; guard < 3000 && talked < 3; guard++) {
            const own = client.controller!.personal$.value[3] || prompt(client);
            if (own && own.kind === "social" && actorOf(own) === 3) {
                const bot = client.controller!.gameState.houseguests.find((hg) => !hg.isEvicted && hg.id !== 0 && hg.id !== 3)!;
                const before = client.controller!.actionsOf(3);
                client.focus(3); // the screen it's on: player 3's own
                client.controller!.talkToBot(bot.id, "hey! who are you targeting?");
                client.controller!.talkToBot(bot.id, "final two? you and me");
                client.focus(null);
                hub.flush();
                expectInSync(all);
                const lines = host.controller!.talkWith(3, bot.id);
                expect(lines.length).toBeGreaterThanOrEqual(4);
                expect(client.controller!.talkWith(3, bot.id)).toEqual(lines);
                // the other player has nothing to show for it
                expect(host.controller!.talkWith(0, bot.id).filter((l) => l.text.includes("final two? you and me"))).toEqual([]);
                expect(host.controller!.actionsOf(3)).toBeLessThanOrEqual(before);
                talked++;
            }
            if (!step(hub, all)) break;
        }
        expect(talked).toBe(3);
        settle(hub, host);
        all.forEach((s) => expect(s.resyncs).toBe(0));
    });

describe("real time", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });
    const HOUR = 3600000;

    // plays on, without voting to move on, until the season takes a break
    function untilBreak(hub: FakeHub, all: NetSession[]): boolean {
        for (let guard = 0; guard < 5000; guard++) {
            const p = prompt(all[0]);
            if (p.kind === "break") return true;
            if (p.kind === "gameOver") return false;
            hub.instant = true;
            try {
                const own = ownScreens(all).filter((o) => o.prompt.kind !== "breakVote");
                if (own.length > 0) {
                    own[0].session.focus(own[0].owner);
                    answer(own[0].session.controller!, own[0].prompt, "random", "random");
                    own[0].session.focus(null);
                } else moveOn(all);
            } finally {
                hub.instant = false;
            }
            hub.flush();
        }
        return false;
    }

    it("takes a break before the next comp, until time's up or every player votes to move on", () => {
        const startedAt = Date.now();
        const { hub, host, clients, all } = setup(8, [0, 3, 5], 23, { gapMs: 24 * HOUR, startedAt });
        // the first comp doesn't wait; the next one does, a day after the season started
        expect(untilBreak(hub, all)).toBe(true);
        const first = prompt(host) as Extract<Prompt, { kind: "break" }>;
        expect(first.until).toBe(startedAt + 24 * HOUR);
        expect(first.voters).toEqual([0, 3, 5]);
        all.forEach((s) => expect(prompt(s).kind).toBe("break"));
        expect(clients[0].controller!.personal$.value[3].kind).toBe("breakVote");
        // only the host's device ends it when time's up
        (prompt(clients[0]) as any).timeUp(Date.now());
        hub.flush();
        expect(prompt(host).kind).toBe("break");
        // two of three votes: still waiting
        (clients[0].controller!.personal$.value[3] as any).onVote(Date.now());
        (clients[1].controller!.personal$.value[5] as any).onVote(Date.now());
        hub.flush();
        expect((prompt(host) as any).voted).toEqual([3, 5]);
        expect(prompt(clients[1]).kind).toBe("break");
        // the last vote: on with the show, for everyone
        const at = Date.now();
        (host.controller!.personal$.value[0] as any).onVote(at);
        hub.flush();
        expect(prompt(host).kind).not.toBe("break");
        expect(host.controller!.state.pace!.nextAt).toBe(at + 24 * HOUR);
        settle(hub, host);
        expectInSync(all);
        // the next break ends when the host says time's up
        expect(untilBreak(hub, all)).toBe(true);
        const later = Date.now() + 5;
        (prompt(host) as any).timeUp(later);
        hub.flush();
        expect(prompt(host).kind).not.toBe("break");
        expect(host.controller!.state.pace!.nextAt).toBe(later + 24 * HOUR);
        settle(hub, host);
        expectInSync(all);
    });

    it("a real-time season plays to the end, with every break voted through", () => {
        const { hub, host, all } = setup(8, [0, 3], 31, { gapMs: HOUR, startedAt: Date.now() });
        let guard = 0;
        while (guard++ < 6000 && step(hub, all)) {}
        expect(prompt(host).kind).toBe("gameOver");
        settle(hub, host);
        expectInSync(all);
    });
});

    describe("time limits and pauses", () => {

        // plays on until a player (not a bot) has a decision up, on the shared screen or their own
        function untilDecision(hub: FakeHub, all: NetSession[]): { owner: number | null; id: number } {
            for (let guard = 0; guard < 5000; guard++) {
                const host = all[0];
                const c = host.controller!;
                const shared = prompt(host);
                const actor = actorOf(shared);
                if (actor !== null && c.state.humanIds.includes(actor) && host.deadline(null) !== null) return { owner: null, id: actor };
                const own = Object.keys(c.personal$.value).map(Number).find((id) => host.deadline(id) !== null);
                if (own !== undefined) return { owner: own, id: own };
                if (!step(hub, all)) throw new Error("Season ended");
            }
            throw new Error("No decision came up");
        }

        it("a bot makes the call for a player who runs out of time, and they're back in control after", () => {
            const { hub, host, all } = setup(8, [0, 3, 5], 41, undefined, 60);
            const { owner, id } = untilDecision(hub, all);
            const before = owner === null ? prompt(host) : host.controller!.personal$.value[owner];
            const due = host.deadline(owner)!;
            jest.advanceTimersByTime(Math.max(0, due - Date.now()) - 1000);
            hub.flush();
            const still = owner === null ? prompt(host) : host.controller!.personal$.value[owner];
            expect(still).toBe(before);
            jest.advanceTimersByTime(2000);
            hub.flush();
            const after = owner === null ? prompt(host) : host.controller!.personal$.value[owner];
            expect(after).not.toBe(before);
            expect(host.controller!.isAutopilot(id)).toBe(false);
            expect(host.controller!.state.gameState.log && JSON.stringify(host.controller!.state)).toContain("ran out of time");
            settle(hub, host);
            expectInSync(all);
        });

        it("a pause needs half the players in the house (not the bots), and stops everything until it's over", () => {
            const { hub, host, clients, all } = setup(8, [0, 3, 5], 43, undefined, 60);
            for (let i = 0; i < 30; i++) step(hub, all);
            expect(host.pauseVoters()).toEqual([0, 3, 5]);
            clients[0].pause("ask");
            hub.flush();
            const asked = host.status$.value.pause!;
            expect(asked).toMatchObject({ by: 3, yes: [3], needed: 2, on: false });
            expect(clients[1].status$.value.pause!.on).toBe(false);
            // a second vote: on, for everyone
            clients[1].pause("yes");
            hub.flush();
            all.forEach((s) => expect(s.status$.value.pause!.on).toBe(true));
            // nothing moves while it's on, not even the clocks
            const applied = host.appliedInputs;
            const shownPrompt = prompt(host);
            // (no auto-playing here: it would keep trying moves that are turned down)
            const away = clients[0];
            away.leave(); // a device going away doesn't get a bot either, while paused
            jest.advanceTimersByTime(10 * 60000);
            hub.flush();
            expect(host.appliedInputs).toBe(applied);
            expect(prompt(host)).toBe(shownPrompt);
            expect(host.controller!.isAutopilot(3)).toBe(false);
            // only someone who agreed (or the host) ends it
            clients[1].pause("end");
            hub.flush();
            [host, clients[1]].forEach((s) => expect(s.status$.value.pause).toBeNull());
            // the clocks run again: the player who left gets a bot, and the season moves on
            jest.advanceTimersByTime(20000);
            hub.flush();
            expect(host.controller!.isAutopilot(3)).toBe(true);
            step(hub, [host, clients[1]]);
            expect(host.appliedInputs).toBeGreaterThan(applied);
            settle(hub, host);
            expectInSync([host, clients[1]]);
        });

        it("a pause most players turn down is dropped", () => {
            const { hub, host, clients } = setup(8, [0, 3, 5], 47);
            hub.flush();
            host.pause("ask");
            hub.flush();
            clients[0].pause("no");
            hub.flush();
            expect(host.status$.value.pause!.on).toBe(false);
            clients[1].pause("no");
            hub.flush();
            expect(host.status$.value.pause).toBeNull();
            expect(clients[0].status$.value.pause).toBeNull();
        });
    });
});
