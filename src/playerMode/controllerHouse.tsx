import React from "react";
import { exclude, GameState, getById, Houseguest, MutableGameState, nonEvictedHouseguests } from "../model";
import { rng } from "../utils";
import { generateHohCompScene } from "../components/episode/scenes/hohCompScene";
import { Scene } from "../components/episode/scenes/scene";
import { NextEpisodeButton } from "../components/nextEpisodeButton/nextEpisodeButton";
import { CompDefinition } from "./comps/compTypes";
import { KNOCKOUT_ID } from "./comps/knockout";
import { TAINTED_WINE_ID } from "./comps/taintedWine";
import { compById, pickQuickComp } from "./comps";
import { botSocialTime, shiftRelationship, socialFactor } from "./social/socialActions";
import {
    discussTarget,
    meetingSplit,
    Alliance,
    aliveMembers,
    botAllianceTime,
    cleanName,
    getAlliance,
    holdMeeting,
    leakAlliance,
    leaveAlliance,
    MoveOutcome,
    mergeTwins,
    proposeMerge,
    currentTargets,
} from "./social/alliances";
import { SpeechTone } from "./ui/speechPrompt";
import { MEMORY_DUEL_ID } from "./comps/memoryDuel";
import { PowerSlot } from "./social/powers";
import { houseFeed, madeUp, Rivalry } from "./social/feed";
import { exitReport } from "./social/exit";
import { endgameOpen, Pact, pactBroken, pactOf } from "./social/endgame";
import { listNames } from "../utils/listStrings";
import { HOH, VETO } from "./terms";
import { isRevealed, reveal, trustOf, honorChance, compareNotes } from "./social/promises";
import { blameVote } from "./social/campaign";
import { apparentRelationship, assignPersonalities, hash01, PersonalityId, PersonalityInfo, PERSONALITIES, Situation, voice } from "./social/personality";
import { botShowmances, partnerOf, Showmance } from "./social/showmance";
import { botFight, botRumours, compWins, checkRumours, exposeAllianceHoppers, sidesText, threatLevel, walkedInOn } from "./social/drama";
import { addGrudge, emptyJury, grudgeOf, JuryBook, jurorType, JurorType, newcomerTalks } from "./social/jury";
import { PawnTalk as PawnTalkRecord } from "./social/pawnTalk";
import { feelingLabel } from "./social/socialActions";
import { DiaryEntry, diaryEntries, recapText } from "./social/diary";
import { battleBackCandidates, battleBackDue, haveNotCount } from "./social/twists";
import { afterSocial, blockName as socialBlockName, Step } from "./week";

import { ControllerSocial } from "./controllerSocial";

// Life in the house around the ceremonies: the jury, personalities and showmances, the endgame, feuds, alliances,
// what happens when social time ends, the HoH comp, Have-Nots, the Battle Back and the diary room.
export abstract class ControllerHouse extends ControllerSocial {
    // ---------- defined in a later part of the controller ----------
    protected abstract pawnMemories(hohId: number): void;
    public abstract targetExclude(): number[];

    // ---------- the jury ----------

    get juryBook(): JuryBook {
        if (!this.state.jury) this.state.jury = emptyJury();
        return this.state.jury;
    }

    public jurorTypeOf(id: number): JurorType {
        return jurorType(this.personalities[id], `${this.state.seed}:${id}`);
    }

    protected jurorIds(): number[] {
        return this.gameState.houseguests.filter((hg) => hg.isJury && hg.isEvicted).map((hg) => hg.id);
    }

    // What each juror holds against (or for) `id`, as far as `id` can tell: they know what they did.
    public juryView(id: number): { juror: Houseguest; amount: number; reasons: string[] }[] {
        return this.jurorIds()
            .filter((j) => j !== id)
            .map((j) => {
                const g = grudgeOf(this.juryBook, j, id);
                return { juror: this.player(j), amount: g.amount, reasons: g.reasons };
            });
    }

    // A new juror remembers how they got there: who nominated them (or cut them), who voted them out,
    // who lied to them, and who kept or broke their word. In the jury house, the truth comes out.
    protected recordEvictionGrudges(
        evictedIds: number[],
        hohId: number | undefined,
        votes: { [voterId: number]: number },
        pawns: PawnTalkRecord[],
        how: string
    ) {
        const s = this.state;
        const gs = s.gameState;
        const jury = this.juryBook;
        this.reseed("jury");
        evictedIds.forEach((e) => {
            if (!getById(gs, e).isJury) return;
            if (hohId !== undefined) addGrudge(jury, e, hohId, -0.25, how);
            Object.keys(votes)
                .map(Number)
                .filter((v) => votes[v] === e && Math.abs(rng().randomFloat()) < 0.5)
                .forEach((v) => addGrudge(jury, e, v, -0.12, "voted me out"));
            pawns.filter((t) => t.toId === e).forEach((t) => addGrudge(jury, e, t.hohId, -0.35, "told me I wasn't the target"));
            this.ledger.pledges
                .filter((p) => p.toId === e)
                .forEach((p) => {
                    if (p.status === "broken") addGrudge(jury, e, p.fromId, -0.35, "broke a promise to me");
                    if (p.status === "kept") addGrudge(jury, e, p.fromId, 0.15, "kept their word to me");
                });
            this.ledger.claims
                .filter(
                    (c) =>
                        c.toId === e &&
                        (c.caught || (c.kind === "vote" && votes[c.fromId] === e && c.aboutId !== e) || (c.kind === "rumour" && !c.true))
                )
                .forEach((c) => addGrudge(jury, e, c.fromId, -0.25, "lied to my face"));
            const lines = newcomerTalks(gs, jury, e, this.jurorIds());
            s.week.juryHouse = [...(s.week.juryHouse || []), ...lines];
            // players who put them there can send a goodbye message
            if (hohId !== undefined && votes[hohId] === undefined && Object.keys(votes).length === 0) return;
            this.alivePlayers
                .filter((p) => p.id === hohId || votes[p.id] === e)
                .forEach((p) => (s.week.goodbyes = [...(s.week.goodbyes || []), { playerId: p.id, evictedId: e }]));
        });
    }

