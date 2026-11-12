import React from "react";
import { Subscription } from "rxjs";
import { continueOverride$ } from "../../subjects/subjects";
import { CompPlay, CompResults, LiveStandings } from "../comps/compRunner";
import { isStaged } from "../comps/compTypes";
import { actorOf, PlayerModeController, Prompt } from "../playerModeController";
import { sessionFor } from "../net/netSession";
import { watchForInspector } from "../net/inspectWatch";
import { OnlineBar, WaitingFor, WaitingOnPlayers } from "./onlineLobby";
import { ChatDock } from "./chatDock";
import { ChoosePrompt } from "./choosePrompt";
import { BigButton, Loading, Panel, Subtle, Title } from "./common";
import { SocialScreen } from "./socialScreen";
import { AllianceScreen } from "./allianceScreen";
import { HohRoomScreen, HohVisitScreen } from "./hohRoomScreen";
import { SpeechPrompt } from "./speechPrompt";
import { JuryQuestionPrompt, JuryReveal, OwnMovesPrompt } from "./finaleScreens";
import { HouseWall } from "./houseWall";
import { LiveFeed } from "./liveFeed";
import { TiebreakPlay, TiebreakResults } from "../comps/tiebreaker";
import { HideTiebreakPlay, HideTiebreakResults } from "../comps/hideTiebreak";
import { MemoryDuelBoard } from "../comps/memoryDuel";
import { KnockoutBoard } from "../comps/knockout";
import { WineDrink, WinePour } from "../comps/taintedWine";
import { rankResults } from "../comps/compRunner";
import { Cue, play } from "../../sound/sound";
import { recordScore } from "../../prefs/prefs";
import { POWERS } from "../social/powers";

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
    personal: { [playerId: number]: Prompt }; // online: players' own screens
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

// The sound a new screen makes, if any. `mine`: the players on this device.
export function cueFor(prompt: Prompt | null, mine: number[]): Cue | null {
    if (!prompt) return null;
    switch (prompt.kind) {
        case "scene": {
            const title = prompt.scene.title || "";
            if (/Nomination Ceremony|Replacement Nominee/.test(title)) return "nominate";
            if (/Eviction$|Live Eviction|Final Eviction/.test(title) && !/Speech/.test(title)) return "evict";
            if (Object.values(POWERS).some((p) => title.includes(p.name))) return "power";
            if (/Competition|Veto Winner|Veto Ceremony|Last Chance/.test(title)) return "reveal";
            return null;
        }
        case "compResults": {
            if (prompt.tiedIds && prompt.tiedIds.length > 1) return "reveal";
            const top = rankResults(prompt.results)[0];
            if (!top) return null;
            if (mine.includes(top.id)) return "win";
            return prompt.results.some((r) => mine.includes(r.id)) ? "lose" : "reveal";
        }
        case "gameOver":
            return "fanfare";
        default:
            return null;
    }
}

// The main player mode screen. Renders whatever the controller is currently asking for.
export class PlayerModeScreen extends React.Component<Props, State> {
    private sub: Subscription | null = null;
    private personalSub: Subscription | null = null;
    private statusSub: Subscription | null = null;
    private changedSub: Subscription | null = null;
    private stopWatch: (() => void) | null = null;
    state: State = { prompt: null, personal: {} };
    // forces child prompts to remount on every new prompt
    private shown: Prompt | null = null;
    private key = 0;

    componentDidMount() {
        const { controller } = this.props;
        continueOverride$.next(controller.continue);
        const session = sessionFor(controller);
        // online, another player's move can arrive while the season is mid-update: render after it's done
        const later = (update: () => void) => (session ? Promise.resolve().then(update) : update());
        this.sub = controller.prompt$.subscribe((prompt) => later(() => this.setState({ prompt }, () => this.cue())));
        this.personalSub = controller.personal$.subscribe((personal) => later(() => this.setState({ personal }, () => this.cue())));
        // online: re-render when players come and go (who's waiting on whom)
        if (session) this.statusSub = session.status$.subscribe(() => this.forceUpdate());
        // online: opening the inspect tools gets a player expelled
        if (session)
            this.stopWatch = watchForInspector(() => {
                const me = session.localPlayerId;
                if (me !== null && !controller.isRuleBreaker(me)) session.reportRuleBreak();
            });
        // online: comp scores coming in live from the other players
        if (session)
            this.changedSub = controller.changed$.subscribe(() => {
                const { prompt } = this.pick();
                const live = prompt && ((prompt.kind === "compPlay" && prompt.live) || (prompt.kind === "waiting" && prompt.comp));
                if (live) later(() => this.forceUpdate());
            });
    }

    // a new season loaded into the same screen (online: fetched again): follow the new controller
    componentDidUpdate(prev: Props) {
        if (prev.controller === this.props.controller) return;
        this.componentWillUnmount();
        this.shown = null;
        this.setState({ prompt: null, personal: {} });
        this.componentDidMount();
    }

