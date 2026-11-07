import { describe, expect, it } from "vitest";
import { angle_difference, clamp, lerp } from "./math";

describe("clamp", () => {
    it("holds a value inside the bounds", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(11, 0, 10)).toBe(10);
    });
});

describe("lerp", () => {
    it("walks from one value to the other", () => {
        expect(lerp(10, 20, 0)).toBe(10);
        expect(lerp(10, 20, 0.5)).toBe(15);
        expect(lerp(10, 20, 1)).toBe(20);
        expect(lerp(10, 20, 2)).toBe(30);
    });
});

describe("angle_difference", () => {
    it("takes the shortest way round", () => {
        expect(angle_difference(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
        expect(angle_difference(Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2);
        expect(angle_difference(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
        expect(angle_difference(-3, 3)).toBeCloseTo(6 - Math.PI * 2);
    });

    it("stays inside [-π, π] for angles far outside one turn", () => {
        for (let turn = -5; turn <= 5; turn++) {
            const difference = angle_difference(turn * 7, turn * 7 + 1);
            expect(difference).toBeCloseTo(1);
        }
    });
});
