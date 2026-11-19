import { describe, expect, it } from "vitest";
import { SpriteSheet } from "./animation/SpriteSheet";
import { SpriteBatch } from "./SpriteBatch";

interface Matrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

/** A context that only keeps its transform and writes down what it was asked to do. */
function recording_context(base: Matrix) {
    let transform = { ...base };
    const calls: string[] = [];
    const draws: Array<{ image: unknown; transform: Matrix; rect: number[] }> =
        [];
    const context = {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        getTransform: () => ({ ...transform }),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        setTransform: (
            a: number,
            b: number,
            c: number,
            d: number,
            e: number,
            f: number,
        ) => {
            calls.push("setTransform");
            transform = { a, b, c, d, e, f };
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        drawImage: (image: unknown, ...rect: number[]) => {
            calls.push("drawImage");
            draws.push({ image, transform: { ...transform }, rect });
        },
        save: () => calls.push("save"),
        restore: () => calls.push("restore"),
    };
    return {
        context: context as unknown as CanvasRenderingContext2D,
        calls,
        draws,
        transform: () => transform,
    };
}

/** Where a point of the sprite's own drawing lands, through a matrix. */
function apply(matrix: Matrix, x: number, y: number): [number, number] {
    return [
        matrix.a * x + matrix.c * y + matrix.e,
        matrix.b * x + matrix.d * y + matrix.f,
    ];
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const walker = { name: "walker" } as unknown as CanvasImageSource;
const brute = { name: "brute" } as unknown as CanvasImageSource;

describe("SpriteBatch", () => {
    it("draws image by image, in the order each image came first, each sprite in the order added", () => {
        const batch = new SpriteBatch();
        batch.add(walker, 1, 0, 0, 10, 10);
        batch.add(brute, 2, 0, 0, 10, 10);
        batch.add(walker, 3, 0, 0, 10, 10);
        expect(batch.size).toBe(3);
        const { context, draws } = recording_context(IDENTITY);
        expect(batch.draw(context)).toBe(3);
        expect(draws.map((draw) => draw.image)).toEqual([
            walker,
            walker,
            brute,
        ]);
        expect(draws.map((draw) => draw.transform.e)).toEqual([1, 3, 2]);
        expect(batch.size).toBe(0);
    });

    it("one setTransform per sprite, no save or restore, and the transform back as it was", () => {
        const base = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
        const batch = new SpriteBatch();
        for (let index = 0; index < 4; index++) {
            batch.add(walker, index * 5, 0, index, 8, 6);
        }
        const recording = recording_context(base);
        batch.draw(recording.context);
        expect(recording.calls.filter((call) => call === "save")).toEqual([]);
        expect(recording.calls.filter((call) => call === "restore")).toEqual(
            [],
        );
        // four sprites, then the base again
        expect(
            recording.calls.filter((call) => call === "setTransform"),
        ).toHaveLength(5);
        expect(recording.transform()).toEqual(base);
    });

    it("puts each sprite at its place, turned and sized, on top of the context's transform", () => {
        // the stage: twice the size, moved by 10, 20
        const base = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
        const batch = new SpriteBatch();
        // 8 wide, 4 tall, at 100, 50, turned a quarter clockwise on screen
        batch.add(walker, 100, 50, Math.PI / 2, 8, 4);
        const { context, draws } = recording_context(base);
        batch.draw(context);
        const [draw] = draws;
        expect(draw.rect).toEqual([-4, -2, 8, 4]);
        // the sprite's middle at 100, 50 in game units: 210, 120 on the canvas
        const middle = apply(draw.transform, 0, 0);
        expect(middle[0]).toBeCloseTo(210);
        expect(middle[1]).toBeCloseTo(120);
        // its right edge, the way it faces, turned a quarter: now below the middle
        const front = apply(draw.transform, 4, 0);
        expect(front[0]).toBeCloseTo(210);
        expect(front[1]).toBeCloseTo(128);
    });

    it("follows a base that is turned or skewed as well", () => {
        const base = { a: 0, b: 1, c: -1, d: 0, e: 5, f: 5 };
        const batch = new SpriteBatch();
        batch.add(brute, 10, 0, 0, 2, 2);
        const { context, draws } = recording_context(base);
        batch.draw(context);
        const middle = apply(draws[0].transform, 0, 0);
        // the base turns 10, 0 into 5, 15
        expect(middle[0]).toBeCloseTo(5);
        expect(middle[1]).toBeCloseTo(15);
    });

    it("draws nothing and touches nothing when empty, and clear() empties it", () => {
        const batch = new SpriteBatch();
        const recording = recording_context(IDENTITY);
        expect(batch.draw(recording.context)).toBe(0);
        expect(recording.calls).toEqual([]);
        batch.add(walker, 0, 0, 0, 1, 1);
        batch.clear();
        expect(batch.size).toBe(0);
        expect(batch.draw(recording.context)).toBe(0);
    });

    it("keeps up with thousands, and reuses its storage", () => {
        const batch = new SpriteBatch();
        for (let round = 0; round < 2; round++) {
            for (let index = 0; index < 5000; index++) {
                batch.add(index % 2 === 0 ? walker : brute, index, 0, 0, 1, 1);
            }
            const { context, draws } = recording_context(IDENTITY);
            expect(batch.draw(context)).toBe(5000);
            expect(draws[2499].image).toBe(walker);
            expect(draws[2499].transform.e).toBe(4998);
            expect(draws[2500].image).toBe(brute);
        }
    });

    it("draws sheet frames by their source rectangles, picture by picture, in the order added", () => {
        const batch = new SpriteBatch();
        const a = { left: 0, top: 0, width: 10, height: 20 };
        const b = { left: 10, top: 0, width: 10, height: 20 };
        batch.add_frame(walker, a, 100, 50, { anchor: { x: 5, y: 18 } });
        batch.add_frame(brute, b, 0, 0);
        batch.add_frame(walker, b, 200, 50, {
            anchor: { x: 5, y: 18 },
            scale: 2,
        });
        expect(batch.size).toBe(3);
        const recording = recording_context(IDENTITY);
        expect(batch.draw(recording.context)).toBe(3);
        expect(recording.draws.map((draw) => draw.image)).toEqual([
            walker,
            walker,
            brute,
        ]);
        // source rectangle, then where it lands: the anchor on the point
        expect(recording.draws[0].rect).toEqual([0, 0, 10, 20, 95, 32, 10, 20]);
        expect(recording.draws[1].rect).toEqual([
            10, 0, 10, 20, 190, 14, 20, 40,
        ]);
        // without an anchor: around the frame's middle
        expect(recording.draws[2].rect).toEqual([
            10, 0, 10, 20, -5, -10, 10, 20,
        ]);
        // unturned and unflipped frames need no transform of their own
        expect(
            recording.calls.filter((call) => call === "setTransform"),
        ).toEqual([]);
        expect(recording.calls.filter((call) => call === "save")).toEqual([]);
    });

    it("keeps a flipped frame's anchor on its point, mirrored around it", () => {
        const base = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
        const rect = { left: 30, top: 0, width: 10, height: 20 };
        const anchor = { x: 2, y: 18 };
        for (const angle of [0, 0.7]) {
            const batch = new SpriteBatch();
            batch.add_frame(walker, rect, 100, 50, {
                anchor,
                flip_x: true,
                scale: 1.5,
                angle,
            });
            const recording = recording_context(base);
            batch.draw(recording.context);
            const [draw] = recording.draws;
            const [, , sw, sh, dx, dy, dw, dh] = draw.rect;
            /** Where a pixel of the frame lands on the canvas. */
            const pixel = (px: number, py: number) =>
                apply(draw.transform, dx + (px * dw) / sw, dy + (py * dh) / sh);
            const at = pixel(anchor.x, anchor.y);
            // 100, 50 in game units: 210, 120 on the canvas
            expect(at[0]).toBeCloseTo(210);
            expect(at[1]).toBeCloseTo(120);
            if (angle === 0) {
                // mirrored: the frame's left edge lies right of the anchor
                expect(pixel(0, anchor.y)[0]).toBeCloseTo(210 + 2 * 1.5 * 2);
                expect(pixel(10, anchor.y)[0]).toBeCloseTo(210 - 8 * 1.5 * 2);
            }
            expect(recording.transform()).toEqual(base);
        }
    });

    it("switches the transform only where flipped and unflipped frames change", () => {
        const batch = new SpriteBatch();
        const rect = { left: 0, top: 0, width: 8, height: 8 };
        for (let index = 0; index < 10; index++) {
            batch.add_frame(walker, rect, index, 0, { flip_x: index >= 5 });
        }
        const recording = recording_context(IDENTITY);
        batch.draw(recording.context);
        // once into the mirror, once back
        expect(
            recording.calls.filter((call) => call === "setTransform"),
        ).toHaveLength(2);
        expect(recording.transform()).toEqual(IDENTITY);
    });

    it("draws a player's current frame with the sheet's anchors", () => {
        const sheet = SpriteSheet.grid(
            { width: 64, height: 32 } as unknown as CanvasImageSource,
            32,
            32,
            { anchor: { x: 16, y: 30 } },
        ).add_clips({ walk: { frames: "0-1", fps: 10, loop: true } });
        const player = sheet.player("walk");
        player.update(0.1 + 1e-9);
        const batch = new SpriteBatch();
        expect(batch.add_animation(player, 50, 60, { scale: 0.5 })).toBe(true);
        const recording = recording_context(IDENTITY);
        batch.draw(recording.context);
        expect(recording.draws[0].image).toBe(sheet.image);
        expect(recording.draws[0].rect).toEqual([
            32, 0, 32, 32, 42, 45, 16, 16,
        ]);
        // nothing to draw before the picture comes
        sheet.image = null;
        expect(batch.add_animation(player, 0, 0)).toBe(false);
        expect(batch.size).toBe(0);
    });

    it("reads a prescaled sheet's frames from its smaller picture", () => {
        const sheet = SpriteSheet.grid(
            { width: 64, height: 32 } as unknown as CanvasImageSource,
            32,
            32,
            { anchor: { x: 16, y: 30 } },
        ).add_clips({ walk: { frames: "0-1", fps: 10, loop: true } });
        const small = {
            width: 32,
            height: 16,
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            getContext: () => ({
                // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
                drawImage: () => undefined,
            }),
        } as unknown as HTMLCanvasElement;
        sheet.prescale(0.5, () => small);
        const player = sheet.player("walk");
        player.update(0.1 + 1e-9);
        const batch = new SpriteBatch();
        batch.add_animation(player, 50, 60, { scale: 0.5 });
        const recording = recording_context(IDENTITY);
        batch.draw(recording.context);
        expect(recording.draws[0].image).toBe(small);
        expect(recording.draws[0].rect).toEqual([
            16, 0, 16, 16, 42, 45, 16, 16,
        ]);
    });

    it("mixes whole pictures and frames of the same picture in one run", () => {
        const batch = new SpriteBatch();
        batch.add(walker, 10, 10, 0.5, 4, 4);
        batch.add_frame(
            walker,
            { left: 0, top: 0, width: 4, height: 4 },
            20,
            20,
        );
        const recording = recording_context(IDENTITY);
        batch.draw(recording.context);
        expect(recording.draws[0].rect).toEqual([-2, -2, 4, 4]);
        // back on the base for the frame after the turned picture
        expect(recording.draws[1].transform).toEqual(IDENTITY);
        expect(recording.draws[1].rect).toEqual([0, 0, 4, 4, 18, 18, 4, 4]);
        expect(recording.transform()).toEqual(IDENTITY);
    });
});
