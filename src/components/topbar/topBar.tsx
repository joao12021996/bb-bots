import React from "react";
import { CastingScreen } from "../castingScreen/castingScreen";
import { getCast, pushToMainContentStream } from "../../subjects/subjects";
import styled from "styled-components";
import { ColorTheme } from "../../theme/theme";
import { Box } from "../layout/box";
import { dealNewCast } from "../../cartoon/newCast";
import { SeasonEditorPage } from "../seasonEditor/seasonEditorPage";
import { BehaviorSubject, Subscription } from "rxjs";

export enum Screens {
    Deck = 1,
    Casting = 2,
    Season = 3,
    Ingame = 4,
    EditRelationships = 5,
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
                pushToMainContentStream(<SeasonEditorPage />, Screens.Season);
            }}
        >
            Edit Season/Twists
        </LinkStyle>
    );
}

// A new cast of cartoon houseguests.
export function ChooseCastLink(): JSX.Element {
    return <TopbarLink onClick={() => dealNewCast()}>New Cast</TopbarLink>;
}

export class Topbar extends React.Component<{ style?: any }, { tab: Screens }> {
    private subs: Subscription[] = [];
    constructor(props: Readonly<{ style?: any }>) {
        super(props);
        this.state = { tab: Screens.Ingame };
    }
    componentDidMount() {
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
                    <ChooseCastLink />
                    <CastingScreenLink />
                    <EditSeasonLink />
                </nav>
            </Box>
        );
    }
}
