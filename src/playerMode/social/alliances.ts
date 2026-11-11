import { GameState, getById, getSocial, Houseguest, MutableGameState, nonEvictedHouseguests } from "../../model";
import { GoldenVeto } from "../../components/episode/veto/veto";
import { castEvictionVote, HouseguestWithLogic } from "../../utils/ai/aiApi";
import { rng } from "../../utils";
import { shiftRelationship, socialFactor } from "./relationships";

// Alliances: named groups of houseguests (bots and players) who agree on targets and protect each other.
// Chemistry (0 to 1) is how well the alliance gets along. It rises when the alliance agrees on a target
// and falls when it doesn't, or when someone backstabs it. Bots in high-chemistry alliances stay loyal.

export interface Alliance {
    id: number;
    name: string;
    memberIds: number[];
    chemistry: number;
    formedWeek: number;
    target?: number; // agreed at the latest alliance meeting
    targetWeek?: number;
    backup?: number; // plan B, if the target comes off the block (a used veto, a Last Chance comp)
    backupSuggestions?: { [memberId: number]: number | null }; // players' plan B picks this social block
    suggestions: { [memberId: number]: number | null }; // players' suggestions in the current social block
    met: boolean; // has met in the current social block
    positions?: { [memberId: number]: number | null }; // where everyone stood when the meeting ended
    discussed?: boolean; // a split meeting has already been talked out
}

export interface AllianceBook {
    alliances: Alliance[];
    nextId: number;
}

export function emptyBook(): AllianceBook {
    return { alliances: [], nextId: 1 };
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

const NAMES = [
    "The Outsiders",
    "Final Four",
    "The Brigade",
    "The Cookout",
    "Night Owls",
    "The Hive",
    "Late Night Crew",
    "The Committee",
    "Kitchen Cabinet",
    "The Silent Few",
    "Sunrise Squad",
    "Backyard Bandits",
    "The Vault",
    "Pool Party",
    "The Lighthouse",
    "Snake Pit",
    "The Underdogs",
    "Diamond Club",
    "The Wolfpack",
    "Hammock Club",
    "The Treehouse",
    "Couch Kings",
    "The Ring",
    "Have-Nots United",
    "The Inner Circle",
    "Plan B",
    "The Foundation",
    "Midnight Oil",
    "The Majority",
    "Secret Six",
];

export function randomAllianceName(book: AllianceBook): string {
    const used = new Set(book.alliances.map((a) => a.name));
    const free = NAMES.filter((n) => !used.has(n));
    if (free.length > 0) return free[rng().randomInt(0, free.length - 1)];
    return `Alliance #${book.nextId}`;
}

// A name suggestion for the UI (not seeded: it doesn't affect the game).
export function suggestAllianceName(book: AllianceBook): string {
    const used = new Set(book.alliances.map((a) => a.name));
    const free = NAMES.filter((n) => !used.has(n));
    return free.length > 0 ? free[Math.floor(Math.random() * free.length)] : "";
}

export function cleanName(name: string, book: AllianceBook): string {
    const trimmed = name.trim().slice(0, 30);
    return trimmed || randomAllianceName(book);
}

export function aliveMembers(gs: GameState, a: Alliance): Houseguest[] {
    return a.memberIds.map((id) => getById(gs, id)).filter((hg) => hg && !hg.isEvicted);
}

export function getAlliance(book: AllianceBook, id: number): Alliance | undefined {
    return book.alliances.find((a) => a.id === id);
}

export function alliancesOf(book: AllianceBook, id: number): Alliance[] {
    return book.alliances.filter((a) => a.memberIds.includes(id));
}

// Everyone `id` shares an alliance with.
export function alliesOf(book: AllianceBook, id: number): Set<number> {
    const allies = new Set<number>();
    alliancesOf(book, id).forEach((a) => a.memberIds.forEach((m) => m !== id && allies.add(m)));
    return allies;
}

// The highest chemistry among the alliances `a` and `b` share, or -1 if they share none.
function sharedChemistry(book: AllianceBook, a: number, b: number): number {
    return alliancesOf(book, a)
        .filter((al) => al.memberIds.includes(b))
        .reduce((best, al) => Math.max(best, al.chemistry), -1);
}

function sameMembers(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((id) => b.includes(id));
}

// Alliances have no size limit. Bots just won't grow one to the whole house: an alliance needs someone
// outside it to go after.
export function botAllianceCap(gs: GameState): number {
    return Math.max(2, gs.remainingPlayers - 1);
}

export function chemistryLabel(chemistry: number): { label: string; emoji: string } {
    if (chemistry >= 0.75) return { label: "Rock solid", emoji: "🔥" };
    if (chemistry >= 0.5) return { label: "Solid", emoji: "🙂" };
    if (chemistry >= 0.25) return { label: "Shaky", emoji: "😬" };
    return { label: "Falling apart", emoji: "💔" };
}

function averageRelationship(gs: GameState, ids: number[]): number {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
            sum += getById(gs, ids[i]).relationships[ids[j]];
            n++;
        }
    return n === 0 ? 0 : sum / n;
}

