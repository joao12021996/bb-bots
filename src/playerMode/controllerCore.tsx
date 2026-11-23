import React from "react";
import { seenHistory, WeekRecord } from "./history";
import { BehaviorSubject, Subject } from "rxjs";
import { EpisodeType, GameState, getById, Houseguest, MutableGameState, nonEvictedHouseguests } from "../model";
import { hashcode, rng } from "../utils";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { Scene } from "../components/episode/scenes/scene";
import { NextEpisodeButton } from "../components/nextEpisodeButton/nextEpisodeButton";
import { evictHouseguest, refreshHgStats } from "../components/episode/utilities/evictHouseguest";
import { Difficulty, SeasonRules, withDefaults } from "./rules";
import { setSuspicion } from "./social/promises";
import { capitalize, explainNomination, ReasonContext } from "./social/reasons";
import { botPercentile } from "./comps/botScores";
import { seededRand } from "./comps/random";
import { rankResults } from "./comps/compRunner";
import { Approach, shiftRelationship, setRelationship, SocialMemory } from "./social/socialActions";
import { fallBackToPlanB, Alliance, AllianceBook, aliveMembers, betray, botNominate, pruneAlliances } from "./social/alliances";
import { DAY_PART, dayOf } from "./days";
import { audienceScore, botGhostSwap, botOverthrow, HOLDABLE, PowerId, POWERS, PowerSlot, PowersState } from "./social/powers";
import { FeedLine } from "./social/feed";
import { listNames } from "../utils/listStrings";
import { HOH } from "./terms";
import { final2Partners, Ledger } from "./social/promises";
import { writeSave } from "./save/serialize";
import { seedRng } from "./seeding";
import { hash01, setPersonalitySource, PersonalityId } from "./social/personality";
import { partnerOf, Showmance } from "./social/showmance";
import { shuffled } from "./comps/random";
import { nextTip, Tip, tipIdsFor } from "./coach";
import { breakBefore, FINAL_THREE, REGULAR_WEEK, Step } from "./week";

import { CREEP_LEVEL, PlayerSave, Prompt, LiveComp, actorOf, NetHooks } from "./controllerTypes";

// The season's state and everything every part of the game leans on: who's who, telling players things,
// saving, showing screens (shared and private), the host's announcements, the feed, secret powers, and online pacing.
//
// The controller is one class written across several files: each part extends the one before (Core, Comps,
// Social, House, then PlayerModeController itself). Where a part calls something a later part defines, it
// declares it `abstract` at the top.
export abstract class ControllerCore {
    // ---------- defined in a later part of the controller ----------
    protected abstract allianceHoh(): void;
    protected abstract battleBack(): void;
    protected abstract blockbuster(): void;
    public abstract currentDay(): number;
    protected abstract eviction(): void;
    protected abstract fallout(): void;
    protected abstract fastSkip(step: Step): Step | undefined;
    protected abstract finalEviction(): void;
    protected abstract finalTwo(): void;
    protected abstract finaleHoh(): void;
    protected abstract gameOver(): void;
    protected abstract hohComp(): void;
    protected abstract hohRoom(): void;
    protected abstract jury(): void;
    protected abstract lateness(): number;
    public abstract get ledger(): Ledger;
    protected abstract mergeTwinAlliances(): void;
    protected abstract nominations(): void;
    protected abstract pawnTalk(): void;
    public abstract get personalities(): {
        [id: number]: PersonalityId;
    };
    protected abstract pushEpisode(type: EpisodeType, title?: string): void;
    protected abstract roomSway(): {
        protect: number[];
        targets: number[];
        pawns?: undefined;
    } | {
        protect: number[];
        targets: number[];
        pawns: number[];
    };
    public abstract get showmances(): Showmance[];
    protected abstract social(): void;
    protected abstract speeches(): void;
    protected abstract vetoCeremony(): void;
    protected abstract vetoComp(): void;
    protected abstract weekStart(): void;

    public state: PlayerSave;
    public readonly prompt$ = new BehaviorSubject<Prompt | null>(null);
    // online: players' own screens, shown at the same time as the shared one (see gather)
    public readonly personal$ = new BehaviorSubject<{ [playerId: number]: Prompt }>({});
    // the season changed (saved): screens showing live information re-render
    public readonly changed$ = new Subject<void>();
    public net: NetHooks | null = null;
    // online: the player an input from another device acts for, while it runs
    public actingFor: number | null = null;
    protected weekScenes: Scene[] = [];

    constructor(save: PlayerSave) {
        this.state = save;
        this.applyDifficulty();
        // comps that quote the bots (Who Said It?) hear the voices of this season's bots
        setPersonalitySource(() => this.personalities);
    }

    // Bots believe what they're told more readily, or less, depending on the difficulty.
    protected applyDifficulty() {
        setSuspicion({ easy: 1.15, normal: 1, hard: 1, cutthroat: 0.8 }[this.difficulty] ?? 1);
    }

    get rules(): SeasonRules {
        return withDefaults(this.state.rules);
    }

    // ---------- the coach (guided seasons; never online) ----------

    get guided(): boolean {
        return !!this.state.guided && !this.net;
    }

    // The coach's tip for this screen, if there's one the players haven't seen. Marks it seen.
    public coachTip(prompt: Prompt): Tip | null {
        if (!this.guided) return null;
        const p: any = prompt;
        const ids = tipIdsFor({ kind: prompt.kind, title: p.title, sceneTitle: p.scene && p.scene.title }, this.state.step, this.gameState.phase);
        const found = nextTip(ids, this.state.tipsSeen || []);
        if (found) {
            this.state.tipsSeen = [...(this.state.tipsSeen || []), found.id];
            writeSave(this.state);
        }
        return found;
    }

    public stopCoaching() {
        this.state.guided = false;
        if (!this.net) writeSave(this.state);
    }

    get gameState(): GameState {
        return this.state.gameState;
    }

    // the season as the players saw it, for memory comps (the daily season: from the moment the player took over)
    get compHistory(): WeekRecord[] {
        return seenHistory(this.state.history, this.state.joinedAt);
    }

