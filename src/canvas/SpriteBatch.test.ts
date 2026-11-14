import { describe, expect, it } from "vitest";
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
});
