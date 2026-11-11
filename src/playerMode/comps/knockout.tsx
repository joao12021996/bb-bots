import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "../ui/common";

// Knockout: two houseguests duel on a closest-number question. The loser is out of the comp, and the winner
// picks the next two to face off, so everyone sees who the winner is gunning for. Last one standing wins.

export const KNOCKOUT_ID = "knockout";

export const KNOCKOUT_RULES =
    "Knockout! Two houseguests duel on one closest-number question. The loser is out, and the winner picks the next two to face off. " +
    "Choose carefully: the whole house sees who you send into a duel. The last one standing wins.";

// What has happened since the last time the players looked: the duels, who's out, and who's still in.
export function KnockoutBoard(props: {
    title: string;
    lines: string[];
    remaining: Houseguest[];
    out: Houseguest[];
    winner?: Houseguest;
    youWon?: boolean;
    emoji?: string; // other last-one-standing comps (Tainted Wine) reuse this board
    name?: string;
    captions?: { [id: number]: string }; // a caption under each houseguest still in, instead of "still in"
    onDone: () => void;
}) {
    return (
        <Panel>
            <div className="bbb-comp-header">
                <div className="bbb-comp-emoji">{props.emoji || "⚔️"}</div>
                <Title>{props.name || "Knockout"}</Title>
                <Subtle>{props.title}</Subtle>
            </div>
            {props.winner && (
                <div className="bbb-winner">
                    <img src={props.winner.imageURL} alt="" />
                    <div>
                        <div className="bbb-winner-label">🏆 Winner</div>
                        <div className="bbb-winner-name">
                            {props.winner.name}
                            {props.youWon ? " (you!)" : ""}
                        </div>
                    </div>
                </div>
            )}
            <div className="bbb-log">
                {props.lines.map((line, i) => (
                    <p key={i}>{line}</p>
                ))}
            </div>
            <Grid>
                {props.remaining.map((hg) => (
                    <Face key={hg.id} hg={hg} small={true} caption={(props.captions && props.captions[hg.id]) || "still in"} />
                ))}
                {props.out.map((hg) => (
                    <Face key={hg.id} hg={hg} small={true} dim={true} caption="out" />
                ))}
            </Grid>
            <BigButton onClick={props.onDone}>Continue</BigButton>
        </Panel>
    );
}
