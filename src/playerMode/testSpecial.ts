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

export interface SpecialTestController extends PlayerModeController {
    runSpecial(id: string, participants: Houseguest[], onWinner: (winnerId: number) => void): void;
}

// The class is made the first time it's needed, not when this file loads: the test screen is imported (through
// the pregame screen) while the controller's own files are still loading, and a class can't extend one that
// isn't there yet.
let made: (new (gameState: GameState) => SpecialTestController) | null = null;

export function specialTestController(gameState: GameState): SpecialTestController {
    if (!made) {
        made = class extends PlayerModeController {
            constructor(gs: GameState) {
                const save = newPlayerSave(gs, [gs.houseguests[0].id]);
                save.step = Step.Hoh;
                super(save);
            }

            // nothing is kept: a test isn't a season
            protected save() {
                this.changed$.next();
            }

            public runSpecial(id: string, participants: Houseguest[], onWinner: (winnerId: number) => void) {
                const title = "🧪 Test mode";
                if (id === KNOCKOUT_ID) this.runKnockout(title, participants, onWinner);
                else if (id === TAINTED_WINE_ID) this.runTaintedWine(title, participants, onWinner);
                else this.runMemoryDuel(title, participants, onWinner);
            }
        };
    }
    return new made(gameState);
}
