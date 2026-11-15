// Online games can be public: anyone can join one, so names and chat go through a filter on the host's device
// before anyone else sees them. It isn't meant to be clever (nothing typed by a determined person can be), only
// to keep the front page and a stranger's chat free of the obvious: slurs and the crudest words. The host can
// also remove a player (see NetSession.kick).

// Matched as whole words, after undoing the usual disguises (1 for i, @ for a, repeated letters...).
const WORDS = [
    // slurs
    "nigger", "nigga", "faggot", "fag", "retard", "tranny", "kike", "spic", "chink", "paki", "coon", "dyke", "gook", "wetback",
    // crude
    "fuck", "fucker", "fucking", "motherfucker", "cunt", "bitch", "whore", "slut", "cock", "pussy", "asshole", "arsehole", "wanker", "twat", "bastard", "shit", "bullshit",
    // violence aimed at someone
    "kys", "rape", "rapist",
    // French, Portuguese and Spanish, the other languages players write in
    "pute", "salope", "connard", "connasse", "encule", "merde", "puta", "caralho", "foda", "fodase", "viado", "buceta", "cabron", "pendejo", "maricon", "mierda",
];

const LEET: { [c: string]: string } = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

// A word as it would be read: lower case, accents and disguises undone, letters repeated for effect collapsed.
function plain(word: string): string {
    return word
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[013457@$]/g, (c) => LEET[c] || c)
        .replace(/[^a-z]/g, "")
        .replace(/(.)\1{2,}/g, "$1");
}

const BAD = new Set(WORDS);
// (a doubled letter might be the disguise, or part of the word: both readings are checked)
const single = (w: string) => w.replace(/(.)\1+/g, "$1");
const BAD_SINGLE = new Set(WORDS.map(single));

function isBad(word: string): boolean {
    const p = plain(word);
    if (p.length < 3) return false;
    // (the doubled-letter reading only for a word that has a doubled letter: "con" isn't "coon")
    const hit = (w: string) => BAD.has(w) || (w !== single(w) && BAD_SINGLE.has(single(w)));
    return hit(p) || (p.endsWith("s") && hit(p.slice(0, -1)));
}

export function hasBadWords(text: string): boolean {
    return String(text || "")
        .split(/[\s.,;:?!"'()[\]{}<>/\\|_~`+=*-]+/)
        .some(isBad);
}

// Chat: the words are starred out, the rest of the message stays.
export function cleanChat(text: string): string {
    return String(text || "").replace(/[^\s.,;:?!"'()[\]{}<>/\\|_~`+=*-]+/g, (word) => (isBad(word) ? "*".repeat(Math.min(word.length, 8)) : word));
}

// A name with a bad word in it becomes a plain one.
export function cleanName(name: string, fallback: string = "Player"): string {
    const trimmed = String(name || "").trim().slice(0, 24);
    if (!trimmed) return fallback;
    // (also read with its spaces and dots taken out: "f u c k")
    return hasBadWords(trimmed) || isBad(trimmed.replace(/[\s._-]+/g, "")) ? fallback : trimmed;
}
