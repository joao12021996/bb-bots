import React from "react";
import { CastingScreen } from "../castingScreen/castingScreen";
import { getCast, playerModeScreen$, pushToMainContentStream } from "../../subjects/subjects";
import { installLeaveWarning, okToLeaveGame } from "../../playerMode/ui/leaveGuard";
import styled from "styled-components";
import { ColorTheme } from "../../theme/theme";
import { Box } from "../layout/box";
import { dealNewCast } from "../../cartoon/newCast";
import { SeasonEditorPage } from "../seasonEditor/seasonEditorPage";
import { BehaviorSubject, Subscription } from "rxjs";
import { TutorialPage } from "../tutorial/tutorialPage";
import { muted$, play } from "../../sound/sound";

export enum Screens {
    Deck = 1,
    Casting = 2,
    Season = 3,
    Ingame = 4,
    EditRelationships = 5,
    Tutorial = 6,
}

// for topbar minty colors
export const activeScreen$ = new BehaviorSubject<Screens>(Screens.Ingame);

export const TopbarLink = styled.a`
    color: ${({ theme }: { theme: ColorTheme }) => theme.link};
    cursor: pointer;
`;

export const ActiveTopbarLink = styled.mark`
    cursor: pointer;
    font-weight: bold;
`;

export function CastingScreenLink(): JSX.Element {
    const LinkStyle = activeScreen$.value === Screens.Casting ? ActiveTopbarLink : TopbarLink;
    return (
        <LinkStyle
            onClick={() => {
                if (!okToLeaveGame(false)) return;
                pushToMainContentStream(
                    <CastingScreen cast={JSON.parse(JSON.stringify(getCast()))} />,
                    Screens.Casting
                );
            }}
        >
            Edit / Upload Cast
        </LinkStyle>
    );
}

export function EditSeasonLink(): JSX.Element {
    const LinkStyle = activeScreen$.value === Screens.Season ? ActiveTopbarLink : TopbarLink;
    return (
        <LinkStyle
            onClick={() => {
                if (!okToLeaveGame(false)) return;
                pushToMainContentStream(<SeasonEditorPage />, Screens.Season);
            }}
        >
            Edit Season/Twists
        </LinkStyle>
    );
}

export function showTutorial() {
    pushToMainContentStream(<TutorialPage />, Screens.Tutorial);
}

export function TutorialLink(): JSX.Element {
    const LinkStyle = activeScreen$.value === Screens.Tutorial ? ActiveTopbarLink : TopbarLink;
    return <LinkStyle onClick={showTutorial}>How to Play</LinkStyle>;
}

// A new cast of cartoon houseguests.
export function ChooseCastLink(): JSX.Element {
    return (
        <TopbarLink
            onClick={() => {
                if (!okToLeaveGame(true)) return;
                playerModeScreen$.next(null);
                dealNewCast();
            }}
        >
            New Cast
        </TopbarLink>
    );
}

// While a season is being played and another screen is open: back to it.
export function BackToGameLink(props: { tab: Screens }): JSX.Element | null {
    const [screen, setScreen] = React.useState(() => playerModeScreen$.value);
    React.useEffect(() => {
        const sub = playerModeScreen$.subscribe((s) => setScreen(() => s));
        return () => sub.unsubscribe();
    }, []);
    if (!screen || props.tab === Screens.Ingame) return null;
    return (
        <TopbarLink className="bbb-back-to-game" onClick={() => pushToMainContentStream(screen(), Screens.Ingame)}>
            ▶ Back to your game
        </TopbarLink>
    );
}

// Sound on or off, remembered on this device.
export function MuteButton(): JSX.Element {
    const [muted, setMuted] = React.useState(muted$.value);
    React.useEffect(() => {
        const sub = muted$.subscribe(setMuted);
        return () => sub.unsubscribe();
    }, []);
    return (
        <button
            type="button"
            className="bbb-icon-button"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!muted}
            title={muted ? "Sound is off" : "Sound is on"}
            onClick={() => {
                muted$.next(!muted);
                if (muted) play("click");
            }}
        >
            {muted ? "🔇" : "🔊"}
        </button>
    );
}

export class Topbar extends React.Component<{ style?: any }, { tab: Screens }> {
    private subs: Subscription[] = [];
    constructor(props: Readonly<{ style?: any }>) {
        super(props);
        this.state = { tab: Screens.Ingame };
    }
    componentDidMount() {
        installLeaveWarning();
        this.subs.push(activeScreen$.subscribe((tab) => this.setState({ tab })));
    }
    componentWillUnmount() {
        this.subs.forEach((sub) => sub.unsubscribe());
    }

    public render(): JSX.Element {
        const style = { ...(this.props.style || {}) };
        return (
            <Box className="bbb-topbar" style={style}>
                <div className="bbb-brand">
                    <span className="bbb-brand-eye">👁️</span>
                    Houseguest <span className="dim">Bots</span>
                </div>
                <nav className="bbb-nav">
                    <BackToGameLink tab={this.state.tab} />
                    <ChooseCastLink />
                    <CastingScreenLink />
                    <EditSeasonLink />
                    <TutorialLink />
                    <MuteButton />
                </nav>
            </Box>
        );
    }
}
