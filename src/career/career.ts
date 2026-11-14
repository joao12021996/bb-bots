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
    jurySize?: number; // how many jurors the season had (seasons before this was recorded: left out)
}

export interface Achievement {
    id: string;
    emoji: string;
    title: string;
    how: string;
    check: (s: SeasonSummary, career: Career) => boolean;
    // How far along a locked one is: [so far, needed]. Left out: it's all or nothing.
    progress?: (career: Career) => [number, number];
}

const comps = (s: SeasonSummary) => s.hohWins + s.vetoWins + s.lastChanceWins;

// Made the jury (or the final two). Older seasons didn't record the jury's size: half the house, then.
export function madeJury(s: SeasonSummary): boolean {
    return s.placement <= (s.jurySize !== undefined ? s.jurySize + 2 : Math.ceil(s.castSize / 2));
}

const sum = (c: Career, f: (x: SeasonSummary) => number) => c.seasons.reduce((a, x) => a + f(x), 0);
const best = (c: Career, f: (x: SeasonSummary) => number) => c.seasons.reduce((a, x) => Math.max(a, f(x)), 0);
const wonOn = (c: Career) => new Set(c.seasons.filter((x) => x.won).map((x) => x.difficulty)).size;
// the most seasons won in a row
function winStreak(c: Career): number {
    let run = 0;
    let most = 0;
    c.seasons.forEach((x) => {
        run = x.won ? run + 1 : 0;
        most = Math.max(most, run);
    });
    return most;
}

// One season: the most a single season has reached so far.
function inOneSeason(id: string, emoji: string, title: string, how: string, of: (s: SeasonSummary) => number, need: number): Achievement {
    return { id, emoji, title, how, check: (s) => of(s) >= need, progress: (c) => [best(c, of), need] };
}

// A whole career: everything added up.
function overACareer(id: string, emoji: string, title: string, how: string, of: (c: Career) => number, need: number): Achievement {
    return { id, emoji, title, how, check: (_s, c) => of(c) >= need, progress: (c) => [of(c), need] };
}

