import React from "react";
import { MainPage } from "./components/mainPage/mainPage";
import { MainPageController } from "./components/mainPage/mainPageController";
import { ThemeProvider } from "styled-components";
import { ColorTheme, darkTheme, lightTheme } from "./theme/theme";
import { scheme$ } from "./prefs/colorScheme";
import { GlobalStyles } from "./theme/globalTheme";
import "./theme/modern.css";
import { Subscription } from "rxjs";
import { KnownProfileModal } from "./playerMode/ui/knownProfile";
import { Lang, language$ } from "./i18n/i18n";

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
                    <MainPage controller={new MainPageController()} />
                    <KnownProfileModal />
                </React.Fragment>
            </ThemeProvider>
        );
    }
}

export default App;
