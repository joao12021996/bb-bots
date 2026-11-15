import React from "react";
import { GameState, getById, Houseguest, MutableGameState, nonEvictedHouseguests } from "../model";
import { rng } from "../utils";
import { BigBrotherVanilla, defaultContent } from "../components/episode/bigBrotherEpisode";
import { BigBrotherFinale } from "../components/episode/bigBrotherFinale";
import { prepareNextWeek } from "../components/episode/episodeFactory";
import { Scene } from "../components/episode/scenes/scene";
import { PledgeKind } from "./social/promises";
import {
    answerPitch,
    Approach,
    botApproaches,
    performSocialAction,
    shiftRelationship,
    setRelationship,
    socialFactor,
    DealAction,
    isDealAction,
    SocialAction,
    SocialOutcome,
} from "./social/socialActions";
import {
    addMember,
    Alliance,
    aliveMembers,
    botVote,
    cleanName,
    createAlliance,
    getAlliance,
    holdMeeting,
    proposeAlliance,
    pruneAlliances,
} from "./social/alliances";
import { Deal } from "./social/hohRoom";
import { weekStartDay } from "./days";
import { POWERS } from "./social/powers";
import { makeYourCase, offerFinal3, Pact } from "./social/endgame";
import { previouslyOn } from "./social/narration";
import { HOH, VETO } from "./terms";
import {
    emptyLedger,
    trustLabel,
    trustOf,
    Ledger,
    LedgerNews,
    pledge,
    promisedVotes,
    checkVoteClaims,
    settleEvictionPledges,
    hasFinal2,
    reputation,
    reputationLabel,
} from "./social/promises";
import { Standing, WeekReview } from "./ui/weekReview";
import { reasonLine } from "./social/pitch";
import { feelingReply, mentionsIn, opinionReply, readMessage, Reply, TALK_MAX_LENGTH, TALKS_MIN, talkLine, talkPatience, TalkLine } from "./social/botTalk";
import {
    acceptFinal2,
    answerVoteQuestion,
    botDealApproaches,
    offerFinal2,
    offerVoteDeal,
    pityPitch,
    rumorFor,
    tellTarget,
    tellVote,
} from "./social/campaign";
import { counterName, countOnce } from "../analytics/analytics";
import { seedRng } from "./seeding";
import { apparentRelationship, hash01, noticedTells, PersonalityId, PersonalityInfo, Situation } from "./social/personality";
import { flirt, partnerOf, Showmance } from "./social/showmance";
import { compWins, confront, houseMeeting, snoop, spreadRumour, threatLevel, threatScoresFor } from "./social/drama";
import { JuryBook, JurorType } from "./social/jury";
import { feelingLabel } from "./social/socialActions";
import { doubleEvictionAt } from "./social/twists";
import { afterSocial, BLOCKBUSTER_MIN_PLAYERS, blockName as socialBlockName, isSocialStep, nomsSetStep, Step } from "./week";

import { CREEP_WEEKS, CREEP_LEVEL, APPROACH_ANSWERS } from "./controllerTypes";
import { ControllerComps } from "./controllerComps";

// The week's start and its social time: who's up, alliance rounds, approaches, what players learn about each other,
// deals and promises, the vote count, house drama, and talking to bots in your own words.
export abstract class ControllerSocial extends ControllerComps {
    // ---------- defined in a later part of the controller ----------
    public abstract get deals(): Deal[];
    protected abstract dissolve(a: Alliance): void;
    public abstract endAlliance: () => void;
    protected abstract endShowmances(evictedIds: number[]): void;
    public abstract endgameOpen(): boolean;
    public abstract feelingOf(viewerId: number, otherId: number): number;
    protected abstract finishSocialBlock(): void;
    protected abstract gossipFrom(botId: number, playerId: number, roll: number): string | null;
    protected abstract honor(botId: number, toId: number): number;
    public abstract isHaveNot(id: number): boolean;
    public abstract jurorTypeOf(id: number): JurorType;
    public abstract get juryBook(): JuryBook;
    protected abstract leastLiked(id: number, exceptId: number): string;
    public abstract madeCaseTo(playerId: number, botId: number): boolean;
    public abstract get pacts(): Pact[];
    public abstract get personalities(): {
        [id: number]: PersonalityId;
    };
    public abstract say(botId: number, situation: Situation, key: string, name?: string): string;
    public abstract showmancePartner(id: number): number | undefined;
    public abstract get showmances(): Showmance[];
    protected abstract startRivalry(aId: number, bId: number): void;
    public abstract targetExclude(): number[];
    public abstract traitsOf(id: number): PersonalityInfo | undefined;
    protected abstract watchMeeting(gs: GameState, a: Alliance, result: {
        targetId: number | null;
        backupId?: number | null;
    }): void;

    // ---------- steps ----------

    // The house's biggest threats, for the weekly review.
    protected topThreats(n: number): { id: number; emoji: string; label: string }[] {
        return nonEvictedHouseguests(this.gameState)
            .map((hg) => ({ id: hg.id, ...this.threatOf(hg.id) }))
            .sort((a, b) => a.rank - b.rank)
            .slice(0, n)
            .map((t) => ({ id: t.id, emoji: t.emoji, label: t.label }));
    }

    // Where a player stands: only shown when they're alone on their device (it's private).
    public standingOf(id: number): Standing | undefined {
        const s = this.state;
        if (this.net || s.humanIds.length !== 1 || this.player(id).isEvicted) return undefined;
        const others = nonEvictedHouseguests(this.gameState).filter((hg) => hg.id !== id);
        const reads = (s.reads && s.reads[id]) || {};
        const warm = others.filter((o) => reads[o.id] && reads[o.id].v > 0.25).length;
        const cold = others.filter((o) => reads[o.id] && reads[o.id].v < -0.25).length;
        const unknown = others.filter((o) => !reads[o.id]).length;
        const threat = this.threatOf(id);
        const rep = reputationLabel(reputation(this.ledger, id));
        const alliances = this.alliancesOf(id)
            .filter((a) => a.memberIds.filter((m) => !this.player(m).isEvicted).length >= 2)
            .map((a) => a.name);
        const tips: string[] = [];
        if (unknown >= 3) tips.push(`You don't have a read on ${unknown} houseguests yet. A chat tells you how they feel about you.`);
        if (alliances.length === 0) tips.push("Nobody has your back. An alliance can protect you on eviction night.");
        if (threat.rank === 0 || threat.label === "High") tips.push("You're one of the biggest targets. A final-two deal, or a quiet week in the comps, could take the heat off.");
        if (cold > warm && cold >= 2) tips.push("More people seem wary of you than friendly. Spend a few actions mending fences.");
        if (reputation(this.ledger, id) < -0.3) tips.push("Your word isn't worth much right now. Keep your next few promises.");
        return { name: this.player(id).name, threat, reputation: rep, alliances, warm, cold, unknown, tips: tips.slice(0, 2) };
    }

    // Anonymous play counts (see analytics.ts): a season started, and how far seasons get.
    protected countWeek(finale: boolean) {
        const s = this.state;
        const season = String(s.seed);
        const mode = this.watching ? "watch" : this.net ? "online" : s.humanIds.length > 1 ? "pass" : "solo";
        if (s.history.length === 0) {
            countOnce(season, "start", counterName("start", mode), counterName("start:difficulty", this.difficulty), counterName("start:cast", s.gameState.houseguests.length));
        }
        countOnce(season, finale ? "week:finale" : counterName("week", Math.min(s.history.length + 1, 20)));
    }

    // All-Stars: returning houseguests who shared a season with one of the players don't start as strangers. They
    // pick up where it ended, softened by time, and the player is told.
    protected reunite() {
        const s = this.state;
        s.reunited = true;
        const humans = s.humanIds.map((id) => this.player(id));
        s.gameState.houseguests
            .filter((hg) => !this.isHuman(hg) && hg.past && hg.past.withPlayer)
            .forEach((bot) => {
                const w = bot.past!.withPlayer!;
                const player = humans.find((h) => h.name === w.name);
                if (!player) return;
                const start = Math.max(-0.5, Math.min(0.5, 0.5 * w.feeling));
                this.mutate((gs) => {
                    shiftRelationship(gs, bot.id, player.id, start);
                });
                this.noteIntel(player.id, bot.id, `🔁 You've played together before: ${w.why}.`);
                this.tell(
                    [player.id],
                    start > 0.1
                        ? `🔁 ${bot.name} lit up when they saw you: ${w.why}.`
                        : start < -0.1
                        ? `🔁 ${bot.name} hasn't forgotten: ${w.why}.`
                        : `🔁 ${bot.name} remembers you from last time.`
                );
            });
    }

    // The Double Eviction: once a season, when the house is down to the right size (see doubleEvictionAt).
    protected doubleEvictionDue(): boolean {
        const s = this.state;
        if (!this.rules.doubleEviction || s.doubleDone || s.history.length === 0) return false;
        return s.gameState.remainingPlayers === doubleEvictionAt(s.gameState.houseguests.length);
    }

