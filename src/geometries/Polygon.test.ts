import { describe, it, expect } from "vitest";
import { Polygon } from "./Polygon";
import { Vector2 } from "./Vector2";

describe("Polygon", () => {
    it("should correctly detect if a point is contained", () => {
        const polygon = new Polygon([
            new Vector2(0, 100),
            new Vector2(100, 0),
            new Vector2(-100, 0),
        ]);

        expect(polygon.contains(new Vector2(0, 50))).toBe(true);
        expect(polygon.contains(new Vector2(50, 10))).toBe(true);
        expect(polygon.contains(new Vector2(-50, 10))).toBe(true);

        expect(polygon.contains(new Vector2(100, 100))).toBe(false);
        expect(polygon.contains(new Vector2(0, -10))).toBe(false);
        expect(polygon.contains(new Vector2(-110, 0))).toBe(false);
        expect(polygon.contains(new Vector2(110, 0))).toBe(false);
        expect(polygon.contains(new Vector2(0, 110))).toBe(false);
    });

    it("bounding_rect is the smallest rect around the points", () => {
        const polygon = new Polygon([
            { x: 3, y: -2 },
            { x: 10, y: 4 },
            { x: -1, y: 7 },
        ]);

        const rect = polygon.bounding_rect;

        expect(rect.left).toBe(-1);
        expect(rect.top).toBe(-2);
        expect(rect.width).toBe(11);
        expect(rect.height).toBe(9);
    });

    it("bounding_rect of no points is empty", () => {
        const rect = new Polygon([]).bounding_rect;

        expect(rect.width).toBe(0);
        expect(rect.height).toBe(0);
    });

    it("contains is not fooled by a ray that only grazes a corner", () => {
        const triangle = new Polygon([
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
        ]);

        // On the line through its corners, before them and after them.
        expect(triangle.contains({ x: 50, y: 50 })).toBe(false);
        expect(triangle.contains({ x: 250, y: 250 })).toBe(false);
        expect(triangle.contains({ x: 170, y: 130 })).toBe(true);

        const diamond = new Polygon([
            { x: 100, y: 0 },
            { x: 200, y: 100 },
            { x: 100, y: 200 },
            { x: 0, y: 100 },
        ]);
        // In line with a corner, on each axis.
        expect(diamond.contains({ x: 100, y: -50 })).toBe(false);
        expect(diamond.contains({ x: -50, y: 100 })).toBe(false);
        expect(diamond.contains({ x: 100, y: 100 })).toBe(true);
    });

    it("contains works on a concave shape", () => {
        const notch = new Polygon([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 50, y: 50 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ]);

        expect(notch.contains({ x: 25, y: 50 })).toBe(true);
        expect(notch.contains({ x: 80, y: 50 })).toBe(false);
        expect(notch.contains({ x: 80, y: 10 })).toBe(true);
    });

    it("translated() returns a moved copy and leaves the original", () => {
        const triangle = new Polygon([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 0, y: 5 },
        ]);
        const moved = triangle.translated({ x: 3, y: -2 });
        expect(moved).not.toBe(triangle);
        expect(moved.points).toEqual([
            { x: 3, y: -2 },
            { x: 13, y: -2 },
            { x: 3, y: 3 },
        ]);
        expect(triangle.points[1]).toEqual({ x: 10, y: 0 });
    });

    it("rotated() turns around the pivot, clockwise on screen like canvas rotate()", () => {
        const square = new Polygon([
            { x: 10, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 10 },
            { x: 10, y: 10 },
        ]);
        const turned = square.rotated(Math.PI / 2, { x: 10, y: 0 });
        const expected = [
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 0, y: 0 },
        ];
        turned.points.forEach((point, index) => {
            expect(point.x).toBeCloseTo(expected[index].x);
            expect(point.y).toBeCloseTo(expected[index].y);
        });
        expect(square.points[1]).toEqual({ x: 20, y: 0 });
        const back = turned.rotated(-Math.PI / 2, { x: 10, y: 0 });
        back.points.forEach((point, index) => {
            expect(point.x).toBeCloseTo(square.points[index].x);
            expect(point.y).toBeCloseTo(square.points[index].y);
        });
    });
});
