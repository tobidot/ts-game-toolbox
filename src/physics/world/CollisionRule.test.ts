import { describe, expect, it } from "vitest";
import { PolygonI } from "../../geometries/Polygon";
import { RectI } from "../../geometries/Rect";
import { aabb_move, aabb_resolve } from "../aabb/Aabb";
import { sat_move, sat_overlap } from "../sweeping_sat/Sat";
import { AABB, AABB_SWEEP, SAT_SWEEP, ShapeAt } from "./CollisionRule";

const rect = (
    left: number,
    top: number,
    width: number,
    height: number,
): RectI => ({ left, top, width, height });

const polygon_of = (box: RectI): PolygonI => ({
    points: [
        { x: box.left, y: box.top },
        { x: box.left + box.width, y: box.top },
        { x: box.left + box.width, y: box.top + box.height },
        { x: box.left, y: box.top + box.height },
    ],
});

const box_of = (polygon: PolygonI): RectI => {
    const xs = polygon.points.map((point) => point.x);
    const ys = polygon.points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return rect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
};

const shape = (polygon: PolygonI): ShapeAt => ({
    polygon,
    box: box_of(polygon),
});
const boxed = (box: RectI): ShapeAt => shape(polygon_of(box));

/** The overlap cases of `Aabb.test.ts` and `Sat.test.ts`, as pairs of boxes. */
const box_pairs: [RectI, RectI][] = [
    [rect(0, 0, 10, 10), rect(8, 2, 10, 10)],
    [rect(0, 0, 10, 10), rect(-7, 1, 10, 10)],
    [rect(3, 3, 10, 10), rect(0, 11, 20, 4)],
    [rect(0, 0, 10, 10), rect(2, -9, 6, 10)],
    [rect(0, 0, 10, 10), rect(7, 4, 10, 10)],
    [rect(0, 8, 10, 10), rect(-20, 0, 50, 10)],
    [rect(0, 0, 10, 10), rect(10, 0, 10, 10)],
    [rect(0, 0, 10, 10), rect(-50, 8, 100, 20)],
];

