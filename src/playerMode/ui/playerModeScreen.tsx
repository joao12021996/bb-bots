import React from "react";
import { Subscription } from "rxjs";
import { continueOverride$ } from "../../subjects/subjects";
import { CompPlay, CompResults } from "../comps/compRunner";
import { PlayerModeController, Prompt } from "../playerModeController";
import { ChoosePrompt } from "./choosePrompt";
import { BigButton, Panel, Subtle, Title } from "./common";
import { SocialScreen } from "./socialScreen";
import { AllianceScreen } from "./allianceScreen";
import { HohRoomScreen, HohVisitScreen } from "./hohRoomScreen";
import { SpeechPrompt } from "./speechPrompt";
import { JuryQuestionPrompt, JuryReveal, OwnMovesPrompt } from "./finaleScreens";
import { HouseWall } from "./houseWall";
import { LiveFeed } from "./liveFeed";
import { TiebreakPlay, TiebreakResults } from "../comps/tiebreaker";
import { KnockoutBoard } from "../comps/knockout";

interface Props {
    controller: PlayerModeController;
}

// whether the memory wall is open, remembered per viewer (never required: storage can be unavailable)
function loadWallOpen(): boolean {
    try {
        return window.localStorage.getItem("bbb-wall-open") !== "0";
    } catch (e) {
        return true;
    }
}

function saveWallOpen(open: boolean) {
    try {
        window.localStorage.setItem("bbb-wall-open", open ? "1" : "0");
    } catch (e) {
        // fine: it just won't be remembered
    }
}

interface State {
    wallOpen?: boolean;
    prompt: Prompt | null;
    key: number; // forces child prompts to remount on every new prompt
}

function Handoff(props: { name: string; imageURL: string; reason: string; onReady: () => void }) {
    return (
        <Panel>
            <div className="bbb-handoff">
                <div className="bbb-handoff-icon">📱</div>
                <Subtle>Pass the device to</Subtle>
                <img src={props.imageURL} alt="" />
                <Title>{props.name}</Title>
                <Subtle>{props.reason}. Everyone else, look away!</Subtle>
                <BigButton kind="success" onClick={props.onReady}>
                    I'm {props.name}, show me
                </BigButton>
            </div>
        </Panel>
    );
}

// The main player mode screen. Renders whatever the controller is currently asking for.
export class PlayerModeScreen extends React.Component<Props, State> {
    private sub: Subscription | null = null;
    state: State = { prompt: null, key: 0 };

    componentDidMount() {
        continueOverride$.next(this.props.controller.continue);
        this.sub = this.props.controller.prompt$.subscribe((prompt) => this.setState((s) => ({ prompt, key: s.key + 1 })));
    }

    componentWillUnmount() {
        // leaving the screen (e.g. browsing past weeks in the sidebar): restore normal Continue buttons
        continueOverride$.next(null);
        this.sub && this.sub.unsubscribe();
    }

