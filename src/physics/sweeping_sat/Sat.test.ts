import { describe, expect, it } from "vitest";
import { PolygonI } from "../../geometries/Polygon";
import { aabb_move, aabb_resolve, aabb_sweep } from "../aabb/Aabb";
import { SeededRandom } from "../../random/SeededRandom";
import {
    SAT_SKIN,
    sat_axes,
    sat_move,
    sat_move_shapes,
    sat_overlap,
    sat_overlap_shapes,
    sat_shape,
    sat_sweep,
    sat_sweep_shapes,
} from "./Sat";

/** A box as a polygon, clockwise on screen (y down). */
const box = (
    left: number,
    top: number,
    width: number,
    height: number,
): PolygonI => ({
    points: [
        { x: left, y: top },
        { x: left + width, y: top },
        { x: left + width, y: top + height },
        { x: left, y: top + height },
    ],
});

const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
});

/** The same box, its points the other way round. */
const reversed = (polygon: PolygonI): PolygonI => ({
    points: [...polygon.points].reverse(),
});

/** A board 4 thick from `from` to `to`: a thin rotated rectangle. */
const board = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    thickness: number = 4,
): PolygonI => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const normal = {
        x: ((from.y - to.y) / length) * (thickness / 2),
        y: ((to.x - from.x) / length) * (thickness / 2),
    };
    return {
        points: [
            { x: from.x + normal.x, y: from.y + normal.y },
            { x: to.x + normal.x, y: to.y + normal.y },
            { x: to.x - normal.x, y: to.y - normal.y },
            { x: from.x - normal.x, y: from.y - normal.y },
        ],
    };
};

const moved = (
    polygon: PolygonI,
    offset: { x: number; y: number },
): PolygonI => ({
    points: polygon.points.map((point) => ({
        x: point.x + offset.x,
        y: point.y + offset.y,
    })),
});

