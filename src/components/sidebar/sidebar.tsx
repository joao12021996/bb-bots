import React from "react";
import { SidebarController } from "./sidebarController";
import { Episode } from "../../model";
import { Scene } from "../episode/scenes/scene";
import { mainContentStream$, pushToMainContentStream } from "../../subjects/subjects";
import { Box } from "../layout/box";
import { HasText } from "../layout/text";
import { activeScreen$, Screens } from "../topbar/topBar";
import { dealNewCast } from "../../cartoon/newCast";
interface SidebarState {
    episodes: Episode[];
    selectedScene: number;
    selectionsActive: boolean;
}

let firstLoad = true;

export class Sidebar extends React.Component<{}, SidebarState> {
    private controller: SidebarController;
    public constructor(props: {}) {
        super(props);
        this.controller = new SidebarController(this);
        this.state = { episodes: [], selectedScene: 0, selectionsActive: true };
    }
    public async componentDidMount() {
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
    }

    public render() {
        return (
            <Box className="bbb-sidebar" style={{ minWidth: 180, maxWidth: 250 }}>
                <HasText>{this.getEpisodes()}</HasText>
            </Box>
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
                        <a key={id} onClick={() => this.controller.switchToScene(id)}>
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
