// (the model and the season's controller first: this is the order the app loads them in)
import { getById } from "../../model";
import { cast as testCast } from "../testing";
import { NetSession, Reaction, REACTIONS, SessionOptions } from "./netSession";
import { FakeHub, PublicGame } from "./room";
import { buildOnlineSeason, defaultSetup, houseOf } from "./lobby";
import { pickQuickGame } from "../ui/onlineLobby";

const opts: SessionOptions = { launch: (controller) => controller.start(), hostWaitMs: 50, hashDelayMs: 10 };

function lobby() {
    const hub = new FakeHub();
    const cast = testCast(8);
    const cards = cast.map((hg) => ({ name: hg.name, imageURL: hg.imageURL }));
    const host = NetSession.hostLobby(hub.join("h"), "TEST", { ...defaultSetup(cast.length), size: 6 }, cards, opts);
    const a = NetSession.join(hub.join("a"), "TEST", opts);
    const b = NetSession.join(hub.join("b"), "TEST", opts);
    hub.flush();
    host.takeSeat({ name: "Host", imageURL: "", castIndex: null });
    a.takeSeat({ name: "Ana", imageURL: "", castIndex: null });
    b.takeSeat({ name: "Ben", imageURL: "", castIndex: null });
    hub.flush();
    const seats = () => host.status$.value.setup!.seats.map((s) => s.name);
    return { hub, cast, cards, host, a, b, seats };
}

describe("online: the host can remove a player", () => {
    it("from the lobby: their spot goes back to a bot, they're told, and they can't sit down again", () => {
        const { hub, cards, host, a, seats } = lobby();
        expect(seats()).toEqual(["Host", "Ana", "Ben"]);
        host.kick({ peerId: "a" });
        hub.flush();
        expect(seats()).toEqual(["Host", "Ben"]);
        expect(houseOf(host.status$.value.setup!, cards).filter((s) => s.kind === "bot").length).toBe(4);
        expect(a.removed).toBe(true);
        expect(a.status$.value.notice).toContain("removed you");
        // trying again, under the same name or another
        a.takeSeat({ name: "Ana", imageURL: "", castIndex: null });
        a.takeSeat({ name: "Somebody New", imageURL: "", castIndex: null });
        hub.flush();
        expect(seats()).toEqual(["Host", "Ben"]);
    });

    it("only the host can, and never themselves", () => {
        const { hub, host, a, seats } = lobby();
        a.kick({ peerId: "b" });
        host.kick({ peerId: "h" });
        hub.flush();
        expect(seats()).toEqual(["Host", "Ana", "Ben"]);
    });

    it("a removed player's name can't be reused by another device in that game", () => {
        const { hub, host, seats } = lobby();
        host.kick({ peerId: "a" });
        hub.flush();
        const again = NetSession.join(hub.join("a2"), "TEST", opts);
        hub.flush();
        again.takeSeat({ name: "ana", imageURL: "", castIndex: null });
        hub.flush();
        expect(seats()).toEqual(["Host", "Ben"]);
    });

    it("from a season under way: they lose their seat, and can't claim it back", () => {
        const { hub, cast, host, a, b } = lobby();
        const { save, claims } = buildOnlineSeason(host.status$.value.setup!, cast, {}, true);
        host.startSeason(save, claims);
        hub.flush();
        const anaId = a.localPlayerId!;
        expect(anaId).not.toBeNull();
        host.kick({ playerId: anaId });
        hub.flush();
        expect(host.status$.value.claims[anaId]).toBeUndefined();
        expect(a.removed).toBe(true);
        a.claim(anaId);
        hub.flush();
        expect(host.status$.value.claims[anaId]).toBeUndefined();
        // everyone else carries on
        expect(getById(host.controller!.gameState, anaId).name).toBe("Ana");
        expect(b.localPlayerId).not.toBeNull();
        expect(host.localPlayerId).not.toBeNull();
    });
});

describe("online: names and chat on a public game are filtered by the host", () => {
    it("a crude name becomes a plain one", () => {
        const { hub, host, a, seats } = lobby();
        a.takeSeat({ name: "fuck you", imageURL: "", castIndex: null });
        hub.flush();
        expect(seats()).toEqual(["Host", "Player", "Ben"]);
        expect(host.status$.value.setup!.seats[1].peerId).toBe("a");
    });

    it("crude words in chat are starred out for everyone, the rest of the message stays", () => {
        const { hub, cast, host, a, b } = lobby();
        const { save, claims } = buildOnlineSeason(host.status$.value.setup!, cast, {}, true);
        host.startSeason(save, claims);
        hub.flush();
        a.sendChat(b.localPlayerId!, "you fucking snake, nice move");
        hub.flush();
        const got = b.chat$.value.map((m) => m.text);
        expect(got).toEqual(["you ******* snake, nice move"]);
    });
});

