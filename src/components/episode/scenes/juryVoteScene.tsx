import { GameState, getJurors, nonEvictedHouseguests, MutableGameState, Houseguest } from "../../../model";
import { Scene } from "./scene";
import { castJuryVote } from "../../../utils/ai/aiApi";
import { Portraits } from "../../playerPortrait/portraits";
import React from "react";
import { ProfileHouseguest } from "../../memoryWall";
import { CenteredBold } from "../../layout/centered";
import { DividerBox } from "../../layout/box";
import { NextEpisodeButton } from "../../nextEpisodeButton/nextEpisodeButton";
import { NormalVote } from "../../../model/logging/voteType";

export function juryVoteScene(
    initialGameState: GameState,
    forcedVotes?: { [jurorId: number]: number }, // player mode: jurorId -> finalist id
    hideVoters?: boolean // player mode: show only vote counts, not who voted for whom
): [GameState, Scene] {
    const newGameState = new MutableGameState(initialGameState);
    const jurors: Houseguest[] = getJurors(newGameState);
    const finalists = nonEvictedHouseguests(newGameState);
    const votes: Array<ProfileHouseguest[]> = [[], []];
    jurors.forEach((juror) => {
        const forced = forcedVotes && forcedVotes[juror.id];
        const decision =
            forced !== undefined ? finalists.findIndex((hg) => hg.id === forced) : castJuryVote(juror, finalists);
        const result: ProfileHouseguest = { ...juror };
        votes[decision].push(result);
        newGameState.currentLog.votes[juror.id] = new NormalVote(finalists[decision].id);
    });
    const votesFor0 = votes[0].length;
    const votesFor1 = votes[1].length;
    const isUnanimous = votesFor0 === 0 || votesFor1 === 0;
    const voteCountText = isUnanimous
        ? "By a unanimous vote..."
        : `By a vote of ${votesFor0} to ${votesFor1}...`;

    const winner = votesFor0 > votesFor1 ? finalists[0] : finalists[1];
    const runnerUp = votesFor0 < votesFor1 ? finalists[0] : finalists[1];
    newGameState.currentLog.winner = winner.id;
    newGameState.currentLog.runnerUp = runnerUp.id;
    const scene = new Scene({
        title: "Jury Votes",
        gameState: newGameState,
        content: (
            <div>
                <CenteredBold>{voteCountText}</CenteredBold>
                <div className="columns is-centered">
                    {[0, 1].map((i) => (
                        <DividerBox className="column" key={i}>
                            {hideVoters ? (
                                <CenteredBold>{`${votes[i].length} vote${votes[i].length === 1 ? "" : "s"} for ${finalists[i].name}`}</CenteredBold>
                            ) : (
                                <Portraits houseguests={votes[i]} centered={true} />
                            )}
                        </DividerBox>
                    ))}
                </div>
                <Portraits houseguests={finalists} centered={true} />
                <CenteredBold>{`Congratulations, ${winner.name}... you are the winner of The Houseguests!`}</CenteredBold>
                <NextEpisodeButton />
            </div>
        ),
    });
    return [newGameState, scene];
}
