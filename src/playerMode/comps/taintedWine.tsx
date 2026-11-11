import React from "react";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { clamp, gaussian, Rand, randInt, seededRand, shuffled } from "./random";

// Tainted Wine: one bottle in the cellar is tainted. Pour any bottles into the test glass and the test says
// whether the tainted one is in the mix. Find it in as few tests as possible: splitting the suspects in half
// every time is the best you can do. Fewest tests wins; time breaks ties.

const CELLARS = [10, 14, 20]; // bottles in each cellar

// score = -(tests * 1000 + seconds): fewer tests always beats a faster time
function toScore(tests: number, seconds: number): number {
    return -(tests * 1000 + Math.min(999, Math.round(seconds)));
}

function taintedBottles(rand: Rand): number[] {
    return CELLARS.map((n) => randInt(rand, 0, n - 1));
}

function TaintedWine(props: CompProps) {
    const [tainted] = React.useState(() => taintedBottles(props.rand));
    const [cellar, setCellar] = React.useState(0);
    const [suspects, setSuspects] = React.useState<number[]>(() => Array.from({ length: CELLARS[0] }, (_, i) => i));
    const [glass, setGlass] = React.useState<number[]>([]);
    const [tests, setTests] = React.useState(0);
    const [message, setMessage] = React.useState("Tap bottles to pour them into the test glass.");
    const [found, setFound] = React.useState<number | null>(null);
    const [start] = React.useState(() => Date.now());
    const seconds = () => (Date.now() - start) / 1000;
    const { report, finish } = props;

    React.useEffect(() => {
        // if time runs out now, the cellars left count as badly played
        const left = CELLARS.slice(cellar).reduce((sum, n) => sum + Math.ceil(Math.log2(n)) + 2, 0);
        report(toScore(tests + left, 999));
    }, [tests, cellar, report]);

    const toggle = (i: number) => {
        if (found !== null || !suspects.includes(i)) return;
        setGlass(glass.includes(i) ? glass.filter((g) => g !== i) : [...glass, i]);
    };

    const nextCellar = (total: number) => {
        if (cellar + 1 >= CELLARS.length) return finish(toScore(total, seconds()));
        setCellar(cellar + 1);
        setSuspects(Array.from({ length: CELLARS[cellar + 1] }, (_, i) => i));
        setGlass([]);
        setFound(null);
        setMessage("New cellar, more bottles. Tap bottles to pour them into the test glass.");
    };

    const test = () => {
        if (glass.length === 0 || glass.length >= suspects.length) return;
        const total = tests + 1;
        setTests(total);
        const inGlass = glass.includes(tainted[cellar]);
        const left = suspects.filter((s) => glass.includes(s) === inGlass);
        setSuspects(left);
        setGlass([]);
        if (left.length === 1) {
            setFound(left[0]);
            setMessage(`☠️ Bottle ${left[0] + 1} is the tainted one!`);
            setTimeout(() => nextCellar(total), 900);
        } else {
            setMessage(
                inGlass
                    ? `☠️ Tainted! It's one of the ${left.length} bottles you poured.`
                    : `✅ Clean. It's one of the ${left.length} bottles you didn't pour.`
            );
        }
    };

    return (
        <div>
            <Title>
                Cellar {cellar + 1} of {CELLARS.length} · {tests} test{tests === 1 ? "" : "s"}
            </Title>
            <Subtle>{message}</Subtle>
            <div className="bbb-wine-rack">
                {Array.from({ length: CELLARS[cellar] }, (_, i) => {
                    const out = !suspects.includes(i);
                    const cls = found === i ? "is-tainted" : out ? "is-out" : glass.includes(i) ? "is-poured" : "";
                    return (
                        <button type="button" key={i} className={`bbb-wine ${cls}`} disabled={out || found !== null} onClick={() => toggle(i)}>
                            <span>{found === i ? "☠️" : "🍷"}</span>
                            {i + 1}
                        </button>
                    );
                })}
            </div>
            <BigButton kind="danger" disabled={found !== null || glass.length === 0 || glass.length >= suspects.length} onClick={test}>
                🧪 Test the glass ({glass.length} poured)
            </BigButton>
            <Subtle>{suspects.length} suspects left. You can't pour all of them: that would tell you nothing.</Subtle>
        </div>
    );
}

function simulateTaintedWine(ctx: SimContext, skill: number, noise: Rand): SimResult {
    // the same tainted bottles; sharp bots split the suspects in half, sloppy ones pour too many or too few
    const tainted = taintedBottles(seededRand(ctx.seed));
    let tests = 0;
    CELLARS.forEach((n, c) => {
        let suspects = Array.from({ length: n }, (_, i) => i);
        while (suspects.length > 1) {
            tests++;
            const half = suspects.length / 2;
            const size = clamp(Math.round(half + gaussian(noise) * (1 - skill) * half * 0.8), 1, suspects.length - 1);
            const glass = shuffled(noise, suspects).slice(0, size);
            const inGlass = glass.includes(tainted[c]);
            suspects = suspects.filter((s) => glass.includes(s) === inGlass);
        }
    });
    const seconds = tests * (4 + (1 - skill) * 7) + 10 * noise();
    return { score: toScore(tests, seconds) };
}

export const TaintedWineComp: CompDefinition = {
    id: "tainted-wine",
    name: "Tainted Wine",
    emoji: "🍷",
    kind: "skill",
    rules:
        "One bottle in each cellar is tainted. Pour as many bottles as you like into the test glass: the test tells you whether " +
        "the tainted bottle is in the mix. Find the tainted bottle in all 3 cellars. Fewest tests wins; time breaks ties.",
    maxSeconds: 240,
    Component: TaintedWine,
    simulate: simulateTaintedWine,
    botScore: (p) => toScore(Math.round(12 + (1 - p) * 9), 60 + (1 - p) * 120),
    format: (s) => `${Math.floor(-s / 1000)} tests, ${Math.round(-s % 1000)}s`,
};
