import { PlayerProfile } from "../model/playerProfile";
import { hashcode } from "../utils/utilities";

// Cartoon houseguests: every character is drawn from a handful of attributes (skin, face, hair, eyes, glasses,
// facial hair, hats and more), so nobody needs a photo. The look travels inside the picture itself (an SVG data
// URL that carries its attributes), so it survives saves and online play, and House Comics can draw the same face
// as a superhero or a villain.

export interface CartoonLook {
    skin: number;
    face: number;
    hair: number;
    hairColor: number;
    eyes: number;
    eyeColor: number;
    brows: number;
    nose: number;
    mouth: number;
    glasses: number;
    facialHair: number;
    extra: number;
    hat: number;
    shirt: number;
    bg: number;
}

// The editor's rows, in order, with a name for every option.
export const LOOK_PARTS: { key: keyof CartoonLook; label: string; options: string[] }[] = [
    { key: "skin", label: "Skin", options: ["Porcelain", "Fair", "Light", "Warm", "Tan", "Golden", "Brown", "Deep", "Rich", "Ebony"] },
    { key: "face", label: "Face", options: ["Round", "Oval", "Square", "Long", "Heart", "Wide"] },
    {
        key: "hair",
        label: "Hair",
        options: ["Bald", "Buzz cut", "Short", "Side part", "Spiky", "Curly", "Afro", "Long", "Bob", "Bun", "Ponytail", "Mohawk", "Pigtails", "Wavy", "Quiff"],
    },
    {
        key: "hairColor",
        label: "Hair color",
        options: ["Black", "Dark brown", "Brown", "Auburn", "Ginger", "Blonde", "Platinum", "Gray", "White", "Blue", "Pink", "Purple", "Green", "Teal"],
    },
    { key: "eyes", label: "Eyes", options: ["Dots", "Round", "Sleepy", "Wide", "Lashes", "Almond", "Happy"] },
    { key: "eyeColor", label: "Eye color", options: ["Brown", "Dark", "Blue", "Green", "Hazel", "Gray", "Amber"] },
    { key: "brows", label: "Brows", options: ["Thin", "Thick", "Arched", "Straight", "Bushy"] },
    { key: "nose", label: "Nose", options: ["Button", "Line", "Wide", "Pointy", "Round"] },
    { key: "mouth", label: "Mouth", options: ["Smile", "Grin", "Smirk", "Oh!", "Straight", "Laugh"] },
    { key: "glasses", label: "Glasses", options: ["None", "Round", "Square", "Shades", "Cat-eye", "Half-rim"] },
    { key: "facialHair", label: "Facial hair", options: ["None", "Stubble", "Mustache", "Beard", "Goatee", "Handlebar"] },
    { key: "extra", label: "Extras", options: ["None", "Freckles", "Blush", "Earrings", "Beauty mark", "Scar", "Gold star"] },
    { key: "hat", label: "Hat", options: ["None", "Cap", "Beanie", "Headband", "Bow", "Crown", "Top hat", "Halo", "Horns", "Party hat"] },
    { key: "shirt", label: "Shirt", options: ["Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Indigo", "Purple", "Pink", "Black", "White", "Gray"] },
    { key: "bg", label: "Background", options: ["Sky", "Mint", "Peach", "Lilac", "Lemon", "Rose", "Aqua", "Sand", "Lime", "Coral", "Slate", "Night"] },
];

const KEYS = LOOK_PARTS.map((p) => p.key);

// Things to earn: these options (the last ones of their row) are for players who've unlocked the achievement
// that goes with them (see career.ts). Bots and dealt casts never wear them, so one in a house means something.
export const UNLOCKS: { part: keyof CartoonLook; index: number; achievement: string }[] = [
    { part: "hat", index: 5, achievement: "first-win" }, // Crown
    { part: "hat", index: 6, achievement: "veteran" }, // Top hat
    { part: "hat", index: 7, achievement: "honest" }, // Halo
    { part: "hat", index: 8, achievement: "backstab" }, // Horns
    { part: "hat", index: 9, achievement: "online" }, // Party hat
    { part: "extra", index: 5, achievement: "survivor" }, // Scar
    { part: "extra", index: 6, achievement: "unanimous" }, // Gold star
];

// The achievement an option needs (undefined: it's free).
export function unlockFor(part: keyof CartoonLook, index: number): string | undefined {
    const found = UNLOCKS.find((u) => u.part === part && u.index === index);
    return found ? found.achievement : undefined;
}

// How many of a row's options anyone can wear (the ones to earn come after them).
function freeCount(part: { key: keyof CartoonLook; options: string[] }): number {
    return part.options.length - UNLOCKS.filter((u) => u.part === part.key).length;
}

// A look with anything not `allowed` taken off: what a player who hasn't earned an option gets instead.
export function withoutLocked(look: CartoonLook, allowed: (achievement: string) => boolean): CartoonLook {
    const out = { ...look };
    UNLOCKS.forEach((u) => {
        if (out[u.part] === u.index && !allowed(u.achievement)) out[u.part] = 0;
    });
    return out;
}

