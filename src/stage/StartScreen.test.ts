/* eslint-disable @typescript-eslint/naming-convention -- DOM method names */
import { describe, expect, it, vi } from "vitest";
import { draw_start_screen, start_screen_block } from "./StartScreen";

describe("draw_start_screen", () => {
    it("puts a picture above the title and keeps picture and text centred together", () => {
        const texts: Array<{ text: string; y: number }> = [];
        const context = new Proxy(
            {
                fillText: (text: string, _x: number, y: number) =>
                    texts.push({ text, y }),
            },
            {
                get: (target, key) =>
                    key in target
                        ? target[key as keyof typeof target]
                        : vi.fn(),
                set: () => true,
            },
        ) as unknown as CanvasRenderingContext2D;
        const layout = { width: 960, height: 640 };
        let picture_top = 0;
        draw_start_screen(context, layout, {
            title: "T",
            picture: {
                height: 100,
                paint: (_context, rect) => (picture_top = rect.top),
            },
        });
        const title_y = texts.find((entry) => entry.text === "T")?.y ?? 0;
        // without a picture the title sits at 320 - 110; the picture's 100 + 24 gap moves it 62 down
        expect(title_y).toBe(320 - 110 + 62);
        expect(picture_top).toBe(320 + 62 - 136 - 24 - 100);
    });

    it("tells a backdrop where picture and text go", () => {
        const layout = { width: 960, height: 640 };
        expect(start_screen_block(layout)).toEqual({
            left: 24,
            top: 320 - 136,
            width: 912,
            height: 278,
        });
        // the picture's 100 + 24 gap is added on top; the block stays centred
        const block = start_screen_block(layout, 100);
        expect(block.top).toBe(320 + 62 - 136 - 124);
        expect(block.top + block.height).toBe(320 + 62 + 142);
    });
});
