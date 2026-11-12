import React from "react";
import { continueOverride$, continueWaiting$, switchSceneRelative } from "../../subjects/subjects";
import { useContinueWaiting } from "../../playerMode/ui/common";

export function NextEpisodeButton(): JSX.Element {
    const waiting = useContinueWaiting();
    return (
        <button
            className={`button is-primary ${waiting.text ? "bbb-continue-waiting" : ""}`}
            onClick={() => {
                if (waiting.text) return;
                const override = continueOverride$.value;
                override ? override() : switchSceneRelative(1);
                waiting.pressed(continueWaiting$.value !== null);
            }}
        >
            {waiting.text || "Continue"}
        </button>
    );
}
