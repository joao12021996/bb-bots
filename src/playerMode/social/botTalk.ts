import { hash01, PersonalityId } from "./personality";
import { PitchReason } from "./pitch";

// Talking to bots in your own words. There's no AI here: a message is matched against what houseguests
// usually talk about (targets, votes, deals, small talk), the game decides how the bot reacts (the same
// rules as the social buttons), and the bot answers in its own voice. Free and offline, and it gives the
// same answer on every device, so it works online too.

export const TALK_MAX_LENGTH = 300;
export const TALKS_PER_BLOCK = 12; // messages per houseguest per social block, before they have to go

export type TalkIntent =
    | { kind: "askTarget" }
    | { kind: "askVote" }
    | { kind: "askFeeling" }
    | { kind: "askOpinion"; aboutId: number }
    | { kind: "askAllies" }
    | { kind: "final2" }
    | { kind: "alliance"; name?: string }
    | { kind: "pitch"; targetId: number; reason?: PitchReason }
    | { kind: "tellVote"; targetId: number }
    | { kind: "tellTarget"; targetId: number }
    | { kind: "keepMe"; pity: boolean }
    | { kind: "flirt" }
    | { kind: "insult" }
    | { kind: "compliment" }
    | { kind: "thanks" }
    | { kind: "apology" }
    | { kind: "bye" }
    | { kind: "howAreYou" }
    | { kind: "greet" }
    | { kind: "small"; topic?: "comps" | "home" | "food" | "game" }
    | { kind: "unknown"; question: boolean };

export interface TalkLine {
    who: "me" | "bot" | "note"; // you, the houseguest, or what happened (a deal, a pitch...)
    text: string;
    day: number;
}

function escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[‘’`]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

// Which of these houseguests the message names, by full or first name, in the order they're mentioned.
export function mentionsIn(text: string, people: { id: number; name: string }[]): number[] {
    const t = normalize(text);
    const found: { id: number; at: number }[] = [];
    people.forEach((p) => {
        const full = p.name.toLowerCase().trim();
        const first = full.split(/\s+/)[0];
        const options = [full, ...(first.length >= 3 && first !== full ? [first] : [])];
        let at = -1;
        options.forEach((o) => {
            const m = new RegExp(`(^|[^a-z0-9])${escape(o)}($|[^a-z0-9])`).exec(t);
            if (m && (at < 0 || m.index < at)) at = m.index;
        });
        if (at >= 0) found.push({ id: p.id, at });
    });
    return found.sort((a, b) => a.at - b.at).map((f) => f.id);
}

function reasonOf(t: string): PitchReason | undefined {
    if (/coming for (you|u)\b|after (you|u)\b|targeting (you|u)\b|wants (you|u) (out|gone)|talking (about|crap about|trash about) (you|u)\b|your name|hates (you|u)\b|throw (you|u)/.test(t))
        return "relationship";
    if (/for me\b|coming for me|after me\b|targeting me|wants me (out|gone)|do (it|this) for me|favou?r|hates me/.test(t)) return "personal";
    if (/\bcomps?\b|competition|wins?\b|winning|beast|strong|athletic|veto|\bpov\b|\bhoh\b|physical/.test(t)) return "comps";
    if (/social|everyone likes|playing (everyone|everybody|the house)|liked|charm|floater|manipulat|fake|two.?faced|snake|running the house/.test(t)) return "social";
    return undefined;
}

// What the message is about. `aboutIds`: other houseguests it names (not you, not the bot you're talking to).
export function readMessage(text: string, aboutIds: number[], ctx: { iAmHoh: boolean }): TalkIntent {
    const t = normalize(text);
    const question = /\?\s*$/.test(t) || /^(who|what|why|how|are|do|does|did|will|would|can|could|is|should|have|which|where)\b/.test(t);
    const about = aboutIds[0];

    if (/\bwho\b.*\b(alliance|allian|working with|close to|closest|aligned|team|loyal to|tight with|trust)\b/.test(t) || /\b(your|ur) (alliance|allies|people|crew)\b/.test(t))
        return { kind: "askAllies" };
    if (/final (two|2)\b|\bf2\b|final duo|to the end together|end (this|it) together|ride or die/.test(t)) return { kind: "final2" };
    if (/\balliance\b|team up|work together|\balign\b|work with me|be a team|partners?\b|each other'?s backs?/.test(t) && about === undefined) {
        const quoted = /["“]([^"”]{1,30})["”]/.exec(text);
        return { kind: "alliance", name: quoted ? quoted[1].trim() : undefined };
    }

    if (about !== undefined) {
        if (/\b(i'?m|i am|i'?ll|i will|gonna|going to|planning to|plan to)\b.{0,12}\bvot/.test(t) || /\bmy vote\b/.test(t)) return { kind: "tellVote", targetId: about };
        if (ctx.iAmHoh && /\b(i'?m|i am|i'?ll|i will|gonna|going to|my)\b.{0,12}\b(nominat|put(ting)? up|target|backdoor|renom)/.test(t))
            return { kind: "tellTarget", targetId: about };
        if (
            /evict|get .{0,20}\bout\b|\btarget|backdoor|nominat|put .{0,15}\bup\b|go(ing)? after|vote .{0,20}\bout\b|send .{0,20}\bhome|threat|(has|have|needs?|got|gotta) to go|gotta go|coming for|after (you|me|us)|dangerous|cut .{0,10}\bloose|get rid of|take .{0,10}\bout\b|can'?t (be )?trust|snake|liar|playing (you|everyone)/.test(
                t
            )
        )
            return { kind: "pitch", targetId: about, reason: reasonOf(t) };
        return { kind: "askOpinion", aboutId: about };
    }

    if (/\bvot(e|es|ing)\b/.test(t) && /\b(who|which|how|what)\b/.test(t) && !/\b(me|my)\b.*\bvote/.test(t)) return { kind: "askVote" };
    if (
        /\bwho\b.{0,30}\b(target|nominat|put(ting)? up|going after|gunning|want (out|gone|evicted)|backdoor|after|coming for|send home|go home|leave|evict)/.test(t) ||
        /\b(your|ur) (target|plan|nominations?|noms)\b/.test(t)
    )
        return { kind: "askTarget" };
    if (/keep me|vote (for me|to keep me|me to stay)|save me|let me stay|need (your|ur) vote|vote with me|keep me here|don'?t vote me/.test(t))
        return { kind: "keepMe", pity: /please|beg|family|deserve|need this|for my|dream|kids|mom|dad/.test(t) };
    if (
        /are we (good|cool|ok|okay|solid|tight)|we good|we cool|do you (trust|like) me|can i trust (you|u)|(mad|angry|upset) (at|with) me|how do you feel about me|where do (we|i) stand|are you with me|(got|have) my back|still friends|we still|what do you think of me|you like me/.test(
            t
        )
    )
        return { kind: "askFeeling" };
    if (/\b(cute|hot|crush|date|kiss|gorgeous|beautiful|handsome|cuddle|showmance|attractive|flirt|sexy|babe|pretty)\b/.test(t)) return { kind: "flirt" };
    if (/hate (you|u)|idiot|stupid|liar|snake|annoying|loser|shut up|\bfake\b|trash|dumb|ugly|clown|f+u+c+k|screw (you|u)|\bweak\b|pathetic|rat\b|useless/.test(t))
        return { kind: "insult" };
    if (/sorry|apolog|my bad|forgive/.test(t)) return { kind: "apology" };
    if (/thank|thx|\bty\b|appreciate/.test(t)) return { kind: "thanks" };
    if (
        /love (you|u)|(you'?re|you are|ur|u r) (great|awesome|amazing|the best|cool|funny|smart|sweet|nice|kind|a legend|my favou?rite)|great job|nice job|well played|good job|proud of (you|u)|you rock|like you\b|good game|congrat/.test(
            t
        )
    )
        return { kind: "compliment" };
    if (/^(bye|see (you|ya|u)|later|gtg|got to go|gotta go|good ?night|night|cya|catch you)\b/.test(t)) return { kind: "bye" };
    if (/how are (you|u)|how'?s it going|how (you|u) doing|how are things|(you|u) (ok|okay|alright)\b|what'?s up|\bsup\b|wyd|how'?s (your|ur) day|how (do|are) (you|u) feel/.test(t))
        return { kind: "howAreYou" };
    if (/^(hi+|hey+|hello|yo|hiya|howdy|good (morning|afternoon|evening)|morning|heya|oi)\b/.test(t)) return { kind: "greet" };
    if (/\bcomps?\b|competition|\bhoh\b|\bveto\b|\bpov\b|challenge|win(ning)?\b/.test(t)) return { kind: "small", topic: "comps" };
    if (/\bhome\b|family|miss|outside|back home|kids|dog|cat|job|work\b/.test(t)) return { kind: "small", topic: "home" };
    if (/food|eat|slop|cook|dinner|lunch|breakfast|hungry|snack/.test(t)) return { kind: "small", topic: "food" };
    if (/\bgame\b|strategy|move|week|block|eviction|house|jury/.test(t)) return { kind: "small", topic: "game" };
    return { kind: "unknown", question };
}

// ---------- the bot's side ----------

export type Reply =
    | "greet"
    | "howFine"
    | "howNominee"
    | "howHoh"
    | "howHaveNot"
    | "small"
    | "smallComps"
    | "smallHome"
    | "smallFood"
    | "smallGame"
    | "compliment"
    | "insult"
    | "thanks"
    | "apology"
    | "bye"
    | "dodge"
    | "listen"
    | "busy"
    | "tired"
    | "targetIs"
    | "targetHoh"
    | "targetSecret"
    | "targetNoone"
    | "voteNoNoms"
    | "voteNominee"
    | "voteHoh"
    | "voteNotYet"
    | "feelClose"
    | "feelFriendly"
    | "feelNeutral"
    | "feelWary"
    | "feelEnemy"
    | "opLove"
    | "opLike"
    | "opMeh"
    | "opDislike"
    | "opHate"
    | "alliesYours"
    | "alliesClose"
    | "alliesSecret"
    | "accept"
    | "decline"
    | "pitchYes"
    | "pitchNo"
    | "heard"
    | "alreadyF2"
    | "alreadyAllied"
    | "notNow"
    | "flirtYes"
    | "flirtNo";

const GENERIC: { [r in Reply]: string[] } = {
    greet: ["Hey! What's up?", "Oh hey, you.", "Hi! Sit, sit."],
    howFine: ["I'm good, just trying to survive another week.", "Can't complain. Well, I can, but I won't.", "Honestly? Doing alright."],
    howNominee: ["I'm on the block. How do you think I'm doing?", "Stressed. Very, very stressed.", "Packing my bag just in case. Not great."],
    howHoh: ["Living in the HoH room, eating the HoH snacks. Pretty good!", "Great, but everybody wants something from me this week."],
    howHaveNot: ["I've eaten nothing but slop for days. Ask me later.", "Cold showers and slop. Living the dream."],
    small: ["Ha, yeah.", "For real.", "Tell me about it.", "I hear you."],
    smallComps: ["The next comp is going to be brutal, I can feel it.", "I need a win soon. Badly.", "Comps are half luck in here, honestly."],
    smallHome: ["I miss home so much. My own bed. Silence.", "Don't make me think about home, I'll cry."],
    smallFood: ["If I see one more bowl of slop...", "Somebody ate my leftovers again, and I have suspects."],
    smallGame: ["This week is crazy. Nobody knows anything.", "The house is so weird right now.", "Everyone's scrambling."],
    compliment: ["Aw, stop. Okay, keep going.", "You're sweet. I like you too.", "Ha, thank you!"],
    insult: ["Wow. Okay.", "Noted. I'll remember that.", "Cool, cool. Good talk."],
    thanks: ["Anytime.", "Of course!", "Don't mention it."],
    apology: ["It's fine. We're fine.", "Okay. Apology accepted. Mostly.", "Thanks for saying that."],
    bye: ["See you around.", "Later!", "Go, go. People are watching anyway."],
    dodge: ["Ha. Nice try.", "I'm not getting into that right now.", "Hmm. Ask me again later."],
    listen: ["Okay...", "Mm-hm.", "Interesting.", "Right."],
    busy: ["Let's talk about that later. People are watching.", "Not now. Find me next time, when it's quiet."],
    tired: ["I have to go, the Diary Room is calling me.", "Okay, I need a nap. Talk later!", "We've been talking forever, people are going to notice."],
    targetIs: ["Honestly? {name}.", "Between us: {name}.", "{name}. Keep that to yourself."],
    targetHoh: ["My target? {name}. That's why they're up there.", "{name}. That's the plan, and I'm sticking to it."],
    targetSecret: ["I'm keeping that to myself for now.", "Why do you want to know?", "Nobody, yet. I'm just watching."],
    targetNoone: ["Nobody. I'm just trying to get along with everybody.", "No one, really. I'm floating this week."],
    voteNoNoms: ["Nobody's even on the block yet.", "Ask me once there are nominations."],
    voteNominee: ["I'm on the block. I don't get a vote. I need yours, though.", "Nominees don't vote. I'm a little busy trying to stay."],
    voteHoh: ["I'm HoH, I only vote if there's a tie.", "HoH breaks ties. Hopefully it doesn't come to that."],
    voteNotYet: ["I haven't decided yet. Ask me closer to the vote.", "Still thinking. Ask me on eviction day."],
    feelClose: ["Of course! You're one of my people.", "Are you kidding? I'd ride for you.", "We're solid. Always."],
    feelFriendly: ["Yeah, we're good!", "I like you. We're good.", "We're cool."],
    feelNeutral: ["We're fine, I guess? We don't talk that much.", "I don't know you that well yet, honestly.", "We're okay."],
    feelWary: ["Honestly? I'm not sure about you.", "I've heard some things. We'll see.", "I don't know if I trust you yet."],
    feelEnemy: ["You know exactly where we stand.", "Don't pretend we're friends.", "No. We're not good."],
    opLove: ["{name}? I love them. Don't come for {name}.", "{name} is my person in here."],
    opLike: ["{name}'s cool. I like them.", "I get along with {name}."],
    opMeh: ["{name}? I don't really know them.", "No strong feelings about {name}.", "{name} is... fine?"],
    opDislike: ["{name}? Not a fan.", "I don't trust {name} as far as I can throw them.", "{name} gets on my nerves."],
    opHate: ["Don't even say that name to me.", "{name}? I can't stand them.", "I'd send {name} home tomorrow."],
    alliesYours: ["You know who: {name}. That's my priority.", "We've got {name}. That's my people."],
    alliesClose: ["Between us? {name}. Don't repeat that.", "I'm close with {name}. That's all you get."],
    alliesSecret: ["I'm playing my own game.", "Nobody. Me, myself and I.", "Why, who are YOU working with?"],
    accept: ["Deal.", "You know what? Yes.", "Okay. I'm in."],
    decline: ["I don't know about that...", "Not yet. Let's see how the week goes.", "I can't promise that right now."],
    pitchYes: ["You're right. {name} has to go.", "You know what, I've been thinking the same about {name}.", "Okay. {name}. I hear you."],
    pitchNo: ["I don't know about {name}...", "{name}? I don't see it.", "Hmm. Not sure I buy that."],
    heard: ["Good to know.", "Okay, noted.", "Thanks for telling me."],
    alreadyF2: ["We already have a final two, remember?", "We're already locked in. You and me."],
    alreadyAllied: ["We're already together in {name}!", "We've already got {name}, silly."],
    notNow: ["That's not really a thing right now.", "Huh? Not this week."],
    flirtYes: ["Oh? Well... maybe.", "Stop it. Okay, don't stop.", "You're kind of cute too."],
    flirtNo: ["Ha. Let's just be friends.", "I'm here to play the game, sorry.", "Uh... no."],
};

// How each personality says it differently (anything missing: the usual way).
const VOICES: { [p in PersonalityId]: Partial<{ [r in Reply]: string[] }> } = {
    mastermind: {
        greet: ["Ah, just who I wanted to see.", "Perfect timing. Sit down."],
        small: ["Interesting. Go on.", "Mm. Everything means something in here."],
        compliment: ["Flattery. I respect it.", "Thank you. I'll remember you said that."],
        insult: ["Interesting choice. I'll remember it.", "Careful. I'm the wrong person to make an enemy of."],
        dodge: ["Everything in time.", "You'll find out when it matters.", "Let's talk about you instead."],
        targetSecret: ["My target? Whoever the house wants gone. I just help it along.", "I don't have targets. I have options."],
        alliesSecret: ["I'm close with everyone. That's the point.", "Officially? Nobody."],
        decline: ["Let me think a few moves ahead on that.", "Not yet. Timing matters."],
        accept: ["Smart. We'll do it quietly.", "Deal. Nobody needs to know."],
    },
    compBeast: {
        greet: ["Yo! You training today?", "What's up! Did you see that last comp?"],
        small: ["Yeah, yeah. Anyway, next comp's mine.", "Ha. Wanna do push-ups?"],
        compliment: ["Thanks! I've been working hard.", "Appreciate it. Gotta keep winning."],
        insult: ["Say that after I beat you in the next comp.", "Whatever. Scoreboard."],
        targetSecret: ["Whoever wins too much. Except me.", "I'll tell you when I win HoH."],
        targetNoone: ["Whoever beats me in a comp, I guess."],
        dodge: ["I don't overthink this stuff.", "Ask me after the comp."],
    },
    floater: {
        greet: ["Heyyy! I love talking to you.", "Hi hi hi!"],
        small: ["Totally!", "Omg, same.", "Haha, yes!"],
        compliment: ["Omg, you're so sweet! You're amazing too!", "Stop! I love you!"],
        insult: ["Whoa, okay... I'm just trying to get along with everyone.", "Rude! But okay."],
        targetSecret: ["Whoever the house wants, honestly.", "I'm going with the flow!"],
        targetNoone: ["Nobody! I love everybody in here.", "Me? Target someone? Never."],
        alliesSecret: ["I'm friends with everyone!", "I don't really do alliances. Everyone's my friend!"],
        dodge: ["Hmm, I'm not sure! Whatever everyone else thinks?"],
        accept: ["Yes! Love that!", "Okay yay, deal!"],
    },
    loyalSoldier: {
        greet: ["Hey, friend. How are you holding up?", "There you are."],
        compliment: ["That means a lot. I've got your back too.", "Thank you. I mean it."],
        insult: ["I didn't deserve that.", "Okay. I'll remember who said that."],
        targetSecret: ["I'll tell my people, when I'm sure they're my people.", "I don't share that with just anyone."],
        dodge: ["I'd rather not say. I don't lie, so I'm just not saying."],
        accept: ["You have my word.", "Deal. And I keep my deals."],
        decline: ["I don't make promises I can't keep. Not yet."],
        heard: ["Thank you for being honest with me."],
    },
    villain: {
        greet: ["What do you want?", "Oh. It's you."],
        small: ["Uh-huh.", "Fascinating. Truly.", "And?"],
        compliment: ["I know.", "Took you long enough to notice."],
        insult: ["Wow, did you think of that one all by yourself?", "Cute. You're going on my list.", "Say that to my face on eviction night."],
        thanks: ["Whatever.", "Yeah, yeah."],
        apology: ["You should be sorry.", "Fine. Don't do it again."],
        targetSecret: ["Wouldn't you like to know.", "Keep talking and it might be you."],
        targetIs: ["{name}. And I'll tell them myself.", "{name}, obviously. Can't stand them."],
        dodge: ["None of your business.", "Next question."],
        feelFriendly: ["You're one of the few people in here I can stand.", "You're fine. Don't let it go to your head."],
        feelNeutral: ["You're tolerable.", "Haven't decided about you yet."],
        decline: ["Not a chance.", "Ha. No."],
        accept: ["Fine. Don't make me regret it.", "Deal. Cross me and you'll regret it."],
    },
    superfan: {
        greet: ["Hey! This is such a big week, right?", "Oh good, I needed to talk game!"],
        small: ["This is going to make such good TV.", "The fans are going to love this.", "Classic. Absolutely classic."],
        smallGame: ["This is the most important week of the season. I can feel it.", "This week is going to be iconic."],
        compliment: ["Stop, that's going in my season highlights.", "Thank you! You're playing great too."],
        insult: ["Villain edit, huh? Bold.", "Wow. The fans won't like that."],
        targetSecret: ["You never reveal your target this early. Rule one.", "Ha! Every superfan knows not to answer that."],
        dodge: ["That's a question for the Diary Room."],
        accept: ["This is how legends are made. Deal!", "Iconic. I'm in."],
    },
    wildcard: {
        greet: ["Oh! Hi! I was just thinking about you. Or someone. Hi!", "Hey! Wanna hear a crazy idea?"],
        small: ["Wild.", "Do you ever think about how weird this house is?", "Totally. Wait, what were we talking about?"],
        compliment: ["Aww! You're my favourite today.", "Ha! Thanks! Want half my sandwich?"],
        insult: ["Okay, that's going in my villain origin story.", "Ouch. Noted. Maybe."],
        targetSecret: ["I'll decide when I wake up that day.", "My target? Chaos."],
        dodge: ["Ask me tomorrow, I might have a different answer.", "Who knows! Not me!"],
        accept: ["Sure, why not! Probably!", "Yes! Wait. Yes."],
        decline: ["Hmm, my gut says no. My gut changes a lot, though."],
    },
};

// A line for this reply, in this personality's voice. `key` keeps the choice stable; `{name}` is filled in.
export function talkLine(p: PersonalityId | undefined, reply: Reply, key: string, name: string = ""): string {
    const own = p ? VOICES[p][reply] : undefined;
    const lines = own && own.length > 0 && hash01(`${key}:own`) < 0.75 ? own : GENERIC[reply];
    return lines[Math.floor(hash01(key) * lines.length)].split("{name}").join(name);
}

// What to say about someone, from how the bot (acts like it) feels about them.
export function opinionReply(v: number): Reply {
    if (v > 0.55) return "opLove";
    if (v > 0.2) return "opLike";
    if (v > -0.2) return "opMeh";
    if (v > -0.55) return "opDislike";
    return "opHate";
}

export function feelingReply(v: number): Reply {
    if (v > 0.6) return "feelClose";
    if (v > 0.25) return "feelFriendly";
    if (v > -0.25) return "feelNeutral";
    if (v > -0.6) return "feelWary";
    return "feelEnemy";
}

// Questions players can tap instead of typing.
export const TALK_SUGGESTIONS = ["Hey, how are you?", "Are we good?", "Who are you targeting?", "Who are you voting for?", "Final two?"];
