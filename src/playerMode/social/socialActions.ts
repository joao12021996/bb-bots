import { getById, getSocial, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";
import { setRelationship, shiftRelationship, socialFactor } from "./relationships";
import { alliesOf, AllianceBook, randomAllianceName } from "./alliances";
import { bestReason, convincedText, PitchReason, reasonBonus, reasonFit, unconvincedText } from "./pitch";

export { setRelationship, shiftRelationship, socialFactor };

// Social actions change relationships, which drive every bot decision (votes, nominations, jury).

export const ACTIONS_PER_BLOCK = 3;

// Alliance proposals are handled by the controller (see alliances.ts); chat and pitches are handled here.
// Deals, campaigning and claims: handled by the controller (see campaign.ts).
export type DealAction =
    | { kind: "final2"; botId: number } // "you and me, final two"
    | { kind: "voteDeal"; botId: number } // a nominee: "vote to keep me, and you're safe if I win HoH"
    | { kind: "pity"; botId: number } // a nominee's pity pitch
    | { kind: "tellVote"; botId: number; targetId: number } // "I'm voting to evict X" (true or not)
    | { kind: "tellTarget"; botId: number; targetId: number } // the HoH: "the target is X" (true or not)
    | { kind: "flirt"; botId: number } // maybe the start of a showmance
    | { kind: "confront"; botId: number } // a blow-up: the house picks sides
    | { kind: "meeting"; botId: number } // a house meeting to call someone out (two actions, once a week)
    | { kind: "snoop" } // eavesdrop on an alliance meeting
    | { kind: "rumour"; botId: number; targetId: number; rumour: "coming" | "secretAlliance" | "trashTalk" };

export const DEAL_KINDS = ["final2", "voteDeal", "pity", "tellVote", "tellTarget", "flirt", "confront", "meeting", "snoop", "rumour"];

export function isDealAction(action: SocialAction): action is DealAction {
    return DEAL_KINDS.includes(action.kind);
}

export type SocialAction = BasicSocialAction | DealAction;

export type BasicSocialAction =
    | { kind: "chat"; botId: number }
    | { kind: "alliance"; botId: number; allianceId?: number; name?: string }
    | { kind: "pitch"; botId: number; targetId: number; reason?: PitchReason };

export interface SocialOutcome {
    text: string;
    good: boolean;
}

export interface SocialMemory {
    chatsThisWeek: { [botId: number]: number };
}

// Something another houseguest came to talk to a player about.
export type Approach =
    | { kind: "chat"; fromId: number; text: string } // already happened
    | { kind: "pitch"; fromId: number; targetId: number; reason?: PitchReason } // "we should go after X": agree or not
    | { kind: "invite"; fromId: number; allianceId?: number; name: string } // join an alliance (or start one)
    | { kind: "final2"; fromId: number } // "you and me, final two"
    | { kind: "votePlea"; fromId: number } // a nominee: "keep me, and you're safe if I win HoH"
    | { kind: "sides"; fromId: number; otherId: number }; // a blow-up between two houseguests: pick a side

function rand(): number {
    return Math.abs(rng().randomFloat());
}

export function performSocialAction(
    gs: MutableGameState,
    humanId: number,
    action: BasicSocialAction,
    memory: SocialMemory
): SocialOutcome {
    const human = getById(gs, humanId);
    const bot = getById(gs, action.botId);
    const sf = socialFactor(human);
    const trust = human.relationships[bot.id];

    if (action.kind === "chat") {
        const chats = memory.chatsThisWeek[bot.id] || 0;
        memory.chatsThisWeek[bot.id] = chats + 1;
        const delta = (0.08 * sf * (0.5 + rand())) / (1 + chats);
        shiftRelationship(gs, humanId, bot.id, delta);
        if (chats >= 2) {
            return { text: `${bot.name} is starting to get tired of talking to you.`, good: delta > 0.02 };
        }
        return {
            text: delta > 0.08 ? `You and ${bot.name} really hit it off!` : `You had a nice chat with ${bot.name}.`,
            good: true,
        };
    }

    if (action.kind === "alliance") {
        throw new Error("Alliance proposals are handled by proposeAlliance.");
    }

    // pitch a target: try to turn the bot against someone else
    const target = getById(gs, action.targetId);
    const botLikesTarget = bot.relationships[target.id];
    // the reason given has to ring true to the bot
    const bonus = reasonBonus(bot, target, human, action.reason);
    const pConvince = Math.max(
        0.05,
        Math.min(0.95, (0.35 + trust * 0.5 + bonus) * sf - Math.max(0, botLikesTarget) * 0.4)
    );
    if (rand() < pConvince) {
        shiftRelationship(gs, bot.id, target.id, -0.15 * sf);
        return { text: convincedText(action.reason, bot.name, target.name), good: true };
    }
    if (botLikesTarget > 0.4) {
        shiftRelationship(gs, humanId, bot.id, -0.1);
        shiftRelationship(gs, humanId, target.id, -0.05); // word gets around
        return {
            text: `${bot.name} is close with ${target.name} and didn't like you talking about them.`,
            good: false,
        };
    }
    const fit = action.reason ? reasonFit(bot, target, human, action.reason) : 0;
    return { text: unconvincedText(action.reason, fit, bot.name, target.name), good: false };
}

// The rest of the house socializes too: small random changes between bots.
export function houseDrift(gs: MutableGameState, humanIds: number[]) {
    const bots = nonEvictedHouseguests(gs).filter((hg) => !humanIds.includes(hg.id));
    const pairs = Math.max(1, Math.floor(bots.length / 2));
    for (let k = 0; k < pairs && bots.length > 1; k++) {
        const a = bots[rng().randomInt(0, bots.length - 1)];
        const b = bots[rng().randomInt(0, bots.length - 1)];
        if (a.id === b.id) continue;
        shiftRelationship(gs, a.id, b.id, (rand() * 2 - 1) * 0.06);
    }
}

// Coarse labels for how a bot feels about the human, shown in the UI.
export function feelingLabel(relationship: number): { label: string; emoji: string } {
    if (relationship > 0.6) return { label: "Close friend", emoji: "💚" };
    if (relationship > 0.25) return { label: "Friendly", emoji: "🙂" };
    if (relationship > -0.25) return { label: "Neutral", emoji: "😐" };
    if (relationship > -0.6) return { label: "Wary", emoji: "😒" };
    return { label: "Enemy", emoji: "😠" };
}

// Bots socialize too, and their Social score decides how much: high-social bots talk to more people
// (raising those relationships) and work harder to turn their friends against their targets.
// `traits` (player mode): how much more or less than usual each bot chats and schemes (its personality).
export function botSocialTime(
    gs: MutableGameState,
    humanIds: number[],
    traits?: (id: number) => { chats: number; scheming: number }
): void {
    const everyone = nonEvictedHouseguests(gs);
    const bots = everyone.filter((hg) => !humanIds.includes(hg.id));
    bots.forEach((bot) => {
        const social = getSocial(bot); // 1-10
        const sf = socialFactor(bot);
        // chats: 0-2 per block, more for social bots
        const t = traits ? traits(bot.id) : { chats: 1, scheming: 1 };
        const chats = (rand() < (social / 12) * t.chats ? 1 : 0) + (rand() < (social / 25) * t.chats ? 1 : 0);
        for (let k = 0; k < chats; k++) {
            const others = everyone.filter((hg) => hg.id !== bot.id);
            if (others.length === 0) break;
            const other = others[rng().randomInt(0, others.length - 1)];
            shiftRelationship(gs, bot.id, other.id, 0.03 * sf * (0.5 + rand()));
        }
        // scheming: try to turn a friend against this bot's top target
        if (rand() < (social / 20) * t.scheming && bot.hitList.length > 0) {
            const target = bot.hitList[0].id;
            const friends = everyone
                .filter((hg) => hg.id !== bot.id && hg.id !== target && !humanIds.includes(hg.id))
                .sort((a, b) => bot.relationships[b.id] - bot.relationships[a.id]);
            const friend = friends[0];
            if (friend && getById(gs, target) && !getById(gs, target).isEvicted) {
                shiftRelationship(gs, friend.id, target, -0.05 * sf);
            }
        }
    });
    houseDrift(gs, humanIds);
}

const CHAT_LINES = [
    "came by to chat about life back home.",
    "pulled you aside to say they've got your back.",
    "brought you a snack and hung out for a while.",
    "wanted to vent about the house, and you listened.",
    "spent the afternoon by the pool with you.",
];

// Bots come to the players: friendly ones chat, schemers pitch targets, and some ask the player to join (or
// start) an alliance. Chats take effect right away; pitches and invitations wait for the player's answer.
export function botApproaches(gs: MutableGameState, book: AllianceBook, humanId: number, humanIds: number[]): Approach[] {
    const allies = alliesOf(book, humanId);
    const out: Approach[] = [];
    const bots = nonEvictedHouseguests(gs).filter((hg) => !humanIds.includes(hg.id));
    bots.forEach((bot) => {
        if (out.length >= 3) return;
        const rel = bot.relationships[humanId];
        const pApproach = 0.04 + 0.025 * getSocial(bot) + 0.3 * Math.max(0, rel);
        if (rand() > pApproach) return;
        if (rel > 0.3 && !allies.has(bot.id) && rand() < 0.3 && nonEvictedHouseguests(gs).length > 4) {
            out.push({ kind: "invite", fromId: bot.id, name: randomAllianceName(book) });
            return;
        }
        const target = bot.hitList.find((e) => e.id !== humanId && e.id !== bot.id && !getById(gs, e.id).isEvicted);
        if (target && rand() < 0.45) {
            out.push({
                kind: "pitch",
                fromId: bot.id,
                targetId: target.id,
                reason: bestReason(getById(gs, humanId), getById(gs, target.id), bot),
            });
            return;
        }
        shiftRelationship(gs, humanId, bot.id, 0.03 * socialFactor(bot) * (0.5 + rand()));
        out.push({ kind: "chat", fromId: bot.id, text: `${bot.name} ${CHAT_LINES[rng().randomInt(0, CHAT_LINES.length - 1)]}` });
    });
    return out;
}

// A player answers a bot's pitch. Agreeing builds trust with the bot and sours the player on the target.
export function answerPitch(gs: MutableGameState, humanId: number, fromId: number, targetId: number, agree: boolean): SocialOutcome {
    const from = getById(gs, fromId);
    const target = getById(gs, targetId);
    if (agree) {
        shiftRelationship(gs, humanId, fromId, 0.06);
        shiftRelationship(gs, humanId, targetId, -0.05);
        return { text: `You told ${from.name} you're on board with going after ${target.name}.`, good: true };
    }
    shiftRelationship(gs, humanId, fromId, -0.03);
    return { text: `You told ${from.name} you're not sold on going after ${target.name}.`, good: false };
}
