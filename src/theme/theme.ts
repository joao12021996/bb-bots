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

export const lightTheme: ColorTheme = {
    name: "light",
    bg: "#f6f4fd",
    saveCell: "#bfdbfe",
    text: "#1d1838",
    bodyArea: "#ffffff",
    toggleBorder: "#c4bfe0",
    link: "#6d28d9",
    mark: "#ddd6fe",
    overlay: "#f1eefb",
    evictedCell: "#fca5a5",
    grayCell: "#e4e1ef",
    lightGrayCell: "#f4f2fa",
    runnerUpCell: "#d1e8ef",
    nomineeCell: "#c7d2fe",
    winnerCell: "#86efac",
    hohCell: "#bbf7d0",
    portraitBorder: "#d6d1ea",
    tableCellBorder: "#cfc9e4",
};

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
