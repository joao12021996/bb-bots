import { cartoonURL, Expression, lookFromURL } from "./cartoon";

// A houseguest's picture with an expression, for the comps' little scenes: their own cartoon, grinning, sad, sick
// or dead. A photo can't change its face, so it's just the photo (the scene tints it with CSS; see `is-photo`).
export function toonURL(hg: { imageURL: string }, expression?: Expression): string {
    const look = lookFromURL(hg.imageURL);
    return look ? cartoonURL(look, { bare: true, expression }) : hg.imageURL;
}

export function isCartoon(hg: { imageURL: string }): boolean {
    return lookFromURL(hg.imageURL) !== null;
}