// Creates an alliance (or returns the existing one with exactly these members).
export function createAlliance(gs: MutableGameState, book: AllianceBook, memberIds: number[], name: string): Alliance {
    const existing = book.alliances.find((a) => sameMembers(a.memberIds, memberIds));
    if (existing) return existing;
    const alliance: Alliance = {
        id: book.nextId++,
        name: cleanName(name, book),
        memberIds: [...memberIds],
        chemistry: clamp(0.5 + 0.3 * averageRelationship(gs, memberIds), 0.25, 0.85),
        formedWeek: gs.phase,
        suggestions: {},
        met: false,
    };
    book.alliances.push(alliance);
    // forming an alliance brings people closer
    for (let i = 0; i < memberIds.length; i++)
        for (let j = i + 1; j < memberIds.length; j++) shiftRelationship(gs, memberIds[i], memberIds[j], 0.1);
    return alliance;
}

export function addMember(gs: MutableGameState, alliance: Alliance, id: number) {
    if (alliance.memberIds.includes(id)) return;
    alliance.memberIds.forEach((m) => shiftRelationship(gs, m, id, 0.08));
    alliance.memberIds.push(id);
}

// Drops evicted members and alliances that are down to one person. Returns the names of disbanded alliances.
export function pruneAlliances(gs: GameState, book: AllianceBook): Alliance[] {
    const gone: Alliance[] = [];
    book.alliances.forEach((a) => (a.memberIds = a.memberIds.filter((id) => getById(gs, id) && !getById(gs, id).isEvicted)));
    // alliances whose members are now the same merge into the strongest one
    const seen = new Map<string, Alliance>();
    [...book.alliances]
        .sort((x, y) => y.chemistry - x.chemistry)
        .forEach((a) => {
            const key = [...a.memberIds].sort((x, y) => x - y).join(",");
            if (seen.has(key)) a.memberIds = [];
            else seen.set(key, a);
        });
    book.alliances = book.alliances.filter((a) => {
        const keep = a.memberIds.length >= 2 && a.chemistry > 0;
        if (!keep) gone.push(a);
        return keep;
    });
    return gone;
}

// How likely a bot is to stay loyal to an ally this time.
export function loyalty(gs: GameState, book: AllianceBook, botId: number, allyId: number): number {
    const chem = sharedChemistry(book, botId, allyId);
    if (chem < 0) return 0;
    return clamp(0.4 + 0.5 * chem + 0.25 * getById(gs, botId).relationships[allyId], 0.05, 0.98);
}

