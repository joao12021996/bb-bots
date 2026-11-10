import React from "react";
import { rng } from "../../utils";
import { BigButton, Subtle, Title } from "../ui/common";
import { CompDefinition, CompProps } from "./compTypes";
import { randInt } from "./random";

// Luck comps: like Big Brother's "Pandora's box" style comps, skill only matters a little.

function botRand() {
    return Math.abs(rng().randomFloat());
}

// ---------------- Higher or Lower ----------------

const HL_GUESSES = 10;
const CARD = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function HigherOrLower(props: CompProps) {
    const [deck] = React.useState(() => Array.from({ length: HL_GUESSES + 1 }, () => randInt(props.rand, 1, 13)));
    const [i, setI] = React.useState(0);
    const [correct, setCorrect] = React.useState(0);
    const [last, setLast] = React.useState<string>("");

    const guess = (higher: boolean) => {
        const cur = deck[i];
        const next = deck[i + 1];
        const right = next === cur || (higher ? next > cur : next < cur);
        const c = correct + (right ? 1 : 0);
        setCorrect(c);
        props.report(c);
        setLast(right ? "✅ Right!" : "❌ Wrong!");
        if (i + 1 >= HL_GUESSES) {
            setI(i + 1);
            setTimeout(() => props.finish(c), 700);
        } else {
            setI(i + 1);
        }
    };
    return (
        <div>
            <Title>
                Card {Math.min(i + 1, HL_GUESSES)} of {HL_GUESSES}, {correct} right
            </Title>
            <div
                style={{
                    width: 120,
                    height: 170,
                    margin: "12px auto",
                    borderRadius: 12,
                    background: "white",
                    color: "#111",
                    fontSize: "3.5rem",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
                }}
            >
                {CARD[deck[i] - 1]}
            </div>
            <Subtle>{last || "Will the next card be higher or lower? (A tie counts as right.)"}</Subtle>
            {i < HL_GUESSES && (
                <div>
                    <BigButton kind="success" onClick={() => guess(true)}>
                        ⬆️ Higher
                    </BigButton>
                    <BigButton kind="danger" onClick={() => guess(false)}>
                        ⬇️ Lower
                    </BigButton>
                </div>
            )}
        </div>
    );
}

export const HigherOrLowerComp: CompDefinition = {
    id: "higher-or-lower",
    name: "Higher or Lower",
    emoji: "🃏",
    kind: "luck",
    rules: `A card is face up. Guess whether the next card is higher or lower. ${HL_GUESSES} guesses; most right wins. Mostly luck, but play the odds!`,
    maxSeconds: 90,
    Component: HigherOrLower,
    botScore: () => {
        // bots play the odds; the cards decide
        let cur = Math.floor(botRand() * 13) + 1;
        let right = 0;
        for (let k = 0; k < HL_GUESSES; k++) {
            const next = Math.floor(botRand() * 13) + 1;
            const higher = cur <= 7;
            if (next === cur || (higher ? next > cur : next < cur)) right++;
            cur = next;
        }
        return right;
    },
    format: (s) => `${s} right`,
};

// ---------------- Bank or Bust ----------------

const BANK_ROUNDS = 5;

function BankOrBust(props: CompProps) {
    const [round, setRound] = React.useState(0);
    const [pot, setPot] = React.useState(0);
    const [total, setTotal] = React.useState(0);
    const [last, setLast] = React.useState<number | null>(null);
    const [busted, setBusted] = React.useState(false);

    const endRound = (newTotal: number) => {
        props.report(newTotal);
        if (round + 1 >= BANK_ROUNDS) {
            props.finish(newTotal);
            return;
        }
        setRound(round + 1);
        setPot(0);
    };
    const roll = () => {
        const die = randInt(props.rand, 1, 6);
        setLast(die);
        if (die === 1) {
            setBusted(true);
            setPot(0);
            return;
        }
        setPot(pot + die);
    };
    return (
        <div>
            <Title>
                Round {round + 1} of {BANK_ROUNDS}, banked {total}
            </Title>
            <div style={{ fontSize: "4rem", margin: "8px 0" }}>{last === null ? "🎲" : ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][last - 1]}</div>
            {busted ? (
                <div>
                    <p>
                        <b>BUST!</b> You rolled a 1 and lost this round's pot.
                    </p>
                    <BigButton
                        onClick={() => {
                            setBusted(false);
                            setLast(null);
                            endRound(total);
                        }}
                    >
                        Next round
                    </BigButton>
                </div>
            ) : (
                <div>
                    <p style={{ fontSize: "1.3rem" }}>
                        Pot: <b>{pot}</b>
                    </p>
                    <BigButton kind="info" onClick={roll}>
                        🎲 Roll
                    </BigButton>
                    <BigButton
                        kind="success"
                        disabled={pot === 0}
                        onClick={() => {
                            const t = total + pot;
                            setTotal(t);
                            setLast(null);
                            endRound(t);
                        }}
                    >
                        💰 Bank {pot}
                    </BigButton>
                </div>
            )}
        </div>
    );
}

export const BankOrBustComp: CompDefinition = {
    id: "bank-or-bust",
    name: "Bank or Bust",
    emoji: "🎲",
    kind: "luck",
    rules: `${BANK_ROUNDS} rounds. Roll the die to add to your pot, but rolling a 1 busts and you lose that round's pot. Bank whenever you want. Highest total wins.`,
    maxSeconds: 120,
    Component: BankOrBust,
    botScore: (p) => {
        // better bots know when to stop (around 20 is optimal)
        const threshold = 10 + Math.round(10 * p);
        let total = 0;
        for (let r = 0; r < BANK_ROUNDS; r++) {
            let pot = 0;
            while (pot < threshold) {
                const die = Math.floor(botRand() * 6) + 1;
                if (die === 1) {
                    pot = 0;
                    break;
                }
                pot += die;
            }
            total += pot;
        }
        return total;
    },
    format: (s) => `${s} banked`,
};
