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
});
