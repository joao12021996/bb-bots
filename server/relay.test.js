// Run with: cd server && npm test
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const WebSocket = require("ws");
const { createRelay, originAllowed, addressOf } = require("./relay");

async function start(options = {}) {
    const relay = createRelay({ port: 0, host: "127.0.0.1", ...options });
    const port = await relay.listen();
    return { relay, port, url: `ws://127.0.0.1:${port}` };
}

// A client that keeps everything it's sent, and can wait for a message.
function client(url, headers = {}) {
    const ws = new WebSocket(url, { headers });
    const inbox = [];
    const waiters = [];
    ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        inbox.push(msg);
        waiters.slice().forEach((w) => w());
    });
    const api = {
        ws,
        inbox,
        open: () => new Promise((resolve, reject) => (ws.once("open", () => resolve(api)), ws.once("error", reject))),
        refused: () =>
            new Promise((resolve) => {
                ws.once("unexpected-response", (_req, res) => resolve(res.statusCode));
                ws.once("error", () => {});
                ws.once("open", () => resolve(0));
            }),
        send: (obj) => ws.send(JSON.stringify(obj)),
        next: (match, ms = 2000) =>
            new Promise((resolve, reject) => {
                const check = () => {
                    const i = inbox.findIndex(match);
                    if (i < 0) return false;
                    const [found] = inbox.splice(i, 1);
                    clearTimeout(timer);
                    waiters.splice(waiters.indexOf(check), 1);
                    resolve(found);
                    return true;
                };
                const timer = setTimeout(() => {
                    waiters.splice(waiters.indexOf(check), 1);
                    reject(new Error("timed out waiting; got " + JSON.stringify(inbox)));
                }, ms);
                waiters.push(check);
                check();
            }),
        closed: () => new Promise((resolve) => (ws.readyState === ws.CLOSED ? resolve() : ws.once("close", resolve))),
    };
    return api;
}

const op = (name) => (m) => m.op === name;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test("origins: our sites and their subdomains only", () => {
    const allowed = [".spotlegame.co.uk", "localhost"];
    assert.ok(originAllowed(undefined, allowed));
    assert.ok(originAllowed("https://spotlegame.co.uk", allowed));
    assert.ok(originAllowed("https://www.spotlegame.co.uk", allowed));
    assert.ok(originAllowed("http://localhost:3000", allowed));
    assert.ok(!originAllowed("https://evil.example", allowed));
    assert.ok(!originAllowed("https://notspotlegame.co.uk", allowed));
    assert.ok(!originAllowed("https://spotlegame.co.uk.evil.example", allowed));
    assert.ok(!originAllowed("not a url", allowed));
});