// Who a bot wants the alliance to go after: the top of its hit list, outside the alliance.
// After the veto, `block` is the nominees: the target has to be one of them, even an alliance member if
// that's who's left. A bot on the block suggests someone else on it.
export function botSuggestion(gs: GameState, a: Alliance, botId: number, block?: number[], exclude: number[] = []): number | null {
    const bot = getById(gs, botId);
    if (block && block.length > 0) {
        const options = block.filter((id) => id !== botId && getById(gs, id) && !getById(gs, id).isEvicted);
        if (options.length === 0) return null;
        // the nominee they like least, with allies a last resort. The plan already agreed (plan B, if it kicked in) holds.
        const planned = (id: number) => a.target === id && a.targetWeek === gs.phase;
        const cost = (id: number) => bot.relationships[id] + (a.memberIds.includes(id) ? 0.6 : 0) - (planned(id) ? 0.5 : 0);
        return [...options].sort((x, y) => cost(x) - cost(y))[0];
    }
    const entry = bot.hitList.find(
        (e) => e.id !== botId && !exclude.includes(e.id) && !a.memberIds.includes(e.id) && getById(gs, e.id) && !getById(gs, e.id).isEvicted
    );
    return entry ? entry.id : null;
}

// A bot's plan B: the next name on its hit list (outside the alliance), or after the veto, whoever else is on the block.
export function botBackup(gs: GameState, a: Alliance, botId: number, primary: number | null, block?: number[], exclude: number[] = []): number | null {
    const bot = getById(gs, botId);
    const ok = (id: number) => id !== botId && id !== primary && !exclude.includes(id) && getById(gs, id) && !getById(gs, id).isEvicted;
    if (block && block.length > 0) {
        const options = block.filter(ok);
        if (options.length === 0) return null;
        const cost = (id: number) => bot.relationships[id] + (a.memberIds.includes(id) ? 0.6 : 0);
        return [...options].sort((x, y) => cost(x) - cost(y))[0];
    }
    const entry = bot.hitList.find((e) => ok(e.id) && !a.memberIds.includes(e.id));
    return entry ? entry.id : null;
}

// The target is off the block (the veto, a Last Chance comp): alliances whose plan B is on it switch to plan B.
export function fallBackToPlanB(gs: GameState, book: AllianceBook, block: number[]): { alliance: Alliance; from: number; to: number }[] {
    const switched: { alliance: Alliance; from: number; to: number }[] = [];
    book.alliances.forEach((a) => {
        if (a.target === undefined || a.targetWeek !== gs.phase || block.includes(a.target)) return;
        if (a.backup === undefined || !block.includes(a.backup) || getById(gs, a.backup).isEvicted) return;
        switched.push({ alliance: a, from: a.target, to: a.backup });
        a.target = a.backup;
        a.backup = undefined;
    });
    return switched;
}

export interface MeetingResult {
    backupId?: number | null;
    targetId: number | null;
    lines: string[]; // what happened, from the alliance's point of view
    chemistryChange: number;
}

