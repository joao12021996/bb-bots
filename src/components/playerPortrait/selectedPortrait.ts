import { Houseguest } from "../../model";
import { RelationshipMap } from "../../utils";
import {
    displayMode$,
    relationshipsHidden,
    getSelectedCastPlayers,
    getSelectedPlayer,
    selectedCastPlayer$,
    selectedPlayer$,
    knownProfile$,
} from "../../subjects/subjects";
import { powerMode } from "../../model/portraitDisplayMode";
import { PortraitProps } from "./houseguestPortrait";

export interface SelectedPlayerData {
    id: number;
    name: string;
    popularity: number;
    relationships: RelationshipMap;
    isEvicted: boolean;
    superiors?: { [id: number]: number };
}

export function isSomeoneElseSelected(data: null | SelectedPlayerData, hero: PortraitProps): boolean {
    return !!(data && data.id !== hero.id);
}
export function selectPlayer(player: SelectedPlayerData | null) {
    // in player mode, clicking a houseguest doesn't reveal who they like: it opens what you know about them
    if (relationshipsHidden()) {
        if (selectedPlayer$.value) selectedPlayer$.next(null);
        knownProfile$.next(!player || knownProfile$.value === player.id ? null : player.id);
        return;
    }
    if (!player || (getSelectedPlayer() && (getSelectedPlayer() as Houseguest).id === player.id)) {
        selectedPlayer$.next(null);
        return;
    }
    if (
        displayMode$.value === powerMode &&
        (!player.superiors || Object.keys(player.superiors).length === 0)
    ) {
        selectedPlayer$.next(null);
        return;
    }
    selectedPlayer$.next(player);
}

export function selectCastPlayer(id: number | null) {
    if (id === null) {
        selectedCastPlayer$.next(new Set());
        return;
    }
    const selectedCastPlayers = getSelectedCastPlayers();
    if (selectedCastPlayers.has(id)) {
        // remove if exists
        selectedCastPlayers.delete(id);
    } else {
        // else add
        selectedCastPlayers.add(id);
    }
    selectedCastPlayer$.next(selectedCastPlayers);
}