    get players(): Houseguest[] {
        return this.state.humanIds.map((id) => getById(this.gameState, id));
    }

    get alivePlayers(): Houseguest[] {
        return this.players.filter((hg) => !hg.isEvicted);
    }

    get multiplayer(): boolean {
        return this.state.humanIds.length > 1;
    }

    public player(id: number): Houseguest {
        return getById(this.gameState, id);
    }

    // The player currently taking their social turn.
    get socialActor(): Houseguest {
        if (this.socialTogether) {
            // the player an input is for, or (drawing a screen) this device's own player
            const local = this.net && this.net.localIds ? this.net.localIds() : [];
            const id = this.actingFor !== null ? this.actingFor : local.length > 0 ? local[0] : null;
            if (id !== null && this.state.socialBy && this.state.socialBy[id]) return this.player(id);
        }
        return this.turnOrder[this.state.socialTurn];
    }

    // The player whose social screen this device draws. Unlike socialActor, never the player an input is for:
    // another player's move can redraw this screen while it's being made, and it must still be this device's own.
    get socialViewer(): Houseguest {
        if (this.socialTogether) {
            const local = this.net && this.net.localIds ? this.net.localIds() : [];
            const id = local.length > 0 ? local[0] : null;
            if (id !== null && this.state.socialBy && this.state.socialBy[id]) return this.player(id);
        }
        return this.turnOrder[this.state.socialTurn];
    }

    // Online, players have their social (and alliance) time at the same time, each on their own screen. On one
    // device, they take turns.
    get socialTogether(): boolean {
        return !!this.net && this.rules.together;
    }

    // How many social actions a player has left this block.
    public actionsOf(id: number): number {
        const by = this.socialTogether && this.state.socialBy ? this.state.socialBy[id] : undefined;
        return by ? by.actions : this.state.actionsLeft;
    }

    protected spendActions(id: number, n: number) {
        const by = this.socialTogether && this.state.socialBy ? this.state.socialBy[id] : undefined;
        if (by) by.actions -= n;
        else this.state.actionsLeft -= n;
    }

    // Where a player is in this block: social time, alliance time, or done.
    public socialStageOf(id: number): "social" | "alliance" | "done" {
        const by = this.socialTogether && this.state.socialBy ? this.state.socialBy[id] : undefined;
        return by ? by.stage : this.state.socialStage;
    }

    // The order players take their turns in this block of social (or alliance) time: shuffled for each block,
    // the same on every device and after a reload.
    get turnOrder(): Houseguest[] {
        const s = this.state;
        return shuffled(seededRand(hashcode(`${s.seed}:turns:${s.gameState.phase}:${s.step}`)), this.alivePlayers);
    }

    public socialMemory(id: number): SocialMemory {
        if (!this.state.social[id]) this.state.social[id] = { chatsThisWeek: {} };
        return this.state.social[id];
    }

    get book(): AllianceBook {
        return this.state.book;
    }

    // Alliances a houseguest is in that still have at least two members in the house.
    public alliancesOf(id: number): Alliance[] {
        return this.book.alliances.filter((a) => a.memberIds.includes(id) && aliveMembers(this.gameState, a).length >= 2);
    }

    public allyIds(id: number): number[] {
        const ids = new Set<number>();
        this.alliancesOf(id).forEach((a) => a.memberIds.forEach((m) => m !== id && ids.add(m)));
        return Array.from(ids);
    }

    // Approaches that still make sense (the houseguests involved are still in the house).
    // Read by the screens, so it changes nothing (online, each device draws different screens: reading must
    // never make one device's season differ). Those who answer one save the list back.
    public approachesFor(id: number): Approach[] {
        const alive = (hid: number) => getById(this.gameState, hid) && !getById(this.gameState, hid).isEvicted;
        return (this.state.approaches[id] || []).filter(
            (a) => alive(a.fromId) && (a.kind !== "pitch" || alive(a.targetId)) && (a.kind !== "sides" || alive(a.otherId))
        );
    }

    public newsFor(id: number): string[] {
        return this.state.news[id] || [];
    }

    protected tell(ids: number[], text: string) {
        ids.forEach((id) => {
            if (!this.isHuman({ id })) return;
            this.state.news[id] = [...(this.state.news[id] || []), text];
        });
    }

    // Plan B only matters in Blockbuster weeks, where the target can still win the Block Breaker. Once the block
    // is down to two (the Block Breaker has been played), nobody else can come off it: no plan B.
    public get planBWeek(): boolean {
        const s = this.state;
        if (!s.week.blockbuster) return false;
        if (s.step !== Step.SocialBlockbuster && s.step !== Step.SocialCampaign) return true;
        return (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted).length > 2;
    }

    // The target came off the block: alliances with a plan B on the block switch to it.
    protected planB() {
        const s = this.state;
        if (!s.week.blockbuster) return;
        const block = (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted);
        if (block.length === 0) return;
        fallBackToPlanB(s.gameState, s.book, block).forEach(({ alliance, from, to }) =>
            this.tellAlliance(
                alliance,
                `🔁 ${this.player(from).name} is off the block. ${alliance.name} goes to plan B: ${this.player(to).name}.`
            )
        );
    }

    protected tellAlliance(a: Alliance, text: string, except?: number) {
        this.tell(
            a.memberIds.filter((m) => m !== except),
            text
        );
    }

    // Applies changes to the game state's relationships, then refreshes everyone's stats and hit lists.
    protected mutate<T>(fn: (gs: MutableGameState) => T): T {
        const gs = new MutableGameState(this.state.gameState);
        const result = fn(gs);
        refreshHgStats(gs, []);
        this.state.gameState = new GameState(gs);
        return result;
    }

    // `betrayerId` went after `victimId`. Every alliance they share takes the hit, if the betrayal is noticed.
    protected backstab(betrayerId: number, victimId: number, pCaught: number) {
        const shared = this.book.alliances.filter((a) => a.memberIds.includes(betrayerId) && a.memberIds.includes(victimId));
        if (shared.length === 0) return;
        this.logMove("backstab", betrayerId, victimId, `${this.player(betrayerId).name} turned on alliance mate ${this.player(victimId).name}`, 3);
        this.mutate((gs) =>
            shared.forEach((a) => {
                const caught = Math.abs(rng().randomFloat()) < pCaught;
                const members = [...a.memberIds];
                const text = betray(gs, this.book, a, betrayerId, victimId, caught);
                this.tell(members, text);
            })
        );
        this.save();
    }

