import { loadPref, prefSubject } from "../prefs/prefs";

// Anonymous play counts, so we can see where people stop playing (which week, which comp) and fix that.
//
// What's sent is a list of counter names, like "week:3" or "comp:maze-runner": no name, no id, no cookie, nothing
// about the device, and nothing that ties one count to another. Our own server (the online relay) adds one to
// each counter for the day and keeps nothing else: see server/relay.js. No third party is involved.
//
// Off in Settings ("Share anonymous play counts"), and off for browsers that ask not to be tracked.

export const shareCounts$ = prefSubject<boolean>("shareCounts", true);

const RELAY_URL = process.env.REACT_APP_RELAY_URL || "wss://api.spotlegame.co.uk/bb-relay";
const FLUSH_MS = 15000;
const MAX_BATCH = 40;
const KEY = /^[a-z0-9:_-]{1,48}$/;

let queue: string[] = [];
let timer: any = null;
// tests can watch what would be sent
let sender: ((url: string, body: string) => void) | null = null;

export function countsUrl(relay: string = RELAY_URL): string {
    return relay.replace(/^ws/, "http").replace(/\/+$/, "") + "/count";
}

function doNotTrack(): boolean {
    try {
        const nav = navigator as any;
        return nav.doNotTrack === "1" || (window as any).doNotTrack === "1" || nav.globalPrivacyControl === true;
    } catch (e) {
        return false;
    }
}

export function countsOn(): boolean {
    if (sender) return shareCounts$.value;
    if (process.env.NODE_ENV === "test") return false;
    try {
        // working on the game itself
        if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return false;
    } catch (e) {
        return false;
    }
    return shareCounts$.value && !doNotTrack();
}

// A counter's name from anything: lower case, and only letters, digits, ":", "_" and "-".
export function counterName(...parts: (string | number)[]): string {
    return parts
        .map((p) =>
            String(p)
                .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
                .toLowerCase()
                .replace(/[^a-z0-9:_-]+/g, "-")
                .replace(/^[-:]+|[-:]+$/g, "")
        )
        .filter(Boolean)
        .join(":")
        .slice(0, 48);
}

// Adds one to each counter (soon: they go out together).
export function count(...keys: string[]) {
    if (!countsOn()) return;
    keys.filter((k) => KEY.test(k)).forEach((k) => queue.length < MAX_BATCH * 5 && queue.push(k));
    if (queue.length >= MAX_BATCH) flushCounts();
    else if (!timer) timer = setTimeout(flushCounts, FLUSH_MS);
}

// Once per page load, or once per season: the same name isn't counted twice.
const once = new Set<string>();
export function countOnce(scope: string, ...keys: string[]) {
    count(...keys.filter((k) => !once.has(`${scope}|${k}`)));
    keys.forEach((k) => once.add(`${scope}|${k}`));
}

export function flushCounts() {
    clearTimeout(timer);
    timer = null;
    if (queue.length === 0) return;
    const body = JSON.stringify({ k: queue.slice(0, MAX_BATCH * 5) });
    queue = [];
    if (!countsOn()) return;
    try {
        if (sender) return sender(countsUrl(), body);
        // text/plain: a "simple" request, so the browser sends it without asking first, and it survives the page closing
        if (navigator.sendBeacon && navigator.sendBeacon(countsUrl(), new Blob([body], { type: "text/plain" }))) return;
        fetch(countsUrl(), { method: "POST", body, headers: { "Content-Type": "text/plain" }, keepalive: true, mode: "no-cors" }).catch(() => {});
    } catch (e) {
        // counts are never worth an error
    }
}

// What the page is doing right now, asked when it closes: that's where the player stopped.
let whereNow: (() => string[]) | null = null;
export function countWhereLeft(where: (() => string[]) | null) {
    whereNow = where;
}

let installed = false;
export function installCounts() {
    if (installed) return;
    installed = true;
    countOnce("page", "visit", loadPref<any>("career", null) ? "visit:returning" : "visit:new");
    try {
        window.addEventListener("pagehide", () => {
            if (whereNow) count(...whereNow());
            flushCounts();
        });
    } catch (e) {
        // fine
    }
}

// Tests: send through this instead (null: back to normal), and forget what's been counted.
export function testCounts(send: ((url: string, body: string) => void) | null) {
    sender = send;
    queue = [];
    once.clear();
    clearTimeout(timer);
    timer = null;
}
