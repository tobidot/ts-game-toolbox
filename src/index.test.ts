import assert from "assert";
import { describe, expect, it } from "vitest";
import * as toolbox from "./index";

describe("testsuite", () => {
    it("run", () => {
        assert.strictEqual(1, 1);
    });

    it("reaches the number helpers from the root", () => {
        expect(toolbox.clamp(5, 0, 1)).toBe(1);
        expect(toolbox.lerp(0, 10, 0.5)).toBe(5);
        expect(toolbox.angle_difference(0, Math.PI / 2)).toBeCloseTo(
            Math.PI / 2,
        );
    });
});
