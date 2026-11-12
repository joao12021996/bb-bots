import { prefSubject } from "../prefs/prefs";

// Little sound effects, made on the fly with Web Audio (no files to load). Muted with the 🔊 switch in the
// top bar; remembered per device.

export const muted$ = prefSubject<boolean>("muted", false);

export type Cue = "click" | "win" | "lose" | "nominate" | "evict" | "vote" | "fanfare" | "power" | "tick" | "reveal" | "achievement";

type Note = { f: number; at: number; len: number; type?: OscillatorType; gain?: number; slide?: number };

const C4 = 261.63;
const semis = (n: number) => C4 * Math.pow(2, n / 12);

const CUES: { [cue in Cue]: Note[] } = {
    click: [{ f: 880, at: 0, len: 0.04, type: "square", gain: 0.05 }],
    tick: [{ f: 1200, at: 0, len: 0.03, type: "square", gain: 0.04 }],
    win: [
        { f: semis(12), at: 0, len: 0.12 },
        { f: semis(16), at: 0.1, len: 0.12 },
        { f: semis(19), at: 0.2, len: 0.12 },
        { f: semis(24), at: 0.3, len: 0.35 },
    ],
    lose: [
        { f: semis(7), at: 0, len: 0.2, type: "triangle" },
        { f: semis(3), at: 0.18, len: 0.2, type: "triangle" },
        { f: semis(0), at: 0.36, len: 0.45, type: "triangle", slide: -30 },
    ],
    nominate: [
        { f: semis(-5), at: 0, len: 0.5, type: "sawtooth", gain: 0.06 },
        { f: semis(-4), at: 0.45, len: 0.6, type: "sawtooth", gain: 0.06 },
    ],
    evict: [
        { f: semis(5), at: 0, len: 0.25, type: "triangle" },
        { f: semis(0), at: 0.22, len: 0.25, type: "triangle" },
        { f: semis(-7), at: 0.44, len: 0.7, type: "triangle", slide: -40 },
    ],
    vote: [{ f: semis(19), at: 0, len: 0.08, type: "sine", gain: 0.12 }],
    reveal: [
        { f: semis(7), at: 0, len: 0.15, type: "sine" },
        { f: semis(14), at: 0.12, len: 0.3, type: "sine" },
    ],
    power: [
        { f: semis(12), at: 0, len: 0.4, type: "sine", slide: 400 },
        { f: semis(24), at: 0.2, len: 0.4, type: "sine", gain: 0.06 },
    ],
    achievement: [
        { f: semis(19), at: 0, len: 0.1, type: "square", gain: 0.05 },
        { f: semis(24), at: 0.09, len: 0.25, type: "square", gain: 0.05 },
    ],
    fanfare: [
        { f: semis(7), at: 0, len: 0.15 },
        { f: semis(7), at: 0.15, len: 0.15 },
        { f: semis(7), at: 0.3, len: 0.15 },
        { f: semis(12), at: 0.45, len: 0.5 },
        { f: semis(10), at: 0.95, len: 0.15 },
        { f: semis(12), at: 1.1, len: 0.15 },
        { f: semis(16), at: 1.25, len: 0.8 },
    ],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
    if (ctx) return ctx;
    try {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor() as AudioContext;
        return ctx;
    } catch (e) {
        return null;
    }
}

export function play(cue: Cue) {
    if (muted$.value) return;
    const ac = audio();
    if (!ac) return;
    try {
        if (ac.state === "suspended") ac.resume();
        const now = ac.currentTime + 0.01;
        for (const n of CUES[cue]) {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = n.type || "triangle";
            osc.frequency.setValueAtTime(n.f, now + n.at);
            if (n.slide) osc.frequency.linearRampToValueAtTime(n.f + n.slide, now + n.at + n.len);
            const peak = n.gain ?? 0.09;
            gain.gain.setValueAtTime(0.0001, now + n.at);
            gain.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.len);
            osc.connect(gain).connect(ac.destination);
            osc.start(now + n.at);
            osc.stop(now + n.at + n.len + 0.05);
        }
    } catch (e) {
        // no sound is fine
    }
}
