import React from "react";
import { DAY_PART, dayLabel } from "../days";
import { shuffle } from "lodash";
import { defaultJurySize, validateJurySize, Episode, EpisodeType, getById, getComp, getSocial, PlayerProfile } from "../../model";
import { cast$, episodes$, getCast, newEpisode } from "../../subjects/subjects";
import { PregameEpisode } from "../../components/episode/pregameEpisode";
import { activatePlayerMode, Difficulty, migrateSave, newPlayerSave, PlayerModeController, PlayerSave } from "../playerModeController";
import { ALL_POWERS, PowerId, POWERS } from "../social/powers";
import { clearSave, inlineBlobImages, readSave } from "../save/serialize";
import { buildSeason } from "../setupGame";
import { BigButton, Face, Grid, Loading, Panel, Stepper, Subtle, Title } from "./common";
import { DifficultyPicker, RulesEditor } from "./rulesEditor";
import { DEFAULT_RULES, SeasonRules, withDefaults } from "../rules";
import { loadCareer } from "../../career/career";
import { t } from "../../i18n/i18n";
import { cartoonFor } from "../../cartoon/cartoon";
import { FaceEditor, Look } from "./faceEditor";
import { PlayerModeScreen } from "./playerModeScreen";
import { loadPref, savePref } from "../../prefs/prefs";
import { statRoll } from "../../cartoon/cartoon";

export { Stepper };

let launches = 0;

export function launch(controller: PlayerModeController) {
    // a fresh screen for every season loaded: online, a device that fetches the season again gets a new
    // controller, and the screen must follow it rather than keep showing the old one
    const key = ++launches;
    activatePlayerMode(controller, () => <PlayerModeScreen key={key} controller={controller} />);
}

// The cast to pick from, and season settings from the season editor if the user set one up.
export function castSource(): { cast: PlayerProfile[]; hohPlaysVeto: boolean } {
    const current = episodes$.value;
    if (current && current.gameState.phase === 0 && current.gameState.houseguests.length > 2) {
        return { cast: current.gameState.houseguests, hohPlaysVeto: current.gameState.hohPlaysVeto };
    }
    return { cast: getCast(), hohPlaysVeto: true };
}

