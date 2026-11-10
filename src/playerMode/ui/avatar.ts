import { hashcode } from "../../utils";

// A colorful initials avatar for players who join under their own name (no photo needed).
// Returned as a data URL so it survives saves and reloads.
export function initialsAvatar(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.trim().slice(0, 2))
        .toUpperCase()
        .replace(/[<>&"]/g, "");
    const hue = Math.abs(hashcode(name)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},75%,58%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},70%,38%)"/>
</linearGradient></defs>
<rect width="160" height="160" fill="url(#g)"/>
<text x="80" y="80" dy=".35em" text-anchor="middle" font-family="Outfit, Inter, Arial, sans-serif" font-size="64" font-weight="800" fill="#fff">${initials}</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
