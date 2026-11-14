import { count, counterName, countOnce, countsUrl, flushCounts, shareCounts$, testCounts } from "./analytics";

describe("anonymous play counts", () => {
    let sent: { url: string; keys: string[] }[];
    beforeEach(() => {
        sent = [];
        shareCounts$.next(true);
        testCounts((url, body) => sent.push({ url, keys: JSON.parse(body).k }));
    });
    afterEach(() => testCounts(null));

    it("goes to the relay's count address", () => {
        expect(countsUrl("wss://api.example.com/bb-relay")).toBe("https://api.example.com/bb-relay/count");
        expect(countsUrl("ws://localhost:8787")).toBe("http://localhost:8787/count");
    });

    it("makes tidy counter names", () => {
        expect(counterName("leave:step", "SocialMorning")).toBe("leave:step:social-morning");
        expect(counterName("comp", "maze-runner")).toBe("comp:maze-runner");
        expect(counterName("week", 3)).toBe("week:3");
        expect(counterName("start:cast", 16)).toBe("start:cast:16");
    });

    it("sends counts together, and only names", () => {
        count("visit", "week:3");
        count("comp:maze-runner");
        expect(sent).toEqual([]);
        flushCounts();
        expect(sent.length).toBe(1);
        expect(sent[0].keys).toEqual(["visit", "week:3", "comp:maze-runner"]);
        flushCounts();
        expect(sent.length).toBe(1); // nothing new
    });

    it("drops anything that isn't a plain counter name", () => {
        count("Sam was here", "week:3", "x".repeat(60), "");
        flushCounts();
        expect(sent[0].keys).toEqual(["week:3"]);
    });

    it("counts a thing once per season", () => {
        countOnce("season-1", "start", "week:1");
        countOnce("season-1", "start", "week:2");
        countOnce("season-2", "start");
        flushCounts();
        expect(sent[0].keys).toEqual(["start", "week:1", "week:2", "start"]);
    });

    it("sends nothing when the setting is off", () => {
        shareCounts$.next(false);
        count("visit");
        flushCounts();
        expect(sent).toEqual([]);
        shareCounts$.next(true);
    });
});
