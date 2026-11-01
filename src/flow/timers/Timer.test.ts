import { describe, expect, it } from "vitest";
import { Cooldown, Timer } from "./Timer";

describe("Timer", () => {
    it("does nothing until started and refuses a non-positive duration", () => {
        const timer = new Timer(1);
        expect(timer.is_running).toBe(false);
        expect(timer.update(0.5)).toBe(0);
        expect(timer.elapsed).toBe(0);
        expect(() => new Timer(0)).toThrow();
        expect(new Timer(1, { autostart: true }).is_running).toBe(true);
    });

    it("completes once as a one-shot and then stops", () => {
        const timer = new Timer(1, { autostart: true });
        expect(timer.update(0.4)).toBe(0);
        expect(timer.remaining).toBeCloseTo(0.6);
        expect(timer.update(0.4)).toBe(0);
        expect(timer.is_done).toBe(false);
        expect(timer.update(0.4)).toBe(1);
        expect(timer.is_done).toBe(true);
        expect(timer.is_running).toBe(false);
        expect(timer.progress).toBe(1);
        expect(timer.update(5)).toBe(0);
        timer.start();
        expect(timer.is_done).toBe(false);
        expect(timer.elapsed).toBe(0);
        expect(timer.is_running).toBe(true);
    });

    it("counts several completions on a big step when repeating", () => {
        const timer = new Timer(0.5, { repeat: true, autostart: true });
        expect(timer.update(0.3)).toBe(0);
        expect(timer.update(0.3)).toBe(1);
        expect(timer.elapsed).toBeCloseTo(0.1);
        expect(timer.update(1.65)).toBe(3);
        expect(timer.elapsed).toBeCloseTo(0.25);
        expect(timer.completions).toBe(4);
        expect(timer.is_done).toBe(false);
        expect(timer.is_running).toBe(true);
    });

    it("clamps progress to 0..1 and ignores negative deltas", () => {
        const timer = new Timer(2, { autostart: true });
        expect(timer.progress).toBe(0);
        timer.update(-1);
        expect(timer.progress).toBe(0);
        timer.update(1);
        expect(timer.progress).toBeCloseTo(0.5);
        timer.update(10);
        expect(timer.progress).toBe(1);
    });

    it("pauses with stop() and resumes with start()", () => {
        const timer = new Timer(1, { autostart: true });
        timer.update(0.25);
        timer.stop();
        timer.update(0.25);
        expect(timer.elapsed).toBeCloseTo(0.25);
        timer.start();
        timer.update(0.25);
        expect(timer.elapsed).toBeCloseTo(0.5);
        timer.reset();
        expect(timer.elapsed).toBe(0);
        expect(timer.is_running).toBe(true);
    });

    it("ping_pong rises over one run and falls over the next, symmetrically", () => {
        const timer = new Timer(1, { repeat: true, autostart: true });
        const samples: number[] = [];
        for (let step = 0; step < 20; step++) {
            timer.update(0.1);
            samples.push(timer.ping_pong);
        }
        // first run: 0.1 .. 1.0 (10 samples), second run: 0.9 .. 0.0 (10 samples)
        for (let index = 0; index < 9; index++) {
            expect(samples[index]).toBeCloseTo(samples[18 - index]);
        }
        expect(Math.max(...samples)).toBeCloseTo(1);
        expect(Math.min(...samples)).toBeCloseTo(0);
    });
});

describe("Cooldown", () => {
    it("is ready at the start, blocks after a use and recovers with update()", () => {
        const cooldown = new Cooldown(0.4);
        expect(cooldown.is_ready).toBe(true);
        expect(cooldown.progress).toBe(1);
        expect(cooldown.try_use()).toBe(true);
        expect(cooldown.is_ready).toBe(false);
        expect(cooldown.remaining).toBeCloseTo(0.4);
        expect(cooldown.progress).toBe(0);
        expect(cooldown.try_use()).toBe(false);
        cooldown.update(0.1);
        expect(cooldown.progress).toBeCloseTo(0.25);
        cooldown.update(0.5);
        expect(cooldown.remaining).toBe(0);
        expect(cooldown.is_ready).toBe(true);
        expect(cooldown.try_use()).toBe(true);
    });

    it("reset() makes it ready immediately and 0 seconds never blocks", () => {
        const cooldown = new Cooldown(1);
        cooldown.try_use();
        cooldown.reset();
        expect(cooldown.is_ready).toBe(true);
        const instant = new Cooldown(0);
        expect(instant.try_use()).toBe(true);
        expect(instant.try_use()).toBe(true);
        expect(instant.progress).toBe(1);
        expect(() => new Cooldown(-1)).toThrow();
    });
});
