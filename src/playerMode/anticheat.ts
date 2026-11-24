import React from "react";
import { CompDefinition, RoundData, SimContext } from "./comps/compTypes";

// Catching cheaters, online and offline alike (so nobody can try it out safely first). Anyone caught is expelled
// on the spot, in front of everyone (see the controller's ruleBreak). Only things no human can do count: a false
// alarm would throw a real player out of their season.

export type CheatReason = "inspect" | "fakeClicks" | "autoClicker" | "reaction" | "fakeScore";
export const CHEAT_REASONS: CheatReason[] = ["inspect", "fakeClicks", "autoClicker", "reaction", "fakeScore"];

export function isCheatReason(x: unknown): x is CheatReason {
    return typeof x === "string" && (CHEAT_REASONS as string[]).includes(x);
}

// What everyone is told.
export function cheatLine(name: string, reason: CheatReason): string {
    switch (reason) {
        case "inspect":
            return `🚨 ${name} opened the inspect tools in the middle of the game. That's against the rules.`;
        case "fakeClicks":
            return `🚨 ${name} was caught using a script to click for them.`;
        case "autoClicker":
            return `🚨 ${name} was caught using an auto-clicker: nobody clicks that fast, or that evenly.`;
        case "reaction":
            return `🚨 ${name} reacted faster than any human can, every single time.`;
        case "fakeScore":
            return `🚨 ${name} handed in a comp score that can't be real.`;
    }
}

// The same, in a few words (the season's record).
export const CHEAT_SHORT: { [r in CheatReason]: string } = {
    inspect: "opened the inspect tools",
    fakeClicks: "scripted clicks",
    autoClicker: "an auto-clicker",
    reaction: "impossible reactions",
    fakeScore: "a fake comp score",
};

// ---------- clicks ----------

export const RATE_WINDOW_MS = 3000;
export const MAX_CLICKS_PER_SECOND = 30; // fast clickers manage 15 to 20 a second, in short bursts
export const RHYTHM_CLICKS = 40; // this many clicks in a row...
export const RHYTHM_SPREAD_MS = 2; // ...whose gaps never vary by more than this: a machine
const RHYTHM_FASTEST_GAP_MS = 400; // only rapid clicking counts (a slow, steady tapper is fine)

// Watches one player's clicks and taps during a comp. `press` is a finger or mouse button going down.
export class ClickJudge {
    private presses: number[] = [];

    // A click or press. `trusted`: the browser says a real person made it (scripts' clicks aren't).
    public event(trusted: boolean, target?: EventTarget | null): CheatReason | null {
        if (trusted) return null;
        // the game's own download and upload links click themselves, and the browser passes a label's click on to
        // its box: no comp is played with either
        const el = target as HTMLElement | null;
        if (el && el.tagName && ["A", "INPUT", "SELECT", "OPTION", "LABEL", "TEXTAREA"].includes(el.tagName)) return null;
        return "fakeClicks";
    }

    public press(at: number): CheatReason | null {
        this.presses.push(at);
        if (this.presses.length > 200) this.presses.splice(0, this.presses.length - 200);
        const recent = this.presses.filter((t) => t > at - RATE_WINDOW_MS);
        if (recent.length > (MAX_CLICKS_PER_SECOND * RATE_WINDOW_MS) / 1000) return "autoClicker";
        if (this.presses.length > RHYTHM_CLICKS) {
            const last = this.presses.slice(-(RHYTHM_CLICKS + 1));
            const gaps = last.slice(1).map((t, i) => t - last[i]);
            const lo = Math.min(...gaps);
            const hi = Math.max(...gaps);
            if (hi <= RHYTHM_FASTEST_GAP_MS && hi - lo <= RHYTHM_SPREAD_MS) return "autoClicker";
        }
        return null;
    }
}

// Watching the page while a comp is played. Never while testing, or working on the game itself.
export function useClickWatch(active: boolean, playerId: number) {
    React.useEffect(() => {
        if (!active || !watching()) return;
        const judge = new ClickJudge();
        let caught = false;
        const catchIt = (reason: CheatReason | null) => {
            if (!reason || caught) return;
            caught = true;
            reportCheat(reason, playerId);
        };
        const onClick = (e: Event) => catchIt(judge.event(e.isTrusted, e.target));
        const onPress = (e: Event) => catchIt(judge.event(e.isTrusted, e.target) || (e.isTrusted ? judge.press(e.timeStamp || performance.now()) : null));
        window.addEventListener("click", onClick, true);
        window.addEventListener("pointerdown", onPress, true);
        return () => {
            window.removeEventListener("click", onClick, true);
            window.removeEventListener("pointerdown", onPress, true);
        };
    }, [active, playerId]);
}

function watching(): boolean {
    if (process.env.NODE_ENV === "test") return false;
    return !["localhost", "127.0.0.1"].includes(window.location.hostname);
}

// ---------- scores ----------

// Faster than any human, on average across every round (people need about 150 ms at the very best).
export const FASTEST_HUMAN_MS = 100;

// Whether a comp score handed in could be real. `elapsedMs`: how long since they started, when known.
export function scoreProblem(comp: CompDefinition, score: unknown, rounds: RoundData, ctx: SimContext, elapsedMs?: number): CheatReason | null {
    if (typeof score !== "number" || !Number.isFinite(score)) return "fakeScore";
    if (comp.kind === "endurance") {
        // scored in seconds lasted
        if (score < 0 || score > comp.maxSeconds + 1) return "fakeScore";
        if (elapsedMs !== undefined && score > elapsedMs / 1000 + 2) return "fakeScore";
    }
    if (comp.cheatCheck) {
        const r = comp.cheatCheck(rounds);
        if (r) return r;
    }
    if (comp.exactProgress && comp.progress) {
        const n = Math.max(rounds.answers ? rounds.answers.length : 0, rounds.picks ? rounds.picks.length : 0);
        if (n > 0) {
            try {
                if (score > comp.progress(rounds, n, ctx) + 1) return "fakeScore";
            } catch (e) {
                return "fakeScore"; // answers that make no sense
            }
        }
    }
    return null;
}

// ---------- reporting ----------

type Handler = (reason: CheatReason, playerId?: number) => void;
let handler: Handler | null = null;

// The game screen deals with cheaters (online: tells everyone; offline: expels them there and then).
export function onCheat(h: Handler | null) {
    handler = h;
}

// Whether anyone dealt with it (practice comps, outside a season, don't).
export function reportCheat(reason: CheatReason, playerId?: number): boolean {
    if (!handler) return false;
    handler(reason, playerId);
    return true;
}

// ---------- the mark it leaves ----------

const MARK_KEY = "bbb-caught-cheating";
const MARK_DAYS = 7;

// Caught on this browser: for the next week, the lobbies show it.
export function markCheater() {
    try {
        window.localStorage.setItem(MARK_KEY, String(Date.now() + MARK_DAYS * 24 * 3600 * 1000));
    } catch (e) {}
}

export function isMarkedCheater(): boolean {
    try {
        return Number(window.localStorage.getItem(MARK_KEY) || 0) > Date.now();
    } catch (e) {
        return false;
    }
}

// ---------- one seat per browser ----------

const DEVICE_KEY = "bbb-device";

// The same in every tab and window of this browser, so one person can't take two seats in a game.
export function browserDevice(): string | undefined {
    if (process.env.NODE_ENV === "test") return undefined;
    try {
        let id = window.localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = Math.random().toString(36).slice(2) + Date.now().toString(36);
            window.localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch (e) {
        return undefined;
    }
}
