import React from "react";
import { Houseguest } from "../../model";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";

// One way to give a speech. Some tones are aimed at people: `pick` says who can be chosen, and how many.
export interface SpeechTone {
    id: string;
    label: string;
    blurb: string;
    pick?: { text: string; options: Houseguest[]; max: number };
}

interface SpeechPromptProps {
    title: string;
    text: string;
    tones: SpeechTone[];
    actor: Houseguest;
    readOf?: (id: number) => { label: string; emoji: string; day: number } | null; // the speaker's last read on each one
    deliver: (toneId: string, ids: number[]) => string[]; // gives the speech; returns what was said and how it landed
    next: () => void;
}

// Pick a tone (and who it's aimed at), give the speech, see how the house took it.
export function SpeechPrompt(props: SpeechPromptProps) {
    const [tone, setTone] = React.useState<SpeechTone | null>(null);
    const [selected, setSelected] = React.useState<number[]>([]);
    const [lines, setLines] = React.useState<string[] | null>(null);

    const give = (t: SpeechTone, ids: number[]) => {
        if (lines) return;
        setLines(props.deliver(t.id, ids));
    };

    if (lines) {
        return (
            <Panel>
                <Title>🎤 {props.title}</Title>
                {lines.length > 0 && <div className="bbb-quote">{lines[0]}</div>}
                <div className="bbb-log">
                    {lines.slice(1).map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                </div>
                <BigButton onClick={props.next}>Continue</BigButton>
            </Panel>
        );
    }

    if (tone && tone.pick) {
        const pick = tone.pick;
        const toggle = (id: number) => {
            if (selected.includes(id)) setSelected(selected.filter((s) => s !== id));
            else if (pick.max === 1) setSelected([id]);
            else if (selected.length < pick.max) setSelected([...selected, id]);
        };
        return (
            <Panel>
                <Title>🎤 {props.title}</Title>
                <Subtle>
                    {tone.label}: {pick.text}
                </Subtle>
                <Grid>
                    {pick.options.map((hg) => {
                        const read = props.readOf ? props.readOf(hg.id) : null;
                        return (
                            <Face
                                key={hg.id}
                                hg={hg}
                                selected={selected.includes(hg.id)}
                                onClick={() => toggle(hg.id)}
                                caption={
                                    <span title={read ? `Your read on them, as of Day ${read.day}` : "No read on them yet"}>
                                        {read ? `${read.emoji} ${read.label}` : "❓ No read"}
                                    </span>
                                }
                            />
                        );
                    })}
                </Grid>
                <div>
                    <BigButton kind="danger" disabled={selected.length === 0} onClick={() => give(tone, selected)}>
                        Give the speech
                    </BigButton>
                    <BigButton
                        kind="light"
                        onClick={() => {
                            setTone(null);
                            setSelected([]);
                        }}
                    >
                        Back
                    </BigButton>
                </div>
            </Panel>
        );
    }

    return (
        <Panel>
            <Title>🎤 {props.title}</Title>
            <Subtle>{props.text}</Subtle>
            <div className="bbb-tones">
                {props.tones.map((t) => (
                    <button
                        type="button"
                        key={t.id}
                        className="bbb-tone"
                        onClick={() => {
                            if (!t.pick) return give(t, []);
                            // only one possible choice: no need to ask
                            if (t.pick.options.length === 1) return give(t, [t.pick.options[0].id]);
                            setTone(t);
                        }}
                    >
                        <b>{t.label}</b>
                        <span>{t.blurb}</span>
                    </button>
                ))}
            </div>
        </Panel>
    );
}
