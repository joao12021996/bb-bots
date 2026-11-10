import {
    GameState,
    Houseguest,
    MutableGameState,
    randomPlayer,
    compWinner,
    getById,
    exclude,
    nonEvictedHousguestsSplit,
} from "../../../model";
import { Scene } from "./scene";
import { Portraits } from "../../playerPortrait/portraits";
import { NextEpisodeButton } from "../../nextEpisodeButton/nextEpisodeButton";
import React from "react";
import { Centered, CenteredBold } from "../../layout/centered";
import { listNames } from "../../../utils/listStrings";
import { Veto } from "../veto/veto";

interface VetoCompSceneOptions {
    veto: Veto;
    doubleEviction?: boolean;
    splitIndex?: number;
    forcedPlayers?: Houseguest[]; // player mode: veto players drawn ahead of time
    forcedWinner?: Houseguest; // player mode: winner decided by a played competition
}

export function pickVetoPlayers(
    gameState: GameState,
    HoHs: Houseguest[],
    nominees: Houseguest[],
    splitIndex?: number
): { povPlayers: Houseguest[]; everyoneWillPlay: boolean; hohPlaysVeto: boolean } {
    const nonEvictedHgs = nonEvictedHousguestsSplit(splitIndex, gameState);
    const hohPlaysVeto = gameState.hohPlaysVeto || nonEvictedHgs.length <= 5 || HoHs.length > 1;
    const maxVetoPlayers = hohPlaysVeto ? 6 : 5;
    const choices = exclude(nonEvictedHgs, HoHs);
    const povPlayers: any[] = [];
    const everyoneWillPlay = nonEvictedHgs.length <= maxVetoPlayers;
    if (everyoneWillPlay) {
        HoHs.forEach((hoh) => povPlayers.push({ ...hoh }));
        nominees.forEach((nominee) => povPlayers.push({ ...nominee }));
        while (exclude(choices, povPlayers).length > 0) {
            povPlayers.push({ ...randomPlayer(choices, povPlayers) });
        }
    } else {
        hohPlaysVeto && HoHs.forEach((hoh) => povPlayers.push({ ...hoh }));
        nominees.forEach((nominee) => povPlayers.push({ ...nominee }));
        while (povPlayers.length < maxVetoPlayers) {
            povPlayers.push({ ...randomPlayer(choices, povPlayers) });
        }
    }
    return { povPlayers, everyoneWillPlay, hohPlaysVeto };
}


export function generateVetoCompScene(
    initialGameState: GameState,
    HoHs: Houseguest[],
    nominees: Houseguest[],
    options: VetoCompSceneOptions
): [GameState, Scene, Houseguest] {
    const newGameState = new MutableGameState(initialGameState);
    const veto = options.veto;
    const doubleEviction = !!options.doubleEviction;
    const splitIndex = options.splitIndex;
    const drawn = pickVetoPlayers(newGameState, HoHs, nominees, splitIndex);
    const hohPlaysVeto = drawn.hohPlaysVeto;
    const everyoneWillPlay = drawn.everyoneWillPlay;
    const povPlayers: Houseguest[] = options.forcedPlayers || drawn.povPlayers;
    let povWinner = options.forcedWinner || compWinner(povPlayers);
    povWinner = getById(newGameState, povWinner.id);
    povWinner.povWins++;
    newGameState.currentLog.vetoWinner = povWinner.name;
    newGameState.currentLog.vetoEmoji = veto.emoji;
    let introText: string;
    if (everyoneWillPlay) {
        introText = "Everyone left in the house will compete in this challenge.";
    } else {
        introText = `${
            hohPlaysVeto ? `${listNames(HoHs.map((h) => h.name))}, as Head of Household, and ` : ``
        }${listNames(nominees.map((nom) => nom.name))} as nominees, will compete, as well as ${
            povPlayers.length - (hohPlaysVeto ? HoHs.length : 0) - nominees.length
        } others chosen by random draw.`;
    }
    const firstRow = [...(hohPlaysVeto ? HoHs : []), ...nominees];
    const extras = [];
    for (let i = firstRow.length; i < povPlayers.length; i++) {
        extras.push(povPlayers[i]);
    }
    const vetoEmoji = veto.emoji ? `${veto.emoji} ` : "";
    const scene = new Scene({
        title: "Veto Competition",
        gameState: initialGameState,
        content: (
            <div>
                <Centered>
                    {doubleEviction
                        ? "The houseguests compete in the veto competition."
                        : "It's time to pick players for the veto competition."}
                </Centered>
                <Portraits centered={true} houseguests={firstRow} />
                {!doubleEviction && <Centered>{introText}</Centered>}
                <Portraits centered={true} houseguests={extras} />
                <Centered>...</Centered>
                <Portraits centered={true} houseguests={[povWinner]} />
                <CenteredBold>{`${povWinner.name} has won the ${vetoEmoji}${veto.name}!`}</CenteredBold>
                {!doubleEviction && <NextEpisodeButton />}
            </div>
        ),
    });
    return [new GameState(newGameState), scene, povWinner];
}
