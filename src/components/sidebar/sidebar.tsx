import React from "react";
import { SidebarController } from "./sidebarController";
import { Episode } from "../../model";
import { Scene } from "../episode/scenes/scene";
import { mainContentStream$, playerModeScreen$, pushToMainContentStream } from "../../subjects/subjects";
import { Box } from "../layout/box";
import { HasText } from "../layout/text";
import { activeScreen$, Screens } from "../topbar/topBar";
import { dealNewCast } from "../../cartoon/newCast";
import { PregameEpisode } from "../episode/pregameEpisode";
import { getActiveController } from "../../playerMode/playerModeController";
import { Subscription } from "rxjs";

interface SidebarState {
    episodes: Episode[];
    selectedScene: number;
    selectionsActive: boolean;
    humanSeason: boolean;
}

// A season being played by people (not just watching the bots): they have to remember what happened.
function isHumanSeason(): boolean {
    return !!playerModeScreen$.value && !getActiveController()?.watching;
}

let firstLoad = true;

// The list of episodes and scenes on the left. Always mounted (it runs scene navigation and deals the first
// cast), but only shown once a classic or watch-the-bots game is underway: not on the home screen, and never
// in a season people are playing. `hidden`: fullscreen.
export class Sidebar extends React.Component<{ hidden?: boolean }, SidebarState> {
    private controller: SidebarController;
    private sub?: Subscription;
    public constructor(props: { hidden?: boolean }) {
        super(props);
        this.controller = new SidebarController(this);
        this.state = { episodes: [], selectedScene: 0, selectionsActive: true, humanSeason: false };
    }
    public async componentDidMount() {
        this.sub = playerModeScreen$.subscribe(() => this.setState({ humanSeason: isHumanSeason() }));
        document.addEventListener("keydown", this.controller.handleKeyDown);
        if (!firstLoad) {
            firstLoad = false;
            return;
        }
        // what's on screen before the cast loads: only replace it if nothing else (like an invite link's join screen) has since
        const startScreen = mainContentStream$.value;
        // a cast of cartoon houseguests, different every time
        const episode = dealNewCast(false);
        if (activeScreen$.value === Screens.Ingame && mainContentStream$.value === startScreen) {
            pushToMainContentStream(episode.render, Screens.Ingame);
        }
    }

    public componentWillUnmount() {
        this.controller.destroy();
        this.sub?.unsubscribe();
    }

    public render() {
        const underway = this.state.episodes.some((e) => !(e instanceof PregameEpisode));
        if (this.props.hidden || !underway || this.state.humanSeason) return null;
        return (
            <div className="column is-narrow">
                <Box className="bbb-sidebar" style={{ minWidth: 180, maxWidth: 250 }}>
                    <HasText>{this.getEpisodes()}</HasText>
                </Box>
            </div>
        );
    }

    private getHighlight(title: string, key: number) {
        if (key === this.state.selectedScene && this.state.selectionsActive) {
            return <mark>{title}</mark>;
        }
        return title;
    }

    private getEpisodes() {
        const result: JSX.Element[] = [];
        // Weird OBOE to make keys start at 0
        let episodeKey = -1;
        let breakKey = 0;
        this.state.episodes.forEach((episode: Episode) => {
            const id = ++episodeKey;
            result.push(
                <b
                    key={id}
                    onClick={() => {
                        this.controller.switchToScene(id);
                    }}
                >
                    {this.getHighlight(episode.title, id)}
                </b>
            );
            result.push(<br key={--breakKey} />);
            episode.scenes.forEach((scene: Scene) => {
                const id = ++episodeKey;
                if (this.controller.getSelectedEpisode() === episode.gameState.phase) {
                    result.push(
                        <a
                            key={id}
                            role="button"
                            tabIndex={0}
                            onClick={() => this.controller.switchToScene(id)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), this.controller.switchToScene(id))}
                        >
                            {this.getHighlight(scene.title, id)}
                        </a>
                    );
                    result.push(<br key={--breakKey} />);
                }
            });
        });
        return result;
    }
}
