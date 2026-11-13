import { describe, expect, it } from "vitest";
import { RectI } from "../../geometries/Rect";
import { SeededRandom } from "../../random/SeededRandom";
import { aabb_overlaps } from "../aabb/Aabb";
import { GridBroadPhase, NoBroadPhase, create_broad_phase } from "./BroadPhase";

/** Boxes of every size around the origin, some far bigger than a cell, some far away. */
function scattered(seed: number, count: number): RectI[] {
    const random = new SeededRandom(seed);
    const boxes: RectI[] = [];
    for (let index = 0; index < count; index++) {
        const size = random.chance(0.05)
            ? random.float(100, 400)
            : random.float(2, 50);
        boxes.push({
            left: random.float(-600, 600),
            top: random.float(-400, 400),
            width: size * random.float(0.3, 1.5),
            height: size,
        });
    }
    boxes.push({ left: 90000, top: -70000, width: 10, height: 10 });
    boxes.push({ left: 90005, top: -69995, width: 10, height: 10 });
    return boxes;
}

/** Every overlapping pair the slow way, lower index first, sorted. */
function every_pair(boxes: readonly RectI[]): number[] {
    const pairs: number[] = [];
    for (let first = 0; first < boxes.length; first++) {
        for (let second = first + 1; second < boxes.length; second++) {
            if (aabb_overlaps(boxes[first], boxes[second])) {
                pairs.push(first, second);
            }
        }
    }
    return pairs;
}

describe("GridBroadPhase", () => {
    it("finds the same pairs as a loop over every pair, in the same order", () => {
        for (const seed of [1, 2, 3]) {
            const boxes = scattered(seed, 700);
            const grid = new GridBroadPhase(64);
            const pairs: number[] = [];
            grid.pairs(boxes, pairs);
            expect(pairs).toEqual(every_pair(boxes));
        }
    });

    it("pairs nothing that only touches", () => {
        const grid = new GridBroadPhase(10);
        const pairs: number[] = [];
        grid.pairs(
            [
                { left: 0, top: 0, width: 10, height: 10 },
                { left: 10, top: 0, width: 10, height: 10 },
                { left: 0, top: 10, width: 10, height: 10 },
            ],
            pairs,
        );
        expect(pairs).toEqual([]);
    });

    it("finds what may touch a box among standing ones, in their order", () => {
        const boxes = scattered(9, 300);
        const grid = new GridBroadPhase(48);
        grid.stand(boxes);
        const found: number[] = [];
        for (const probe of scattered(10, 40)) {
            grid.near(probe, found);
            const expected = boxes
                .map((box, index) => (aabb_overlaps(box, probe) ? index : -1))
                .filter((index) => index >= 0);
            expect(found).toEqual(expected);
        }
    });

    it("keeps its cells sane when a box is very far away", () => {
        const grid = new GridBroadPhase(1);
        const boxes: RectI[] = [
            { left: 0, top: 0, width: 2, height: 2 },
            { left: 1, top: 1, width: 2, height: 2 },
            { left: 1e9, top: 1e9, width: 2, height: 2 },
        ];
        const pairs: number[] = [];
        grid.pairs(boxes, pairs);
        expect(pairs).toEqual([0, 1]);
        expect(grid.cell_count).toBeLessThanOrEqual(GridBroadPhase.MAX_CELLS);
    });
});

describe("NoBroadPhase", () => {
    it("pairs every overlapping box, and calls every standing box near", () => {
        const boxes = scattered(4, 200);
        const none = new NoBroadPhase();
        const pairs: number[] = [];
        none.pairs(boxes, pairs);
        expect(pairs).toEqual(every_pair(boxes));
        none.stand(boxes.slice(0, 5));
        const found: number[] = [];
        none.near({ left: 1e6, top: 0, width: 1, height: 1 }, found);
        expect(found).toEqual([0, 1, 2, 3, 4]);
    });

    it("is what create_broad_phase makes of its options", () => {
        expect(create_broad_phase({ kind: "none" })).toBeInstanceOf(
            NoBroadPhase,
        );
        const grid = create_broad_phase({ kind: "grid", cell_size: 32 });
        expect(grid).toBeInstanceOf(GridBroadPhase);
        expect((grid as GridBroadPhase).cell_size).toBe(32);
    });
});
