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
    suggestions: { [memberId: number]: number | null }; // players' suggestions in the current social block
    met: boolean; // has met in the current social block
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

export function maxAllianceSize(gs: GameState): number {
    return Math.max(2, Math.floor(gs.remainingPlayers / 2));
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
export function botSuggestion(gs: GameState, a: Alliance, botId: number): number | null {
    const bot = getById(gs, botId);
    const entry = bot.hitList.find(
        (e) => e.id !== botId && !a.memberIds.includes(e.id) && getById(gs, e.id) && !getById(gs, e.id).isEvicted
    );
    return entry ? entry.id : null;
}

export interface MeetingResult {
    targetId: number | null;
    lines: string[]; // what happened, from the alliance's point of view
    chemistryChange: number;
}

// An alliance meeting: everyone suggests a target, the persuasive (high Social) members try to win the others
// over, and the alliance goes with the most influential pick. Disagreement costs chemistry.
export function holdMeeting(gs: MutableGameState, a: Alliance, humanIds: number[]): MeetingResult {
    const members = aliveMembers(gs, a);
    const name = (id: number) => getById(gs, id).name;
    const isHuman = (id: number) => humanIds.includes(id);
    const sugg: { [id: number]: number | null } = {};
    members.forEach((m) => {
        sugg[m.id] = isHuman(m.id) ? (a.suggestions[m.id] === undefined ? null : a.suggestions[m.id]) : botSuggestion(gs, a, m.id);
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
    // time together bonds the alliance a little, more so when it gets along
    for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++) shiftRelationship(gs, members[i].id, members[j].id, 0.02 * a.chemistry);

    a.chemistry = clamp(a.chemistry + chemistryChange, 0, 1);
    a.target = targetId === null ? undefined : targetId;
    a.targetWeek = gs.phase;
    a.met = true;
    return { targetId, lines, chemistryChange };
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
        .map((a) => a.target!)
        .filter((t) => getById(gs, t) && !getById(gs, t).isEvicted);
}

export interface BotPicks {
    picks: Houseguest[];
    betrayed: number[]; // allies picked although they could have been spared
}

// Bot nominations (and replacement nominations): its alliances' targets first, then its hit list.
// Allies go last, unless the bot decides to backstab them.
export function botNominate(gs: GameState, book: AllianceBook, hero: Houseguest, options: Houseguest[], count: number): BotPicks {
    const allies = alliesOf(book, hero.id);
    const targets = currentTargets(book, gs, hero.id);
    const protectedIds = new Set<number>();
    options.forEach((o) => allies.has(o.id) && rand() < loyalty(gs, book, hero.id, o.id) && protectedIds.add(o.id));
    const score = (hg: Houseguest) => {
        if (protectedIds.has(hg.id)) return 10000 + hitListRank(hero, hg.id);
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
    const maxSize = maxAllianceSize(gs);
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
    if (existing && existing.memberIds.length >= maxAllianceSize(gs))
        return { text: `${existing.name} is already as big as it can get.`, good: false };
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