    public start() {
        this.run();
    }

    // Someone a player creeped out for good (see flirts) can't stand them for the rest of the season, whatever
    // else happens between them.
    // Whether a houseguest doesn't mind being flirted with a lot. Charmers never do; for everyone else it's a coin
    // flip, fixed for the season.
    public okWithFlirts(botId: number): boolean {
        if (this.personalities[botId] === "charmer") return true;
        let h = 2166136261;
        for (const ch of `${this.state.seed}:flirts:${botId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
        return (h >>> 0) % 2 === 0;
    }

    public isCreepTo(playerId: number, botId: number): boolean {
        return (this.state.creeps || []).some((c) => c.playerId === playerId && c.botId === botId);
    }

    protected holdGrudges() {
        const creeps = this.state.creeps || [];
        const above = creeps.filter((c) => {
            const bot = this.state.gameState.houseguests.find((hg) => hg.id === c.botId);
            return bot && (bot.relationships[c.playerId] ?? 0) > CREEP_LEVEL;
        });
        if (above.length > 0) this.mutate((gs) => above.forEach((c) => setRelationship(gs, c.playerId, c.botId, CREEP_LEVEL)));
    }

    protected save() {
        this.holdGrudges();
        this.mergeTwinAlliances();
        if (this.net) this.net.saved(this.state);
        else if (!this.watching) writeSave(this.state);
        this.changed$.next();
    }

    // ---------- comp progress (see WeekProgress.locks) ----------

    protected locked<T>(key: string): T | undefined {
        const locks = this.state.week.locks;
        return locks && key in locks ? locks[key] : undefined;
    }

    protected lock(key: string, value: any) {
        this.state.week.locks = { ...(this.state.week.locks || {}), [key]: value };
        this.save();
    }

    // A player's decision in a comp: asked once, then saved. After a reload, the saved answer is used without asking.
    protected decide<T>(key: string, ask: (answer: (value: T) => void) => void, then: (value: T) => void) {
        const saved = this.locked<T>(key);
        if (saved !== undefined) return then(saved);
        ask((value) => {
            this.lock(key, value);
            then(value);
        });
    }

    // Which comp is played at this point in the week: picked once and saved, so a reload can't reroll it.
    protected compChoice(pick: () => string): string {
        const key = `pick:${this.gameState.phase}:${this.state.step}`;
        const saved = this.locked<string>(key);
        if (saved !== undefined) return saved;
        const id = pick();
        this.lock(key, id);
        return id;
    }

    protected reseed(extra: string = "") {
        const s = this.state;
        const by = s.socialBy && this.actingFor !== null ? s.socialBy[this.actingFor] : undefined;
        const who = by ? `:${this.actingFor}:${by.stage}:${by.actions}` : "";
        seedRng(`${s.seed}:${s.gameState.phase}:${s.step}:${s.socialTurn}:${s.socialStage}:${s.actionsLeft}${who}:${extra}`);
    }

    // Skip to the end: every player is out of the game, and they'd rather not sit through the rest. Screens nobody
    // has to decide on are clicked through, one after another (a loop, not a recursion: a season is thousands of
    // screens), until something a player still has a say in (a juror's question, say), the jury's votes, or the end.
    protected skipping = false;
    private skipQueue: Prompt | null = null;
    private skipLooping = false;

    public get canSkipToEnd(): boolean {
        const s = this.state;
        const now = this.prompt$.value;
        return (
            !this.net &&
            !this.skipping &&
            s.step !== Step.GameOver &&
            s.humanIds.length > 0 &&
            s.humanIds.every((id) => this.player(id).isEvicted) &&
            !!now &&
            this.skipPast(now) !== null
        );
    }

    public skipToEnd() {
        if (!this.canSkipToEnd) return;
        this.skipping = true;
        const now = this.prompt$.value;
        if (now) this.show(now);
    }

    // what clicking through a screen does, or null: the skip stops here and the screen is shown
    private skipPast(p: Prompt): (() => void) | null {
        if (actorOf(p) !== null && this.isHuman({ id: actorOf(p)! })) return null;
        switch (p.kind) {
            case "scene":
                return () => this.continue();
            case "handoff":
                return () => p.next();
            case "compResults":
                return () => p.onDone(rankResults(p.results, [])[0].id);
            case "hideResults":
            case "tiebreakResults":
            case "knockout":
                return () => p.onDone();
            case "memoryDuel":
                return p.onDone ? () => p.onDone!() : null;
            default:
                return null;
        }
    }

    protected show(prompt: Prompt): void {
        if (this.skipping) {
            const past = this.skipPast(prompt);
            if (past) {
                this.skipQueue = prompt;
                if (this.skipLooping) return;
                this.skipLooping = true;
                try {
                    for (let p: Prompt | null = this.skipQueue; p && this.skipping; p = this.skipQueue) {
                        this.skipQueue = null;
                        const go = this.skipPast(p);
                        if (!go) return this.show(p);
                        go();
                    }
                } finally {
                    this.skipLooping = false;
                }
                return;
            }
            this.skipping = false;
        }
        if (this.multiplayer && !this.net) {
            if (prompt.kind === "handoff") this.afterPrivate = false;
            else if (this.inPrivate) this.afterPrivate = true;
            else if (this.afterPrivate && actorOf(prompt) === null) {
                // a screen for everyone, after a private one: call everyone back first
                this.afterPrivate = false;
                const next = () => this.prompt$.next(prompt);
                return this.prompt$.next({ kind: "handoff", playerId: this.state.humanIds[0], reason: "", next, shared: true, everyone: true });
            }
        }
        this.prompt$.next(this.net ? this.net.wrapPrompt(prompt) : prompt);
    }

    // pass-and-play: a private screen is being opened / the last screen up was private
    protected inPrivate = false;
    protected afterPrivate = false;

    // In pass-and-play, the device is passed before each screen meant for one player. Online, each player has
    // their own device, so there's nothing to pass. `secret`: no one else may see it (votes, powers, decisions);
    // otherwise the others are welcome to watch (a speech, a comp only one of them plays).
    protected handOff(secret: boolean, playerId: number, reason: string, prompt: () => void) {
        if (!this.multiplayer || this.net) return prompt();
        const next = () => {
            this.inPrivate = secret;
            try {
                prompt();
            } finally {
                this.inPrivate = false;
            }
        };
        this.show({ kind: "handoff", playerId, reason, next, shared: !secret });
    }

    protected privately(playerId: number, reason: string, prompt: () => void) {
        this.handOff(true, playerId, reason, prompt);
    }

    protected openly(playerId: number, reason: string, prompt: () => void) {
        this.handOff(false, playerId, reason, prompt);
    }

    // Online: a screen of a player's own, up at the same time as the shared one and other players' own screens.
    protected showPersonal(playerId: number, prompt: Prompt) {
        const shown = this.net ? this.net.wrapPrompt(prompt, playerId) : prompt;
        this.personal$.next({ ...this.personal$.value, [playerId]: shown });
    }

    protected clearPersonal(playerId: number) {
        if (!(playerId in this.personal$.value)) return;
        if (this.net) this.net.dropPersonal(playerId);
        const rest = { ...this.personal$.value };
        delete rest[playerId];
        this.personal$.next(rest);
    }

    // Several players decide something on their own. Online, they all do it at the same time, each on their own
    // screen, while the shared screen says who's still deciding. On one device, they take turns (passing it).
    // Each answer is saved as it comes in (as `${key}:${id}`), so after a reload only those who haven't answered
    // are asked. `done` gets everyone's answers once they're all in, whatever order they came in.
    // `bot` answers for a player a bot takes over from in the middle of it (online: their device went away).
    protected gather<T>(
        key: string,
        players: Houseguest[],
        waitingTitle: string,
        reason: (player: Houseguest) => string,
        ask: (player: Houseguest, moreToPlay: boolean, answer: (value: T) => void) => Prompt,
        done: (answers: { [playerId: number]: T }) => void,
        bot: (player: Houseguest) => T,
        waitingComp?: LiveComp
    ) {
        const keyOf = (id: number) => `${key}:${id}`;
        const finish = () => {
            this.gatherBot = null;
            const answers: { [playerId: number]: T } = {};
            players.forEach((p) => (answers[p.id] = this.locked<T>(keyOf(p.id)) as T));
            done(answers);
        };
        const pending = players.filter((p) => this.locked(keyOf(p.id)) === undefined);
        if (pending.length === 0) return finish();
        if (!this.net) {
            const turn = (i: number): void => {
                if (i >= pending.length) return finish();
                const player = pending[i];
                this.privately(player.id, reason(player), () =>
                    this.show(
                        ask(player, i + 1 < pending.length, (value) => {
                            this.lock(keyOf(player.id), value);
                            turn(i + 1);
                        })
                    )
                );
            };
            return turn(0);
        }
        const left = pending.map((p) => p.id);
        const showWaiting = () => this.show({ kind: "waiting", title: waitingTitle, waitingOn: [...left], comp: waitingComp });
        const answerFor = (player: Houseguest) => (value: T) => {
            const at = left.indexOf(player.id);
            if (at < 0) return; // answered already
            left.splice(at, 1);
            this.clearPersonal(player.id);
            this.lock(keyOf(player.id), value);
            if (left.length === 0) finish();
            else showWaiting();
        };
        this.gatherBot = (id) => {
            const player = pending.find((p) => p.id === id);
            if (player && left.includes(id)) answerFor(player)(bot(player));
        };
        showWaiting();
        pending.forEach((player) => this.showPersonal(player.id, ask(player, false, answerFor(player))));
    }

    // While players answer at the same time (see gather): answers for one of them with what a bot would do.
    protected gatherBot: ((playerId: number) => void) | null = null;

    protected showScene(scene: Scene, next: Step) {
        this.weekScenes.push(scene);
        this.state.step = next;
        this.save();
        this.show({ kind: "scene", scene });
    }

    public continue = () => {
        this.run();
    };

    // ---------- the host ----------

    protected announce(title: string, lines: string[]) {
        this.state.announce = [...(this.state.announce || []), { title, lines }];
    }

    protected showAnnouncement() {
        const s = this.state;
        const a = s.announce!.shift()!;
        const scene = this.textScene(a.title, a.lines);
        this.weekScenes.push(scene);
        this.save();
        this.show({ kind: "scene", scene });
    }

    // A simple scene of lines, with a Continue button.
    protected textScene(title: string, lines: string[]): Scene {
        return new Scene({
            title,
            gameState: this.state.gameState,
            content: (
                <div style={{ textAlign: "center" }}>
                    <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>{title}</h3>
                    {lines.map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                    <NextEpisodeButton />
                </div>
            ),
        });
    }

    // A ceremony scene with the twists that happened during it written on top.
    protected withNotes(scene: Scene, notes: string[]): Scene {
        if (notes.length === 0) return scene;
        return new Scene({
            title: scene.title,
            gameState: scene.gameState,
            content: (
                <div>
                    {notes.map((note, i) => (
                        <p key={i} style={{ textAlign: "center", fontWeight: 700 }}>
                            {note}
                        </p>
                    ))}
                    {scene.content}
                </div>
            ),
        });
    }

    // ---------- watching the bots ----------

    // Nobody's playing: the viewer sees everything, including what the bots do in private.
    get watching(): boolean {
        return !!this.state.watching;
    }

    // what the bots got up to in the current social block, shown when it ends
    protected watchLog: string[] = [];

    protected watchNote(...lines: string[]) {
        if (this.watching) this.watchLog.push(...lines);
    }

    // ---------- the live feed ----------

    protected feedPush(...lines: string[]) {
        const s = this.state;
        const day = this.currentDay();
        s.feed = [...(s.feed || []), ...lines.map((text) => ({ day, text }))].slice(-30);
    }

    public feedLines(): FeedLine[] {
        return (this.state.feed || []).slice(-10);
    }

    // ---------- difficulty ----------

    get difficulty(): Difficulty {
        return this.state.difficulty || "normal";
    }

    // A bot's hidden throwing score, 0 to 10, mostly around 5 (see throwing.ts): fixed for the season.
    public throwScore(id: number): number {
        const pinned = this.gameState.houseguests[id] && this.gameState.houseguests[id].throws;
        if (typeof pinned === "number") return pinned; // a Hall season: the same bot as before
        const roll = (k: number) => hash01(`${this.state.seed}:throw:${k}:${id}`);
        return Math.round((10 * (roll(1) + roll(2) + roll(3))) / 3);
    }

    // A bot's comp performance, adjusted for difficulty.
    // `seed`: the same skill every time for this seed (a comp that's replayed after a reload must come out the same)
    protected botSkill(hg: Houseguest, seed?: string): number {
        const shift = { easy: -0.12, normal: 0, hard: 0.08, cutthroat: 0.14 }[this.difficulty] ?? 0;
        const rand = seed === undefined ? undefined : seededRand(hashcode(`${seed}:skill:${hg.id}`));
        return Math.max(0, Math.min(1, botPercentile(hg, rand) + shift));
    }

    // How strategically bots play: going after threats with their votes and nominations, or voting on feelings.
    protected strategy(): { threatVote: number; threatNom: number; gut: number } {
        const late = this.lateness();
        if (this.difficulty === "easy") return { threatVote: 0.05 + 0.15 * late, threatNom: 0.15 + 0.25 * late, gut: 0.25 };
        if (this.difficulty === "hard") return { threatVote: 0.3 + 0.4 * late, threatNom: 0.5 + 0.4 * late, gut: 0 };
        if (this.difficulty === "cutthroat") return { threatVote: 0.5 + 0.4 * late, threatNom: 0.7 + 0.25 * late, gut: 0 };
        return { threatVote: 0.15 + 0.3 * late, threatNom: 0.3 + 0.4 * late, gut: 0 };
    }

    // ---------- secret powers ----------

    get powers(): PowersState {
        if (!this.state.powers) this.state.powers = { enabled: [], slots: [] };
        return this.state.powers;
    }

    // A power that's been handed out, hasn't been used, and can still be: its holder is in the house,
    // and there are more than four houseguests left.
    protected activePower(id: PowerId): PowerSlot | undefined {
        const slot = this.powers.slots.find((sl) => sl.id === id && sl.holderId !== undefined && !sl.used);
        if (!slot || this.player(slot.holderId!).isEvicted) return undefined;
        return nonEvictedHouseguests(this.gameState).length > 4 ? slot : undefined;
    }

    // The power a houseguest secretly holds, if any (for their own screen).
    public heldPower(id: number) {
        const slot = this.powers.slots.find((sl) => sl.holderId === id && !sl.used);
        return slot && !this.player(id).isEvicted ? POWERS[slot.id] : undefined;
    }

    // The houseguests a bot holder looks out for: its final-two partners and its showmance.
    protected partnersOf(id: number): number[] {
        const love = partnerOf(this.showmances, id);
        return [...final2Partners(this.ledger, id), ...(love !== undefined ? [love] : [])];
    }

    // How much the audience loves each houseguest (a little random: audiences are fickle).
    protected audienceScores(ids: number[], key: string): { [id: number]: number } {
        this.reseed(`audience:${key}`);
        const rand = () => Math.abs(rng().randomFloat());
        const out: { [id: number]: number } = {};
        ids.forEach(
            (id) =>
                (out[id] = audienceScore(this.gameState, this.state.history, this.player(id), this.personalities[id], partnerOf(this.showmances, id) !== undefined, rand))
        );
        return out;
    }

    // The audience's least favorite of `ids` (for its nominee).
    protected audiencePick(ids: number[]): number {
        const score = this.audienceScores(ids, ids.join(","));
        return [...ids].sort((a, b) => score[a] - score[b])[0];
    }

    // This week's twists, and the powers due to be handed out.
    protected startWeekPowers() {
        const s = this.state;
        const week = s.gameState.phase;
        const due = (id: PowerId) => this.powers.slots.find((sl) => sl.id === id && sl.week === week);
        s.week.secretHoh = !!due("secretHoh");
        s.week.audienceNominee = !!due("audience");
        const audience = this.powers.enabled.includes("audience");
        this.powers.slots
            .filter((sl) => HOLDABLE.includes(sl.id) && sl.week === week && sl.holderId === undefined)
            .forEach((sl) => {
                const holders = this.powers.slots.filter((x) => x.holderId !== undefined && !x.used).map((x) => x.holderId!);
                const pool = nonEvictedHouseguests(s.gameState).filter((hg) => !holders.includes(hg.id));
                if (pool.length === 0) return;
                let holder: Houseguest;
                if (audience) {
                    const score = this.audienceScores(
                        pool.map((hg) => hg.id),
                        `power:${sl.id}`
                    );
                    holder = [...pool].sort((a, b) => score[b.id] - score[a.id])[0];
                } else {
                    this.reseed(`power:${sl.id}`);
                    holder = pool[Math.floor(Math.abs(rng().randomFloat()) * pool.length)];
                }
                sl.holderId = holder.id;
                const info = POWERS[sl.id];
                this.tell([holder.id], `🤫 ${audience ? "The audience voted, and you" : "You"} secretly received the ${info.emoji} ${info.name}. ${info.howTo}`);
                this.announce("🤫 A secret power", [
                    audience
                        ? "📺 The audience has voted, and somewhere in this house, one houseguest just received a secret power."
                        : "Somewhere in this house, one houseguest just received a secret power.",
                    "Who has it, and what it does? Nobody's saying.",
                ]);
            });
    }

    // Hidden Immunity: a nominee holding it can play it to come off the block. `repick(index, exclude, cb)`
    // names someone else for that slot (and they might hold it too, so it's checked again).
    protected immunityCheck(
        nominees: number[],
        repick: (index: number, exclude: number[], cb: (id: number) => void) => void,
        done: (final: number[], notes: string[]) => void,
        notes: string[] = [],
        tried: number[] = []
    ) {
        const slot = this.activePower("immunity");
        const index = slot ? nominees.indexOf(slot.holderId!) : -1;
        if (!slot || index < 0) return done(nominees, notes);
        const holder = this.player(slot.holderId!);
        const play = () => {
            slot.used = true;
            const note = `🛡️ ${holder.name} played ${POWERS.immunity.name} and is off the block!`;
            this.logMove("move", holder.id, undefined, `${holder.name} played ${POWERS.immunity.name} to escape the block`, 2);
            this.feedPush(note);
            repick(index, [...nominees, ...tried, holder.id], (id) => {
                const next = [...nominees];
                next[index] = id;
                this.immunityCheck(next, repick, done, [...notes, note], [...tried, holder.id]);
            });
        };
        if (!this.isHuman(holder)) return play();
        this.privately(holder.id, `${holder.name}, you've been nominated`, () =>
            this.show({
                kind: "choose",
                actorId: holder.id,
                title: POWERS.immunity.name,
                text: `You've been nominated, and you hold ${POWERS.immunity.name}. Play it now to come off the block? Whoever nominated you has to pick someone else.`,
                options: [holder],
                count: 1,
                confirmLabel: "🛡️ Play it",
                noneLabel: "Keep it for later",
                resolve: (ids) => (ids.length > 0 ? play() : done(nominees, notes)),
            })
        );
    }

