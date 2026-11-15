import { cartoonFor, cartoonURL, decodeLook, encodeLook, lookFromURL } from "../cartoon/cartoon";

// A finished season as a link: who was in the house, and what happened each week (who won what, who went up, how
// the vote went, who left), down to the jury's vote. Opening the link plays it back, week by week: see
// seasonReplay.tsx. It's the story of the season, not the season itself: nothing in it can be played.
//
// Like a cast link, it has to fit in an address: cartoon faces travel as their look, and photos are left out
// (whoever opens it sees a cartoon made from the name).

const PREFIX = "S1";
const MAX_CAST = 40;
const MAX_WEEKS = 60;

export interface SharedWeek {
    hoh?: number;
    noms: number[];
    pov?: number;
    breaker?: number; // won the Block Breaker
    evicted: number[];
    votes: number[]; // votes to evict each nominee, in `noms` order (empty: not known)
}

export interface SharedSeason {
    cast: { name: string; imageURL: string }[];
    weeks: SharedWeek[];
    placements: number[]; // by houseguest: 1 is the winner
    winner?: number;
    runnerUp?: number;
    jury: [number, number][]; // [juror, the finalist they voted for]
    players: number[]; // the houseguests who were people, not bots
    difficulty?: string;
}

function toBase64Url(text: string): string {
    const binary = unescape(encodeURIComponent(text));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
    return decodeURIComponent(escape(binary));
}

const opt = (n: number | undefined) => (n === undefined ? -1 : n);
const back = (n: any) => (typeof n === "number" && n >= 0 ? n : undefined);

export function encodeSeason(season: SharedSeason): string {
    const data = {
        c: season.cast.slice(0, MAX_CAST).map((p) => {
            const look = lookFromURL(p.imageURL);
            return [p.name, look ? encodeLook(look) : ""];
        }),
        w: season.weeks.slice(0, MAX_WEEKS).map((w) => [opt(w.hoh), w.noms, opt(w.pov), opt(w.breaker), w.evicted, w.votes]),
        p: season.placements,
        f: [opt(season.winner), opt(season.runnerUp)],
        j: season.jury,
        h: season.players,
        d: season.difficulty || "",
    };
    return PREFIX + toBase64Url(JSON.stringify(data));
}

// Reads a code (or a link with one in it). Null if it isn't a season.
export function decodeSeason(input: string): SharedSeason | null {
    const m = input.trim().match(/[?&#]season=([A-Za-z0-9_-]+)/);
    const raw = m ? m[1] : /^[A-Za-z0-9_-]+$/.test(input.trim()) ? input.trim() : null;
    if (!raw || !raw.startsWith(PREFIX)) return null;
    try {
        const data = JSON.parse(fromBase64Url(raw.slice(PREFIX.length)));
        if (!data || !Array.isArray(data.c) || data.c.length < 2 || !Array.isArray(data.w)) return null;
        const cast = data.c.slice(0, MAX_CAST).map((p: any) => {
            const name = String((p && p[0]) || "Houseguest").slice(0, 40);
            const look = p && p[1] ? decodeLook(String(p[1])) : null;
            return { name, imageURL: look ? cartoonURL(look) : cartoonFor(name) };
        });
        const n = cast.length;
        const id = (x: any) => (typeof x === "number" && x >= 0 && x < n && Math.floor(x) === x ? x : undefined);
        const ids = (list: any) => (Array.isArray(list) ? list.map(id).filter((x): x is number => x !== undefined) : []);
        const weeks: SharedWeek[] = data.w.slice(0, MAX_WEEKS).map((w: any) => ({
            hoh: id(back(w[0])),
            noms: ids(w[1]),
            pov: id(back(w[2])),
            breaker: id(back(w[3])),
            evicted: ids(w[4]),
            votes: Array.isArray(w[5]) ? w[5].map((v: any) => Math.max(0, Math.min(99, Math.round(Number(v) || 0)))) : [],
        }));
        const f = Array.isArray(data.f) ? data.f : [];
        return {
            cast,
            weeks,
            placements: cast.map((_: any, i: number) => Math.max(1, Math.min(n, Math.round(Number((data.p || [])[i]) || n)))),
            winner: id(back(f[0])),
            runnerUp: id(back(f[1])),
            jury: (Array.isArray(data.j) ? data.j : [])
                .map((pair: any) => [id(pair && pair[0]), id(pair && pair[1])])
                .filter((pair: any) => pair[0] !== undefined && pair[1] !== undefined) as [number, number][],
            players: ids(data.h),
            difficulty: typeof data.d === "string" && data.d ? data.d.slice(0, 20) : undefined,
        };
    } catch (e) {
        return null;
    }
}

export function seasonLink(code: string): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?season=${code}`;
}

// A `?season=CODE` link: the season in it.
export function seasonFromUrl(): SharedSeason | null {
    try {
        const code = new URLSearchParams(window.location.search).get("season");
        return code ? decodeSeason(code) : null;
    } catch (e) {
        return null;
    }
}

// Who's out of the house going into week `k` (0: the first), and who came back that week: someone evicted earlier
// who's in the week's events again won their way back in (the Battle Back).
export function houseAt(season: SharedSeason, k: number): { out: Set<number>; returned: number[] } {
    const out = new Set<number>();
    let returned: number[] = [];
    for (let i = 0; i <= Math.min(k, season.weeks.length - 1); i++) {
        const w = season.weeks[i];
        const seen = [w.hoh, w.pov, w.breaker, ...w.noms, ...w.evicted].filter((x): x is number => x !== undefined);
        const back = Array.from(new Set(seen.filter((x) => out.has(x))));
        back.forEach((x) => out.delete(x));
        if (i === k) returned = back;
        else w.evicted.forEach((x) => out.add(x));
    }
    if (k >= season.weeks.length) {
        // the finale: everyone but the two finalists is out
        season.cast.forEach((_, i) => {
            if (i !== season.winner && i !== season.runnerUp) out.add(i);
        });
        returned = [];
    }
    return { out, returned };
}
