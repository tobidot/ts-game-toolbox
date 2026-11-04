import { describe, expect, it } from "vitest";
import { FixedStepClock } from "./FixedStepClock";

describe("FixedStepClock", () => {
    it("runs one step per whole step of time and keeps the rest for the next frame", () => {
        const clock = new FixedStepClock(0.25);
        let steps = 0;
        const count = () => {
            steps += 1;
        };
        clock.advance(0.2, count);
        expect(steps).toBe(0);
        clock.advance(0.1, count);
        expect(steps).toBe(1);
        clock.advance(0.75, count);
        expect(steps).toBe(4);
    });

    it("plays out the same however the frames fall", () => {
        const run = (frames: number[]): number => {
            const clock = new FixedStepClock(1 / 8);
            let position = 0;
            for (const frame of frames) {
                clock.advance(frame, () => {
                    position += 1;
                });
            }
            return position;
        };
        const even = new Array<number>(8).fill(0.25);
        const uneven = [0.5, 0.125, 0.125, 0.75, 0.25, 0.25];
        expect(run(even)).toBe(16);
        expect(run(uneven)).toBe(16);
    });

    it("stops at a step that returns something, and drops the rest of the time", () => {
        const clock = new FixedStepClock(0.25);
        let steps = 0;
        const result = clock.advance(1, () => {
            steps += 1;
            return steps === 2 ? "over" : undefined;
        });
        expect(result).toBe("over");
        expect(steps).toBe(2);
        clock.advance(0.2, () => {
            steps += 1;
        });
        expect(steps).toBe(2);
    });

    it("gives nothing back from steps that return nothing", () => {
        const clock = new FixedStepClock(0.25);
        expect(clock.advance(1, () => undefined)).toBeUndefined();
    });

    it("forgets the time left over on reset", () => {
        const clock = new FixedStepClock(0.25);
        let steps = 0;
        const count = () => {
            steps += 1;
        };
        clock.advance(0.2, count);
        clock.reset();
        clock.advance(0.1, count);
        expect(steps).toBe(0);
    });

    it("refuses a step that isn't longer than 0", () => {
        expect(() => new FixedStepClock(0)).toThrow();
    });
});
