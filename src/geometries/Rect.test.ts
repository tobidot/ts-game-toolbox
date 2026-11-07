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

    describe("touches_segment", () => {
        const rect = { left: 0, top: 0, width: 10, height: 10 };

        it("is true for a segment inside, across, or ending in the rect", () => {
            const a = { x: 2, y: 2 };
            const b = { x: 8, y: 8 };
            expect(Rect.touches_segment(rect, a, b)).toBe(true);
            expect(
                Rect.touches_segment(rect, { x: -5, y: 5 }, { x: 15, y: 5 }),
            ).toBe(true);
            expect(
                Rect.touches_segment(rect, { x: 5, y: 5 }, { x: 50, y: 50 }),
            ).toBe(true);
        });

        it("is false for a segment that passes by", () => {
            expect(
                Rect.touches_segment(rect, { x: -5, y: 8 }, { x: 8, y: 25 }),
            ).toBe(false);
            expect(
                Rect.touches_segment(rect, { x: 11, y: -5 }, { x: 11, y: 15 }),
            ).toBe(false);
        });

        it("is false for a segment that stops short of the rect", () => {
            expect(
                Rect.touches_segment(rect, { x: -5, y: 5 }, { x: -1, y: 5 }),
            ).toBe(false);
        });
    });

    describe("contained", () => {
        const box = { left: 10, top: 20, width: 200, height: 100 };

        it("fits a tall picture to the height, centered", () => {
            expect(Rect.contained(box, 50, 100)).toEqual({
                left: 85,
                top: 20,
                width: 50,
                height: 100,
            });
        });

        it("fits a wide picture to the width, centered", () => {
            expect(Rect.contained(box, 400, 100)).toEqual({
                left: 10,
                top: 45,
                width: 200,
                height: 50,
            });
        });

        it("grows a small picture", () => {
            expect(Rect.contained(box, 10, 10)).toEqual({
                left: 60,
                top: 20,
                width: 100,
                height: 100,
            });
        });

        it("gives the box for a picture with no size yet", () => {
            expect(Rect.contained(box, 0, 0)).toEqual(box);
        });
    });
});
