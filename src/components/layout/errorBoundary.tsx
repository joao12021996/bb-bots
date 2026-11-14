import React from "react";
import { hasSave, readOnlineSave } from "../../playerMode/save/serialize";
import { t } from "../../i18n/i18n";

// Catches a crash anywhere on the page. Without it, one broken screen leaves the whole page blank; with it, the
// player gets a way back: the season is saved after every step, so it resumes from the last one.

interface Props {
    children: React.ReactNode;
    // what "resume" and "home" do (the app wires these to the real screens; tests can pass their own)
    onResume: () => void;
    onHome: () => void;
}

interface State {
    error: Error | null;
    details: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
    public state: State = { error: null, details: false };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    public componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("The page crashed", error, info && info.componentStack);
    }

    // Switches to a working screen first, then draws the page again: the other way round, the broken screen would
    // be drawn once more and crash again.
    private recover(then: () => void) {
        try {
            then();
        } catch (e) {
            console.error("Could not recover", e);
        }
        this.setState({ error: null, details: false });
    }

    public render() {
        const { error, details } = this.state;
        if (!error) return this.props.children;
        const online = !!readOnlineSave();
        return (
            <div className="bbb-crash" role="alert">
                <div className="bbb-crash-emoji">🛠️</div>
                <h2>{t("Something broke")}</h2>
                <p>{t("That's on us, not you. Your season is saved after every step, so you can pick it up where it stopped.")}</p>
                <div className="bbb-crash-buttons">
                    {hasSave() && (
                        <button className="button is-warning" onClick={() => this.recover(this.props.onResume)}>
                            ▶ {t("Resume saved season")}
                        </button>
                    )}
                    {online && (
                        <button className="button is-warning" onClick={() => window.location.reload()}>
                            🌐 {t("Reload and rejoin your online game")}
                        </button>
                    )}
                    <button className="button is-light" onClick={() => this.recover(this.props.onHome)}>
                        {t("Home")}
                    </button>
                    <button className="button is-light" onClick={() => this.setState({ details: !details })}>
                        {details ? t("Hide details") : t("Show details")}
                    </button>
                </div>
                {details && <pre className="bbb-crash-details">{String((error && (error.stack || error.message)) || error)}</pre>}
            </div>
        );
    }
}