// An alliance meeting: everyone suggests a target, the persuasive (high Social) members try to win the others
// over, and the alliance goes with the most influential pick. Disagreement costs chemistry.
export function holdMeeting(gs: MutableGameState, a: Alliance, humanIds: number[], block?: number[], exclude: number[] = []): MeetingResult {
    const members = aliveMembers(gs, a);
    const name = (id: number) => getById(gs, id).name;
    const isHuman = (id: number) => humanIds.includes(id);
    const sugg: { [id: number]: number | null } = {};
    members.forEach((m) => {
        let pick = isHuman(m.id) ? (a.suggestions[m.id] === undefined ? null : a.suggestions[m.id]) : botSuggestion(gs, a, m.id, block, exclude);
        if (pick !== null && exclude.includes(pick)) pick = null;
        if (block && block.length > 0 && pick !== null && !block.includes(pick)) pick = null; // only the block counts now
        sugg[m.id] = pick;
    });
    const lines: string[] = [];

    // persuasion: the most social members make their case first. Players' minds are their own.
    const persuaders = [...members].sort((x, y) => getSocial(y) - getSocial(x));
    const swayedBy: { [id: number]: number } = {};
    members
        .filter((m) => !isHuman(m.id))
        .forEach((bot) => {
            for (const p of persuaders) {
                const pick = sugg[p.id];
                if (p.id === bot.id || pick === null || pick === sugg[bot.id]) continue;
                const pSway = clamp(
                    -0.1 + 0.06 * getSocial(p) + 0.3 * bot.relationships[p.id] - 0.4 * Math.max(0, bot.relationships[pick]),
                    0.02,
                    0.9
                );
                if (rand() < pSway) {
                    sugg[bot.id] = pick;
                    swayedBy[bot.id] = p.id;
                    break;
                }
            }
        });

    // weighted vote: Social is influence
    const weights: { [target: number]: number } = {};
    members.forEach((m) => {
        const pick = sugg[m.id];
        if (pick !== null) weights[pick] = (weights[pick] || 0) + socialFactor(m);
    });
    const ranked = Object.keys(weights)
        .map(Number)
        .sort((x, y) => weights[y] - weights[x]);
    const targetId = ranked.length > 0 ? ranked[0] : null;

    let chemistryChange = 0;
    if (targetId === null) {
        lines.push(`${a.name} couldn't settle on a target.`);
    } else {
        const voters = members.filter((m) => sugg[m.id] !== null);
        const agree = voters.filter((m) => sugg[m.id] === targetId);
        const disagreement = 1 - agree.length / voters.length;
        members.forEach((m) => {
            if (swayedBy[m.id] !== undefined && sugg[m.id] === targetId) {
                lines.push(`${name(swayedBy[m.id])} talked ${m.name} into going after ${name(targetId)}.`);
            } else if (swayedBy[m.id] !== undefined) {
                lines.push(`${name(swayedBy[m.id])} talked ${m.name} into going after ${name(sugg[m.id]!)}.`);
            }
        });
        voters
            .filter((m) => sugg[m.id] !== targetId)
            .forEach((m) => lines.push(`${m.name} still wanted ${name(sugg[m.id]!)} instead.`));
        if (disagreement > 0) {
            chemistryChange = -Math.max(0.03, 0.12 * disagreement);
            lines.push(`${a.name} is going after ${name(targetId)}, but not everyone agreed. Chemistry took a hit.`);
        } else {
            chemistryChange = 0.025;
            lines.push(`${a.name} is united: ${name(targetId)} is the target.`);
        }
        // the alliance turns on its target
        agree.forEach((m) => shiftRelationship(gs, m.id, targetId, -0.05));
    }

    // plan B: everyone's backup pick, plus the targets that lost (at half weight)
    let backupId: number | null = null;
    if (targetId !== null) {
        const backupWeights: { [target: number]: number } = {};
        const add = (id: number | null | undefined, w: number) => {
            if (id === null || id === undefined || id === targetId) return;
            if (block && block.length > 0 && !block.includes(id)) return;
            if (exclude.includes(id)) return;
            backupWeights[id] = (backupWeights[id] || 0) + w;
        };
        members.forEach((m) => {
            const own = isHuman(m.id) ? (a.backupSuggestions || {})[m.id] : botBackup(gs, a, m.id, targetId, block, exclude);
            add(own, socialFactor(m));
            add(sugg[m.id], socialFactor(m) / 2);
        });
        const backups = Object.keys(backupWeights)
            .map(Number)
            .sort((x, y) => backupWeights[y] - backupWeights[x]);
        backupId = backups.length > 0 ? backups[0] : null;
        if (backupId !== null) lines.splice(lines.length - 1, 0, `Plan B, if ${name(targetId)} comes off the block: ${name(backupId)}.`);
    }
    // time together bonds the alliance a little, more so when it gets along
    for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++) shiftRelationship(gs, members[i].id, members[j].id, 0.02 * a.chemistry);

    a.chemistry = clamp(a.chemistry + chemistryChange, 0, 1);
    a.positions = { ...sugg };
    a.discussed = false;
    a.target = targetId === null ? undefined : targetId;
    a.backup = backupId === null ? undefined : backupId;
    a.targetWeek = gs.phase;
    a.met = true;
    return { targetId, backupId, lines, chemistryChange };
}

// Did the meeting end split (somebody still wants someone else)?
export function meetingSplit(gs: GameState, a: Alliance): boolean {
    if (!a.met || a.discussed || a.target === undefined || !a.positions) return false;
    return aliveMembers(gs, a).some((m) => {
        const p = a.positions![m.id];
        return p !== null && p !== undefined && p !== a.target;
    });
}

