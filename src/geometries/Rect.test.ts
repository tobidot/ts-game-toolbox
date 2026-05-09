import { describe, it, expect } from "vitest";
import { Rect } from "./Rect";

describe("Rect", () => {
    it("should calculate right and bottom for rect at 0,0", () => {
        const rect = new Rect(0, 0, 100, 100);
        expect(rect.get_right()).toBe(100);
        expect(rect.get_bottom()).toBe(100);
    });

    it("should calculate right and bottom for rect at 50,25", () => {
        const rect = new Rect(50, 25, 100, 100);
        expect(rect.get_right()).toBe(150);
        expect(rect.get_bottom()).toBe(125);
    });

    it("should calculate area", () => {
        const rect = new Rect(0, 0, 100, 100);
        expect(rect.get_area()).toBe(10000);
    });

    it("should detect overlaps correctly", () => {
        const rect = new Rect(0, 0, 100, 100);

        // Same start
        expect(
            rect.overlaps_with({ left: 0, top: 0, width: 50, height: 50 }),
        ).toBe(true);

        // Overlap X but not Y
        expect(
            rect.overlaps_with({ left: 0, top: -100, width: 50, height: 50 }),
        ).toBe(false);

        // Overlap Y but not X
        expect(
            rect.overlaps_with({
                left: -100,
                top: -100,
                width: 50,
                height: 150,
            }),
        ).toBe(false);

        // Overlap fraction
        expect(
            rect.overlaps_with({
                left: -100,
                top: -100,
                width: 100.001,
                height: 100.001,
            }),
        ).toBe(true);

        // No overlap
        expect(
            rect.overlaps_with({ left: 101, top: 101, width: 10, height: 10 }),
        ).toBe(false);
    });
});
