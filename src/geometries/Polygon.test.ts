import assert from "assert";
import { Polygon } from "./Polygon";
import { Vector2 } from "./Vector2";

describe('Polygon', () => {
    it('contains', () => {
        const polygon = new Polygon([
            new Vector2(0, 1),
            new Vector2(1, 0),
            new Vector2(-1, 0),
        ]);
        // assert.strictEqual(true, polygon.contains(new Vector2(0.5, 0.5)));
        // assert.strictEqual(true, polygon.contains(new Vector2(0.9, 0.01)));
        // assert.strictEqual(true, polygon.contains(new Vector2(-0.9, 0.01)));
        // assert.strictEqual(true, polygon.contains(new Vector2(0.0, 0.99)));
        // assert.strictEqual(false, polygon.contains(new Vector2(-1.0, 1.0)));
        // assert.strictEqual(false, polygon.contains(new Vector2(1.0, 1.0)));

        assert.strictEqual(false, polygon.contains(new Vector2(-1.1, 0.0)));
        // assert.strictEqual(false, polygon.contains(new Vector2(1.1, 0.0)));
        // assert.strictEqual(false, polygon.contains(new Vector2(0, -0.1)));
        // assert.strictEqual(false, polygon.contains(new Vector2(0, 1.1)));
    })
})