import React from "react";
import { Subscription } from "rxjs";
import { continueOverride$ } from "../../subjects/subjects";
import { CompPlay, CompResults } from "../comps/compRunner";
import { PlayerModeController, Prompt } from "../playerModeController";
import { ChoosePrompt } from "./choosePrompt";
import { BigButton, Panel, Subtle, Title } from "./common";
import { SocialScreen } from "./socialScreen";

interface Props {
    controller: PlayerModeController;
}

interface State {
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
                        onDone={prompt.onDone}
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
                        resolve={prompt.resolve}
                    />
                );
                break;
            case "gameOver":
                body = (
                    <Panel style={{ maxWidth: "none" }}>
                        <Title>Season over!</Title>
                        <div style={{ overflowX: "auto" }}>{prompt.content}</div>
                    </Panel>
                );
                break;
        }
        return (
            <div className="bbb-player-mode">
                {banner &&
                    prompt.kind !== "handoff" &&
                    // don't spoil the eviction reveal
                    !(prompt.kind === "scene" && /Eviction/.test(prompt.scene.title)) && (
                        <div className="bbb-banner">{banner}</div>
                    )}
                {body}
            </div>
        );
    }
}
