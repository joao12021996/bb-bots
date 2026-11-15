import { cleanChat, cleanName, hasBadWords } from "./filter";

describe("the filter on public games' names and chat", () => {
    it("leaves ordinary talk alone", () => {
        ["Who are you voting for?", "I'm putting up Sam and Pip.", "Class act. Assassin move, that.", "Scunthorpe, Essex", "Dickens wrote that", "the cockpit", "analysis", "I shifted my vote", "pass the grapes"].forEach((line) => {
            expect(hasBadWords(line)).toBe(false);
            expect(cleanChat(line)).toBe(line);
        });
    });

    it("stars out the crude words, and only those", () => {
        expect(cleanChat("you fucking snake")).toBe("you ******* snake");
        expect(cleanChat("Shit. SHIT!")).toBe("****. ****!");
        expect(cleanChat("pro and con, Dick said")).toBe("pro and con, Dick said");
        expect(cleanChat("what a b1tch")).toBe("what a *****");
    });

    it("isn't fooled by the usual disguises", () => {
        ["fuuuuck", "f.u.c.k".replace(/\./g, ""), "sh1t", "$hit", "FUCK", "fucks", "merde", "putá"].forEach((w) => expect(hasBadWords(w)).toBe(true));
    });

    it("turns a bad name into a plain one", () => {
        expect(cleanName("Sam")).toBe("Sam");
        expect(cleanName("  Pip  ")).toBe("Pip");
        expect(cleanName("")).toBe("Player");
        expect(cleanName("fuck you")).toBe("Player");
        expect(cleanName("f u c k")).toBe("Player");
        expect(cleanName("Sh1tLord", "Guest")).toBe("Sh1tLord"); // one word, not a bad one as a whole
        expect(cleanName("x".repeat(40)).length).toBe(24);
    });
});