// Who stands where: each target anyone in the alliance still wants, and who wants them.
export function positionsOf(gs: GameState, a: Alliance): { targetId: number; memberIds: number[] }[] {
    const groups: { [t: number]: number[] } = {};
    aliveMembers(gs, a).forEach((m) => {
        const p = (a.positions || {})[m.id];
        if (p === null || p === undefined) return;
        (groups[p] = groups[p] || []).push(m.id);
    });
    return Object.keys(groups)
        .map(Number)
        .map((t) => ({ targetId: t, memberIds: groups[t] }))
        .sort((x, y) => y.memberIds.length - x.memberIds.length);
}

// A split meeting gets talked out. The player either argues for a target (bots who disagree may come round,
// depending on the player's Social and how much they like them) or goes along with the alliance's pick.
// Other players' minds are their own.
export function discussTarget(
    gs: MutableGameState,
    a: Alliance,
    speakerId: number,
    humanIds: number[],
    move: { kind: "argue"; targetId: number } | { kind: "concede" }
): { lines: string[]; targetId: number | undefined } {
    const name = (id: number) => getById(gs, id).name;
    const speaker = getById(gs, speakerId);
    const positions = { ...(a.positions || {}) };
    const lines: string[] = [];
    a.discussed = true;
    if (move.kind === "concede") {
        if (a.target === undefined) return { lines, targetId: undefined };
        positions[speakerId] = a.target;
        lines.push(`${speaker.name} went along with going after ${name(a.target)}.`);
        a.chemistry = clamp(a.chemistry + 0.04, 0, 1);
    } else {
        const pick = move.targetId;
        positions[speakerId] = pick;
        aliveMembers(gs, a)
            .filter((m) => m.id !== speakerId && !humanIds.includes(m.id) && positions[m.id] !== pick)
            .forEach((bot) => {
                const chance = clamp(
                    0.15 + 0.05 * getSocial(speaker) + 0.35 * bot.relationships[speakerId] - 0.4 * Math.max(0, bot.relationships[pick]),
                    0.05,
                    0.85
                );
                if (rand() < chance) {
                    positions[bot.id] = pick;
                    lines.push(`${bot.name} came around to going after ${name(pick)}.`);
                } else {
                    const own = positions[bot.id];
                    lines.push(`${bot.name} wasn't convinced${own !== null && own !== undefined ? `: still wants ${name(own)}` : ""}.`);
                    shiftRelationship(gs, bot.id, speakerId, -0.02); // pushing too hard grates a little
                }
            });
    }
    // the new count
    const weights: { [t: number]: number } = {};
    aliveMembers(gs, a).forEach((m) => {
        const p = positions[m.id];
        if (p !== null && p !== undefined) weights[p] = (weights[p] || 0) + socialFactor(m);
    });
    const ranked = Object.keys(weights)
        .map(Number)
        .sort((x, y) => weights[y] - weights[x]);
    const targetId = ranked.length > 0 ? ranked[0] : a.target;
    const voters = aliveMembers(gs, a).filter((m) => positions[m.id] !== null && positions[m.id] !== undefined);
    const united = targetId !== undefined && voters.every((m) => positions[m.id] === targetId);
    if (targetId !== undefined && targetId !== a.target) {
        if (a.backup === targetId) a.backup = a.target;
        lines.push(`${a.name} changed its mind: ${name(targetId)} is the target now.`);
    }
    if (united && targetId !== undefined) {
        a.chemistry = clamp(a.chemistry + 0.05, 0, 1);
        lines.push(`${a.name} is united after all: ${name(targetId)} it is.`);
    } else if (targetId !== undefined) {
        lines.push(`${a.name} is still split, but it's going after ${name(targetId)}.`);
    }
    a.positions = positions;
    a.target = targetId;
    return { lines, targetId };
}

