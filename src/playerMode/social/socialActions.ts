import { getById, getSocial, Houseguest, MutableGameState, nonEvictedHouseguests } from "../../model";
import { rng } from "../../utils";

// Social actions change relationships, which drive every bot decision (votes, nominations, jury).
// Relationships in this game are mutual, so every change is applied in both directions.

export const ACTIONS_PER_BLOCK = 3;

export type SocialAction =
    | { kind: "chat"; botId: number }
    | { kind: "alliance"; botId: number }
    | { kind: "pitch"; botId: number; targetId: number };

export interface SocialOutcome {
    text: string;
    good: boolean;
}

export interface SocialMemory {
    chatsThisWeek: { [botId: number]: number };
    allies: number[];
}

function rand(): number {
    return Math.abs(rng().randomFloat());
}

function clamp(n: number): number {
    return Math.max(-1, Math.min(1, n));
}

export function setRelationship(gs: MutableGameState, a: number, b: number, value: number) {
    const v = clamp(value);
    getById(gs, a).relationships[b] = v;
    getById(gs, b).relationships[a] = v;
}

export function shiftRelationship(gs: MutableGameState, a: number, b: number, delta: number) {
    setRelationship(gs, a, b, getById(gs, a).relationships[b] + delta);
}

// 0.6 (social 1) to 1.5 (social 10)
export function socialFactor(hg: Houseguest): number {
    return 0.5 + getSocial(hg) / 10;
}

export function performSocialAction(
    gs: MutableGameState,
    humanId: number,
    action: SocialAction,
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
        if (memory.allies.includes(bot.id)) {
            return { text: `${bot.name} is already in your alliance.`, good: true };
        }
        const pAccept = Math.max(0.05, Math.min(0.95, (trust + 0.3) * sf));
        if (rand() < pAccept) {
            memory.allies.push(bot.id);
            shiftRelationship(gs, humanId, bot.id, 0.2);
            // your allies warm up to each other too
            memory.allies.forEach((ally) => ally !== bot.id && shiftRelationship(gs, ally, bot.id, 0.1));
            return { text: `${bot.name} agreed to an alliance with you!`, good: true };
        }
        shiftRelationship(gs, humanId, bot.id, -0.05);
        return { text: `${bot.name} isn't ready to commit to an alliance with you.`, good: false };
    }

    // pitch a target: try to turn the bot against someone else
    const target = getById(gs, action.targetId);
    const botLikesTarget = bot.relationships[target.id];
    const pConvince = Math.max(0.05, Math.min(0.95, (0.35 + trust * 0.5) * sf - Math.max(0, botLikesTarget) * 0.4));
    if (rand() < pConvince) {
        shiftRelationship(gs, bot.id, target.id, -0.15 * sf);
        return { text: `${bot.name} is starting to see ${target.name} as a threat.`, good: true };
    }
    if (botLikesTarget > 0.4) {
        shiftRelationship(gs, humanId, bot.id, -0.1);
        shiftRelationship(gs, humanId, target.id, -0.05); // word gets around
        return {
            text: `${bot.name} is close with ${target.name} and didn't like you talking about them.`,
            good: false,
        };
    }
    return { text: `${bot.name} didn't seem convinced about ${target.name}.`, good: false };
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
export function botSocialTime(gs: MutableGameState, humanIds: number[]): void {
    const everyone = nonEvictedHouseguests(gs);
    const bots = everyone.filter((hg) => !humanIds.includes(hg.id));
    bots.forEach((bot) => {
        const social = getSocial(bot); // 1-10
        const sf = socialFactor(bot);
        // chats: 0-2 per block, more for social bots
        const chats = (rand() < social / 12 ? 1 : 0) + (rand() < social / 25 ? 1 : 0);
        for (let k = 0; k < chats; k++) {
            const others = everyone.filter((hg) => hg.id !== bot.id);
            if (others.length === 0) break;
            const other = others[rng().randomInt(0, others.length - 1)];
            shiftRelationship(gs, bot.id, other.id, 0.03 * sf * (0.5 + rand()));
        }
        // scheming: try to turn a friend against this bot's top target
        if (rand() < social / 20 && bot.hitList.length > 0) {
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
