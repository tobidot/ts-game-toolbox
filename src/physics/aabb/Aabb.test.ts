import { describe, expect, it } from "vitest";
import {
    aabb_move,
    aabb_overlaps,
    aabb_resolve,
    aabb_sweep,
    aabb_union,
} from "./Aabb";

const box = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
});

describe("aabb_overlaps", () => {
    it("is true for crossing boxes and false for separated ones", () => {
        expect(aabb_overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
        expect(aabb_overlaps(box(0, 0, 10, 10), box(20, 0, 10, 10))).toBe(
            false,
        );
        expect(aabb_overlaps(box(0, 0, 10, 10), box(0, 20, 10, 10))).toBe(
            false,
        );
    });

    it("does not count touching edges", () => {
        expect(aabb_overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(
            false,
        );
        expect(aabb_overlaps(box(0, 0, 10, 10), box(0, 10, 10, 10))).toBe(
            false,
        );
        expect(aabb_overlaps(box(0, 0, 10, 10), box(9.99, 0, 10, 10))).toBe(
            true,
        );
    });

    it("is true for a box inside another", () => {
        expect(aabb_overlaps(box(2, 2, 2, 2), box(0, 0, 10, 10))).toBe(true);
    });
});

describe("aabb_resolve", () => {
    it("is null without an overlap", () => {
        expect(aabb_resolve(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBeNull();
    });

    it("pushes along the axis of the smaller overlap, towards the mover's side", () => {
        // the mover sits 3 deep in the wall's left face and 6 deep in its top
        expect(aabb_resolve(box(0, 0, 10, 10), box(7, 4, 10, 10))).toEqual({
            x: -3,
            y: 0,
        });
        // the mover comes from below
        expect(aabb_resolve(box(0, 8, 10, 10), box(-20, 0, 50, 10))).toEqual({
            x: 0,
            y: 2,
        });
        // and from the right
        expect(aabb_resolve(box(8, 0, 10, 10), box(0, -5, 10, 20))).toEqual({
            x: 2,
            y: 0,
        });
    });
});

describe("aabb_sweep", () => {
    const wall = box(100, 0, 20, 100);

    it("misses a wall that is not on the path", () => {
        expect(aabb_sweep(box(0, 0, 10, 10), { x: 50, y: 0 }, wall)).toBeNull();
        expect(
            aabb_sweep(box(0, 200, 10, 10), { x: 200, y: 0 }, wall),
        ).toBeNull();
    });

    it("hits the left face at the right time when moving right", () => {
        const hit = aabb_sweep(box(0, 10, 10, 10), { x: 180, y: 0 }, wall);
        expect(hit).not.toBeNull();
        expect(hit?.time).toBeCloseTo(0.5);
        expect(hit?.normal).toEqual({ x: -1, y: 0 });
        expect(hit?.overlap).toEqual({ x: 0, y: 0 });
    });

    it("hits the top of a floor when falling, even through it in one step", () => {
        const floor = box(0, 100, 1000, 1);
        const hit = aabb_sweep(box(0, 0, 10, 10), { x: 0, y: 900 }, floor);
        expect(hit?.time).toBeCloseTo(0.1);
        expect(hit?.normal).toEqual({ x: 0, y: -1 });
    });

    it("picks the axis the boxes meet last on a diagonal move", () => {
        // moving right and down onto a floor far below: y is met last
        const floor = box(0, 100, 1000, 10);
        const hit = aabb_sweep(box(0, 0, 10, 10), { x: 50, y: 180 }, floor);
        expect(hit?.normal).toEqual({ x: 0, y: -1 });
        expect(hit?.time).toBeCloseTo(0.5);
    });

    it("reports a hit at time 0 with the push when already overlapping", () => {
        const hit = aabb_sweep(box(95, 10, 10, 10), { x: 5, y: 0 }, wall);
        expect(hit?.time).toBe(0);
        expect(hit?.normal).toEqual({ x: -1, y: 0 });
        expect(hit?.overlap).toEqual({ x: -5, y: 0 });
    });

    it("does not hit a wall it only touches while moving along it", () => {
        const floor = box(0, 10, 1000, 10);
        expect(
            aabb_sweep(box(0, 0, 10, 10), { x: 30, y: 0 }, floor),
        ).toBeNull();
    });
});

describe("aabb_move", () => {
    const floor = box(0, 100, 1000, 20);

    it("moves freely without walls", () => {
        const result = aabb_move(box(0, 0, 10, 10), { x: 3, y: 4 }, []);
        expect(result.rect).toEqual(box(3, 4, 10, 10));
        expect(result.hits).toEqual([]);
        // the input is not changed
    });

    it("slides along a floor without sinking in", () => {
        const start = box(0, 90, 10, 10); // resting on the floor
        const result = aabb_move(start, { x: 30, y: 15 }, [floor]);
        expect(result.rect.top).toBe(90);
        expect(result.rect.left).toBe(30);
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].normal).toEqual({ x: 0, y: -1 });
        expect(start.left).toBe(0);
    });

    it("lands on the floor and keeps the horizontal rest of the move", () => {
        const result = aabb_move(box(0, 0, 10, 10), { x: 40, y: 180 }, [floor]);
        expect(result.rect.top).toBe(90);
        expect(result.rect.left).toBe(40);
        expect(result.hits[0].time).toBeCloseTo(0.5);
    });

    it("stops at a wall on the floor, hitting both in order", () => {
        const wall = box(50, 0, 10, 100);
        const result = aabb_move(box(0, 90, 10, 10), { x: 100, y: 10 }, [
            floor,
            wall,
        ]);
        expect(result.rect).toEqual(box(40, 90, 10, 10));
        expect(result.hits.map((hit) => hit.normal)).toEqual([
            { x: 0, y: -1 },
            { x: -1, y: 0 },
        ]);
    });
});

describe("aabb_union", () => {
    it("spans all boxes", () => {
        expect(
            aabb_union([
                box(0, 0, 10, 10),
                box(20, -5, 5, 5),
                box(5, 5, 1, 30),
            ]),
        ).toEqual(box(0, -5, 25, 40));
    });

    it("is a zero box for no boxes", () => {
        expect(aabb_union([])).toEqual(box(0, 0, 0, 0));
    });
});