    // On a Double Eviction night there's no social time, no HoH room, no pawn talk and no speeches: what comes
    // straight after this step instead (undefined: the step is played as usual).
    protected fastSkip(step: Step): Step | undefined {
        if (!this.state.week.fast) return undefined;
        if (isSocialStep(step)) return afterSocial(step);
        if (step === Step.AllianceHoh || step === Step.HohRoom) return Step.Noms;
        if (step === Step.PawnTalk) {
            // (it comes after the first nominations, and again after a replacement: on to wherever that was heading)
            const ask = this.state.week.pawnAsk;
            this.state.week.pawnAsk = undefined;
            return ask ? ask.next : Step.SocialAfternoon;
        }
        if (step === Step.Blockbuster || step === Step.Speeches) return Step.Eviction;
        return undefined;
    }

    protected weekStart() {
        const s = this.state;
        const remaining = s.gameState.remainingPlayers;
        if (remaining <= 2) return this.goTo(Step.GameOver);
        const finale = remaining === 3;
        // no relationships before the game: bots and players alike start as strangers, and forge them in the house
        s.gameState = prepareNextWeek(s.gameState, finale ? BigBrotherFinale : BigBrotherVanilla, s.castOptions, true);
        s.weekStartState = s.gameState;
        const fast = !finale && this.doubleEvictionDue();
        s.week = { blockbuster: !fast && this.rules.lastChance && !finale && remaining >= BLOCKBUSTER_MIN_PLAYERS, ...(fast ? { fast: true } : {}) };
        if (fast) s.doubleDone = true;
        s.deals = this.deals.filter((d) => d.week >= s.gameState.phase - 1);
        s.humanIds.forEach((id) => (this.socialMemory(id).chatsThisWeek = {}));
        s.socialLog = [];
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
        delete s.socialBy;
        pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
        const title = finale ? "Finale" : `Day ${weekStartDay(s.gameState, s.gameState.phase)}`;
        s.step = finale ? Step.SocialFinale1 : Step.SocialMorning;
        this.countWeek(finale);
        if (s.history.length === 0 && !s.reunited) this.reunite();
        // "Previously on…": last week, and last week's secret Head of Household, revealed
        const last = s.history[s.history.length - 1];
        const lastSecret = !!last && this.powers.slots.some((sl) => sl.id === "secretHoh" && sl.week === last.week);
        const recap = previouslyOn(s.gameState, last, [], lastSecret && last.hohId !== undefined ? this.player(last.hohId).name : undefined);
        if (!finale && !fast) this.startWeekPowers();
        // nothing's handed out on a Double Eviction night: whatever was due tonight comes next week instead
        if (fast) this.powers.slots.filter((sl) => sl.id !== "battleBack" && sl.week === s.gameState.phase && sl.holderId === undefined && !sl.used).forEach((sl) => (sl.week += 1));
        if (fast) {
            this.feedPush("⚡ It's a Double Eviction night!");
            this.announce("⚡ Double Eviction", [
                "The night isn't over. A second houseguest goes home tonight.",
                `A whole week, right now: a ${HOH} comp, nominations on the spot, the ${VETO}, and a live vote.`,
                "No time to talk, no time to plan. Whatever you set up before tonight is all you've got.",
            ]);
        }
        if (s.week.secretHoh)
            this.announce(`🕶️ ${POWERS.secretHoh.name}`, [`This week, the ${HOH} will be a secret. Nobody will know who it is, or who made the nominations.`]);
        this.save();
        this.show({
            kind: "scene",
            scene: new Scene({
                title,
                gameState: s.gameState,
                content: (
                    <div>
                        <div className="bbb-host">
                            {recap.map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                        {last && (
                            <WeekReview
                                gs={s.gameState}
                                week={last}
                                threats={this.topThreats(3)}
                                standing={this.standingOf(s.humanIds[0])}
                            />
                        )}
                        {defaultContent(s.gameState)}
                    </div>
                ),
            }),
        });
    }

    protected social() {
        const s = this.state;
        const alive = this.turnOrder;
        // alliance time first: alliances plan before everyone goes off to work the house (and meet again after)
        if (s.allianceFirst !== this.blockKey && !this.allianceFirstRound(socialBlockName(s.step)!, alive)) return;
        if (this.socialTogether) {
            const players = alive.filter((p) => this.isHuman(p));
            if (this.together(socialBlockName(s.step)!, "social", players)) return;
            return this.finishSocialBlock();
        }
        if (s.socialTurn >= alive.length) return this.finishSocialBlock();
        const actor = alive[s.socialTurn];
        const blockName = socialBlockName(s.step)!;
        if (!this.isHuman(actor)) return this.skipTurn();
        if (s.socialStage === "alliance") {
            // at the final three there's nobody left to target: no alliance time
            // nothing to meet about: no alliances, or every one of them is all on the block
            if (this.meetingAlliancesOf(actor.id).every((a) => this.allianceStandsDown(a))) return this.endAlliance();
            this.privately(actor.id, `${actor.name}'s alliance time`, () =>
                this.show({ kind: "alliance", blockName, actorId: actor.id })
            );
            return;
        }
        this.startSocialTime(actor);
        this.privately(actor.id, `${actor.name}'s social time`, () => this.show({ kind: "social", blockName, actorId: actor.id }));
    }

    protected get blockKey(): string {
        return `${this.state.gameState.phase}:${this.state.step}`;
    }

    // What alliances plan around: who's HoH, who's on the block, who holds the veto. When none of that has changed
    // since they last met, there's nothing new to meet about before social time.
    protected get allianceSituation(): string {
        const w = this.state.week;
        return `${this.gameState.phase}:${w.hohId}:${(w.nomineeIds || []).join(",")}:${w.povId}`;
    }

    // Where alliance time is in this block: before social time, after it, or not now.
    public allianceRound(): "before" | "after" | null {
        if (!socialBlockName(this.state.step)) return null;
        return this.state.allianceFirst === this.blockKey ? "after" : "before";
    }

    // Online: whether a player who's done can go back to social time (not while alliance time comes first).
    public backToSocialOpen(): boolean {
        return this.allianceRound() === "after";
    }

    // Alliance time before a social block: each player meets with their alliances (online, all at once), then the
    // bots' alliances do. Then the alliances are free to meet again after social time. Returns whether it's over
    // (false: waiting on a player).
    protected allianceFirstRound(blockName: string, alive: Houseguest[]): boolean {
        const s = this.state;
        // nothing's changed since the alliances last met (same HoH, same nominees, same veto holder): no need to
        // meet first, just after
        if (s.allianceMet === this.allianceSituation) {
            s.allianceFirst = this.blockKey;
            this.save();
            return true;
        }
        const meets = (p: Houseguest) => this.isHuman(p) && this.meetingAlliancesOf(p.id).some((a) => !this.allianceStandsDown(a));
        const title = `${blockName}: alliances first`;
        if (this.socialTogether) {
            if (this.together(title, "alliance", alive.filter(meets))) return false;
        } else {
            while (s.socialTurn < alive.length && !meets(alive[s.socialTurn])) s.socialTurn++;
            if (s.socialTurn < alive.length) {
                const actor = alive[s.socialTurn];
                s.socialStage = "alliance";
                this.save();
                this.privately(actor.id, `${actor.name}'s alliance time`, () => this.show({ kind: "alliance", blockName: title, actorId: actor.id }));
                return false;
            }
        }
        this.reseed("alliances:first");
        this.mutate((gs) =>
            s.book.alliances
                .filter((a) => !a.met && aliveMembers(gs, a).length >= 2 && this.allianceMeetsNow(a) && !this.allianceStandsDown(a))
                .forEach((a) => this.watchMeeting(gs, a, holdMeeting(gs, a, s.humanIds, this.targetBlock(), this.targetExclude(), this.planBWeek)))
        );
        s.book.alliances.filter((a) => a.chemistry <= 0).forEach((a) => this.dissolve(a));
        s.book.alliances.forEach((a) => {
            a.met = false;
            a.suggestions = {};
            a.backupSuggestions = {};
        });
        s.allianceFirst = this.blockKey;
        s.allianceMet = this.allianceSituation;
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
        delete s.socialBy;
        this.save();
        return true;
    }

    // The start of a player's social time: other houseguests come to talk to them (once per social block).
    protected startSocialTime(actor: Houseguest) {
        const s = this.state;
        const key = `${s.gameState.phase}:${s.step}`;
        if (s.approachKey[actor.id] !== key) {
            s.approachKey[actor.id] = key;
            // the start of their turn: a Have-Not only has the energy for one action
            if (this.isHaveNot(actor.id)) this.spendActions(actor.id, Math.max(0, this.actionsOf(actor.id) - 1));
            this.reseed(`approach:${actor.id}`);
            const fresh = this.mutate((gs) => botApproaches(gs, s.book, actor.id, s.humanIds)).map((a) =>
                a.kind === "chat" && this.personalities[a.fromId]
                    ? { ...a, text: `${this.player(a.fromId).name} ${this.say(a.fromId, "chat", `${s.step}:${actor.id}`, this.leastLiked(a.fromId, actor.id))}` }
                    : a
            );
            const deals = botDealApproaches(
                new MutableGameState(s.gameState),
                this.ledger,
                actor.id,
                s.humanIds,
                s.week.nomineeIds || [],
                s.step === Step.SocialCampaign,
                s.week.hohId
            );
            const pleas = this.vetoPleas(actor.id);
            s.approaches[actor.id] = [...(s.approaches[actor.id] || []), ...pleas, ...fresh, ...deals];
            [...pleas, ...fresh, ...deals].forEach((a) => this.noteRead(actor.id, a.fromId));
            this.save();
        }
    }

    // After the veto comp, the nominees (and the HoH) come to a player who holds the veto to make their case: "use it
    // on me", "keep the nominations the same". A veto holder on the block is saving themselves: nobody bothers.
    protected vetoPleas(povId: number): Approach[] {
        const s = this.state;
        const noms = s.week.nomineeIds || [];
        if (s.step !== Step.SocialVeto || s.week.povId !== povId || noms.includes(povId)) return [];
        const bot = (id: number) => !this.isHuman({ id }) && !this.player(id).isEvicted;
        const out: Approach[] = noms.filter(bot).map((id) => ({ kind: "vetoPlea" as const, fromId: id }));
        const hohId = s.week.hohId;
        if (hohId !== undefined && hohId !== povId && !s.week.secretHoh && bot(hohId)) out.push({ kind: "vetoKeep", fromId: hohId });
        return out;
    }

    // Online: every player's social (or alliance) time at once, each on their own screen, while the shared screen
    // says who's still at it. A player who's done waits on a screen of their own, and can go back (backToSocial)
    // until everyone's done. Returns whether anyone's still at it; false: the block is over.
    protected together(blockName: string, start: "social" | "alliance", players: Houseguest[]): boolean {
        const s = this.state;
        const by = (s.socialBy = s.socialBy || {});
        players.forEach((p) => {
            if (!by[p.id]) by[p.id] = { stage: start, actions: this.rules.actions };
        });
        // nothing to meet about (no alliances, or every one of them stands down): straight past alliance time
        players.forEach((p) => {
            if (by[p.id].stage === "alliance" && this.meetingAlliancesOf(p.id).every((a) => this.allianceStandsDown(a)))
                by[p.id].stage = "done";
        });
        const ids = players.map((p) => p.id);
        // players who left (a bot took over, or expelled) lose their screens
        Object.keys(this.personal$.value)
            .map(Number)
            .filter((id) => !ids.includes(id))
            .forEach((id) => this.clearPersonal(id));
        const busy = players.filter((p) => by[p.id].stage !== "done");
        if (busy.length === 0) {
            this.gatherBot = null;
            players.forEach((p) => this.clearPersonal(p.id));
            return false;
        }
        players.filter((p) => by[p.id].stage === "social").forEach((p) => this.startSocialTime(p));
        // a bot finishing for a player who ran out of time, or whose device went away
        this.gatherBot = (id) => {
            const mine = by[id];
            if (!mine || mine.stage === "done") return;
            mine.stage = "done";
            this.save();
            this.run();
        };
        this.save();
        this.show({ kind: "waiting", title: blockName, waitingOn: busy.map((p) => p.id) });
        // only screens that changed: a player in the middle of something keeps their screen as it is
        players.forEach((p) => {
            const stage = by[p.id].stage;
            const kind = stage === "social" ? "social" : stage === "alliance" ? "alliance" : "socialDone";
            const up = this.personal$.value[p.id];
            if (up && up.kind === kind) return;
            this.showPersonal(p.id, kind === "socialDone" ? { kind, actorId: p.id, blockName } : { kind, blockName, actorId: p.id });
        });
        return true;
    }

    // Online: a player who's moved on from social time (to alliance time, or done) goes back to it, say to answer
    // someone who texted them. Only while the block's still going.
    public backToSocial() {
        const s = this.state;
        const id = this.actingFor;
        const by = s.socialBy && id !== null ? s.socialBy[id] : undefined;
        if (!this.socialTogether || !by || by.stage === "social" || !this.backToSocialOpen()) return;
        by.stage = "social";
        this.save();
        this.run();
    }

    // Called by the social screen.
    // `talking`: done in a conversation (see talkToBot), which already took its action: only a house meeting's
    // second action is left to pay.
    public socialAct(action: SocialAction, talking: boolean = false): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        const cost = (action.kind === "meeting" ? 2 : 1) - (talking ? 1 : 0);
        if (!actor || this.actionsOf(actor.id) < cost || (!talking && cost <= 0)) return null;
        if (action.kind === "meeting" && (s.week.meetingBy || []).includes(actor.id)) return null;
        this.reseed("act");
        let outcome: SocialOutcome;
        if (action.kind === "alliance" && this.isHuman({ id: action.botId })) {
            // players invite each other: the other player answers on their own social turn
            const other = this.player(action.botId);
            const a = action.allianceId !== undefined ? getAlliance(s.book, action.allianceId) : undefined;
            const name = a ? a.name : cleanName(action.name || "", s.book);
            s.approaches[other.id] = [
                ...(s.approaches[other.id] || []),
                { kind: "invite", fromId: actor.id, allianceId: a ? a.id : undefined, name },
            ];
            outcome = {
                text: `You asked ${other.name} to join ${name}. They'll answer on their ${this.socialTogether ? "social screen" : "social turn"}.`,
                good: true,
            };
        } else if (action.kind === "alliance") {
            const { botId, allianceId, name } = action;
            outcome = this.mutate((gs) => proposeAlliance(gs, s.book, actor.id, botId, { allianceId, name }));
        } else if (isDealAction(action)) {
            outcome = this.mutate((gs) => this.dealAction(gs, actor.id, action));
        } else {
            outcome = this.mutate((gs) => performSocialAction(gs, actor.id, action, this.socialMemory(actor.id)));
        }
        this.spendActions(actor.id, cost);
        const withId = (action as { botId?: number }).botId;
        if (withId !== undefined) this.noteRead(actor.id, withId, action.kind !== "chat");
        s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.save();
        return outcome;
    }