describe("online: reactions", () => {
    it("reach every device, the sender's included, and only the allowed ones", () => {
        const { hub, cast, host, a, b } = lobby();
        const { save, claims } = buildOnlineSeason(host.status$.value.setup!, cast, {}, true);
        host.startSeason(save, claims);
        hub.flush();
        const seen: { [who: string]: Reaction[] } = { host: [], a: [], b: [] };
        host.reactions$.subscribe((r) => seen.host.push(r));
        a.reactions$.subscribe((r) => seen.a.push(r));
        b.reactions$.subscribe((r) => seen.b.push(r));
        a.react(REACTIONS[0]);
        a.react("<script>");
        hub.flush();
        ["host", "a", "b"].forEach((who) => {
            expect(seen[who].length).toBe(1);
            expect(seen[who][0].emoji).toBe(REACTIONS[0]);
            expect(seen[who][0].playerId).toBe(a.localPlayerId);
        });
        // one right after another from the same device: dropped
        a.react(REACTIONS[1]);
        hub.flush();
        expect(seen.b.length).toBe(1);
    });

    it("someone watching without a seat can't react", () => {
        const { hub, cast, host } = lobby();
        const { save, claims } = buildOnlineSeason(host.status$.value.setup!, cast, {}, true);
        host.startSeason(save, claims);
        const watcher = NetSession.join(hub.join("w"), "TEST", opts);
        hub.flush();
        const seen: Reaction[] = [];
        host.reactions$.subscribe((r) => seen.push(r));
        watcher.react(REACTIONS[0]);
        hub.flush();
        expect(seen).toEqual([]);
    });
});

describe("quick play", () => {
    const game = (code: string, players: number, size: number): PublicGame => ({ code, host: "x", players, size, want: 0, difficulty: "normal", paceHours: 0, turnSeconds: 0 });

    it("drops you into the game closest to starting, never a full one", () => {
        expect(pickQuickGame([])).toBeNull();
        expect(pickQuickGame([game("FULL00", 6, 6)])).toBeNull();
        expect(pickQuickGame([game("AAAAAA", 1, 8), game("BBBBBB", 4, 8), game("CCCCCC", 6, 6)])!.code).toBe("BBBBBB");
        // as many waiting: the bigger house
        expect(pickQuickGame([game("AAAAAA", 3, 6), game("BBBBBB", 3, 12)])!.code).toBe("BBBBBB");
    });
});

describe("online: one seat per browser", () => {
    it("a second tab of the same browser can't sit down too", () => {
        const hub = new FakeHub();
        const cast = testCast(8);
        const cards = cast.map((hg) => ({ name: hg.name, imageURL: hg.imageURL }));
        const host = NetSession.hostLobby(hub.join("h"), "TEST", { ...defaultSetup(cast.length), size: 6 }, cards, opts);
        const tab1 = NetSession.join(hub.join("t1"), "TEST", opts);
        const tab2 = NetSession.join(hub.join("t2"), "TEST", opts);
        const other = NetSession.join(hub.join("o"), "TEST", opts);
        hub.flush();
        host.takeSeat({ name: "Host", imageURL: "", castIndex: null }, "host-browser");
        tab1.takeSeat({ name: "Ana", imageURL: "", castIndex: null }, "ana-browser");
        tab2.takeSeat({ name: "Ana Again", imageURL: "", castIndex: null }, "ana-browser");
        other.takeSeat({ name: "Ben", imageURL: "", castIndex: null }, "ben-browser");
        hub.flush();
        expect(host.status$.value.setup!.seats.map((s) => s.name)).toEqual(["Host", "Ana", "Ben"]);
        expect(tab2.status$.value.notice).toContain("one player per browser");
        // the first tab can still change its name
        tab1.takeSeat({ name: "Anna", imageURL: "", castIndex: null }, "ana-browser");
        hub.flush();
        expect(host.status$.value.setup!.seats.map((s) => s.name)).toEqual(["Host", "Anna", "Ben"]);
        // the browser's own device id is never sent out to the others
        expect(JSON.stringify(other.status$.value.setup)).not.toContain("ana-browser");
    });
});