const SKINS = ["#ffe3cf", "#fcd5b5", "#f3c39b", "#e8ad7e", "#d4955f", "#c08350", "#9c6640", "#7d4f30", "#5f3a22", "#432716"];
const HAIR = ["#1c1a1f", "#3b2416", "#6b3f22", "#8e3b1f", "#c95b2a", "#e8c26a", "#f3ead2", "#9ca3af", "#eceff3", "#3b82f6", "#ec4899", "#8b5cf6", "#10b981", "#0d9488"];
const IRIS = ["#6b4423", "#231b16", "#3b82f6", "#16a34a", "#8a6d2b", "#6b7280", "#d97706"];
const SHIRTS = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#3b82f6", "#4f46e5", "#a855f7", "#ec4899", "#1f2937", "#f8fafc", "#9ca3af"];
const BGS = ["#bae6fd", "#bbf7d0", "#fed7aa", "#ddd6fe", "#fef08a", "#fecdd3", "#a5f3fc", "#e7d8c3", "#d9f99d", "#fca5a5", "#cbd5e1", "#312e81"];
const INK = "#1f1720";

// Options that are better rare: most houseguests don't wear glasses, hats or beards.
const NONE_CHANCE: Partial<Record<keyof CartoonLook, number>> = { glasses: 0.5, facialHair: 0.68, extra: 0.4, hat: 0.8 };

export function randomLook(rand: () => number): CartoonLook {
    const look = {} as CartoonLook;
    LOOK_PARTS.forEach((part) => {
        const none = NONE_CHANCE[part.key];
        // (never the options there are to earn)
        const count = freeCount(part);
        if (none !== undefined && rand() < none) look[part.key] = 0;
        else if (none !== undefined) look[part.key] = 1 + Math.floor(rand() * (count - 1));
        else look[part.key] = Math.floor(rand() * count);
    });
    return look;
}

// How different two looks are: the attributes you notice first count most.
const WEIGHTS: Record<keyof CartoonLook, number> = {
    skin: 1.5, face: 1, hair: 2.2, hairColor: 2, eyes: 1, eyeColor: 0.5, brows: 0.6, nose: 0.6, mouth: 0.8,
    glasses: 1.5, facialHair: 1.2, extra: 0.6, hat: 1.2, shirt: 1.2, bg: 0.8,
};
export function lookDistance(a: CartoonLook, b: CartoonLook): number {
    return KEYS.reduce((d, k) => d + (a[k] === b[k] ? 0 : WEIGHTS[k]), 0);
}

// `n` looks, each as different from the others as can be: every new one is the best of many tries.
export function distinctLooks(n: number, rand: () => number): CartoonLook[] {
    const looks: CartoonLook[] = [];
    for (let i = 0; i < n; i++) {
        let best = randomLook(rand);
        let bestScore = -1;
        for (let t = 0; t < 60 && looks.length > 0; t++) {
            const candidate = t === 0 ? best : randomLook(rand);
            const nearest = Math.min(...looks.map((l) => lookDistance(l, candidate)));
            // and no two share a hairstyle and hair color, or a background, when it can be helped
            const clash = looks.some((l) => l.hair === candidate.hair && l.hairColor === candidate.hairColor) ? 4 : 0;
            const score = nearest - clash - (looks.some((l) => l.bg === candidate.bg) ? 0.5 : 0);
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        looks.push(best);
    }
    return looks;
}

// Made-up cast names: short, easy to tell apart, and nobody in particular.
export const CARTOON_NAMES = [
    "Ari", "Bex", "Cato", "Dara", "Ezra", "Faye", "Gus", "Hollis", "Ines", "Jojo", "Kenji", "Lux", "Milo", "Nia", "Otto",
    "Pia", "Quill", "Rafa", "Suki", "Tobi", "Uma", "Vonn", "Wren", "Xan", "Yara", "Zeke", "Amara", "Bodhi", "Cleo",
    "Dex", "Elio", "Fern", "Gia", "Hugo", "Ivo", "Juno", "Kai", "Lola", "Moss", "Nico", "Odette", "Pax", "Remy",
    "Sol", "Tali", "Ugo", "Vera", "Wilder", "Yuki", "Zola", "Anya", "Bram", "Coco", "Dante", "Esme", "Fitz",
    "Greta", "Hank", "Iris", "Jasper", "Kit", "Lenny", "Mabel", "Nell", "Olive", "Percy", "Rosa", "Sage", "Theo",
    "Ulla", "Vito", "Willa", "Ximena", "Yusuf", "Zara", "Arlo", "Birdie", "Cass", "Dot", "Enzo", "Flo", "Gemma",
    "Hal", "Imani", "Jett", "Kiki", "Lark", "Mateo", "Nova", "Orla", "Pip", "Ravi", "Saoirse", "Tad", "Uri", "Vida",
    "Wes", "Xiomara", "Yael", "Zev", "Bash", "Dolly", "Mags", "Rusty", "Taz", "Bea", "Ozzie", "Priya", "Leif",
    "Marisol", "Tova", "Rocco", "Delphine", "Kofi", "Noor", "Basil", "Calla", "Dmitri", "Effie", "Gideon", "Hattie",
    "Indra", "Jude", "Koa", "Lupe", "Mina", "Nash", "Opal", "Quincy", "Rhea", "Soren", "Tess", "Valen", "Wally",
];

// Names for a cast: different first letters when there are few enough houseguests, so they're easy to tell apart.
export function castNames(n: number, rand: () => number): string[] {
    const pool = [...CARTOON_NAMES].sort(() => rand() - 0.5);
    const names: string[] = [];
    for (const name of pool) {
        if (names.length >= n) break;
        if (n <= 26 && names.some((x) => x[0] === name[0])) continue;
        names.push(name);
    }
    for (const name of pool) if (names.length < n && !names.includes(name)) names.push(name);
    return names;
}

// A wide bell curve over 1-10: most houseguests are in the middle, but about 1 in 10 is a 9-10 and about 1 in
// 10 is a 1-2, so every cast has its standouts and its disasters.
export const STAT_MEAN = 5.5;
export const STAT_SPREAD = 2.35;

export function statRoll(rand: () => number): number {
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(1, Math.min(10, Math.round(STAT_MEAN + STAT_SPREAD * z)));
}

// A whole cast of cartoon houseguests, all different, with Social and Comp scores.
export function cartoonCast(n: number, seed: number = Math.floor(Math.random() * 1e9)): PlayerProfile[] {
    let s = seed >>> 0 || 1;
    const rand = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const looks = distinctLooks(n, rand);
    const names = castNames(n, rand);
    return looks.map((look, i) => ({ name: names[i], imageURL: cartoonURL(look), social: statRoll(rand), comp: statRoll(rand) }));
}

// ---------- reading a look back from a picture ----------

export function encodeLook(look: CartoonLook): string {
    return KEYS.map((k) => look[k]).join(".");
}

export function decodeLook(code: string): CartoonLook | null {
    const parts = code.split(".").map((x) => parseInt(x, 10));
    if (parts.length !== KEYS.length || parts.some((x) => isNaN(x))) return null;
    const look = {} as CartoonLook;
    KEYS.forEach((k, i) => (look[k] = Math.max(0, Math.min(LOOK_PARTS[i].options.length - 1, parts[i]))));
    return look;
}

// The look in a cartoon picture, if it is one.
export function lookFromURL(url: string | undefined): CartoonLook | null {
    if (!url || !url.startsWith("data:image/svg")) return null;
    let text = url;
    try {
        text = decodeURIComponent(url);
    } catch (e) {
        // not URL-encoded
    }
    const m = text.match(/data-look="([0-9.]+)"/);
    return m ? decodeLook(m[1]) : null;
}

// Anyone's cartoon look: the one in their picture, or one made up from their name (photos, older saves).
export function lookOf(hg: { name: string; imageURL?: string }): CartoonLook {
    const found = lookFromURL(hg.imageURL);
    if (found) return found;
    let s = Math.abs(hashcode(hg.name)) || 1;
    return randomLook(() => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
    });
}

