import { GameState, Houseguest } from "../model";
import { KNOCKOUT_ID } from "./comps/knockout";
import { MEMORY_DUEL_ID } from "./comps/memoryDuel";
import { TAINTED_WINE_ID } from "./comps/taintedWine";
import { newPlayerSave, PlayerModeController, Step } from "./playerModeController";

// Test mode for the comps a season runs itself, one screen after another (Knockout, Tainted Wine, Memory Duel):
// a season of its own, just for the comp, that never saves. You're the first houseguest; the rest are bots.

export const SPECIAL_COMPS: { id: string; emoji: string; name: string }[] = [
    { id: KNOCKOUT_ID, emoji: "🥊", name: "Knockout" },
    { id: TAINTED_WINE_ID, emoji: "🍷", name: "Tainted Wine" },
    { id: MEMORY_DUEL_ID, emoji: "🃏", name: "Memory Duel" },
];

export class SpecialTestController extends PlayerModeController {
    constructor(gameState: GameState) {
        const save = newPlayerSave(gameState, [gameState.houseguests[0].id]);
        save.step = Step.Hoh;
        super(save);
    }

    // nothing is kept: a test isn't a season
    protected save() {
        this.changed$.next();
    }

    public runSpecial(id: string, participants: Houseguest[], onWinner: (winnerId: number) => void) {
        const title = "🧪 Test mode";
        const done = (winnerId: number) => onWinner(winnerId);
        if (id === KNOCKOUT_ID) this.runKnockout(title, participants, done);
        else if (id === TAINTED_WINE_ID) this.runTaintedWine(title, participants, done);
        else this.runMemoryDuel(title, participants, done);
    }
}
