import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";

interface ChoosePromptProps {
    title: string;
    text: string;
    options: Houseguest[];
    count: number;
    noneLabel?: string;
    confirmLabel: string;
    actor: Houseguest; // the player making this choice
    allyIds?: number[]; // the player's alliance mates (picking them is a backstab)
    promisedIds?: number[]; // houseguests the player promised safety in the HoH room
    readOf?: (id: number) => { label: string; emoji: string; day: number } | null; // the player's last read on each one
    resolve: (ids: number[]) => void;
}

// Generic "pick N houseguests" screen used for nominations, veto, votes, and the jury vote.
export function ChoosePrompt(props: ChoosePromptProps) {
    // one houseguest to pick, or not: it's a yes or no, so they're already picked
    const [selected, setSelected] = React.useState<number[]>(() =>
        props.options.length === 1 && props.count === 1 && props.noneLabel ? [props.options[0].id] : []
    );
    const [submitted, setSubmitted] = React.useState(false);

    const toggle = (id: number) => {
        if (selected.includes(id)) {
            setSelected(selected.filter((s) => s !== id));
        } else if (props.count === 1) {
            setSelected([id]);
        } else if (selected.length < props.count) {
            setSelected([...selected, id]);
        }
    };

    const submit = (ids: number[]) => {
        if (submitted) return;
        setSubmitted(true);
        props.resolve(ids);
    };

    const promised = (props.promisedIds || []).filter((id) => props.options.some((o) => o.id === id));

    return (
        <Panel>
            <Title>{props.title}</Title>
            <Subtle>{props.text}</Subtle>
            {promised.length > 0 && <Subtle>🛡️ You gave {promised.length === 1 ? "them" : "some of them"} your word. Picking them breaks it.</Subtle>}
            <Grid>
                {props.options.map((hg) => {
                    const read = props.readOf ? props.readOf(hg.id) : null;
                    return (
                        <Face
                            key={hg.id}
                            hg={hg}
                            selected={selected.includes(hg.id)}
                            onClick={() => toggle(hg.id)}
                            caption={
                                hg.id === props.actor.id ? (
                                    "(you)"
                                ) : (
                                    <span title={read ? `Your read on them, as of Day ${read.day}` : "No read on them yet"}>
                                        {read ? `${read.emoji} ${read.label}` : "❓"}
                                        {props.allyIds && props.allyIds.includes(hg.id) ? " 🤝" : ""}
                                        {promised.includes(hg.id) ? " 🛡️" : ""}
                                    </span>
                                )
                            }
                        />
                    );
                })}
            </Grid>
            <div>
                <BigButton
                    kind="danger"
                    disabled={selected.length !== props.count || submitted}
                    onClick={() => submit(selected)}
                >
                    {props.confirmLabel}
                    {props.count > 1 ? ` (${selected.length}/${props.count})` : ""}
                </BigButton>
                {props.noneLabel && (
                    <BigButton kind="light" disabled={submitted} onClick={() => submit([])}>
                        {props.noneLabel}
                    </BigButton>
                )}
            </div>
        </Panel>
    );
}