// ---------- drawing ----------

export interface DrawOptions {
    headOnly?: boolean; // no background, no shoulders: for the comics
    mask?: "none" | "eyes" | "cowl"; // a superhero's mask
    maskColor?: string;
    villain?: boolean; // scowling brows and a sneer
    bare?: boolean; // no background square (the head and shoulders alone, to move about)
    expression?: Expression; // Tainted Wine: how the wine went down
}

export type Expression =
    | "happy"
    | "sad"
    | "sick"
    | "dead"
    | "laugh"
    | "wink"
    | "smug"
    | "shocked"
    | "cry"
    | "angry"
    | "ecstatic"; // the winner: stars in their eyes

// a five-pointed star around (cx, cy)
function star(cx: number, cy: number, r: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const d = i % 2 ? r * 0.45 : r;
        pts.push(`${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(" ")}" fill="#fbbf24" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>`;
}

// a color part of the way to another: "#rrggbb"
function mixColor(a: string, b: string, t: number): string {
    const ch = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
    return "#" + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("");
}

// Eyes and mouth for an expression, drawn over nothing (they replace the usual ones).
function expressionEyes(e: Expression): string {
    const s = `stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    if (e === "happy") return `<path d="M36.5 53.5 Q41 48 45.5 53.5 M54.5 53.5 Q59 48 63.5 53.5" ${s}/>`;
    if (e === "sad")
        return `<path d="M36.5 51 Q41 55 45.5 51 M54.5 51 Q59 55 63.5 51 M35 45.5 L45 43 M65 45.5 L55 43" ${s}/><path d="M38.5 56 Q37 60 38.5 61.5 Q40 60 38.5 56 Z" fill="#60a5fa" stroke="${INK}" stroke-width="0.6"/>`;
    if (e === "sick") return `<path d="M37 49.5 L44 52.5 L37 55.5 M63 49.5 L56 52.5 L63 55.5" ${s}/>`;
    if (e === "laugh") return `<path d="M37 54 L41 49.5 L45 54 M55 54 L59 49.5 L63 54" ${s}/>`;
    if (e === "wink") return `<circle cx="41" cy="52" r="2.6" fill="${INK}"/><path d="M54.5 53.5 Q59 48 63.5 53.5" ${s}/>`;
    if (e === "smug")
        return `<path d="M36.5 51.5 L45.5 51.5 M54.5 51.5 L63.5 51.5" ${s}/><path d="M38.5 51.5 Q41 55.5 43.5 51.5 Z M56.5 51.5 Q59 55.5 61.5 51.5 Z" fill="${INK}"/>`;
    if (e === "shocked")
        return `<g stroke="${INK}" stroke-width="1.4"><circle cx="41" cy="52" r="4.3" fill="#fff"/><circle cx="59" cy="52" r="4.3" fill="#fff"/></g><circle cx="41" cy="52" r="1.5" fill="${INK}"/><circle cx="59" cy="52" r="1.5" fill="${INK}"/><path d="M35 44 Q40.5 40 46 43.5 M54 43.5 Q59.5 40 65 44" ${s}/>`;
    if (e === "cry")
        return `<path d="M36.5 51.5 Q41 55.5 45.5 51.5 M54.5 51.5 Q59 55.5 63.5 51.5 M35 45.5 L45 43 M65 45.5 L55 43" ${s}/><path d="M38.5 54.5 L38 68 M61.5 54.5 L62 68" stroke="#60a5fa" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/>`;
    if (e === "angry")
        return `<circle cx="41" cy="53" r="2.2" fill="${INK}"/><circle cx="59" cy="53" r="2.2" fill="${INK}"/><path d="M35 44.5 L46 49 M65 44.5 L54 49" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    if (e === "ecstatic")
        return `${star(41, 52, 5.6)}${star(59, 52, 5.6)}<ellipse cx="33.5" cy="60" rx="3.6" ry="2.2" fill="#f472b6" opacity="0.6"/><ellipse cx="66.5" cy="60" rx="3.6" ry="2.2" fill="#f472b6" opacity="0.6"/>`;
    return `<path d="M37 48.5 L45 56.5 M45 48.5 L37 56.5 M55 48.5 L63 56.5 M63 48.5 L55 56.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
}

function expressionMouth(e: Expression): string {
    if (e === "happy")
        return `<path d="M41 66 Q50 78 59 66 Z" fill="#7f1d1d" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M42.5 67 L57.5 67 L56 69 L44 69 Z" fill="#fff"/>`;
    if (e === "sad") return `<path d="M43 71 Q50 65.5 57 71" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    if (e === "sick") return `<ellipse cx="50" cy="69.5" rx="5.5" ry="4.6" fill="#3f0d12" stroke="${INK}" stroke-width="1.4"/>`;
    if (e === "laugh" || e === "ecstatic")
        return `<path d="M39 64 Q50 82 61 64 Z" fill="#7f1d1d" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M40.5 65 L59.5 65 L58 67.5 L42 67.5 Z" fill="#fff"/><path d="M45 73.5 Q50 70 55 73.5 Q50 77 45 73.5 Z" fill="#f87171"/>`;
    if (e === "wink" || e === "smug") return `<path d="M43 69 Q51 72.5 58 65.5" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    if (e === "shocked") return `<ellipse cx="50" cy="70" rx="3.8" ry="5.2" fill="#3f0d12" stroke="${INK}" stroke-width="1.4"/>`;
    if (e === "cry") return `<path d="M42.5 73 Q45 66 50 67.5 Q55 66 57.5 73 Z" fill="#3f0d12" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    if (e === "angry")
        return `<rect x="42" y="66" width="16" height="6.5" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.4"/><path d="M42 69.25 L58 69.25 M47 66 L47 72.5 M53 66 L53 72.5" stroke="${INK}" stroke-width="0.9"/>`;
    return `<ellipse cx="50" cy="69" rx="5" ry="3.6" fill="#3f0d12" stroke="${INK}" stroke-width="1.4"/><path d="M50 70 Q50 79 55 79 Q59.5 79 58.5 71 Z" fill="#f87171" stroke="${INK}" stroke-width="1.2"/>`;
}

function faceShape(face: number, skin: string): string {
    const s = `fill="${skin}" stroke="${INK}" stroke-width="1.6"`;
    switch (face) {
        case 1:
            return `<ellipse cx="50" cy="51" rx="21" ry="26" ${s}/>`;
        case 2:
            return `<path d="M28 36 Q28 26 37 26 L63 26 Q72 26 72 36 L72 60 Q71 76 50 77 Q29 76 28 60 Z" ${s}/>`;
        case 3:
            return `<ellipse cx="50" cy="51" rx="19.5" ry="27.5" ${s}/>`;
        case 4:
            return `<path d="M27 41 Q27 24 50 25 Q73 24 73 41 Q73 61 50 77 Q27 61 27 41 Z" ${s}/>`;
        case 5:
            return `<path d="M28 43 Q29 25 50 25 Q71 25 72 43 L74 58 Q73 76 50 76 Q27 76 26 58 Z" ${s}/>`;
        default:
            return `<ellipse cx="50" cy="51" rx="23" ry="24.5" ${s}/>`;
    }
}

// Hair behind the head (long styles), and in front (on top of the head).
function hairBack(style: number, c: string): string {
    const s = `fill="${c}" stroke="${INK}" stroke-width="1.4"`;
    switch (style) {
        case 6:
            return `<circle cx="50" cy="40" r="31" ${s}/>`;
        case 7:
            return `<path d="M24 40 Q22 15 50 14 Q78 15 76 40 L80 90 L20 90 Z" ${s}/>`;
        case 8:
            return `<path d="M23 44 Q22 15 50 15 Q78 15 77 44 L78 70 Q72 75 66 70 L66 52 L34 52 L34 70 Q28 75 22 70 Z" ${s}/>`;
        case 10:
            return `<path d="M66 30 Q92 36 84 76 Q76 64 70 44 Z" ${s}/>`;
        case 12:
            return `<circle cx="22" cy="44" r="9" ${s}/><circle cx="78" cy="44" r="9" ${s}/>`;
        case 13:
            return `<path d="M24 38 Q20 15 50 13 Q80 15 76 38 Q85 52 76 64 Q85 77 74 90 L26 90 Q15 77 24 64 Q15 52 24 38 Z" ${s}/>`;
        default:
            return "";
    }
}

function hairFront(style: number, c: string): string {
    const s = `fill="${c}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"`;
    const fringe = `<path d="M27 46 Q26 18 50 18 Q74 18 73 46 Q66 31 50 31 Q34 31 27 46 Z" ${s}/>`;
    switch (style) {
        case 1:
            return `<path d="M29 42 Q29 23 50 23 Q71 23 71 42 Q61 33 50 33 Q39 33 29 42 Z" fill="${c}" opacity="0.8"/>`;
        case 2:
            return `<path d="M27 46 Q25 18 50 17 Q75 18 73 46 Q70 33 61 30 Q50 35 39 30 Q30 33 27 46 Z" ${s}/>`;
        case 3:
            return `<path d="M27 48 Q24 16 52 16 Q77 18 73 46 Q72 31 62 28 Q47 37 31 32 Z" ${s}/>`;
        case 4:
            return `<path d="M27 44 L24 30 L33 32 L31 17 L41 26 L45 11 L52 24 L58 11 L62 25 L70 16 L69 31 L77 30 L73 44 Q62 32 50 33 Q38 32 27 44 Z" ${s}/>`;
        case 5:
            return `<g ${s}>${[[30, 41], [31, 31], [38, 23], [47, 19], [56, 19], [64, 23], [70, 31], [71, 41]]
                .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5"/>`)
                .join("")}</g>`;
        case 6:
            return `<path d="M28 44 Q30 30 40 32 Q50 26 60 32 Q70 30 72 44 Q74 26 50 22 Q26 26 28 44 Z" ${s}/>`;
        case 8:
            return `<path d="M27 42 Q27 17 50 17 Q73 17 73 42 L73 39 Q50 41 27 39 Z" ${s}/>`;
        case 9:
            return `<circle cx="50" cy="13" r="8.5" ${s}/>` + fringe;
        case 11:
            return `<path d="M30 42 Q30 25 50 24 Q70 25 70 42 Q60 35 50 35 Q40 35 30 42 Z" fill="${c}" opacity="0.35"/><path d="M44 33 L42 8 Q50 3 58 8 L56 33 Z" ${s}/>`;
        case 12:
            return `<path d="M27 42 Q27 17 50 17 Q73 17 73 42 L73 38 Q61 34 50 41 Q39 34 27 38 Z" ${s}/>`;
        case 14:
            return `<path d="M27 44 Q26 22 39 20 Q41 5 63 9 Q77 14 73 44 Q68 30 50 31 Q36 30 27 44 Z" ${s}/>`;
        case 0:
            return `<path d="M38 30 Q44 27 49 29" stroke="#fff" stroke-width="2" fill="none" opacity="0.5" stroke-linecap="round"/>`;
        default:
            // long, wavy, ponytail: a fringe in front
            return fringe;
    }
}

function eyes(style: number, iris: string): string {
    const both = (f: (x: number) => string) => f(41) + f(59);
    switch (style) {
        case 0:
            return both((x) => `<circle cx="${x}" cy="52" r="2.6" fill="${INK}"/>`);
        case 2:
            return both(
                (x) =>
                    `<ellipse cx="${x}" cy="53" rx="4.6" ry="3.4" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="${x}" cy="53.6" r="2.3" fill="${iris}"/><path d="M${x - 5} 52 Q${x} 49 ${x + 5} 52" stroke="${INK}" stroke-width="1.6" fill="none"/>`
            );
        case 3:
            return both(
                (x) =>
                    `<ellipse cx="${x}" cy="52" rx="5" ry="6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="${x}" cy="52.5" r="3.1" fill="${iris}"/><circle cx="${x}" cy="52.5" r="1.4" fill="${INK}"/><circle cx="${x + 1.2}" cy="51" r="0.9" fill="#fff"/>`
            );
        case 4:
            return both(
                (x) =>
                    `<circle cx="${x}" cy="52" r="4.2" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="${x}" cy="52.5" r="2.6" fill="${iris}"/><circle cx="${x}" cy="52.5" r="1.1" fill="${INK}"/>` +
                    `<path d="M${x + (x < 50 ? -4 : 4)} 49.5 l${x < 50 ? -2.5 : 2.5} -2 M${x + (x < 50 ? -2.5 : 2.5)} 48 l${x < 50 ? -1.5 : 1.5} -2.5" stroke="${INK}" stroke-width="1.2"/>`
            );
        case 5:
            return both(
                (x) =>
                    `<path d="M${x - 5.5} 52 Q${x} 47.5 ${x + 5.5} 52 Q${x} 55.5 ${x - 5.5} 52 Z" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="${x}" cy="52" r="2.1" fill="${iris}"/>`
            );
        case 6:
            return both((x) => `<path d="M${x - 4.5} 53.5 Q${x} 48 ${x + 4.5} 53.5" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
        default:
            return both(
                (x) =>
                    `<circle cx="${x}" cy="52" r="4.4" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="${x}" cy="52.4" r="2.7" fill="${iris}"/><circle cx="${x}" cy="52.4" r="1.2" fill="${INK}"/><circle cx="${x + 1}" cy="51.2" r="0.8" fill="#fff"/>`
            );
    }
}

function brows(style: number, c: string, villain: boolean): string {
    if (villain) return `<path d="M34 42 L46 47 M66 42 L54 47" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
    switch (style) {
        case 1:
            return `<path d="M35 45 Q41 41.5 47 44.5 M53 44.5 Q59 41.5 65 45" stroke="${c}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
        case 2:
            return `<path d="M35 46 Q40 40 47 44 M53 44 Q60 40 65 46" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
        case 3:
            return `<path d="M35 44.5 L47 44.5 M53 44.5 L65 44.5" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`;
        case 4:
            return `<path d="M34 46 Q41 39 48 44.5 M52 44.5 Q59 39 66 46" stroke="${c}" stroke-width="4.4" fill="none" stroke-linecap="round"/>`;
        default:
            return `<path d="M36 45 Q41 43 46 44.5 M54 44.5 Q59 43 64 45" stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    }
}

function nose(style: number): string {
    const s = `stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    switch (style) {
        case 1:
            return `<path d="M50 55 L47 62 L51 62.5" ${s}/>`;
        case 2:
            return `<path d="M45 61 Q47 64 50 63 Q53 64 55 61" ${s}/>`;
        case 3:
            return `<path d="M50 54 L44.5 62.5 L51 62.5" ${s}/>`;
        case 4:
            return `<ellipse cx="50" cy="60.5" rx="4" ry="3.2" fill="rgba(0,0,0,0.08)" stroke="${INK}" stroke-width="1.2"/>`;
        default:
            return `<path d="M48 61 Q50 63 52 61" ${s}/>`;
    }
}

function mouth(style: number, villain: boolean): string {
    const s = `stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"`;
    if (villain) return `<path d="M43 70 Q50 66 58 68" ${s}/>`;
    switch (style) {
        case 1:
            return `<path d="M42 67 Q50 75 58 67 Z" fill="#fff" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M43 68.5 L57 68.5" stroke="${INK}" stroke-width="0.7"/>`;
        case 2:
            return `<path d="M43 69 Q51 72 58 66" ${s}/>`;
        case 3:
            return `<ellipse cx="50" cy="69" rx="3" ry="3.6" fill="#7f1d1d" stroke="${INK}" stroke-width="1.3"/>`;
        case 4:
            return `<path d="M44 69 L56 69" ${s}/>`;
        case 5:
            return `<path d="M41 66 Q50 79 59 66 Z" fill="#7f1d1d" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M45 72 Q50 69 55 72 Q50 75 45 72 Z" fill="#f87171"/>`;
        default:
            return `<path d="M43 67 Q50 73 57 67" ${s}/>`;
    }
}

function glasses(style: number): string {
    switch (style) {
        case 1:
            return `<g fill="rgba(255,255,255,0.15)" stroke="${INK}" stroke-width="1.6"><circle cx="41" cy="52" r="7"/><circle cx="59" cy="52" r="7"/></g><path d="M48 52 Q50 50 52 52 M34 51 L28 49 M66 51 L72 49" stroke="${INK}" stroke-width="1.4" fill="none"/>`;
        case 2:
            return `<g fill="rgba(255,255,255,0.15)" stroke="${INK}" stroke-width="1.8"><rect x="33" y="46.5" width="15" height="11" rx="2"/><rect x="52" y="46.5" width="15" height="11" rx="2"/></g><path d="M48 51 L52 51 M33 50 L28 49 M67 50 L72 49" stroke="${INK}" stroke-width="1.5"/>`;
        case 3:
            return `<g fill="#111" stroke="${INK}" stroke-width="1.4"><path d="M32 47 L49 47 L47 56 Q40 59 34 56 Z"/><path d="M51 47 L68 47 L66 56 Q60 59 53 56 Z"/></g><path d="M49 48 L51 48 M32 48 L27 47 M68 48 L73 47" stroke="${INK}" stroke-width="1.5"/><path d="M36 49 L40 49" stroke="#fff" stroke-width="1" opacity="0.6"/>`;
        case 4:
            return `<g fill="rgba(255,255,255,0.15)" stroke="#be185d" stroke-width="2"><path d="M32 47 Q41 45 48 49 Q46 57 40 57 Q34 56 32 47 Z"/><path d="M68 47 Q59 45 52 49 Q54 57 60 57 Q66 56 68 47 Z"/></g><path d="M48 50 L52 50" stroke="#be185d" stroke-width="1.6"/>`;
        case 5:
            return `<path d="M33 48 L48 48 M52 48 L67 48 M48 48 Q50 46.5 52 48 M33 48 L28 47 M67 48 L72 47" stroke="#b45309" stroke-width="2.4" fill="none"/><path d="M33.5 49 Q35 57 41 57 Q47 57 47.5 49 M52.5 49 Q53 57 59 57 Q65 57 66.5 49" stroke="${INK}" stroke-width="0.8" fill="none"/>`;
        default:
            return "";
    }
}

function facialHair(style: number, c: string): string {
    switch (style) {
        case 1:
            return `<path d="M31 60 Q32 76 50 77 Q68 76 69 60 Q64 72 50 72 Q36 72 31 60 Z" fill="${c}" opacity="0.28"/>`;
        case 2:
            return `<path d="M41 65 Q45 61 50 63.5 Q55 61 59 65 Q55 66.5 50 65.5 Q45 66.5 41 65 Z" fill="${c}" stroke="${INK}" stroke-width="0.9"/>`;
        case 3:
            return `<path d="M28 54 Q28 82 50 84 Q72 82 72 54 Q70 66 62 66 Q56 63 50 64 Q44 63 38 66 Q30 66 28 54 Z M44 70 Q50 73 56 70 Q50 75 44 70 Z" fill="${c}" stroke="${INK}" stroke-width="1.2" fill-rule="evenodd"/>`;
        case 4:
            return `<path d="M44 73 Q50 71 56 73 L53 81 Q50 83 47 81 Z" fill="${c}" stroke="${INK}" stroke-width="1"/><path d="M42 65 Q50 61 58 65 Q50 64 42 65 Z" fill="${c}" stroke="${INK}" stroke-width="0.8"/>`;
        case 5:
            return `<path d="M38 68 Q38 62 44 63 Q48 61 50 63.5 Q52 61 56 63 Q62 62 62 68 Q58 64 50 65.5 Q42 64 38 68 Z" fill="${c}" stroke="${INK}" stroke-width="1"/>`;
        default:
            return "";
    }
}

function extra(style: number): string {
    switch (style) {
        case 1:
            return `<g fill="#b45309" opacity="0.55">${[[37, 59], [40, 61], [43, 59], [57, 59], [60, 61], [63, 59]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9"/>`).join("")}</g>`;
        case 2:
            return `<ellipse cx="36" cy="61" rx="4.5" ry="2.6" fill="#f472b6" opacity="0.45"/><ellipse cx="64" cy="61" rx="4.5" ry="2.6" fill="#f472b6" opacity="0.45"/>`;
        case 3:
            return `<circle cx="27" cy="62" r="2.4" fill="#facc15" stroke="${INK}" stroke-width="0.8"/><circle cx="73" cy="62" r="2.4" fill="#facc15" stroke="${INK}" stroke-width="0.8"/>`;
        case 4:
            return `<circle cx="60" cy="64" r="1.1" fill="${INK}"/>`;
        case 5:
            // a scar: been on the block and lived
            return `<path d="M61 43 L65.5 58 M59.5 47 L65 45.5 M61 52 L66.5 50.5" stroke="#9f1239" stroke-width="1.2" stroke-linecap="round" fill="none"/>`;
        case 6:
            // a gold star on the cheek
            return `<path d="M37 56.5 L38.4 59.6 L41.8 60 L39.3 62.3 L40 65.6 L37 63.9 L34 65.6 L34.7 62.3 L32.2 60 L35.6 59.6 Z" fill="#facc15" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`;
        default:
            return "";
    }
}

function hat(style: number, c: string): string {
    const s = `fill="${c}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;
    switch (style) {
        case 1:
            return `<path d="M27 36 Q27 14 50 14 Q73 14 73 36 Z" ${s}/><path d="M50 34 Q70 31 86 37 Q72 40 50 38 Z" ${s}/><circle cx="50" cy="14.5" r="1.8" fill="${INK}"/>`;
        case 2:
            return `<path d="M26 38 Q24 10 50 9 Q76 10 74 38 Z" ${s}/><rect x="25" y="32" width="50" height="8" rx="3" ${s}/><circle cx="50" cy="8" r="4" ${s}/>`;
        case 3:
            return `<path d="M27 35 Q50 26 73 35 L73 40 Q50 31 27 40 Z" ${s}/>`;
        case 4:
            return `<path d="M60 22 L68 16 L70 26 Z M60 22 L54 14 L52 24 Z" ${s}/><circle cx="61" cy="21.5" r="2.4" ${s}/>`;
        case 5: {
            // a crown
            const gold = `fill="#facc15" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;
            return `<path d="M29 31 L29 13 L39.5 22 L50 9 L60.5 22 L71 13 L71 31 Z" ${gold}/><rect x="29" y="27" width="42" height="6" rx="1.5" ${gold}/><circle cx="50" cy="30" r="1.8" fill="#dc2626"/><circle cx="38" cy="30" r="1.4" fill="#2563eb"/><circle cx="62" cy="30" r="1.4" fill="#2563eb"/>`;
        }
        case 6: {
            // a top hat
            const felt = `fill="#1f2937" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;
            return `<rect x="33" y="3" width="34" height="27" rx="2" ${felt}/><rect x="33" y="21" width="34" height="5.5" fill="#b91c1c" stroke="${INK}" stroke-width="1"/><rect x="23" y="28" width="54" height="6" rx="3" ${felt}/>`;
        }
        case 7:
            // a halo
            return `<ellipse cx="50" cy="9" rx="17" ry="4.6" fill="none" stroke="${INK}" stroke-width="4.6"/><ellipse cx="50" cy="9" rx="17" ry="4.6" fill="none" stroke="#fde047" stroke-width="2.6"/>`;
        case 8: {
            // horns
            const horn = `fill="#dc2626" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"`;
            return `<path d="M30 27 Q22 15 27 5 Q36 11 40 23 Z" ${horn}/><path d="M70 27 Q78 15 73 5 Q64 11 60 23 Z" ${horn}/>`;
        }
        case 9:
            // a party hat
            return `<path d="M36 31 L52 3 L66 29 Z" ${s}/><path d="M43.5 18 L58.5 15.5 M39.5 25 L63 22" stroke="#fff" stroke-width="2" opacity="0.8"/><circle cx="52" cy="3.5" r="3.2" fill="#facc15" stroke="${INK}" stroke-width="1.2"/>`;
        default:
            return "";
    }
}

