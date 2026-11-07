import { describe, expect, it } from "vitest";
import { Vector2 } from "./Vector2";

describe("Vector2.limit", () => {
    it("shortens a vector that is too long", () => {
        const vector = new Vector2(3, 4).limit(1);
        expect(vector.len()).toBeCloseTo(1);
        expect(vector.x).toBeCloseTo(0.6);
        expect(vector.y).toBeCloseTo(0.8);
    });

    it("leaves a short vector and the null vector alone", () => {
        expect(new Vector2(0.3, 0.4).limit(1)).toEqual(new Vector2(0.3, 0.4));
        expect(new Vector2(0, 0).limit(1)).toEqual(new Vector2(0, 0));
    });
});
