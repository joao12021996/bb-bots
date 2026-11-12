import React from "react";
import { Achievement, ACHIEVEMENTS, ordinal, SeasonSummary } from "./career";
import { APP_NAME, SHOW_NAME } from "../playerMode/terms";

export function placementText(s: SeasonSummary): string {
    if (s.won) return `Winner of ${SHOW_NAME}`;
    if (s.placement === 2) return "Runner-up";
    return `${ordinal(s.placement)} of ${s.castSize}`;
}

function statLine(s: SeasonSummary): string[] {
    const lines = [`👑 ${s.hohWins} HoH`, `🛡️ ${s.vetoWins} Veto`, `🎯 ${s.nominated}× on the block`];
    if (s.juryVotesTotal > 0) lines.push(`🔑 ${s.juryVotesFor} of ${s.juryVotesTotal} jury votes`);
    return lines;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (ctx.measureText(next).width > maxWidth && line) {
            lines.push(line);
            line = w;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}

// The season, drawn as a picture to share: 1080 × 1350 (a phone-friendly portrait).
export async function drawSeasonCard(s: SeasonSummary, unlocked: Achievement[]): Promise<Blob | null> {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1e1b4b");
    bg.addColorStop(0.55, "#0c0a1a");
    bg.addColorStop(1, "#3b0a2a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#c4b5fd";
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillText(`👁️ ${APP_NAME.toUpperCase()}`, W / 2, 90);

    // the avatar, in a ring
    const img = s.imageURL ? await loadImage(s.imageURL) : null;
    const cx = W / 2;
    const cy = 360;
    const r = 190;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
    ctx.fillStyle = s.won ? "#fbbf24" : "#8b5cf6";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#201c3b";
    ctx.fill();
    ctx.clip();
    if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 84px Outfit, Inter, system-ui, sans-serif";
    ctx.fillText(s.name, W / 2, 660);
    ctx.fillStyle = s.won ? "#fbbf24" : "#f9a8d4";
    ctx.font = "800 54px Outfit, Inter, system-ui, sans-serif";
    ctx.fillText((s.won ? "🏆 " : "") + placementText(s), W / 2, 740);

    ctx.fillStyle = "#e5e7eb";
    ctx.font = "600 38px Inter, system-ui, sans-serif";
    const stats = statLine(s);
    ctx.fillText(stats.slice(0, 2).join("   "), W / 2, 840);
    ctx.fillText(stats.slice(2).join("   "), W / 2, 895);

    if (s.highlight) {
        ctx.fillStyle = "#a9a3c7";
        ctx.font = "italic 500 34px Inter, system-ui, sans-serif";
        wrap(ctx, `“${s.highlight}”`, W - 200)
            .slice(0, 2)
            .forEach((line, i) => ctx.fillText(line, W / 2, 985 + i * 46));
    }

    if (unlocked.length > 0) {
        ctx.fillStyle = "#fde68a";
        ctx.font = "700 34px Inter, system-ui, sans-serif";
        ctx.fillText("Achievements unlocked", W / 2, 1120);
        ctx.font = "600 34px Inter, system-ui, sans-serif";
        ctx.fillText(unlocked.slice(0, 5).map((a) => `${a.emoji} ${a.title}`).join("  ·  "), W / 2, 1172, W - 100);
    }

    ctx.fillStyle = "#6b6490";
    ctx.font = "500 28px Inter, system-ui, sans-serif";
    ctx.fillText(`${s.castSize} houseguests · ${s.difficulty} · ${new Date(s.when).toLocaleDateString()}`, W / 2, H - 60);

    return new Promise((resolve) => {
        try {
            canvas.toBlob((b) => resolve(b), "image/png");
        } catch (e) {
            resolve(null); // a photo from elsewhere can't be drawn into a shareable picture
        }
    });
}

export async function shareSeason(s: SeasonSummary, unlocked: Achievement[]): Promise<"shared" | "saved" | "failed"> {
    const blob = await drawSeasonCard(s, unlocked);
    if (!blob) return "failed";
    const file = new File([blob], `${s.name.replace(/[^a-z0-9]+/gi, "-")}-season.png`, { type: "image/png" });
    const text = `${s.name}: ${placementText(s)} in ${APP_NAME}!`;
    const nav = navigator as any;
    try {
        if (nav.canShare && nav.canShare({ files: [file] })) {
            await nav.share({ files: [file], text, title: APP_NAME });
            return "shared";
        }
    } catch (e) {
        // cancelled, or not allowed: save it instead
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return "saved";
}

// A finished season, on screen: the card, its achievements, and a share button.
export function SeasonCard(props: { summary: SeasonSummary; unlocked: Achievement[] }) {
    const { summary: s, unlocked } = props;
    const [status, setStatus] = React.useState<string | null>(null);
    return (
        <div className={"bbb-season-card" + (s.won ? " is-winner" : "")}>
            {s.imageURL && <img src={s.imageURL} alt="" />}
            <div className="bbb-season-card-body">
                <div className="bbb-season-card-name">{s.name}</div>
                <div className="bbb-season-card-place">
                    {s.won ? "🏆 " : ""}
                    {placementText(s)}
                </div>
                <div className="bbb-season-card-stats">{statLine(s).join(" · ")}</div>
                {s.highlight && <div className="bbb-season-card-quote">“{s.highlight}”</div>}
                {unlocked.length > 0 && (
                    <div className="bbb-season-card-ach">
                        <b>🏅 Unlocked:</b>{" "}
                        {unlocked.map((a) => (
                            <span key={a.id} className="bbb-chip" title={a.how}>
                                {a.emoji} {a.title}
                            </span>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className="button is-warning is-small"
                    onClick={async () => {
                        setStatus("…");
                        const r = await shareSeason(s, unlocked);
                        setStatus(r === "shared" ? "Shared!" : r === "saved" ? "Saved the picture." : "Couldn't make the picture (a photo from another site can't be drawn).");
                    }}
                >
                    📤 Share my season
                </button>
                {status && <span className="bbb-subtle"> {status}</span>}
            </div>
        </div>
    );
}

export function achievementsById(ids: string[]): Achievement[] {
    return ACHIEVEMENTS.filter((a) => ids.includes(a.id));
}
