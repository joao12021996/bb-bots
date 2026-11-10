import React from "react";
import { Houseguest } from "../../model";
import { feelingLabel } from "../social/socialActions";
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
    resolve: (ids: number[]) => void;
}

// Generic "pick N houseguests" screen used for nominations, veto, votes, and the jury vote.
export function ChoosePrompt(props: ChoosePromptProps) {
    const [selected, setSelected] = React.useState<number[]>([]);
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

    return (
        <Panel>
            <Title>{props.title}</Title>
            <Subtle>{props.text}</Subtle>
            <Grid>
                {props.options.map((hg) => {
                    const feeling = feelingLabel(props.actor.relationships[hg.id] ?? 0);
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
                                    <span title={feeling.label}>
                                        {feeling.emoji} {feeling.label}
                                        {props.allyIds && props.allyIds.includes(hg.id) ? " 🤝" : ""}
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