    // The Head of Household names someone else (Hidden Immunity, mostly).
    protected hohRepick(hoh: Houseguest, pool: Houseguest[], text: string, cb: (id: number) => void) {
        if (pool.length === 0) return cb(-1);
        if (!this.isHuman(hoh)) return cb(botNominate(this.gameState, this.book, hoh, pool, 1, this.roomSway()).picks[0].id);
        this.privately(hoh.id, `${hoh.name}, ${HOH}`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Replacement Nominee",
                text,
                options: pool,
                count: 1,
                confirmLabel: "Nominate",
                resolve: (ids) => cb(ids[0]),
            })
        );
    }

    // Writes new nominees into the week (and the voting table's log).
    protected setNominees(ids: number[], postVeto: boolean) {
        const s = this.state;
        s.week.nomineeIds = ids;
        this.mutate((gs) => {
            const log = gs.currentLog as any;
            if (!log) return;
            const names = ids.map((id) => getById(gs, id).name).sort();
            if (postVeto) log.nominationsPostVeto = names;
            else log.nominationsPreVeto = names;
        });
    }

    // Before the veto: the Ghost Swap takes one nominee off the block and puts someone else up. Anonymously.
    protected ghostSwap(slot: PowerSlot, next: () => void) {
        const s = this.state;
        const holder = this.player(slot.holderId!);
        const noms = s.week.nomineeIds || [];
        const candidates = () =>
            nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== s.week.hohId && hg.id !== holder.id && !(s.week.nomineeIds || []).includes(hg.id));
        const apply = (remove: number, add: number, notes: string[]) => {
            slot.used = true;
            const ids = (s.week.nomineeIds || []).map((id) => (id === remove ? add : id));
            this.setNominees(ids, false);
            s.week.nominators = { ...(s.week.nominators || {}), [add]: holder.id };
            s.week.ghostBy = holder.id;
            s.week.ghostNominee = add;
            const line = `👻 Someone used the ${POWERS.ghostSwap.name}! ${this.player(remove).name} is off the block, and ${this.player(add).name} has been nominated in their place.`;
            this.feedPush(line);
            this.announce(`${POWERS.ghostSwap.emoji} ${POWERS.ghostSwap.name}`, [...notes, line, "Who did it? Nobody knows."]);
            this.save();
            next();
        };
        // the replacement may hold Hidden Immunity: then the swapper picks again
        const withImmunity = (remove: number, add: number) => {
            const repick = (_i: number, exclude: number[], cb: (id: number) => void) => {
                const pool = candidates().filter((hg) => !exclude.includes(hg.id));
                if (pool.length === 0) return cb(-1);
                if (!this.isHuman(holder)) return cb([...pool].sort((a, b) => holder.relationships[a.id] - holder.relationships[b.id])[0].id);
                this.privately(holder.id, `${holder.name}, your ${POWERS.ghostSwap.name}`, () =>
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: POWERS.ghostSwap.name,
                        text: "They played Hidden Immunity. Pick someone else to put on the block.",
                        options: pool,
                        count: 1,
                        confirmLabel: "Nominate",
                        resolve: (ids) => cb(ids[0]),
                    })
                );
            };
            this.immunityCheck([add], repick, (final, notes) => (final[0] >= 0 ? apply(remove, final[0], notes) : next()));
        };
        if (!this.isHuman(holder)) {
            const pick = botGhostSwap(
                s.gameState,
                this.book,
                holder.id,
                noms,
                candidates().map((hg) => hg.id),
                this.partnersOf(holder.id)
            );
            return pick ? withImmunity(pick.remove, pick.add) : next();
        }
        this.privately(holder.id, `${holder.name}, your ${POWERS.ghostSwap.name}`, () =>
            this.show({
                kind: "choose",
                actorId: holder.id,
                title: `${POWERS.ghostSwap.emoji} ${POWERS.ghostSwap.name}`,
                text: `Before the veto, you can take one nominee off the block and put someone else up. Nobody will know it was you.`,
                options: noms.map((id) => this.player(id)),
                count: 1,
                confirmLabel: "Take them off the block",
                noneLabel: "Not this week",
                resolve: (removed) => {
                    if (removed.length === 0) return next();
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: `${POWERS.ghostSwap.emoji} ${POWERS.ghostSwap.name}`,
                        text: `${this.player(removed[0]).name} is coming off the block. Who goes up in their place?`,
                        options: candidates(),
                        count: 1,
                        confirmLabel: "Nominate",
                        resolve: (added) => withImmunity(removed[0], added[0]),
                    });
                },
            })
        );
    }

    // Eviction night: the Overthrow dethrones the Head of Household, and its holder names new nominees. Publicly.
    protected overthrow(slot: PowerSlot, next: () => void) {
        const s = this.state;
        const holder = this.player(slot.holderId!);
        const noms = s.week.nomineeIds || [];
        const candidates = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== s.week.hohId && hg.id !== holder.id);
        const apply = (ids: number[]) => {
            slot.used = true;
            this.setNominees(ids, true);
            s.week.overthrowBy = holder.id;
            s.week.nominators = {};
            ids.forEach((id) => (s.week.nominators![id] = holder.id));
            s.week.spoke = [];
            this.mutate((gs) => {
                if (s.week.hohId !== undefined && !s.week.secretHoh) shiftRelationship(gs, holder.id, s.week.hohId, -0.25);
                ids.forEach((id) => shiftRelationship(gs, holder.id, id, -0.15));
            });
            const line = `⚡ ${holder.name} used the ${POWERS.overthrow.name}! The ${HOH} has been dethroned, and ${holder.name} has nominated ${listNames(
                ids.map((id) => this.player(id).name)
            )}.`;
            this.feedPush(line);
            this.announce(`${POWERS.overthrow.emoji} ${POWERS.overthrow.name}`, [line]);
            this.save();
            next();
        };
        if (!this.isHuman(holder)) {
            const pick = botOverthrow(
                s.gameState,
                this.book,
                holder.id,
                noms,
                candidates.map((hg) => hg.id),
                noms.length,
                this.partnersOf(holder.id)
            );
            return pick ? apply(pick) : next();
        }
        this.privately(holder.id, `${holder.name}, your ${POWERS.overthrow.name}`, () =>
            this.show({
                kind: "choose",
                actorId: holder.id,
                title: `${POWERS.overthrow.emoji} ${POWERS.overthrow.name}`,
                text: `Tonight's nominees are ${listNames(noms.map((id) => this.player(id).name))}. Overthrow the ${HOH} and name ${
                    noms.length
                } new nominees? Everyone will know it was you.`,
                options: candidates,
                count: noms.length,
                confirmLabel: "⚡ Overthrow",
                noneLabel: "Not tonight",
                resolve: (ids) => (ids.length > 0 ? apply(ids) : next()),
            })
        );
    }

    // In a secret Head of Household week, only the HoH (and nobody else) sees who it is.
    public publicHohId(viewerId?: number): number | undefined {
        const s = this.state;
        if (!s.week.secretHoh || this.watching) return s.week.hohId;
        return viewerId !== undefined && viewerId === s.week.hohId ? s.week.hohId : undefined;
    }

    protected sealed(): boolean {
        return !!this.state.week.secretHoh && this.state.step === Step.Hoh && !this.watching;
    }

    // Who a newly evicted juror blames for being on the block (nobody, if they can't know).
    protected blameFor(evictedId: number): number | undefined {
        const s = this.state;
        const by = s.week.nominators ? s.week.nominators[evictedId] : undefined;
        if (s.week.ghostNominee === evictedId) return undefined; // anonymous
        if (by === -1) return undefined; // the audience
        if (by !== undefined && by !== s.week.hohId) return by; // the Overthrow
        return s.week.secretHoh ? undefined : s.week.hohId;
    }

    // ---------- season awards ----------

    // ---------- why they did it ----------

    protected get reasonContext(): ReasonContext {
        const s = this.state;
        return { gs: s.gameState, book: this.book, history: s.history, ledger: this.ledger, showmances: this.showmances, personalities: this.personalities };
    }

    // A bot HoH's nominations, explained: kept for the recap and the season's end, and the nominated players hear it.
    protected explainNoms(hohId: number, nomineeIds: number[]) {
        const s = this.state;
        if (this.isHuman({ id: hohId })) return;
        const ctx = this.reasonContext;
        s.week.nomWhy = { ...(s.week.nomWhy || {}) };
        nomineeIds.forEach((id) => {
            const why = explainNomination(ctx, hohId, id);
            s.week.nomWhy![id] = why;
            if (!s.week.secretHoh) this.tell([id], `💬 Word around the house: ${this.player(hohId).name} nominated you. ${capitalize(why)}.`);
        });
        if (this.watching)
            this.announce(
                "🔍 Why they're on the block",
                nomineeIds.map((id) => `🎯 ${this.player(hohId).name} nominated ${this.player(id).name}: ${s.week.nomWhy![id]}.`)
            );
    }

    protected logMove(kind: "move" | "backstab", actorId: number, targetId: number | undefined, text: string, weight: number) {
        const s = this.state;
        s.moves = [...(s.moves || []), { week: s.gameState.phase, kind, actorId, targetId, text, weight }];
    }

    // ---------- real time (online) ----------

    protected breakKey(): string {
        return `break:${this.gameState.phase}:${this.state.step}`;
    }

    // Whether the season takes a break before this step (real time only).
    protected breakPending(): boolean {
        const pace = this.state.pace;
        if (!pace || !this.net || breakBefore(this.state.step) === undefined) return false;
        if (this.state.week.fast) return false; // a Double Eviction is one night: no breaks in it
        if (this.locked(this.breakKey()) !== undefined) return false;
        if (pace.nextAt === undefined) {
            // the first one: straight into it, and the next is a gap after the season started
            pace.nextAt = pace.startedAt + pace.gapMs;
            this.lock(this.breakKey(), "start");
            return false;
        }
        return true;
    }

    public breakVoters(): number[] {
        return this.state.humanIds.filter((id) => !this.isRuleBreaker(id) && !this.isAutopilot(id));
    }

    protected realtimeBreak() {
        const pace = this.state.pace!;
        const key = this.breakKey();
        const votesKey = `${key}:votes`;
        const next = breakBefore(this.state.step)!;
        const voted = () => this.locked<number[]>(votesKey) || [];
        const until = pace.nextAt!;
        const finish = (at: number) => {
            if (this.locked(key) !== undefined) return;
            this.state.humanIds.forEach((id) => this.clearPersonal(id));
            pace.nextAt = at + pace.gapMs;
            this.feedPush(`⏰ Break's over: on to ${next}.`);
            this.lock(key, at);
            this.run();
        };
        const showShared = () => this.show({ kind: "break", next, until, voters: this.breakVoters(), voted: voted(), timeUp: finish });
        const vote = (id: number) => (at: number) => {
            if (this.locked(key) !== undefined || voted().includes(id)) return;
            this.lock(votesKey, [...voted(), id]);
            this.clearPersonal(id);
            const left = this.breakVoters().filter((v) => !voted().includes(v));
            if (left.length === 0) return finish(at);
            showShared();
        };
        showShared();
        this.breakVoters()
            .filter((id) => !voted().includes(id))
            .forEach((id) => this.showPersonal(id, { kind: "breakVote", playerId: id, next, until, onVote: vote(id) }));
    }

    protected goTo(step: Step) {
        this.state.step = step;
        this.save();
        this.run();
    }

    protected run(): void {
        this.reseed();
        // the host has something to say first
        if (this.state.announce && this.state.announce.length > 0) return this.showAnnouncement();
        const skipTo = this.fastSkip(this.state.step);
        if (skipTo !== undefined) {
            this.state.step = skipTo;
            return this.run();
        }
        if (this.breakPending()) return this.realtimeBreak();
        switch (this.state.step) {
            case Step.BattleBack:
                return this.battleBack();
            case Step.WeekStart:
                return this.weekStart();
            case Step.SocialMorning:
            case Step.SocialAfternoon:
            case Step.SocialVeto:
            case Step.SocialBlockbuster:
            case Step.SocialCampaign:
            case Step.SocialFinale1:
            case Step.SocialFinale2:
            case Step.SocialFinale3:
                return this.social();
            case Step.Blockbuster:
                return this.blockbuster();
            case Step.Hoh:
                return this.hohComp();
            case Step.AllianceHoh:
                return this.allianceHoh();
            case Step.HohRoom:
                return this.hohRoom();
            case Step.Noms:
                return this.nominations();
            case Step.PawnTalk:
                return this.pawnTalk();
            case Step.Veto:
                return this.vetoComp();
            case Step.VetoCeremony:
                return this.vetoCeremony();
            case Step.Speeches:
                return this.speeches();
            case Step.Eviction:
                return this.eviction();
            case Step.Fallout:
                return this.fallout();
            case Step.FinaleHoh1:
            case Step.FinaleHoh2:
            case Step.FinaleHoh3:
                return this.finaleHoh();
            case Step.FinalTwo:
                return this.finalTwo();
            case Step.FinalEviction:
                return this.finalEviction();
            case Step.Jury:
                return this.jury();
            case Step.GameOver:
                return this.gameOver();
        }
    }

    // ---------- helpers ----------

    public isRuleBreaker(id: number): boolean {
        return (this.state.ruleBreakers || []).includes(id);
    }

    protected clearAllPersonal() {
        Object.keys(this.personal$.value).forEach((id) => this.clearPersonal(Number(id)));
    }

    // A player broke the rules (online: opened the browser's inspect tools): expelled on the spot, in front of
    // everyone. On the block, that's the week's eviction: no vote needed. Already out, they lose their jury seat;
    // in the final two, every jury vote goes to the other finalist.
    public ruleBreak() {
        const s = this.state;
        const id = this.actingFor;
        if (id === null || !s.humanIds.includes(id) || this.isRuleBreaker(id) || s.step === Step.GameOver) return;
        s.ruleBreakers = [...(s.ruleBreakers || []), id];
        const hg = this.player(id);
        const name = hg.name;
        const lines = [`🚨 ${name} opened the inspect tools in the middle of the game. That's against the rules.`];
        const week = REGULAR_WEEK;
        const finalThree = FINAL_THREE;
        if (hg.isEvicted) {
            if (hg.isJury) {
                this.mutate((gs) => (getById(gs, id).isJury = false));
                lines.push(`${name} loses their seat on the jury.`);
            } else lines.push(`${name} is out of the game for good.`);
        } else if (s.step === Step.FinalTwo || s.step === Step.Jury) {
            lines.push(`${name} is disqualified: every jury vote goes to the other finalist.`);
        } else {
            const phase = s.gameState.phase;
            this.mutate((gs) => {
                evictHouseguest(gs, id);
                getById(gs, id).isJury = false;
            });
            this.feedPush(`🚨 ${name} broke the rules and was expelled.`);
            lines.push(`${name} has been expelled from the house, effective immediately.`);
            if (finalThree.includes(s.step)) {
                lines.push("That leaves the final two: on to the jury.");
                s.step = Step.FinalTwo;
            } else if (week.includes(s.step)) {
                const nominee = (s.week.nomineeIds || []).includes(id);
                if (nominee || s.gameState.remainingPlayers <= 3) {
                    // that's this week's eviction
                    s.history = [
                        ...s.history,
                        {
                            week: phase,
                            hohId: s.week.hohId,
                            nomineeIds: s.week.nomineeIds || [],
                            povId: s.week.povId,
                            blockbusterId: s.week.blockbusterId,
                            evictedIds: [id],
                        },
                    ];
                    lines.push(nominee ? `${name} was on the block, so there's no eviction vote this week.` : "That's this week's eviction.");
                    pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
                    this.pushEpisode(BigBrotherVanilla, `Day ${dayOf(s.gameState, phase, DAY_PART.eviction)}`);
                    s.step = Step.Fallout;
                } else if (s.week.hohId === id && !s.week.nomineeIds) {
                    // the Head of Household is gone before nominations: the HoH comp's results stand, without them
                    lines.push(`The Head of Household is gone. The comp results stand without ${name}.`);
                    s.week.hohId = undefined;
                    s.week.room = undefined;
                    s.step = Step.Hoh;
                }
            }
        }
        this.announce("🚨 Rule breaker", lines);
        this.clearAllPersonal();
        this.save();
        this.run();
    }

    // A player making their own decisions: not expelled, and (online) not away with a bot playing for them.
    public isHuman(hg: { id: number } | undefined) {
        return !!hg && this.state.humanIds.includes(hg.id) && !this.isRuleBreaker(hg.id) && !this.isAutopilot(hg.id);
    }

    public isAutopilot(id: number): boolean {
        return (this.state.autopilot || []).includes(id);
    }
}
