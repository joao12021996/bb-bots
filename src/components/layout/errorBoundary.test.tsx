import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { ErrorBoundary } from "./errorBoundary";

function Bomb(props: { armed: { on: boolean } }): JSX.Element {
    if (props.armed.on) throw new Error("kaboom");
    return <div>all good</div>;
}

describe("ErrorBoundary", () => {
    let root: HTMLDivElement;
    let spy: jest.SpyInstance;
    beforeEach(() => {
        root = document.createElement("div");
        document.body.appendChild(root);
        spy = jest.spyOn(console, "error").mockImplementation(() => {});
        window.localStorage.clear();
    });
    afterEach(() => {
        ReactDOM.unmountComponentAtNode(root);
        root.remove();
        spy.mockRestore();
    });

    const buttons = () => Array.from(root.querySelectorAll("button")).map((b) => b.textContent || "");
    const press = (text: string) => {
        const b = Array.from(root.querySelectorAll("button")).find((x) => (x.textContent || "").includes(text))!;
        act(() => {
            b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    };

    it("shows the page when nothing is wrong", () => {
        act(() => {
            ReactDOM.render(
                <ErrorBoundary onResume={() => {}} onHome={() => {}}>
                    <Bomb armed={{ on: false }} />
                </ErrorBoundary>,
                root
            );
        });
        expect(root.textContent).toContain("all good");
    });

    it("catches a crash, and goes home from it", () => {
        const armed = { on: true };
        const onHome = jest.fn(() => (armed.on = false));
        act(() => {
            ReactDOM.render(
                <ErrorBoundary onResume={() => {}} onHome={onHome}>
                    <Bomb armed={armed} />
                </ErrorBoundary>,
                root
            );
        });
        expect(root.textContent).toContain("Something broke");
        // no saved season: nothing to resume
        expect(buttons().some((b) => b.includes("Resume"))).toBe(false);
        press("Show details");
        expect(root.textContent).toContain("kaboom");
        press("Home");
        expect(onHome).toHaveBeenCalled();
        expect(root.textContent).toContain("all good");
    });

    it("offers to resume a saved season", () => {
        window.localStorage.setItem("bb-bots-player-save", "{}");
        const armed = { on: true };
        const onResume = jest.fn(() => (armed.on = false));
        act(() => {
            ReactDOM.render(
                <ErrorBoundary onResume={onResume} onHome={() => {}}>
                    <Bomb armed={armed} />
                </ErrorBoundary>,
                root
            );
        });
        press("Resume saved season");
        expect(onResume).toHaveBeenCalled();
        expect(root.textContent).toContain("all good");
    });
});