    // The current player answers someone who came to talk to them. Answering is free (no action used).
    public respondApproach(index: number, accept: boolean): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        const list = this.approachesFor(actor.id);
        const approach = list[index];
        if (!approach) return null;
        s.approaches[actor.id] = list.filter((_, i) => i !== index);
        this.reseed(`respond:${index}:${list.length}`);
        const from = this.player(approach.fromId);
        let outcome: SocialOutcome | null = null;
        if (approach.kind === "pitch") {
            outcome = this.mutate((gs) => answerPitch(gs, actor.id, approach.fromId, approach.targetId, accept));
        } else if (approach.kind === "invite") {
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.04);
                    this.tell([from.id], `${actor.name} turned down your alliance offer.`);
                    return { text: `You turned down ${from.name}'s alliance offer.`, good: false };
                }
                const existing = approach.allianceId !== undefined ? getAlliance(s.book, approach.allianceId) : undefined;
                if (existing && existing.memberIds.includes(from.id)) {
                    if (existing.memberIds.includes(actor.id)) return { text: `You're already in ${existing.name}.`, good: true };
                    addMember(gs, existing, actor.id);
                    this.tellAlliance(existing, `🤝 ${actor.name} joined ${existing.name}.`, actor.id);
                    return { text: `You joined ${existing.name}!`, good: true };
                }
                const a = createAlliance(gs, s.book, [from.id, actor.id], approach.name);
                this.tell([from.id], `🤝 ${actor.name} said yes: ${a.name} is official.`);
                return { text: `You and ${from.name} formed ${a.name}!`, good: true };
            });
        }
        if (approach.kind === "final2") {
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.04);
                    return { text: `You told ${from.name} you're not ready to promise the final 2.`, good: false };
                }
                acceptFinal2(gs, this.ledger, from.id, actor.id, gs.phase);
                return { text: `Final-two deal with ${from.name}: the two of you, to the end.`, good: true };
            });
        } else if (approach.kind === "vetoPlea" || approach.kind === "vetoKeep") {
            const use = approach.kind === "vetoPlea";
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.03);
                    return { text: `You didn't promise ${from.name} anything about the ${VETO}.`, good: false };
                }
                pledge(this.ledger, use ? "veto" : "noVeto", actor.id, from.id, gs.phase);
                shiftRelationship(gs, actor.id, from.id, 0.06);
                return {
                    text: use
                        ? `You told ${from.name} you'll use the ${VETO} on them. They'll hold you to it.`
                        : `You told ${from.name} the nominations will stay the same. They'll hold you to it.`,
                    good: true,
                };
            });
        } else if (approach.kind === "votePlea") {
            outcome = this.mutate((gs) => {
                if (!accept) {
                    shiftRelationship(gs, actor.id, from.id, -0.03);
                    return { text: `You didn't promise ${from.name} your vote.`, good: false };
                }
                pledge(this.ledger, "vote", actor.id, from.id, gs.phase);
                pledge(this.ledger, "safety", from.id, actor.id, gs.phase + 1);
                shiftRelationship(gs, actor.id, from.id, 0.06);
                return { text: `You promised ${from.name} your vote. If they stay and win HoH, you're safe.`, good: true };
            });
        }
        if (outcome) s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        const answer = APPROACH_ANSWERS[approach.kind];
        this.logTalk(actor.id, approach.fromId, [
            { who: "bot", text: this.approachText(approach) },
            ...(answer ? [{ who: "me" as const, text: accept ? answer[0] : answer[1] }] : []),
            ...(outcome ? [{ who: "note" as const, text: outcome.text }] : []),
        ]);
        this.noteRead(actor.id, approach.fromId, approach.kind !== "chat");
        this.save();
        return outcome;
    }

    // What a houseguest who came to talk to a player says, in their voice (see approachesFor).
    public approachText(approach: Approach): string {
        const from = approach.fromId;
        switch (approach.kind) {
            case "chat":
                return approach.text;
            case "pitch": {
                const target = this.player(approach.targetId).name;
                return `${this.say(from, "pitch", `pitch:${approach.targetId}`)} We need to get ${target} out of here.${
                    approach.reason ? ` ${reasonLine(approach.reason, target)}` : ""
                }`;
            }
            case "final2":
                return this.say(from, "final2", "approach");
            case "votePlea":
                return `${this.say(from, "votePlea", "approach")} If I win ${HOH}, you're safe. Can I count on your vote?`;
            case "vetoPlea":
                return `You've got the ${VETO}, and I'm on the block. Please, use it on me. I won't forget it.`;
            case "vetoKeep":
                return `I need those nominations to stay the same. Don't use the ${VETO}, okay?`;
            case "sides":
                return `Did you see me and ${this.player(approach.otherId).name}? Unbelievable. Whose side are you on?`;
            case "invite": {
                const existing = approach.allianceId !== undefined ? getAlliance(this.book, approach.allianceId) : undefined;
                const others = existing ? existing.memberIds.filter((m) => m !== from).map((m) => this.player(m).name) : [];
                return existing
                    ? `Want to join ${approach.name}?${others.length > 0 ? ` It's ${others.join(", ")} and me.` : ""}`
                    : `You and me: an alliance. I'm calling it ${approach.name}. You in?`;
            }
        }
    }

    // Adds to a player's conversation with a bot (see talkToBot): say, how they answered the bot's approach.
    protected logTalk(actorId: number, botId: number, lines: { who: TalkLine["who"]; text: string }[]) {
        const s = this.state;
        if (this.isHuman(this.player(botId)) || lines.length === 0) return;
        const talks = (s.talks = s.talks || {});
        const mine = (talks[actorId] = talks[actorId] || {});
        const talk = (mine[botId] = mine[botId] || { lines: [], key: "", n: 0 });
        const day = this.currentDay();
        lines.forEach((l) => talk.lines.push({ ...l, day }));
        if (talk.lines.length > 60) talk.lines = talk.lines.slice(talk.lines.length - 60);
    }

    // Alliances pick targets only while there's an eviction vote to come: not at the final three.
    public allianceTimeOpen(): boolean {
        return nonEvictedHouseguests(this.gameState).length > 3;
    }

    // Whether an alliance meets now. Not before the HoH comp (there's nobody to plan for yet). Once the HoH is
    // known, only the alliances the HoH is in, to help with nominations; the rest meet after the nominations.
    public allianceMeetsNow(a: Alliance): boolean {
        const s = this.state;
        if (!this.allianceTimeOpen() || s.step === Step.SocialMorning) return false;
        if (s.step === Step.AllianceHoh) return s.week.hohId !== undefined && !s.week.secretHoh && a.memberIds.includes(s.week.hohId);
        return true;
    }

    // A player's alliances that meet now (see allianceMeetsNow).
    public meetingAlliancesOf(id: number): Alliance[] {
        return this.alliancesOf(id).filter((a) => this.allianceMeetsNow(a));
    }

    // After the veto ceremony, alliance targets have to come from the block (whoever's nominated now).
    public targetBlock(): number[] | undefined {
        const s = this.state;
        if (s.step !== Step.SocialBlockbuster && s.step !== Step.SocialCampaign) return undefined;
        const block = (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted);
        return block.length > 0 ? block : undefined;
    }

    // Every member left in the alliance is on the block, or everyone on the block is in the alliance: any target
    // would be one of their own, so it doesn't pick one. It's every member for themselves this week.
    public allianceStandsDown(a: Alliance): boolean {
        const block = this.targetBlock();
        const members = aliveMembers(this.gameState, a);
        if (!block || members.length === 0) return false;
        return members.every((m) => block.includes(m.id)) || block.every((id) => members.some((m) => m.id === id));
    }

    // ---------- reads: what players learn about how others feel ----------

    // The day of the season right now, as a number.
    public currentDay(): number {
        const text = this.dayText();
        return text ? parseInt(text.replace(/\D/g, ""), 10) || 1 : 1;
    }

    // Talking to someone gives the player a read on how they feel (as they act it: bots can fake it), and
    // dealing with them (deals, claims, questions) a read on how much they believe the player.
    public noteRead(viewerId: number, otherId: number, trust: boolean = false) {
        if (viewerId === otherId || !this.isHuman({ id: viewerId }) || this.isHuman({ id: otherId })) return;
        const s = this.state;
        if (!s.reads) s.reads = {};
        const mine = (s.reads[viewerId] = s.reads[viewerId] || {});
        const day = this.currentDay();
        mine[otherId] = { ...(mine[otherId] || {}), v: this.feelingOf(viewerId, otherId), day };
        if (trust) {
            mine[otherId].t = trustOf(this.ledger, otherId, viewerId);
            mine[otherId].td = day;
        }
    }

    // The player's latest read on how someone feels about them, if they have one. Reads go stale.
    public readOf(viewerId: number, otherId: number): { label: string; emoji: string; day: number; old: boolean } | null {
        const r = this.state.reads && this.state.reads[viewerId] && this.state.reads[viewerId][otherId];
        if (!r) return null;
        return { ...feelingLabel(r.v), day: r.day, old: this.currentDay() - r.day > 6 };
    }

    // Something a player found out about a houseguest: it goes in that houseguest's file.
    public noteIntel(viewerId: number, otherId: number, text: string) {
        if (viewerId === otherId || !this.isHuman({ id: viewerId })) return;
        const s = this.state;
        if (!s.dossier) s.dossier = {};
        const mine = (s.dossier[viewerId] = s.dossier[viewerId] || {});
        const notes = (mine[otherId] = mine[otherId] || []);
        const day = this.currentDay();
        if (notes.some((n) => n.text === text)) return;
        notes.push({ day, text });
    }

    public intelOn(viewerId: number, otherId: number): { day: number; text: string }[] {
        const mine = this.state.dossier && this.state.dossier[viewerId];
        return (mine && mine[otherId]) || [];
    }

    // A player overheard an alliance meeting: each houseguest in it gets a note in the player's files.
    protected noteOverheard(gs: GameState, viewerId: number, allianceId: number) {
        const a = this.book.alliances.find((x) => x.id === allianceId);
        if (!a) return;
        const members = a.memberIds.filter((m) => !getById(gs, m).isEvicted);
        const target = a.target !== undefined && a.targetWeek === gs.phase && !getById(gs, a.target).isEvicted ? a.target : undefined;
        const name = (id: number) => (id === viewerId ? "you" : getById(gs, id).name);
        members.forEach((m) => {
            const others = members.filter((o) => o !== m);
            this.noteIntel(viewerId, m, `👂 Overheard in ${a.name}${others.length ? ` with ${others.map(name).join(", ")}` : ""}.`);
            if (target !== undefined) this.noteIntel(viewerId, m, `🎯 ${a.name} was going after ${name(target)}.`);
            if (target !== undefined && a.backup !== undefined && !getById(gs, a.backup).isEvicted)
                this.noteIntel(viewerId, m, `🔁 ${a.name}'s plan B: ${name(a.backup)}.`);
        });
        if (target !== undefined && target !== viewerId) this.noteIntel(viewerId, target, `🎯 ${a.name} is going after them (overheard).`);
    }

    // What a player knows about a houseguest, for their file: never their real relationships.
    public knownProfile(viewerId: number, otherId: number) {
        const gs = this.gameState;
        const other = this.player(otherId);
        const book = this.book;
        const overheard = this.overheardBy(viewerId);
        const name = (id: number) => (id === viewerId ? "You" : this.player(id).name);
        // alliances you know they're in: your own, and ones you overheard
        const alliances = book.alliances
            .filter((a) => a.memberIds.includes(otherId) && (a.memberIds.includes(viewerId) || overheard.includes(a.id)))
            .map((a) => ({
                name: a.name,
                yours: a.memberIds.includes(viewerId),
                members: a.memberIds.filter((m) => m !== otherId && !getById(gs, m).isEvicted).map(name),
            }));
        const showmance = this.showmancePartner(otherId);
        const pledges = this.ledger.pledges
            .filter((p) => (p.fromId === otherId && p.toId === viewerId) || (p.fromId === viewerId && p.toId === otherId))
            .filter((p) => p.status === "open" || p.known || p.fromId === viewerId);
        const said = ((this.state.week.intel || {})[viewerId] || {})[otherId];
        return {
            hg: other,
            read: this.readOf(viewerId, otherId),
            trust: this.trustReadOf(viewerId, otherId),
            alliances,
            showmance: showmance !== undefined ? name(showmance) : undefined,
            pledges: pledges.map((p) => ({
                text:
                    (p.fromId === viewerId ? `You promised ${other.name} ` : `${other.name} promised you `) +
                    ({ safety: "safety", final2: "a final two", vote: "a vote", veto: "the veto", noVeto: "to leave the nominations alone" } as { [k in PledgeKind]: string })[
                        p.kind
                    ],
                status: p.status,
            })),
            voteSaid: said !== undefined ? this.player(said).name : undefined,
            // an All-Star: what they did last time is public knowledge
            returning: other.past ? other.past.story : undefined,
            notes: [...this.intelOn(viewerId, otherId)].reverse(),
            // bots only: what you've noticed about how they play, more as the weeks go on
            tells: this.isHuman(other) ? [] : noticedTells(this.personalities[otherId], this.state.history.length, `${this.state.seed}:${otherId}`),
        };
    }

    public trustReadOf(viewerId: number, otherId: number): { label: string; day: number } | null {
        const r = this.state.reads && this.state.reads[viewerId] && this.state.reads[viewerId][otherId];
        if (!r || r.t === undefined) return null;
        return { label: trustLabel(r.t), day: r.td || r.day };
    }

    // ---------- deals, promises and the vote ----------

    get ledger(): Ledger {
        if (!this.state.ledger) this.state.ledger = emptyLedger();
        return this.state.ledger;
    }

    protected tellAll(news: LedgerNews[]) {
        news.forEach((n) => this.tell(n.toIds, n.text));
    }

    // A nominee asks a bot veto holder to use the veto on them, or the HoH asks them not to use it, or anyone else
    // asks them to use it on one of the nominees (`targetId`). Once each.
    protected vetoCase(gs: MutableGameState, actorId: number, botId: number, targetId?: number): SocialOutcome {
        const s = this.state;
        const bot = getById(gs, botId);
        const me = getById(gs, actorId);
        const noms = s.week.nomineeIds || [];
        const asHoh = actorId === s.week.hohId && !noms.includes(actorId);
        const forOther = targetId !== undefined && targetId !== actorId && !asHoh && !noms.includes(actorId);
        if (
            s.step !== Step.SocialVeto ||
            s.week.povId !== botId ||
            noms.includes(botId) ||
            (forOther ? !noms.includes(targetId!) : !asHoh && !noms.includes(actorId))
        )
            return { text: `${bot.name} has nothing you need right now.`, good: false };
        const cases = (s.week.vetoCases = s.week.vetoCases || {});
        if (cases[actorId] !== undefined) return { text: `You already made your case to ${bot.name}.`, good: cases[actorId] };
        if (forOther) {
            const target = getById(gs, targetId!);
            // it's someone else's neck: how much they like you, and how much they like the nominee
            const odds = (0.15 + 0.45 * (bot.relationships[actorId] ?? 0) + 0.35 * (bot.relationships[targetId!] ?? 0)) * socialFactor(me);
            const yes = Math.abs(rng().randomFloat()) < Math.max(0.05, Math.min(0.85, odds));
            cases[actorId] = yes;
            if (yes) {
                s.week.vetoAsks = { ...(s.week.vetoAsks || {}), [actorId]: targetId! };
                pledge(this.ledger, "veto", botId, actorId, gs.phase).aboutId = targetId;
            }
            shiftRelationship(gs, actorId, botId, yes ? 0.02 : -0.02);
            return yes
                ? { text: `${bot.name} thinks it over: "Okay. I'll use it on ${target.name}."`, good: true }
                : { text: `${bot.name} isn't sold: "Why would I stick my neck out for ${target.name}?"`, good: false };
        }
        const rel = bot.relationships[actorId] ?? 0;
        // keeping the nominations the same is the easier sell
        const p = Math.max(0.05, Math.min(0.9, ((asHoh ? 0.4 : 0.25) + 0.6 * rel) * socialFactor(me)));
        const yes = Math.abs(rng().randomFloat()) < p;
        cases[actorId] = yes;
        if (yes) pledge(this.ledger, asHoh ? "noVeto" : "veto", botId, actorId, gs.phase);
        shiftRelationship(gs, actorId, botId, yes ? 0.03 : -0.02);
        if (asHoh)
            return yes
                ? { text: `${bot.name} gets it: "The nominations stay the same. You have my word."`, good: true }
                : { text: `${bot.name} won't commit: "I have to do what's best for my game."`, good: false };
        return yes
            ? { text: `${bot.name} was moved: "Okay. I'm going to use it on you."`, good: true }
            : { text: `${bot.name} isn't sold: "I can't promise you anything."`, good: false };
    }

    protected dealAction(gs: MutableGameState, actorId: number, action: DealAction): SocialOutcome {
        const week = gs.phase;
        const noms = this.state.week.nomineeIds || [];
        switch (action.kind) {
            case "final2":
                return offerFinal2(gs, this.ledger, actorId, action.botId, week);
            case "voteDeal":
                return offerVoteDeal(gs, this.ledger, actorId, action.botId, week);
            case "pity":
                return pityPitch(gs, actorId, action.botId);
            case "tellVote":
                return tellVote(gs, this.ledger, actorId, action.botId, action.targetId, noms, week, this.voteOf(gs, action.botId, noms));
            case "tellTarget":
                return tellTarget(gs, this.ledger, actorId, action.botId, action.targetId, week, noms);
            case "confront": {
                const outcome = confront(gs, this.ledger, actorId, action.botId, this.state.humanIds);
                this.startRivalry(actorId, action.botId);
                this.askOthersToPickSides(actorId, action.botId, outcome.text);
                return outcome;
            }
            case "meeting": {
                this.state.week.meetingBy = [...(this.state.week.meetingBy || []), actorId];
                const outcome = houseMeeting(gs, this.ledger, actorId, action.botId, this.state.humanIds);
                this.askOthersToPickSides(actorId, action.botId, outcome.text);
                return outcome;
            }
            case "snoop": {
                const result = snoop(gs, this.ledger, this.book, actorId);
                if (result.learned !== undefined) {
                    const known = this.overheardBy(actorId);
                    if (!known.includes(result.learned)) this.state.overheard = { ...(this.state.overheard || {}), [actorId]: [...known, result.learned] };
                    this.noteOverheard(gs, actorId, result.learned);
                }
                return result.outcome;
            }
            case "rumour":
                return spreadRumour(gs, this.ledger, this.book, actorId, action.botId, action.targetId, action.rumour);
            case "vetoCase":
                return this.vetoCase(gs, actorId, action.botId, action.targetId);
            case "final3": {
                if (!this.endgameOpen()) return { text: "It's too early for a final-three pact.", good: false };
                const result = offerFinal3(gs, this.ledger, this.pacts, actorId, action.botId, action.targetId, week, (id) => this.isHuman({ id }));
                if (result.pact) {
                    this.pacts.push(result.pact);
                    const me = this.player(actorId).name;
                    const others = [action.botId, action.targetId].filter((id) => this.isHuman({ id }));
                    this.tell(others, `🤝 ${me} set up a final-three pact: ${me}, ${this.player(action.botId).name} and ${this.player(action.targetId).name}. Nobody in it puts the others up next week.`);
                }
                return result.outcome;
            }
            case "juryCase": {
                if (!this.endgameOpen()) return { text: "It's too early to be making your case.", good: false };
                if (this.madeCaseTo(actorId, action.botId)) return { text: `You've already made your case to ${this.player(action.botId).name}.`, good: false };
                const cases = (this.state.juryCases = this.state.juryCases || {});
                cases[actorId] = [...(cases[actorId] || []), action.botId];
                const moves = (this.state.moves || []).filter((m) => m.actorId === actorId && m.kind === "move").length;
                return makeYourCase(gs, this.ledger, this.juryBook, actorId, action.botId, this.jurorTypeOf(action.botId), compWins(this.player(actorId), this.state.history), moves);
            }
            case "flirt": {
                // a couple of flirts within two weeks is fine; more is creepy to some people (not others), and
                // creep someone out twice and it's for good
                const s = this.state;
                const flirts = (s.flirts = s.flirts || {});
                const pair = `${actorId}:${action.botId}`;
                const recent = (flirts[pair] || []).filter((w) => gs.phase - w < CREEP_WEEKS).length;
                const result = flirt(gs, this.showmances, actorId, action.botId, recent, this.okWithFlirts(action.botId));
                flirts[pair] = [...(flirts[pair] || []).filter((w) => gs.phase - w < CREEP_WEEKS), gs.phase];
                if (result.outcome.tone === "creepy") {
                    const creeped = (s.creeped = s.creeped || {});
                    creeped[pair] = (creeped[pair] || 0) + 1;
                    if (creeped[pair] >= 2 && !this.isCreepTo(actorId, action.botId)) {
                        s.creeps = [...(s.creeps || []), { playerId: actorId, botId: action.botId }];
                        setRelationship(gs, actorId, action.botId, CREEP_LEVEL);
                        result.outcome.text += ` To ${getById(gs, action.botId).name}, you're a creep now, and nothing will change that.`;
                    }
                }
                if (result.showmance) {
                    this.showmances.push(result.showmance);
                    this.tell(
                        this.state.humanIds.filter((id) => id !== actorId),
                        `💕 The house is buzzing: ${getById(gs, actorId).name} and ${getById(gs, action.botId).name} are a showmance.`
                    );
                }
                return result.outcome;
            }
        }
    }

    // Who a bot with a vote this week means to evict (undefined: no vote, or it's a player).
    protected voteOf(gs: GameState, voterId: number, nomineeIds: number[]): number | undefined {
        if (this.isHuman({ id: voterId }) || nomineeIds.length < 2 || nomineeIds.includes(voterId)) return undefined;
        if (voterId === this.state.week.hohId) return undefined;
        return this.intendedVote(gs, getById(gs, voterId), nomineeIds.map((id) => getById(gs, id))).id;
    }

    // How a bot means to vote: its usual vote, unless it gave its word to the nominee it would vote out.
    // Seeded per voter and week, so asking now and voting later agree (unless the house has changed).
    protected intendedVote(gs: GameState, voter: Houseguest, noms: Houseguest[]): { id: number; betrayed?: number } {
        seedRng(`${this.state.seed}:${gs.phase}:vote:${voter.id}`);
        const r = () => Math.abs(rng().randomFloat());
        const base = botVote(gs, this.book, voter, noms);
        const leastLiked = (pool: Houseguest[]) => [...pool].sort((a, b) => voter.relationships[a.id] - voter.relationships[b.id])[0];
        // nobody votes out their showmance
        const love = partnerOf(this.showmances, voter.id);
        if (love !== undefined && noms.some((n) => n.id === love)) {
            const others = noms.filter((n) => n.id !== love);
            if (others.length > 0) return base.id === love ? { id: leastLiked(others).id } : base;
        }
        const p = this.personalities[voter.id];
        if (p === "wildcard" && r() < 0.2) return { id: noms[Math.floor(r() * noms.length)].id };
        let choice = base;
        if (p === "villain" && r() < 0.5) choice = { id: leastLiked(noms).id };
        // a showmance on the block: split them up
        const paired = noms.filter((n) => {
            const partner = partnerOf(this.showmances, n.id);
            return partner !== undefined && partner !== voter.id && !getById(gs, partner).isEvicted;
        });
        if (paired.length === 1 && r() < 0.25) choice = { id: paired[0].id };
        // a big threat on the block is hard to pass up, more so late in the game
        const scores = threatScoresFor(gs, this.state.history, voter); // the threat as this voter sees it
        const byThreat = [...noms].sort((a, b) => (scores[b.id] ? scores[b.id].score : 0) - (scores[a.id] ? scores[a.id].score : 0));
        const gap = byThreat.length > 1 && scores[byThreat[0].id] && scores[byThreat[1].id] ? scores[byThreat[0].id].score - scores[byThreat[1].id].score : 0;
        if (gap > 1 && byThreat[0].id !== love && r() < this.strategy().threatVote) choice = { id: byThreat[0].id };
        // easy bots sometimes just vote with their gut
        if (r() < this.strategy().gut) choice = { id: leastLiked(noms).id };
        const promised = promisedVotes(this.ledger, voter.id, gs.phase).filter((id) => noms.some((n) => n.id === id));
        if (!promised.includes(choice.id)) return choice;
        if (r() >= this.honor(voter.id, choice.id)) return choice;
        const others = noms.filter((n) => !promised.includes(n.id));
        if (others.length === 0) return choice;
        return { id: leastLiked(others).id };
    }

    // Who the current player thinks the nominees are, and who they're campaigning to.
    public voters(): Houseguest[] {
        const s = this.state;
        const noms = s.week.nomineeIds || [];
        const hoh = this.publicHohId();
        return nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== hoh && !noms.includes(hg.id));
    }

    // Vote counting: ask a voter how they'll vote. Free, once per voter. Bots may lie.
    public askVote(voterId: number): number | null {
        const s = this.state;
        const actor = this.socialActor;
        const noms = (s.week.nomineeIds || []).map((id) => this.player(id));
        if (!actor || noms.length < 2 || this.isHuman({ id: voterId })) return null;
        const intel = (s.week.intel = s.week.intel || {});
        const mine = (intel[actor.id] = intel[actor.id] || {});
        if (mine[voterId] !== undefined) return mine[voterId];
        const intended = this.intendedVote(s.gameState, this.player(voterId), noms).id;
        this.reseed(`ask:${voterId}`);
        const info = this.traitsOf(voterId);
        const answer = answerVoteQuestion(
            new MutableGameState(s.gameState),
            actor.id,
            voterId,
            intended,
            noms.map((n) => n.id),
            info ? info.lies : 1
        );
        mine[voterId] = answer.said;
        this.noteRead(actor.id, voterId, true);
        this.save();
        return answer.said;
    }

    // The player's vote count so far: what each voter said (if asked).
    public tally(actorId: number): { hg: Houseguest; said?: number }[] {
        const mine = (this.state.week.intel || {})[actorId] || {};
        return this.voters()
            .filter((hg) => hg.id !== actorId)
            .map((hg) => ({ hg, said: mine[hg.id] }));
    }

    // Eviction night: promises and claims are checked against the secret votes, vote counts against the truth,
    // and votes against the house get noticed.
    protected settleTheVote(week: number, hohId: number, votes: { [voterId: number]: number }, evictedIds: number[], noms: Houseguest[]) {
        const s = this.state;
        this.reseed("word");
        this.tellAll(
            this.mutate((gs) => [
                ...checkVoteClaims(gs, this.ledger, week, votes),
                ...settleEvictionPledges(gs, this.ledger, week, hohId, votes, evictedIds),
            ])
        );
        const real = (id: number) => Object.values(votes).filter((v) => v === id).length;
        Object.keys(s.week.intel || {})
            .map(Number)
            .forEach((asker) => {
                const said = s.week.intel![asker];
                const asked = Object.keys(said).map(Number);
                if (asked.length === 0) return;
                const wrong = asked.filter((v) => votes[v] !== undefined && votes[v] !== said[v]).length;
                this.tell(
                    [asker],
                    wrong === 0
                        ? `🗳️ Your vote count held up: everyone you asked voted the way they said.`
                        : `🗳️ ${wrong} of the ${asked.length} houseguests you asked didn't vote the way they told you. The real vote: ${noms
                              .map((n) => `${n.name} ${real(n.id)}`)
                              .join(", ")}.`
                );
            });
        // votes against the nominee who stayed
        const survivors = noms.filter((n) => !evictedIds.includes(n.id)).map((n) => n.id);
        const voterIds = Object.keys(votes).map(Number);
        s.week.hinky = [];
        voterIds.forEach((voterId) => {
            const target = votes[voterId];
            if (!survivors.includes(target)) return;
            if (this.isHuman({ id: voterId })) {
                s.week.hinky!.push({ voterId, targetId: target });
                return;
            }
            if (!this.isHuman({ id: target })) return;
            const rumored = this.mutate((gs) => {
                const r = rumorFor(gs, target, voterIds, voterId);
                shiftRelationship(gs, target, r, -0.08);
                return r;
            });
            this.tell([target], `🗳️ Somebody voted to evict you. Word is it was ${this.player(rumored).name}.`);
        });
        // bots pin their own rogue votes on someone else, sometimes a player who voted the other way
        voterIds.forEach((voterId) => {
            const target = votes[voterId];
            if (this.isHuman({ id: voterId }) || this.isHuman({ id: target }) || !survivors.includes(target)) return;
            const p = this.personalities[voterId];
            if (Math.abs(rng().randomFloat()) >= (p === "villain" || p === "mastermind" ? 0.5 : 0.2)) return;
            const goats = this.alivePlayers.filter((pl) => votes[pl.id] !== undefined && votes[pl.id] !== target);
            if (goats.length === 0) return;
            const goat = goats[Math.floor(Math.abs(rng().randomFloat()) * goats.length)];
            this.mutate((gs) => shiftRelationship(gs, target, goat.id, -0.12));
            this.tell(
                [goat.id],
                `🗳️ ${this.player(target).name} is convinced you voted to evict them. You didn't: somebody pinned their vote on you.`
            );
        });
        this.endShowmances(evictedIds);
    }

    // ---------- house drama ----------

    // The players who weren't part of a fight hear about it, and get asked to pick a side.
    protected askOthersToPickSides(aId: number, bId: number, text: string) {
        const s = this.state;
        this.alivePlayers
            .filter((p) => p.id !== aId && p.id !== bId)
            .forEach((p) => {
                s.approaches[p.id] = [...(s.approaches[p.id] || []), { kind: "sides", fromId: aId, otherId: bId }];
                this.tell([p.id], text);
            });
    }

    // The current player picks a side in someone else's fight (or stays out of it). Free, like any answer.
    public respondSides(index: number, side: "a" | "b" | null): SocialOutcome | null {
        const s = this.state;
        const actor = this.socialActor;
        const list = this.approachesFor(actor.id);
        const approach = list[index];
        if (!approach || approach.kind !== "sides") return null;
        s.approaches[actor.id] = list.filter((_, i) => i !== index);
        const a = this.player(approach.fromId);
        const b = this.player(approach.otherId);
        const outcome = this.mutate((gs) => {
            if (side === null) {
                shiftRelationship(gs, actor.id, a.id, -0.03);
                shiftRelationship(gs, actor.id, b.id, -0.03);
                return { text: `You stayed out of ${a.name} and ${b.name}'s fight. Neither of them was thrilled.`, good: true };
            }
            const [chosen, other] = side === "a" ? [a, b] : [b, a];
            shiftRelationship(gs, actor.id, chosen.id, 0.08);
            shiftRelationship(gs, actor.id, other.id, -0.12);
            return { text: `You took ${chosen.name}'s side. ${other.name} noticed.`, good: true };
        });
        s.socialLog.push(`${outcome.good ? "👍" : "👎"} ${outcome.text}`);
        this.logTalk(actor.id, a.id, [
            { who: "bot", text: this.approachText(approach) },
            { who: "me", text: side === null ? "I'm staying out of it." : side === "a" ? "I'm with you." : `I'm with ${b.name}.` },
            { who: "note", text: outcome.text },
        ]);
        this.save();
        return outcome;
    }

    // ---------- talking to bots in your own words ----------

    // Whether a player has started talking with a bot this block (and so spent the action it takes).
    public talkStarted(viewerId: number, botId: number): boolean {
        const mine = this.state.talks && this.state.talks[viewerId];
        const talk = mine && mine[botId];
        return !!talk && !!talk.paid && talk.key === `${this.gameState.phase}:${this.state.step}`;
    }

    // Whether a bot ended its conversation with a player this block (they ran out of time for them).
    public talkOver(viewerId: number, botId: number): boolean {
        const mine = this.state.talks && this.state.talks[viewerId];
        const talk = mine && mine[botId];
        return this.talkStarted(viewerId, botId) && !!talk && !!talk.over;
    }

    public talkWith(viewerId: number, botId: number): TalkLine[] {
        const mine = this.state.talks && this.state.talks[viewerId];
        return (mine && mine[botId] && mine[botId].lines) || [];
    }

    // The current player says something to a bot during social time. The message is read for what it's
    // about (see botTalk.ts), and the bot reacts by the same rules as the social actions. Talking to a bot takes
    // one action a block; then everything said is part of it (deals and pitches too), for as long as they listen.
    // `action`: what the player picked from the talk menu (a deal, a pitch...), said in `text`, and done as is,
    // without reading the message for it.
    public talkToBot(botId: number, text: string, action?: SocialAction): { lines: TalkLine[]; outcome?: SocialOutcome } | null {
        const s = this.state;
        const actor = this.socialActor;
        const clean = String(text || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, action ? 400 : TALK_MAX_LENGTH);
        if (action && (!("botId" in action) || action.botId !== botId)) return null;
        if (!actor || !clean || this.socialStageOf(actor.id) !== "social" || !this.isHuman(actor) || !socialBlockName(s.step)) return null;
        if (s.approachKey[actor.id] !== `${s.gameState.phase}:${s.step}`) return null; // their social screen isn't up yet
        const bot = s.gameState.houseguests.find((hg) => hg.id === botId);
        if (!bot || bot.isEvicted || bot.id === actor.id || this.isHuman(bot)) return null;
        const gs = this.gameState;
        const talks = (s.talks = s.talks || {});
        const mine = (talks[actor.id] = talks[actor.id] || {});
        const talk = (mine[botId] = mine[botId] || { lines: [], key: "", n: 0 });
        const block = `${gs.phase}:${s.step}`;
        if (talk.key !== block) {
            talk.key = block;
            talk.n = 0;
            talk.warm = false;
            talk.paid = false;
            talk.over = false;
            delete talk.target;
            // how much time they have for you: decided when you start talking, so it doesn't move mid-chat
            const traits = this.traitsOf(botId);
            talk.max = talkPatience(bot.relationships[actor.id] ?? 0, traits ? traits.chats : 1, hash01(`${s.seed}:${block}:${actor.id}:${botId}:patience`));
        }
        if (talk.over) return null; // they've gone: the conversation's over for this block
        // talking to someone takes an action, once per houseguest a block: then say all they'll listen to
        if (!talk.paid) {
            if (this.actionsOf(actor.id) <= 0) return null;
            this.spendActions(actor.id, 1);
            talk.paid = true;
        }
        const day = this.currentDay();
        const said: TalkLine[] = [];
        const add = (who: TalkLine["who"], t: string) => {
            const l = { who, text: t, day };
            talk.lines.push(l);
            said.push(l);
        };
        add("me", clean);
        talk.n++;
        const p = this.personalities[botId];
        const lineKey = `${s.seed}:${block}:${actor.id}:${botId}:${talk.n}`;
        const line = (reply: Reply, who: string = "") => talkLine(p, reply, `${lineKey}:${reply}`, who);
        const name = (id: number) => (id === actor.id ? "you" : this.player(id).name);
        const botSays = (t: string) => add("bot", t);
        const finish = (outcome?: SocialOutcome) => {
            if (talk.lines.length > 60) talk.lines = talk.lines.slice(talk.lines.length - 60);
            this.save();
            return { lines: said, outcome };
        };

        if (talk.n > (talk.max ?? TALKS_MIN)) {
            botSays(line("tired"));
            talk.over = true;
            add("note", `${bot.name} ended the conversation. You can talk again next social time.`);
            return finish();
        }

        this.reseed(`talk:${actor.id}:${botId}:${talk.n}`);
        const rand = () => Math.abs(rng().randomFloat());
        const others = nonEvictedHouseguests(gs).filter((hg) => hg.id !== actor.id && hg.id !== botId);
        const iAmHoh = s.week.hohId === actor.id;
        // "want to join The Vault?": an invite to one of your alliances they're not in yet, named in the message
        const invite = this.alliancesOf(actor.id).find((a) => !a.memberIds.includes(botId) && clean.toLowerCase().includes(a.name.toLowerCase()));
        const read = readMessage(clean, mentionsIn(clean, others), { iAmHoh });
        const intent: typeof read = invite && /join|invit|welcome|be (part|in)|come (in|aboard)|alliance/i.test(clean) ? { kind: "alliance" } : read;
        const noms = (s.week.nomineeIds || []).filter((id) => !this.player(id).isEvicted);
        const nomsSet = noms.length >= 2 && nomsSetStep(s.step);
        const hohId = s.week.hohId;
        const botVotes = botId !== hohId && !noms.includes(botId);
        const real = bot.relationships[actor.id] ?? 0;
        const info = this.traitsOf(botId);
        const lies = info ? info.lies : 1;

        // an action, done in the conversation: talking already took its action (a house meeting takes one more)
        const act = (action: SocialAction, yes: Reply, no: Reply, about: string = "") => {
            if (action.kind === "meeting" && this.actionsOf(actor.id) <= 0) {
                botSays(line("busy"));
                return finish();
            }
            const outcome = this.socialAct(action, true);
            if (!outcome) {
                botSays(line("notNow"));
                return finish();
            }
            botSays(line(outcome.tone === "creepy" ? "flirtCreepy" : outcome.tone === "awkward" ? "flirtAwkward" : outcome.good ? yes : no, about));
            add("note", outcome.text);
            if (outcome.tone === "creepy") {
                // and they're done talking to you
                talk.over = true;
                add("note", `${bot.name} ended the conversation.`);
            }
            return finish(outcome);
        };
        // small talk: a friendly word helps a little, once per block
        const friendly = (reply: Reply, delta: number = 0.015) => {
            const first = !talk.warm;
            if (!talk.warm) {
                talk.warm = true;
                this.mutate((m) => shiftRelationship(m, actor.id, botId, delta * socialFactor(actor) * (0.5 + rand())));
            }
            botSays(line(reply));
            // a gossip can't help it: the first friendly word each social time gets you something they know
            if (first && p === "gossip") {
                const spilled = this.gossipFrom(botId, actor.id, rand());
                if (spilled) add("note", spilled);
            }
            this.noteRead(actor.id, botId);
            return finish();
        };

        if (action) {
            // the bot's answer either way: [it went your way, it didn't]
            const replies: { [kind: string]: [Reply, Reply] } = {
                chat: ["chatYes", "chatNo"],
                alliance: ["accept", "decline"],
                pitch: ["pitchYes", "pitchNo"],
                flirt: ["flirtYes", "flirtNo"],
                rumour: ["rumourYes", "rumourNo"],
                confront: ["confrontYes", "confrontNo"],
                meeting: ["meetingYes", "meetingNo"],
                final2: ["accept", "decline"],
                voteDeal: ["accept", "decline"],
                pity: ["pityYes", "decline"],
                tellVote: ["heard", "listen"],
                tellTarget: ["heard", "listen"],
                vetoCase: ["vetoYes", "vetoNo"],
                final3: ["accept", "decline"],
                juryCase: ["heard", "listen"],
            };
            const [yes, no] = replies[action.kind] || ["heard", "listen"];
            return act(action, yes, no, "targetId" in action && action.targetId !== undefined ? name(action.targetId) : "");
        }

        switch (intent.kind) {
            case "askTarget": {
                if (talk.target === undefined) {
                    let target: number | undefined;
                    if (botId === hohId && nomsSet) {
                        target = noms.reduce((a, b) => ((bot.relationships[a] ?? 0) <= (bot.relationships[b] ?? 0) ? a : b));
                    } else {
                        const everyone = nonEvictedHouseguests(gs).filter((hg) => hg.id !== botId);
                        target = everyone.length
                            ? everyone.reduce((a, b) => ((bot.relationships[a.id] ?? 0) <= (bot.relationships[b.id] ?? 0) ? a : b)).id
                            : undefined;
                    }
                    const decoys = others.filter((hg) => hg.id !== target);
                    if (target === undefined) talk.target = null;
                    else if (target === actor.id) {
                        // nobody tells you to your face... though a liar might name somebody else
                        talk.target = decoys.length && rand() < Math.min(0.9, 0.5 * lies) ? decoys[rng().randomInt(0, decoys.length - 1)].id : null;
                    } else if (real > 0.15 || rand() < 0.15) {
                        // friends tell you, and liars sometimes name the wrong person
                        talk.target = decoys.length && rand() < 0.12 * lies ? decoys[rng().randomInt(0, decoys.length - 1)].id : target;
                    } else talk.target = null;
                }
                const told = talk.target;
                if (told === null || told === undefined) {
                    botSays(line(p === "floater" && rand() < 0.5 ? "targetNoone" : "targetSecret"));
                } else {
                    botSays(line(botId === hohId && nomsSet ? "targetHoh" : "targetIs", name(told)));
                    this.noteIntel(actor.id, botId, `🗣️ Told you their target is ${name(told)} (week ${gs.phase}).`);
                }
                this.noteRead(actor.id, botId);
                return finish();
            }
            case "askVote": {
                if (!nomsSet) botSays(line("voteNoNoms"));
                else if (noms.includes(botId)) botSays(line("voteNominee"));
                else if (botId === hohId) botSays(line("voteHoh"));
                else if (s.step !== Step.SocialCampaign) botSays(line("voteNotYet"));
                else {
                    const vote = this.askVote(botId);
                    if (vote === null || vote === undefined) botSays(line("dodge"));
                    else botSays(this.say(botId, "voteAnswer", "ask", this.player(vote).name));
                }
                return finish();
            }
            case "askFeeling":
                botSays(line(feelingReply(this.feelingOf(actor.id, botId))));
                this.noteRead(actor.id, botId);
                return finish();
            case "askOpinion": {
                const about = this.player(intent.aboutId);
                const v = apparentRelationship(bot.relationships[about.id] ?? 0, p, `${s.seed}:${gs.phase}:${botId}:${about.id}:talk`, false);
                botSays(line(opinionReply(v), about.name));
                return finish();
            }
            case "askAllies": {
                const shared = this.alliancesOf(actor.id).filter((a) => a.memberIds.includes(botId));
                if (shared.length > 0) botSays(line("alliesYours", shared[0].name));
                else {
                    const closest = [...others].sort((a, b) => (bot.relationships[b.id] ?? 0) - (bot.relationships[a.id] ?? 0))[0];
                    if (closest && real > 0.45 && rand() < 0.6) {
                        botSays(line("alliesClose", closest.name));
                        this.noteIntel(actor.id, botId, `🗣️ Said they're close with ${closest.name} (week ${gs.phase}).`);
                    } else botSays(line("alliesSecret"));
                }
                this.noteRead(actor.id, botId);
                return finish();
            }
            case "final2":
                if (hasFinal2(this.ledger, actor.id, botId)) {
                    botSays(line("alreadyF2"));
                    return finish();
                }
                if (others.length < 2) {
                    botSays(line("notNow"));
                    return finish();
                }
                return act({ kind: "final2", botId }, "accept", "decline");
            case "alliance": {
                if (invite) {
                    if (!this.allianceTimeOpen()) {
                        botSays(line("notNow"));
                        return finish();
                    }
                    return act({ kind: "alliance", botId, allianceId: invite.id }, "accept", "decline");
                }
                const together = this.alliancesOf(actor.id).find((a) => a.memberIds.includes(botId));
                if (together && !intent.name) {
                    botSays(line("alreadyAllied", together.name));
                    return finish();
                }
                if (!this.allianceTimeOpen()) {
                    botSays(line("notNow"));
                    return finish();
                }
                return act({ kind: "alliance", botId, name: intent.name }, "accept", "decline");
            }
            case "pitch":
                return act({ kind: "pitch", botId, targetId: intent.targetId, reason: intent.reason }, "pitchYes", "pitchNo", name(intent.targetId));
            case "tellVote":
                if (!nomsSet || iAmHoh || noms.includes(actor.id) || !noms.includes(intent.targetId)) {
                    botSays(line(nomsSet ? "listen" : "voteNoNoms"));
                    return finish();
                }
                return act({ kind: "tellVote", botId, targetId: intent.targetId }, "heard", "listen");
            case "tellTarget":
                return act({ kind: "tellTarget", botId, targetId: intent.targetId }, "heard", "listen");
            case "rumour":
                return act({ kind: "rumour", botId, targetId: intent.targetId, rumour: intent.rumour }, "rumourYes", "rumourNo", name(intent.targetId));
            case "keepMe":
                if (s.step === Step.SocialVeto && botId === s.week.povId && noms.includes(actor.id) && !noms.includes(botId))
                    return act({ kind: "vetoCase", botId }, "vetoYes", "vetoNo");
                if (s.step !== Step.SocialCampaign || !noms.includes(actor.id) || !botVotes) {
                    botSays(line(noms.includes(actor.id) ? "voteNotYet" : "listen"));
                    return finish();
                }
                return act({ kind: intent.pity ? "pity" : "voteDeal", botId }, "accept", "decline");
            case "flirt":
                return act({ kind: "flirt", botId }, "flirtYes", "flirtNo");
            case "insult":
                this.mutate((m) => shiftRelationship(m, actor.id, botId, -0.04 * (p === "villain" ? 1.5 : 1)));
                botSays(line("insult"));
                this.noteRead(actor.id, botId);
                return finish();
            case "compliment":
                return friendly("compliment", p === "villain" ? 0.005 : p === "floater" ? 0.025 : 0.015);
            case "thanks":
                return friendly("thanks");
            case "apology":
                return friendly("apology", 0.02);
            case "bye":
                botSays(line("bye"));
                return finish();
            case "howAreYou":
                return friendly(botId === hohId ? "howHoh" : noms.includes(botId) ? "howNominee" : this.isHaveNot(botId) ? "howHaveNot" : "howFine");
            case "greet":
                return friendly("greet");
            case "small": {
                const topic: Reply =
                    intent.topic === "comps"
                        ? "smallComps"
                        : intent.topic === "home"
                        ? "smallHome"
                        : intent.topic === "food"
                        ? this.isHaveNot(botId)
                            ? "howHaveNot"
                            : "smallFood"
                        : intent.topic === "game"
                        ? "smallGame"
                        : "small";
                return friendly(topic);
            }
            default:
                botSays(line(intent.question ? "dodge" : "listen"));
                return finish();
        }
    }

    // Read by the screens, so it changes nothing (see approachesFor).
    public overheardBy(playerId: number): number[] {
        return (this.state.overheard || {})[playerId] || [];
    }

    // How far into the season we are: 0 at the start, 1 at the final 3.
    protected lateness(): number {
        const total = Math.max(4, this.gameState.houseguests.length);
        return Math.max(0, Math.min(1, (total - this.gameState.remainingPlayers) / (total - 3)));
    }

    public threatOf(id: number) {
        return threatLevel(this.gameState, this.state.history, id);
    }

    // A bot HoH may simply go after the biggest threat in the house.
    protected topThreat(hohId: number): number[] {
        const scores = threatScoresFor(this.gameState, this.state.history, this.player(hohId)); // as the HoH sees it
        const love = partnerOf(this.showmances, hohId);
        const allies = this.allyIds(hohId);
        const pool = Object.keys(scores)
            .map(Number)
            .filter((id) => id !== hohId && id !== love && !allies.includes(id));
        if (pool.length === 0) return [];
        const top = pool.sort((a, b) => scores[b].score - scores[a].score)[0];
        if (scores[top].score < 1 || Math.abs(rng().randomFloat()) >= this.strategy().threatNom) return [];
        return [top];
    }
}
