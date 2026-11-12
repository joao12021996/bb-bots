import { loadPref, savePref } from "../prefs/prefs";

// A player's career on this device: every season they finished, their totals, and their achievements.

export interface SeasonSummary {
    key: string; // the season (its seed) and the player: recorded once
    when: number; // timestamp
    name: string;
    imageURL?: string;
    placement: number;
    castSize: number;
    won: boolean;
    hohWins: number;
    vetoWins: number;
    lastChanceWins: number;
    nominated: number;
    survivedBlock: number;
    juryVotesFor: number; // finalists only
    juryVotesTotal: number;
    backstabs: number; // allies they betrayed
    bigMoves: number;
    brokePromises: number;
    keptPromises: number;
    alliances: number;
    showmance: boolean;
    cameBack: boolean; // won the Battle Back
    difficulty: string;
    online: boolean;
    players: number; // humans in the season
    highlight?: string; // their biggest move
}

export interface Achievement {
    id: string;
    emoji: string;
    title: string;
    how: string;
    check: (s: SeasonSummary, career: Career) => boolean;
}

const comps = (s: SeasonSummary) => s.hohWins + s.vetoWins + s.lastChanceWins;

export const ACHIEVEMENTS: Achievement[] = [
    { id: "first-win", emoji: "🏆", title: "Champion", how: "Win a season.", check: (s) => s.won },
    { id: "finalist", emoji: "🥈", title: "So Close", how: "Make it to the final two.", check: (s) => s.placement <= 2 },
    { id: "jury", emoji: "⚖️", title: "Made the Jury", how: "Last long enough to make the jury, or better.", check: (s) => s.placement <= Math.ceil(s.castSize / 2) },
    { id: "snake", emoji: "🐍", title: "Snake in the Grass", how: "Win a season without winning a single comp.", check: (s) => s.won && comps(s) === 0 },
    { id: "unanimous", emoji: "💯", title: "Unanimous", how: "Win with every jury vote.", check: (s) => s.won && s.juryVotesTotal > 2 && s.juryVotesFor === s.juryVotesTotal },
    { id: "comp-beast", emoji: "💪", title: "Comp Beast", how: "Win 5 comps in one season.", check: (s) => comps(s) >= 5 },
    { id: "hoh-3", emoji: "👑", title: "Head Honcho", how: `Win Head of House 3 times in one season.`, check: (s) => s.hohWins >= 3 },
    { id: "veto-3", emoji: "🛡️", title: "Veto King", how: "Win the Veto 3 times in one season.", check: (s) => s.vetoWins >= 3 },
    { id: "survivor", emoji: "🧗", title: "Cockroach", how: "Survive the block 4 times in one season.", check: (s) => s.survivedBlock >= 4 },
    { id: "floater", emoji: "🎈", title: "Floater", how: "Make the final four without winning a comp or ever being nominated.", check: (s) => s.placement <= 4 && comps(s) === 0 && s.nominated === 0 },
    { id: "backstab", emoji: "🔪", title: "Et Tu?", how: "Betray an ally.", check: (s) => s.backstabs >= 1 },
    { id: "honest", emoji: "😇", title: "Word Is Bond", how: "Make the final three, keeping every promise (at least 3 of them).", check: (s) => s.placement <= 3 && s.brokePromises === 0 && s.keptPromises >= 3 },
    { id: "big-moves", emoji: "💣", title: "Big Mover", how: "Make 3 big moves in one season.", check: (s) => s.bigMoves >= 3 },
    { id: "showmance", emoji: "💘", title: "Showmance", how: "Fall for someone in the house.", check: (s) => s.showmance },
    { id: "comeback", emoji: "🔁", title: "Comeback Kid", how: "Win the Battle Back and return to the house.", check: (s) => s.cameBack },
    { id: "hard-win", emoji: "😈", title: "Cutthroat Champion", how: "Win on the hardest difficulty.", check: (s) => s.won && (s.difficulty === "hard" || s.difficulty === "cutthroat") },
    { id: "big-house", emoji: "🏟️", title: "Last of Sixteen", how: "Win a season with 16 or more houseguests.", check: (s) => s.won && s.castSize >= 16 },
    { id: "online", emoji: "🌐", title: "Online", how: "Finish an online season.", check: (s) => s.online },
    { id: "first-boot", emoji: "🥾", title: "First Boot", how: "Be the first one evicted. It happens.", check: (s) => s.placement === s.castSize },
    { id: "veteran", emoji: "🎖️", title: "Veteran", how: "Play 10 seasons.", check: (_s, c) => c.seasons.length >= 10 },
    { id: "dynasty", emoji: "👑", title: "Dynasty", how: "Win 5 seasons.", check: (_s, c) => c.seasons.filter((x) => x.won).length >= 5 },
];

export interface Career {
    seasons: SeasonSummary[];
    unlocked: { [id: string]: { when: number; season: string } };
}

const KEY = "career";
const MAX_SEASONS = 200;

export function loadCareer(): Career {
    const c = loadPref<Career>(KEY, { seasons: [], unlocked: {} });
    return { seasons: c.seasons || [], unlocked: c.unlocked || {} };
}

export function resetCareer() {
    savePref(KEY, { seasons: [], unlocked: {} });
}

// Records a finished season (once). Returns the achievements it unlocked.
export function recordSeason(summary: SeasonSummary): Achievement[] {
    const career = loadCareer();
    if (career.seasons.some((s) => s.key === summary.key)) return [];
    career.seasons = [...career.seasons, summary].slice(-MAX_SEASONS);
    const fresh = ACHIEVEMENTS.filter((a) => !career.unlocked[a.id] && a.check(summary, career));
    fresh.forEach((a) => (career.unlocked[a.id] = { when: summary.when, season: summary.key }));
    savePref(KEY, career);
    return fresh;
}

export interface Totals {
    seasons: number;
    wins: number;
    finals: number;
    juries: number;
    comps: number;
    hoh: number;
    veto: number;
    nominated: number;
    bestFinish: number | null;
    averageFinish: number | null;
    winRate: number;
}

export function totals(career: Career): Totals {
    const s = career.seasons;
    const sum = (f: (x: SeasonSummary) => number) => s.reduce((a, x) => a + f(x), 0);
    return {
        seasons: s.length,
        wins: s.filter((x) => x.won).length,
        finals: s.filter((x) => x.placement <= 2).length,
        juries: s.filter((x) => x.placement <= Math.ceil(x.castSize / 2)).length,
        comps: sum(comps),
        hoh: sum((x) => x.hohWins),
        veto: sum((x) => x.vetoWins),
        nominated: sum((x) => x.nominated),
        bestFinish: s.length ? Math.min(...s.map((x) => x.placement)) : null,
        averageFinish: s.length ? Math.round((sum((x) => x.placement) / s.length) * 10) / 10 : null,
        winRate: s.length ? s.filter((x) => x.won).length / s.length : 0,
    };
}

export function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