/** A slope and a hexagon from `Sat.test.ts`: where a polygon is not its box. */
const ramp: PolygonI = {
    points: [
        { x: -100, y: 100 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ],
};
const hexagon: PolygonI = {
    points: [0, 1, 2, 3, 4, 5].map((index) => ({
        x: 10 * Math.cos((index * Math.PI) / 3),
        y: 10 * Math.sin((index * Math.PI) / 3),
    })),
};

/** The move cases of both test files: a mover, a move and the walls. */
const move_cases: [RectI, { x: number; y: number }, RectI[]][] = [
    [rect(0, 0, 10, 10), { x: 3, y: 4 }, []],
    [rect(0, 90, 10, 10), { x: 30, y: 15 }, [rect(0, 100, 1000, 20)]],
    [rect(0, 0, 10, 10), { x: 40, y: 180 }, [rect(0, 100, 1000, 20)]],
    [
        rect(0, 90, 10, 10),
        { x: 100, y: 10 },
        [rect(0, 100, 1000, 20), rect(50, 0, 10, 100)],
    ],
    [rect(0, 0, 10, 10), { x: 20, y: 40 }, [rect(-50, 30, 200, 10)]],
    [
        rect(0, 0, 10, 10),
        { x: 40, y: 40 },
        [rect(-50, 20, 100, 10), rect(20, -50, 10, 100)],
    ],
];

describe("AABB_SWEEP", () => {
    it("overlaps as aabb_resolve does, as a contact", () => {
        for (const [a, b] of box_pairs) {
            const push = aabb_resolve(a, b);
            const contact = AABB_SWEEP.overlap(boxed(a), boxed(b));
            if (push === null) {
                expect(contact).toBeNull();
                continue;
            }
            expect(contact).not.toBeNull();
            const depth = Math.abs(push.x) + Math.abs(push.y);
            expect(contact!.depth).toBeCloseTo(depth);
            expect(contact!.normal.x * depth).toBeCloseTo(push.x);
            expect(contact!.normal.y * depth).toBeCloseTo(push.y);
        }
    });

    it("moves as aabb_move does", () => {
        for (const [mover, delta, walls] of move_cases) {
            const expected = aabb_move(mover, delta, walls);
            const moved = AABB_SWEEP.move(
                boxed(mover),
                delta,
                walls.map(boxed),
            );
            expect(moved.offset.x).toBeCloseTo(expected.rect.left - mover.left);
            expect(moved.offset.y).toBeCloseTo(expected.rect.top - mover.top);
            expect(moved.hits).toEqual(expected.hits);
        }
    });

    it("uses the box of a polygon, not its shape", () => {
        // the hexagon's box reaches into the ramp's box, the hexagon doesn't reach the ramp
        const near = shape({
            points: hexagon.points.map((point) => ({
                x: point.x + 60,
                y: point.y + 5,
            })),
        });
        expect(sat_overlap(near.polygon, ramp)).toBeNull();
        expect(AABB_SWEEP.overlap(near, shape(ramp))).not.toBeNull();
    });
});

describe("SAT_SWEEP", () => {
    it("overlaps as sat_overlap does", () => {
        for (const [a, b] of box_pairs) {
            expect(SAT_SWEEP.overlap(boxed(a), boxed(b))).toEqual(
                sat_overlap(polygon_of(a), polygon_of(b)),
            );
        }
        const sunk = shape({
            points: hexagon.points.map((point) => ({
                x: point.x + 50,
                y: point.y + 30,
            })),
        });
        expect(SAT_SWEEP.overlap(sunk, shape(ramp))).toEqual(
            sat_overlap(sunk.polygon, ramp),
        );
    });

    it("moves as sat_move does", () => {
        for (const [mover, delta, walls] of move_cases) {
            const expected = sat_move(
                polygon_of(mover),
                delta,
                walls.map(polygon_of),
            );
            expect(
                SAT_SWEEP.move(boxed(mover), delta, walls.map(boxed)),
            ).toEqual(expected);
        }
        expect(
            SAT_SWEEP.move(shape(hexagon), { x: 0, y: 200 }, [shape(ramp)]),
        ).toEqual(sat_move(hexagon, { x: 0, y: 200 }, [ramp]));
    });
});

describe("AABB", () => {
    it("overlaps as AABB_SWEEP does", () => {
        for (const [a, b] of box_pairs) {
            expect(AABB.overlap(boxed(a), boxed(b))).toEqual(
                AABB_SWEEP.overlap(boxed(a), boxed(b)),
            );
        }
    });

    it("moves first and pushes out of what it ended in after, with aabb_resolve", () => {
        const floor = rect(0, 100, 1000, 20);
        // lands 5 deep: pushed back up, the hit says the floor's top
        const moved = AABB.move(boxed(rect(0, 80, 10, 10)), { x: 4, y: 15 }, [
            boxed(floor),
        ]);
        expect(moved.offset).toEqual({ x: 4, y: 10 });
        expect(moved.hits).toHaveLength(1);
        expect(moved.hits[0].wall).toBe(0);
        expect(moved.hits[0].normal).toEqual({ x: 0, y: -1 });
        expect(moved.hits[0].overlap).toEqual(
            aabb_resolve(rect(4, 95, 10, 10), floor),
        );
    });

    it("lets a fast box jump a thin wall: the move never looks at the path", () => {
        const thin = rect(0, 100, 1000, 4);
        const moved = AABB.move(boxed(rect(0, 80, 10, 10)), { x: 0, y: 45 }, [
            boxed(thin),
        ]);
        expect(moved.offset).toEqual({ x: 0, y: 45 });
        expect(moved.hits).toEqual([]);
        expect(AABB.is_swept).toBe(false);
        expect(AABB_SWEEP.is_swept).toBe(true);
        expect(SAT_SWEEP.is_swept).toBe(true);
    });
});
