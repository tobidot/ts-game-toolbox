import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/SeededRandom";
import { Spawner, weighted_pick } from "./Spawner";

describe("Spawner", () => {
    it("spawns exactly n items over n intervals with a fixed interval", () => {
        let count = 0;
        const spawner = new Spawner(() => ++count, { interval: 0.5 });
        expect(spawner.is_running).toBe(true);
        expect(spawner.seconds_until_next).toBeCloseTo(0.5);
        const spawned: number[] = [];
        for (let frame = 0; frame < 300; frame++) {
            spawned.push(...spawner.update(1 / 60));
        }
        // 5 seconds at 0.5 s: 10 spawns, the first one at 0.5 s
        expect(spawned).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(spawner.spawned_count).toBe(10);
    });

    it("spawns at the interval, not before it", () => {
        const spawner = new Spawner(() => "x", { interval: 1 });
        expect(spawner.update(0.999)).toEqual([]);
        expect(spawner.seconds_until_next).toBeCloseTo(0.001);
        expect(spawner.update(0.001)).toEqual(["x"]);
        expect(spawner.seconds_until_next).toBeCloseTo(1);
    });

    it("picks range intervals with the random source and stays in range", () => {
        const random = new SeededRandom(7);
        const spawner = new Spawner(() => 1, {
            interval: { min: 0.2, max: 0.6 },
            random,
        });
        let last_spawn_at = 0;
        let time = 0;
        const gaps: number[] = [];
        for (let frame = 0; frame < 6000; frame++) {
            time += 1 / 120;
            if (spawner.update(1 / 120).length > 0) {
                gaps.push(time - last_spawn_at);
                last_spawn_at = time;
            }
        }
        expect(gaps.length).toBeGreaterThan(100);
        for (const gap of gaps) {
            expect(gap).toBeGreaterThanOrEqual(0.2 - 1 / 120);
            expect(gap).toBeLessThanOrEqual(0.6 + 1 / 120);
        }
        expect(Math.min(...gaps)).toBeLessThan(0.3);
        expect(Math.max(...gaps)).toBeGreaterThan(0.5);
    });

    it("is reproducible from the seed", () => {
        const run = (seed: number): number[] => {
            const spawner = new Spawner(() => 1, {
                interval: { min: 0.1, max: 1 },
                random: new SeededRandom(seed),
            });
            const times: number[] = [];
            for (let frame = 0; frame < 600; frame++) {
                if (spawner.update(1 / 60).length > 0) {
                    times.push(frame);
                }
            }
            return times;
        };
        expect(run(42)).toEqual(run(42));
        expect(run(42)).not.toEqual(run(43));
    });

    it("skips a tick while can_spawn returns false", () => {
        let open = false;
        const spawner = new Spawner(() => "mole", {
            interval: 1,
            can_spawn: () => open,
        });
        expect(spawner.update(1)).toEqual([]);
        expect(spawner.update(1)).toEqual([]);
        expect(spawner.spawned_count).toBe(0);
        // the skipped tick is not queued: the next spawn is a full interval away
        open = true;
        expect(spawner.update(0.5)).toEqual([]);
        expect(spawner.update(0.5)).toEqual(["mole"]);
        expect(spawner.spawned_count).toBe(1);
    });

    it("catches up after a long frame, at most max_per_update", () => {
        const spawner = new Spawner(() => "x", { interval: 1 });
        expect(spawner.update(2.5)).toEqual(["x", "x"]);
        expect(spawner.seconds_until_next).toBeCloseTo(0.5);
        // 10 s at once: 3 by default, the backlog is dropped, a full interval follows
        expect(spawner.update(10)).toEqual(["x", "x", "x"]);
        expect(spawner.seconds_until_next).toBeCloseTo(1);
        const generous = new Spawner(() => "y", {
            interval: 1,
            max_per_update: 5,
        });
        expect(generous.update(10)).toHaveLength(5);
    });

    it("scales the interval with rate_multiplier, including the running one", () => {
        const spawner = new Spawner(() => "x", { interval: 1 });
        spawner.rate_multiplier = 0.5;
        expect(spawner.rate_multiplier).toBe(0.5);
        expect(spawner.seconds_until_next).toBeCloseTo(0.5);
        expect(spawner.update(0.5)).toEqual(["x"]);
        expect(spawner.seconds_until_next).toBeCloseTo(0.5);
        spawner.rate_multiplier = 2;
        expect(spawner.seconds_until_next).toBeCloseTo(2);
        expect(spawner.update(1.9)).toEqual([]);
        expect(spawner.update(0.1)).toEqual(["x"]);
        expect(() => {
            spawner.rate_multiplier = 0;
        }).toThrow();
    });

    it("does nothing while stopped or not autostarted and resumes with start()", () => {
        const spawner = new Spawner(() => "x", {
            interval: 1,
            autostart: false,
        });
        expect(spawner.is_running).toBe(false);
        expect(spawner.update(5)).toEqual([]);
        spawner.start();
        expect(spawner.update(0.5)).toEqual([]);
        spawner.stop();
        expect(spawner.update(5)).toEqual([]);
        spawner.start();
        expect(spawner.update(0.5)).toEqual(["x"]);
        expect(spawner.update(-1)).toEqual([]);
    });

    it("resets the count and the interval", () => {
        const spawner = new Spawner(() => "x", { interval: 1 });
        spawner.update(1.5);
        expect(spawner.spawned_count).toBe(1);
        spawner.reset();
        expect(spawner.spawned_count).toBe(0);
        expect(spawner.seconds_until_next).toBeCloseTo(1);
        expect(spawner.is_running).toBe(true);
    });

    it("refuses an invalid interval", () => {
        expect(() => new Spawner(() => 1, { interval: 0 })).toThrow();
        expect(
            () => new Spawner(() => 1, { interval: { min: 0, max: 1 } }),
        ).toThrow();
        expect(
            () => new Spawner(() => 1, { interval: { min: 2, max: 1 } }),
        ).toThrow();
    });
});

