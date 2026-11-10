import React from "react";
import { shuffle } from "lodash";
import { defaultJurySize, Episode, EpisodeType, getById, getComp, getSocial, PlayerProfile } from "../../model";
import { cast$, episodes$, getCast, newEpisode } from "../../subjects/subjects";
import { PregameEpisode } from "../../components/episode/pregameEpisode";
import { activatePlayerMode, migrateSave, newPlayerSave, PlayerModeController } from "../playerModeController";
import { clearSave, inlineBlobImages, readSave } from "../save/serialize";
import { buildSeason } from "../setupGame";
import { BigButton, Face, Grid, Panel, Subtle, Title } from "./common";
import { initialsAvatar } from "./avatar";
import { FaceEditor, Look } from "./faceEditor";
import { PlayerModeScreen } from "./playerModeScreen";

function launch(controller: PlayerModeController) {
    activatePlayerMode(controller, () => <PlayerModeScreen controller={controller} />);
}

// The cast to pick from, and season settings from the season editor if the user set one up.
function castSource(): { cast: PlayerProfile[]; hohPlaysVeto: boolean } {
    const current = episodes$.value;
    if (current && current.gameState.phase === 0 && current.gameState.houseguests.length > 2) {
        return { cast: current.gameState.houseguests, hohPlaysVeto: current.gameState.hohPlaysVeto };
    }
    return { cast: getCast(), hohPlaysVeto: true };
}

const MIN_HOUSEGUESTS = 4;

function Stepper(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
    return (
        <div className="bbb-stepper">
            <span className="bbb-stepper-label">{props.label}</span>
            <button
                type="button"
                className="button is-light"
                disabled={props.value <= props.min}
                onClick={() => props.onChange(props.value - 1)}
            >
                −
            </button>
            <span className="bbb-stepper-value">{props.value}</span>
            <button
                type="button"
                className="button is-light"
                disabled={props.value >= props.max}
                onClick={() => props.onChange(props.value + 1)}
            >
                +
            </button>
        </div>
    );
}