const MIN_HOUSEGUESTS = 4;


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
    // the last season's settings, remembered on this device
    const [hideSkills, setHideSkills] = React.useState(() => loadPref("setup.hideSkills", false));
    const [difficulty, setDifficulty] = React.useState<Difficulty>(() => loadPref<Difficulty>("setup.difficulty", "normal"));
    // secret powers: none, a surprise (picked at random, never shown), or hand-picked
    const [powerMode, setPowerMode] = React.useState<"off" | "surprise" | "choose">(() => loadPref("setup.powerMode", "off"));
    const [chosenPowers, setChosenPowers] = React.useState<PowerId[]>(() => loadPref<PowerId[]>("setup.powers", []).filter((p) => ALL_POWERS.includes(p)));
    React.useEffect(() => savePref("setup.hideSkills", hideSkills), [hideSkills]);
    React.useEffect(() => savePref("setup.difficulty", difficulty), [difficulty]);
    React.useEffect(() => savePref("setup.powerMode", powerMode), [powerMode]);
    React.useEffect(() => savePref("setup.powers", chosenPowers), [chosenPowers]);
    const [rules, setRules] = React.useState<SeasonRules>(() => withDefaults(loadPref<Partial<SeasonRules>>("setup.rules", {})));
    const [hohVeto, setHohVeto] = React.useState<boolean>(() => loadPref("setup.hohPlaysVeto", hohPlaysVeto));
    const [juryPick, setJuryPick] = React.useState<number | null>(null);
    React.useEffect(() => savePref("setup.rules", rules), [rules]);
    React.useEffect(() => savePref("setup.hohPlaysVeto", hohVeto), [hohVeto]);
    // a guided season: on until you've finished a season, then whatever you picked last
    const [firstTimer] = React.useState(() => loadCareer().seasons.length === 0);
    const [guided, setGuided] = React.useState<boolean>(() => loadPref("setup.guided", firstTimer));
    React.useEffect(() => savePref("setup.guided", guided), [guided]);
    // a gentle first season: a small house, easy bots, no twists, and the coach
    const firstSeason = () => {
        setBotCount(Math.max(MIN_HOUSEGUESTS - playerCount, 8 - playerCount));
        setDifficulty("easy");
        setPowerMode("off");
        setHideSkills(false);
        setRules(DEFAULT_RULES);
        setHohVeto(true);
        setJuryPick(null);
        setGuided(true);
    };

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
    const maxJury = Math.max(1, houseguests - 2 - ((houseguests - 2) % 2 === 0 ? 1 : 0));
    const jury = juryPick !== null && validateJurySize(juryPick, houseguests) ? juryPick : defaultJurySize(houseguests);
    // the jury can never tie: it moves in steps of two
    const changeJury = (n: number) => setJuryPick(Math.max(1, Math.min(maxJury, n > jury ? jury + 2 : jury - 2)));

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
        const profile: PlayerProfile = { name, imageURL: newPhoto || cartoonFor(name), social: 5, comp: 5 };
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
        // straight into designing their avatar
        if (!newPhoto) setEditing(index);
    };

    const start = async () => {
        if (!ready) return;
        setStarting(true);
        clearSave();
        // skill randomizer: everyone gets secret, random Social and Comp scores
        const roll = () => statRoll(Math.random);
        const players = hideSkills ? pool.map((hg) => ({ ...hg, social: roll(), comp: roll() })) : pool;
        const setup = buildSeason(players, selected, bots, cast$.value.options || {}, hohVeto, jury);
        // make uploaded portraits survive a reload
        await inlineBlobImages(setup.gameState.houseguests);
        const powers = powerMode === "surprise" ? "surprise" : powerMode === "choose" ? chosenPowers : [];
        const save = newPlayerSave(setup.gameState, setup.humanIds, setup.castOptions, hideSkills, { difficulty, powers, rules, guided });
        await newEpisode(null);
        await newEpisode(new PregameEpisode(setup.gameState));
        launch(new PlayerModeController(save));
    };

    const role = (i: number) => (selected.includes(i) ? "player" : bots.includes(i) ? "bot" : "out");
    const instructions =
        selected.length < playerCount
            ? playerCount === 1
                ? t("Tap the houseguest you'll play as, or join under your own name.")
                : t("Tap a houseguest for each player, or join under your own names ({n}/{total}).", { n: selected.length, total: playerCount })
            : t("Ready! Bots are picked at random from the rest of the cast.");

    if (starting)
        return (
            <Panel>
                <Loading text={t("Moving everyone into the house…")} detail={t("Packing suitcases, hiding cameras, assigning beds.")} />
            </Panel>
        );
    return (
        <Panel>
            <div className="bbb-hero small">
                <div className="bbb-hero-kicker">{t("Player mode")}</div>
                <Title>{t("Set up your season")}</Title>
                <Subtle>
                    {t(
                        "Choose how many people are playing and how many bots join them. With 2 or more players, pass this device around for secret moves. (To play on separate devices, use Play online on the start screen.)"
                    )}
                </Subtle>
            </div>
            <div className={"bbb-guided" + (firstTimer ? " is-first" : "")}>
                <label className="bbb-toggle">
                    <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} />
                    <span>
                        🎓 <b>{t("Guided season")}</b>: {t("a coach explains each part of the week the first time it comes up. Great for a first season.")}
                    </span>
                </label>
                <button type="button" className="button is-small is-info is-light" onClick={firstSeason}>
                    ✨ {t("Set up a gentle first season for me")}
                </button>
            </div>
            <div className="bbb-steppers">
                <Stepper label={"🎮 " + t("Players")} value={playerCount} min={1} max={maxPlayers} onChange={changePlayers} />
                <Stepper label={"🤖 " + t("Bots")} value={effectiveBots} min={minBots} max={maxBots} onChange={setBotCount} />
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
                    placeholder={t("Or play as yourself: type your name")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <label className="button is-light" title={t("Optional photo")}>
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
                    ✏️ {t("Join")}
                </button>
            </form>
            {selected.length > 0 && (
                <div className="bbb-looks">
                    {selected.map((i, n) => (
                        <button key={i} type="button" className="bbb-look" onClick={() => setEditing(editing === i ? null : i)}>
                            <img src={pool[i].imageURL} alt="" />
                            <span>
                                <b>{t("Player {n}", { n: n + 1 })}</b>: {pool[i].name}
                                <br />
                                <small>✏️ {t("Change name & face")}</small>
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
                    🎲 <b>{t("Skill randomizer")}</b>:{" "}
                    {t("give everyone secret, random Social and Comp scores, so nobody knows who's strongest. Revealed when the season ends.")}
                </span>
            </label>
            <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            <div className="bbb-setting">
                <b>🤫 {t("Secret powers")}</b>
                <div className="bbb-segmented">
                    {(["off", "surprise", "choose"] as const).map((m) => (
                        <button key={m} type="button" className={powerMode === m ? "is-active" : ""} onClick={() => setPowerMode(m)}>
                            {m === "off" ? t("Off") : m === "surprise" ? t("Surprise me") : t("Choose")}
                        </button>
                    ))}
                </div>
                <Subtle>
                    {powerMode === "off"
                        ? t("A classic season: no twists.")
                        : powerMode === "surprise"
                        ? t("A few secret powers and twists, picked at random. Nobody (you included) knows which until they show up.")
                        : t("Pick the powers and twists in play. The houseguests won't know which ones exist until they show up.")}
                </Subtle>
                {powerMode === "choose" &&
                    ALL_POWERS.map((id) => (
                        <label key={id} className="bbb-toggle">
                            <input
                                type="checkbox"
                                checked={chosenPowers.includes(id)}
                                onChange={(e) => setChosenPowers(e.target.checked ? [...chosenPowers, id] : chosenPowers.filter((p) => p !== id))}
                            />
                            <span>
                                {POWERS[id].emoji} <b>{t(POWERS[id].name)}</b>: {t(POWERS[id].blurb)}
                            </span>
                        </label>
                    ))}
            </div>
            <RulesEditor
                rules={rules}
                onChange={setRules}
                jury={{ value: jury, min: 1, max: maxJury, onChange: changeJury }}
                hohPlaysVeto={{ value: hohVeto, onChange: setHohVeto }}
            />
            <div className="bbb-setup-summary">
                <b>{houseguests}</b> {t("houseguests")} · {t("jury of")} <b>{jury}</b> · {t("final")} <b>2</b>
            </div>
            <Subtle>
                {instructions}
                {bots.length < total - selected.length && (
                    <>
                        {" "}
                        <button type="button" className="bbb-link-button" onClick={() => setBotOrder(shuffle(cast.map((_, i) => i)))}>
                            🔀 {t("Shuffle bots")}
                        </button>
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
                                <b>🎮 {t("Player {n}", { n: selected.indexOf(i) + 1 })}</b>
                            ) : isCustom(i) ? (
                                <span>{t("tap to play")}</span>
                            ) : role(i) === "bot" ? (
                                hideSkills ? (
                                    <span>🤖 🗣️? 🏆?</span>
                                ) : (
                                    <span>
                                        🤖 🗣️{getSocial(hg)} 🏆{getComp(hg)}
                                    </span>
                                )
                            ) : (
                                <span>{t("sitting out")}</span>
                            )
                        }
                    />
                ))}
            </Grid>
            <Subtle>
                {t(
                    "🗣️ Social and 🏆 Comp scores are set on the casting screen (or rolled in secret by the skill randomizer). Bots use both. For players, Social boosts your social moves and your sway in alliances; your comp results are all you."
                )}
            </Subtle>
            <BigButton kind="success" disabled={!ready || starting} onClick={start}>
                {starting ? t("Starting…") : t("Enter the house")}
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
    showSeasonSoFar(save, false);
    launch(new PlayerModeController(save));
    return true;
}

// Resets the sidebar for a season that's starting (fresh) or picking up where it was.
export function showSeasonSoFar(save: PlayerSave, fresh: boolean) {
    const gs = save.gameState;
    if (fresh) {
        newEpisode(null);
        newEpisode(new PregameEpisode(gs));
        return;
    }
    const name = (id?: number) => (id === undefined ? "?" : getById(gs, id).name);
    newEpisode(null);
    newEpisode(
        new Episode({
            scenes: [],
            title: "Earlier weeks",
            gameState: gs,
            content: (
                <Panel>
                    <Title>Previously on The Houseguests…</Title>
                    {save.history.length === 0 && <Subtle>The season just started.</Subtle>}
                    {save.history.map((w) => (
                        <p key={w.week}>
                            <b>{dayLabel(gs, w.week, DAY_PART.eviction)}:</b> 👑 {name(w.hohId)} won HoH · 🛡️ {name(w.povId)} won the veto · 🚪{" "}
                            {w.evictedIds.map(name).join(", ")} evicted
                        </p>
                    ))}
                </Panel>
            ),
            type: ResumedEpisodeType,
        })
    );
}
