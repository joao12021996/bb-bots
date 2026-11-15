import React from "react";
import { exclude, GameState, getById, Houseguest, MutableGameState, nonEvictedHouseguests } from "../model";
import { hashcode, rng } from "../utils";
import { BigBrotherVanilla } from "../components/episode/bigBrotherEpisode";
import { BigBrotherFinale } from "../components/episode/bigBrotherFinale";
import { generateGameOver } from "../components/episode/gameOver";
import { CastOptionsOverride } from "../components/episode/episodeFactory";
import { generateNomCeremonyScene } from "../components/episode/scenes/nomCeremonyScene";
import { generateVetoCompScene, pickVetoPlayers } from "../components/episode/scenes/vetoCompScene";
import { generateVetoCeremonyScene } from "../components/episode/scenes/vetoCeremonyScene";
import { generateEvictionScene } from "../components/episode/scenes/evictionScene";
import { finalHohCompScene } from "../components/episode/scenes/finalHohCompScene";
import { finalEvictionScene } from "../components/episode/scenes/finalEvictionScene";
import { juryVoteScene } from "../components/episode/scenes/juryVoteScene";
import { Scene } from "../components/episode/scenes/scene";
import { NextEpisodeButton } from "../components/nextEpisodeButton/nextEpisodeButton";
import { GoldenVeto } from "../components/episode/veto/veto";
import { generateVotingTable } from "../components/votingTable/votingTable";
import { newEpisode, playerModeScreen$, pushToMainContentStream, secretRelationships$, selectedPlayer$ } from "../subjects/subjects";
import { Screens } from "../components/topbar/topBar";
import { Difficulty, SeasonRules, withDefaults, difficultyLabel } from "./rules";
import { settleVetoPledges } from "./social/promises";
import { explainVote } from "./social/reasons";
import { CompDefinition } from "./comps/compTypes";
import { TAINTED_WINE_ID } from "./comps/taintedWine";
import { compById, finaleComps, pickQuickComp } from "./comps";
import { seededRand } from "./comps/random";
import { shiftRelationship, SocialMemory } from "./social/socialActions";
import { aliveMembers, botNominate, botSuggestion, botVeto, emptyBook, holdMeeting, pruneAlliances } from "./social/alliances";
import {
    answerVisitor,
    Deal,
    HohRoom,
    openHohRoom,
    askPawn,
    RoomOutcome,
    settleNominations,
    visitBotHoh,
    VisitPitch,
} from "./social/hohRoom";
import { botPawnTalk, nominationHit, settlePawnTalk } from "./social/pawnTalk";
import { evictionSpeech, nominationSpeech, SpeechResult, SpeechToneId, vetoSpeech } from "./social/speeches";
import { SpeechTone } from "./ui/speechPrompt";
import { MEMORY_DUEL_ID } from "./comps/memoryDuel";
import { DAY_PART, dayLabel, dayOf, totalWeeks } from "./days";
import { ALL_POWERS, botExtraVote, botNullify, PowerId, POWERS, schedulePowers, surprisePowers } from "./social/powers";
import { recordDaily } from "../career/daily";
import { SharedSeason } from "../career/seasonShare";
import { ShareSeasonLink } from "../career/seasonShareButton";
import { DailyCard } from "./ui/dailyCard";
import { evictionIntro, finaleIntro } from "./social/narration";
import { montageLines } from "./social/montage";
import { seasonAwards, seasonStats } from "./social/awards";
import { listNames } from "../utils/listStrings";
import { HOH, POV, VETO } from "./terms";
import { final2Partners, reveal, shiftTrust, openPledges, pledge, promisedVotes, settleFinalPledges, settleNominationPledges } from "./social/promises";
import { WhyTheyDidIt } from "./ui/weekReview";
import { recordSeason, SeasonSummary } from "../career/career";
import { Hall, pastStory, recordHall } from "../career/halls";
import { PastSeason } from "../model/playerProfile";
import { SeasonCard } from "../career/seasonCard";
import { play as playCue } from "../sound/sound";
import { generateBlockbusterScene } from "./blockbusterScene";
import { getComp, getSocial, PlayerProfile } from "../model";
import { clearSave } from "./save/serialize";
import { counterName, countOnce } from "../analytics/analytics";
import { partnerOf } from "./social/showmance";
import { compWins } from "./social/drama";
import { botJuryVote, grudgeOf, JurorType, roundtable } from "./social/jury";
import { Answer, answer as answerJuror, botAnswer, botOwns, giveSpeech, juryQuestions, movesFor } from "./social/finale";
import { shuffled } from "./comps/random";
import { DiaryRoom } from "./ui/diaryRoom";
import { isSocialStep, Step } from "./week";

import { PlayerSave } from "./controllerTypes";
import { ControllerHouse } from "./controllerHouse";

export type { Difficulty } from "./rules";
export { Step, BLOCKBUSTER_MIN_PLAYERS } from "./week";
export { isSocialStep };
export * from "./controllerTypes";

// A season being played: the last part of the chain (see controllerCore.tsx for the first). This part runs the
// week's ceremonies: the HoH room, nominations, pawn talk, the veto, speeches, eviction night, the finale and the end.
export class PlayerModeController extends ControllerHouse {
    // ---------- alliances convene before nominations ----------

    // Who can't be the alliance's target right now: the new HoH can't be nominated (unless it's a secret).
    // Who an alliance can't target: this week's Head of Household, who's safe until the eviction (unless it's a
    // secret who the Head of Household is).
    public targetExclude(): number[] {
        const s = this.state;
        if (s.week.secretHoh || s.week.hohId === undefined || this.player(s.week.hohId).isEvicted) return [];
        return [s.week.hohId];
    }

    // The new HoH is known: each player gets to meet with their alliances before nominations, then the bots'
    // alliances meet too. Whatever they settle on is what their HoH (or their pitch to the HoH) goes with.
    protected allianceHoh(): void {
        const s = this.state;
        const alive = this.turnOrder;
        if (this.allianceTimeOpen() && this.socialTogether) {
            const players = alive.filter((p) => this.isHuman(p) && this.meetingAlliancesOf(p.id).length > 0);
            if (this.together(`Before nominations: ${this.hohLine()}`, "alliance", players)) return;
        }
        if (this.allianceTimeOpen()) {
            while (s.socialTurn < alive.length && (this.meetingAlliancesOf(alive[s.socialTurn].id).length === 0 || !this.isHuman(alive[s.socialTurn])))
                s.socialTurn++;
            if (!this.socialTogether && s.socialTurn < alive.length) {
                const actor = alive[s.socialTurn];
                s.socialStage = "alliance";
                this.save();
                return this.privately(actor.id, `${actor.name}: your alliances convene`, () =>
                    this.show({ kind: "alliance", blockName: `Before nominations: ${this.hohLine()}`, actorId: actor.id })
                );
            }
            this.reseed("alliances:hoh");
            this.mutate((gs) =>
                s.book.alliances
                    .filter((a) => !a.met && aliveMembers(gs, a).length >= 2 && this.allianceMeetsNow(a))
                    .forEach((a) => {
                        const result = holdMeeting(gs, a, s.humanIds, undefined, this.targetExclude(), this.planBWeek);
                        this.tellAlliance(a, `🤝 ${a.name} met before nominations. ${result.lines[result.lines.length - 1]}`);
                    })
            );
            s.book.alliances.filter((a) => a.chemistry <= 0).forEach((a) => this.dissolve(a));
        }
        s.book.alliances.forEach((a) => {
            a.met = false;
            a.suggestions = {};
            a.backupSuggestions = {};
        });
        s.socialTurn = 0;
        s.socialStage = "social";
        s.actionsLeft = this.rules.actions;
        delete s.socialBy;
        this.goTo(Step.HohRoom);
    }

    // The players a HoH talks a replacement nominee over with: the other players in the HoH's alliances (not when
    // nobody's supposed to know who the HoH is).
    protected huddleWith(hohId: number): Houseguest[] {
        const s = this.state;
        if (s.week.secretHoh || !this.allianceTimeOpen()) return [];
        const ids = this.alliancesOf(hohId).reduce<number[]>((all, a) => [...all, ...a.memberIds], []);
        return this.alivePlayers.filter((p) => p.id !== hohId && this.isHuman(p) && ids.includes(p.id));
    }

    protected hohLine(): string {
        const s = this.state;
        if (s.week.secretHoh || s.week.hohId === undefined) return `the ${HOH} is a secret`;
        return `${this.player(s.week.hohId).name} is ${HOH}`;
    }

    // ---------- HoH room one-on-ones ----------

    get deals(): Deal[] {
        if (!this.state.deals) this.state.deals = [];
        return this.state.deals;
    }

    get room(): HohRoom | undefined {
        return this.state.week.room;
    }

    protected get nomCount(): number {
        return this.state.week.blockbuster ? 3 : 2;
    }

    // Before nominations, houseguests come up to the HoH room one by one. Players choose whether to go;
    // a player HoH then hears out everyone who came.
    protected hohRoom() {
        const s = this.state;
        const hohId = s.week.hohId!;
        // nobody can visit a Head of Household nobody knows (and a secret HoH can't ask anyone to be a pawn, or plan a
        // backdoor with their alliance, without giving it away)
        if (s.week.secretHoh) return this.goTo(Step.Noms);
        if (!s.week.room) {
            this.reseed("room");
            const stillIn = (id: number) => getById(s.gameState, id) && !getById(s.gameState, id).isEvicted;
            // last week's deals, and deals made on the wall in this week's endurance comp:
            // this HoH owes these houseguests safety
            const owed = this.deals
                .filter((d) => d.week === s.gameState.phase - 1 && d.withId === hohId && stillIn(d.hohId))
                .map((d) => d.hohId);
            (s.week.wallDeals || []).forEach((d) => d.hohId === hohId && !owed.includes(d.toId) && owed.push(d.toId));
            // and every other safety promise for this week (deals made while campaigning, for one)
            openPledges(this.ledger, "safety")
                .filter((p) => p.week === s.gameState.phase && p.fromId === hohId && stillIn(p.toId))
                .forEach((p) => !owed.includes(p.toId) && owed.push(p.toId));
            s.week.room = this.mutate((gs) => openHohRoom(gs, s.book, hohId, s.humanIds, owed));
            this.save();
        }
        const room = s.week.room;
        const hoh = this.player(hohId);
        if (!room.pawnAsked && !this.isHuman(hoh)) {
            // a bot HoH may ask a player in its alliance to go up as a pawn
            room.pawnAsked = true;
            this.reseed("room:pawn");
            const allies = this.allyIds(hohId).filter((id) => this.isHuman({ id }) && !this.player(id).isEvicted && (hoh.relationships[id] ?? 0) > 0.2);
            if (allies.length > 0 && Math.abs(rng().randomFloat()) < 0.5) room.pawnPending = [allies[rng().randomInt(0, allies.length - 1)]];
            this.save();
        }
        const waiting = this.alivePlayers.find((p) => p.id !== hohId && !room.asked.includes(p.id) && this.isHuman(p));
        if (waiting) {
            return this.privately(waiting.id, `${waiting.name}, the HoH room is open`, () =>
                this.show({ kind: "hohVisit", actorId: waiting.id })
            );
        }
        if (this.isHuman(hoh) && !room.done) {
            room.visitors.forEach((v) => this.noteRead(hoh.id, v.fromId));
            return this.privately(hoh.id, `${hoh.name}'s HoH room one-on-ones`, () =>
                this.show({ kind: "hohRoom", actorId: hoh.id })
            );
        }
        if ((room.pawnPending || []).length > 0) return this.answerPawnAsks(room);
        this.goTo(Step.Noms);
    }