describe("sat_overlap", () => {
    it("gives the smallest push out, from b towards a", () => {
        // a square sunk 2 into a floor from above: push it up by 2
        const contact = sat_overlap(box(0, 0, 10, 10), box(-50, 8, 100, 20));
        expect(contact).not.toBeNull();
        expect(contact!.normal.x).toBeCloseTo(0);
        expect(contact!.normal.y).toBeCloseTo(-1);
        expect(contact!.depth).toBeCloseTo(2);
    });

    it("agrees with aabb_resolve on boxes, either winding", () => {
        const cases = [
            [rect(0, 0, 10, 10), rect(8, 2, 10, 10)],
            [rect(0, 0, 10, 10), rect(-7, 1, 10, 10)],
            [rect(3, 3, 10, 10), rect(0, 11, 20, 4)],
            [rect(0, 0, 10, 10), rect(2, -9, 6, 10)],
        ];
        for (const [a, b] of cases) {
            const push = aabb_resolve(a, b)!;
            for (const polygon of [
                box(b.left, b.top, b.width, b.height),
                reversed(box(b.left, b.top, b.width, b.height)),
            ]) {
                const contact = sat_overlap(
                    box(a.left, a.top, a.width, a.height),
                    polygon,
                )!;
                expect(contact.normal.x * contact.depth).toBeCloseTo(push.x);
                expect(contact.normal.y * contact.depth).toBeCloseTo(push.y);
            }
        }
    });

    it("does not count touching edges, and is null when apart", () => {
        expect(sat_overlap(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBeNull();
        expect(sat_overlap(box(0, 0, 10, 10), box(0, 10, 10, 10))).toBeNull();
        expect(sat_overlap(box(0, 0, 10, 10), box(30, 30, 5, 5))).toBeNull();
    });

    it("sees the gap a box test can't: a square beside a slope's corner", () => {
        // the bounding boxes overlap, the shapes don't
        const slope: PolygonI = {
            points: [
                { x: 0, y: 20 },
                { x: 20, y: 0 },
                { x: 20, y: 20 },
            ],
        };
        expect(sat_overlap(box(0, 0, 8, 8), slope)).toBeNull();
    });

    it("pushes off a slope along its tilted normal", () => {
        // a 30 degree slope going down to the right, a square sunk into it
        const angle = Math.PI / 6;
        const slope = board(
            { x: -100, y: -100 * Math.tan(angle) },
            { x: 100, y: 100 * Math.tan(angle) },
            20,
        );
        const contact = sat_overlap(box(-5, -14, 10, 10), slope)!;
        expect(contact.normal.x).toBeCloseTo(Math.sin(angle));
        expect(contact.normal.y).toBeCloseTo(-Math.cos(angle));
        expect(contact.depth).toBeGreaterThan(0);
    });
});

describe("sat_sweep", () => {
    it("agrees with aabb_sweep for a square falling onto a floor", () => {
        const square = rect(0, 0, 10, 10);
        const floor = rect(-50, 30, 100, 10);
        const expected = aabb_sweep(square, { x: 3, y: 40 }, floor)!;
        const hit = sat_sweep(
            box(0, 0, 10, 10),
            { x: 3, y: 40 },
            box(-50, 30, 100, 10),
        )!;
        expect(hit.time).toBeCloseTo(expected.time);
        expect(hit.normal.x).toBeCloseTo(expected.normal.x);
        expect(hit.normal.y).toBeCloseTo(expected.normal.y);
        expect(hit.overlap).toEqual({ x: 0, y: 0 });
    });

    it("gives a slope's tilted normal", () => {
        const angle = Math.PI / 6;
        const slope = board(
            { x: -100, y: 50 - 100 * Math.tan(angle) },
            { x: 100, y: 50 + 100 * Math.tan(angle) },
        );
        const hit = sat_sweep(box(-5, -5, 10, 10), { x: 0, y: 100 }, slope)!;
        expect(hit).not.toBeNull();
        expect(hit.normal.x).toBeCloseTo(Math.sin(angle));
        expect(hit.normal.y).toBeCloseTo(-Math.cos(angle));
        expect(hit.time).toBeGreaterThan(0);
        expect(hit.time).toBeLessThan(1);
    });

    it("does not let a fast square tunnel through a thin board", () => {
        const thin = board({ x: -100, y: 200 }, { x: 100, y: 230 }, 2);
        const hit = sat_sweep(box(-5, -5, 10, 10), { x: 4, y: 5000 }, thin);
        expect(hit).not.toBeNull();
        const at = moved(box(-5, -5, 10, 10), {
            x: 4 * hit!.time,
            y: 5000 * hit!.time,
        });
        // where it stops it touches the board, and it is not inside
        const contact = sat_overlap(at, thin);
        expect(contact === null || contact.depth < 1e-6).toBe(true);
        expect(hit!.normal.y).toBeLessThan(0);
    });

    it("reports an existing overlap at time 0 with the push", () => {
        const hit = sat_sweep(
            box(0, 0, 10, 10),
            { x: 0, y: 5 },
            box(-50, 8, 100, 20),
        )!;
        expect(hit.time).toBe(0);
        expect(hit.normal.y).toBeCloseTo(-1);
        expect(hit.overlap.x).toBeCloseTo(0);
        expect(hit.overlap.y).toBeCloseTo(-2);
    });

    it("is null when the path misses, stops short, or only grazes", () => {
        const wall = box(50, 0, 10, 10);
        expect(
            sat_sweep(box(0, 30, 10, 10), { x: 100, y: 0 }, wall),
        ).toBeNull();
        expect(sat_sweep(box(0, 0, 10, 10), { x: 20, y: 0 }, wall)).toBeNull();
        expect(
            sat_sweep(box(0, 0, 10, 10), { x: -100, y: 0 }, wall),
        ).toBeNull();
        // sliding along the top face, edge on edge
        expect(
            sat_sweep(box(40, -10, 10, 10), { x: 30, y: 0 }, wall),
        ).toBeNull();
        expect(sat_sweep(box(0, 0, 10, 10), { x: 0, y: 0 }, wall)).toBeNull();
    });
});

describe("sat_move", () => {
    it("moves freely when nothing is in the way", () => {
        const result = sat_move(box(0, 0, 10, 10), { x: 7, y: -3 }, [
            box(100, 100, 10, 10),
        ]);
        expect(result.offset).toEqual({ x: 7, y: -3 });
        expect(result.hits).toEqual([]);
    });

    it("lands on a floor and slides like aabb_move, a skin above it", () => {
        const expected = aabb_move(rect(0, 0, 10, 10), { x: 20, y: 40 }, [
            rect(-50, 30, 200, 10),
        ]);
        const result = sat_move(box(0, 0, 10, 10), { x: 20, y: 40 }, [
            box(-50, 30, 200, 10),
        ]);
        expect(result.offset.x).toBeCloseTo(expected.rect.left);
        expect(result.offset.y).toBeCloseTo(expected.rect.top - SAT_SKIN);
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].normal.y).toBeCloseTo(-1);
    });

    it("keeps the speed along a 30 degree board", () => {
        const angle = Math.PI / 6;
        const along = { x: Math.cos(angle), y: Math.sin(angle) };
        const normal = { x: Math.sin(angle), y: -Math.cos(angle) };
        const slope = board(
            { x: -500 * along.x, y: -500 * along.y },
            { x: 500 * along.x, y: 500 * along.y },
            6,
        );
        // a square resting on it: drop it from above first
        const square = box(-5, -60, 10, 10);
        const landed = sat_move(square, { x: 0, y: 200 }, [slope]);
        expect(landed.hits).toHaveLength(1);
        const resting = moved(square, landed.offset);
        // then move it 30 along the board and 12 into it
        const delta = {
            x: along.x * 30 - normal.x * 12,
            y: along.y * 30 - normal.y * 12,
        };
        const slid = sat_move(resting, delta, [slope]);
        const gone_along = slid.offset.x * along.x + slid.offset.y * along.y;
        const gone_in = slid.offset.x * normal.x + slid.offset.y * normal.y;
        expect(gone_along).toBeCloseTo(30, 3);
        expect(gone_in).toBeGreaterThan(-SAT_SKIN);
        expect(sat_overlap(moved(resting, slid.offset), slope)).toBeNull();
    });

    it("never ends inside a thin board, however fast", () => {
        const thin = board({ x: -1e6, y: 120 }, { x: 1e6, y: 120 }, 1);
        for (const speed of [200, 2000, 20000, 200000]) {
            const square = box(-5, -5, 10, 10);
            const result = sat_move(square, { x: speed / 10, y: speed }, [
                thin,
            ]);
            expect(result.hits.length).toBeGreaterThan(0);
            expect(sat_overlap(moved(square, result.offset), thin)).toBeNull();
            // and it stayed above the board
            expect(result.offset.y).toBeLessThan(115);
        }
    });

    it("pushes out of a wall it already sat in, then moves on", () => {
        const result = sat_move(box(0, 0, 10, 10), { x: 5, y: 0 }, [
            box(-50, 8, 100, 20),
        ]);
        expect(result.hits[0].time).toBe(0);
        expect(result.offset.y).toBeCloseTo(-2 - SAT_SKIN);
        expect(result.offset.x).toBeCloseTo(5);
    });

    it("stops in a corner between two walls", () => {
        const floor = box(-50, 20, 100, 10);
        const wall = box(20, -50, 10, 100);
        const result = sat_move(box(0, 0, 10, 10), { x: 40, y: 40 }, [
            floor,
            wall,
        ]);
        expect(result.offset.x).toBeCloseTo(10 - SAT_SKIN);
        expect(result.offset.y).toBeCloseTo(10 - SAT_SKIN);
        expect(result.hits).toHaveLength(2);
    });

    it("says which wall each hit was, by its index in the list", () => {
        const far = box(500, 500, 10, 10);
        const floor = box(-50, 20, 100, 10);
        const wall = box(20, -50, 10, 100);
        const result = sat_move(box(0, 0, 10, 10), { x: 40, y: 40 }, [
            wall,
            far,
            floor,
        ]);
        expect(result.hits.map((hit) => hit.wall).sort()).toEqual([0, 2]);
        for (const hit of result.hits) {
            const expected = hit.wall === 0 ? { x: -1, y: 0 } : { x: 0, y: -1 };
            expect(hit.normal.x).toBeCloseTo(expected.x);
            expect(hit.normal.y).toBeCloseTo(expected.y);
        }
    });

    it("works with triangles and hexagons, not only boxes", () => {
        const hexagon: PolygonI = {
            points: [0, 1, 2, 3, 4, 5].map((index) => ({
                x: 10 * Math.cos((index * Math.PI) / 3),
                y: 10 * Math.sin((index * Math.PI) / 3),
            })),
        };
        const ramp: PolygonI = {
            points: [
                { x: -100, y: 100 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
            ],
        };
        const result = sat_move(hexagon, { x: 0, y: 200 }, [ramp]);
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].normal.x).toBeCloseTo(-1 / Math.sqrt(5));
        expect(result.hits[0].normal.y).toBeCloseTo(-2 / Math.sqrt(5));
        expect(sat_overlap(moved(hexagon, result.offset), ramp)).toBeNull();
    });
});

