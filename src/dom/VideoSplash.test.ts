import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { play_video_splash } from "./VideoSplash";

describe("play_video_splash", () => {
    let $container: HTMLDivElement;
    let play: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        $container = document.createElement("div");
        document.body.appendChild($container);
        play = vi.fn(() => Promise.resolve());
        Object.defineProperty(HTMLMediaElement.prototype, "play", {
            configurable: true,
            value: play,
        });
        Object.defineProperty(HTMLMediaElement.prototype, "pause", {
            configurable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        $container.remove();
    });

    it("mounts a muted video and resolves with 'ended' when it ends", async () => {
        const outcome = play_video_splash($container, "blob:intro");
        const $video = $container.querySelector("video");
        expect($video).not.toBeNull();
        expect($video?.muted).toBe(true);
        expect(play).toHaveBeenCalledTimes(1);
        $video?.dispatchEvent(new Event("ended"));
        expect(await outcome).toBe("ended");
        expect($container.querySelector("video")).toBeNull();
    });

    it("holds the last frame for hold_ms after the end, then resolves with 'ended'", async () => {
        vi.useFakeTimers();
        let outcome: string | null = null;
        void play_video_splash($container, "blob:intro", {
            hold_ms: 1500,
            timeout_ms: 1000,
        }).then((value) => (outcome = value));
        const $video = $container.querySelector("video");
        $video?.dispatchEvent(new Event("ended"));
        // the hold is not cut by timeout_ms, and the video stays mounted meanwhile
        await vi.advanceTimersByTimeAsync(1200);
        expect(outcome).toBeNull();
        expect($container.querySelector("video")).not.toBeNull();
        await vi.advanceTimersByTimeAsync(400);
        vi.useRealTimers();
        expect(outcome).toBe("ended");
        expect($container.querySelector("video")).toBeNull();
    });

    it("a click during the hold ends it early, still as 'ended'", async () => {
        const outcome = play_video_splash($container, "blob:intro", {
            hold_ms: 5000,
        });
        const $video = $container.querySelector("video");
        $video?.dispatchEvent(new Event("ended"));
        $video?.dispatchEvent(new Event("click"));
        expect(await outcome).toBe("ended");
    });

    it("resolves with 'skipped' on a click when skippable", async () => {
        const outcome = play_video_splash($container, "blob:intro");
        $container.querySelector("video")?.dispatchEvent(new Event("click"));
        expect(await outcome).toBe("skipped");
    });

    it("ignores clicks when not skippable and times out", async () => {
        vi.useFakeTimers();
        const outcome = play_video_splash($container, "blob:intro", {
            skippable: false,
            timeout_ms: 50,
        });
        $container.querySelector("video")?.dispatchEvent(new Event("click"));
        vi.advanceTimersByTime(60);
        vi.useRealTimers();
        expect(await outcome).toBe("timeout");
    });

    it("resolves with 'blocked' when autoplay is refused", async () => {
        play.mockImplementation(() =>
            Promise.reject(new Error("NotAllowedError")),
        );
        const outcome = await play_video_splash($container, "blob:intro");
        expect(outcome).toBe("blocked");
        expect($container.querySelector("video")).toBeNull();
    });

    it("resolves with 'aborted' when the signal aborts", async () => {
        const controller = new AbortController();
        const outcome = play_video_splash($container, "blob:intro", {
            signal: controller.signal,
        });
        controller.abort();
        expect(await outcome).toBe("aborted");
    });

    describe("the focus", () => {
        /** A custom-element-like host with the container in its shadow root. */
        function host_with_container(): {
            $host: HTMLElement;
            $inner: HTMLElement;
        } {
            const $host = document.createElement("div");
            $host.tabIndex = 0;
            const $inner = document.createElement("div");
            $host.attachShadow({ mode: "open" }).appendChild($inner);
            document.body.appendChild($host);
            return { $host, $inner };
        }

        it("goes back to the host when the video goes: the keyboard must still reach the game", async () => {
            const { $host, $inner } = host_with_container();
            $host.focus();
            const outcome = play_video_splash($inner, "blob:intro");
            const $video = $inner.querySelector("video");
            expect($host.shadowRoot?.activeElement).toBe($video);
            $video?.dispatchEvent(new Event("ended"));
            await outcome;
            expect(document.activeElement).toBe($host);
            $host.remove();
        });

        it("goes to the host, too, when nothing had it before", async () => {
            const { $host, $inner } = host_with_container();
            const outcome = play_video_splash($inner, "blob:intro");
            $inner.querySelector("video")?.dispatchEvent(new Event("error"));
            await outcome;
            expect(document.activeElement).toBe($host);
            $host.remove();
        });

        it("goes back to what had it, somewhere else on the page", async () => {
            const { $host, $inner } = host_with_container();
            const $input = document.createElement("input");
            document.body.appendChild($input);
            $input.focus();
            const outcome = play_video_splash($inner, "blob:intro");
            $inner.querySelector("video")?.dispatchEvent(new Event("ended"));
            await outcome;
            expect(document.activeElement).toBe($input);
            $input.remove();
            $host.remove();
        });

        it("stays where the visitor took it during the video", async () => {
            const { $host, $inner } = host_with_container();
            const $input = document.createElement("input");
            document.body.appendChild($input);
            const outcome = play_video_splash($inner, "blob:intro");
            $input.focus();
            $inner.querySelector("video")?.dispatchEvent(new Event("ended"));
            await outcome;
            expect(document.activeElement).toBe($input);
            $input.remove();
            $host.remove();
        });

        it("is left alone by a video that can't be skipped", async () => {
            const { $host, $inner } = host_with_container();
            const outcome = play_video_splash($inner, "blob:intro", {
                skippable: false,
            });
            $inner.querySelector("video")?.dispatchEvent(new Event("ended"));
            await outcome;
            expect(document.activeElement).toBe(document.body);
            $host.remove();
        });
    });
});
