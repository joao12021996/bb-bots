import { BehaviorSubject } from "rxjs";
import { prefSubject } from "../prefs/prefs";
import { APP_NAME, HOH, LAST_CHANCE, POV, POWER_NAMES, SHOW_NAME, VETO } from "../playerMode/terms";
import { language$, t } from "./i18n";

// Renaming: the player's own words for the game's terms ("Head of Household" -> "Leader of the House", "HoH" -> "LoH").
// Works on the page itself, so it reaches every screen, including text the bots write, without each screen
// knowing about it. What is typed into text fields is never changed, nor anything inside [data-bbb-raw].

export interface Names {
    terms: { [term: string]: string }; // a built-in term (in English) -> the player's word
    custom: { from: string; to: string }[]; // any other word or phrase
}

export const RENAMEABLE: { group: string; terms: string[] }[] = [
    { group: "Roles", terms: [HOH, "HoH", "Houseguest", "Nominee", "Juror", "Jury", "Alliance"] },
    { group: "Week", terms: [POV, VETO, LAST_CHANCE, "Comp", "Competition", "Block", "Evict", "Evicted", "Eviction"] },
    { group: "Secret powers", terms: Object.values(POWER_NAMES) },
    { group: "The show", terms: [SHOW_NAME, APP_NAME] },
];

export const names$: BehaviorSubject<Names> = prefSubject<Names>("names", { terms: {}, custom: [] });

// Terms the game used to say: a word saved for one carries over to what it says now.
(() => {
    const renamed: [string, string][] = [
        ["Head of House", HOH],
        ["Last Chance comp", LAST_CHANCE],
    ];
    const terms = (names$.value && names$.value.terms) || {};
    if (!renamed.some(([old]) => terms[old] !== undefined)) return;
    const next = { ...terms };
    renamed.forEach(([old, now]) => {
        if (next[old] === undefined) return;
        if (next[now] === undefined) next[now] = next[old];
        delete next[old];
    });
    names$.next({ ...names$.value, terms: next });
})();

export function resetNames() {
    names$.next({ terms: {}, custom: [] });
}

export function renameCount(n: Names = names$.value): number {
    return Object.values(n.terms).filter((x) => x.trim()).length + n.custom.filter((c) => c.from.trim() && c.to.trim()).length;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// "LoH", "TV": capitals after the first letter mean the word keeps its case
const keepsCase = (s: string) => /\p{Lu}/u.test(s.slice(1));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Compiled {
    re: RegExp;
    map: Map<string, string>;
}

function compile(n: Names): Compiled | null {
    const map = new Map<string, string>();
    const add = (from: string, to: string) => {
        from = from.trim();
        to = to.trim();
        if (!from || !to || from === to) return;
        const variants: [string, string][] = [[from, to]];
        if (!keepsCase(from)) {
            variants.push([lowerFirst(from), keepsCase(to) ? to : lowerFirst(to)]);
            variants.push([upperFirst(from), keepsCase(to) ? to : upperFirst(to)]);
        }
        if (from.length > 1 && /\p{L}/u.test(from)) variants.push([from.toUpperCase(), to.toUpperCase()]);
        variants.forEach(([f, x]) => !map.has(f) && map.set(f, x));
    };
    // the player's own pairs win over the built-in ones
    n.custom.forEach((c) => add(c.from, c.to));
    Object.keys(n.terms).forEach((term) => {
        add(term, n.terms[term]);
        if (t(term) !== term) add(t(term), n.terms[term]); // the same term in the language on screen
    });
    if (map.size === 0) return null;
    const alts = Array.from(map.keys())
        .sort((a, b) => b.length - a.length)
        .map(escape)
        .join("|");
    return { re: new RegExp(`(?<![\\p{L}\\p{N}])(${alts})('s|s|es)?(?![\\p{L}\\p{N}])`, "gu"), map };
}

let compiled: Compiled | null = null;

// The text with the player's words in it. Also for text the page can't reach, like a drawn picture.
export function rename(text: string): string {
    if (!compiled || !text) return text;
    const c = compiled;
    return text.replace(c.re, (_m, word: string, suffix?: string) => c.map.get(word)! + (suffix || ""));
}

// ---- the page ----

const ATTRS = ["title", "aria-label", "placeholder", "alt"];
// what each text node / attribute said before renaming, and what we made it say
const textMemo = new WeakMap<Text, { original: string; shown: string }>();
const attrMemo = new WeakMap<Element, { [attr: string]: { original: string; shown: string } }>();

function skipped(el: Element | null): boolean {
    return !el || !!el.closest("[data-bbb-raw], script, style, textarea, [contenteditable='true']");
}

function renameText(node: Text) {
    if (skipped(node.parentElement)) return;
    const memo = textMemo.get(node);
    // if the page changed the text since, that's the new original
    const original = memo && memo.shown === node.data ? memo.original : node.data;
    const shown = rename(original);
    textMemo.set(node, { original, shown });
    if (shown !== node.data) node.data = shown;
}

function renameAttr(el: Element, attr: string) {
    const value = el.getAttribute(attr);
    if (value === null || skipped(el)) return;
    const memos = attrMemo.get(el) || {};
    const memo = memos[attr];
    const original = memo && memo.shown === value ? memo.original : value;
    const shown = rename(original);
    memos[attr] = { original, shown };
    attrMemo.set(el, memos);
    if (shown !== value) el.setAttribute(attr, shown);
}

function renameTree(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) return renameText(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (skipped(el)) return;
    ATTRS.forEach((a) => renameAttr(el, a));
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) renameText(n as Text);
        else ATTRS.forEach((a) => renameAttr(n as Element, a));
    }
}

let titleOriginal = "";
let titleShown = "";
function renameTitle() {
    if (document.title !== titleShown) titleOriginal = document.title;
    titleShown = rename(titleOriginal);
    document.title = titleShown;
}

let installed = false;

// Starts renaming the page, and keeps it renamed as it changes. Safe to call more than once.
export function installRenamer(root: Node = document.body) {
    if (installed || typeof MutationObserver === "undefined") return;
    installed = true;
    const observer = new MutationObserver((mutations) => {
        if (!compiled) return; // no words set: everything was put back when they were cleared
        mutations.forEach((m) => {
            if (m.type === "characterData") renameText(m.target as Text);
            else if (m.type === "attributes" && m.attributeName) renameAttr(m.target as Element, m.attributeName);
            else m.addedNodes.forEach(renameTree);
        });
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const refresh = () => {
        compiled = compile(names$.value);
        renameTree(root); // also puts back words that are no longer renamed
        renameTitle();
    };
    names$.subscribe(refresh);
    language$.subscribe(refresh);
}
