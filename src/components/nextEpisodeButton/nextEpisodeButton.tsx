import React from "react";
import { continueOverride$, switchSceneRelative } from "../../subjects/subjects";

export function NextEpisodeButton(): JSX.Element {
    return (
        <button
            className="button is-primary"
            onClick={() => {
                const override = continueOverride$.value;
                override ? override() : switchSceneRelative(1);
            }}
        >
            Continue
        </button>
    );
}