// Someone turned on their alliance. If they were caught, they're out and the rest of the alliance resents them.
export function betray(
    gs: MutableGameState,
    book: AllianceBook,
    a: Alliance,
    betrayerId: number,
    victimId: number | null,
    caught: boolean
): string {
    const betrayer = getById(gs, betrayerId);
    a.chemistry = clamp(a.chemistry - (caught ? 0.3 : 0.1), 0, 1);
    if (caught) {
        a.memberIds
            .filter((m) => m !== betrayerId)
            .forEach((m) => shiftRelationship(gs, m, betrayerId, m === victimId ? -0.35 : -0.15));
        a.memberIds = a.memberIds.filter((m) => m !== betrayerId);
    }
    const what = victimId !== null ? ` by going after ${getById(gs, victimId).name}` : "";
    let text = caught
        ? `🐍 ${betrayer.name} backstabbed ${a.name}${what} and was kicked out.`
        : `🤫 Someone in ${a.name} is acting shady${what ? `: ${getById(gs, victimId!).name} is suspicious` : ""}.`;
    if (a.memberIds.length < 2 || a.chemistry <= 0) {
        book.alliances = book.alliances.filter((x) => x.id !== a.id);
        text += ` ${a.name} has fallen apart.`;
    }
    return text;
}

// ---------- bots' decisions, alliance-aware ----------

function hitListRank(hero: Houseguest, id: number): number {
    const i = hero.hitList.findIndex((e) => e.id === id);
    return i < 0 ? 999 : i;
}

function currentTargets(book: AllianceBook, gs: GameState, id: number): number[] {
    return alliancesOf(book, id)
        .filter((a) => a.target !== undefined && a.targetWeek === gs.phase)
        .sort((x, y) => y.chemistry - x.chemistry)
        .reduce((ids: number[], a) => [...ids, a.target!, ...(a.backup !== undefined ? [a.backup] : [])], [])
        .filter((t, i, all) => all.indexOf(t) === i && getById(gs, t) && !getById(gs, t).isEvicted);
}

export interface BotPicks {
    picks: Houseguest[];
    betrayed: number[]; // allies picked although they could have been spared
}

// Bot nominations (and replacement nominations): its alliances' targets first, then its hit list.
// Allies go last, unless the bot decides to backstab them. `sway` is what came out of the HoH room one-on-ones:
// houseguests the bot means to keep safe, and nominees it was talked into.
export function botNominate(
    gs: GameState,
    book: AllianceBook,
    hero: Houseguest,
    options: Houseguest[],
    count: number,
    sway?: { protect: number[]; targets: number[] }
): BotPicks {
    const allies = alliesOf(book, hero.id);
    const targets = currentTargets(book, gs, hero.id);
    const protectedIds = new Set<number>();
    options.forEach((o) => allies.has(o.id) && rand() < loyalty(gs, book, hero.id, o.id) && protectedIds.add(o.id));
    const swayed = sway ? sway.targets : [];
    if (sway) sway.protect.forEach((id) => protectedIds.add(id));
    const score = (hg: Houseguest) => {
        if (protectedIds.has(hg.id)) return 10000 + hitListRank(hero, hg.id);
        if (swayed.includes(hg.id)) return -200 + swayed.indexOf(hg.id);
        const t = targets.indexOf(hg.id);
        if (t >= 0) return -100 + t;
        return hitListRank(hero, hg.id);
    };
    const sorted = [...options].sort((x, y) => score(x) - score(y));
    const picks = sorted.slice(0, count);
    // picking an ally who could have been spared is a backstab
    const canSpare = options.filter((o) => !allies.has(o.id)).length >= count;
    const betrayed = canSpare ? picks.filter((p) => allies.has(p.id)).map((p) => p.id) : [];
    return { picks, betrayed };
}

// A bot's eviction vote: go after the alliance target, protect allies, otherwise vote as usual.
export function botVote(gs: GameState, book: AllianceBook, voter: Houseguest, noms: Houseguest[]): { id: number; betrayed?: number } {
    const allies = alliesOf(book, voter.id);
    const loyalTo = noms.filter((n) => allies.has(n.id) && rand() < loyalty(gs, book, voter.id, n.id)).map((n) => n.id);
    const open = noms.filter((n) => !loyalTo.includes(n.id));
    const targets = currentTargets(book, gs, voter.id);
    const target = open.find((n) => targets.includes(n.id));
    if (target) return { id: target.id };
    if (open.length === 1) return { id: open[0].id };
    const pool = open.length > 0 ? open : noms;
    const choice = pool[castEvictionVote(voter, pool, gs).decision];
    const couldSpare = noms.some((n) => !allies.has(n.id));
    return { id: choice.id, betrayed: allies.has(choice.id) && couldSpare ? choice.id : undefined };
}

