import React from "react";
import FileDrop from "react-file-drop";
import { PlayerProfile, getSocial, getComp } from "../../model";
import { SetupPortrait } from "../playerPortrait/setupPortrait";
import { shuffle } from "lodash";
import { RandomButton } from "./randomXButton";
import { selectCastPlayer } from "../playerPortrait/selectedPortrait";
import { cast$, pushToMainContentStream, selectedCastPlayer$, overwriteCast } from "../../subjects/subjects";
import { CastShare } from "./castShare";
import { SharedCast } from "../../cartoon/castCode";
import { HasText, Input } from "../layout/text";
import { Centered } from "../layout/centered";
import { Subscription } from "rxjs";
import { HelpLink } from "../episode/allianceList";
import { SeasonEditorPage } from "../seasonEditor/seasonEditorPage";
import { Screens } from "../topbar/topBar";

interface CastingScreenProps {
    cast?: PlayerProfile[];
}

interface CastingScreenState {
    players: PlayerProfile[];
    selectedPlayers: Set<number>;
    // custom relationships, and the cast (by name, in order) they're for: dropped once the cast changes
    relationships?: { names: string[]; map: { [a: number]: { [b: number]: number } } };
}

let id = 1;

export class CastingScreen extends React.Component<CastingScreenProps, CastingScreenState> {
    private sub: Subscription | null = null;

    constructor(props: CastingScreenProps) {
        super(props);
        if (props.cast) {
            selectCastPlayer(null);
            props.cast.forEach((player) => (player.castingScreenId = id++));
        }
        const options = cast$.value.options;
        const relationships =
            props.cast && options && options.relationships ? { names: props.cast.map((p) => p.name), map: options.relationships } : undefined;
        this.state = { players: props.cast || [], selectedPlayers: new Set<number>(), relationships };
    }

    public componentDidMount() {
        this.sub = selectedCastPlayer$.subscribe((selectedPlayers) => {
            this.setState({ selectedPlayers });
        });
    }

    public componentWillUnmount() {
        if (this.sub) this.sub.unsubscribe();
    }

    private deleteMethod(i: number, castingScreenId: number) {
        return () => {
            const newState = { ...this.state };
            newState.players.splice(i, 1);
            if (newState.selectedPlayers.has(castingScreenId)) {
                selectCastPlayer(castingScreenId);
            }
            this.setState(newState);
        };
    }

    private rename(i: number) {
        return () => {
            const newState = { ...this.state };
            const newName: string | null = prompt(`Enter a new name for ${newState.players[i].name}`);
            if (!newName) return;
            newState.players[i].name = newName;
            this.setState(newState);
        };
    }

    private setStat(i: number) {
        return (stat: "social" | "comp", value: number) => {
            const newState = { ...this.state };
            newState.players[i][stat] = value;
            this.setState(newState);
        };
    }

    private getFiles() {
        const players = this.state.players;
        if (!players) {
            return;
        }
        const rows: JSX.Element[] = [];
        let i = 0;
        players.forEach((player) =>
            rows.push(
                <SetupPortrait
                    name={player.name}
                    imageUrl={player.imageURL}
                    onDelete={this.deleteMethod(i, player.castingScreenId || -1)}
                    onClick={() => {
                        selectCastPlayer(player.castingScreenId || -1);
                    }}
                    onRename={this.rename(i)}
                    social={getSocial(player)}
                    comp={getComp(player)}
                    onStatChange={this.setStat(i)}
                    selected={this.state.selectedPlayers.has(player.castingScreenId || -1)}
                    key={(++i).toString()}
                />
            )
        );
        return <div className="columns is-gapless is-mobile is-multiline is-centered">{rows}</div>;
    }

    // the custom relationships, if they're still for this exact cast
    private currentRelationships() {
        const r = this.state.relationships;
        const names = this.state.players.map((p) => p.name);
        return r && r.names.length === names.length && r.names.every((n, i) => n === names[i]) ? r.map : undefined;
    }

    private importCast = (shared: SharedCast) => {
        const players = shared.cast.map((p) => ({ ...p, castingScreenId: id++ }));
        selectCastPlayer(null);
        this.setState({ players, relationships: shared.relationships ? { names: players.map((p) => p.name), map: shared.relationships } : undefined });
    };

    private submit = () => {
        const relationships = this.currentRelationships();
        overwriteCast(this.state.players, relationships ? { relationships } : undefined);
        pushToMainContentStream(<SeasonEditorPage />, Screens.Season);
    };

    private random = (_amount: number) => {
        // get all the selected players first
        let result: PlayerProfile[] = [];
        let amount = _amount;

        const allPlayers = this.state.players;
        let unselectedPlayers: PlayerProfile[] = [];

        allPlayers.forEach((player) => {
            if (this.state.selectedPlayers.has(player.castingScreenId || -1)) {
                result.push(player);
                amount--;
            } else {
                unselectedPlayers.push(player);
            }
        });

        if (amount > 0) {
            unselectedPlayers = shuffle(unselectedPlayers);
            unselectedPlayers = unselectedPlayers.slice(0, amount);
        }
        let players = amount > 0 ? result.concat(unselectedPlayers) : result;
        players = shuffle(players);
        this.setState({ players });
    };

    public render() {
        return (
            <FileDrop onDrop={this.handleDrop}>
                <HasText className="level">
                    <div className="level-item">
                        <button
                            className="button is-danger"
                            onClick={() => {
                                this.setState({ players: [] });
                                selectCastPlayer(null);
                            }}
                        >
                            Delete all
                        </button>
                    </div>
                    <div className="level-item">
                        <button
                            className="button is-danger"
                            disabled={this.state.selectedPlayers.size === 0}
                            onClick={() => {
                                const players = this.state.players.filter(
                                    (player) => !this.state.selectedPlayers.has(player.castingScreenId || -1)
                                );
                                this.setState({ players });
                                selectCastPlayer(null);
                            }}
                        >
                            Delete selected
                        </button>
                    </div>
                    <div className="level-item">
                        <button
                            className="button is-warning"
                            onClick={() => selectCastPlayer(null)}
                            disabled={this.state.selectedPlayers.size === 0}
                        >
                            Unselect {this.state.selectedPlayers.size || "all"}
                        </button>
                    </div>
                    <div className="level-item">
                        <RandomButton random={this.random} />
                    </div>
                    <div className="level-item">
                        <button
                            className="button is-success"
                            disabled={this.state.players.length < 3}
                            onClick={this.submit}
                        >
                            Next
                        </button>
                    </div>
                </HasText>
                <CastShare cast={this.state.players} relationships={this.currentRelationships()} onImport={this.importCast} />
                <Input type="file" multiple onChange={this.handleUpload} />
                {this.state.players.length === 0 && (
                    <Centered>
                        ~ Drop images here ~
                        <br />
                        <br />
                        <HelpLink
                            href="https://github.com/spaulmark/bb-bots/blob/master/README.md#upload-your-own-characters"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Need help setting up a game?
                        </HelpLink>
                    </Centered>
                )}
                {this.getFiles()}
            </FileDrop>
        );
    }

    private handleUpload = (event: any) => {
        this.handleFiles(event.target.files);
    };

    private handleDrop = (files: FileList | null) => {
        if (!files) return;
        this.handleFiles(files);
    };

    private handleFiles(files: FileList) {
        const newState = { ...this.state };
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.match(/image\/*/)) {
                newState.players.push({
                    name: file.name.substr(0, file.name.lastIndexOf(".")) || file.name,
                    imageURL: URL.createObjectURL(file),
                    castingScreenId: id++,
                });
            }
        }
        this.setState(newState);
    }
}