    // Called by the visit screen: a player goes up to the HoH room with a pitch, or stays away (null).
    public hohVisit(actorId: number, pitch: VisitPitch | null): RoomOutcome | null {
        const s = this.state;
        const room = s.week.room;
        if (!room || room.asked.includes(actorId)) return null;
        room.asked.push(actorId);
        const hoh = this.player(room.hohId);
        if (pitch) this.noteRead(actorId, room.hohId, true);
        let outcome: RoomOutcome;
        if (!pitch) {
            outcome = { text: "You stayed downstairs.", good: true };
        } else if (this.isHuman(hoh)) {
            // another player is HoH: they'll answer during their one-on-ones
            room.visitors.push({ ...pitch, fromId: actorId });
            outcome = { text: `You went up to the HoH room. ${hoh.name} will give you an answer.`, good: true };
        } else {
            this.reseed(`visit:${actorId}`);
            outcome = this.mutate((gs) => visitBotHoh(gs, room, this.deals, actorId, pitch, this.nomCount));
            s.socialLog.push(`🚪 ${outcome.text}`);
            if (outcome.good && (pitch.kind === "plea" || pitch.kind === "deal")) {
                pledge(this.ledger, "safety", room.hohId, actorId, s.gameState.phase);
                if (pitch.kind === "deal") pledge(this.ledger, "safety", actorId, room.hohId, s.gameState.phase + 1);
            }
        }
        this.save();
        return outcome;
    }

    // Called by the HoH room screen: the HoH answers the visitor in front of them.
    public hohAnswer(accept: boolean): RoomOutcome | null {
        const s = this.state;
        const room = s.week.room;
        const visitor = room && room.visitors[room.index];
        if (!room || !visitor) return null;
        this.reseed(`answer:${room.index}`);
        const outcome = this.mutate((gs) => answerVisitor(gs, room, this.deals, visitor, accept));
        room.index++;
        if (accept && (visitor.kind === "plea" || visitor.kind === "deal")) {
            pledge(this.ledger, "safety", room.hohId, visitor.fromId, s.gameState.phase);
            if (visitor.kind === "deal") pledge(this.ledger, "safety", visitor.fromId, room.hohId, s.gameState.phase + 1);
        }
        const hoh = this.player(room.hohId);
        if (visitor.kind === "plea") {
            this.tell(
                [visitor.fromId],
                accept ? `👑 ${hoh.name} promised you safety this week.` : `👑 ${hoh.name} wouldn't promise you safety.`
            );
        } else if (visitor.kind === "deal") {
            this.tell(
                [visitor.fromId],
                accept
                    ? `👑 ${hoh.name} took your deal: you're safe this week, and ${hoh.name} is safe with you next week.`
                    : `👑 ${hoh.name} turned down your deal.`
            );
        } else if (visitor.kind === "target" && !accept) {
            this.tell([visitor.fromId], `👑 ${hoh.name} wasn't sold on nominating ${this.player(visitor.targetId).name}.`);
        }
        s.socialLog.push(`🚪 ${outcome.text}`);
        this.save();
        return outcome;
    }

    // Called by the HoH room screen: the HoH asks an ally whether they're okay going up as a pawn.
    public askPawn(botId: number): RoomOutcome | null {
        const s = this.state;
        const room = s.week.room;
        if (!room || room.done || !this.allyIds(room.hohId).includes(botId) || this.player(botId).isEvicted) return null;
        if ((room.pawns || []).some((p) => p.id === botId) || (room.pawnPending || []).includes(botId)) return null;
        if (this.isHuman({ id: botId })) {
            // another player: they answer before the nomination ceremony
            room.pawnPending = [...(room.pawnPending || []), botId];
            this.save();
            return { text: `You asked ${this.player(botId).name}. They'll answer before the nomination ceremony.`, good: true };
        }
        this.reseed(`askPawn:${botId}`);
        const outcome = this.mutate((gs) => askPawn(gs, room, botId));
        s.socialLog.push(`🙋 ${outcome.text}`);
        this.save();
        return outcome;
    }

    // Allies the HoH asked to be a pawn (see askPawn), now on the block: those who said yes owe the HoH nothing,
    // and the HoH owes them; those who said no feel used. Either way, they remember it if they win HoH.
    protected settlePawnAsks(hohId: number, nomineeIds: number[]) {
        const s = this.state;
        const room = s.week.room;
        if (!room || !room.pawns) return;
        const week = s.gameState.phase;
        room.pawns
            .filter((p) => nomineeIds.includes(p.id) && !(s.pawnFavors || []).some((f) => f.pawnId === p.id && f.hohId === hohId && f.week === week))
            .forEach((p) => {
                const name = this.player(p.id).name;
                this.mutate((gs) => shiftRelationship(gs, hohId, p.id, p.yes ? 0.08 : -0.2));
                s.pawnFavors = [...(s.pawnFavors || []), { hohId, pawnId: p.id, week, agreed: p.yes }];
                this.tell(
                    [hohId],
                    p.yes
                        ? `🙋 ${name} went up as your pawn, like you agreed. If they ever win ${HOH}, they'll remember the favour.`
                        : `😠 ${name} told you they didn't want to go up, and you nominated them anyway. If they ever win ${HOH}, they'll remember.`
                );
                const hohName = this.player(hohId).name;
                this.tell(
                    [p.id],
                    p.yes
                        ? `🙋 You went up as ${hohName}'s pawn, like you agreed. ${hohName} owes you one.`
                        : `😠 You told ${hohName} you didn't want to go up, and they nominated you anyway.`
                );
            });
    }

    // Nominees who owe the HoH one: the HoH went up as their pawn once, as agreed. They take being nominated much
    // better (see nominationHit), and the favour's used up.
    protected repayPawnFavors(hohId: number, nomineeIds: number[]): number[] {
        const owing: number[] = [];
        (this.state.pawnFavors || []).forEach((f) => {
            if (!f.agreed || f.repaid || f.pawnId !== hohId || !nomineeIds.includes(f.hohId) || owing.includes(f.hohId)) return;
            f.repaid = true;
            owing.push(f.hohId);
            const them = this.player(f.hohId).name;
            const hoh = this.player(hohId).name;
            this.tell([hohId], `🙋 ${them} owed you one for going up as their pawn in week ${f.week}. They're not thrilled, but they get it. You're even now.`);
            this.tell([f.hohId], `🙋 ${hoh} put you up. You owed them one for going up as your pawn in week ${f.week}, so you're even now.`);
        });
        return owing;
    }

    // A player who wins HoH remembers who they went up as a pawn for (see settlePawnAsks).
    protected pawnMemories(hohId: number) {
        if (!this.isHuman({ id: hohId })) return;
        (this.state.pawnFavors || [])
            .filter((f) => f.pawnId === hohId && !this.player(f.hohId).isEvicted && !f.repaid)
            .forEach((f) =>
                this.tell(
                    [hohId],
                    f.agreed
                        ? `🙋 Remember week ${f.week}: you went up as ${this.player(f.hohId).name}'s pawn. They owe you one: put them up, and they'll take it far better than most.`
                        : `😠 Remember week ${f.week}: ${this.player(f.hohId).name} nominated you after you said no.`
                )
            );
    }

    // Called by the HoH room screen: the HoH's backdoor plan (null: none). Their alliances hear about it.
    public planBackdoor(targetId: number | null) {
        const s = this.state;
        const room = s.week.room;
        if (!room || room.done || targetId === room.hohId) return;
        if (targetId === null) {
            if (s.week.backdoor === undefined) return;
            delete s.week.backdoor;
            this.save();
            return;
        }
        s.week.backdoor = targetId;
        const hoh = this.player(room.hohId);
        this.alliancesOf(room.hohId)
            .filter((a) => !a.memberIds.includes(targetId))
            .forEach((a) =>
                this.tellAlliance(
                    a,
                    `🚪 ${hoh.name}'s plan: nominate pawns, and put ${this.player(targetId).name} up once the ${VETO} is used. Win the ${VETO}, and use it.`,
                    room.hohId
                )
            );
        this.save();
    }

    // Players asked to go up as a pawn (by a player HoH, or a bot HoH) answer before the nomination ceremony, each on
    // their own screen.
    protected answerPawnAsks(room: HohRoom) {
        const hoh = this.player(room.hohId);
        const players = (room.pawnPending || []).map((id) => this.player(id)).filter((p) => !p.isEvicted && this.isHuman(p));
        const settle = (answers: { [id: number]: boolean }) => {
            room.pawns = [...(room.pawns || []), ...players.map((p) => ({ id: p.id, yes: !!answers[p.id] }))];
            room.pawnPending = [];
            if (this.isHuman(hoh))
                players.forEach((p) =>
                    this.tell([hoh.id], answers[p.id] ? `🙋 ${p.name} will go up as your pawn.` : `🙅 ${p.name} doesn't want to go up.`)
                );
            this.goTo(Step.Noms);
        };
        if (players.length === 0) return settle({});
        this.gather<boolean>(
            `pawnAsk:${this.gameState.phase}`,
            players,
            `${hoh.name} is asking around`,
            (p) => `${p.name}: ${hoh.name} wants a word`,
            (p, _more, answer) => ({
                kind: "choose",
                actorId: p.id,
                title: `👑 ${hoh.name} has a favour to ask`,
                text: `“I need someone to go up as a pawn this week. You're not the target: I'll make sure you're still here on eviction night. Are you okay going up?” Whatever you say, you'll remember it if you win ${HOH}.`,
                options: [hoh],
                count: 1,
                confirmLabel: "🙋 I'll go up",
                noneLabel: "🙅 Please don't nominate me",
                resolve: (ids) => answer(ids.length > 0),
            }),
            settle,
            () => false
        );
    }

    // Called by the HoH room screen once everyone has been heard.
    public endHohRoom = () => {
        const room = this.state.week.room;
        if (room) {
            room.index = room.visitors.length;
            room.done = true;
        }
        this.save();
        this.run();
    };

    // Promises made in the HoH room are checked against the nominations.
    protected settleRoom(hohId: number, nomineeIds: number[], initial: boolean) {
        const room = this.state.week.room;
        if (!room) return;
        const news = this.mutate((gs) =>
            settleNominations(gs, room, this.deals, nomineeIds, initial, this.isHuman({ id: hohId }))
        );
        news.forEach((n) => this.tell(n.toIds, n.text));
        this.tellAll(this.mutate((gs) => settleNominationPledges(gs, this.ledger, hohId, nomineeIds, gs.phase)));
        if (!this.isHuman({ id: hohId }))
            nomineeIds
                .filter((id) => this.isHuman({ id }))
                .forEach((id) => {
                    reveal(this.ledger, hohId, id, this.gameState.phase);
                    this.noteRead(id, hohId);
                });
        this.save();
    }

    // What a bot HoH takes into nominations: who it means to keep safe (HoH room promises it means,
    // final-two partners it stays loyal to), and who it was talked into nominating.
    protected roomSway() {
        const room = this.state.week.room;
        const hohId = this.state.week.hohId;
        if (hohId === undefined) return { protect: room ? room.safe : [], targets: room ? room.targets.map((t) => t.targetId) : [] };
        const partners = final2Partners(this.ledger, hohId).filter((id) => Math.abs(rng().randomFloat()) < this.honor(hohId, id));
        const love = partnerOf(this.showmances, hohId);
        // HoHs who once put it on the block: as a pawn it agreed to be (it owes them), or after it said no
        const favors = (this.state.pawnFavors || []).filter((f) => f.pawnId === hohId && !this.player(f.hohId).isEvicted);
        // the alliances it talked nominations over with (players in them had their say): their pick comes first
        const asked = this.alliancesOf(hohId)
            .filter((a) => a.memberIds.some((m) => m !== hohId && this.isHuman({ id: m })) && a.target !== undefined && a.targetWeek === this.gameState.phase)
            .map((a) => a.target!);
        return {
            protect: [
                ...(room ? room.safe : []),
                ...partners,
                // its final-three pact, if it's the kind to keep one
                ...this.pactPartners(hohId).filter((id) => Math.abs(rng().randomFloat()) < this.honor(hohId, id)),
                ...(love !== undefined ? [love] : []),
                ...favors.filter((f) => f.agreed).map((f) => f.hohId),
            ],
            targets: [
                ...asked.slice(0, 1),
                ...asked.slice(1),
                ...favors.filter((f) => !f.agreed).map((f) => f.hohId),
                ...this.showmanceTarget(hohId),
                ...this.rivalTarget(hohId),
                ...(room ? room.targets.map((t) => t.targetId) : []),
                ...this.personalityTargets(hohId),
                ...this.topThreat(hohId),
            ],
            // whoever agreed to go up as its pawn goes up: it said it would
            pawns: room && room.hohId === hohId ? (room.pawns || []).filter((p) => p.yes && !this.player(p.id).isEvicted).map((p) => p.id) : [],
        };
    }

