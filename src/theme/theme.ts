export interface ColorTheme {
    name: string;
    bg: string;
    text: string;
    toggleBorder: string;
    bodyArea: string;
    link: string;
    mark: string;
    overlay: string;
    evictedCell: string;
    grayCell: string;
    winnerCell: string;
    lightGrayCell: string;
    runnerUpCell: string;
    saveCell: string;
    nomineeCell: string;
    hohCell: string;
    portraitBorder: string;
    tableCellBorder: string;
}

// export const lightTheme: ColorTheme = {
//     name: "light",
//     bg: "#fff",
//     text: "#363537",
//     toggleBorder: "#FFF",
//     bodyArea: "#fff",
//     link: "blue",
//     mark: "yellow",
//     overlay: "fff",
//     evictedCell: "#fa8072",
//     grayCell: "#eaecf0",
//     lightGrayCell: "#f8f9fa",
//     winnerCell: "#73fb76",
//     runnerUpCell: "#d1e8ef",
//     nomineeCell: "#959ffd",
//     hohCell: "#CCFFCC",
//     portraitBorder: "gray",
//     tableCellBorder: "#a2a9b1",
// };

export const darkTheme: ColorTheme = {
    name: "dark",
    bg: "#0c0a1a",
    saveCell: "#2b4a63",
    text: "#f4f2ff",
    bodyArea: "#17142b",
    toggleBorder: "#6B8096",
    link: "#c4b5fd",
    mark: "#7c3aed",
    overlay: "#221e3a",
    evictedCell: "#8f3b4b",
    grayCell: "#4a4560",
    lightGrayCell: "#2b2742",
    runnerUpCell: "#9fbec882",
    nomineeCell: "#5b5fd0",
    winnerCell: "#059669",
    hohCell: "#2f6b4f",
    portraitBorder: "#2f2a4a",
    tableCellBorder: "#3b3658",
};
