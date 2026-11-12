import React from "react";
import styled from "styled-components";
import { ColorTheme } from "../../theme/theme";

// Shared building blocks for player mode screens. Everything is tap-friendly and fits a 400px-wide phone.

export const Panel = styled.div`
    color: ${({ theme }: { theme: ColorTheme }) => theme.text};
    max-width: 760px;
    margin: 0 auto;
    padding: 0 4px 24px;
    text-align: center;
`;

export const Title = styled.h3`
    font-size: 1.5rem;
    font-weight: 800;
    margin: 10px 0 4px;
`;

export const Subtle = styled.p`
    color: #a9a3c7;
    margin: 4px auto 12px;
    max-width: 600px;
`;

export const Grid = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin: 10px 0;
`;

const FaceCard = styled.button<{ selected?: boolean; dim?: boolean; small?: boolean }>`
    background: ${({ selected }: { selected?: boolean }) =>
        selected ? "linear-gradient(160deg, rgba(139,92,246,0.45), rgba(236,72,153,0.3))" : "rgba(255,255,255,0.05)"};
    color: ${({ theme }: { theme: ColorTheme }) => theme.text};
    border: 2px solid ${({ selected }: { selected?: boolean }) => (selected ? "#c4b5fd" : "rgba(255,255,255,0.08)")};
    box-shadow: ${({ selected }: { selected?: boolean }) => (selected ? "0 0 18px rgba(139,92,246,0.55)" : "none")};
    border-radius: 14px;
    padding: 6px;
    width: ${({ small }: { small?: boolean }) => (small ? "72px" : "100px")};
    cursor: pointer;
    opacity: ${({ dim }: { dim?: boolean }) => (dim ? 0.4 : 1)};
    touch-action: manipulation;
    font: inherit;
    transition: transform 100ms ease, border-color 120ms ease, background 120ms ease;
    &:hover:not(:disabled) {
        transform: translateY(-2px);
        border-color: rgba(196, 181, 253, 0.6);
    }
    &:disabled {
        cursor: default;
    }
`;

const FaceImg = styled.img<{ small?: boolean }>`
    width: ${({ small }: { small?: boolean }) => (small ? "56px" : "84px")};
    height: ${({ small }: { small?: boolean }) => (small ? "56px" : "84px")};
    object-fit: cover;
    border-radius: 10px;
    display: block;
    margin: 0 auto;
    pointer-events: none;
`;

const FaceName = styled.div`
    font-size: 0.8rem;
    font-weight: 700;
    word-break: break-word;
    line-height: 1.15;
    margin-top: 4px;
`;

export function Face(props: {
    hg: { name: string; imageURL: string };
    onClick?: () => void;
    selected?: boolean;
    dim?: boolean;
    caption?: React.ReactNode;
    hideName?: boolean;
    disabled?: boolean;
    small?: boolean;
}) {
    return (
        <FaceCard
            type="button"
            onClick={props.onClick}
            selected={props.selected}
            dim={props.dim}
            small={props.small}
            disabled={props.disabled || !props.onClick}
        >
            <FaceImg src={props.hg.imageURL} alt={props.hg.name} small={props.small} />
            {!props.hideName && <FaceName>{props.hg.name}</FaceName>}
            {props.caption && <div style={{ fontSize: "0.72rem", color: "#c9c3e6", marginTop: 2 }}>{props.caption}</div>}
        </FaceCard>
    );
}

export function BigButton(props: {
    onClick: () => void;
    children: React.ReactNode;
    kind?: "primary" | "success" | "danger" | "warning" | "info" | "light";
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            className={`button is-medium is-${props.kind || "primary"}`}
            style={{ margin: 5, minWidth: 130, touchAction: "manipulation" }}
            onClick={props.onClick}
            disabled={props.disabled}
        >
            {props.children}
        </button>
    );
}

export function formatSeconds(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

// Elapsed seconds since the component mounted, updated a few times a second.
export function useElapsed(running: boolean = true): number {
    const [start] = React.useState(() => Date.now());
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        if (!running) return;
        const t = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(t);
    }, [running]);
    return (now - start) / 1000;
}

// Online, a move made on a guest's device takes effect once the host has put it in order, so what the
// controller gives back can be a promise: runs `then` with the result either way.
export function whenDone<T>(value: T | Promise<T>, then: (result: T) => void) {
    if (value && typeof (value as any).then === "function") (value as Promise<T>).then(then);
    else then(value as T);
}
