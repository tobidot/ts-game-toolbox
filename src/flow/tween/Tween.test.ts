import { describe, expect, it } from "vitest";
import { ease_in, ease_in_out, ease_linear, ease_out, Tween } from "./Tween";

describe("easing functions", () => {
    it("all start at 0 and end at 1", () => {
        for (const easing of [ease_linear, ease_in, ease_out, ease_in_out]) {
            expect(easing(0)).toBe(0);
            expect(easing(1)).toBe(1);
        }
    });

    it("have their shape in the middle", () => {
        expect(ease_linear(0.25)).toBe(0.25);
        expect(ease_in(0.5)).toBe(0.25);
        expect(ease_out(0.5)).toBe(0.75);
        expect(ease_in_out(0.25)).toBe(0.125);
        expect(ease_in_out(0.5)).toBe(0.5);
        expect(ease_in_out(0.75)).toBe(0.875);
    });
});

describe("Tween", () => {
    it("starts exactly on from and ends exactly on to", () => {
        const tween = new Tween(0.1, 0.7, 1);
        expect(tween.value).toBe(0.1);
        expect(tween.is_done).toBe(false);
        for (let frame = 0; frame < 60; frame++) {
            tween.update(1 / 60);
        }
        tween.update(1 / 60);
        expect(tween.value).toBe(0.7);
        expect(tween.is_done).toBe(true);
    });

    it("follows the easing in the middle", () => {
        const linear = new Tween(10, 20, 2);
        linear.update(1);
        expect(linear.value).toBeCloseTo(15);
        const eased = new Tween(10, 20, 2, ease_in);
        eased.update(1);
        expect(eased.value).toBeCloseTo(12.5);
        const falling = new Tween(1, 0, 1, ease_out);
        falling.update(0.5);
        expect(falling.value).toBeCloseTo(0.25);
    });

    it("lands exactly on to after one huge step", () => {
        const tween = new Tween(0, 1, 0.1, ease_in_out);
        tween.update(1000);
        expect(tween.value).toBe(1);
        expect(tween.is_done).toBe(true);
    });

    it("ignores empty and negative steps", () => {
        const tween = new Tween(0, 1, 1);
        tween.update(0.5);
        tween.update(0);
        tween.update(-1);
        tween.update(Number.NaN);
        expect(tween.value).toBe(0.5);
    });

    it("runs again after restart", () => {
        const tween = new Tween(3, 5, 1);
        tween.update(2);
        tween.restart();
        expect(tween.value).toBe(3);
        expect(tween.is_done).toBe(false);
        tween.update(0.5);
        expect(tween.value).toBeCloseTo(4);
    });

    it("refuses a duration of zero or less", () => {
        expect(() => new Tween(0, 1, 0)).toThrow();
        expect(() => new Tween(0, 1, -1)).toThrow();
    });
});
