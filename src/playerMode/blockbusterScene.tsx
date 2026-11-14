import React from "react";
import { GameState, getById, Houseguest, MutableGameState } from "../model";
import { Scene } from "../components/episode/scenes/scene";
import { Portrait, Portraits } from "../components/playerPortrait/portraits";
import { Centered, CenteredBold } from "../components/layout/centered";
import { NextEpisodeButton } from "../components/nextEpisodeButton/nextEpisodeButton";
import { listNames } from "../utils/listStrings";

// The Blockbuster: after the veto, the three nominees compete and the winner comes off the block.
export function generateBlockbusterScene(
    initialGameState: GameState,
    nominees: Houseguest[],
    winnerId: number
): [GameState, Scene, Houseguest[]] {
    const gs = new MutableGameState(initialGameState);
    const winner = getById(gs, winnerId);
    const remaining = nominees.filter((n) => n.id !== winnerId).map((n) => getById(gs, n.id));
    const log = gs.currentLog;
    log.nominationsPreVeto = log.nominationsPreVeto.filter((name) => name !== winner.name);
    log.strikethroughNominees = [...log.strikethroughNominees, winner.name];
    const scene = new Scene({
        title: "Block Breaker",
        gameState: initialGameState,
        content: (
            <div>
                <Centered>
                    It's time for the Block Breaker. {listNames(nominees.map((n) => n.name))}, one of you will win this
                    competition and come off the block.
                </Centered>
                <Portraits centered={true} houseguests={nominees} />
                <Centered>...</Centered>
                <Portrait centered={true} houseguest={winner} />
                <CenteredBold>{`${winner.name} has won the Block Breaker and is safe this week!`}</CenteredBold>
                <Centered>{`That means ${listNames(remaining.map((n) => n.name))} will face the eviction vote.`}</Centered>
                <Portraits centered={true} houseguests={remaining} />
                <NextEpisodeButton />
            </div>
        ),
    });
    return [new GameState(gs), scene, remaining];
}