// A bot veto holder: the usual logic, but it will also use the veto to save an ally.
export function botVeto(
    gs: GameState,
    book: AllianceBook,
    pov: Houseguest,
    noms: Houseguest[],
    hohId: number,
    immune: Houseguest[]
): HouseguestWithLogic {
    const base = GoldenVeto.use(pov, noms, gs, hohId, { immunePlayers: immune });
    if (base.decision || pov.id === hohId) return base;
    const renomOptions = gs.remainingPlayers - immune.length - noms.length - 1; // minus the veto holder
    if (renomOptions < 1) return base;
    const allies = alliesOf(book, pov.id);
    const ally = noms
        .filter((n) => allies.has(n.id))
        .sort((x, y) => pov.relationships[y.id] - pov.relationships[x.id])
        .find((n) => rand() < loyalty(gs, book, pov.id, n.id));
    return ally ? { decision: ally, reason: `${ally.name} is my ally.` } : base;
}

// ---------- bots forming alliances ----------

export interface BotInvite {
    fromId: number;
    toId: number; // a player
    allianceId?: number; // join an existing alliance; otherwise start a new one
    name: string;
}

function pAccept(gs: GameState, book: AllianceBook, hg: Houseguest, memberIds: number[]): number {
    const avg = memberIds.reduce((s, m) => s + hg.relationships[m], 0) / memberIds.length;
    const busy = alliancesOf(book, hg.id).length;
    return clamp((avg + 0.35) * socialFactor(hg) * (busy >= 2 ? 0.4 : 1), 0.03, 0.95);
}

export function botAcceptsInvite(gs: GameState, book: AllianceBook, bot: Houseguest, memberIds: number[], inviterSocial: number): boolean {
    const avg = memberIds.reduce((s, m) => s + bot.relationships[m], 0) / memberIds.length;
    const busy = alliancesOf(book, bot.id).length;
    const p = clamp((avg + 0.3) * (0.5 + inviterSocial / 10) * (busy >= 2 ? 0.5 : 1), 0.05, 0.95);
    return rand() < p;
}

// Bots work the house: social bots start alliances with their friends, or bring friends into one.
// Invitations to players are returned so the player can answer them.
export function botAllianceTime(gs: MutableGameState, book: AllianceBook, humanIds: number[]): BotInvite[] {
    const invites: BotInvite[] = [];
    const everyone = nonEvictedHouseguests(gs);
    const maxSize = botAllianceCap(gs);
    if (everyone.length <= 3) return invites;
    everyone
        .filter((hg) => !humanIds.includes(hg.id))
        .forEach((bot) => {
            if (rand() > 0.06 + 0.025 * getSocial(bot)) return;
            const mine = alliancesOf(book, bot.id);
            const allies = alliesOf(book, bot.id);
            const friends = everyone
                .filter((hg) => hg.id !== bot.id && !allies.has(hg.id) && bot.relationships[hg.id] > 0.25)
                .sort((x, y) => bot.relationships[y.id] - bot.relationships[x.id]);
            if (friends.length === 0) return;
            const growable = mine.filter((a) => a.memberIds.length < maxSize);
            if (growable.length > 0 && (mine.length >= 2 || rand() < 0.4)) {
                // bring a friend into an existing alliance
                const a = growable[0];
                const friend = friends.find((f) => !a.memberIds.includes(f.id));
                if (!friend) return;
                if (humanIds.includes(friend.id)) invites.push({ fromId: bot.id, toId: friend.id, allianceId: a.id, name: a.name });
                else if (rand() < pAccept(gs, book, friend, a.memberIds)) addMember(gs, a, friend.id);
                return;
            }
            if (mine.length >= 2) return;
            const size = Math.min(maxSize, 2 + rng().randomInt(0, 2));
            const invitees = friends.slice(0, size - 1);
            const bots = invitees.filter((f) => !humanIds.includes(f.id) && rand() < pAccept(gs, book, f, [bot.id]));
            const humans = invitees.filter((f) => humanIds.includes(f.id));
            let alliance: Alliance | undefined;
            if (bots.length > 0) alliance = createAlliance(gs, book, [bot.id, ...bots.map((b) => b.id)], randomAllianceName(book));
            humans.forEach((h) =>
                invites.push({
                    fromId: bot.id,
                    toId: h.id,
                    allianceId: alliance ? alliance.id : undefined,
                    name: alliance ? alliance.name : randomAllianceName(book),
                })
            );
        });
    return invites;
}

