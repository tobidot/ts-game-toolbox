// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PixelCanvas } from "./PixelCanvas";

// jsdom ships no ImageData without the optional canvas package; the shape is all the test needs.
if (typeof globalThis.ImageData === "undefined") {
    class FakeImageData {
        public readonly data: Uint8ClampedArray;
        public constructor(
            public readonly width: number,
            public readonly height: number,
        ) {
            this.data = new Uint8ClampedArray(width * height * 4);
        }
    }
    globalThis.ImageData = FakeImageData as unknown as typeof ImageData;
}

/** The buffer as rows of characters: "." transparent, else the index. */
function picture(canvas: PixelCanvas): string[] {
    const rows: string[] = [];
    for (let y = 0; y < canvas.height; y++) {
        let row = "";
        for (let x = 0; x < canvas.width; x++) {
            const index = canvas.get(x, y);
            row += index === canvas.transparent ? "." : String(index);
        }
        rows.push(row);
    }
    return rows;
}

describe("PixelCanvas", () => {
    it("starts transparent, gets and sets inside, ignores outside", () => {
        const canvas = new PixelCanvas(4, 3);
        expect(canvas.width).toBe(4);
        expect(canvas.height).toBe(3);
        expect(canvas.get(0, 0)).toBe(-1);
        expect(canvas.set(3, 2, 5)).toBe(true);
        expect(canvas.get(3, 2)).toBe(5);
        expect(canvas.set(4, 0, 1)).toBe(false);
        expect(canvas.set(0, -1, 1)).toBe(false);
        expect(canvas.get(4, 0)).toBe(-1);
        expect(canvas.get(-1, 0)).toBe(-1);
        expect(() => new PixelCanvas(0, 3)).toThrow();
        expect(() => new PixelCanvas(2.5, 3)).toThrow();
        const opaque = new PixelCanvas(2, 2, 0);
        expect(opaque.get(1, 1)).toBe(0);
        opaque.clear(3);
        expect(opaque.get(0, 0)).toBe(3);
        opaque.clear();
        expect(opaque.get(0, 0)).toBe(0);
    });

    it("draws lines with both endpoints, symmetric in direction", () => {
        const canvas = new PixelCanvas(8, 8);
        canvas.line(1, 1, 6, 3, 1);
        expect(canvas.get(1, 1)).toBe(1);
        expect(canvas.get(6, 3)).toBe(1);
        const forward = canvas.snapshot();
        canvas.clear();
        canvas.line(6, 3, 1, 1, 1);
        expect(canvas.snapshot()).toEqual(forward);
        // every column between the ends is covered exactly once on a shallow line
        for (let x = 1; x <= 6; x++) {
            const hits = [0, 1, 2, 3, 4].filter((y) => canvas.get(x, y) === 1);
            expect(hits.length).toBe(1);
        }
        canvas.clear();
        canvas.line(2, 0, 2, 5, 2);
        expect(
            picture(canvas)
                .map((row) => row[2])
                .join(""),
        ).toBe("222222..");
        canvas.clear();
        canvas.line(0, 0, 3, 3, 3);
        expect(picture(canvas).slice(0, 4)).toEqual([
            "3.......",
            ".3......",
            "..3.....",
            "...3....",
        ]);
        // a line that leaves the buffer is clipped, not an error
        canvas.line(6, 6, 12, 12, 4);
        expect(canvas.get(7, 7)).toBe(4);
        canvas.line(1, 1, 1, 1, 5);
        expect(canvas.get(1, 1)).toBe(5);
    });

    it("draws filled and outlined rectangles from any two corners", () => {
        const canvas = new PixelCanvas(6, 5);
        canvas.rect(4, 3, 1, 1, 1, false);
        expect(picture(canvas)).toEqual([
            "......",
            ".1111.",
            ".1..1.",
            ".1111.",
            "......",
        ]);
        canvas.rect(1, 1, 4, 3, 2, true);
        expect(picture(canvas)).toEqual([
            "......",
            ".2222.",
            ".2222.",
            ".2222.",
            "......",
        ]);
        canvas.clear();
        canvas.rect(2, 2, 2, 2, 7, false);
        expect(canvas.get(2, 2)).toBe(7);
        expect(canvas.get(3, 2)).toBe(-1);
    });

    it("flood fills a region up to its border and counts the pixels", () => {
        const canvas = new PixelCanvas(6, 6);
        canvas.rect(1, 1, 4, 4, 1, false);
        expect(canvas.flood_fill(2, 2, 2)).toBe(4);
        expect(picture(canvas)).toEqual([
            "......",
            ".1111.",
            ".1221.",
            ".1221.",
            ".1111.",
            "......",
        ]);
        expect(canvas.flood_fill(0, 0, 3)).toBe(36 - 12 - 4);
        expect(canvas.get(5, 5)).toBe(3);
        expect(canvas.get(2, 2)).toBe(2);
        expect(canvas.flood_fill(2, 2, 2)).toBe(0);
        expect(canvas.flood_fill(9, 9, 2)).toBe(0);
        // a diagonal gap does not connect (4-neighborhood)
        const diagonal = new PixelCanvas(3, 3);
        diagonal.set(1, 0, 1);
        diagonal.set(0, 1, 1);
        expect(diagonal.flood_fill(0, 0, 2)).toBe(1);
        expect(diagonal.get(2, 2)).toBe(-1);
        // a big fill does not recurse
        const big = new PixelCanvas(256, 256);
        expect(big.flood_fill(0, 0, 1)).toBe(256 * 256);
    });

    it("snapshots and restores, also into a new canvas", () => {
        const canvas = new PixelCanvas(3, 2);
        canvas.set(1, 1, 4);
        const before = canvas.snapshot();
        canvas.set(0, 0, 9);
        expect(before[0]).toBe(-1);
        canvas.restore(before);
        expect(canvas.get(0, 0)).toBe(-1);
        expect(canvas.get(1, 1)).toBe(4);
        before[0] = 8;
        expect(canvas.get(0, 0)).toBe(-1);
        const copy = PixelCanvas.from_snapshot(3, 2, canvas.snapshot());
        expect(picture(copy)).toEqual(["...", ".4."]);
        expect(() => canvas.restore(new Int16Array(5))).toThrow();
    });

    it("resizes keeping the top-left content", () => {
        const canvas = new PixelCanvas(4, 4);
        canvas.rect(0, 0, 3, 3, 1, true);
        canvas.set(3, 3, 2);
        const smaller = canvas.resized(2, 3);
        expect(picture(smaller)).toEqual(["11", "11", "11"]);
        const larger = canvas.resized(5, 5);
        expect(picture(larger)).toEqual([
            "1111.",
            "1111.",
            "1111.",
            "1112.",
            ".....",
        ]);
        expect(larger.get(4, 4)).toBe(-1);
    });

    it("converts to ImageData bytes through a palette", () => {
        const canvas = new PixelCanvas(2, 1);
        canvas.set(0, 0, 1);
        canvas.set(1, 0, 7);
        const palette = [
            { r: 0, g: 0, b: 0 },
            { r: 108, g: 218, b: 217, a: 128 },
        ];
        const image = canvas.to_image_data(palette);
        expect(image.width).toBe(2);
        expect(image.height).toBe(1);
        expect(Array.from(image.data)).toEqual([
            108, 218, 217, 128, 0, 0, 0, 0,
        ]);
        canvas.set(1, 0, 0);
        expect(Array.from(canvas.to_image_data(palette).data.slice(4))).toEqual(
            [0, 0, 0, 255],
        );
    });
});
