import React from "react";
import { CastingScreen } from "../castingScreen/castingScreen";
import { compsInPlay$, getCast, playerModeScreen$, pushToMainContentStream } from "../../subjects/subjects";
import { installLeaveWarning, okToLeaveGame } from "../../playerMode/ui/leaveGuard";
import styled from "styled-components";
import { ColorTheme } from "../../theme/theme";
import { Box } from "../layout/box";
import { dealNewCast } from "../../cartoon/newCast";
import { SeasonEditorPage } from "../seasonEditor/seasonEditorPage";
import { BehaviorSubject, Subscription } from "rxjs";
import { TutorialPage } from "../tutorial/tutorialPage";
import { StatsPage } from "../../career/statsPage";
import { muted$, play } from "../../sound/sound";
import { reduceMotion$ } from "../../prefs/motion";
import { ThemeChoice, themeChoice$ } from "../../prefs/colorScheme";
import { Lang, language$, LANGUAGES, setLanguage, t } from "../../i18n/i18n";
import { names$, renameCount } from "../../i18n/rename";
import { NamesDialog } from "./namesDialog";

export enum Screens {
    Deck = 1,
    Casting = 2,
    Season = 3,
    Ingame = 4,
    EditRelationships = 5,
    Tutorial = 6,
    Stats = 7,
}

// for topbar minty colors
export const activeScreen$ = new BehaviorSubject<Screens>(Screens.Ingame);

// Links that act like buttons: reachable with Tab, pressed with Enter or Space.
const keyboardPress = (props: any) => ({
    role: "button",
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (props.onKeyDown) props.onKeyDown(e);
        if ((e.key === "Enter" || e.key === " ") && props.onClick) {
            e.preventDefault();
            props.onClick(e);
        }
    },
});

export const TopbarLink = styled.a.attrs(keyboardPress)`
    color: ${({ theme }: { theme: ColorTheme }) => theme.link};
    cursor: pointer;
`;

export const ActiveTopbarLink = styled.mark.attrs((props: any) => ({ ...keyboardPress(props), "aria-current": "page" }))`
    cursor: pointer;
    font-weight: bold;
`;

export function CastingScreenLink(): JSX.Element {
    const LinkStyle: React.ComponentType<any> = activeScreen$.value === Screens.Casting ? ActiveTopbarLink : TopbarLink;
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
            {t("Edit / Upload Cast")}
        </LinkStyle>
    );
}

export function EditSeasonLink(): JSX.Element {
    const LinkStyle: React.ComponentType<any> = activeScreen$.value === Screens.Season ? ActiveTopbarLink : TopbarLink;
    return (
        <LinkStyle
            onClick={() => {
                if (!okToLeaveGame(false)) return;
                pushToMainContentStream(<SeasonEditorPage />, Screens.Season);
            }}
        >
            {t("Edit Season/Twists")}
        </LinkStyle>
    );
}

export function showTutorial() {
    pushToMainContentStream(<TutorialPage />, Screens.Tutorial);
}

export function TutorialLink(): JSX.Element {
    const LinkStyle: React.ComponentType<any> = activeScreen$.value === Screens.Tutorial ? ActiveTopbarLink : TopbarLink;
    return <LinkStyle onClick={showTutorial}>{t("How to Play")}</LinkStyle>;
}

export function StatsLink(): JSX.Element {
    const LinkStyle: React.ComponentType<any> = activeScreen$.value === Screens.Stats ? ActiveTopbarLink : TopbarLink;
    return <LinkStyle onClick={() => pushToMainContentStream(<StatsPage />, Screens.Stats)}>{t("My Stats")}</LinkStyle>;
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
            {t("New Cast")}
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
            ▶ {t("Back to your game")}
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
            aria-label={muted ? t("Turn sound on") : t("Turn sound off")}
            aria-pressed={!muted}
            title={muted ? t("Sound is off") : t("Sound is on")}
            onClick={() => {
                muted$.next(!muted);
                if (muted) play("click");
            }}
        >
            {muted ? "🔇" : "🔊"}
        </button>
    );
}

function useSubject<T>(subject: BehaviorSubject<T>): T {
    const [value, setValue] = React.useState(subject.value);
    React.useEffect(() => {
        const sub = subject.subscribe((v) => setValue(() => v));
        return () => sub.unsubscribe();
    }, [subject]);
    return value;
}

// ⚙️ Settings: sound, motion, light or dark, and (see i18n) the language. Remembered on this device.
export function SettingsMenu(): JSX.Element {
    const [open, setOpen] = React.useState(false);
    const muted = useSubject(muted$);
    const calm = useSubject(reduceMotion$);
    const themeChoice = useSubject(themeChoice$);
    const lang = useSubject(language$);
    const renamed = renameCount(useSubject(names$));
    const [renaming, setRenaming] = React.useState(false);
    // changing language redraws the page, which would restart a comp in progress
    const inComp = useSubject(compsInPlay$) > 0;
    return (
        <span className="bbb-settings">
            <button type="button" className="bbb-icon-button" aria-label={t("Settings")} aria-expanded={open} onClick={() => setOpen(!open)}>
                ⚙️
            </button>
            {open && (
                <div className="bbb-settings-panel" role="dialog" aria-label={t("Settings")} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
                    <label className="bbb-toggle">
                        <input type="checkbox" checked={!muted} onChange={(e) => muted$.next(!e.target.checked)} />
                        <span>🔊 {t("Sound effects")}</span>
                    </label>
                    <label className="bbb-toggle">
                        <input type="checkbox" checked={calm} onChange={(e) => reduceMotion$.next(e.target.checked)} />
                        <span>🧘 {t("Reduce motion (no sliding, spinning or pulsing)")}</span>
                    </label>
                    <div className="bbb-settings-language">
                        <span>🌗 {t("Theme")}</span>
                        <div className="bbb-segmented" role="group" aria-label={t("Theme")}>
                            {(["system", "light", "dark"] as ThemeChoice[]).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    className={themeChoice === c ? "is-active" : ""}
                                    aria-pressed={themeChoice === c}
                                    onClick={() => themeChoice$.next(c)}
                                >
                                    {c === "system" ? t("Device") : c === "light" ? t("Light") : t("Dark")}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="bbb-settings-language">
                        <span>🌍 {t("Language")}</span>
                        <select className="bbb-select" value={lang} disabled={inComp} onChange={(e) => setLanguage(e.target.value as Lang)}>
                            {LANGUAGES.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {inComp && <small className="bbb-subtle">{t("Finish the comp first.")}</small>}
                    {lang !== "en" && <small className="bbb-subtle">{t("Some screens are still in English.")}</small>}
                    <button
                        type="button"
                        className="button is-small is-light"
                        onClick={() => {
                            setOpen(false);
                            setRenaming(true);
                        }}
                    >
                        ✏️ {t("Rename things")}
                        {renamed > 0 && <span className="bbb-subtle">&nbsp;({renamed})</span>}
                    </button>
                    <button type="button" className="button is-small is-light" onClick={() => setOpen(false)}>
                        {t("Close")}
                    </button>
                </div>
            )}
            {renaming && <NamesDialog onClose={() => setRenaming(false)} />}
        </span>
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
                    <StatsLink />
                    <MuteButton />
                    <SettingsMenu />
                </nav>
            </Box>
        );
    }
}
