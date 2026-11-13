import React from "react";
import { Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { clamp, gaussian, Rand } from "./random";

// ---------------- Packing Day ----------------
// Moving boxes come down the chute into the truck, one at a time. Slide and turn each one so they pack tight:
// a row packed wall to wall is loaded away. Rows loaded is the score. Everyone gets the same boxes in the same
// order. Hard on a phone, easier with a keyboard.

export const PACK_W = 8;
export const PACK_H = 15;
const PACK_SECONDS = 180;

type Cells = [number, number][]; // [row, col]

// the box shapes, each a few cells, and the colour of the tape they're wrapped in
const SHAPES: { cells: Cells; color: string }[] = [
    { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: "#38bdf8" },
    { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: "#facc15" },
    { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: "#a78bfa" },
    { cells: [[0, 0], [1, 0], [1, 1], [1, 2]], color: "#60a5fa" },
    { cells: [[0, 2], [1, 0], [1, 1], [1, 2]], color: "#fb923c" },
    { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: "#4ade80" },
    { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: "#f87171" },
];

// The order the boxes come in: drawn from bags of all seven, so nobody waits forever for a long one.
// Same seed, same boxes.
export function packingOrder(rand: Rand, count: number): number[] {
    const order: number[] = [];
    while (order.length < count) {
        const bag = [0, 1, 2, 3, 4, 5, 6];
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        order.push(...bag);
    }
    return order.slice(0, count);
}

interface Piece {
    shape: number;
    cells: Cells; // relative to (row, col)
    row: number;
    col: number;
}

function rotate(cells: Cells): Cells {
    // clockwise, then back into the top-left corner
    const turned = cells.map(([r, c]) => [c, -r] as [number, number]);
    const minR = Math.min(...turned.map((x) => x[0]));
    const minC = Math.min(...turned.map((x) => x[1]));
    return turned.map(([r, c]) => [r - minR, c - minC] as [number, number]);
}

function fits(grid: (number | null)[][], cells: Cells, row: number, col: number): boolean {
    return cells.every(([r, c]) => {
        const y = row + r;
        const x = col + c;
        return x >= 0 && x < PACK_W && y < PACK_H && (y < 0 || grid[y][x] === null);
    });
}

function spawn(shape: number): Piece {
    const cells = SHAPES[shape].cells;
    const width = Math.max(...cells.map((x) => x[1])) + 1;
    return { shape, cells, row: 0, col: Math.floor((PACK_W - width) / 2) };
}

const emptyGrid = () => Array.from({ length: PACK_H }, () => Array<number | null>(PACK_W).fill(null));

interface Truck {
    grid: (number | null)[][];
    piece: Piece;
    next: number; // index into the order
    rows: number;
    over: boolean;
}

// Locks the piece where it is, loads full rows away and brings the next box. Pure, so it can be tested.
export function settle(t: Truck, order: number[]): Truck {
    const grid = t.grid.map((row) => [...row]);
    t.piece.cells.forEach(([r, c]) => {
        const y = t.piece.row + r;
        if (y >= 0) grid[y][t.piece.col + c] = t.piece.shape;
    });
    const kept = grid.filter((row) => row.some((v) => v === null));
    const loaded = PACK_H - kept.length;
    const packed = [...Array.from({ length: loaded }, () => Array<number | null>(PACK_W).fill(null)), ...kept];
    const piece = spawn(order[t.next % order.length]);
    const over = !fits(packed, piece.cells, piece.row, piece.col);
    return { grid: packed, piece, next: t.next + 1, rows: t.rows + loaded, over };
}

export function newTruck(order: number[]): Truck {
    return { grid: emptyGrid(), piece: spawn(order[0]), next: 1, rows: 0, over: false };
}

// how long a box takes to drop one row: quicker as the truck fills up with loaded rows
const dropMs = (rows: number) => Math.max(140, 750 - rows * 30);

function PackingDay(props: CompProps) {
    const [order] = React.useState(() => packingOrder(props.rand, 700));
    const truck = React.useRef<Truck>(newTruck(order));
    const [, setFrame] = React.useState(0);
    const redraw = () => setFrame((n) => n + 1);
    const done = React.useRef(false);

    const update = (t: Truck) => {
        if (done.current) return;
        const before = truck.current.rows;
        truck.current = t;
        if (t.rows !== before) props.report(t.rows);
        if (t.over) {
            done.current = true;
            props.finish(t.rows);
        }
        redraw();
    };

    const move = (dc: number, dr: number): boolean => {
        const t = truck.current;
        const p = t.piece;
        if (!fits(t.grid, p.cells, p.row + dr, p.col + dc)) return false;
        update({ ...t, piece: { ...p, row: p.row + dr, col: p.col + dc } });
        return true;
    };
    const fall = () => {
        if (!move(0, 1)) update(settle(truck.current, order));
    };
    const drop = () => {
        const t = truck.current;
        let row = t.piece.row;
        while (fits(t.grid, t.piece.cells, row + 1, t.piece.col)) row++;
        update(settle({ ...t, piece: { ...t.piece, row } }, order));
    };
    const turn = () => {
        const t = truck.current;
        const cells = rotate(t.piece.cells);
        // nudge it off a wall or a box if it doesn't fit where it is
        for (const dc of [0, -1, 1, -2, 2]) {
            if (fits(t.grid, cells, t.piece.row, t.piece.col + dc)) {
                return update({ ...t, piece: { ...t.piece, cells, col: t.piece.col + dc } });
            }
        }
    };
    const actions = React.useRef({ move, fall, drop, turn });
    actions.current = { move, fall, drop, turn };

    const rows = truck.current.rows;
    React.useEffect(() => {
        const timer = window.setInterval(() => actions.current.fall(), dropMs(rows));
        return () => window.clearInterval(timer);
    }, [rows]);

    React.useEffect(() => {
        props.report(0);
        const key = (e: KeyboardEvent) => {
            const a = actions.current;
            const handled: { [k: string]: () => void } = {
                ArrowLeft: () => a.move(-1, 0),
                ArrowRight: () => a.move(1, 0),
                ArrowDown: () => a.fall(),
                ArrowUp: () => a.turn(),
                " ": () => a.drop(),
            };
            if (!handled[e.key]) return;
            e.preventDefault();
            handled[e.key]();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const t = truck.current;
    // where the box would land, shown faintly
    let ghost = t.piece.row;
    while (fits(t.grid, t.piece.cells, ghost + 1, t.piece.col)) ghost++;
    const at = (r: number, c: number): { shape: number; ghost?: boolean } | null => {
        if (t.grid[r][c] !== null) return { shape: t.grid[r][c]! };
        if (t.piece.cells.some(([pr, pc]) => t.piece.row + pr === r && t.piece.col + pc === c)) return { shape: t.piece.shape };
        if (t.piece.cells.some(([pr, pc]) => ghost + pr === r && t.piece.col + pc === c)) return { shape: t.piece.shape, ghost: true };
        return null;
    };
    const nextShape = SHAPES[order[t.next % order.length]];

    const button = (label: string, aria: string, onPress: () => void) => (
        <button
            type="button"
            className="button bbb-pack-key"
            aria-label={aria}
            onClick={onPress}
        >
            {label}
        </button>
    );

    return (
        <div className="bbb-pack">
            <Title>
                {t.rows} {t.rows === 1 ? "row" : "rows"} loaded
            </Title>
            <Subtle>Pack each row wall to wall to load it. Arrow keys: ← → slide, ↑ turn, ↓ faster, space drops it.</Subtle>
            <div className="bbb-pack-play">
                <div className="bbb-pack-truck" style={{ gridTemplateColumns: `repeat(${PACK_W}, 1fr)` }} aria-label="The truck">
                    {Array.from({ length: PACK_H }, (_, r) =>
                        Array.from({ length: PACK_W }, (_, c) => {
                            const cell = at(r, c);
                            return (
                                <div
                                    key={`${r}-${c}`}
                                    className={cell ? (cell.ghost ? "bbb-pack-box is-ghost" : "bbb-pack-box") : "bbb-pack-space"}
                                    style={cell ? ({ "--tape": SHAPES[cell.shape].color } as React.CSSProperties) : undefined}
                                />
                            );
                        })
                    )}
                </div>
                <div className="bbb-pack-side">
                    <small className="bbb-subtle">Next</small>
                    <div className="bbb-pack-next">
                        {[0, 1].map((r) =>
                            [0, 1, 2, 3].map((c) => (
                                <div
                                    key={`${r}-${c}`}
                                    className={nextShape.cells.some(([nr, nc]) => nr === r && nc === c) ? "bbb-pack-box" : "bbb-pack-space"}
                                    style={{ "--tape": nextShape.color } as React.CSSProperties}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>
            <div className="bbb-pack-keys">
                {button("◀", "Slide left", () => actions.current.move(-1, 0))}
                {button("⟳", "Turn", () => actions.current.turn())}
                {button("▶", "Slide right", () => actions.current.move(1, 0))}
                {button("▼", "Faster", () => actions.current.fall())}
                {button("⤓", "Drop", () => actions.current.drop())}
            </div>
        </div>
    );
}

// Bots: how many rows they'd load. A strong bot packs like someone on a keyboard, a weak one like a first try on
// a phone.
function simulatePackingDay(_ctx: SimContext, skill: number, noise: Rand): SimResult {
    return { score: Math.round(clamp(2 + 26 * Math.pow(skill, 1.3) + 3 * gaussian(noise), 0, 60)) };
}

export const PackingDayComp: CompDefinition = {
    id: "packing-day",
    name: "Packing Day",
    emoji: "📦",
    kind: "skill",
    rules: `Moving boxes drop into the truck one at a time. Slide and turn each one so they pack tight: every row packed wall to wall is loaded away, and the boxes come faster as you go. Most rows loaded in ${
        PACK_SECONDS / 60
    } minutes wins. If the boxes pile up to the top, you're done. Everyone gets the same boxes in the same order. On a computer, the arrow keys and space bar make it much easier.`,
    maxSeconds: PACK_SECONDS,
    Component: PackingDay,
    simulate: simulatePackingDay,
    botScore: (p) => Math.round(2 + 26 * Math.pow(p, 1.3)),
    format: (s) => `${s} ${s === 1 ? "row" : "rows"}`,
};