    componentWillUnmount() {
        // leaving the screen (e.g. browsing past weeks in the sidebar): restore normal Continue buttons
        continueOverride$.next(null);
        this.sub && this.sub.unsubscribe();
        this.personalSub && this.personalSub.unsubscribe();
        this.statusSub && this.statusSub.unsubscribe();
        this.changedSub && this.changedSub.unsubscribe();
        this.stopWatch && this.stopWatch();
    }

    private cued: Prompt | null = null;
    // a sound for each new screen this device shows
    private cue() {
        const { prompt } = this.pick();
        if (!prompt || prompt === this.cued) return;
        this.cued = prompt;
        const { controller } = this.props;
        const session = sessionFor(controller);
        const mine = session ? (session.localPlayerId !== null ? [session.localPlayerId] : []) : controller.state.humanIds;
        const cue = cueFor(prompt, mine);
        if (cue) play(cue);
        // your best scores, in seasons too
        if (prompt.kind === "compResults" && !prompt.sealed)
            prompt.results.filter((r) => mine.includes(r.id) && !r.threw).forEach((r) => recordScore(prompt.comp.id, r.score));
    }

    // What this device shows: online, its player's own screen if they have one, otherwise the screen everyone
    // shares. (A player who isn't connected has a bot playing for them, after a while: see NetSession.checkAway.)
    private pick(): { prompt: Prompt | null; owner: number | null } {
        const session = sessionFor(this.props.controller);
        const personal = this.state.personal;
        if (session) {
            const mine = session.localPlayerId;
            if (mine !== null && personal[mine] && session.mayActFor(mine)) return { prompt: personal[mine], owner: mine };
        }
        return { prompt: this.state.prompt, owner: null };
    }

