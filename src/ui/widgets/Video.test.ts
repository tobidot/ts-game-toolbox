import { describe, expect, it } from "vitest";
import { Asset } from "../../assets";
import { Video } from "./Video";

/** A video element that plays and pauses on command, 16:9. */
function video_asset(): Asset<HTMLVideoElement> & { plays: () => number } {
    let plays = 0;
    const element = {
        paused: true,
        ended: false,
        loop: false,
        muted: false,
        autoplay: false,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        playsInline: false,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        videoWidth: 1920,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        videoHeight: 1080,
        play() {
            plays += 1;
            this.paused = false;
            return Promise.resolve();
        },
        pause() {
            this.paused = true;
        },
    };
    return {
        element: element as unknown as HTMLVideoElement,
        url: "film.mp4",
        ready: true,
        plays: () => plays,
    };
}

/** A context that remembers where each `drawImage` went. */
function drawing_context() {
    const draws: unknown[][] = [];
    const context = new Proxy(
        {},
        {
            get: (_target, name) => {
                if (name === "imageSmoothingEnabled") {
                    return true;
                }
                return (...args: unknown[]) => {
                    if (name === "drawImage") {
                        draws.push(args);
                    }
                };
            },
            set: () => true,
        },
    ) as unknown as CanvasRenderingContext2D;
    return { context, draws };
}

const RECT = { left: 0, top: 0, width: 200, height: 200 };

describe("Video", () => {
    it("can start without a video, draws nothing, and takes one later", () => {
        const widget = new Video(null, RECT);
        const { context, draws } = drawing_context();
        widget.draw(context);
        expect(draws).toHaveLength(0);

        const asset = video_asset();
        widget.video = asset;
        expect(asset.element.muted).toBe(true);
        expect(asset.element.loop).toBe(true);
        widget.draw(context);
        expect(draws).toHaveLength(1);
        expect(asset.plays()).toBe(1);
    });

    it("keeps the film's shape when contained", () => {
        const widget = new Video(video_asset(), RECT);
        widget.is_contained = true;
        const { context, draws } = drawing_context();
        widget.draw(context);
        // 200 wide at 16:9 is 112.5 high, centred in the 200 x 200 box around 0, 0.
        expect(draws[0].slice(1)).toEqual([-100, -56.25, 200, 112.5]);
    });

    it("stays paused when paused, and plays again on play()", () => {
        const asset = video_asset();
        const widget = new Video(asset, RECT);
        const { context } = drawing_context();
        widget.draw(context);
        expect(asset.element.paused).toBe(false);

        widget.pause();
        widget.draw(context);
        widget.draw(context);
        expect(asset.element.paused).toBe(true);
        expect(widget.is_playing).toBe(false);

        widget.play();
        expect(asset.element.paused).toBe(false);
        expect(widget.is_playing).toBe(true);
    });

    it("lets a film that ended stay at its end", () => {
        const asset = video_asset();
        const widget = new Video(asset, RECT);
        widget.play();
        asset.element.pause();
        (asset.element as { ended: boolean }).ended = true;
        const { context } = drawing_context();
        widget.draw(context);
        expect(asset.element.paused).toBe(true);
    });
});