test("addresses come from the proxy's headers", () => {
    assert.equal(addressOf({ headers: { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }, socket: {} }), "1.1.1.1");
    assert.equal(addressOf({ headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" }, socket: {} }), "2.2.2.2");
    assert.equal(addressOf({ headers: {}, socket: { remoteAddress: "4.4.4.4" } }), "4.4.4.4");
});

test("two devices in a room hear each other, and hear who comes and goes", async () => {
    const { relay, url } = await start();
    const a = await client(url).open();
    a.send({ op: "join", room: "r", id: "a" });
    assert.deepEqual((await a.next(op("welcome"))).peers, []);
    const b = await client(url).open();
    b.send({ op: "join", room: "r", id: "b" });
    assert.deepEqual((await b.next(op("welcome"))).peers, ["a"]);
    assert.equal((await a.next(op("join"))).id, "b");

    a.send({ op: "msg", t: "hello", d: { n: 1 } });
    assert.deepEqual(await b.next(op("msg")), { op: "msg", from: "a", t: "hello", d: { n: 1 } });
    b.send({ op: "msg", to: "a", t: "back", d: null });
    assert.equal((await a.next(op("msg"))).t, "back");

    b.ws.close();
    assert.equal((await a.next(op("leave"))).id, "b");
    assert.equal(relay.health().rooms, 1);
    a.ws.close();
    await a.closed();
    await pause(50);
    assert.equal(relay.health().rooms, 0);
    await relay.close();
});

test("a device that reconnects takes its old place, and its room survives", async () => {
    const { relay, url } = await start();
    const watcher = await client(url).open();
    watcher.send({ op: "join", room: "solo", id: "w" });
    await watcher.next(op("welcome"));
    const a1 = await client(url).open();
    a1.send({ op: "join", room: "solo", id: "a" });
    await a1.next(op("welcome"));
    await watcher.next(op("join"));
    const a2 = await client(url).open();
    a2.send({ op: "join", room: "solo", id: "a" });
    assert.deepEqual((await a2.next(op("welcome"))).peers, ["w"]);
    await a1.closed();
    // the others hear it go and come back (that's when they send it what it missed)
    assert.equal((await watcher.next(op("leave"))).id, "a");
    assert.equal((await watcher.next(op("join"))).id, "a");
    await relay.close();
});

test("a lone device that reconnects keeps its room", async () => {
    const { relay, url } = await start();
    const a1 = await client(url).open();
    a1.send({ op: "join", room: "solo", id: "a" });
    await a1.next(op("welcome"));
    const a2 = await client(url).open();
    a2.send({ op: "join", room: "solo", id: "a" });
    assert.deepEqual((await a2.next(op("welcome"))).peers, []);
    await a1.closed();
    // the room is still the one in the list: a newcomer finds the reconnected device in it
    const b = await client(url).open();
    b.send({ op: "join", room: "solo", id: "b" });
    assert.deepEqual((await b.next(op("welcome"))).peers, ["a"]);
    assert.equal((await a2.next(op("join"))).id, "b");
    assert.equal(relay.health().rooms, 1);
    await relay.close();
});

test("other websites are turned away", async () => {
    const { relay, url } = await start({ allowedOrigins: [".spotlegame.co.uk"] });
    assert.equal(await client(url, { Origin: "https://evil.example" }).refused(), 403);
    const ok = await client(url, { Origin: "https://www.spotlegame.co.uk" }).open();
    ok.ws.close();
    assert.equal(relay.health().refused, 1);
    await relay.close();
});

test("one address can only hold so many connections, and gets them back when they close", async () => {
    const { relay, url } = await start({ maxConnectionsPerIp: 2 });
    const one = await client(url).open();
    const two = await client(url).open();
    assert.equal(await client(url).refused(), 429);
    // someone else is fine
    const other = await client(url, { "X-Forwarded-For": "9.9.9.9" }).open();
    one.ws.close();
    await one.closed();
    await pause(50);
    const three = await client(url).open();
    [two, other, three].forEach((c) => c.ws.close());
    await relay.close();
});

test("one address can only open so many rooms", async () => {
    const { relay, url } = await start({ maxRoomsPerIp: 2 });
    for (const room of ["one", "two"]) {
        const c = await client(url).open();
        c.send({ op: "join", room, id: "x" });
        await c.next(op("welcome"));
    }
    const third = await client(url).open();
    third.send({ op: "join", room: "three", id: "x" });
    assert.equal((await third.next(op("error"))).reason, "too many rooms");
    // joining a room that's already open is always fine
    third.send({ op: "join", room: "one", id: "y" });
    assert.deepEqual((await third.next(op("welcome"))).peers, ["x"]);
    await relay.close();
});

test("listings: capped per address, and only the lister can change one", async () => {
    const { relay, url } = await start({ maxListingsPerIp: 1 });
    const host = await client(url).open();
    host.send({ op: "join", room: "app:room-AAAAAA", id: "host" });
    await host.next(op("welcome"));
    host.send({ op: "list", info: { host: "Sam" } });

    const guest = await client(url).open();
    guest.send({ op: "join", room: "app:room-AAAAAA", id: "guest" });
    await guest.next(op("welcome"));
    guest.send({ op: "list", info: { host: "Hijack" } });
    assert.equal((await guest.next(op("error"))).reason, "already listed");

    const second = await client(url).open();
    second.send({ op: "join", room: "app:room-BBBBBB", id: "host2" });
    await second.next(op("welcome"));
    second.send({ op: "list", info: { host: "Spam" } });
    assert.equal((await second.next(op("error"))).reason, "too many listings");

    const looker = await client(url).open();
    looker.send({ op: "rooms", prefix: "app:room-" });
    assert.deepEqual((await looker.next(op("rooms"))).rooms, [{ room: "app:room-AAAAAA", info: { host: "Sam" } }]);

    // refreshing your own listing is fine
    host.send({ op: "list", info: { host: "Sam", players: 2 } });
    await pause(50);
    looker.send({ op: "rooms", prefix: "app:room-" });
    assert.equal((await looker.next(op("rooms"))).rooms[0].info.players, 2);
    await relay.close();
});

test("a flood is slowed down, then cut off", async () => {
    const { relay, url } = await start({ messageBurst: 5, messagesPerSecond: 0.001, maxStrikes: 2 });
    const a = await client(url).open();
    const b = await client(url).open();
    a.send({ op: "join", room: "r", id: "a" });
    await a.next(op("welcome"));
    b.send({ op: "join", room: "r", id: "b" });
    await b.next(op("welcome"));
    for (let i = 0; i < 20; i++) a.send({ op: "msg", t: "spam", d: i });
    assert.equal((await a.next(op("error"))).reason, "slow down");
    await a.closed();
    // the room hears the flooder leave, and got only what the budget allowed
    assert.equal((await b.next(op("leave"))).id, "a");
    assert.ok(b.inbox.filter(op("msg")).length <= 5);
    assert.equal(relay.health().dropped, 1);
    await relay.close();
});

test("badly formed messages are refused", async () => {
    const { relay, url } = await start();
    const a = await client(url).open();
    a.send({ op: "join", room: "r", id: "a" });
    await a.next(op("welcome"));
    a.send({ op: "msg", t: "x".repeat(100), d: 1 });
    assert.equal((await a.next(op("error"))).reason, "bad message");
    a.send({ op: "msg", d: 1 });
    assert.equal((await a.next(op("error"))).reason, "bad message");
    a.send({ op: "msg", t: "ok", to: 5 });
    assert.equal((await a.next(op("error"))).reason, "bad message");
    await relay.close();
});

test("health says how busy the relay is", async () => {
    const { relay, port, url } = await start();
    const a = await client(url).open();
    a.send({ op: "join", room: "r", id: "a" });
    await a.next(op("welcome"));
    const body = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/bb-relay/health`, (res) => {
            let text = "";
            res.on("data", (c) => (text += c));
            res.on("end", () => resolve(JSON.parse(text)));
        }).on("error", reject);
    });
    assert.equal(body.ok, true);
    assert.equal(body.rooms, 1);
    assert.equal(body.peers, 1);
    assert.equal(body.connections, 1);
    await relay.close();
});

function post(port, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path: "/bb-relay/count", method: "POST", headers: { "Content-Type": "text/plain", ...headers } }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", reject);
        req.end(body);
    });
}

function get(port, path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${path}`, (res) => {
            let text = "";
            res.on("data", (c) => (text += c));
            res.on("end", () => resolve({ status: res.statusCode, text }));
        }).on("error", reject);
    });
}

test("play counts: added up by day, and nothing else is kept", async () => {
    const { relay, port } = await start();
    assert.equal(await post(port, JSON.stringify({ k: ["visit", "week:3", "week:3", "Not A Counter", 7, "x".repeat(60)] })), 204);
    assert.equal(await post(port, "not json"), 400);
    assert.equal(await post(port, JSON.stringify({ k: ["visit"] }), { Origin: "https://evil.example" }), 403);
    const { status, text } = await get(port, "/bb-relay/counts?days=7");
    assert.equal(status, 200);
    const days = JSON.parse(text);
    const day = Object.keys(days)[0];
    assert.deepEqual(days[day], { visit: 1, "week:3": 2 });
    await relay.close();
});

test("play counts: one address can't flood them, and made-up names can't pile up", async () => {
    const { relay, port } = await start({ countPostsPerMinute: 2, maxCountersPerDay: 3 });
    assert.equal(await post(port, JSON.stringify({ k: ["a", "b", "c", "d", "e", "a"] })), 204);
    assert.equal(await post(port, JSON.stringify({ k: ["a"] })), 204);
    assert.equal(await post(port, JSON.stringify({ k: ["a"] })), 429);
    const day = Object.values(relay.readCounts(1))[0];
    assert.deepEqual(day, { a: 3, b: 1, c: 1 });
    await relay.close();
});

test("play counts: kept on disk between restarts, and behind a token when one is set", async () => {
    const dir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "bb-relay-"));
    const first = await start({ dataDir: dir });
    first.relay.addCounts(["visit", "visit"]);
    await first.relay.close();
    const second = await start({ dataDir: dir, statsToken: "secret" });
    assert.deepEqual(Object.values(second.relay.readCounts(1))[0], { visit: 2 });
    assert.equal((await get(second.port, "/bb-relay/counts")).status, 403);
    assert.equal((await get(second.port, "/bb-relay/counts?token=secret")).status, 200);
    await second.relay.close();
    require("fs").rmSync(dir, { recursive: true, force: true });
});
