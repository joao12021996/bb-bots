import { nonEvictedHouseguests, PlayerProfile } from "../model";
import { testSeason } from "./ui/compTestMode";
import { SPECIAL_COMPS, SpecialTestController } from "./testSpecial";
import { answer } from "./testing";
import * as saves from "./save/serialize";

const cast: PlayerProfile[] = Array.from({ length: 8 }, (_, i) => ({ name: `Player${i}`, imageURL: "" } as PlayerProfile));

describe("test mode's special formats", () => {
    SPECIAL_COMPS.forEach(({ id, name }) =>
        it(`plays ${name} through to a winner, without saving`, () => {
            const write = jest.spyOn(saves, "writeSave");
            const controller = new SpecialTestController(testSeason(cast, "jury").gameState);
            const participants = nonEvictedHouseguests(controller.gameState).slice(0, 4);
            let winner: number | undefined;
            controller.runSpecial(id, participants, (w) => (winner = w));
            for (let i = 0; i < 2000 && winner === undefined; i++) answer(controller, controller.prompt$.value!, "random", "random");
            expect(participants.map((p) => p.id)).toContain(winner);
            expect(write).not.toHaveBeenCalled();
            write.mockRestore();
        })
    );
});