    // The jury house goes in the episode recap (single player only: in pass-and-play it's a secret).
    protected pushJuryHouse() {
        const s = this.state;
        const lines = s.week.juryHouse || [];
        if (lines.length === 0 || this.multiplayer) return;
        this.weekScenes.push(
            new Scene({
                title: "Jury House",
                gameState: s.gameState,
                content: (
                    <div style={{ textAlign: "center" }}>
                        <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🧑‍⚖️ Meanwhile, in the jury house</h3>
                        {lines.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                        <NextEpisodeButton />
                    </div>
                ),
            })
        );
        s.week.juryHouse = [];
    }

    // After an eviction, players who put a juror there can send them a goodbye message. How it lands
    // depends on the juror: objective jurors respect a game move, bitter ones want an apology.
    protected goodbyes() {
        const s = this.state;
        const list = (s.week.goodbyes || []).filter((g) => !this.player(g.playerId).isEvicted && this.isHuman({ id: g.playerId }));
        if (list.length === 0) return this.goTo(this.battleBackDue() ? Step.BattleBack : Step.WeekStart);
        const { playerId, evictedId } = list[0];
        const done = () => {
            s.week.goodbyes = list.slice(1);
            this.save();
            this.run();
        };
        const player = this.player(playerId);
        const juror = this.player(evictedId);
        const tones: SpeechTone[] = [
            { id: "game", label: "🎯 It was a game move", blurb: "Explain it was strategy, not personal. Respected by jurors who judge the game." },
            { id: "sorry", label: "🙏 Apologize", blurb: "Say you're sorry it had to be them. Goes a long way with jurors who vote with their hearts." },
            { id: "gloat", label: "😈 Gloat", blurb: "Tell them exactly why they had to go. Nobody likes this. Some respect it." },
            { id: "silent", label: "🤐 Say nothing", blurb: "No message at all. Some jurors won't even notice. Some will." },
        ];
        this.privately(playerId, `${player.name}, a message for ${juror.name}`, () =>
            this.show({
                kind: "speech",
                actorId: playerId,
                title: `Goodbye message to ${juror.name}`,
                text: `${juror.name} is heading to the jury house, and they'll have a vote at the finale. You helped send them there. Anything to say?`,
                tones,
                deliver: (toneId) => {
                    const type = this.jurorTypeOf(evictedId);
                    const effect: { [tone: string]: [number, string] } = {
                        game: [type === "objective" ? 0.25 : 0.05, "explained it was just a game move"],
                        sorry: [type === "bitter" ? 0.25 : 0.05, "apologized on my way out"],
                        gloat: [type === "objective" ? -0.1 : -0.35, "gloated when I left"],
                        silent: [type === "bitter" ? -0.08 : 0, "didn't even say goodbye"],
                    };
                    const [amount, reason] = effect[toneId];
                    if (amount !== 0) addGrudge(this.juryBook, evictedId, playerId, amount, reason);
                    this.save();
                    return [
                        toneId === "silent" ? "(no message)" : `Your message is on its way to ${juror.name}.`,
                        amount > 0.1
                            ? `🙂 Word from the jury house: ${juror.name} appreciated it.`
                            : amount < -0.05
                            ? `😠 Word from the jury house: that landed badly with ${juror.name}.`
                            : `😐 Hard to say how ${juror.name} took it.`,
                    ];
                },
                next: done,
            })
        );
    }

    // ---------- personalities, hidden feelings, trust and showmances ----------

    get personalities(): { [id: number]: PersonalityId } {
        const s = this.state;
        if (!s.personalities) {
            const bots = s.gameState.houseguests.filter((hg) => !this.isHuman(hg));
            s.personalities = assignPersonalities(bots, s.seed);
        }
        return s.personalities;
    }

    public traitsOf(id: number): PersonalityInfo | undefined {
        const p = this.personalities[id];
        return p ? PERSONALITIES[p] : undefined;
    }

    // ---------- the endgame: final-three pacts, and making your case (see endgame.ts) ----------

    get pacts(): Pact[] {
        if (!this.state.pacts) this.state.pacts = [];
        return this.state.pacts;
    }

    // Whether the endgame's extra social actions are open (the last few houseguests).
    public endgameOpen(): boolean {
        return endgameOpen(this.gameState);
    }

    // The two others in a houseguest's final-three pact, while all three are still in the house.
    public pactPartners(id: number): number[] {
        const pact = pactOf(this.pacts, id, this.gameState);
        return pact ? pact.ids.filter((x) => x !== id) : [];
    }

    public madeCaseTo(playerId: number, botId: number): boolean {
        return ((this.state.juryCases || {})[playerId] || []).includes(botId);
    }

    // Someone in a pact put another member on the block: the pact's over, and everyone in it knows who ended it.
    protected checkPacts(byId: number, nomineeIds: number[]) {
        nomineeIds.forEach((nominee) => {
            const pact = this.mutate((gs) => pactBroken(gs, this.pacts, byId, nominee));
            if (!pact) return;
            this.state.pacts = this.pacts.filter((p) => p !== pact);
            const by = this.player(byId).name;
            this.tell(
                pact.ids.filter((id) => id !== byId),
                `💔 So much for the final three: ${by} put ${this.player(nominee).name} on the block.`
            );
            this.logMove("backstab", byId, nominee, `${by} broke a final-three pact and nominated ${this.player(nominee).name}`, 2.5);
        });
    }

    get rivalries(): Rivalry[] {
        if (!this.state.rivalries) this.state.rivalries = [];
        return this.state.rivalries;
    }

    // The houseguest(s) someone is feuding with.
    public rivalsOf(id: number): number[] {
        return this.rivalries.filter((r) => (r.a === id || r.b === id) && !this.player(r.a).isEvicted && !this.player(r.b).isEvicted).map((r) => (r.a === id ? r.b : r.a));
    }

    // A blow-up starts a feud (if they weren't in one already). The house knows: it's in the feed, and in every
    // player's notes on the two of them.
    protected startRivalry(aId: number, bId: number) {
        if (this.rivalries.some((r) => (r.a === aId && r.b === bId) || (r.a === bId && r.b === aId))) return;
        const week = this.gameState.phase;
        this.rivalries.push({ a: aId, b: bId, week });
        const a = this.player(aId).name;
        const b = this.player(bId).name;
        this.feedPush(`💥 ${a} and ${b} had it out in front of everyone. Those two are done with each other.`);
        this.state.humanIds.forEach((h) => {
            if (h !== aId) this.noteIntel(h, aId, `💥 Feuding with ${b} since week ${week}.`);
            if (h !== bId) this.noteIntel(h, bId, `💥 Feuding with ${a} since week ${week}.`);
        });
    }

    // Feuds end when the two make up, or one of them leaves.
    protected settleRivalries() {
        const gs = this.gameState;
        this.state.rivalries = this.rivalries.filter((r) => {
            const a = this.player(r.a);
            const b = this.player(r.b);
            if (a.isEvicted || b.isEvicted) return false;
            if (r.week === gs.phase || !madeUp(gs, r)) return true;
            this.feedPush(`🤝 ${a.name} and ${b.name} have buried the hatchet.`);
            this.state.humanIds.forEach((h) => {
                if (h !== r.a) this.noteIntel(h, r.a, `🤝 Made up with ${b.name} (week ${gs.phase}).`);
                if (h !== r.b) this.noteIntel(h, r.b, `🤝 Made up with ${a.name} (week ${gs.phase}).`);
            });
            return false;
        });
    }

    // A bot HoH with a feud going puts its rival up, more often than not.
    protected rivalTarget(hohId: number): number[] {
        const rivals = this.rivalsOf(hohId);
        if (rivals.length === 0 || Math.abs(rng().randomFloat()) >= 0.7) return [];
        const hoh = this.player(hohId);
        return [[...rivals].sort((x, y) => hoh.relationships[x] - hoh.relationships[y])[0]];
    }

    get showmances(): Showmance[] {
        if (!this.state.showmances) this.state.showmances = [];
        return this.state.showmances;
    }

    public showmancePartner(id: number): number | undefined {
        return partnerOf(this.showmances, id);
    }

    // A line in a bot's own voice. `key` keeps the choice of line stable for a given moment.
    // Who a houseguest likes least in the house, besides the one they're talking to (for lines that name them).
    protected leastLiked(id: number, exceptId: number): string {
        const hg = this.player(id);
        const others = nonEvictedHouseguests(this.gameState).filter((o) => o.id !== id && o.id !== exceptId);
        if (others.length === 0) return "";
        return others.reduce((a, b) => ((hg.relationships[b.id] ?? 0) < (hg.relationships[a.id] ?? 0) ? b : a)).name;
    }

    public say(botId: number, situation: Situation, key: string, name: string = ""): string {
        return voice(this.personalities[botId], situation, `${this.state.seed}:${this.gameState.phase}:${botId}:${key}`, name);
    }

    // How `otherId` seems to feel about `viewerId`: bots can fake it (depending on their personality),
    // unless their mask slipped recently. Players see each other as they are.
    public feelingOf(viewerId: number, otherId: number): number {
        const viewer = this.player(viewerId);
        const real = viewer.relationships[otherId] ?? 0;
        if (this.isHuman({ id: otherId }) || !this.isHuman({ id: viewerId })) return real;
        const week = this.gameState.phase;
        return apparentRelationship(
            real,
            this.personalities[otherId],
            `${this.state.seed}:${week}:${otherId}:${viewerId}`,
            isRevealed(this.ledger, otherId, viewerId, week)
        );
    }

    // What a gossip lets slip to a player: an alliance among the others, or who somebody's after. It's true, and
    // it goes in the player's notes on the people it's about.
    protected gossipFrom(botId: number, playerId: number, roll: number): string | null {
        const gs = this.gameState;
        const bot = this.player(botId);
        const name = (id: number) => this.player(id).name;
        const alive = (id: number) => !this.player(id).isEvicted;
        const groups = this.book.alliances
            .map((a) => ({ a, members: a.memberIds.filter(alive) }))
            .filter((x) => x.members.length >= 2 && !x.members.includes(playerId));
        const after = nonEvictedHouseguests(gs)
            .filter((hg) => hg.id !== botId && hg.id !== playerId && !this.isHuman(hg))
            .map((hg) => ({ hg, targets: currentTargets(this.book, gs, hg.id).filter((t: number) => alive(t) && t !== hg.id) }))
            .filter((x) => x.targets.length > 0);
        const options: (() => string)[] = [];
        groups.forEach(({ a, members }) =>
            options.push(() => {
                members.forEach((m) => this.noteIntel(playerId, m, `🗣️ ${bot.name} let slip they're in ${a.name} with ${members.filter((x) => x !== m).map(name).join(", ")} (week ${gs.phase}).`));
                return `🗣️ ${bot.name} couldn't keep it in: "Don't tell anyone, but ${members.map(name).join(", ")} are working together. They call it ${a.name}."`;
            })
        );
        after.forEach(({ hg, targets }) =>
            options.push(() => {
                this.noteIntel(playerId, hg.id, `🗣️ ${bot.name} says they're after ${name(targets[0])} (week ${gs.phase}).`);
                const you = targets[0] === playerId;
                return `🗣️ ${bot.name} couldn't keep it in: "You didn't hear it from me, but ${hg.name} wants ${you ? "you" : name(targets[0])} out."`;
            })
        );
        if (options.length === 0) return null;
        return options[Math.min(options.length - 1, Math.floor(roll * options.length))]();
    }

    // How much `listener` believes `speaker` (separate from how much they like them).
    public trustIn(listener: number, speaker: number): number {
        return trustOf(this.ledger, listener, speaker);
    }

    // How likely a bot is to keep its word: how it feels, and who it is.
    protected honor(botId: number, toId: number): number {
        const info = this.traitsOf(botId);
        let h = honorChance(this.gameState, botId, toId) + (info ? info.honor : 0);
        // casual bots keep their word more; cutthroat bots break it when it suits them
        h += { easy: 0.1, normal: 0, hard: 0, cutthroat: -0.15 }[this.difficulty] ?? 0;
        if (this.personalities[botId] === "wildcard") h += (Math.abs(rng().randomFloat()) - 0.5) * 0.5;
        return Math.max(0.05, Math.min(0.99, h));
    }

    protected compBoost(id: number, comp: CompDefinition, seed: number): number {
        const p = this.personalities[id];
        if (!p) return 0;
        let boost = PERSONALITIES[p].compBoost;
        if (p === "superfan" && (comp.kind === "quiz" || comp.kind === "memory")) boost += 0.1;
        if (p === "wildcard") boost += (hash01(`${seed}:${id}:wild`) - 0.5) * 0.3;
        return boost;
    }

    // Who a bot HoH goes after, given its personality.
    protected personalityTargets(hohId: number): number[] {
        const p = this.personalities[hohId];
        const hoh = this.player(hohId);
        const love = partnerOf(this.showmances, hohId);
        const allies = this.allyIds(hohId);
        const pool = nonEvictedHouseguests(this.gameState).filter((hg) => hg.id !== hohId && hg.id !== love && !allies.includes(hg.id));
        if (pool.length === 0) return [];
        const top = (score: (hg: Houseguest) => number) => [...pool].sort((a, b) => score(b) - score(a))[0];
        if (p === "compBeast") {
            const threat = top((hg) => hg.hohWins + hg.povWins);
            return threat.hohWins + threat.povWins > 0 ? [threat.id] : [];
        }
        if (p === "villain") return [top((hg) => -hoh.relationships[hg.id]).id];
        if (p === "mastermind") return [top((hg) => hg.popularity).id];
        if (p === "superfan") return [top((hg) => hg.powerRanking).id]; // a big move
        if (p === "hunter") {
            // whoever's coasting: no comp wins, never on the block (the longer the season, the surer it is)
            const coasting = pool.filter((hg) => hg.hohWins + hg.povWins === 0 && hg.nominations === 0);
            if (coasting.length === 0 || this.state.history.length < 2) return [];
            return [[...coasting].sort((a, b) => hoh.relationships[a.id] - hoh.relationships[b.id])[0].id];
        }
        // the one the house has already turned on: nobody on the jury will hold it against them
        if (p === "diplomat") return [top((hg) => -hg.popularity).id];
        return [];
    }

    // A bot HoH may go after a showmance as a pair.
    protected showmanceTarget(hohId: number): number[] {
        const alive = (id: number) => !this.player(id).isEvicted;
        const couple = this.showmances.find((sm) => sm.a !== hohId && sm.b !== hohId && alive(sm.a) && alive(sm.b));
        if (!couple || Math.abs(rng().randomFloat()) >= 0.5) return [];
        return [couple.a, couple.b];
    }

    protected endShowmances(evictedIds: number[]) {
        const s = this.state;
        s.showmances = this.showmances.filter((sm) => {
            const gone = [sm.a, sm.b].find((id) => evictedIds.includes(id));
            if (gone === undefined) return true;
            const partner = gone === sm.a ? sm.b : sm.a;
            this.tell([partner], `💔 ${this.player(gone).name} is gone. You're on your own in this house now.`);
            if (!evictedIds.includes(partner)) this.feedPush(`💔 ${this.player(partner).name} hasn't said a word since ${this.player(gone).name} walked out the door.`);
            if (this.player(gone).isJury) addGrudge(this.juryBook, gone, partner, 0.4, "was my showmance");
            return false;
        });
    }

    // Wildcards' moods swing: a random relationship of theirs lurches one way or the other.
    protected wildcardSwings(gs: MutableGameState) {
        const house = nonEvictedHouseguests(gs);
        house
            .filter((hg) => this.personalities[hg.id] === "wildcard")
            .forEach((hg) => {
                const others = house.filter((o) => o.id !== hg.id);
                if (others.length === 0) return;
                const other = others[Math.floor(Math.abs(rng().randomFloat()) * others.length)];
                shiftRelationship(gs, hg.id, other.id, (Math.abs(rng().randomFloat()) - 0.5) * 0.24);
            });
    }

    // The end-of-season reveal: who everyone really was, and (single player) how they really felt about you.
    protected whoTheyWere(): JSX.Element {
        const gs = this.state.gameState;
        const me = this.multiplayer ? null : this.players[0];
        const bots = gs.houseguests.filter((hg) => !this.isHuman(hg) && this.personalities[hg.id]);
        return (
            <div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🎭 Who they really were</h3>
                <div className="bbb-skills-reveal">
                    {bots.map((hg) => {
                        const info = PERSONALITIES[this.personalities[hg.id]];
                        const real = me ? feelingLabel(hg.relationships[me.id] ?? 0) : null;
                        return (
                            <div key={hg.id}>
                                <img src={hg.imageURL} alt="" />
                                <b>{hg.name}</b>
                                <span>
                                    {info.emoji} {info.label}
                                </span>
                                {real && (
                                    <span>
                                        really: {real.emoji} {real.label}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // After the eviction: players who voted against the nominee who stayed can pin it on someone else.
    // "Why you went home": an evicted player, on their way out, gets the whole chain (see exit.ts). For their eyes
    // only: the votes stay secret in the house.
    protected exitInterview(evictedId: number) {
        const s = this.state;
        const week = s.history[s.history.length - 1];
        const gs = s.gameState;
        const me = this.player(evictedId);
        const houseSize = nonEvictedHouseguests(gs).length + week.evictedIds.length;
        // how big a threat they looked going into the week (they're out of the house now)
        const threatRank = threatLevel(s.weekStartState, s.history.slice(0, -1), evictedId).rank;
        const report = exitReport({
            gs,
            week,
            evictedId,
            humanIds: s.humanIds,
            nominatorId: this.blameFor(evictedId),
            replacement: !!s.week.initialNoms && !s.week.initialNoms.includes(evictedId),
            said: (s.week.intel || {})[evictedId] || {},
            allies: this.allyIds(evictedId).filter((id) => !this.player(id).isEvicted),
            compWins: compWins(me, s.history),
            timesNominated: me.nominations,
            brokenPromises: this.ledger.pledges.filter((p) => p.fromId === evictedId && p.status === "broken").length,
            threatRank,
            houseSize,
        });
        s.week.exitShown = [...(s.week.exitShown || []), evictedId];
        this.save();
        const scene = new Scene({
            title: "Why you went home",
            gameState: gs,
            content: (
                <div className="bbb-exit">
                    <h3>🚪 {me.name}, here's why you went home</h3>
                    <p className="bbb-exit-headline">{report.headline}</p>
                    <div className="bbb-exit-part">
                        <b>🎯 How you got on the block</b>
                        {report.block.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                    </div>
                    {(report.against.length > 0 || report.secretVotes > 0) && (
                        <div className="bbb-exit-part">
                            <b>🗳️ Who voted you out</b>
                            {report.against.map((v) => (
                                <p key={v.name}>
                                    <b>{v.name}</b>
                                    {v.lied && <span className="bbb-exit-lied"> lied to your face</span>}: {v.why}.
                                </p>
                            ))}
                            {report.secretVotes > 0 && (
                                <p className="bbb-subtle">
                                    {report.secretVotes === 1 ? "One more vote came" : `${report.secretVotes} more votes came`} from other players. Their votes stay secret.
                                </p>
                            )}
                        </div>
                    )}
                    {report.kept.length > 0 && (
                        <div className="bbb-exit-part">
                            <b>🤝 Who tried to keep you</b>
                            <p>{report.kept.join(", ")}.</p>
                        </div>
                    )}
                    <div className="bbb-exit-part">
                        <b>💡 For next time</b>
                        {report.lessons.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                    </div>
                    <NextEpisodeButton />
                </div>
            ),
        });
        this.privately(evictedId, `${me.name}, before you go`, () => this.show({ kind: "scene", scene }));
    }

    protected fallout() {
        const s = this.state;
        const last = s.history[s.history.length - 1];
        const leaving = last
            ? last.evictedIds.find((id) => this.isHuman({ id }) && this.player(id).isEvicted && !(s.week.exitShown || []).includes(id) && !this.isRuleBreaker(id) && !this.isAutopilot(id))
            : undefined;
        if (leaving !== undefined) return this.exitInterview(leaving);
        const list = s.week.hinky || [];
        const next = list.find((h) => !this.player(h.voterId).isEvicted && !this.player(h.targetId).isEvicted && this.isHuman({ id: h.voterId }));
        if (!next) return this.goodbyes();
        const voter = this.player(next.voterId);
        const target = this.player(next.targetId);
        const nomIds = s.week.nomineeIds || [];
        const options = nonEvictedHouseguests(s.gameState).filter(
            (hg) => hg.id !== voter.id && hg.id !== target.id && hg.id !== s.week.hohId && !nomIds.includes(hg.id)
        );
        this.privately(voter.id, `${voter.name}, about that vote`, () =>
            this.show({
                kind: "choose",
                actorId: voter.id,
                title: "Rogue Vote",
                text: `You voted to evict ${target.name}, and ${target.name} is still here, wondering who it was. Pin your vote on someone else, or keep quiet and hope nobody figures it out?`,
                options,
                count: 1,
                noneLabel: "Keep quiet",
                confirmLabel: "Pin it on them",
                resolve: (ids) => {
                    this.reseed(`blame:${voter.id}`);
                    const result = this.mutate((gs) => blameVote(gs, this.ledger, voter.id, target.id, ids.length > 0 ? ids[0] : null));
                    this.tellAll(result.news);
                    s.week.hinky = list.filter((h) => h !== next);
                    this.save();
                    this.show({
                        kind: "scene",
                        scene: new Scene({
                            title: "Rogue Vote",
                            gameState: s.gameState,
                            content: (
                                <div style={{ textAlign: "center" }}>
                                    <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🗳️ Rogue Vote</h3>
                                    <p>
                                        {result.good ? "👍" : "👎"} {result.text}
                                    </p>
                                    <NextEpisodeButton />
                                </div>
                            ),
                        }),
                    });
                },
            })
        );
    }

    // Called by the social screen when the current player is done: on to alliance time.
    public endSocial = () => {
        const s = this.state;
        const actor = this.socialActor;
        if (actor) {
            s.news[actor.id] = [];
            s.approaches[actor.id] = this.approachesFor(actor.id).filter((a) => a.kind === "invite");
        }
        const by = actor && this.socialTogether && s.socialBy ? s.socialBy[actor.id] : undefined;
        if (by) {
            if (by.stage !== "social") return;
            by.stage = "alliance";
        } else s.socialStage = "alliance";
        this.save();
        this.run();
    };

    // Alliance time: the current player suggests a target. The alliance meets once every player in it has
    // weighed in this block (bots always have an opinion).
    public allianceSuggest(allianceId: number, targetId: number | null, backupId: number | null = null): string[] {
        const s = this.state;
        const actor = this.socialActor;
        const a = getAlliance(s.book, allianceId);
        if (!a || a.met || this.allianceStandsDown(a)) return [];
        a.suggestions[actor.id] = targetId;
        a.backupSuggestions = { ...(a.backupSuggestions || {}), [actor.id]: this.planBWeek && backupId !== targetId ? backupId : null };
        a.memberIds.forEach((m) => this.noteRead(actor.id, m)); // alliance time: you get a read on your allies
        const by = this.socialTogether ? s.socialBy : undefined;
        const later = by
            ? // online: players in it who are still at it and haven't had their say
              a.memberIds
                  .filter((id) => id !== actor.id && by[id] && by[id].stage !== "done" && a.suggestions[id] === undefined)
                  .map((id) => this.player(id))
            : this.turnOrder.slice(s.socialTurn + 1).filter((p) => a.memberIds.includes(p.id));
        if (later.length > 0) {
            this.save();
            return [`Your pick is in. ${later.map((p) => p.name).join(" and ")} will weigh in before ${a.name} decides.`];
        }
        this.reseed(`meeting:${a.id}`);
        const result = this.mutate((gs) => holdMeeting(gs, a, s.humanIds, this.targetBlock(), this.targetExclude(), this.planBWeek));
        this.tellAlliance(a, `🤝 ${a.name} met. ${result.lines[result.lines.length - 1]}`, actor.id);
        result.lines.forEach((line) => s.socialLog.push(`🤝 ${line}`));
        if (a.chemistry <= 0) this.dissolve(a);
        this.save();
        return result.lines;
    }

    // A split alliance meeting: the player argues for a target, or goes along with the alliance's pick.
    public allianceDiscuss(allianceId: number, move: { kind: "argue"; targetId: number } | { kind: "concede" }): string[] {
        const s = this.state;
        const actor = this.socialActor;
        const a = getAlliance(s.book, allianceId);
        if (!a || !actor || !a.memberIds.includes(actor.id) || !meetingSplit(s.gameState, a)) return [];
        this.reseed(`discuss:${a.id}`);
        const result = this.mutate((gs) => discussTarget(gs, a, actor.id, s.humanIds, move));
        this.tellAlliance(a, `💬 ${a.name} talked it out. ${result.lines[result.lines.length - 1]}`, actor.id);
        result.lines.forEach((line) => s.socialLog.push(`💬 ${line}`));
        this.save();
        return result.lines;
    }

    public renameAlliance(allianceId: number, name: string) {
        const a = getAlliance(this.book, allianceId);
        if (!a) return;
        a.name = cleanName(name, this.book);
        this.save();
    }

    // Backstab: leak the alliance's plans to an outsider.
    public leak(allianceId: number, outsiderId: number): MoveOutcome[] {
        const a = getAlliance(this.book, allianceId);
        const actor = this.socialActor;
        if (!a) return [];
        this.reseed(`leak:${a.id}:${outsiderId}`);
        const members = a.memberIds.filter((m) => m !== actor.id);
        const out = this.mutate((gs) => leakAlliance(gs, this.book, a, actor.id, outsiderId));
        if (!a.memberIds.includes(actor.id)) this.tell(members, out[out.length - 1].text);
        out.forEach((o) => this.state.socialLog.push(`${o.good ? "👍" : "👎"} ${o.text}`));
        this.save();
        return out;
    }

    // Alliances that end up with exactly the same members become one (the strongest keeps its name).
    protected mergeTwinAlliances() {
        mergeTwins(this.state.gameState, this.state.book).forEach(({ into, merged }) => {
            const text = `🔗 ${merged.name} and ${into.name} have the same members now, so they're one alliance: ${into.name}.`;
            this.tellAlliance(into, text);
            this.watchNote(text);
        });
    }

    // Called by the alliance screen: merge one of the player's alliances into another of theirs. The bots who'd
    // be getting new allies have to agree. Once per pair a week.
    public mergeAlliances(intoId: number, otherId: number): MoveOutcome | null {
        const s = this.state;
        const into = getAlliance(this.book, intoId);
        const other = getAlliance(this.book, otherId);
        const actor = this.socialActor;
        if (!into || !other || into.id === other.id || !into.memberIds.includes(actor.id) || !other.memberIds.includes(actor.id)) return null;
        const key = [into.id, other.id].sort((a, b) => a - b).join(":");
        if ((s.week.mergeTries || []).includes(key)) return { text: `You already tried to merge ${into.name} and ${other.name} this week.`, good: false };
        s.week.mergeTries = [...(s.week.mergeTries || []), key];
        this.reseed(`merge:${key}`);
        const otherName = other.name;
        const out = this.mutate((gs) => proposeMerge(gs, this.book, actor.id, into, other, s.humanIds));
        this.tellAlliance(
            into,
            out.good ? `🔗 ${actor.name} merged ${otherName} into ${into.name}.` : `🔗 ${actor.name} wanted to merge ${otherName} and ${into.name}. It didn't happen.`,
            actor.id
        );
        if (out.good) this.watchNote(`🔗 ${otherName} merged into ${into.name}.`);
        s.socialLog.push(`${out.good ? "👍" : "👎"} ${out.text}`);
        this.save();
        return out;
    }

    public leave(allianceId: number): MoveOutcome | null {
        const a = getAlliance(this.book, allianceId);
        const actor = this.socialActor;
        if (!a) return null;
        const out = this.mutate((gs) => leaveAlliance(gs, this.book, a, actor.id));
        this.tellAlliance(a, `🚪 ${actor.name} walked out on ${a.name}.`, actor.id);
        this.state.socialLog.push(`👎 ${out.text}`);
        this.save();
        return out;
    }

    protected dissolve(a: Alliance) {
        this.state.book.alliances = this.state.book.alliances.filter((x) => x.id !== a.id);
        this.tellAlliance(a, `💔 ${a.name} has fallen apart.`);
        this.watchNote(`💔 ${a.name} has fallen apart.`);
    }

    // Called by the alliance screen when the current player is done: next player's turn.
    public endAlliance = () => {
        const s = this.state;
        const actor = this.socialActor;
        if (actor) s.approaches[actor.id] = [];
        const by = actor && this.socialTogether && s.socialBy ? s.socialBy[actor.id] : undefined;
        if (by) {
            if (by.stage !== "alliance") return;
            by.stage = "done";
            this.save();
            return this.run();
        }
        s.socialTurn++;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
        this.save();
        this.run();
    };

    // Before the Veto Ceremony, bot nominees beg a bot veto holder, and a bot HoH leans on them: the house sees it.
    // Whether there's anyone left to name as a replacement if the veto is used (not the nominees, the veto holder or
    // the HoH).
    protected vetoUsable(nomineeIds: number[], povId: number, hohId: number): boolean {
        const out = [...nomineeIds, povId, hohId];
        return nonEvictedHouseguests(this.gameState).some((hg) => !out.includes(hg.id));
    }

    protected vetoLobbying() {
        const s = this.state;
        const povId = s.week.povId;
        const noms = s.week.nomineeIds || [];
        if (povId === undefined || this.isHuman({ id: povId }) || noms.includes(povId)) return;
        const pov = this.player(povId);
        const bot = (id: number) => !this.isHuman({ id }) && !this.player(id).isEvicted;
        this.reseed("lobbying");
        noms.filter(bot).forEach((id) => {
            if (Math.abs(rng().randomFloat()) > 0.7) return;
            this.mutate((gs) => shiftRelationship(gs, id, povId, 0.02 * socialFactor(getById(gs, id))));
            this.feedPush(`🏅 ${this.player(id).name} spent the afternoon begging ${pov.name} to use the ${VETO}.`);
        });
        const hohId = s.week.hohId;
        if (hohId !== undefined && hohId !== povId && !s.week.secretHoh && bot(hohId) && Math.abs(rng().randomFloat()) < 0.6)
            this.feedPush(`👑 ${this.player(hohId).name} leaned on ${pov.name} to keep the nominations the same.`);
    }

    protected finishSocialBlock() {
        const s = this.state;
        const blockName = socialBlockName(s.step)!;
        this.reseed("bots");
        this.feedPush(
            ...houseFeed(
                s.gameState,
                {
                    humanIds: s.humanIds,
                    hohId: s.week.hohId,
                    secretHoh: s.week.secretHoh,
                    nomineeIds: s.week.nomineeIds || [],
                    showmances: this.showmances,
                    personalities: this.personalities,
                    rivalries: this.rivalries,
                },
                () => Math.abs(rng().randomFloat())
            )
        );
        if (s.step === Step.SocialVeto) this.vetoLobbying();
        let fought: number[] | null = null;
        const newCouples: Showmance[] = [];
        this.mutate((gs) => {
            // alliances that haven't met yet meet now (players who skipped alliance time don't get a say)
            s.book.alliances
                .filter((a) => !a.met && aliveMembers(gs, a).length >= 2 && this.allianceMeetsNow(a) && !this.allianceStandsDown(a))
                .forEach((a) => {
                    const result = holdMeeting(gs, a, s.humanIds, this.targetBlock(), this.targetExclude(), this.planBWeek);
                    this.tellAlliance(a, `🤝 ${a.name} met without you. ${result.lines[result.lines.length - 1]}`);
                    this.watchMeeting(gs, a, result);
                });
            s.book.alliances.filter((a) => a.chemistry <= 0).forEach((a) => this.dissolve(a));
            this.tellAll(compareNotes(gs, this.ledger, gs.phase));
            this.tellAll(checkRumours(gs, this.ledger, gs.phase));
            this.tellAll(exposeAllianceHoppers(gs, this.ledger, s.book));
            this.tellAll(walkedInOn(gs, s.book, s.humanIds));
            botRumours(gs, s.humanIds, (id) => (this.traitsOf(id) || { scheming: 1 }).scheming).forEach((r) => {
                if (r.known) reveal(this.ledger, r.fromId, r.aboutId, gs.phase);
                this.watchNote(`🗯️ ${getById(gs, r.fromId).name} spread a rumour about ${getById(gs, r.aboutId).name}${r.known ? ", and got caught" : ""}.`);
                this.tell(
                    [r.aboutId],
                    `🗯️ Someone's been spreading rumours about you${r.known ? `. Word is it was ${getById(gs, r.fromId).name}` : ""}.`
                );
            });
            const fight = botFight(gs, this.ledger, s.humanIds, (id) =>
                this.personalities[id] === "villain"
                    ? 2.5
                    : this.personalities[id] === "wildcard" || this.personalities[id] === "paranoid"
                    ? 1.5
                    : this.personalities[id] === "sweetheart"
                    ? 0.3
                    : 1
            );
            if (fight) {
                const a = getById(gs, fight.aId).name;
                const sides = sidesText(gs, fight.aId, fight.bId, fight.sides);
                this.watchNote(`💥 ${a} and ${getById(gs, fight.bId).name} blew up at each other. ${sides}`);
                if (this.isHuman({ id: fight.bId })) this.tell([fight.bId], `💥 ${a} blew up at you in front of everyone. ${sides}`);
                this.askOthersToPickSides(fight.aId, fight.bId, `💥 ${a} and ${getById(gs, fight.bId).name} blew up at each other. ${sides}`);
                fought = [fight.aId, fight.bId];
            }
            botSocialTime(
                gs,
                s.humanIds,
                (id) => {
                    const traits = this.traitsOf(id) || { chats: 1, scheming: 1 };
                    // Have-Nots don't get around the house much
                    return this.isHaveNot(id) ? { ...traits, chats: traits.chats * 0.4 } : traits;
                },
                this.watching ? (line) => this.watchNote(line) : undefined
            );
            this.wildcardSwings(gs);
            botShowmances(gs, this.showmances, s.humanIds, (id) => (this.personalities[id] === "charmer" ? 2 : 1)).forEach((sm) => {
                this.showmances.push(sm);
                newCouples.push(sm);
                this.watchNote(`💕 ${getById(gs, sm.a).name} and ${getById(gs, sm.b).name} are a showmance.`);
                this.tell(s.humanIds, `💕 The house is buzzing: ${getById(gs, sm.a).name} and ${getById(gs, sm.b).name} are a showmance.`);
            });
            botAllianceTime(gs, s.book, s.humanIds, this.watching ? (line) => this.watchNote(line) : undefined).forEach((invite) => {
                s.approaches[invite.toId] = [
                    ...(s.approaches[invite.toId] || []),
                    { kind: "invite", fromId: invite.fromId, allianceId: invite.allianceId, name: invite.name },
                ];
            });
            s.book.alliances.forEach((a) => {
                a.met = false;
                a.suggestions = {};
                a.backupSuggestions = {};
            });
        });
        // what the whole house saw: new couples, new feuds, and feuds that ended
        newCouples.forEach((sm) => this.feedPush(`💕 ${this.player(sm.a).name} and ${this.player(sm.b).name} are officially a showmance.`));
        if (fought) this.startRivalry(fought[0], fought[1]);
        this.settleRivalries();
        if (this.allianceTimeOpen() && s.step !== Step.SocialMorning) s.allianceMet = this.allianceSituation;
        // in pass-and-play, social moves are secret, so they don't go in the episode recap
        if (!this.multiplayer && s.socialLog.length > 0) {
            const log = [...s.socialLog];
            this.weekScenes.push(
                new Scene({
                    title: blockName,
                    gameState: s.gameState,
                    content: (
                        <div style={{ textAlign: "center" }}>
                            <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>{blockName}</h3>
                            {log.map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                            <NextEpisodeButton />
                        </div>
                    ),
                })
            );
        }
        s.socialLog = [];
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
        delete s.socialBy;
        if (this.watching) {
            const log = this.watchLog;
            this.watchLog = [];
            this.announce(`🔍 Behind the scenes: ${blockName}`, log.length > 0 ? log : ["A quiet one. Nobody made a move."]);
        }
        this.goTo(afterSocial(s.step));
    }

    // Watching: an alliance meeting, from the inside.
    protected watchMeeting(gs: GameState, a: Alliance, result: { targetId: number | null; backupId?: number | null }) {
        if (!this.watching) return;
        const members = listNames(aliveMembers(gs, a).map((m) => m.name));
        if (result.targetId === null) return this.watchNote(`🤝 ${a.name} (${members}) met, and couldn't agree on a target.`);
        const backup = result.backupId !== undefined && result.backupId !== null ? `, with ${getById(gs, result.backupId).name} as plan B` : "";
        this.watchNote(`🤝 ${a.name} (${members}) met and agreed to go after ${getById(gs, result.targetId).name}${backup}.`);
    }

    protected hohComp() {
        const s = this.state;
        const competitors = exclude(nonEvictedHouseguests(s.gameState), s.gameState.previousHOH || []);
        const title = "Head of Household Competition";
        const onWinner = (winnerId: number, worstFirst: number[]) => {
            const [gs, scene, hohs] = generateHohCompScene(s.gameState, { forcedWinners: [getById(s.gameState, winnerId)] });
            s.gameState = gs;
            s.week.hohId = hohs[0].id;
            this.pawnMemories(hohs[0].id);
            if (!s.week.fast) this.pickHaveNots(worstFirst);
            if (!s.week.secretHoh) {
                this.feedPush(`👑 ${hohs[0].name} is the new ${HOH}.`);
                return this.showScene(scene, Step.AllianceHoh);
            }
            const yours = s.humanIds.length === 1 && this.isHuman(hohs[0]);
            this.showScene(
                this.textScene(`${HOH} Competition`, [
                    `🕶️ A new ${HOH} has been crowned… in secret.`,
                    `This week, nobody knows who the ${HOH} is, or who nominated them.`,
                    ...(yours ? ["🤫 It's you. Nobody else knows."] : []),
                ]),
                Step.AllianceHoh
            );
        };
        const choice = this.pickComp(competitors, true);
        if (choice === KNOCKOUT_ID) return this.runKnockout(title, competitors, onWinner);
        if (choice === TAINTED_WINE_ID) return this.runTaintedWine(title, competitors, onWinner);
        if (choice === MEMORY_DUEL_ID) return this.runMemoryDuel(title, competitors, onWinner);
        this.runComp(title, compById(choice), competitors, onWinner, "hoh");
    }

    // ---------- Have-Nots ----------

    // The worst scorers in the HoH comp are this week's Have-Nots. Until the next HoH comp (the week's end), they get
    // one social action per block, and a human Have-Not's screen goes grey, comps included. Only in the first half
    // of the season: once half the house is gone, no more Have-Nots.
    protected pickHaveNots(worstFirst: number[]) {
        const s = this.state;
        const all = s.gameState.houseguests;
        const halfGone = all.filter((hg) => hg.isEvicted).length * 2 >= all.length;
        const ids = halfGone ? [] : worstFirst.slice(0, haveNotCount(nonEvictedHouseguests(s.gameState).length));
        s.week.haveNots = ids;
        if (ids.length === 0) return;
        const names = listNames(ids.map((id) => this.player(id).name));
        this.feedPush(`🥫 ${names} ${ids.length === 1 ? "is" : "are"} this week's Have-Not${ids.length === 1 ? "" : "s"}.`);
        this.tell(ids, "🥫 You scored among the worst in the HoH comp, so you're a Have-Not this week: one social action per block, and the house in greyscale (comps too), until the next HoH comp.");
        this.announce("🥫 The Have-Nots", [
            `The worst scores in the ${HOH} competition: ${names}.`,
            `Until the next ${HOH} comp, they only have the energy for one social action at a time, and the house is in greyscale for them, comps included.`,
        ]);
    }

    // A Have-Not (who sees in greyscale) is in this comp: nothing played by colour.
    protected haveNotCompeting(competitors: Houseguest[]): boolean {
        return competitors.some((c) => this.isHaveNot(c.id) && !this.player(c.id).isEvicted);
    }

    public isHaveNot(id: number): boolean {
        return (this.state.week.haveNots || []).includes(id);
    }

    // ---------- the Battle Back ----------

    get battleBackSlot(): PowerSlot | undefined {
        return this.powers.slots.find((sl) => sl.id === "battleBack");
    }

    // Once a season, when the twist is on: right before the jury starts, the evicted houseguests compete to come back.
    protected battleBackDue(): boolean {
        const slot = this.battleBackSlot;
        return !!slot && !slot.used && battleBackDue(this.gameState, this.candidatesForBattleBack().length);
    }

    protected candidatesForBattleBack(): Houseguest[] {
        return battleBackCandidates(this.gameState).filter((hg) => !this.isRuleBreaker(hg.id));
    }

    protected battleBack() {
        const s = this.state;
        const slot = this.battleBackSlot;
        const candidates = this.candidatesForBattleBack();
        if (!slot || slot.used || candidates.length < 2) return this.goTo(Step.WeekStart);
        if (!this.locked("battleBackIntro")) {
            this.lock("battleBackIntro", true);
            this.announce("🔙 Battle Back", [
                "Before the next week begins, a twist: the evicted houseguests are coming back to the house…",
                `…for one competition. ${listNames(candidates.map((hg) => hg.name))} will battle it out, and the winner returns to the game.`,
            ]);
            return this.run();
        }
        const comp = compById(this.compChoice(() => pickQuickComp(s.gameState, s.history, s.usedComps, this.rules.kinds, this.haveNotCompeting(candidates)).id));
        this.runComp("🔙 Battle Back Competition", comp, candidates, (winnerId) => {
            const back = this.player(winnerId);
            const wasJuror = back.isJury;
            this.mutate((gs) => {
                const hg = getById(gs, winnerId);
                hg.isEvicted = false;
                hg.isJury = false;
                gs.nonEvictedHouseguests.add(winnerId);
                gs.remainingPlayers++;
            });
            slot.used = true;
            slot.holderId = winnerId;
            slot.week = s.gameState.phase + 1;
            this.feedPush(`🔙 ${back.name} won the Battle Back and is back in the house!`);
            this.logMove("move", winnerId, undefined, `${back.name} won the Battle Back and came back from eviction`, 3);
            this.addDiary(s.gameState.phase, winnerId, ["I got a second chance. I'm not wasting it."]);
            this.tell(
                this.state.humanIds.filter((id) => id !== winnerId),
                `🔙 ${back.name} won the Battle Back. They're back in the house, and they remember everything.`
            );
            this.tell([winnerId], "🔙 You won the Battle Back! You're back in the game. Everyone knows who sent you out.");
            this.showScene(
                this.textScene("🔙 Battle Back", [
                    `${back.name} has won the Battle Back!`,
                    `${back.name} walks back through the front door and rejoins the game${wasJuror ? ", giving up their seat on the jury" : ""}.`,
                    candidates.length > 2
                        ? `${listNames(candidates.filter((c) => c.id !== winnerId).map((c) => c.name))} stay evicted.`
                        : `${candidates.find((c) => c.id !== winnerId)!.name} stays evicted.`,
                ]),
                Step.WeekStart
            );
        });
    }

    // ---------- the diary room ----------

    protected addDiary(week: number, id: number, lines: string[]) {
        const s = this.state;
        s.diary = [...(s.diary || []), { week, id, lines }];
    }

    // What houseguests said in the diary room about the week that just ended.
    protected writeDiary(week: number, votes: { [voterId: number]: number }, evictedIds: number[]) {
        const s = this.state;
        const record = s.history.find((w) => w.week === week);
        const entries = diaryEntries({
            seed: s.seed,
            week,
            gameState: s.gameState,
            record,
            votes,
            evictedIds,
            playerIds: s.humanIds.filter((id) => !this.isRuleBreaker(id)),
            initialNoms: s.week.initialNoms || [],
            secretHoh: !!s.week.secretHoh,
            haveNots: s.week.haveNots || [],
            pledges: this.ledger.pledges,
            moves: (s.moves || []).filter((m) => m.week === week),
            hohRoomSafe: s.week.room ? s.week.room.promised || [] : [],
        });
        s.diary = [...(s.diary || []), ...entries];
    }

    public diaryOf(week?: number): DiaryEntry[] {
        return (this.state.diary || []).filter((e) => week === undefined || e.week === week);
    }

    // The whole season as text, to copy and share.
    public seasonRecapText(): string {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        return recapText({
            gameState: gs,
            history: s.history,
            diary: s.diary || [],
            winnerId: log ? log.winner : undefined,
            battleBack: this.battleBackSlot && this.battleBackSlot.used ? { id: this.battleBackSlot.holderId!, week: this.battleBackSlot.week } : undefined,
        });
    }
}
