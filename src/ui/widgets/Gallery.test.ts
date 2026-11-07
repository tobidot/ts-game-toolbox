import { describe, expect, it } from "vitest";
import { Asset } from "../../assets";
import { ElementChangeEvent, ElementClickEvent } from "../events";
import { Gallery } from "./Gallery";

function asset(
    width: number,
    height: number,
    ready: boolean = true,
): Asset<HTMLImageElement> {
    return {
        element: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            naturalWidth: width,
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            naturalHeight: height,
        } as HTMLImageElement,
        url: "",
        ready,
    };
}

/** A context that remembers what was drawn, and the smoothing at that moment. */
function drawing_context() {
    const draws: Array<{ args: unknown[]; is_smooth: boolean }> = [];
    const rects: number[][] = [];
    const texts: Array<{ text: string; x: number; y: number }> = [];
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
                if (name === "rect" || name === "roundRect") {
                    rects.push(args as number[]);
                }
                if (name === "fillText") {
                    texts.push({
                        text: args[0] as string,
                        x: args[1] as number,
                        y: args[2] as number,
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
    return { context, draws, rects, texts };
}

const RECT = { left: 300, top: 200, width: 200, height: 100 };

describe("Gallery", () => {
    it("draws the picture of the current asset", () => {
        const pictures = [asset(10, 10), asset(10, 10)];
        const gallery = new Gallery("Katalog", pictures, RECT);
        gallery.next();
        const { context, draws } = drawing_context();

        gallery.draw(context);

        expect(draws[0].args[0]).toBe(pictures[1].element);
    });

    it("a click goes to the next, and round again, and says so", () => {
        const gallery = new Gallery(
            "Katalog",
            [asset(10, 10), asset(10, 10)],
            RECT,
        );
        const events: string[] = [];
        gallery.events.attach(ElementChangeEvent, () => {
            events.push("change");
        });
        gallery.events.attach(ElementClickEvent, () => {
            events.push("click");
        });

        gallery.dispatch_click_event();
        expect(gallery.current_image_index).toBe(1);
        gallery.dispatch_click_event();
        expect(gallery.current_image_index).toBe(0);

        expect(events).toEqual(["change", "click", "change", "click"]);
    });

    it("previous goes round the other way", () => {
        const gallery = new Gallery(
            "Katalog",
            [asset(10, 10), asset(10, 10), asset(10, 10)],
            RECT,
        );

        gallery.previous();

        expect(gallery.current_image_index).toBe(2);
    });

    it("next and previous on no pictures stay at zero", () => {
        const gallery = new Gallery("Katalog", [], RECT);

        gallery.next();
        gallery.previous();

        expect(gallery.current_image_index).toBe(0);
    });

    it("takes its pictures later", () => {
        const gallery = new Gallery("Katalog", [], RECT);
        const picture = asset(10, 10);
        gallery.images = [picture];
        const { context, draws } = drawing_context();

        gallery.draw(context);

        expect(draws[0].args[0]).toBe(picture.element);
    });

    it("draws nothing yet for a picture still loading", () => {
        const gallery = new Gallery("Katalog", [asset(10, 10, false)], RECT);
        const { context, draws } = drawing_context();

        gallery.draw(context);

        expect(draws).toHaveLength(0);
    });

    it("is_contained keeps the picture's shape", () => {
        const gallery = new Gallery("Katalog", [asset(50, 100)], RECT);
        gallery.is_contained = true;
        const { context, draws } = drawing_context();

        gallery.draw(context);

        expect((draws[0].args as number[]).slice(3)).toEqual([50, 100]);
    });

    it("is_smooth false keeps pixel art sharp", () => {
        const gallery = new Gallery("Katalog", [asset(10, 10)], RECT);
        gallery.is_smooth = false;
        const { context, draws } = drawing_context();

        gallery.draw(context);

        expect(draws[0].is_smooth).toBe(false);
    });

    it("writes its title above the box, not over the picture", () => {
        const gallery = new Gallery("Katalog", [asset(10, 10)], RECT);
        const { context, texts } = drawing_context();

        gallery.draw(context);

        const box = gallery.get_local_border_box_size();
        const title = texts.find((text) => text.text === "Katalog");
        expect(title?.x).toBe(box.left);
        expect(title?.y).toBeLessThan(box.top);
    });

    it("without pictures it says so inside its own box, wherever it stands", () => {
        const gallery = new Gallery("Katalog", [], RECT);
        const { context, rects, texts } = drawing_context();

        gallery.draw(context);

        const box = gallery.get_local_border_box_size();
        expect(rects[0].slice(0, 2)).toEqual([box.left, box.top]);
        const no_image = texts.find((text) => text.text === "No Image");
        expect(no_image?.x).toBe(box.left + box.width / 2);
        expect(no_image?.y).toBe(box.top + box.height / 2);
    });
});