export function PlayerSetup() {
    const [{ cast, hohPlaysVeto }] = React.useState(castSource);
    const total = cast.length;
    const [playerCount, setPlayerCount] = React.useState(1);
    // players who joined under their own name; they come after the cast in `pool` and are never bots
    const [customs, setCustoms] = React.useState<PlayerProfile[]>([]);
    const [newName, setNewName] = React.useState("");
    const [newPhoto, setNewPhoto] = React.useState<string | null>(null);
    const [selected, setSelected] = React.useState<number[]>([]); // pool indexes of the players
    const [botCount, setBotCount] = React.useState(Math.max(0, total - 1));
    const [botOrder, setBotOrder] = React.useState<number[]>(() => shuffle(cast.map((_, i) => i)));
    const [starting, setStarting] = React.useState(false);
    // players' chosen names and faces, by pool index
    const [looks, setLooks] = React.useState<{ [i: number]: Look }>({});
    const [editing, setEditing] = React.useState<number | null>(null);
    const [hideSkills, setHideSkills] = React.useState(false);

    const basePool = [...cast, ...customs];
    const pool: PlayerProfile[] = basePool.map((hg, i) => (looks[i] && selected.includes(i) ? { ...hg, ...looks[i] } : hg));
    const isCustom = (i: number) => i >= total;
    const castPlayers = selected.filter((i) => !isCustom(i)).length;
    const unassigned = playerCount - selected.length; // players who haven't picked yet might pick from the cast

    const maxPlayers = Math.max(1, total - 1 + customs.length);
    const minBots = Math.max(0, MIN_HOUSEGUESTS - playerCount);
    const maxBots = Math.max(0, total - castPlayers - unassigned);
    const effectiveBots = Math.max(minBots, Math.min(botCount, maxBots));
    const bots = botOrder.filter((i) => !selected.includes(i)).slice(0, effectiveBots);
    const houseguests = playerCount + effectiveBots;
    const jury = defaultJurySize(houseguests);

    const changePlayers = (n: number) => {
        setPlayerCount(n);
        if (selected.length > n) setSelected(selected.slice(0, n));
    };

    const toggle = (i: number) => {
        if (selected.includes(i)) setSelected(selected.filter((s) => s !== i));
        else if (selected.length < playerCount) setSelected([...selected, i]);
        else if (playerCount === 1) setSelected([i]);
    };

    const ready = selected.length === playerCount && selected.length + bots.length >= MIN_HOUSEGUESTS;

    // join under your own name: adds you to the pool and makes you a player
    const addYourself = () => {
        const name = newName.trim();
        if (!name) return;
        const profile: PlayerProfile = { name, imageURL: newPhoto || initialsAvatar(name), social: 5, comp: 5 };
        const index = total + customs.length;
        setCustoms([...customs, profile]);
        setNewName("");
        setNewPhoto(null);
        if (selected.length < playerCount) {
            setSelected([...selected, index]);
        } else {
            setPlayerCount(selected.length + 1);
            setSelected([...selected, index]);
        }
    };

    const start = async () => {
        if (!ready) return;
        setStarting(true);
        clearSave();
        // skill randomizer: everyone gets secret, random Social and Comp scores
        const roll = () => Math.round(1 + 9 * ((Math.random() + Math.random()) / 2));
        const players = hideSkills ? pool.map((hg) => ({ ...hg, social: roll(), comp: roll() })) : pool;
        const setup = buildSeason(players, selected, bots, cast$.value.options || {}, hohPlaysVeto);
        // make uploaded portraits survive a reload
        await inlineBlobImages(setup.gameState.houseguests);
        await newEpisode(null);
        await newEpisode(new PregameEpisode(setup.gameState));
        launch(new PlayerModeController(newPlayerSave(setup.gameState, setup.humanIds, setup.castOptions, hideSkills)));
    };

    const role = (i: number) => (selected.includes(i) ? "player" : bots.includes(i) ? "bot" : "out");
    const instructions =
        selected.length < playerCount
            ? playerCount === 1
                ? "Tap the houseguest you'll play as, or join under your own name."
                : `Tap a houseguest for each player, or join under your own names (${selected.length}/${playerCount}).`
            : "Ready! Bots are picked at random from the rest of the cast.";

    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">Player mode</div>
                <Title>Set up your season</Title>
                <Subtle>
                    Choose how many people are playing and how many bots join them. With 2 or more players, you pass
                    this device around for secret moves.
                </Subtle>
            </div>
            <div className="bbb-steppers">
                <Stepper label="🎮 Players" value={playerCount} min={1} max={maxPlayers} onChange={changePlayers} />
                <Stepper label="🤖 Bots" value={effectiveBots} min={minBots} max={maxBots} onChange={setBotCount} />
            </div>
            <form
                className="bbb-add-yourself"
                onSubmit={(e) => {
                    e.preventDefault();
                    addYourself();
                }}
            >
                <input
                    className="input"
                    type="text"
                    maxLength={24}
                    placeholder="Or play as yourself: type your name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <label className="button is-light" title="Optional photo">
                    {newPhoto ? "📷 ✓" : "📷"}
                    <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                            const file = e.target.files && e.target.files[0];
                            if (file) setNewPhoto(URL.createObjectURL(file));
                        }}
                    />
                </label>
                <button type="submit" className="button is-warning" disabled={!newName.trim()}>
                    ✏️ Join
                </button>
            </form>
            {selected.length > 0 && (
                <div className="bbb-looks">
                    {selected.map((i, n) => (
                        <button key={i} type="button" className="bbb-look" onClick={() => setEditing(editing === i ? null : i)}>
                            <img src={pool[i].imageURL} alt="" />
                            <span>
                                <b>Player {n + 1}</b>: {pool[i].name}
                                <br />
                                <small>✏️ Change name & face</small>
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {editing !== null && selected.includes(editing) && (
                <FaceEditor
                    key={editing}
                    original={{ name: basePool[editing].name, imageURL: basePool[editing].imageURL }}
                    current={{ name: pool[editing].name, imageURL: pool[editing].imageURL }}
                    onSave={(look) => {
                        setLooks({ ...looks, [editing]: look });
                        setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                />
            )}
            <label className="bbb-toggle">
                <input type="checkbox" checked={hideSkills} onChange={(e) => setHideSkills(e.target.checked)} />
                <span>
                    🎲 <b>Skill randomizer</b>: give everyone secret, random Social and Comp scores, so nobody knows who's
                    strongest. Revealed when the season ends.
                </span>
            </label>
            <div className="bbb-setup-summary">
                <b>{houseguests}</b> houseguests · jury of <b>{jury}</b> · final <b>2</b>
            </div>
            <Subtle>
                {instructions}
                {bots.length < total - selected.length && (
                    <>
                        {" "}
                        <a onClick={() => setBotOrder(shuffle(cast.map((_, i) => i)))}>🔀 Shuffle bots</a>
                    </>
                )}
            </Subtle>
            <Grid>
                {pool.map((hg, i) => (
                    <Face
                        key={i}
                        hg={hg}
                        selected={role(i) === "player"}
                        dim={role(i) === "out"}
                        onClick={() => toggle(i)}
                        caption={
                            role(i) === "player" ? (
                                <b>🎮 Player {selected.indexOf(i) + 1}</b>
                            ) : isCustom(i) ? (
                                <span>tap to play</span>
                            ) : role(i) === "bot" ? (
                                hideSkills ? (
                                    <span>🤖 🗣️? 🏆?</span>
                                ) : (
                                    <span>
                                        🤖 🗣️{getSocial(hg)} 🏆{getComp(hg)}
                                    </span>
                                )
                            ) : (
                                <span>sitting out</span>
                            )
                        }
                    />
                ))}
            </Grid>
            <Subtle>
                🗣️ Social and 🏆 Comp scores are set on the casting screen (or rolled in secret by the skill randomizer).
                Bots use both. For players, Social boosts your social moves and your sway in alliances; your comp results
                are all you.
            </Subtle>
            <BigButton kind="success" disabled={!ready || starting} onClick={start}>
                {starting ? "Starting…" : "Enter the house"}
            </BigButton>
        </Panel>
    );
}

const ResumedEpisodeType: EpisodeType = {
    canPlayWith: () => true,
    eliminates: 0,
    hideViewsBar: true,
    name: "Earlier weeks",
    generate: () => {
        throw new Error("The resumed-season summary is not generated.");
    },
};

// Resumes a saved player mode season. Past weeks' scenes aren't saved, so the sidebar starts with a
// summary of what happened (no votes; those stay secret until the end).
export function resumeSavedSeason(): boolean {
    const save = migrateSave(readSave<any>());
    if (!save) return false;
    const gs = save.gameState;
    const name = (id?: number) => (id === undefined ? "?" : getById(gs, id).name);
    newEpisode(null);
    newEpisode(
        new Episode({
            scenes: [],
            title: "Earlier weeks",
            gameState: gs,
            content: (
                <Panel>
                    <Title>Previously on Big Brother…</Title>
                    {save.history.length === 0 && <Subtle>The season just started.</Subtle>}
                    {save.history.map((w) => (
                        <p key={w.week}>
                            <b>Week {w.week}:</b> 👑 {name(w.hohId)} won HoH · 🛡️ {name(w.povId)} won the veto · 🚪{" "}
                            {w.evictedIds.map(name).join(", ")} evicted
                        </p>
                    ))}
                </Panel>
            ),
            type: ResumedEpisodeType,
        })
    );
    launch(new PlayerModeController(save));
    return true;
}