/** A convex polygon with `corners` corners around `center`, turned and stretched at random. */
const random_convex = (
    random: SeededRandom,
    center: { x: number; y: number },
): PolygonI => {
    const corners = random.int(3, 8);
    const radius = random.float(4, 30);
    const stretch = random.float(0.5, 1.5);
    const turn = random.float(0, Math.PI * 2);
    return {
        points: Array.from({ length: corners }, (_, index) => {
            const angle = turn + (index * Math.PI * 2) / corners;
            return {
                x: center.x + Math.cos(angle) * radius * stretch,
                y: center.y + Math.sin(angle) * radius,
            };
        }),
    };
};

describe("prepared shapes", () => {
    it("work out each edge direction once: a box has 2 axes, a hexagon 3, a triangle 3", () => {
        expect(sat_axes(box(0, 0, 10, 20))).toEqual([
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ]);
        const hexagon: PolygonI = {
            points: [0, 1, 2, 3, 4, 5].map((index) => ({
                x: 10 * Math.cos((index * Math.PI) / 3),
                y: 10 * Math.sin((index * Math.PI) / 3),
            })),
        };
        expect(sat_axes(hexagon)).toHaveLength(3);
        const triangle: PolygonI = {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 0, y: 10 },
            ],
        };
        expect(sat_axes(triangle)).toHaveLength(3);
        for (const axis of sat_axes(hexagon)) {
            expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(1, 12);
        }
    });

    it("give what sat_overlap, sat_sweep and sat_move give, on random convex shapes", () => {
        const random = new SeededRandom(27);
        let overlaps = 0;
        let hits = 0;
        for (let round = 0; round < 400; round++) {
            const a = random_convex(random, {
                x: random.float(-40, 40),
                y: random.float(-40, 40),
            });
            const b = random_convex(random, { x: 0, y: 0 });
            const delta = {
                x: random.float(-80, 80),
                y: random.float(-80, 80),
            };
            const walls = [b, random_convex(random, { x: 30, y: 30 })];
            const contact = sat_overlap(a, b);
            const prepared = sat_overlap_shapes(sat_shape(a), sat_shape(b));
            if (contact === null) {
                expect(prepared).toBeNull();
            } else {
                overlaps += 1;
                expect(prepared).not.toBeNull();
                expect(prepared!.depth).toBeCloseTo(contact.depth, 9);
                expect(prepared!.normal.x).toBeCloseTo(contact.normal.x, 9);
                expect(prepared!.normal.y).toBeCloseTo(contact.normal.y, 9);
            }
            const hit = sat_sweep(a, delta, b);
            const swept = sat_sweep_shapes(sat_shape(a), delta, sat_shape(b));
            if (hit === null) {
                expect(swept).toBeNull();
            } else {
                hits += 1;
                expect(swept).not.toBeNull();
                expect(swept!.time).toBeCloseTo(hit.time, 9);
                expect(swept!.normal.x).toBeCloseTo(hit.normal.x, 9);
                expect(swept!.normal.y).toBeCloseTo(hit.normal.y, 9);
                expect(swept!.overlap.x).toBeCloseTo(hit.overlap.x, 9);
                expect(swept!.overlap.y).toBeCloseTo(hit.overlap.y, 9);
            }
            const move = sat_move(a, delta, walls);
            const prepared_move = sat_move_shapes(
                sat_shape(a),
                delta,
                walls.map(sat_shape),
            );
            expect(prepared_move.offset.x).toBeCloseTo(move.offset.x, 9);
            expect(prepared_move.offset.y).toBeCloseTo(move.offset.y, 9);
            expect(prepared_move.hits.map((one) => one.wall)).toEqual(
                move.hits.map((one) => one.wall),
            );
        }
        // the cases were not all misses
        expect(overlaps).toBeGreaterThan(50);
        expect(hits).toBeGreaterThan(50);
    });
});