describe("weighted_pick", () => {
    it("follows the weights over many picks", () => {
        const random = new SeededRandom(3);
        const counts = { normal: 0, golden: 0, bomb: 0 };
        const entries = [
            { item: "normal" as const, weight: 80 },
            { item: "golden" as const, weight: 8 },
            { item: "bomb" as const, weight: 12 },
        ];
        const total = 20000;
        for (let i = 0; i < total; i++) {
            counts[weighted_pick(random, entries)]++;
        }
        expect(counts.normal / total).toBeCloseTo(0.8, 1);
        expect(counts.golden / total).toBeCloseTo(0.08, 1);
        expect(counts.bomb / total).toBeCloseTo(0.12, 1);
        expect(counts.golden).toBeGreaterThan(total * 0.06);
        expect(counts.golden).toBeLessThan(total * 0.1);
    });

    it("maps the roll onto the entries in order and never picks weight 0", () => {
        const fixed = (value: number) => ({ next: () => value });
        const entries = [
            { item: "a", weight: 1 },
            { item: "none", weight: 0 },
            { item: "b", weight: 3 },
        ];
        expect(weighted_pick(fixed(0), entries)).toBe("a");
        expect(weighted_pick(fixed(0.24), entries)).toBe("a");
        expect(weighted_pick(fixed(0.25), entries)).toBe("b");
        expect(weighted_pick(fixed(0.999999), entries)).toBe("b");
        expect(weighted_pick(fixed(0), [{ item: "only", weight: 2 }])).toBe(
            "only",
        );
    });

    it("throws when nothing can be picked", () => {
        const random = new SeededRandom(1);
        expect(() => weighted_pick(random, [])).toThrow();
        expect(() => weighted_pick(random, [{ item: 1, weight: 0 }])).toThrow();
    });
});