    protected nominations() {
        const s = this.state;
        const hoh = getById(s.gameState, s.week.hohId!);
        const count = this.nomCount;
        const audience = !!s.week.audienceNominee;
        const hohCount = audience ? count - 1 : count;
        const secret = !!s.week.secretHoh;
        const options = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== hoh.id);
        // after the HoH's picks: the audience's nominee (if it's that week), then any Hidden Immunity
        const finish = (hohPicks: number[], betrayed: number[]) => {
            const picks = [...hohPicks];
            const notes: string[] = [];
            if (audience) {
                const choice = this.audiencePick(options.filter((o) => !picks.includes(o.id)).map((o) => o.id));
                picks.push(choice);
                notes.push(`📺 The audience has voted: ${this.player(choice).name} is this week's audience nominee!`);
            }
            const repick = (index: number, exclude: number[], cb: (id: number) => void) => {
                const pool = options.filter((o) => !exclude.includes(o.id));
                if (audience && index === picks.length - 1) return cb(pool.length ? this.audiencePick(pool.map((o) => o.id)) : -1);
                this.hohRepick(hoh, pool, "They played Hidden Immunity! You have to name someone else.", cb);
            };
            this.immunityCheck(picks, repick, (final, immunityNotes) => {
                const kept = final.filter((id) => id >= 0);
                this.explainNoms(hoh.id, kept.filter((id, i) => !(audience && i === final.length - 1)));
                const nominees = kept.map((id) => getById(s.gameState, id));
                const [gs, scene, noms] = generateNomCeremonyScene(s.gameState, [hoh], { forcedNominees: nominees, reveal: true });
                s.gameState = gs;
                s.week.nomineeIds = noms.map((n) => n.id);
                s.week.initialNoms = [...s.week.nomineeIds];
                s.week.nominators = {};
                final.forEach((id, i) => id >= 0 && (s.week.nominators![id] = audience && i === final.length - 1 ? -1 : hoh.id));
                betrayed.filter((v) => kept.includes(v)).forEach((victim) => this.backstab(hoh.id, victim, secret ? 0.3 : 1));
                if (!secret) this.settleRoom(hoh.id, s.week.nomineeIds, true);
                this.settlePawnAsks(hoh.id, s.week.nomineeIds);
                const allNotes = [...notes, ...immunityNotes];
                this.feedPush(`🎯 ${listNames(nominees.map((n) => n.name))} ${nominees.length === 1 ? "is" : "are"} on the block.`);
                const shown = secret
                    ? this.textScene("Nomination Ceremony", [`🕶️ The secret ${HOH} has nominated ${listNames(nominees.map((n) => n.name))}.`, ...allNotes])
                    : this.withNotes(scene, allNotes);
                this.showScene(shown, this.afterNomination(hoh.id, s.week.nomineeIds, Step.SocialAfternoon));
            });
        };
        if (!this.isHuman(hoh)) {
            const { picks, betrayed } = botNominate(s.gameState, s.book, hoh, options, hohCount, this.roomSway());
            return finish(
                picks.map((p) => p.id),
                betrayed
            );
        }
        const lastChance = s.week.blockbuster ? " After the veto, the nominees play the Block Breaker, and the winner comes off the block." : "";
        const howMany = hohCount === 1 ? "one houseguest" : hohCount === 2 ? "two houseguests" : "three houseguests";
        const pawns = ((s.week.room && s.week.room.pawns) || []).filter((p) => p.yes).map((p) => this.player(p.id).name);
        const backdoor = s.week.backdoor;
        const pawnLine =
            (pawns.length > 0 ? ` 🙋 Okay going up as a pawn: ${listNames(pawns)}.` : "") +
            (backdoor !== undefined && !this.player(backdoor).isEvicted
                ? ` 🚪 Your backdoor plan: leave ${this.player(backdoor).name} off the block for now.`
                : "");
        this.privately(hoh.id, `${hoh.name}, ${HOH}`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Nomination Ceremony",
                text: `You are the ${HOH}${secret ? " (and nobody knows it)" : ""}. Choose ${howMany} to nominate for eviction.${
                    audience ? " This week, the audience names the last nominee itself." : ""
                }${lastChance}${pawnLine}`,
                options,
                count: hohCount,
                confirmLabel: "Nominate",
                promisedIds: s.week.room ? s.week.room.promised : undefined,
                resolve: (ids) => {
                    const allies = this.allyIds(hoh.id);
                    finish(
                        ids,
                        ids.filter((id) => allies.includes(id))
                    );
                },
            })
        );
    }

    // ---------- pawn talk ----------

    // Being nominated stings. A bot HoH may reassure its pawns right away; a player HoH gets to choose
    // who to reassure (the PawnTalk step) before the game moves on to `next`. Returns the step to go to.
    protected afterNomination(hohId: number, newNomineeIds: number[], next: Step): Step {
        const s = this.state;
        const week = s.week;
        this.checkPacts(hohId, newNomineeIds);
        if (week.secretHoh) return next;
        const owing = this.repayPawnFavors(hohId, newNomineeIds);
        if (this.isHuman({ id: hohId })) {
            this.mutate((gs) => nominationHit(gs, hohId, newNomineeIds, owing));
            week.pawnAsk = { ids: newNomineeIds, next };
            return Step.PawnTalk;
        }
        this.reseed(`pawn:${newNomineeIds.join(",")}`);
        const talks = this.mutate((gs) => {
            nominationHit(gs, hohId, newNomineeIds, owing);
            return botPawnTalk(gs, getById(gs, hohId), week.nomineeIds || newNomineeIds, newNomineeIds);
        });
        week.pawns = [...(week.pawns || []), ...talks];
        const hoh = this.player(hohId);
        talks.forEach((t) =>
            this.tell([t.toId], `🤫 ${hoh.name} pulled you aside after the ceremony: "You're not the target this week."`)
        );
        return next;
    }

    // Remembers who was told "you're not the target" in a speech, and puts the speech in the week's recap.
    protected keepSpeech(speaker: Houseguest, result: SpeechResult) {
        const s = this.state;
        s.week.pawns = [...(s.week.pawns || []), ...result.talks];
        result.talks.forEach((t) => this.tell([t.toId], `🤫 ${speaker.name} said in front of everyone that you're not the target.`));
        result.lines.forEach((line) => s.socialLog.push(`🎤 ${line}`));
    }

    // A player HoH's nomination speech (also given after naming a replacement nominee). The tone matters:
    // gracious, pawn talk ("you're not the target"), or calling out the real target.
    protected pawnTalk() {
        const s = this.state;
        const ask = s.week.pawnAsk;
        if (!ask) return this.goTo(Step.SocialAfternoon);
        const hoh = this.player(s.week.hohId!);
        const options = ask.ids
            .filter((id) => (s.week.nomineeIds || []).includes(id))
            .map((id) => this.player(id))
            .filter((hg) => !hg.isEvicted);
        if (!this.isHuman(hoh) || hoh.isEvicted || options.length === 0) {
            s.week.pawnAsk = undefined;
            return this.goTo(ask.next);
        }
        const one = options.length === 1 ? options[0].name : null;
        const tones: SpeechTone[] = [
            {
                id: "gracious",
                label: "🕊️ Gracious",
                blurb: "Nothing personal, just a game move. Takes some of the sting out of being nominated.",
            },
            {
                id: "pawn",
                label: "🤫 Pawn talk",
                blurb: one
                    ? `Tell ${one} "you're not the target". It softens the blow if they believe you. If they go home, they'll know you lied.`
                    : `Tell a nominee "you're not the target". It softens the blow if they believe you. If they go home, they'll know you lied.`,
                pick: { text: "Who do you tell they're not the target?", options, max: options.length },
            },
            {
                id: "callout",
                label: "🔥 Call-out",
                blurb: one
                    ? `Tell ${one} to their face that they're your target. They'll hate it. Their enemies will love it.`
                    : "Name your target to their face. They'll hate it, their enemies will love it, and the other nominees hear they're pawns.",
                pick: { text: "Who is your target?", options, max: 1 },
            },
        ];
        this.openly(hoh.id, `${hoh.name}'s nomination speech`, () =>
            this.show({
                kind: "speech",
                actorId: hoh.id,
                title: "Nomination Speech",
                text: "Nobody likes being nominated. What you say now decides how hard they take it. Pick a tone.",
                tones,
                deliver: (toneId, ids) => {
                    this.reseed("speech");
                    const result = this.mutate((gs) =>
                        nominationSpeech(gs, hoh.id, options.map((o) => o.id), toneId as SpeechToneId, ids, s.humanIds)
                    );
                    this.keepSpeech(hoh, result);
                    s.week.pawnAsk = undefined;
                    s.step = ask.next;
                    this.save();
                    return result.lines;
                },
                next: () => this.run(),
            })
        );
    }

    // The veto holder's speech at the veto ceremony, given after deciding whether to use the veto.
    protected vetoSpeechPrompt(pov: Houseguest, hoh: Houseguest, noms: Houseguest[], used: boolean, next: () => void) {
        const s = this.state;
        const everyone = nonEvictedHouseguests(s.gameState).filter((hg) => hg.id !== pov.id);
        // in a secret HoH week, nobody can call out a Head of Household they don't know
        const onStage = (this.state.week.secretHoh ? noms : [hoh, ...noms]).filter((hg) => hg.id !== pov.id);
        const tones: SpeechTone[] = [
            { id: "gracious", label: "🕊️ Gracious", blurb: "Love for everyone. A small boost with the HoH and the nominees." },
            {
                id: "promise",
                label: "🤝 Promise",
                blurb: "Promise up to two houseguests they're safe if you win HoH next week. If they believe you, they'll like you more, and they'll hold you to it.",
                pick: { text: "Who do you promise safety next week?", options: everyone, max: 2 },
            },
        ];
        if (onStage.length > 0)
            tones.push({
                id: "callout",
                label: "🔥 Call-out",
                blurb: "Call out the HoH or a nominee in front of the house. They'll hate it. Their enemies will love it.",
                pick: { text: "Who do you call out?", options: onStage, max: 1 },
            });
        this.show({
            kind: "speech",
            actorId: pov.id,
            title: "Veto Speech",
            text: used ? "You're using the veto. First, a few words. Pick a tone." : "You're not using the veto. First, a few words. Pick a tone.",
            tones,
            deliver: (toneId, ids) => {
                this.reseed("vetospeech");
                const before = this.deals.length;
                const result = this.mutate((gs) =>
                    vetoSpeech(gs, this.deals, pov.id, hoh.id, noms.map((n) => n.id), toneId as SpeechToneId, ids, s.humanIds)
                );
                this.keepSpeech(pov, result);
                this.deals.slice(before).forEach((d) => pledge(this.ledger, "safety", d.withId, d.hohId, d.week + 1));
                this.save();
                return result.lines;
            },
            next,
        });
    }

    // Eviction night: each nominee who is a player makes a last plea before the vote.
    protected speeches(): void {
        const s = this.state;
        if (!s.week.overthrowChecked) {
            s.week.overthrowChecked = true;
            const slot = this.activePower("overthrow");
            if (slot && slot.holderId !== s.week.hohId) return this.overthrow(slot, () => this.run());
        }
        if (!s.week.evictionIntro) {
            s.week.evictionIntro = true;
            const tonight = (s.week.nomineeIds || []).map((id) => this.player(id));
            this.announce("Live Eviction Night", evictionIntro(tonight, nonEvictedHouseguests(s.gameState).length));
            this.save();
            return this.run();
        }
        const nomIds = s.week.nomineeIds || [];
        const spoke = s.week.spoke || [];
        const speaker = this.alivePlayers.find((p) => nomIds.includes(p.id) && !spoke.includes(p.id) && this.isHuman(p));
        if (!speaker) return this.goTo(Step.Eviction);
        const everyone = nonEvictedHouseguests(s.gameState);
        const voters = everyone.filter((hg) => hg.id !== s.week.hohId && !nomIds.includes(hg.id));
        const rivals = everyone.filter((hg) => nomIds.includes(hg.id) && hg.id !== speaker.id);
        const canPromise = everyone.filter((hg) => !nomIds.includes(hg.id));
        const tones: SpeechTone[] = [
            { id: "gracious", label: "🕊️ Gracious", blurb: "Thank the house and keep it classy. A small boost with every voter." },
        ];
        if (canPromise.length > 0)
            tones.push({
                id: "promise",
                label: "🤝 Promise",
                blurb: "Promise up to two houseguests they're safe if you stay and win HoH. If they believe you, it can win their vote, and they'll hold you to it.",
                pick: { text: "Who do you promise safety next week?", options: canPromise, max: 2 },
            });
        if (rivals.length > 0)
            tones.push({
                id: "callout",
                label: "🔥 Call-out",
                blurb: "Go after the nominee sitting next to you. Voters who dislike them move toward you. Their friends won't like it.",
                pick: { text: "Who do you call out?", options: rivals, max: 1 },
            });
        this.openly(speaker.id, `${speaker.name}'s eviction speech`, () =>
            this.show({
                kind: "speech",
                actorId: speaker.id,
                title: "Eviction Speech",
                text: "You're on the block and the house is about to vote. This is your last chance to change their minds. Pick a tone.",
                tones,
                deliver: (toneId, ids) => {
                    this.reseed(`evictionspeech:${speaker.id}`);
                    const before = this.deals.length;
                    const result = this.mutate((gs) =>
                        evictionSpeech(gs, this.deals, speaker.id, voters.map((v) => v.id), toneId as SpeechToneId, ids, s.humanIds)
                    );
                    this.keepSpeech(speaker, result);
                    this.deals.slice(before).forEach((d) => pledge(this.ledger, "safety", d.withId, d.hohId, d.week + 1));
                    s.week.spoke = [...spoke, speaker.id];
                    this.save();
                    return result.lines;
                },
                next: () => this.run(),
            })
        );
    }

    // Called at the eviction: pawns who went home were lied to.
    protected settlePawns(evictedIds: number[]) {
        const talks = this.state.week.pawns || [];
        if (talks.length === 0) return;
        const news = this.mutate((gs) => settlePawnTalk(gs, talks, evictedIds));
        news.forEach((n) => this.tell(n.toIds, n.text));
        talks.forEach((t) => shiftTrust(this.ledger, t.toId, t.hohId, evictedIds.includes(t.toId) ? -0.4 : 0.1));
        talks
            .filter((t) => evictedIds.includes(t.toId))
            .forEach((t) =>
                this.logMove(
                    "backstab",
                    t.hohId,
                    t.toId,
                    `${this.player(t.hohId).name} told ${this.player(t.toId).name} they weren't the target, then sent them home`,
                    2.5
                )
            );
        this.state.week.pawns = [];
    }

    protected vetoComp(): void {
        const s = this.state;
        if (!s.week.swapChecked) {
            s.week.swapChecked = true;
            const slot = this.activePower("ghostSwap");
            if (slot && slot.holderId !== s.week.hohId) return this.ghostSwap(slot, () => this.run());
        }
        const hoh = getById(s.gameState, s.week.hohId!);
        const noms = s.week.nomineeIds!.map((id) => getById(s.gameState, id));
        // the draw for veto players is saved too, so a reload can't redraw it
        const drawKey = `vetoPlayers:${s.gameState.phase}`;
        let drawn = this.locked<number[]>(drawKey);
        if (!drawn) {
            drawn = pickVetoPlayers(s.gameState, [hoh], noms).povPlayers.map((p) => p.id);
            this.lock(drawKey, drawn);
        }
        const players = drawn.map((id) => getById(s.gameState, id));
        const choice = this.pickComp(players, false);
        const onWinner = (winnerId: number) => {
            const [gs, scene, pov] = generateVetoCompScene(s.gameState, [hoh], noms, {
                veto: GoldenVeto,
                forcedPlayers: players,
                forcedWinner: getById(s.gameState, winnerId),
            });
            s.gameState = gs;
            s.week.povId = pov.id;
            this.feedPush(`🏅 ${pov.name} won the Veto.`);
            void scene; // the classic scene is replaced by the Veto winner's own moment
            // at the final four there may be nobody left to name as a replacement: then there's nothing to lobby for
            const next = this.vetoUsable(s.week.nomineeIds!, pov.id, hoh.id) ? Step.SocialVeto : Step.VetoCeremony;
            this.showScene(this.vetoWinnerScene(players, pov, noms, hoh), next);
        };
        if (choice === TAINTED_WINE_ID) return this.runTaintedWine("Power of Veto Competition", players, onWinner);
        if (choice === MEMORY_DUEL_ID) return this.runMemoryDuel("Power of Veto Competition", players, onWinner);
        this.runComp("Power of Veto Competition", compById(choice), players, onWinner, "veto");
    }

    // The Veto winner gets their own moment: the necklace goes on, and what it means for the block.
    protected vetoWinnerScene(players: Houseguest[], pov: Houseguest, noms: Houseguest[], hoh: Houseguest): Scene {
        const s = this.state;
        const onBlock = noms.some((n) => n.id === pov.id);
        const isHoh = !s.week.secretHoh && pov.id === hoh.id;
        const you = s.humanIds.length === 1 && s.humanIds[0] === pov.id;
        const what = onBlock
            ? `${pov.name} was on the block. Now they can save themselves.`
            : isHoh
            ? `The Head of Household won it too. The nominations only change if ${pov.name} wants them to.`
            : `${pov.name} now decides whether the nominations stay the same.`;
        const others = players.filter((p) => p.id !== pov.id);
        return new Scene({
            title: "Veto Winner",
            gameState: s.gameState,
            content: (
                <div className="bbb-veto-winner">
                    <div className="bbb-veto-winner-label">🏅 The Veto goes to…</div>
                    <div className="bbb-veto-winner-photo">
                        <img src={pov.imageURL} alt={pov.name} />
                        <span className="bbb-veto-winner-medal">🏅</span>
                    </div>
                    <div className="bbb-veto-winner-name">{pov.name}</div>
                    <p>{what}</p>
                    {you && <p>It's your call at the Veto Ceremony.</p>}
                    {others.length > 0 && <p className="bbb-veto-winner-others">Also played: {listNames(others.map((p) => p.name))}</p>}
                    <NextEpisodeButton />
                </div>
            ),
        });
    }

    protected vetoCeremony() {
        const s = this.state;
        let gsAtStart = s.gameState;
        let hoh = getById(gsAtStart, s.week.hohId!);
        let pov = getById(gsAtStart, s.week.povId!);
        let noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        // the veto holder's speech changes relationships: carry on from the state it left
        const refresh = () => {
            gsAtStart = s.gameState;
            hoh = getById(gsAtStart, s.week.hohId!);
            pov = getById(gsAtStart, s.week.povId!);
            noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        };

        const generate = (choice: { decision: Houseguest | null; reason: string }, renom?: Houseguest, notes: string[] = []) => {
            const [gs, scene, finalNoms] = generateVetoCeremonyScene(gsAtStart, [hoh], noms, pov, {
                veto: GoldenVeto,
                forcedVetoChoice: choice,
                forcedRenom: renom,
            });
            s.gameState = gs;
            s.week.nomineeIds = finalNoms.map((n: Houseguest) => n.id);
            if (choice.decision) this.planB();
            if (renom) s.week.nominators = { ...(s.week.nominators || {}), [renom.id]: hoh.id };
            const next = s.week.blockbuster ? Step.SocialBlockbuster : Step.SocialCampaign;
            const shown = s.week.secretHoh
                ? this.textScene("Veto Ceremony", [
                      choice.decision ? `${pov.name} used the Veto on ${choice.decision.name}.` : `${pov.name} did not use the Veto.`,
                      ...(renom ? [`🕶️ The secret ${HOH} named ${renom.name} as the replacement nominee.`] : []),
                      ...notes,
                      `The final nominees: ${listNames(finalNoms.map((n: Houseguest) => n.name))}.`,
                  ])
                : this.withNotes(scene, notes);
            this.showScene(shown, renom ? this.afterNomination(hoh.id, [renom.id], next) : next);
        };
        // the replacement nominee may hold Hidden Immunity: then the HoH names someone else
        const renominate = (choice: { decision: Houseguest | null; reason: string }, first: number, pool: Houseguest[], after: (id: number) => void) =>
            this.immunityCheck(
                [first],
                (_i, exclude, cb) =>
                    this.hohRepick(
                        hoh,
                        pool.filter((hg) => !exclude.includes(hg.id)),
                        "They played Hidden Immunity! You have to name someone else.",
                        cb
                    ),
                (final, notes) => {
                    if (final[0] < 0) return generate(choice, undefined, notes);
                    generate(choice, getById(gsAtStart, final[0]), notes);
                    after(final[0]);
                }
            );

        // the veto holder's decision, saved once made, so the scenes in between don't ask for it again
        const phase = gsAtStart.phase;
        const choiceKey = `vetoChoice:${phase}`;
        const decided = (choice: { decision: Houseguest | null; reason: string }) => {
            this.lock(choiceKey, { id: choice.decision ? choice.decision.id : -1, reason: choice.reason });
            this.settleVetoPromises(pov.id, choice.decision ? choice.decision.id : null);
            afterChoice(choice);
        };

        const afterChoice = (choice: { decision: Houseguest | null; reason: string }) => {
            if (!choice.decision) return generate(choice);
            // the replacement: never the veto holder (vetoUsable makes sure there's someone)
            const options = exclude(nonEvictedHouseguests(gsAtStart), [...noms, pov, hoh]);
            if (options.length === 0) return generate({ decision: null, reason: "" });
            // everyone sees the veto used first; only then does the HoH name a replacement
            const usedKey = `vetoUsedShown:${phase}`;
            if (this.locked(usedKey) === undefined) {
                this.lock(usedKey, true);
                const scene = this.vetoUsedScene(pov, choice.decision, hoh, options);
                this.weekScenes.push(scene);
                return this.show({ kind: "scene", scene });
            }
            // before naming a replacement, the HoH huddles with their alliance: players in it suggest who goes up
            const huddle = this.huddleWith(hoh.id);
            if (huddle.length > 0 && options.length > 1) {
                return this.gather<number>(
                    `huddle:${phase}`,
                    huddle,
                    `${hoh.name} is talking it over with their alliance`,
                    (p) => `${p.name}: ${hoh.name} wants a word`,
                    (p, _more, answer) => ({
                        kind: "choose",
                        actorId: p.id,
                        title: `👑 ${hoh.name} needs a replacement nominee`,
                        text:
                            `${pov.name} used the ${VETO} on ${choice.decision!.name}. Before the ceremony goes on, ${hoh.name} pulls you aside: ` +
                            `“Who should I put up instead?”`,
                        options: options.filter((o) => o.id !== p.id),
                        count: 1,
                        noneLabel: "Leave it to them",
                        confirmLabel: "Suggest",
                        resolve: (ids) => answer(ids.length > 0 ? ids[0] : -1),
                    }),
                    (answers) => replace(choice, answers),
                    () => -1
                );
            }
            replace(choice, {});
        };

        // The HoH names a replacement, with their alliance's advice: `advice` is what players in it suggested.
        const replace = (choice: { decision: Houseguest | null; reason: string }, advice: { [playerId: number]: number }) => {
            if (!choice.decision) return generate(choice);
            const options = exclude(nonEvictedHouseguests(gsAtStart), [...noms, pov, hoh]);
            const said = Object.keys(advice)
                .map(Number)
                .filter((id) => options.some((o) => o.id === advice[id]))
                .map((id) => ({ by: id, pick: advice[id] }));
            // the only one who can go up: naming them breaks no promise, and betrays nobody
            const forced = options.length === 1;
            const settle = (id: number) => {
                if (forced) return this.forcedNomination(hoh.id, id);
                if (!s.week.secretHoh) this.settleRoom(hoh.id, [id], false);
                this.settlePawnAsks(hoh.id, [id]);
            };
            if (!this.isHuman(hoh)) {
                const sway = this.roomSway();
                sway.targets = [...said.map((x) => x.pick), ...sway.targets]; // what their allies said, first
                const { picks, betrayed } = botNominate(gsAtStart, s.book, hoh, options, 1, sway);
                return renominate(choice, picks[0].id, options, (id) => {
                    said.forEach((x) =>
                        this.tell(
                            [x.by],
                            x.pick === id
                                ? `👑 ${hoh.name} took your advice: ${this.player(id).name} went up.`
                                : `👑 ${hoh.name} didn't take your advice (${this.player(x.pick).name}): ${this.player(id).name} went up.`
                        )
                    );
                    this.explainNoms(hoh.id, [id]);
                    if (id === picks[0].id && !forced) betrayed.forEach((victim) => this.backstab(hoh.id, victim, s.week.secretHoh ? 0.3 : 1));
                    settle(id);
                });
            }
            const saved = choice.decision;
            // what the HoH's alliance says: the players in it, and the bots
            const bots = this.alliancesOf(hoh.id).reduce<{ by: number; pick: number }[]>((all, a) => {
                aliveMembers(gsAtStart, a)
                    .filter((m) => m.id !== hoh.id && !this.isHuman(m) && !all.some((x) => x.by === m.id))
                    .forEach((m) => {
                        const pick = botSuggestion(gsAtStart, a, m.id, options.map((o) => o.id));
                        if (pick !== null && pick !== m.id) all.push({ by: m.id, pick });
                    });
                return all;
            }, []);
            const heard = [...said, ...bots];
            const adviceLine =
                this.allianceTimeOpen() && heard.length > 0
                    ? ` Your alliance's advice: ${heard.map((x) => `${this.player(x.by).name} says ${this.player(x.pick).name}`).join(", ")}.`
                    : "";
            this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
                this.show({
                    kind: "choose",
                    actorId: hoh.id,
                    title: "Replacement Nominee",
                    text:
                        `${pov.name} used the ${VETO} on ${saved.id === pov.id ? "themselves" : saved.name}: “Since I have just vetoed one of your nominations, you must name a replacement nominee.”` +
                        (forced ? ` ${options[0].name} is the only one who can go up, so it breaks no promise.` : adviceLine) +
                        (s.week.backdoor !== undefined && options.some((o) => o.id === s.week.backdoor)
                            ? ` 🚪 Your backdoor plan: ${this.player(s.week.backdoor).name}.`
                            : ""),
                    options,
                    count: 1,
                    confirmLabel: "Nominate",
                    promisedIds: s.week.room && !forced ? s.week.room.promised : undefined,
                    resolve: (ids) =>
                        renominate(choice, ids[0], options, (id) => {
                            if (!forced && this.allyIds(hoh.id).includes(id)) this.backstab(hoh.id, id, s.week.secretHoh ? 0.3 : 1);
                            if (id === s.week.backdoor)
                                this.alliancesOf(hoh.id).forEach((a) =>
                                    this.tellAlliance(a, `🚪 The backdoor worked: ${this.player(id).name} is on the block.`, hoh.id)
                                );
                            settle(id);
                        }),
                })
            );
        };

        // At the final four, with the veto holder off the block, there's nobody left to name as a replacement: the
        // veto can't be used, so there's nothing to decide.
        const vetoUsable = exclude(nonEvictedHouseguests(gsAtStart), [...noms, pov, hoh]).length > 0;
        if (!vetoUsable) {
            this.feedPush(`🛡️ ${pov.name} can't use the ${VETO}: there's nobody left to name as a replacement.`);
            return generate({ decision: null, reason: "" });
        }
        const savedChoice = this.locked<{ id: number; reason: string }>(choiceKey);
        if (savedChoice) return afterChoice({ decision: savedChoice.id >= 0 ? getById(gsAtStart, savedChoice.id) : null, reason: savedChoice.reason });
        if (this.isHuman(pov)) {
            this.privately(pov.id, `${pov.name}, veto holder`, () =>
                this.show({
                    kind: "choose",
                    actorId: pov.id,
                    title: "Veto Ceremony",
                    text: "You hold the Power of Veto. Will you use it to save one of the nominees?",
                    options: noms,
                    count: 1,
                    noneLabel: "Don't use the veto",
                    confirmLabel: "Use the veto",
                    resolve: (ids) =>
                        this.vetoSpeechPrompt(pov, hoh, noms, ids.length > 0, () => {
                            refresh();
                            decided(
                                ids.length === 0
                                    ? { decision: null, reason: "" }
                                    : { decision: getById(gsAtStart, ids[0]), reason: "" }
                            );
                        }),
                })
            );
        } else {
            const immunePlayers = hoh.id !== pov.id ? [hoh] : [];
            decided(this.swayVeto(botVeto(gsAtStart, s.book, pov, noms, hoh.id, immunePlayers), pov, noms, hoh));
        }
    }

    // A bot veto holder heard the players out before the ceremony (see vetoCase): a nominee who convinced them gets
    // saved, unless the HoH made a better case for keeping the nominations the same.
    protected swayVeto(choice: { decision: Houseguest | null; reason: string }, pov: Houseguest, noms: Houseguest[], hoh: Houseguest) {
        const cases = this.state.week.vetoCases || {};
        if (noms.some((n) => n.id === pov.id)) return choice;
        // the HoH's backdoor plan: an ally holding the veto pulls a pawn off, so the real target can go up
        const backdoor = this.state.week.backdoor;
        if (
            backdoor !== undefined &&
            !choice.decision &&
            hoh.id !== pov.id &&
            backdoor !== pov.id &&
            !noms.some((n) => n.id === backdoor) &&
            this.allyIds(hoh.id).includes(pov.id)
        ) {
            const pawn = [...noms].sort((a, b) => (pov.relationships[b.id] ?? 0) - (pov.relationships[a.id] ?? 0))[0];
            if (pawn) return { decision: pawn, reason: "It's all part of the plan." };
        }
        // nominees who made their case, or someone made it for them, and it worked
        const asks = Object.values(this.state.week.vetoAsks || {});
        const won = noms.filter((n) => cases[n.id] || asks.includes(n.id)).sort((a, b) => (pov.relationships[b.id] ?? 0) - (pov.relationships[a.id] ?? 0));
        const hohWon = hoh.id !== pov.id && cases[hoh.id] === true;
        const hohRel = pov.relationships[hoh.id] ?? 0;
        if (won.length > 0 && !choice.decision && (!hohWon || (pov.relationships[won[0].id] ?? 0) > hohRel))
            return {
                decision: won[0],
                reason: cases[won[0].id] ? `${won[0].name} made their case, and it worked.` : `I was asked to save ${won[0].name}, and I agreed.`,
            };
        if (hohWon && choice.decision && !cases[choice.decision.id])
            return { decision: null, reason: `${hoh.name} asked me to keep the nominations the same.` };
        return choice;
    }

    // Promises a player veto holder made (see vetoPleas) are checked against what they did.
    protected settleVetoPromises(povId: number, savedId: number | null) {
        this.tellAll(this.mutate((gs) => settleVetoPledges(gs, this.ledger, povId, savedId, gs.phase)));
    }

    // The veto ceremony, before the replacement: the holder uses the veto, and tells the HoH to name someone.
    protected vetoUsedScene(pov: Houseguest, saved: Houseguest, hoh: Houseguest, options: Houseguest[]): Scene {
        const secret = !!this.state.week.secretHoh;
        return this.textScene("Veto Ceremony", [
            `🏅 ${pov.name} has decided to use the ${POV} on ${saved.id === pov.id ? "themselves" : saved.name}.`,
            secret
                ? "“Since I have just vetoed one of the nominations, the Head of Household must name a replacement nominee.”"
                : `“${hoh.name}, since I have just vetoed one of your nominations, you must name a replacement nominee.”`,
            ...(options.length === 1 ? [`Only ${options[0].name} is left who can take their place.`] : []),
        ]);
    }

    // A replacement nominee who was the only one who could go up: a promise of safety couldn't have been kept, so
    // it isn't broken. It's just over.
    protected forcedNomination(hohId: number, id: number) {
        const s = this.state;
        const hoh = this.player(hohId);
        const room = s.week.room;
        if (room && room.promised.includes(id)) {
            room.promised = room.promised.filter((p) => p !== id);
            room.safe = room.safe.filter((p) => p !== id);
            this.tell([id], `🤷 ${hoh.name} promised you safety, but you were the only one left who could go up. Nothing they could do.`);
        }
        openPledges(this.ledger)
            .filter((p) => p.fromId === hohId && p.toId === id && p.kind === "safety" && p.week === s.gameState.phase)
            .forEach((p) => (p.status = "void"));
        this.save();
    }

    protected blockbuster() {
        const s = this.state;
        const noms = s.week.nomineeIds!.map((id) => getById(s.gameState, id));
        const comp = compById(this.compChoice(() => pickQuickComp(s.gameState, s.history, s.usedComps, this.rules.kinds, this.haveNotCompeting(noms)).id));
        this.runComp("Block Breaker Competition", comp, noms, (winnerId) => {
            const [gs, scene, remaining] = generateBlockbusterScene(s.gameState, noms, winnerId);
            s.gameState = gs;
            s.week.blockbusterId = winnerId;
            s.week.nomineeIds = remaining.map((n) => n.id);
            this.planB();
            this.showScene(scene, Step.SocialCampaign);
        });
    }

    protected eviction() {
        const s = this.state;
        const gsAtStart = s.gameState;
        const hoh = getById(gsAtStart, s.week.hohId!);
        const noms = s.week.nomineeIds!.map((id) => getById(gsAtStart, id));
        const voters = exclude(nonEvictedHouseguests(gsAtStart), [hoh, ...noms]);
        const votes: { [voterId: number]: number } = {};
        const botBetrayals: [number, number][] = [];
        voters.forEach((voter) => {
            if (this.isHuman(voter)) return;
            const vote = this.intendedVote(gsAtStart, voter, noms);
            votes[voter.id] = vote.id;
            if (vote.betrayed !== undefined) botBetrayals.push([voter.id, vote.betrayed]);
        });

        // secret powers can change the count: an extra vote (+1), a nullified vote (-1)
        const adjust: { [nomineeId: number]: number } = {};
        const adjustNotes: string[] = [];
        const counted = (id: number) => Object.values(votes).filter((v) => v === id).length + (adjust[id] || 0);
        const generate = (tieBreak?: number) => {
            const [gs, scene] = generateEvictionScene(gsAtStart, [hoh], noms, {
                votingTo: "Evict",
                forcedVotes: votes,
                forcedTieBreak: tieBreak,
                hideVoters: true,
                voteAdjustments: adjust,
                adjustmentNotes: adjustNotes,
                secretTieBreaker: !!s.week.secretHoh,
            });
            const ctx = { ...this.reasonContext, gs: gsAtStart };
            const voteWhy: { [voterId: number]: { t: number; why: string } } = {};
            Object.keys(votes)
                .map(Number)
                .filter((v) => !this.isHuman({ id: v }))
                .forEach((v) => (voteWhy[v] = { t: votes[v], why: explainVote(ctx, v, votes[v], noms.map((n) => n.id)) }));
            if (this.watching)
                this.announce(
                    "🔍 How the house voted",
                    Object.keys(voteWhy).map((v) => `🗳️ ${this.player(Number(v)).name} voted to evict ${this.player(voteWhy[Number(v)].t).name}: ${voteWhy[Number(v)].why}.`)
                );
            const tally: { [nomineeId: number]: number } = {};
            noms.forEach((n) => (tally[n.id] = Math.max(0, counted(n.id))));
            s.gameState = gs;
            const evictedIds = noms.filter((n) => getById(gs, n.id).isEvicted).map((n) => n.id);
            s.history = [
                ...s.history,
                {
                    week: gsAtStart.phase,
                    hohId: hoh.id,
                    nomineeIds: noms.map((n) => n.id),
                    povId: s.week.povId,
                    blockbusterId: s.week.blockbusterId,
                    evictedIds,
                    votes: tally,
                    why: { noms: s.week.nomWhy, votes: voteWhy },
                },
            ];
            // votes against allies can get noticed (bots 30% of the time; players less often the more social they are)
            this.reseed("betrayals");
            botBetrayals.forEach(([voter, victim]) => this.backstab(voter, victim, 0.3));
            Object.keys(votes)
                .map(Number)
                .filter((voter) => this.isHuman({ id: voter }) && this.allyIds(voter).includes(votes[voter]))
                .forEach((voter) =>
                    this.backstab(voter, votes[voter], Math.max(0.1, Math.min(0.55, 0.6 - 0.05 * getSocial(getById(gs, voter)))))
                );
            const pawns = [...(s.week.pawns || [])];
            this.settlePawns(evictedIds);
            this.settleTheVote(gsAtStart.phase, hoh.id, votes, evictedIds, noms);
            this.recordEvictionGrudges(evictedIds, this.blameFor(evictedIds[0]), votes, pawns, "put me on the block");
            // the big moves of the week
            evictedIds.forEach((e) => {
                const out = this.player(e).name;
                if (s.week.overthrowBy !== undefined) {
                    this.logMove("move", s.week.overthrowBy, e, `${this.player(s.week.overthrowBy).name} used the ${POWERS.overthrow.name} and sent ${out} home`, 5);
                } else if (s.week.ghostNominee === e && s.week.ghostBy !== undefined) {
                    this.logMove("move", s.week.ghostBy, e, `${this.player(s.week.ghostBy).name} secretly used the ${POWERS.ghostSwap.name} to send ${out} home`, 4.5);
                } else if (s.week.initialNoms && !s.week.initialNoms.includes(e) && (s.week.nominators || {})[e] === hoh.id) {
                    this.logMove("move", hoh.id, e, `${hoh.name} backdoored ${out}`, 3 + 0.4 * compWins(this.player(e), s.history));
                }
                this.feedPush(`🚪 ${out} has been evicted.`);
            });
            this.writeDiary(gsAtStart.phase, votes, evictedIds);
            pruneAlliances(s.gameState, s.book).forEach((a) => this.tellAlliance(a, `💔 ${a.name} is no more.`));
            this.weekScenes.push(scene);
            this.pushJuryHouse();
            this.pushEpisode(BigBrotherVanilla, `Day ${dayOf(gsAtStart, gsAtStart.phase, DAY_PART.eviction)}`);
            s.step = Step.Fallout;
            this.save();
            this.show({ kind: "scene", scene });
        };

        const afterVotes = () => {
            const counts = noms.map((n) => counted(n.id));
            const max = Math.max(...counts);
            const tied = noms.filter((_, i) => counts[i] === max);
            if (tied.length > 1 && this.isHuman(hoh)) {
                this.privately(hoh.id, `${hoh.name}, Head of Household`, () =>
                    this.show({
                        kind: "choose",
                        actorId: hoh.id,
                        title: "Tie Breaker",
                        text: "The vote is tied! As Head of Household, you must cast the deciding vote to evict.",
                        options: tied,
                        count: 1,
                        confirmLabel: "Evict",
                        resolve: (ids) => generate(ids[0]),
                    })
                );
            } else {
                generate();
            }
        };

        this.collectVotes(
            `evict:${s.step}:${noms.map((n) => n.id).join(",")}`,
            this.playingHumans(voters),
            (voter, record) => ({
                kind: "choose",
                actorId: voter.id,
                title: "Live Eviction",
                text: "It's time to vote. Your vote is secret. Who do you vote to evict?",
                options: noms,
                count: 1,
                promisedIds: promisedVotes(this.ledger, voter.id, gsAtStart.phase),
                confirmLabel: "Vote to evict",
                resolve: (ids) => record(ids[0]),
            }),
            (humanVotes) => {
                Object.assign(votes, humanVotes);
                this.votePowers(noms, votes, adjust, adjustNotes, afterVotes);
            },
            (voter) => this.intendedVote(gsAtStart, voter, noms).id
        );
    }

    // At the eviction: the Extra Vote and the Vote Nullifier, if someone holds them and wants to use them.
    protected votePowers(
        noms: Houseguest[],
        votes: { [voterId: number]: number },
        adjust: { [nomineeId: number]: number },
        notes: string[],
        done: () => void
    ) {
        const s = this.state;
        const nomIds = noms.map((n) => n.id);
        const extra = this.activePower("extraVote");
        const nullifier = this.activePower("nullifier");
        const castExtraVote = (target: number) => {
            extra!.used = true;
            adjust[target] = (adjust[target] || 0) + 1;
            notes.push(`${POWERS.extraVote.emoji} Someone cast an ${POWERS.extraVote.name} tonight.`);
            this.logMove("move", extra!.holderId!, target, `${this.player(extra!.holderId!).name} cast an ${POWERS.extraVote.name} against ${this.player(target).name}`, 2);
        };
        const nullifyVote = (target: number) => {
            nullifier!.used = true;
            const against = Object.values(votes).filter((v) => v === target).length + (adjust[target] || 0);
            if (against > 0) adjust[target] = (adjust[target] || 0) - 1;
            notes.push(`${POWERS.nullifier.emoji} Someone used a ${POWERS.nullifier.name}: one vote to evict ${this.player(target).name} won't count.`);
            this.logMove("move", nullifier!.holderId!, target, `${this.player(nullifier!.holderId!).name} nullified a vote to save ${this.player(target).name}`, 2);
        };
        const steps: ((next: () => void) => void)[] = [];
        if (extra && votes[extra.holderId!] !== undefined) {
            const holder = this.player(extra.holderId!);
            steps.push((next) => {
                if (!this.isHuman(holder)) {
                    if (botExtraVote(s.gameState, this.book, holder.id, nomIds, votes[holder.id], this.partnersOf(holder.id))) castExtraVote(votes[holder.id]);
                    return next();
                }
                this.privately(holder.id, `${holder.name}, your ${POWERS.extraVote.name}`, () =>
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: `${POWERS.extraVote.emoji} ${POWERS.extraVote.name}`,
                        text: "You can cast a second vote tonight. Who do you vote to evict?",
                        options: noms,
                        count: 1,
                        confirmLabel: "Cast it",
                        noneLabel: "Save it",
                        resolve: (ids) => {
                            if (ids.length > 0) castExtraVote(ids[0]);
                            next();
                        },
                    })
                );
            });
        }
        if (nullifier && nullifier.holderId !== s.week.hohId) {
            const holder = this.player(nullifier.holderId!);
            steps.push((next) => {
                if (!this.isHuman(holder)) {
                    const save = botNullify(s.gameState, this.book, holder.id, nomIds, this.partnersOf(holder.id));
                    if (save !== null && Object.values(votes).some((v) => v === save)) nullifyVote(save);
                    return next();
                }
                this.privately(holder.id, `${holder.name}, your ${POWERS.nullifier.name}`, () =>
                    this.show({
                        kind: "choose",
                        actorId: holder.id,
                        title: `${POWERS.nullifier.emoji} ${POWERS.nullifier.name}`,
                        text: "Pick a nominee: one vote to evict them won't count tonight.",
                        options: noms,
                        count: 1,
                        confirmLabel: "Nullify a vote",
                        noneLabel: "Save it",
                        resolve: (ids) => {
                            if (ids.length > 0) nullifyVote(ids[0]);
                            next();
                        },
                    })
                );
            });
        }
        const runStep = (i: number): void => (i >= steps.length ? done() : steps[i](() => runStep(i + 1)));
        this.reseed("votepowers");
        runStep(0);
    }

    protected finaleHoh() {
        const s = this.state;
        const gs = s.gameState;
        if (!s.week.finaleComps) s.week.finaleComps = finaleComps(gs, s.history, s.usedComps).map((c) => c.id);
        const [c1, c2, c3] = s.week.finaleComps.map(compById);
        const final3 = nonEvictedHouseguests(gs);
        let comp: CompDefinition;
        let participants: Houseguest[];
        let title: string;
        let record: (id: number) => void;
        if (s.step === Step.FinaleHoh1) {
            comp = c1;
            participants = final3;
            title = "Final HoH, Part 1 (all three houseguests)";
            record = (id) => (s.week.endurance = id);
        } else if (s.step === Step.FinaleHoh2) {
            comp = c2;
            participants = final3.filter((hg) => hg.id !== s.week.endurance);
            title = "Final HoH, Part 2 (the two who lost Part 1)";
            record = (id) => (s.week.skill = id);
        } else {
            comp = c3;
            participants = [getById(gs, s.week.endurance!), getById(gs, s.week.skill!)];
            title = "Final HoH, Part 3 (winners of Parts 1 and 2)";
            record = (id) => (s.week.finalHoh = id);
        }
        this.runComp(title, comp, participants, (winnerId) => {
            record(winnerId);
            if (s.step === Step.FinaleHoh3) {
                const [newGs, scene] = finalHohCompScene(gs, {
                    endurance: s.week.endurance!,
                    skill: s.week.skill!,
                    final: s.week.finalHoh!,
                });
                s.gameState = newGs;
                this.showScene(scene, Step.FinalEviction);
            } else {
                this.goTo(s.step === Step.FinaleHoh1 ? Step.SocialFinale2 : Step.SocialFinale3);
            }
        });
    }

    protected finalEviction() {
        const s = this.state;
        const gs = s.gameState;
        const hoh = getById(gs, s.week.finalHoh!);
        const others = nonEvictedHouseguests(gs).filter((hg) => hg.id !== hoh.id);
        const finish = (evictee?: number) => {
            const [newGs, scene] = finalEvictionScene(gs, hoh, evictee);
            s.gameState = newGs;
            const evicted = others.find((hg) => getById(newGs, hg.id).isEvicted);
            if (evicted) {
                this.tellAll(this.mutate((g) => settleFinalPledges(g, this.ledger, hoh.id, evicted.id)));
                this.endShowmances([evicted.id]);
                this.recordEvictionGrudges([evicted.id], hoh.id, {}, [], "cut me at the final three");
                this.pushJuryHouse();
                const kept = others.find((o) => o.id !== evicted.id);
                this.addDiary(gs.phase, hoh.id, [
                    `I won the final Head of Household, and I had to cut ${evicted.name}.${kept ? ` I'm sitting next to ${kept.name}. I think I can beat them.` : ""}`,
                ]);
                this.addDiary(gs.phase, evicted.id, [`So close. Final three, and ${hoh.name} cut me. I'll have my say on the jury.`]);
            }
            this.showScene(scene, Step.FinalTwo);
        };
        if (!this.isHuman(hoh)) {
            // a final-two deal decides it, if the HoH sticks to it
            this.reseed("final2");
            const partners = final2Partners(this.ledger, hoh.id).filter((id) => others.some((o) => o.id === id));
            const love = partnerOf(this.showmances, hoh.id);
            if (love !== undefined && others.some((o) => o.id === love)) return finish(others.find((o) => o.id !== love)!.id);
            if (partners.length === 1 && Math.abs(rng().randomFloat()) < this.honor(hoh.id, partners[0]))
                return finish(others.find((o) => o.id !== partners[0])!.id);
            return finish();
        }
        this.privately(hoh.id, `${hoh.name}, final Head of Household`, () =>
            this.show({
                kind: "choose",
                actorId: hoh.id,
                title: "Final Eviction",
                text: "You are the final Head of Household. Who will you evict? The one you keep sits next to you in the final 2.",
                options: others,
                count: 1,
                promisedIds: final2Partners(this.ledger, hoh.id),
                confirmLabel: "Evict",
                resolve: (ids) => finish(ids[0]),
            })
        );
    }

    // The finale: first the jury roundtable (player jurors argue for a finalist, bot jurors make their cases
    // and sway each other), then the votes. Bot jurors vote on feelings, grudges and respect for the game.
    protected jury(): void {
        const s = this.state;
        const gs = s.gameState;
        const jurorIds = this.jurorIds();
        const finalists = nonEvictedHouseguests(gs);
        const finalistIds = finalists.map((f) => f.id);
        const playerJurors = this.players.filter((p) => p.isJury && p.isEvicted && this.isHuman(p));
        const botJurors = jurorIds.filter((id) => !this.isHuman({ id }));
        const types: { [id: number]: JurorType } = {};
        jurorIds.forEach((id) => (types[id] = this.jurorTypeOf(id)));
        if (!s.week.finaleIntro) {
            s.week.finaleIntro = true;
            this.announce("Finale Night", finaleIntro(finalists, jurorIds.length));
            // the montage: each finalist's best moments, before the jury has its say
            finalists.forEach((f) => this.announce(`🎞️ ${f.name}'s journey`, montageLines(gs, s.history, s.moves || [], f.id)));
            this.save();
            return this.run();
        }
        if (!s.week.roundtable) {
            this.collectVotes(
                "roundtable",
                playerJurors,
                (juror, record) => ({
                    kind: "choose",
                    actorId: juror.id,
                    title: "Jury Roundtable",
                    text: "The jury meets one last time before the vote. Who will you argue for? The other jurors will hear you out, and you'll hear their cases next.",
                    options: finalists,
                    count: 1,
                    noneLabel: "Stay quiet",
                    confirmLabel: "Argue for them",
                    resolve: (ids) => record(ids.length > 0 ? ids[0] : -1),
                }),
                (args) => {
                    this.reseed("roundtable");
                    const lines = roundtable(
                        gs,
                        s.history,
                        this.juryBook,
                        jurorIds,
                        finalistIds,
                        types,
                        Object.keys(args)
                            .map(Number)
                            .filter((id) => args[id] >= 0)
                            .map((id) => ({ byId: id, forId: args[id] })),
                        botJurors
                    );
                    s.week.roundtable = lines;
                    const scene = new Scene({
                        title: "Jury Roundtable",
                        gameState: gs,
                        content: (
                            <div style={{ textAlign: "center" }}>
                                <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🧑‍⚖️ The jury roundtable</h3>
                                {lines.map((line, i) => (
                                    <p key={i}>{line}</p>
                                ))}
                                <NextEpisodeButton />
                            </div>
                        ),
                    });
                    this.weekScenes.push(scene);
                    this.save();
                    this.show({ kind: "scene", scene });
                },
                () => -1 // a juror a bot took over from stays quiet
            );
            return;
        }
        this.collectVotes(
            "juryVote",
            playerJurors,
            (juror, record) => ({
                kind: "choose",
                actorId: juror.id,
                title: "Jury Vote",
                text: "You are on the jury. Your vote is secret. Vote for the houseguest you want to WIN The Houseguests.",
                options: finalists,
                count: 1,
                confirmLabel: "Vote to win",
                resolve: (ids) => record(ids[0]),
            }),
            (votes) => {
                const all: { [jurorId: number]: number } = { ...votes };
                const reasons: { [jurorId: number]: string } = {};
                botJurors.forEach((j) => {
                    const v = botJuryVote(gs, s.history, this.juryBook, j, finalistIds, types[j], jurorIds);
                    all[j] = v.vote;
                    reasons[j] = v.reason;
                });
                // a finalist who broke the rules is disqualified: every vote goes to the other one
                const clean = finalistIds.filter((f) => !this.isRuleBreaker(f));
                if (clean.length === 1)
                    jurorIds.forEach((j) => {
                        all[j] = clean[0];
                        reasons[j] = "The other finalist broke the rules.";
                    });
                this.juryBook.reasons = reasons;
                this.juryBook.finalVotes = all;
                // finale night: the votes are read one at a time
                const order = shuffled(seededRand(hashcode(`${s.seed}:reveal`)), jurorIds).map((j) => ({ jurorId: j, finalistId: all[j] }));
                this.show({
                    kind: "juryReveal",
                    votes: order,
                    onDone: () => {
                        const [newGs, scene] = juryVoteScene(gs, all, true);
                        s.gameState = new GameState(newGs);
                        this.weekScenes.push(scene);
                        this.pushEpisode(BigBrotherFinale, "Finale");
                        s.step = Step.GameOver;
                        this.save();
                        this.run();
                    },
                });
            },
            (juror) => botJuryVote(gs, s.history, this.juryBook, juror.id, finalistIds, types[juror.id], jurorIds).vote
        );
    }

    // Final-two speeches (each finalist chooses which moves to own up to), then the jury's questions.
    protected finalTwo() {
        const s = this.state;
        const gs = s.gameState;
        const finalists = nonEvictedHouseguests(gs);
        const jurorIds = this.jurorIds();
        const botJurors = jurorIds.filter((id) => !this.isHuman({ id }));
        const types: { [id: number]: JurorType } = {};
        jurorIds.forEach((id) => (types[id] = this.jurorTypeOf(id)));
        if (!s.week.finalTwo) {
            this.reseed("finalTwo");
            s.week.finalTwo = {
                spoke: [],
                questions: juryQuestions(gs, this.juryBook, finalists.map((f) => f.id), botJurors),
                qIndex: 0,
                transcript: [],
            };
            this.save();
        }
        const ft = s.week.finalTwo;
        const speaker = finalists.find((f) => !ft.spoke.includes(f.id));
        if (speaker) {
            const moves = movesFor(gs, s.history, this.juryBook, speaker.id, jurorIds);
            const deliver = (ids: string[]) => {
                ft.transcript.push(...giveSpeech(gs, this.juryBook, speaker.id, moves, ids, types, jurorIds));
                ft.spoke.push(speaker.id);
                this.save();
                this.run();
            };
            if (!this.isHuman(speaker)) {
                this.reseed(`speech:${speaker.id}`);
                return deliver(botOwns(this.personalities[speaker.id], moves));
            }
            return this.openly(speaker.id, `${speaker.name}'s final two speech`, () =>
                this.show({ kind: "ownMoves", actorId: speaker.id, moves, onDone: deliver })
            );
        }
        if (ft.qIndex < ft.questions.length) {
            const q = ft.questions[ft.qIndex];
            const finalist = this.player(q.finalistId);
            const respond = (a: Answer) => {
                this.reseed(`answer:${ft.qIndex}`);
                ft.transcript.push(answerJuror(gs, this.juryBook, q, a, types[q.jurorId]));
                ft.qIndex++;
                this.save();
                this.run();
            };
            if (!this.isHuman(finalist)) {
                this.reseed(`botanswer:${ft.qIndex}`);
                return respond(botAnswer(this.personalities[finalist.id]));
            }
            return this.openly(finalist.id, `${finalist.name}, a question from the jury`, () =>
                this.show({ kind: "juryQuestion", actorId: finalist.id, jurorId: q.jurorId, question: q, onAnswer: respond })
            );
        }
        const scene = new Scene({
            title: "Final Two",
            gameState: gs,
            content: (
                <div style={{ textAlign: "center" }}>
                    <h3 style={{ fontWeight: 700, fontSize: "1.3rem" }}>🎤 Final two speeches and jury questions</h3>
                    {ft.transcript.map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                    <NextEpisodeButton />
                </div>
            ),
        });
        this.showScene(scene, Step.Jury);
    }

    // Season stats, awards, and the secret powers (finally revealed).
    protected seasonRecap(): JSX.Element {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const winnerId = log ? log.winner : undefined;
        const stats = seasonStats(gs, s.history, winnerId);
        const awards = seasonAwards(gs, s.history, s.moves || [], s.ledger, winnerId);
        const name = (id: number) => this.player(id).name;
        const powers = this.powers.slots.map((sl) => {
            const info = POWERS[sl.id];
            if (sl.id === "secretHoh") {
                const week = s.history.find((w) => w.week === sl.week);
                return `${info.emoji} ${info.name}: week ${sl.week}${week && week.hohId !== undefined ? `, and it was ${name(week.hohId)}` : ""}.`;
            }
            if (sl.id === "audience") return `${info.emoji} ${info.name}: the audience handed out the powers, and named a nominee in week ${sl.week}.`;
            if (sl.id === "battleBack")
                return sl.used && sl.holderId !== undefined
                    ? `${info.emoji} ${info.name}: ${name(sl.holderId)} won it and came back into the house in week ${sl.week}.`
                    : `${info.emoji} ${info.name}: it never happened.`;
            if (sl.holderId === undefined) return `${info.emoji} ${info.name}: never handed out.`;
            return `${info.emoji} ${info.name}: given to ${name(sl.holderId)} in week ${sl.week}${sl.used ? ", and used" : ", never used"}.`;
        });
        return (
            <div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🏅 Season awards</h3>
                <div className="bbb-awards">
                    {awards.map((a) => (
                        <div key={a.title} className="bbb-award">
                            <span className="bbb-award-emoji">{a.emoji}</span>
                            <div>
                                <b>{a.title}</b>: {name(a.winnerId)}
                                <br />
                                <small>{a.reason}</small>
                            </div>
                        </div>
                    ))}
                </div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>📊 Season stats</h3>
                <div style={{ overflowX: "auto" }}>
                    <table className="bbb-stats">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Houseguest</th>
                                <th title={HOH}>👑</th>
                                <th title="Veto">🏅</th>
                                <th title="Block Breaker">🎬</th>
                                <th title="Times on the block">🎯</th>
                                <th title="Survived the block">🧗</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.map((r) => (
                                <tr key={r.id} className={this.isHuman({ id: r.id }) ? "is-player" : ""}>
                                    <td>{r.placement}</td>
                                    <td>{r.name}</td>
                                    <td>{r.hohWins}</td>
                                    <td>{r.vetoWins}</td>
                                    <td>{r.lastChanceWins}</td>
                                    <td>{r.nominated}</td>
                                    <td>{r.survived}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {powers.length > 0 && (
                    <>
                        <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🤫 This season's secret powers</h3>
                        {powers.map((line, i) => (
                            <p key={i}>{line}</p>
                        ))}
                    </>
                )}
            </div>
        );
    }

    // The end-of-season reveal of the jury's reasons.
    protected whyTheJuryVoted(): JSX.Element | null {
        const reasons = (this.state.jury && this.state.jury.reasons) || {};
        const ids = Object.keys(reasons).map(Number);
        if (ids.length === 0) return null;
        return (
            <div>
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🧑‍⚖️ Why the jury voted</h3>
                {ids.map((id) => (
                    <p key={id}>
                        <b>{this.player(id).name}</b> ({this.jurorTypeOf(id) === "bitter" ? "voted with their heart" : "judged the game"}){" "}
                        {reasons[id]}.
                    </p>
                ))}
            </div>
        );
    }

    // The season's first houseguest out and its winner go in the halls, exactly as they were.
    protected recordHalls() {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const firstOut = s.history.find((w) => w.evictedIds.length > 0);
        const keep = (hall: Hall, id: number | undefined) => {
            if (id === undefined || !gs.houseguests[id]) return;
            const hg = gs.houseguests[id];
            const profile: PlayerProfile = { name: hg.name, imageURL: hg.imageURL, social: hg.social, comp: hg.comp };
            if (!this.isHuman(hg)) {
                profile.personality = this.personalities[id];
                profile.throws = this.throwScore(id);
            }
            recordHall(hall, { key: `${s.seed}:${id}`, when: Date.now(), castSize: gs.houseguests.length, profile });
        };
        keep("losers", firstOut ? firstOut.evictedIds[0] : undefined);
        keep("winners", log ? log.winner : undefined);
        // the All-Stars: the final four, and whoever sent each player on this device home
        const rows = seasonStats(gs, s.history, log ? log.winner : undefined);
        const me = this.devicePlayers()[0];
        const nemeses = this.devicePlayers()
            .map((id) => s.history.find((w) => w.evictedIds.includes(id)))
            .map((w) => (w ? w.hohId : undefined))
            .filter((id): id is number => id !== undefined);
        const stars = Array.from(new Set([...rows.filter((r) => r.placement <= 4).map((r) => r.id), ...nemeses]));
        stars.forEach((id) => {
            const hg = gs.houseguests[id];
            const row = rows.find((r) => r.id === id);
            if (!hg || !row) return;
            const castSize = gs.houseguests.length;
            const past: PastSeason = {
                placement: row.placement,
                castSize,
                won: row.placement === 1,
                comps: row.hohWins + row.vetoWins + row.lastChanceWins,
                story: pastStory(row.placement, castSize),
            };
            if (!this.isHuman(hg) && me !== undefined && me !== id) {
                const grudge = this.state.jury ? grudgeOf(this.juryBook, id, me) : { amount: 0, reasons: [] };
                const feeling = Math.max(-1, Math.min(1, (hg.relationships[me] ?? 0) + grudge.amount));
                const sentHome = nemeses.includes(id);
                past.withPlayer = {
                    name: this.player(me).name,
                    feeling,
                    why: sentHome
                        ? "they sent you home last time"
                        : grudge.reasons.length > 0
                        ? `last time, you ${grudge.reasons[0]}`
                        : feeling > 0.3
                        ? "you were close last time"
                        : feeling < -0.3
                        ? "you never got along last time"
                        : "you shared a house last time",
                };
            }
            const profile: PlayerProfile = { name: hg.name, imageURL: hg.imageURL, social: hg.social, comp: hg.comp, past };
            if (!this.isHuman(hg)) {
                profile.personality = this.personalities[id];
                profile.throws = this.throwScore(id);
            }
            recordHall("stars", { key: `${s.seed}:${id}`, when: Date.now(), castSize, profile });
        });
    }

    // The players on this device.
    public devicePlayers(): number[] {
        if (this.net) return this.net.localIds ? this.net.localIds() : [];
        return this.state.humanIds;
    }

    // The season as a story anyone can watch back from a link (see seasonShare.ts): who won what, who went up, the
    // votes, the jury. Everything in it was shown on screen by the end of the season.
    public sharedSeason(): SharedSeason {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const winner = log ? log.winner : undefined;
        const rows = seasonStats(gs, s.history, winner);
        const finalVotes = (this.juryBook && this.juryBook.finalVotes) || {};
        const finalists = nonEvictedHouseguests(gs).map((hg) => hg.id);
        return {
            cast: gs.houseguests.map((hg) => ({ name: hg.name, imageURL: hg.imageURL })),
            weeks: s.history.map((w) => ({
                hoh: w.hohId,
                noms: w.nomineeIds,
                pov: w.povId,
                breaker: w.blockbusterId,
                evicted: w.evictedIds,
                votes: w.votes ? w.nomineeIds.map((id) => w.votes![id] ?? 0) : [],
            })),
            placements: gs.houseguests.map((hg) => (rows.find((r) => r.id === hg.id) || { placement: gs.houseguests.length }).placement),
            winner,
            runnerUp: finalists.find((id) => id !== winner),
            jury: Object.keys(finalVotes).map((j) => [Number(j), finalVotes[Number(j)]] as [number, number]),
            players: [...s.humanIds],
            difficulty: difficultyLabel(this.difficulty),
        };
    }

    // A player's season, for their career stats and achievements.
    public summaryFor(id: number): SeasonSummary {
        const s = this.state;
        const gs = s.gameState;
        const log = gs.log[gs.phase] && gs.log[gs.phase][0];
        const winnerId = log ? log.winner : undefined;
        const row = seasonStats(gs, s.history, winnerId).find((r) => r.id === id)!;
        const finalVotes = (this.juryBook && this.juryBook.finalVotes) || {};
        const juryTotal = Object.keys(finalVotes).length;
        const finalist = !this.player(id).isEvicted;
        const pledges = this.ledger.pledges.filter((p) => p.fromId === id);
        const moves = (s.moves || []).filter((m) => m.actorId === id);
        const best = [...moves].filter((m) => m.kind === "move").sort((a, b) => b.weight - a.weight)[0];
        const hg = this.player(id);
        return {
            key: `${s.seed}:${id}`,
            when: Date.now(),
            name: hg.name,
            imageURL: hg.imageURL,
            placement: row.placement,
            castSize: gs.houseguests.length,
            won: winnerId === id,
            hohWins: row.hohWins,
            vetoWins: row.vetoWins,
            lastChanceWins: row.lastChanceWins,
            nominated: row.nominated,
            survivedBlock: row.survived,
            juryVotesFor: finalist ? Object.values(finalVotes).filter((v) => v === id).length : 0,
            juryVotesTotal: finalist ? juryTotal : 0,
            backstabs: moves.filter((m) => m.kind === "backstab").length,
            bigMoves: moves.filter((m) => m.kind === "move").length,
            brokePromises: pledges.filter((p) => p.status === "broken").length,
            keptPromises: pledges.filter((p) => p.status === "kept").length,
            alliances: s.book.alliances.filter((a) => a.memberIds.includes(id)).length,
            showmance: (s.showmances || []).some((m) => m.a === id || m.b === id) || (s.feed || []).some((f) => /showmance/i.test(f.text) && f.text.includes(hg.name)),
            cameBack: this.powers.slots.some((sl) => sl.id === "battleBack" && sl.used && sl.holderId === id),
            difficulty: this.difficulty,
            online: !!this.net,
            players: s.humanIds.length,
            highlight: best ? best.text : undefined,
            jurySize: gs.finalJurySize(),
        };
    }

    protected gameOver() {
        const gs = this.state.gameState;
        const weekLabel = (week: number) => dayLabel(gs, week, DAY_PART.eviction);
        const table = generateVotingTable(gs, weekLabel);
        const content = this.state.statsHidden ? (
            <div>
                {table}
                <h3 style={{ fontWeight: 800, fontSize: "1.2rem", margin: "16px 0 6px" }}>🎲 The hidden skills</h3>
                <div className="bbb-skills-reveal">
                    {[...gs.houseguests]
                        .sort((a, b) => getSocial(b) + getComp(b) - (getSocial(a) + getComp(a)))
                        .map((hg) => (
                            <div key={hg.id}>
                                <img src={hg.imageURL} alt="" />
                                <b>{hg.name}</b>
                                <span>
                                    🗣️ {getSocial(hg)} · 🏆 {getComp(hg)}
                                    {!this.state.humanIds.includes(hg.id) && ` · 🏳️ ${this.throwScore(hg.id)}`}
                                </span>
                            </div>
                        ))}
                </div>
            </div>
        ) : (
            table
        );
        countOnce(String(this.state.seed), "end", counterName("end", this.watching ? "watch" : this.net ? "online" : "played"));
        this.recordHalls();
        // the players on this device: their season goes in their career, and may unlock achievements
        const cards = this.devicePlayers()
            .filter((id) => !this.isRuleBreaker(id))
            .map((id) => {
                const summary = this.summaryFor(id);
                return { summary, unlocked: recordSeason(summary) };
            });
        const shared = this.sharedSeason();
        // the daily season: the day's result, the first time it's finished
        const dailyCard = this.state.daily && !this.net ? cards[0] : undefined;
        if (dailyCard) {
            const m = dailyCard.summary;
            recordDaily({
                key: this.state.daily!,
                when: Date.now(),
                name: m.name,
                placement: m.placement,
                castSize: m.castSize,
                won: m.won,
                hohWins: m.hohWins,
                vetoWins: m.vetoWins,
                juryVotesFor: m.juryVotesFor,
                juryVotesTotal: m.juryVotesTotal,
                weeks: m.castSize - m.placement,
            });
            countOnce(String(this.state.seed), "daily:end", counterName("daily:place", m.placement));
        }
        if (cards.some((c) => c.unlocked.length > 0)) setTimeout(() => playCue("achievement"), 2200);
        newEpisode(generateGameOver(new GameState(new MutableGameState(gs)), weekLabel));
        if (this.net) this.net.ended();
        else clearSave(this.state.seed);
        playerModeScreen$.next(null);
        this.show({
            kind: "gameOver",
            content: (
                <div>
                    {dailyCard && <DailyCard />}
                    {!this.watching && <ShareSeasonLink season={shared} />}
                    {cards.length > 0 && (
                        <div className="bbb-season-cards">
                            {cards.map((c) => (
                                <SeasonCard key={c.summary.key} summary={c.summary} unlocked={c.unlocked} />
                            ))}
                        </div>
                    )}
                    {content}
                    {this.seasonRecap()}
                    {this.whoTheyWere()}
                    {this.whyTheJuryVoted()}
                    <WhyTheyDidIt gs={this.state.gameState} history={this.state.history} />
                    <DiaryRoom entries={this.diaryOf()} houseguest={(id) => this.player(id)} recap={this.seasonRecapText()} />
                </div>
            ),
        });
    }
}

let activeController: PlayerModeController | null = null;

export function getActiveController() {
    return activeController;
}

export function activatePlayerMode(controller: PlayerModeController, screen: () => JSX.Element) {
    activeController = controller;
    selectedPlayer$.next(null);
    secretRelationships$.next(true);
    playerModeScreen$.next(screen);
    pushToMainContentStream(screen(), Screens.Ingame);
    controller.start();
}

export function newPlayerSave(
    gameState: GameState,
    humanIds: number[],
    castOptions?: CastOptionsOverride,
    statsHidden?: boolean,
    extras: {
        difficulty?: Difficulty;
        powers?: PowerId[] | "surprise";
        battleBack?: boolean;
        rules?: SeasonRules;
        guided?: boolean;
        seed?: number; // the daily season: everyone's season comes from the same seed
        daily?: string;
    } = {}
): PlayerSave {
    const seed = extras.seed !== undefined ? extras.seed : Date.now() % 1000000007;
    const rand = seededRand(hashcode(`${seed}:powers`));
    const chosen = extras.powers === "surprise" ? surprisePowers(rand) : (extras.powers || []).filter((p) => ALL_POWERS.includes(p));
    if (extras.battleBack && !chosen.includes("battleBack")) chosen.push("battleBack");
    const powers = schedulePowers(chosen, totalWeeks(gameState), rand);
    const social: { [id: number]: SocialMemory } = {};
    humanIds.forEach((id) => (social[id] = { chatsThisWeek: {} }));
    return {
        version: 3,
        humanIds,
        seed,
        step: Step.WeekStart,
        gameState,
        weekStartState: gameState,
        week: {},
        history: [],
        usedComps: [],
        social,
        socialTurn: 0,
        socialStage: "social",
        actionsLeft: withDefaults(extras.rules).actions,
        socialLog: [],
        book: emptyBook(),
        approaches: {},
        approachKey: {},
        news: {},
        castOptions,
        statsHidden,
        difficulty: extras.difficulty || "normal",
        rules: extras.rules ? withDefaults(extras.rules) : undefined,
        powers,
        guided: extras.guided || undefined,
        ...(extras.daily ? { daily: extras.daily } : {}),
    };
}
