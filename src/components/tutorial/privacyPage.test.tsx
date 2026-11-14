import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { PrivacyPage } from "./privacyPage";
import { shareCounts$ } from "../../analytics/analytics";

describe("the privacy page", () => {
    it("says what is kept, and its switch turns play counts off", () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        shareCounts$.next(true);
        act(() => {
            ReactDOM.render(<PrivacyPage />, root);
        });
        expect(root.textContent).toContain("On your device");
        expect(root.textContent).toContain("Anonymous play counts");
        expect(root.textContent).toContain("spotlegame@gmail.com");
        const box = root.querySelector("input[type=checkbox]") as HTMLInputElement;
        expect(box.checked).toBe(true);
        act(() => {
            box.click();
        });
        expect(shareCounts$.value).toBe(false);
        shareCounts$.next(true);
        ReactDOM.unmountComponentAtNode(root);
        root.remove();
    });
});
