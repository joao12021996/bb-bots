import { Houseguest } from "../../model";
import { perceivedComp, perceivedSocial } from "./perception";

// Pitching a target comes with a reason. A reason that rings true to the listener makes the pitch land;
// one that doesn't (calling someone who never wins a comp threat) makes it fall flat.

export type PitchReason = "comps" | "social" | "relationship" | "personal";

export const PITCH_REASONS: { id: PitchReason; label: string }[] = [
    { id: "comps", label: "🏆 Comp threat" },
    { id: "social", label: "🗣️ Great social game" },
    { id: "relationship", label: "💢 They're coming for you" },
    { id: "personal", label: "🙏 They're coming for me" },
];

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// How true the reason rings to the listener, from -1 (nonsense) to 1 (obviously right). It's the listener's
// view of the target that counts: two houseguests can see the same player's game very differently.
export function reasonFit(listener: Houseguest, target: Houseguest, pitcher: Houseguest, reason: PitchReason): number {
    switch (reason) {
        case "comps":
            // comp wins count for more than reputation
            return clamp((perceivedComp(listener, target) + 1.5 * (target.hohWins + target.povWins) - 5.5) / 4.5, -1, 1);
        case "social":
            return clamp((perceivedSocial(listener, target) - 5.5) / 4.5, -1, 1);
        case "relationship":
            // only works if the listener and the target really don't get along
            return clamp(-(listener.relationships[target.id] ?? 0) * 1.5, -1, 1);
        case "personal":
            // a favor: only friends will take a shot for you
            return clamp((listener.relationships[pitcher.id] ?? 0) * 1.5 - 0.3, -1, 1);
    }
}

// How much a reason moves the odds of convincing the listener.
export function reasonBonus(listener: Houseguest, target: Houseguest, pitcher: Houseguest, reason?: PitchReason): number {
    return reason ? 0.25 * reasonFit(listener, target, pitcher, reason) : 0;
}

// The reason a bot gives when it pitches a target: whichever argument is strongest.
export function bestReason(listener: Houseguest, target: Houseguest, pitcher: Houseguest): PitchReason {
    return PITCH_REASONS.map((r) => r.id).reduce((best, r) =>
        reasonFit(listener, target, pitcher, r) > reasonFit(listener, target, pitcher, best) ? r : best
    );
}

// What the pitcher says.
export function reasonLine(reason: PitchReason | undefined, target: string): string {
    switch (reason) {
        case "comps":
            return `${target} is a comp beast. If nobody takes the shot now, ${target} wins their way to the end.`;
        case "social":
            return `Everybody loves ${target}. Nobody beats ${target} in the final 2.`;
        case "relationship":
            return `${target} doesn't like you, and will come after you the first chance they get.`;
        case "personal":
            return `${target} is coming after me, and I need you on my side.`;
        default:
            return `${target} has to go.`;
    }
}

export function convincedText(reason: PitchReason | undefined, listener: string, target: string): string {
    switch (reason) {
        case "comps":
            return `${listener} agrees: ${target} is too good at comps to keep around.`;
        case "social":
            return `${listener} agrees: ${target}'s social game is a problem.`;
        case "relationship":
            return `${listener} believes ${target} is coming for them.`;
        case "personal":
            return `${listener} has your back against ${target}.`;
        default:
            return `${listener} is starting to see ${target} as a threat.`;
    }
}

// `fit` is how true the reason rang (see reasonFit).
export function unconvincedText(reason: PitchReason | undefined, fit: number, listener: string, target: string): string {
    if (reason && fit < -0.2) {
        switch (reason) {
            case "comps":
                return `${listener} laughed: "${target}? ${target} can't win a thing."`;
            case "social":
                return `${listener} doesn't think ${target}'s social game is anything to worry about.`;
            case "relationship":
                return `${listener} gets along fine with ${target} and didn't buy it.`;
            case "personal":
                return `${listener} isn't going to take a shot at ${target} just for you.`;
        }
    }
    return `${listener} didn't seem convinced about ${target}.`;
}
