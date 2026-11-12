import { defaultJurySize, GameState } from "../model";
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
