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
});
