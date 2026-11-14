import { parseInvite, parsePublicGames } from "./room";

describe("invite links", () => {
    it("finds the room code in a pasted link, or takes the code itself", () => {
        expect(parseInvite("https://spaulmark.github.io/bb-bots/?join=AB3XYZ")).toBe("AB3XYZ");
        expect(parseInvite("Join my game! http://localhost:3000/?foo=1&join=qwe234 see you")).toBe("QWE234");
        expect(parseInvite("ab3 xyz")).toBe("AB3XYZ");
        expect(parseInvite("")).toBe("");
    });
});

describe("public games", () => {
    it("reads the relay's listings: the code from the room name, and only well-formed ones", () => {
        const games = parsePublicGames([
            { room: "bb-bots-online-3:room-AB3XYZ", info: { host: "Sam", players: 2, size: 10, want: 4, difficulty: "hard", paceHours: 0, turnSeconds: 120 } },
            { room: "bb-bots-online-3:room-QWE234", info: { players: "lots" } },
            { room: "bb-bots-online-2:room-OLD999", info: { host: "Old version" } },
            { room: "bb-bots-online-3:room-NOPE", info: { host: "Bad code" } },
            { room: "bb-bots-online-3:room-ZZZ222", info: null },
        ]);
        expect(games.map((g) => g.code)).toEqual(["AB3XYZ", "QWE234"]);
        expect(games[0]).toMatchObject({ host: "Sam", players: 2, size: 10, want: 4, difficulty: "hard", turnSeconds: 120 });
        expect(games[1]).toMatchObject({ host: "", players: 0, difficulty: "normal" });
    });
});
