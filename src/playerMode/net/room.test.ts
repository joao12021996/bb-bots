import { parseInvite } from "./room";

describe("invite links", () => {
    it("finds the room code in a pasted link, or takes the code itself", () => {
        expect(parseInvite("https://spaulmark.github.io/bb-bots/?join=AB3XYZ")).toBe("AB3XYZ");
        expect(parseInvite("Join my game! http://localhost:3000/?foo=1&join=qwe234 see you")).toBe("QWE234");
        expect(parseInvite("ab3 xyz")).toBe("AB3XYZ");
        expect(parseInvite("")).toBe("");
    });
});