    render() {
        const { controller } = this.props;
        const { prompt, owner } = this.pick();
        if (prompt !== this.shown) {
            this.shown = prompt;
            this.key++;
        }
        const key = this.key;
        const banner = controller.bannerText();
        if (!prompt) {
            return (
                <Panel>
                    <Loading text="Opening the house…" />
                </Panel>
            );
        }
        // online: another player's decision shows a waiting screen here
        const session = sessionFor(controller);
        if (session) session.focus(owner);
        const actor = actorOf(prompt);
        const waiting = !!session && actor !== null && (actor !== session.localPlayerId || !session.mayActFor(actor));
        const chrome = waiting ? "waiting" : prompt.kind;
        let body: JSX.Element;
        // online: everyone watches a Memory Duel's board, not a waiting screen
        if (waiting && prompt.kind === "memoryDuel") body = <MemoryDuelBoard key={key} {...prompt} watching onFlip={undefined} />;
        else if (waiting) body = <WaitingFor session={session!} controller={controller} prompt={prompt} />;
        else switch (prompt.kind) {
            case "waiting":
                body = session ? (
                    <WaitingOnPlayers session={session} controller={controller} title={prompt.title} waitingOn={prompt.waitingOn}>
                        {prompt.comp && isStaged(prompt.comp.comp) && (
                            <LiveStandings
                                comp={prompt.comp.comp}
                                participants={prompt.comp.participants}
                                bots={prompt.comp.bots}
                                live={controller.liveScores(prompt.comp.seed, prompt.comp.humanIds)}
                                youId={session.localPlayerId ?? undefined}
                            />
                        )}
                    </WaitingOnPlayers>
                ) : (
                    <Panel>
                        <Subtle>Waiting…</Subtle>
                    </Panel>
                );
                break;
            case "scene":
                body = <div className="bbb-scene">{prompt.scene.render}</div>;
                break;
            case "handoff": {
                const p = controller.player(prompt.playerId);
                body = <Handoff key={key} name={p.name} imageURL={p.imageURL} reason={prompt.reason} onReady={prompt.next} />;
                break;
            }
            case "social":
                body = <SocialScreen key={key} controller={controller} blockName={prompt.blockName} />;
                break;
            case "alliance":
                body = <AllianceScreen key={key} controller={controller} blockName={prompt.blockName} />;
                break;
            case "hohRoom":
                body = <HohRoomScreen key={key} controller={controller} actorId={prompt.actorId} />;
                break;
            case "hohVisit":
                body = <HohVisitScreen key={key} controller={controller} actorId={prompt.actorId} />;
                break;
            case "compPlay": {
                const onDeal = prompt.onDeal;
                const deals =
                    prompt.deals && onDeal
                        ? {
                              offerFrom: prompt.deals.offerFrom,
                              askBot: (botId: number, seconds: number) => onDeal("ask", botId, seconds),
                              accept: (botId: number) => {
                                  onDeal("accept", botId, 0);
                              },
                          }
                        : undefined;
                body = (
                    <CompPlay
                        key={key}
                        title={prompt.title}
                        comp={prompt.comp}
                        participants={prompt.participants}
                        player={controller.player(prompt.playerId)}
                        gameState={controller.gameState}
                        history={controller.state.history}
                        seed={prompt.seed}
                        opponents={prompt.opponents}
                        moreToPlay={prompt.moreToPlay}
                        deals={deals}
                        onScore={prompt.onScore}
                        onStart={prompt.onStart}
                        onReport={prompt.onReport}
                        live={prompt.live ? controller.liveScores(prompt.seed, prompt.live.humanIds) : undefined}
                        forfeitScore={prompt.forfeitScore}
                        autoSubmit={!!session && !!prompt.live}
                    />
                );
                break;
            }
            case "compResults":
                body = (
                    <CompResults
                        key={key}
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
                        key={key}
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
            case "memoryDuel":
                body = <MemoryDuelBoard key={key} {...prompt} />;
                break;
            case "hideTiebreak":
                body = (
                    <HideTiebreakPlay
                        key={key}
                        title={prompt.title}
                        player={controller.player(prompt.playerId)}
                        tied={prompt.tied}
                        spots={prompt.spots}
                        moreToPlay={prompt.moreToPlay}
                        onHide={prompt.onHide}
                    />
                );
                break;
            case "hideResults":
                body = (
                    <HideTiebreakResults
                        key={key}
                        title={prompt.title}
                        spots={prompt.spots}
                        tied={prompt.tied}
                        hides={prompt.hides}
                        winnerId={prompt.winnerId}
                        sealed={prompt.sealed}
                        humanIds={controller.state.humanIds}
                        onDone={prompt.onDone}
                    />
                );
                break;
            case "tiebreakResults":
                body = (
                    <TiebreakResults
                        key={key}
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
                        key={key}
                        title={prompt.title}
                        lines={prompt.lines}
                        remaining={prompt.remaining}
                        out={prompt.out}
                        winner={prompt.winnerId !== undefined ? controller.player(prompt.winnerId) : undefined}
                        youWon={prompt.winnerId !== undefined && !controller.multiplayer && controller.isHuman({ id: prompt.winnerId })}
                        emoji={prompt.emoji}
                        name={prompt.name}
                        captions={prompt.captions}
                        onDone={prompt.onDone}
                    />
                );
                break;
            case "winePour":
                body = (
                    <WinePour
                        key={key}
                        title={prompt.title}
                        pourer={controller.player(prompt.pourerId)}
                        target={controller.player(prompt.targetId)}
                        strikes={prompt.strikes}
                        onPour={prompt.onPour}
                    />
                );
                break;
            case "wineDrink":
                body = (
                    <WineDrink
                        key={key}
                        title={prompt.title}
                        pourer={controller.player(prompt.pourerId)}
                        drinker={controller.player(prompt.drinkerId)}
                        claim={prompt.claim}
                        tell={prompt.tell}
                        strikes={prompt.strikes}
                        onDecide={prompt.onDecide}
                    />
                );
                break;
            case "speech":
                body = (
                    <SpeechPrompt
                        key={key}
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
                        key={key}
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
                    <OwnMovesPrompt key={key} finalist={controller.player(prompt.actorId)} moves={prompt.moves} onDone={prompt.onDone} />
                );
                break;
            case "juryQuestion":
                body = (
                    <JuryQuestionPrompt
                        key={key}
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
                        key={key}
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
                {session && <OnlineBar session={session} controller={controller} />}
                {day && <div className="bbb-day">📅 {day}</div>}
                {banner &&
                    prompt.kind !== "handoff" &&
                    // don't spoil the eviction reveal
                    !(prompt.kind === "scene" && /Eviction/.test(prompt.scene.title)) && (
                        <div className="bbb-banner">{banner}</div>
                    )}
                {!["handoff", "compPlay", "tiebreak", "hideTiebreak", "memoryDuel", "winePour", "wineDrink", "gameOver", "juryReveal"].includes(chrome) && <LiveFeed controller={controller} />}
                {!["handoff", "compPlay", "tiebreak", "hideTiebreak", "memoryDuel", "winePour", "wineDrink", "gameOver", "juryReveal"].includes(chrome) && (
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
                {session && session.localPlayerId !== null && controller.isRuleBreaker(session.localPlayerId) && (
                    <div className="bbb-banner bbb-rule-breaker">
                        🚨 You were expelled for breaking the rules: no inspect tools during an online game. You can keep watching.
                    </div>
                )}
                {session && owner === null && actor === null && !session.amHost && !session.everyoneContinues && prompt.kind !== "gameOver" && prompt.kind !== "waiting" && (
                    <div className="bbb-online-note">⏩ The host moves the show along from here.</div>
                )}
                {body}
                {session && <ChatDock session={session} controller={controller} />}
            </div>
        );
    }
}
