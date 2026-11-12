import { cartoonCast, cartoonFor, lookFromURL } from "./cartoon";
import { decodeCast, encodeCast } from "./castCode";

describe("sharing a cast", () => {
    it("round-trips names, cartoon looks, stats and relationships through a code", () => {
        const cast = cartoonCast(12);
        cast[0].name = "Zoë 🎤";
        const relationships = { 0: { 1: 0.5, 2: -0.333 }, 3: { 0: 1 } };
        const { code, photosLeftOut } = encodeCast(cast, relationships);
        expect(photosLeftOut).toBe(0);
        expect(code.startsWith("C1")).toBe(true);
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // safe in a link
        const back = decodeCast(code)!;
        expect(back.cast.map((p) => p.name)).toEqual(cast.map((p) => p.name));
        expect(back.cast.map((p) => [p.social, p.comp])).toEqual(cast.map((p) => [p.social, p.comp]));
        back.cast.forEach((p, i) => expect(lookFromURL(p.imageURL)).toEqual(lookFromURL(cast[i].imageURL)));
        expect(back.relationships).toEqual({ 0: { 1: 0.5, 2: -0.33 }, 3: { 0: 1 } });
    });

    it("reads a code out of a link, swaps uploaded photos for cartoons, and rejects junk", () => {
        const cast = [
            { name: "Photo", imageURL: "blob:http://localhost/abc", social: 7, comp: 3 },
            { name: "Web", imageURL: "https://example.com/a.png", social: 99, comp: -4 },
        ];
        const { code, photosLeftOut } = encodeCast(cast);
        expect(photosLeftOut).toBe(1);
        const back = decodeCast(`https://example.org/game/?cast=${code}`)!;
        expect(back.cast[0].imageURL).toBe(cartoonFor("Photo"));
        expect(back.cast[1].imageURL).toBe("https://example.com/a.png");
        expect([back.cast[1].social, back.cast[1].comp]).toEqual([10, 1]);
        expect(back.relationships).toBeUndefined();
        ["", "hello", "C1!!!", "C1" + btoa("not json"), "https://example.org/?join=ABCD"].forEach((junk) => expect(decodeCast(junk)).toBeNull());
    });
});