export const ACHIEVEMENTS: Achievement[] = [
    { id: "first-win", emoji: "🏆", title: "Champion", how: "Win a season.", check: (s) => s.won },
    { id: "finalist", emoji: "🥈", title: "So Close", how: "Make it to the final two.", check: (s) => s.placement <= 2 },
    { id: "jury", emoji: "⚖️", title: "Made the Jury", how: "Last long enough to make the jury, or better.", check: (s) => madeJury(s) },
    { id: "snake", emoji: "🐍", title: "Snake in the Grass", how: "Win a season without winning a single comp.", check: (s) => s.won && comps(s) === 0 },
    { id: "unanimous", emoji: "💯", title: "Unanimous", how: "Win with every jury vote.", check: (s) => s.won && s.juryVotesTotal > 2 && s.juryVotesFor === s.juryVotesTotal },
    inOneSeason("comp-beast", "💪", "Comp Beast", "Win 5 comps in one season.", comps, 5),
    inOneSeason("hoh-3", "👑", "Head Honcho", "Win Head of Household 3 times in one season.", (s) => s.hohWins, 3),
    inOneSeason("veto-3", "🛡️", "Veto King", "Win the Veto 3 times in one season.", (s) => s.vetoWins, 3),
    inOneSeason("survivor", "🧗", "Cockroach", "Survive the block 4 times in one season.", (s) => s.survivedBlock, 4),
    { id: "floater", emoji: "🎈", title: "Floater", how: "Make the final four without winning a comp or ever being nominated.", check: (s) => s.placement <= 4 && comps(s) === 0 && s.nominated === 0 },
    { id: "backstab", emoji: "🔪", title: "Et Tu?", how: "Betray an ally.", check: (s) => s.backstabs >= 1 },
    { id: "honest", emoji: "😇", title: "Word Is Bond", how: "Make the final three, keeping every promise (at least 3 of them).", check: (s) => s.placement <= 3 && s.brokePromises === 0 && s.keptPromises >= 3 },
    inOneSeason("big-moves", "💣", "Big Mover", "Make 3 big moves in one season.", (s) => s.bigMoves, 3),
    { id: "showmance", emoji: "💘", title: "Showmance", how: "Fall for someone in the house.", check: (s) => s.showmance },
    { id: "comeback", emoji: "🔁", title: "Comeback Kid", how: "Win the Battle Back and return to the house.", check: (s) => s.cameBack },
    { id: "hard-win", emoji: "😤", title: "Hard Won", how: "Win on Hard or Cutthroat.", check: (s) => s.won && (s.difficulty === "hard" || s.difficulty === "cutthroat") },
    { id: "cutthroat-win", emoji: "😈", title: "Cutthroat Champion", how: "Win on Cutthroat, the hardest difficulty.", check: (s) => s.won && s.difficulty === "cutthroat" },
    { id: "big-house", emoji: "🏟️", title: "Last of Sixteen", how: "Win a season with 16 or more houseguests.", check: (s) => s.won && s.castSize >= 16 },
    { id: "online", emoji: "🌐", title: "Online", how: "Finish an online season.", check: (s) => s.online },
    { id: "first-boot", emoji: "🥾", title: "First Boot", how: "Be the first one evicted. It happens.", check: (s) => s.placement === s.castSize },
    // one season, harder
    { id: "triple-crown", emoji: "🎪", title: "Triple Crown", how: "Win a Head of Household, a Veto and a Block Breaker in one season.", check: (s) => s.hohWins > 0 && s.vetoWins > 0 && s.lastChanceWins > 0 },
    { id: "untouchable", emoji: "🧊", title: "Untouchable", how: "Win a season without ever being nominated.", check: (s) => s.won && s.nominated === 0 },
    { id: "underdog", emoji: "🐕", title: "Underdog", how: "Win a season after sitting on the block 3 times or more.", check: (s) => s.won && s.nominated >= 3 },
    { id: "back-from-the-dead", emoji: "🧟", title: "Back from the Dead", how: "Get evicted, come back, and win the season.", check: (s) => s.won && s.cameBack },
    { id: "clean-hands", emoji: "🧼", title: "Clean Hands", how: "Win a season without betraying an ally or breaking a promise.", check: (s) => s.won && s.backstabs === 0 && s.brokePromises === 0 },
    { id: "villain", emoji: "🦹", title: "Villain Edit", how: "Betray 3 allies in one season, and still make the final two.", check: (s) => s.backstabs >= 3 && s.placement <= 2 },
    inOneSeason("joiner", "🤝", "Joiner", "Be in 3 alliances in one season.", (s) => s.alliances, 3),
    { id: "online-win", emoji: "📡", title: "Beat Your Friends", how: "Win an online season with at least 3 players in it.", check: (s) => s.won && s.online && s.players >= 3 },
    // a whole career
    overACareer("veteran", "🎖️", "Veteran", "Play 10 seasons.", (c) => c.seasons.length, 10),
    overACareer("lifer", "🛋️", "Part of the Furniture", "Play 25 seasons.", (c) => c.seasons.length, 25),
    overACareer("dynasty", "👑", "Dynasty", "Win 5 seasons.", (c) => c.seasons.filter((x) => x.won).length, 5),
    overACareer("legend", "🌟", "Legend", "Win 10 seasons.", (c) => c.seasons.filter((x) => x.won).length, 10),
    overACareer("back-to-back", "🔂", "Back to Back", "Win 2 seasons in a row.", winStreak, 2),
    overACareer("bridesmaid", "💐", "Always the Bridesmaid", "Finish second 3 times.", (c) => c.seasons.filter((x) => x.placement === 2).length, 3),
    overACareer("every-level", "🎚️", "Any Way You Like", "Win on all four difficulties.", wonOn, 4),
    overACareer("trophy-shelf", "🗄️", "Trophy Shelf", "Win 25 comps.", (c) => sum(c, comps), 25),
    overACareer("trophy-room", "🏛️", "Trophy Room", "Win 100 comps.", (c) => sum(c, comps), 100),
    overACareer("hoh-10", "🛏️", "Room Service", "Win Head of Household 10 times.", (c) => sum(c, (x) => x.hohWins), 10),
    overACareer("veto-10", "🧲", "Veto Collector", "Win the Veto 10 times.", (c) => sum(c, (x) => x.vetoWins), 10),
    overACareer("block-10", "🪑", "Regular on the Block", "Survive the block 10 times.", (c) => sum(c, (x) => x.survivedBlock), 10),
    overACareer("promises-20", "📜", "Good as Gold", "Keep 20 promises.", (c) => sum(c, (x) => x.keptPromises), 20),
    overACareer("backstab-10", "🗡️", "Serial Backstabber", "Betray 10 allies.", (c) => sum(c, (x) => x.backstabs), 10),
    overACareer("jury-10", "🏠", "Jury House Regular", "Make the jury (or better) 10 times.", (c) => c.seasons.filter(madeJury).length, 10),
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

// Achievements added to the game after a season was played: unlocks the ones past seasons already earned (dated
// to the season that earned them). Returns how many.
export function catchUpAchievements(): number {
    const career = loadCareer();
    let found = 0;
    career.seasons.forEach((season, i) => {
        const then: Career = { seasons: career.seasons.slice(0, i + 1), unlocked: career.unlocked };
        ACHIEVEMENTS.forEach((a) => {
            if (career.unlocked[a.id] || !a.check(season, then)) return;
            career.unlocked[a.id] = { when: season.when, season: season.key };
            found++;
        });
    });
    if (found > 0) savePref(KEY, career);
    return found;
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
        juries: s.filter(madeJury).length,
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
