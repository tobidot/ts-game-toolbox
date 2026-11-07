import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Throttler } from "./Throttler";

/** A callback that records what it was called with, and takes `run_ms` to finish. */
function recorder(run_ms: number = 0) {
    const calls: number[] = [];
    const callback = async (value: number): Promise<number> => {
        calls.push(value);
        if (run_ms > 0) {
            await new Promise((resolve) => setTimeout(resolve, run_ms));
        }
        return value * 10;
    };
    return { calls, callback };
}

/** Lets the fake clock run, and every promise settle on the way. */
async function pass(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
}

describe("Throttler", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("runs the first call at once, with its arguments", async () => {
        const { calls, callback } = recorder();
        const throttler = new Throttler<[number], number>({ callback });

        const result = throttler.run(1);
        await pass(0);

        expect(calls).toEqual([1]);
        await expect(result).resolves.toBe(10);
    });

    it("calls during the delay become one more run, after it, with the last arguments", async () => {
        const { calls, callback } = recorder();
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 100,
        });

        void throttler.run(1);
        await pass(10);
        const results = [throttler.run(2), throttler.run(3), throttler.run(4)];
        await pass(10);
        expect(calls).toEqual([1]);

        await pass(200);

        expect(calls).toEqual([1, 4]);
        await expect(Promise.all(results)).resolves.toEqual([40, 40, 40]);
    });

    it("the last value of a burst always runs: a slider ends where it was let go", async () => {
        const { calls, callback } = recorder(30);
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 50,
        });

        for (let value = 1; value <= 20; value++) {
            void throttler.run(value);
            await pass(7);
        }
        await pass(500);

        expect(calls[calls.length - 1]).toBe(20);
        expect(calls.length).toBeLessThan(8);
    });

    it("runs at most once per delay while called all the time", async () => {
        const { calls, callback } = recorder();
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 100,
        });

        for (let step = 0; step < 100; step++) {
            void throttler.run(step);
            await pass(10);
        }

        expect(calls.length).toBeGreaterThanOrEqual(9);
        expect(calls.length).toBeLessThanOrEqual(11);
    });

    it("after a rest, the next call runs at once again", async () => {
        const { calls, callback } = recorder();
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 100,
        });

        void throttler.run(1);
        await pass(500);
        void throttler.run(2);
        await pass(0);

        expect(calls).toEqual([1, 2]);
    });

    it("wake_up_ms waits after a rest, and takes the last arguments of that wait", async () => {
        const { calls, callback } = recorder();
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 100,
            wake_up_ms: 50,
        });

        void throttler.run(1);
        void throttler.run(2);
        await pass(20);
        expect(calls).toEqual([]);

        await pass(40);
        expect(calls).toEqual([2]);
    });

    it("combine: a call while it runs gets that run's result", async () => {
        const { calls, callback } = recorder(30);
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 10,
            strategy: Throttler.STRATEGIES.combine,
        });

        const first = throttler.run(1);
        await pass(5);
        const second = throttler.run(2);
        await pass(200);

        expect(calls).toEqual([1]);
        await expect(second).resolves.toBe(10);
        await expect(first).resolves.toBe(10);
    });

    it("the first arguments, when use_last_args is off", async () => {
        const { calls, callback } = recorder();
        const throttler = new Throttler<[number], number>({
            callback,
            delay_ms: 100,
            strategy: { queue_when_running: true, use_last_args: false },
        });

        void throttler.run(1);
        await pass(10);
        void throttler.run(2);
        void throttler.run(3);
        await pass(200);

        expect(calls).toEqual([1, 2]);
    });

    it("is busy while it runs or waits, and not after", async () => {
        const { callback } = recorder(30);
        const throttler = new Throttler<[number], number>({ callback });

        expect(throttler.is_busy).toBe(false);
        void throttler.run(1);
        expect(throttler.is_busy).toBe(true);
        await pass(100);
        expect(throttler.is_busy).toBe(false);
    });

    it("a callback that throws doesn't stop the next run", async () => {
        let is_failing = true;
        const throttler = new Throttler<[number], number>({
            delay_ms: 10,
            callback: async (value) => {
                if (is_failing) {
                    is_failing = false;
                    throw new Error("broken");
                }
                return value;
            },
        });

        await expect(throttler.run(1)).rejects.toThrow("broken");
        await pass(50);

        await expect(throttler.run(2)).resolves.toBe(2);
    });
});
