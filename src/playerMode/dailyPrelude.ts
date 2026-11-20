import { GameState, getById, Houseguest, MutableGameState, nonEvictedHouseguests, PlayerProfile } from "../model";
import { refreshHgStats } from "../components/episode/utilities/evictHouseguest";
import { listNames } from "../utils/listStrings";
import { rankResults } from "./comps/compRunner";
import { seededRand } from "./comps/random";
import { PlayerSave, Prompt } from "./controllerTypes";
import { newPlayerSave, PlayerModeController } from "./playerModeController";
import { withDefaults } from "./rules";
import { deserialize, serialize } from "./save/serialize";
import { buildSeason } from "./setupGame";
import { aliveMembers } from "./social/alliances";
import { shiftRelationship } from "./social/relationships";
import { partnerOf } from "./social/showmance";
import { HOH, VETO } from "./terms";
import { Step } from "./week";

// The daily season doesn't start on day one. The bots have been at it for a few weeks already: a season is played
// out with everyone a bot, you included (a bot stands in for you, under a placeholder name), until the house is
// down to eight or fewer. Then you take over, partway through a week: on a fresh morning before the HoH comp, on
// the block, about to play the veto, or the night before an eviction. The alliances, showmances, grudges and
// deals your stand-in made are yours now.
//
// Names are part of some of the bots' dice (see perception.ts), so the stand-in plays under the same placeholder for
// everyone, and the day's season comes out the same whoever plays it. Your name and face go in once you take over.

export const NAME_TOKEN = "⁣YOU⁣";
export const FACE_TOKEN = "⁣FACE⁣";

// Where in the week you can take over, and what's ahead of you there.
const TAKEOVER_STEPS: Step[] = [Step.SocialMorning, Step.SocialAfternoon, Step.Veto, Step.SocialCampaign];
// ...and how far into the week that is (as in DAY_PART): memory comps never ask about anything before it.
const TAKEOVER_PART: { [step: string]: number } = {
    [Step.SocialMorning]: 0, // the HoH comp is ahead
    [Step.SocialAfternoon]: 0.35, // the nominations are in; the veto is ahead
    [Step.Veto]: 0.35,
    [Step.SocialCampaign]: 0.9, // only the eviction is ahead
};
const MAX_TRIES = 8;

export interface PreludeOptions {
    seed: number; // the day's seed
    maxLeft?: number; // take over with this many left or fewer (the day picks 6 to 8 when left out)
    tries?: number;
}

// The season, played up to the moment you take over. Your stand-in sits in a seat picked by the seed (the bots break
// early ties by seat, so always sitting first would make it everyone's first target). It must still be in the house
// when you take over: if it was evicted, the season is played again with the next seed, the same for everyone.
// Null: it never made it.
export function playPrelude(bots: PlayerProfile[], extras: Parameters<typeof newPlayerSave>[4], opts: PreludeOptions): PlayerSave | null {
    const rand = seededRand(opts.seed * 7 + 3);
    const maxLeft = opts.maxLeft ?? [8, 8, 7, 6][Math.floor(rand() * 4)];
    const at = TAKEOVER_STEPS[Math.floor(rand() * TAKEOVER_STEPS.length)];
    const tries = opts.tries ?? MAX_TRIES;
    for (let k = 0; k < tries; k++) {
        const seed = k === 0 ? opts.seed : ((opts.seed + k * 104729) % 1000000006) + 1;
        const seat = Math.floor(rand() * (bots.length + 1));
        const standIn: PlayerProfile = { name: NAME_TOKEN, imageURL: FACE_TOKEN, social: 5, comp: 5 };
        const cast = [...bots.slice(0, seat).map((b) => ({ ...b })), standIn, ...bots.slice(seat).map((b) => ({ ...b }))];
        const setup = buildSeason(
            cast,
            [seat],
            cast.map((_, i) => i).filter((i) => i !== seat)
        );
        const save = newPlayerSave(setup.gameState, [], setup.castOptions, true, { ...extras, seed });
        save.watching = true;
        const stopped = runUntil(save, seat, (s) => s.step === at && nonEvictedHouseguests(s.gameState).length <= maxLeft);
        if (stopped && !getById(stopped.gameState, seat).isEvicted) return stopped;
    }
    return null;
}

