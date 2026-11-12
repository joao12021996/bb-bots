import React from "react";
import { BigButton, pressable, Subtle, Title, useElapsed } from "../ui/common";
import { Houseguest } from "../../model";
import { CompDefinition, CompProps, SimContext, SimResult } from "./compTypes";
import { gaussian, pick, Rand, seededRand } from "./random";

const N = 3;
const BLANK = N * N - 1;
const LIMIT = 240;

function neighbors(i: number): number[] {
    const r = Math.floor(i / N);
    const c = i % N;
    const result: number[] = [];
    if (r > 0) result.push(i - N);
    if (r < N - 1) result.push(i + N);
    if (c > 0) result.push(i - 1);
    if (c < N - 1) result.push(i + 1);
    return result;
}

// Shuffle by making random legal moves from the solved state, so the puzzle is always solvable.
function scrambled(rand: Rand): number[] {
    let board = Array.from({ length: N * N }, (_, i) => i);
    do {
        let blank = BLANK;
        let prev = -1;
        for (let k = 0; k < 80; k++) {
            const from = prev;
            const options = neighbors(blank).filter((n) => n !== from);
            const to = pick(rand, options);
            [board[blank], board[to]] = [board[to], board[blank]];
            prev = blank;
            blank = to;
        }
    } while (board.every((v, i) => v === i));
    return board;
}

const placed = (board: number[]) => board.filter((v, i) => v === i && v !== BLANK).length;

// The photo and the scramble, the same for every player and bot.
export function generateSlidePuzzle(rand: Rand, participants: Houseguest[]) {
    const image = pick(rand, participants).imageURL;
    return { image, board: scrambled(rand) };
}

// Fewest moves to solve a board (A* with Manhattan distance; 3x3 boards solve instantly).
export function minimumMoves(board: number[]): number {
    const manhattan = (b: number[]) =>
        b.reduce((sum, tile, i) => (tile === BLANK ? sum : sum + Math.abs(Math.floor(tile / N) - Math.floor(i / N)) + Math.abs((tile % N) - (i % N))), 0);
    const start = board.join(",");
    const goal = Array.from({ length: N * N }, (_, i) => i).join(",");
    const best = new Map<string, number>([[start, 0]]);
    let frontier: { b: number[]; g: number; f: number }[] = [{ b: board, g: 0, f: manhattan(board) }];
    while (frontier.length) {
        frontier.sort((x, y) => x.f - y.f);
        const { b, g } = frontier.shift()!;
        const key = b.join(",");
        if (key === goal) return g;
        if ((best.get(key) ?? Infinity) < g) continue;
        const blank = b.indexOf(BLANK);
        for (const n of neighbors(blank)) {
            const next = [...b];
            [next[blank], next[n]] = [next[n], next[blank]];
            const k = next.join(",");
            if ((best.get(k) ?? Infinity) <= g + 1) continue;
            best.set(k, g + 1);
            frontier.push({ b: next, g: g + 1, f: g + 1 + manhattan(next) });
        }
    }
    return 0;
}

function simulateSlidePuzzle(ctx: SimContext, skill: number, noise: Rand): SimResult {
    const { board } = generateSlidePuzzle(seededRand(ctx.seed), ctx.participants);
    // harder scrambles (more moves needed) take longer
    const moves = minimumMoves(board);
    const seconds = 5 + moves * (1 + (1 - skill) * 5) + 8 * gaussian(noise);
    if (seconds < LIMIT) return { score: 1000 + (LIMIT - Math.max(5, seconds)) };
    return { score: Math.round(2 + 5 * skill) * 10 };
}

function SlidePuzzle(props: CompProps) {
    const [initial] = React.useState(() => generateSlidePuzzle(props.rand, props.participants));
    const image = initial.image;
    const [board, setBoard] = React.useState(initial.board);
    const [showNumbers, setShowNumbers] = React.useState(true);
    const elapsed = useElapsed();

    React.useEffect(() => {
        props.report(placed(board) * 10);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [board]);

    const move = (i: number) => {
        const blank = board.indexOf(BLANK);
        if (!neighbors(blank).includes(i)) return;
        const next = [...board];
        [next[blank], next[i]] = [next[i], next[blank]];
        setBoard(next);
        if (next.every((v, idx) => v === idx)) {
            props.finish(1000 + Math.max(0, LIMIT - elapsed));
        }
    };

    const size = "min(84vw, 300px)";
    return (
        <div>
            <Title>Unscramble the photo</Title>
            <Subtle>
                Tap a tile next to the empty space to slide it. {placed(board)}/{N * N - 1} tiles in place.
            </Subtle>
            <div
                style={{
                    width: size,
                    height: size,
                    margin: "0 auto",
                    display: "grid",
                    gridTemplateColumns: `repeat(${N}, 1fr)`,
                    gap: 2,
                    background: "#222",
                    touchAction: "manipulation",
                }}
            >
                {board.map((tile, i) =>
                    tile === BLANK ? (
                        <div key={i} />
                    ) : (
                        <div
                            key={i}
                            onClick={() => move(i)}
                            {...pressable(() => move(i), `Tile ${tile + 1}`)}
                            style={{
                                backgroundImage: `url("${image}")`,
                                backgroundSize: `${N * 100}% ${N * 100}%`,
                                backgroundPosition: `${((tile % N) / (N - 1)) * 100}% ${
                                    (Math.floor(tile / N) / (N - 1)) * 100
                                }%`,
                                cursor: "pointer",
                                position: "relative",
                                borderRadius: 3,
                            }}
                        >
                            {showNumbers && (
                                <span
                                    style={{
                                        position: "absolute",
                                        top: 2,
                                        left: 4,
                                        fontWeight: 700,
                                        color: "white",
                                        textShadow: "0 0 3px black",
                                    }}
                                >
                                    {tile + 1}
                                </span>
                            )}
                        </div>
                    )
                )}
            </div>
            <div style={{ marginTop: 8 }}>
                <BigButton kind="light" onClick={() => setShowNumbers(!showNumbers)}>
                    {showNumbers ? "Hide numbers" : "Show numbers"}
                </BigButton>
            </div>
        </div>
    );
}

export const SlidePuzzleComp: CompDefinition = {
    id: "slide-puzzle",
    name: "Slide Puzzle",
    emoji: "🧩",
    kind: "skill",
    rules: `A houseguest's photo is cut into tiles and scrambled. Slide the tiles back into order (1 to 8, left to right, top to bottom). Fastest solve wins. If nobody solves it in ${
        LIMIT / 60
    } minutes, whoever has the most tiles in place wins.`,
    maxSeconds: LIMIT,
    Component: SlidePuzzle,
    simulate: simulateSlidePuzzle,
    botScore: (p) => {
        const t = 20 + 260 * Math.pow(1 - p, 1.3);
        return t < LIMIT ? 1000 + (LIMIT - t) : Math.round(2 + 5 * p) * 10;
    },
    format: (s) => (s >= 1000 ? `solved in ${Math.round(LIMIT - (s - 1000))}s` : `${s / 10} tiles placed`),
};
