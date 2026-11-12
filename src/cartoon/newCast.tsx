import { defaultJurySize, GameState, PlayerProfile } from "../model";
import { PregameEpisode } from "../components/episode/pregameEpisode";
import { newEpisode, overwriteCast, pushToMainContentStream } from "../subjects/subjects";
import { Screens } from "../components/topbar/topBar";
import { cartoonCast } from "./cartoon";

export const DEFAULT_CAST_SIZE = 16;

// A brand-new cast of cartoon houseguests, all different. `show`: go to the cast screen.
export function dealNewCast(show: boolean = true, size: number = DEFAULT_CAST_SIZE): PregameEpisode {
    const cast = cartoonCast(size);
    const episode = new PregameEpisode(new GameState({ players: cast, jury: defaultJurySize(cast.length) }));
    newEpisode(episode);
    overwriteCast(cast);
    if (show) pushToMainContentStream(episode.render, Screens.Ingame);
    return episode;
}

// A cast someone shared (a code or link): it becomes the cast, with any custom relationships it came with.
export function loadCast(cast: PlayerProfile[], relationships?: { [a: number]: { [b: number]: number } }, show: boolean = true): PregameEpisode {
    const episode = new PregameEpisode(new GameState({ players: cast, jury: defaultJurySize(cast.length) }));
    newEpisode(episode);
    overwriteCast(cast, relationships ? { relationships } : undefined);
    if (show) pushToMainContentStream(episode.render, Screens.Ingame);
    return episode;
}
