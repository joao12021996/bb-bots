import React from "react";
import { Face, Grid, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps } from "./compTypes";
import { pick, sample } from "./random";

const GRID_SIZE = 9;

function FaceOff(props: CompProps) {
    const pool = props.gameState.houseguests;
    const newRound = React.useCallback(() => {
        const faces = sample(props.rand, pool, GRID_SIZE);
        const target = pick(props.rand, faces);
        return { faces, target };
    }, [pool, props.rand]);
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
    maxSeconds: 45,
    Component: FaceOff,
    botScore: (p) => Math.round(6 + 38 * p),
    format: (s) => `${s} points`,
};
