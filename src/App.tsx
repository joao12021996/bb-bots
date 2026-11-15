import React from "react";
import { MainPage } from "./components/mainPage/mainPage";
import { MainPageController } from "./components/mainPage/mainPageController";
import { ThemeProvider } from "styled-components";
import { ColorTheme, darkTheme, lightTheme } from "./theme/theme";
import { scheme$ } from "./prefs/colorScheme";
import { GlobalStyles } from "./theme/globalTheme";
import "./theme/css";
import { Subscription } from "rxjs";
import { KnownProfileModal } from "./playerMode/ui/knownProfile";
import { Lang, language$ } from "./i18n/i18n";
import { ErrorBoundary } from "./components/layout/errorBoundary";
import { resumeSavedSeason } from "./playerMode/ui/playerSetup";
import { dealNewCast } from "./cartoon/newCast";
import { compsInPlay$, playerModeScreen$ } from "./subjects/subjects";
import { counterName, countWhereLeft, installCounts } from "./analytics/analytics";
import { getActiveController } from "./playerMode/playerModeController";

// Where the player was when the page closed: which week, which step, and which comp if one was on.
function whereLeft(): string[] {
    const controller = playerModeScreen$.value ? getActiveController() : null;
    if (!controller) return ["leave:home"];
    const s = controller.state;
    const out = [counterName("leave:week", Math.min(s.gameState.phase, 20)), counterName("leave:step", s.step)];
    if (compsInPlay$.value > 0 && s.usedComps.length > 0) out.push(counterName("leave:comp", s.usedComps[s.usedComps.length - 1]));
    return out;
}

function goHome() {
    playerModeScreen$.next(null);
    dealNewCast();
}

class App extends React.Component<{}, { theme: ColorTheme; lang: Lang }> {
    private sub: Subscription | null = null;
    private schemeSub: Subscription | null = null;
    public constructor(props: any) {
        super(props);
        this.state = {
            theme: scheme$.value === "light" ? lightTheme : darkTheme,
            lang: language$.value,
        };
    }

    componentDidMount() {
        installCounts();
        countWhereLeft(whereLeft);
        this.sub = language$.subscribe((lang) => lang !== this.state.lang && this.setState({ lang }));
        this.schemeSub = scheme$.subscribe((scheme) => this.setState({ theme: scheme === "light" ? lightTheme : darkTheme }));
    }

    componentWillUnmount() {
        this.sub && this.sub.unsubscribe();
        this.schemeSub && this.schemeSub.unsubscribe();
    }

    render() {
        return (
            <ThemeProvider theme={this.state.theme}>
                <React.Fragment key={this.state.lang}>
                    <GlobalStyles />
                    <ErrorBoundary onResume={() => resumeSavedSeason() || goHome()} onHome={goHome}>
                        <MainPage controller={new MainPageController()} />
                        <KnownProfileModal />
                    </ErrorBoundary>
                </React.Fragment>
            </ThemeProvider>
        );
    }
}

export default App;