// The picture, as SVG markup.
export function cartoonSVG(look: CartoonLook, opts: DrawOptions = {}): string {
    const expression = opts.expression;
    const baseSkin = SKINS[look.skin] || SKINS[0];
    // the tainted wine turns you green
    const skin =
        expression === "sick"
            ? mixColor(baseSkin, "#84cc16", 0.45)
            : expression === "dead"
              ? mixColor(baseSkin, "#94a3b8", 0.55)
              : expression === "angry"
                ? mixColor(baseSkin, "#ef4444", 0.22)
                : baseSkin;
    const hairC = HAIR[look.hairColor] || HAIR[0];
    const shirt = SHIRTS[look.shirt] || SHIRTS[0];
    const mask = opts.mask || "none";
    const maskColor = opts.maskColor || "#111";
    const villain = !!opts.villain;
    const parts: string[] = [];
    if (!opts.headOnly && !opts.bare) {
        parts.push(`<rect width="100" height="100" fill="${BGS[look.bg] || BGS[0]}"/>`);
        parts.push(`<circle cx="50" cy="44" r="40" fill="#fff" opacity="0.18"/>`);
    }
    if (mask !== "cowl") parts.push(hairBack(look.hair, hairC));
    if (!opts.headOnly) {
        parts.push(`<rect x="43" y="68" width="14" height="14" fill="${skin}" stroke="${INK}" stroke-width="1.4"/>`);
        parts.push(`<path d="M12 101 Q14 82 35 78 Q50 86 65 78 Q86 82 88 101 Z" fill="${shirt}" stroke="${INK}" stroke-width="1.6"/>`);
        parts.push(`<path d="M42 79 Q50 87 58 79" fill="none" stroke="${INK}" stroke-width="1.2"/>`);
    }
    if (mask === "cowl") parts.push(`<path d="M24 66 Q19 13 50 12 Q81 13 76 66 Z" fill="${maskColor}" stroke="${INK}" stroke-width="1.6"/><path d="M30 24 L26 6 L38 18 Z M70 24 L74 6 L62 18 Z" fill="${maskColor}" stroke="${INK}" stroke-width="1.4"/>`);
    parts.push(`<ellipse cx="27" cy="54" rx="4" ry="6" fill="${skin}" stroke="${INK}" stroke-width="1.4"/><ellipse cx="73" cy="54" rx="4" ry="6" fill="${skin}" stroke="${INK}" stroke-width="1.4"/>`);
    parts.push(faceShape(look.face, skin));
    if (mask === "cowl") parts.push(`<path d="M27 49 Q26 24 50 23 Q74 24 73 49 Q62 44 50 45 Q38 44 27 49 Z" fill="${maskColor}" stroke="${INK}" stroke-width="1.4"/>`);
    parts.push(extra(look.extra));
    parts.push(facialHair(look.facialHair, hairC));
    parts.push(nose(look.nose));
    parts.push(expression ? expressionMouth(expression) : mouth(look.mouth, villain));
    if (mask === "eyes") parts.push(`<path d="M28 47 Q50 41 72 47 L71 58 Q50 53 29 58 Z" fill="${maskColor}" stroke="${INK}" stroke-width="1.2"/>`);
    // masked heroes have plain white eyes; everyone else, their own
    parts.push(
        expression
            ? expressionEyes(expression)
            : mask === "none"
            ? eyes(villain && look.eyes === 6 ? 5 : look.eyes, IRIS[look.eyeColor] || IRIS[0])
            : `<g fill="#fff" stroke="${INK}" stroke-width="0.9"><path d="M36 52 Q41 48 46 52 Q41 54.5 36 52 Z"/><path d="M54 52 Q59 48 64 52 Q59 54.5 54 52 Z"/></g>`
    );
    parts.push(brows(look.brows, mask === "cowl" ? INK : hairC, villain));
    if (mask !== "cowl") parts.push(hairFront(look.hair, hairC));
    if (mask !== "cowl") parts.push(hat(look.hat, look.shirt === 9 ? "#f8fafc" : SHIRTS[(look.shirt + 6) % SHIRTS.length]));
    if (mask !== "eyes") parts.push(glasses(look.glasses));
    const viewBox = opts.headOnly ? "18 4 64 82" : "0 0 100 100";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="160" height="${opts.headOnly ? 205 : 160}" data-look="${encodeLook(look)}">${parts.join("")}</svg>`;
}

// The picture as a data URL: what a houseguest's imageURL is.
export function cartoonURL(look: CartoonLook, opts: DrawOptions = {}): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cartoonSVG(look, opts))}`;
}

// A face made up from a name, for someone who hasn't designed one.
export function cartoonFor(name: string): string {
    return cartoonURL(lookOf({ name }));
}

// The skin color of a look (the comics draw hands to match).
export function skinColor(look: CartoonLook): string {
    return SKINS[look.skin] || SKINS[0];
}
