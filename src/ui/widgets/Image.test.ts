import { describe, expect, it } from "vitest";
import { Asset } from "../../assets";
import { Image } from "./Image";

function asset(width: number, height: number): Asset<HTMLImageElement> {
    return {
        element: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            naturalWidth: width,
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            naturalHeight: height,
        } as HTMLImageElement,
        url: "",
        ready: true,
    };
}

/** A context that remembers each `drawImage` and the smoothing at that moment. */
function drawing_context() {
    const draws: Array<{ args: unknown[]; is_smooth: boolean }> = [];
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    const state = { imageSmoothingEnabled: true };
    const context = new Proxy(state, {
        get: (target, name) => {
            if (name in target) {
                return target.imageSmoothingEnabled;
            }
            return (...args: unknown[]) => {
                if (name === "drawImage") {
                    draws.push({
                        args,
                        is_smooth: target.imageSmoothingEnabled,
                    });
                }
            };
        },
        set: (target, name, value) => {
            if (name === "imageSmoothingEnabled") {
                target.imageSmoothingEnabled = value as boolean;
            }
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { context, draws, state };
}

const RECT = { left: 0, top: 0, width: 200, height: 100 };

describe("Image", () => {
    it("can start without a picture, and draws nothing", () => {
        const image = new Image(null, RECT);
        const { context, draws } = drawing_context();

        image.draw(context);

        expect(draws).toHaveLength(0);
    });

    it("takes a new picture", () => {
        const image = new Image(null, RECT);
        const picture = asset(10, 10);
        image.image = picture;
        const { context, draws } = drawing_context();

        image.draw(context);

        expect(draws[0].args[0]).toBe(picture.element);
    });

    it("stretches by default", () => {
        const image = new Image(asset(50, 100), RECT);
        const { context, draws } = drawing_context();

        image.draw(context);

        expect(draws[0].args.slice(3)).toEqual([200, 100]);
    });

    it("is_contained keeps the picture's shape, centered", () => {
        const image = new Image(asset(50, 100), RECT);
        image.is_contained = true;
        const { context, draws } = drawing_context();

        image.draw(context);

        const [, x, , width, height] = draws[0].args as number[];
        expect([width, height]).toEqual([50, 100]);
        const box = image.get_local_content_box_size();
        expect(x).toBe(box.left + 75);
    });

    it("is_smooth false keeps pixel art sharp, and puts the setting back", () => {
        const image = new Image(asset(10, 10), RECT);
        image.is_smooth = false;
        const { context, draws, state } = drawing_context();

        image.draw(context);

        expect(draws[0].is_smooth).toBe(false);
        expect(state.imageSmoothingEnabled).toBe(true);
    });
});
