import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntroGate, IntroState } from "./IntroGate";

/** Lets the gate's awaits (load_url, then the video) run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("IntroGate", () => {
    let $container: HTMLDivElement;
    let play: ReturnType<typeof vi.fn>;
    let states: IntroState[];

    beforeEach(() => {
        $container = document.createElement("div");
        document.body.append($container);
        play = vi.fn(() => Promise.resolve());
        Object.defineProperty(HTMLMediaElement.prototype, "play", {
            configurable: true,
            value: play,
        });
        Object.defineProperty(HTMLMediaElement.prototype, "pause", {
            configurable: true,
            value: vi.fn(),
        });
        states = [];
    });

    afterEach(() => {
        $container.remove();
        vi.restoreAllMocks();
    });

    const gate = () =>
        new IntroGate({ load_url: () => Promise.resolve("blob:intro") });

    it("waits on the start screen without a user activation, then plays with sound", async () => {
        const intro = gate();
        intro.start($container, new AbortController().signal, {
            on_change: (state) => states.push(state),
        });
        expect(intro.state).toBe("waiting");
        expect(intro.leave()).toBe(true);
        await flush();
        const $video = $container.querySelector("video");
        expect($video?.muted).toBe(false);
        $video?.dispatchEvent(new Event("ended"));
        $video?.dispatchEvent(new Event("click")); // ends the hold early
        await flush();
        expect(intro.state).toBe("done");
        expect(states).toEqual(["waiting", "playing", "done"]);
        expect(intro.leave()).toBe(false); // nothing left to leave
    });

    it("plays at once when the page already has a user activation", async () => {
        vi.spyOn(IntroGate, "has_user_activation").mockReturnValue(true);
        const intro = gate();
        intro.start($container, new AbortController().signal);
        expect(intro.state).toBe("playing");
    });

    it("skips to done when disabled", () => {
        const intro = gate();
        intro.start($container, new AbortController().signal, {
            is_enabled: false,
        });
        expect(intro.is_done).toBe(true);
    });

    it("retries muted when the browser refuses sound", async () => {
        let calls = 0;
        play.mockImplementation(() =>
            calls++ === 0
                ? Promise.reject(new Error("NotAllowedError"))
                : Promise.resolve(),
        );
        const intro = gate();
        intro.start($container, new AbortController().signal);
        intro.leave();
        await flush();
        await flush();
        expect($container.querySelector("video")?.muted).toBe(true);
    });

    it("finishes even when the intro cannot load", async () => {
        const errors: unknown[] = [];
        const intro = new IntroGate({
            load_url: () => Promise.reject(new Error("no library")),
            on_error: (error) => errors.push(error),
        });
        intro.start($container, new AbortController().signal);
        intro.leave();
        await flush();
        expect(intro.is_done).toBe(true);
        expect(errors).toHaveLength(1);
    });

    it("returns to pending when aborted while playing, and plays again on the next start", async () => {
        const controller = new AbortController();
        const intro = gate();
        intro.start($container, controller.signal);
        intro.leave();
        await flush();
        controller.abort();
        await flush();
        expect(intro.state).toBe("pending");
        expect($container.querySelector("video")).toBeNull();
        vi.spyOn(IntroGate, "has_user_activation").mockReturnValue(true);
        intro.start($container, new AbortController().signal);
        expect(intro.state).toBe("playing");
    });
});
