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
});