    render() {
        const { controller } = this.props;
        const prompt = this.state.prompt;
        const banner = controller.bannerText();
        if (!prompt) {
            return (
                <Panel>
                    <Subtle>Loading…</Subtle>
                </Panel>
            );
        }
        let body: JSX.Element;
        switch (prompt.kind) {
            case "scene":
                body = <div className="bbb-scene">{prompt.scene.render}</div>;
                break;
            case "handoff": {
                const p = controller.player(prompt.playerId);
                body = <Handoff key={this.state.key} name={p.name} imageURL={p.imageURL} reason={prompt.reason} onReady={prompt.next} />;
                break;
            }
            case "social":
                body = <SocialScreen key={this.state.key} controller={controller} blockName={prompt.blockName} />;
                break;
            case "alliance":
                body = <AllianceScreen key={this.state.key} controller={controller} blockName={prompt.blockName} />;
                break;
            case "hohRoom":
                body = <HohRoomScreen key={this.state.key} controller={controller} actorId={prompt.actorId} />;
                break;
            case "hohVisit":
                body = <HohVisitScreen key={this.state.key} controller={controller} actorId={prompt.actorId} />;
                break;
            case "compPlay":
                body = (
                    <CompPlay
                        key={this.state.key}
                        title={prompt.title}
                        comp={prompt.comp}
                        participants={prompt.participants}
                        player={controller.player(prompt.playerId)}
                        gameState={controller.gameState}
                        history={controller.state.history}
                        seed={prompt.seed}
                        opponents={prompt.opponents}
                        moreToPlay={prompt.moreToPlay}
                        deals={prompt.deals}
                        onScore={prompt.onScore}
                    />
                );
                break;
            case "compResults":
                body = (
                    <CompResults
                        key={this.state.key}
                        title={prompt.title}
                        comp={prompt.comp}
                        participants={prompt.participants}
                        humanIds={controller.state.humanIds}
                        results={prompt.results}
                        tiedIds={prompt.tiedIds}
                        sealed={prompt.sealed}
                        spectating={prompt.spectating}
                        onDone={prompt.onDone}
                    />
                );
                break;
            case "tiebreak":
                body = (
                    <TiebreakPlay
                        key={this.state.key}
                        title={prompt.title}
                        player={controller.player(prompt.playerId)}
                        tied={prompt.tied}
                        question={prompt.question}
                        moreToPlay={prompt.moreToPlay}
                        heading={prompt.heading}
                        intro={prompt.intro}
                        onGuess={prompt.onGuess}
                    />
                );
                break;
            case "tiebreakResults":
                body = (
                    <TiebreakResults
                        key={this.state.key}
                        title={prompt.title}
                        question={prompt.question}
                        tied={prompt.tied}
                        guesses={prompt.guesses}
                        winnerId={prompt.winnerId}
                        sealed={prompt.sealed}
                        humanIds={controller.state.humanIds}
                        onDone={prompt.onDone}
                    />
                );
                break;
            case "knockout":
                body = (
                    <KnockoutBoard
                        key={this.state.key}
                        title={prompt.title}
                        lines={prompt.lines}
                        remaining={prompt.remaining}
                        out={prompt.out}
                        winner={prompt.winnerId !== undefined ? controller.player(prompt.winnerId) : undefined}
                        youWon={prompt.winnerId !== undefined && !controller.multiplayer && controller.isHuman({ id: prompt.winnerId })}
                        onDone={prompt.onDone}
                    />
                );
                break;
            case "speech":
                body = (
                    <SpeechPrompt
                        key={this.state.key}
                        title={prompt.title}
                        text={prompt.text}
                        tones={prompt.tones}
                        actor={controller.player(prompt.actorId)}
                        readOf={(id: number) => controller.readOf(prompt.actorId, id)}
                        deliver={prompt.deliver}
                        next={prompt.next}
                    />
                );
                break;
            case "choose":
                body = (
                    <ChoosePrompt
                        key={this.state.key}
                        title={prompt.title}
                        text={prompt.text}
                        options={prompt.options}
                        count={prompt.count}
                        noneLabel={prompt.noneLabel}
                        confirmLabel={prompt.confirmLabel}
                        actor={controller.player(prompt.actorId)}
                        readOf={(id: number) => controller.readOf(prompt.actorId, id)}
                        allyIds={controller.allyIds(prompt.actorId)}
                        promisedIds={prompt.promisedIds}
                        resolve={prompt.resolve}
                    />
                );
                break;
            case "ownMoves":
                body = (
                    <OwnMovesPrompt key={this.state.key} finalist={controller.player(prompt.actorId)} moves={prompt.moves} onDone={prompt.onDone} />
                );
                break;
            case "juryQuestion":
                body = (
                    <JuryQuestionPrompt
                        key={this.state.key}
                        juror={controller.player(prompt.jurorId)}
                        finalist={controller.player(prompt.actorId)}
                        question={prompt.question}
                        onAnswer={prompt.onAnswer}
                    />
                );
                break;
            case "juryReveal": {
                const gs = controller.gameState;
                body = (
                    <JuryReveal
                        key={this.state.key}
                        finalists={gs.houseguests.filter((hg) => !hg.isEvicted)}
                        jurors={gs.houseguests.filter((hg) => hg.isJury && hg.isEvicted)}
                        votes={prompt.votes}
                        onDone={prompt.onDone}
                    />
                );
                break;
            }
            case "gameOver":
                body = (
                    <Panel style={{ maxWidth: "none" }}>
                        <Title>Season over!</Title>
                        <div style={{ overflowX: "auto" }}>{prompt.content}</div>
                    </Panel>
                );
                break;
        }
        const day = prompt.kind !== "gameOver" && prompt.kind !== "handoff" ? controller.dayText() : null;
        return (
            <div className="bbb-player-mode">
                {day && <div className="bbb-day">📅 {day}</div>}
                {banner &&
                    prompt.kind !== "handoff" &&
                    // don't spoil the eviction reveal
                    !(prompt.kind === "scene" && /Eviction/.test(prompt.scene.title)) && (
                        <div className="bbb-banner">{banner}</div>
                    )}
                {!["handoff", "compPlay", "tiebreak", "gameOver", "juryReveal"].includes(prompt.kind) && <LiveFeed controller={controller} />}
                {!["handoff", "compPlay", "tiebreak", "gameOver", "juryReveal"].includes(prompt.kind) && (
                    <div className="bbb-mwall-box">
                        <button
                            type="button"
                            className="bbb-mwall-toggle"
                            onClick={() => {
                                const open = !(this.state.wallOpen ?? loadWallOpen());
                                saveWallOpen(open);
                                this.setState({ wallOpen: open });
                            }}
                        >
                            🧱 House wall {this.state.wallOpen ?? loadWallOpen() ? "▾" : "▸"}
                        </button>
                        {(this.state.wallOpen ?? loadWallOpen()) && <HouseWall controller={controller} />}
                    </div>
                )}
                {body}
            </div>
        );
    }
}