// A controller that stops the season as it enters a step: where a saved season resumes from (see start). It also
// stops as soon as the stand-in is out. (Declared when it's needed: this file and the controller's import each
// other, and the controller may not be there yet while this file loads.)
function preludeController(save: PlayerSave, standInId: number, stopWhen: (s: PlayerSave) => boolean) {
    class PreludeController extends PlayerModeController {
        public stoppedAt: string | null = null;
        protected run() {
            if (this.stoppedAt !== null) return;
            const entering = this.fastSkip(this.state.step) === undefined && !this.state.compAt;
            if (getById(this.gameState, standInId).isEvicted || (entering && stopWhen(this.state))) {
                this.stoppedAt = serialize({ ...this.state, announce: [] });
                return;
            }
            super.run();
        }
    }
    return new PreludeController(save);
}

function runUntil(save: PlayerSave, standInId: number, stopWhen: (s: PlayerSave) => boolean): PlayerSave | null {
    const controller = preludeController(save, standInId, stopWhen);
    let prompt: Prompt | null = null;
    const sub = controller.prompt$.subscribe((p) => (prompt = p));
    try {
        controller.start();
        for (let guard = 0; guard < 5000 && controller.stoppedAt === null; guard++) {
            const p = prompt as Prompt | null;
            if (!p || p.kind === "gameOver") return null;
            prompt = null;
            if (p.kind === "scene") controller.continue();
            else if (p.kind === "compResults") p.onDone(rankResults(p.results, [])[0].id);
            else if (p.kind === "hideResults" || p.kind === "tiebreakResults" || p.kind === "knockout" || p.kind === "juryReveal") p.onDone();
            else return null; // nobody's playing: nothing else should come up
        }
    } finally {
        sub.unsubscribe();
    }
    return controller.stoppedAt === null ? null : deserialize<PlayerSave>(controller.stoppedAt);
}

// You take over from your stand-in: your name and face go in, the bot that was you is gone, and you're told what
// you missed. A houseguest or two your stand-in rubbed up the wrong way holds it against you.
export function takeOver(prelude: PlayerSave, name: string, imageURL: string): PlayerSave {
    const me = prelude.gameState.houseguests.find((hg) => hg.name === NAME_TOKEN)!.id;
    const taken = new Set(prelude.gameState.houseguests.filter((hg) => hg.id !== me).map((hg) => hg.name.toLowerCase()));
    const myName = taken.has(name.toLowerCase()) ? `${name} II` : name;
    const esc = (text: string) => JSON.stringify(text).slice(1, -1);
    const json = serialize(prelude).split(NAME_TOKEN).join(esc(myName)).split(FACE_TOKEN).join(esc(imageURL));
    const s = deserialize<PlayerSave>(json);
    s.watching = undefined;
    s.humanIds = [me];
    s.joinedAt = { week: s.weekStartState.phase, part: TAKEOVER_PART[s.step] ?? 0 };
    s.social = { [me]: { chatsThisWeek: {} } };
    s.approaches = {};
    s.approachKey = {};
    s.news = {};
    s.socialTurn = 0;
    s.socialStage = "social";
    s.actionsLeft = withDefaults(s.rules).actions;
    if (s.personalities) delete s.personalities[me];

    const gs = new MutableGameState(s.gameState);
    const rand = seededRand(s.seed * 13 + 5);
    const others = nonEvictedHouseguests(gs).filter((hg) => hg.id !== me);
    const coldest = [...others].sort((a, b) => (a.relationships[me] ?? 0) - (b.relationships[me] ?? 0));
    const grudges = coldest.slice(0, rand() < 0.5 ? 1 : 2);
    grudges.forEach((hg) => shiftRelationship(gs, hg.id, me, -0.35));
    refreshHgStats(gs, []);
    s.gameState = new GameState(gs);
    // your first read on everyone: you've lived with them for weeks
    const day = s.history.length * 7 + 1;
    s.reads = { [me]: {} };
    others.forEach((hg) => (s.reads![me][hg.id] = { v: getById(s.gameState, hg.id).relationships[me] ?? 0, day }));
    s.announce = [previously(s, me, grudges)];
    return s;
}