// ---------- players' alliance moves ----------

export interface MoveOutcome {
    text: string;
    good: boolean;
}

// A player asks a bot to start a new alliance, or to join one of the player's alliances.
export function proposeAlliance(
    gs: MutableGameState,
    book: AllianceBook,
    humanId: number,
    botId: number,
    join: { allianceId?: number; name?: string }
): MoveOutcome {
    const human = getById(gs, humanId);
    const bot = getById(gs, botId);
    const existing = join.allianceId !== undefined ? getAlliance(book, join.allianceId) : undefined;
    if (existing && existing.memberIds.includes(botId)) return { text: `${bot.name} is already in ${existing.name}.`, good: true };
    const members = existing ? existing.memberIds : [humanId];
    if (botAcceptsInvite(gs, book, bot, members, getSocial(human))) {
        if (existing) {
            addMember(gs, existing, botId);
            return { text: `${bot.name} joined ${existing.name}!`, good: true };
        }
        const a = createAlliance(gs, book, [humanId, botId], join.name || "");
        return { text: `${bot.name} agreed to form ${a.name} with you!`, good: true };
    }
    shiftRelationship(gs, humanId, botId, -0.04);
    return {
        text: existing
            ? `${bot.name} isn't ready to join ${existing.name}.`
            : `${bot.name} isn't ready to commit to an alliance with you.`,
        good: false,
    };
}

// A player leaks their alliance's plans to an outsider: the outsider trusts the player more and turns on the
// rest of the alliance. The better the player's Social, the less likely they get caught.
export function leakAlliance(gs: MutableGameState, book: AllianceBook, a: Alliance, humanId: number, outsiderId: number): MoveOutcome[] {
    const human = getById(gs, humanId);
    const outsider = getById(gs, outsiderId);
    const out: MoveOutcome[] = [];
    shiftRelationship(gs, humanId, outsiderId, 0.2 * socialFactor(human));
    a.memberIds.filter((m) => m !== humanId).forEach((m) => shiftRelationship(gs, m, outsiderId, -0.12));
    out.push({ text: `You told ${outsider.name} all about ${a.name}. ${outsider.name} owes you one.`, good: true });
    const pCaught = clamp(0.65 - 0.055 * getSocial(human), 0.1, 0.6);
    if (rand() < pCaught) out.push({ text: betray(gs, book, a, humanId, null, true), good: false });
    else {
        a.chemistry = clamp(a.chemistry - 0.05, 0, 1);
        out.push({ text: `Nobody in ${a.name} suspects a thing… for now.`, good: true });
    }
    return out;
}

// A player walks away from an alliance. No hard feelings? Some.
export function leaveAlliance(gs: MutableGameState, book: AllianceBook, a: Alliance, humanId: number): MoveOutcome {
    a.memberIds.filter((m) => m !== humanId).forEach((m) => shiftRelationship(gs, m, humanId, -0.08));
    a.memberIds = a.memberIds.filter((m) => m !== humanId);
    a.chemistry = clamp(a.chemistry - 0.1, 0, 1);
    let text = `You left ${a.name}.`;
    if (a.memberIds.length < 2) {
        book.alliances = book.alliances.filter((x) => x.id !== a.id);
        text += ` It's over.`;
    }
    return { text, good: false };
}
