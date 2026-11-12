// Online games: opening the browser's inspect tools is against the rules (they show every player's secrets).
// While the tools are open, a `debugger` statement pauses the page; otherwise it does nothing at all. So a
// check that takes far longer than it should means they're open. This never fires for a player who doesn't
// open them, whatever their window size or zoom.
const PAUSED_MS = 150;
const EVERY_MS = 1500;

export function watchForInspector(onCaught: () => void): () => void {
    if (process.env.NODE_ENV === "test") return () => {};
    // working on the game itself
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return () => {};
    let pause: () => void;
    try {
        // a built function, so minifying the app (which drops `debugger` statements) leaves it in
        // eslint-disable-next-line no-new-func
        pause = new Function("debugger") as () => void;
    } catch (e) {
        return () => {}; // not allowed to build functions here
    }
    let caught = false;
    const timer = setInterval(() => {
        if (caught) return;
        const start = performance.now();
        pause();
        if (performance.now() - start > PAUSED_MS) {
            caught = true;
            onCaught();
        }
    }, EVERY_MS);
    return () => clearInterval(timer);
}