function previously(s: PlayerSave, me: number, grudges: Houseguest[]): { title: string; lines: string[] } {
    const gs = s.gameState;
    const name = (id: number) => (id === me ? "you" : getById(gs, id).name);
    const names = (ids: number[]) => listNames(ids.map(name));
    const left = nonEvictedHouseguests(gs).length;
    const gone = gs.houseguests.length - left;
    const weeks = s.history.length;
    const lines: string[] = [
        `It's week ${weeks + 1}, and the house has been playing without you... well, someone's been playing you. ${gone} houseguest${gone === 1 ? " has" : "s have"} gone home and ${left} are left. From here on, it's all you. Here's what you missed.`,
    ];
    s.history.forEach((w) => {
        const bits = [
            w.hohId !== undefined ? `${name(w.hohId)} won ${HOH}` : null,
            w.nomineeIds.length ? `${names(w.nomineeIds)} ended up on the block` : null,
            w.evictedIds.length ? `${names(w.evictedIds)} went home` : null,
        ];
        lines.push(`Week ${w.week}: ${bits.filter(Boolean).join(", ")}.`);
    });
    const back = gs.houseguests.filter((hg) => !hg.isEvicted && s.history.some((w) => w.evictedIds.includes(hg.id)));
    if (back.length) lines.push(`↩️ ${names(back.map((hg) => hg.id))} came back in the Battle Back.`);
    const mine = s.book.alliances.filter((a) => a.memberIds.includes(me) && aliveMembers(gs, a).length >= 2);
    mine.forEach((a) => lines.push(`🤝 You're in ${a.name} with ${names(aliveMembers(gs, a).map((m) => m.id).filter((id) => id !== me))}.`));
    if (mine.length === 0) lines.push("🤝 You're not in any alliance.");
    const partner = partnerOf(s.showmances || [], me);
    if (partner !== undefined && !getById(gs, partner).isEvicted) lines.push(`💕 You're in a showmance with ${name(partner)}.`);
    grudges.forEach((hg) => lines.push(`😠 ${hg.name} can't stand you.`));
    const w = s.week;
    if (w.hohId === me) lines.push(`👑 You're the ${HOH}.`);
    else if (w.hohId !== undefined) lines.push(`👑 ${name(w.hohId)} is the ${HOH} this week.`);
    const noms = w.nomineeIds || [];
    if (noms.includes(me)) lines.push(`🎯 You're on the block, next to ${names(noms.filter((id) => id !== me))}.`);
    else if (noms.length) lines.push(`🎯 ${names(noms)} ${noms.length === 1 ? "is" : "are"} on the block.`);
    if (w.povId === me) lines.push(`🏅 You hold the ${VETO}.`);
    else if (w.povId !== undefined) lines.push(`🏅 ${name(w.povId)} holds the ${VETO}.`);
    const next: { [step: string]: string } = {
        [Step.SocialMorning]: `It's a new week, and the ${HOH} comp is coming up.`,
        [Step.SocialAfternoon]: `The ${VETO} comp is coming up.`,
        [Step.Veto]: `The ${VETO} players are about to be picked.`,
        [Step.SocialCampaign]: "Eviction night is coming. Time to count votes.",
    };
    if (next[s.step]) lines.push(next[s.step]);
    return { title: "📺 Previously in the house", lines };
}
