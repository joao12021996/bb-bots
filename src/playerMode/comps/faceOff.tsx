import React from "react";
import { Face, Grid, Subtle, Title } from "../ui/common";
import { Houseguest } from "../../model";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { chance, gaussian, pick, Rand, sample, seededRand } from "./random";

const GRID_SIZE = 9;

const SECONDS = 45;

// One round: a grid of faces and the one to find. Rounds come from the comp's seed in order,
// so round N is the same for everyone.
export function nextFaceOffRound(rand: Rand, pool: Houseguest[]) {
    const faces = sample(rand, pool, GRID_SIZE);
    const target = pick(rand, faces);
    return { faces, target };
}

function simulateFaceOff(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const rand = seededRand(ctx.seed);
    const pool = ctx.gameState.houseguests;
    let time = 0;
    let score = 0;
    while (true) {
        const round = nextFaceOffRound(rand, pool);
        // bigger grids take a little longer to scan
        time += Math.max(0.35, 0.6 + (1 - skill) * 1.6 + 0.25 * gaussian(noise)) * (round.faces.length / GRID_SIZE + 0.5) / 1.5;
        if (time > SECONDS) break;
        score += chance(noise, 0.8 + 0.18 * skill) ? 1 : -1;
    }
    return { score };
}

function FaceOff(props: CompProps) {
    const pool = props.gameState.houseguests;
    const { rand } = props;
    const newRound = React.useCallback(() => nextFaceOffRound(rand, pool), [pool, rand]);
    const [round, setRound] = React.useState(newRound);
    const [hits, setHits] = React.useState(0);
    const [misses, setMisses] = React.useState(0);
    const [flash, setFlash] = React.useState<"hit" | "miss" | null>(null);

    const tap = (id: number) => {
        const hit = id === round.target.id;
        const h = hits + (hit ? 1 : 0);
        const m = misses + (hit ? 0 : 1);
        setHits(h);
        setMisses(m);
        setFlash(hit ? "hit" : "miss");
        props.report(h - m);
        setRound(newRound());
    };

    return (
        <div>
            <Title>
                Find <span style={{ color: "#f5c542" }}>{round.target.name}</span>
            </Title>
            <Subtle>
                ✅ {hits} &nbsp; ❌ {misses} &nbsp;
                {flash === "hit" ? "Nice!" : flash === "miss" ? "Wrong!" : ""}
            </Subtle>
            <Grid style={{ maxWidth: 320, margin: "0 auto" }}>
                {round.faces.map((hg) => (
                    <Face key={hg.id} hg={hg} hideName onClick={() => tap(hg.id)} />
                ))}
            </Grid>
        </div>
    );
}

export const FaceOffComp: CompDefinition = {
    id: "face-off",
    name: "Face Off",
    emoji: "🎯",
    kind: "reflex",
    rules:
        "A name appears above a grid of faces. Tap that houseguest's face as fast as you can. +1 for every right face, −1 for every wrong one. You have 45 seconds.",
    maxSeconds: SECONDS,
    Component: FaceOff,
    simulate: simulateFaceOff,
    botScore: (p) => Math.round(6 + 38 * p),
    format: (s) => `${s} points`,
};
