import { PlayerProfile } from "../model";
import { cartoonFor, cartoonURL, decodeLook, encodeLook, lookFromURL } from "./cartoon";

// A cast as a short code or link, to share with friends: names, cartoon looks, Social and Comp, and any custom
// relationships. Uploaded photos are too big to fit in a link, so whoever opens it gets a cartoon instead.

const PREFIX = "C1";
const MAX_URL = 300; // a picture on the web is kept as its address, if that's short
const MAX_CAST = 40;

type Relationships = { [a: number]: { [b: number]: number } };

export interface SharedCast {
    cast: PlayerProfile[];
    relationships?: Relationships;
}

function toBase64Url(text: string): string {
    // (UTF-8 bytes as a binary string, so names with accents and emoji survive)
    const binary = unescape(encodeURIComponent(text));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
    return decodeURIComponent(escape(binary));
}

function clampStat(n: any): number {
    const x = Math.round(Number(n));
    return isNaN(x) ? 5 : Math.max(1, Math.min(10, x));
}

// Returns the code, and how many photos had to be left out (they'll be cartoons).
export function encodeCast(cast: PlayerProfile[], relationships?: Relationships): { code: string; photosLeftOut: number } {
    let photosLeftOut = 0;
    const people = cast.slice(0, MAX_CAST).map((p) => {
        const look = lookFromURL(p.imageURL);
        let img = "";
        if (look) img = "l" + encodeLook(look);
        else if (/^https?:\/\//.test(p.imageURL) && p.imageURL.length <= MAX_URL) img = "u" + p.imageURL;
        else photosLeftOut++;
        return [p.name, img, clampStat(p.social), clampStat(p.comp)];
    });
    const data: any = { c: people };
    if (relationships) {
        const r: { [k: string]: number } = {};
        Object.keys(relationships).forEach((a) =>
            Object.keys(relationships[Number(a)] || {}).forEach((b) => {
                const v = relationships[Number(a)][Number(b)];
                if (typeof v === "number" && Number(a) < people.length && Number(b) < people.length) r[`${a}.${b}`] = Math.round(v * 100) / 100;
            })
        );
        if (Object.keys(r).length > 0) data.r = r;
    }
    return { code: PREFIX + toBase64Url(JSON.stringify(data)), photosLeftOut };
}

// Reads a code (or a link with one in it). Null if it isn't a cast code.
export function decodeCast(input: string): SharedCast | null {
    const raw = codeIn(input.trim());
    if (!raw || !raw.startsWith(PREFIX)) return null;
    try {
        const data = JSON.parse(fromBase64Url(raw.slice(PREFIX.length)));
        if (!data || !Array.isArray(data.c) || data.c.length === 0) return null;
        const cast: PlayerProfile[] = data.c.slice(0, MAX_CAST).map((p: any) => {
            const name = String((p && p[0]) || "Houseguest").slice(0, 40);
            const img = String(p[1] || "");
            const look = img.startsWith("l") ? decodeLook(img.slice(1)) : null;
            const imageURL = look ? cartoonURL(look) : img.startsWith("uhttp") ? img.slice(1, 1 + MAX_URL) : cartoonFor(name);
            return { name, imageURL, social: clampStat(p[2]), comp: clampStat(p[3]) };
        });
        let relationships: Relationships | undefined;
        if (data.r && typeof data.r === "object") {
            relationships = {};
            Object.keys(data.r).forEach((key) => {
                const [a, b] = key.split(".").map(Number);
                const v = Number(data.r[key]);
                if (!(a >= 0 && a < cast.length && b >= 0 && b < cast.length) || a === b || isNaN(v)) return;
                relationships![a] = relationships![a] || {};
                relationships![a][b] = Math.max(-1, Math.min(1, v));
            });
        }
        return { cast, relationships };
    } catch (e) {
        return null;
    }
}

// The code on its own, from a code or a link (…?cast=CODE).
function codeIn(input: string): string | null {
    const m = input.match(/[?&#]cast=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]+$/.test(input) ? input : null;
}

export function castLink(code: string): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?cast=${code}`;
}

// A `?cast=CODE` link: the cast in it.
export function castFromUrl(): SharedCast | null {
    try {
        const code = new URLSearchParams(window.location.search).get("cast");
        return code ? decodeCast(code) : null;
    } catch (e) {
        return null;
    }
}
