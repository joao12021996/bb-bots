import React from "react";
import { PlayerProfile } from "../../model";
import { MemoryWall } from "../memoryWall";
import { HasText } from "../layout/text";
import { popularityMode } from "../../model/portraitDisplayMode";
import { cast$, displayMode$, pushToMainContentStream, switchSceneRelative } from "../../subjects/subjects";
import { Screens, TopbarLink } from "../topbar/topBar";
import { SeasonEditorPage } from "../seasonEditor/seasonEditorPage";
import { CastingScreen } from "../castingScreen/castingScreen";
import { DeckScreen } from "../deckScreen/deckScreen";
import { EditRelationshipsScreen, getProfiles } from "../editRelationshipsScreen/editRelationshipScreen";
import { Tribe } from "../../model/tribe";
import { selectPlayer } from "../playerPortrait/selectedPortrait";
import { PlayerSetup, resumeSavedSeason } from "../../playerMode/ui/playerSetup";
import { hasSave, readOnlineSave } from "../../playerMode/save/serialize";
import { HostOnlineButton, joinCodeFromUrl, showJoinScreen } from "../../playerMode/ui/onlineLobby";

// An invite link (?join=CODE) opens the join screen, once.
let inviteHandled = false;

interface PregameScreenOptions {
    initialTribes?: Tribe[];
    currentTribes?: { [id: number]: Tribe };
    relationships?: { [id: number]: { [id: number]: number } }; // hero -> villain -> relationship
}

export interface PregameScreenProps {
    cast: PlayerProfile[];
    options?: PregameScreenOptions;
}

export class PregameScreen extends React.Component<PregameScreenProps, PregameScreenOptions> {
    constructor(props: PregameScreenProps) {
        super(props);
        this.state = cast$.value.options ? { ...cast$.value.options } : {};
    }

    public componentDidMount() {
        displayMode$.next(popularityMode);
        selectPlayer(null);
        this.setState({ ...cast$.value.options });
        const code = !inviteHandled && joinCodeFromUrl();
        inviteHandled = true;
        if (code) {
            try {
                window.history.replaceState(null, "", window.location.pathname);
            } catch (e) {
                // fine: the link just stays in the address bar
            }
            setTimeout(() => showJoinScreen(code, true), 0);
        }
    }

    public render() {
        const props = this.props;
        const relationships = this.state.relationships || props.options?.relationships;
        const initialTribes = this.state.initialTribes || props.options?.initialTribes;
        const currentTribes = this.state.currentTribes || props.options?.currentTribes;
        const profiles = relationships
            ? getProfiles(props.cast, relationships, currentTribes || {}, false, false)
            : props.cast;
        return (
            <HasText>
                <div className="bbb-hero">
                    <div className="bbb-hero-kicker">Reality TV, simulated</div>
                    <h1>Houseguest Bots</h1>
                    <p>
                        Build a cast, add twists, and watch the bots scheme, compete and vote each other out, or move
                        into the house yourself and try to outlast them.
                    </p>
                </div>
                <div className="bbb-modes">
                    <div className="bbb-mode-card">
                        <h3>📺 Watch the bots</h3>
                        <p>Every houseguest is a bot. Step through the season week by week.</p>
                        {props.cast.length > 0 ? (
                            <button className="button is-primary" onClick={() => switchSceneRelative(1)}>
                                Start Game
                            </button>
                        ) : (
                            <button
                                className="button is-primary"
                                onClick={() => pushToMainContentStream(<DeckScreen />, Screens.Deck)}
                            >
                                Choose a cast
                            </button>
                        )}
                    </div>
                    <div className="bbb-mode-card is-featured">
                        <h3>🎮 Play as a houseguest</h3>
                        <p>
                            Socialize, form alliances, win comps on your phone or computer. Solo, or pass-and-play with
                            friends on one device.
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {props.cast.length > 2 ? (
                                <button
                                    className="button is-warning"
                                    onClick={() => pushToMainContentStream(<PlayerSetup />, Screens.Ingame)}
                                >
                                    Play now
                                </button>
                            ) : (
                                <button
                                    className="button is-warning"
                                    onClick={() => pushToMainContentStream(<DeckScreen />, Screens.Deck)}
                                >
                                    Pick a cast first
                                </button>
                            )}
                            {hasSave() && (
                                <button className="button is-light" onClick={() => resumeSavedSeason()}>
                                    ▶ Resume saved season
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="bbb-mode-card is-featured">
                        <h3>🌐 Play online with friends</h3>
                        <p>
                            Everyone on their own phone or computer, from anywhere. Host a game and share the code: the
                            house starts full of bots, and every friend who joins takes one's place.
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {props.cast.length >= 4 ? (
                                <HostOnlineButton />
                            ) : (
                                <button
                                    className="button is-warning"
                                    onClick={() => pushToMainContentStream(<DeckScreen />, Screens.Deck)}
                                >
                                    Pick a cast first
                                </button>
                            )}
                            <button className="button is-light" onClick={() => showJoinScreen()}>
                                {readOnlineSave() ? "Join or rejoin a game" : "Join a game"}
                            </button>
                        </div>
                    </div>
                </div>
                <p className="bbb-steps">
                    <TopbarLink
                        onClick={() => {
                            pushToMainContentStream(<DeckScreen />, Screens.Deck);
                        }}
                    >
                        Choose characters
                    </TopbarLink>{" "}
                    from 300+ collections, or{" "}
                    <TopbarLink
                        onClick={() => {
                            pushToMainContentStream(<CastingScreen cast={[]} />, Screens.Casting);
                        }}
                    >
                        upload your own
                    </TopbarLink>
                    , then{" "}
                    <TopbarLink
                        onClick={() => {
                            pushToMainContentStream(<SeasonEditorPage />, Screens.Season);
                        }}
                    >
                        add twists
                    </TopbarLink>
                    .
                </p>
                {props.cast.length === 0 ? "" : <MemoryWall splits={[{ houseguests: profiles }]} />}
                {props.cast.length === 0 ? (
                    ""
                ) : (
                    <p>
                        <b> {"You can use the ⬅️ and ➡️ arrow keys to move forwards and backwards."}</b>
                    </p>
                )}
                <div style={{ justifyContent: "space-between", display: "flex" }}>
                    {props.cast.length === 0 ? (
                        ""
                    ) : (
                        <button
                            className="button is-primary"
                            onClick={() =>
                                pushToMainContentStream(
                                    <EditRelationshipsScreen
                                        profiles={props.cast}
                                        initialTribes={initialTribes}
                                        currentTribes={currentTribes}
                                        relationships={relationships}
                                    />,
                                    Screens.EditRelationships
                                )
                            }
                        >
                            {`Edit Relationships${initialTribes?.length ? "/Teams" : ""}`}
                        </button>
                    )}
                </div>
            </HasText>
        );
    }
}
