import React from "react";
import { SidebarController } from "./sidebarController";
import { Episode } from "../../model";
import { mainContentStream$, pushToMainContentStream } from "../../subjects/subjects";
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

    // Not shown on screen: the episodes and the selected scene are kept here for scene navigation.
    public render() {
        return null;
    }
}
