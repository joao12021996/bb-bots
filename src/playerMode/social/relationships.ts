import { getById, getSocial, Houseguest, MutableGameState } from "../../model";

// Relationships in this game are mutual, so every change is applied in both directions.

function clamp(n: number): number {
    return Math.max(-1, Math.min(1, n));
}

export function setRelationship(gs: MutableGameState, a: number, b: number, value: number) {
    const v = clamp(value);
    getById(gs, a).relationships[b] = v;
    getById(gs, b).relationships[a] = v;
}

export function shiftRelationship(gs: MutableGameState, a: number, b: number, delta: number) {
    if (a === b) return;
    setRelationship(gs, a, b, getById(gs, a).relationships[b] + delta);
}

// 0.6 (social 1) to 1.5 (social 10)
export function socialFactor(hg: Houseguest | { social?: number }): number {
    return 0.5 + getSocial(hg) / 10;
}
