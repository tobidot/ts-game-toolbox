import { describe, expect, it } from "vitest";
import { FRAME_BUDGET, FrameBudget } from "./FrameBudget";

const FRAME = 1 / 60;

/** Feeds `seconds` of frames at `fps` with `count` things on screen. */
function feed(
    budget: FrameBudget,
    fps: number,
    seconds: number,
    count: number = 100,
): void {
    const frames = Math.round(seconds * fps);
    for (let frame = 0; frame < frames; frame++) {
        budget.feed(1 / fps, count);
    }
}

describe("FrameBudget", () => {
    it("averages the frame rate over half a second, and says nothing before", () => {
        const budget = new FrameBudget();
        feed(budget, 60, 0.3);
        expect(budget.fps).toBeNull();
        feed(budget, 60, 0.3);
        expect(budget.fps).toBeCloseTo(60, 0);
        feed(budget, 30, 0.6);
        expect(budget.fps).toBeCloseTo(30, 0);
    });

    it("is full below 50 FPS and has room again from 55", () => {
        const budget = new FrameBudget();
        feed(budget, 60, 1);
        expect(budget.is_full).toBe(false);
        feed(budget, 45, 0.6);
        expect(budget.is_full).toBe(true);
        expect(budget.is_fading).toBe(false);
        feed(budget, 52, 0.6);
        expect(budget.is_full).toBe(true);
        feed(budget, 58, 0.6);
        expect(budget.is_full).toBe(false);
    });

    it("fades below 40 FPS until it is over 50 again, not in between", () => {
        const budget = new FrameBudget();
        feed(budget, 60, 1);
        expect(budget.fade_count(1000, FRAME)).toBe(0);
        feed(budget, 35, 0.6);
        expect(budget.is_fading).toBe(true);
        expect(budget.is_full).toBe(true);
        // a fifth of them a second
        let faded = 0;
        for (let frame = 0; frame < 35; frame++) {
            faded += budget.fade_count(1000, 1 / 35);
        }
        expect(faded).toBeGreaterThanOrEqual(199);
        expect(faded).toBeLessThanOrEqual(200);
        feed(budget, 45, 0.6);
        expect(budget.is_fading).toBe(true);
        feed(budget, 52, 0.6);
        expect(budget.is_fading).toBe(false);
        expect(budget.fade_count(1000, FRAME)).toBe(0);
    });

    it("fades at least a few a second, however few there are", () => {
        const budget = new FrameBudget();
        feed(budget, 30, 0.6);
        // a fifth of 20 would be 4 a second; at least 30 a second takes all 20 in 2/3 s
        let left = 20;
        for (let frame = 0; frame < 20; frame++) {
            left -= budget.fade_count(left, 1 / 30);
        }
        expect(left).toBe(0);
        expect(budget.fade_count(0, 1 / 30)).toBe(0);
    });

    it("ignores frames longer than a quarter of a second: a background tab is no overload", () => {
        const budget = new FrameBudget();
        feed(budget, 60, 1);
        for (let frame = 0; frame < 10; frame++) {
            budget.feed(0.3, 100);
            budget.feed(5, 100);
        }
        expect(budget.fps).toBeCloseTo(60, 0);
        expect(budget.is_full).toBe(false);
        expect(budget.is_fading).toBe(false);
    });

    it("carries the fewest of a window at 60 FPS, and nothing below", () => {
        const budget = new FrameBudget();
        for (let frame = 0; frame < 40; frame++) {
            budget.feed(FRAME, 500 + frame);
        }
        // the window holds the last half second: 30 frames, from 510 on
        expect(budget.carried).toBe(510);
        // one dropped frame in the window still counts as 60
        budget.feed(2 * FRAME, 560);
        expect(budget.carried).not.toBeNull();
        feed(budget, FRAME_BUDGET.record_fps - 3, 0.6, 900);
        expect(budget.carried).toBeNull();
    });

    it("forgets every frame on reset", () => {
        const budget = new FrameBudget();
        feed(budget, 30, 1);
        expect(budget.is_fading).toBe(true);
        budget.reset();
        expect(budget.fps).toBeNull();
        expect(budget.is_full).toBe(false);
        expect(budget.is_fading).toBe(false);
    });

    it("takes its own thresholds: a game held to 30 FPS", () => {
        const budget = new FrameBudget({
            full_below_fps: 25,
            room_from_fps: 28,
            fade_below_fps: 20,
            fade_until_fps: 25,
            record_fps: 29,
        });
        expect(budget.settings.window_seconds).toBe(
            FRAME_BUDGET.window_seconds,
        );
        feed(budget, 30, 1);
        expect(budget.is_full).toBe(false);
        expect(budget.carried).toBe(100);
        feed(budget, 22, 0.6);
        expect(budget.is_full).toBe(true);
        expect(budget.is_fading).toBe(false);
        expect(budget.carried).toBeNull();
    });
});
