import { clearTitleFlag, notify$, notifyState, setNotifications, tell, turnWatcher } from "./notify";

class FakeNotification {
    static permission = "default";
    static asked = 0;
    static answer = "granted";
    static shown: { title: string; body: string; tag: string }[] = [];
    static requestPermission = async () => {
        FakeNotification.asked++;
        FakeNotification.permission = FakeNotification.answer;
        return FakeNotification.answer;
    };
    onclick: any = null;
    constructor(title: string, options: any) {
        FakeNotification.shown.push({ title, body: options.body, tag: options.tag });
    }
    close() {}
}

function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
}

describe("notifications for slow online seasons", () => {
    beforeEach(() => {
        (window as any).Notification = FakeNotification;
        FakeNotification.permission = "default";
        FakeNotification.asked = 0;
        FakeNotification.answer = "granted";
        FakeNotification.shown = [];
        notify$.next(false);
        document.title = "Houseguest Bots";
        clearTitleFlag();
        setHidden(false);
    });

    it("are off until asked for, and ask the browser once", async () => {
        expect(notifyState()).toBe("off");
        expect(await setNotifications(true)).toBe("on");
        expect(FakeNotification.asked).toBe(1);
        expect(await setNotifications(false)).toBe("off");
        expect(await setNotifications(true)).toBe("on");
        expect(FakeNotification.asked).toBe(1);
    });

    it("stay off when the browser says no", async () => {
        FakeNotification.answer = "denied";
        expect(await setNotifications(true)).toBe("blocked");
        expect(notify$.value).toBe(false);
    });

    it("say nothing while the player is looking at the game", async () => {
        await setNotifications(true);
        expect(tell("Your move", "Vote", "turn")).toBe(false);
        expect(FakeNotification.shown).toEqual([]);
        expect(document.title).toBe("Houseguest Bots");
    });

    it("with the tab in the background: a notification, and a mark in the tab's title until they're back", async () => {
        await setNotifications(true);
        setHidden(true);
        expect(tell("Your move", "It's time to vote", "turn")).toBe(true);
        expect(FakeNotification.shown).toEqual([{ title: "Your move", body: "It's time to vote", tag: "turn" }]);
        expect(document.title).toBe("● Your move · Houseguest Bots");
        clearTitleFlag();
        expect(document.title).toBe("Houseguest Bots");
    });

    it("off: still marks the tab's title, but shows nothing", () => {
        setHidden(true);
        expect(tell("Your move", "Vote", "turn")).toBe(false);
        expect(FakeNotification.shown).toEqual([]);
        expect(document.title).toContain("● Your move");
    });

    it("tells you once per move, not on every redraw", () => {
        const said: string[] = [];
        const w = turnWatcher((title, body) => said.push(`${title}: ${body}`));
        w.update(null, () => "nothing");
        w.update("vote:3", () => "It's time to vote");
        w.update("vote:3", () => "It's time to vote");
        w.update(null, () => "");
        w.update("comp:4", () => "The Veto comp is on");
        expect(said).toEqual(["Your move: It's time to vote", "Your move: The Veto comp is on"]);
    });

    it("tells you about new messages from others, not old ones or your own", () => {
        const said: string[] = [];
        const w = turnWatcher((title, body) => said.push(`${title}: ${body}`));
        const name = (id: number) => `HG${id}`;
        w.chat([{ id: "old", from: 2, text: "from before" }], 1, name);
        w.chat(
            [
                { id: "old", from: 2, text: "from before" },
                { id: "a", from: 2, text: "you there?" },
                { id: "b", from: 1, text: "my own" },
            ],
            1,
            name
        );
        w.chat([{ id: "a", from: 2, text: "you there?" }], 1, name);
        expect(said).toEqual(["HG2: you there?"]);
    });
});
