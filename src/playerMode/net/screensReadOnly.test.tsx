import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { actorOf, newPlayerSave, Prompt } from "../playerModeController";
import { answer, newGame } from "../testing";
import { NetSession, SessionOptions } from "./netSession";
import { FakeHub } from "./room";
import { serialize } from "../save/serialize";
import { PlayerModeScreen } from "../ui/playerModeScreen";

const opts: SessionOptions = { launch: (controller) => controller.start(), hostWaitMs: 50, hashDelayMs: 10 };

function diff(a: any, b: any, path: string, out: string[]) {
    if (out.length > 20) return;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
        new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => diff(a[k], b[k], `${path}.${k}`, out));
    } else out.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} -> ${JSON.stringify(b)?.slice(0, 120)}`);
}

// Online, each device draws its own screens: if drawing one changed the season, that device would drift from the
// others (and have to fetch the season again, losing whatever its player was in the middle of).
it("drawing the screens never changes the season", () => {
    const hub = new FakeHub();
    const save = newPlayerSave(newGame(13), [11, 12]);
    save.seed = 11;
    const host = NetSession.host(hub.join("h"), "TEST", save, opts);
    const guest = NetSession.join(hub.join("c0"), "TEST", opts);
    hub.flush();
    host.claim(11);
    guest.claim(12);
    hub.flush();
    host.start();
    hub.flush();
    const changes: string[] = [];
    for (let guard = 0; guard < 400; guard++) {
        for (const s of [host, guest]) {
            const c = s.controller!;
            const own = c.personal$.value[s.localPlayerId!];
            const p: Prompt = own || c.prompt$.value!;
            const before = JSON.parse(serialize(c.state));
            const div = document.createElement("div");
            act(() => {
                ReactDOM.render(<PlayerModeScreen controller={c} />, div);
            });
            const after = JSON.parse(serialize(c.state));
            ReactDOM.unmountComponentAtNode(div);
            const out: string[] = [];
            diff(before, after, "", out);
            if (out.length) changes.push(`drawing ${p.kind} (for ${actorOf(p)}) on the ${s === host ? "host" : "guest"} changed ${out.join(", ")}`);
        }
        // move on
        hub.instant = true;
        const ownS = [host, guest].map((s) => ({ s, p: s.controller!.personal$.value[s.localPlayerId!] })).filter((x) => x.p);
        if (ownS.length) ownS.forEach(({ s, p }) => answer(s.controller!, p, "random", "random"));
        else if (actorOf(host.controller!.prompt$.value!) === null) {
            // a screen everyone watches: both press Continue (the host last)
            [guest, host].forEach((s) => answer(s.controller!, s.controller!.prompt$.value!, "random", "random"));
        } else {
            const mover = [host, guest].find((s) => s.mayActFor(actorOf(s.controller!.prompt$.value!)))!;
            answer(mover.controller!, mover.controller!.prompt$.value!, "random", "random");
        }
        hub.instant = false;
        hub.flush();
        if (host.controller!.prompt$.value!.kind === "gameOver") break;
    }
    expect(changes.slice(0, 5)).toEqual([]);
});
