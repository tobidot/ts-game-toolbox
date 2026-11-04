import { describe, expect, it } from "vitest";
import { SeededRandom } from "./SeededRandom";

describe("SeededRandom", () => {
    it("yields the same sequence for the same seed", () => {
        const a = new SeededRandom(4711);
        const b = new SeededRandom(4711);
        const sequence_a = Array.from({ length: 20 }, () => a.next());
        const sequence_b = Array.from({ length: 20 }, () => b.next());
        expect(sequence_a).toEqual(sequence_b);
        expect(new Set(sequence_a).size).toBeGreaterThan(15);
    });

    it("differs between seeds", () => {
        const a = new SeededRandom(1).next();
        const b = new SeededRandom(2).next();
        expect(a).not.toBe(b);
    });

    it("keeps int() inside the inclusive bounds and reaches both ends", () => {
        const random = new SeededRandom(99);
        let seen_min = false;
        let seen_max = false;
        for (let i = 0; i < 10000; i++) {
            const value = random.int(3, 7);
            expect(value).toBeGreaterThanOrEqual(3);
            expect(value).toBeLessThanOrEqual(7);
            expect(Number.isInteger(value)).toBe(true);
            if (value === 3) {
                seen_min = true;
            }
            if (value === 7) {
                seen_max = true;
            }
        }
        expect(seen_min && seen_max).toBe(true);
    });

    it("keeps float() in [min, max)", () => {
        const random = new SeededRandom(5);
        for (let i = 0; i < 1000; i++) {
            const value = random.float(-2, 2);
            expect(value).toBeGreaterThanOrEqual(-2);
            expect(value).toBeLessThan(2);
        }
    });

    it("shuffles in place and keeps every element", () => {
        const random = new SeededRandom(12);
        const items = [1, 2, 3, 4, 5, 6, 7, 8];
        const result = random.shuffle(items);
        expect(result).toBe(items);
        expect([...items].sort((a, b) => a - b)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8,
        ]);
    });

    it("picks from a list and refuses an empty one", () => {
        const random = new SeededRandom(3);
        expect(["a", "b", "c"]).toContain(random.pick(["a", "b", "c"]));
        expect(() => random.pick([])).toThrow();
    });

    it("forks into an independent stream and restores from state", () => {
        const parent = new SeededRandom(77);
        const child = parent.fork();
        expect(child.next()).not.toBe(parent.next());

        const saved = parent.state;
        const expected = parent.next();
        expect(SeededRandom.from_state(saved).next()).toBe(expected);
    });

    it("chance() follows the probability roughly", () => {
        const random = new SeededRandom(2024);
        let hits = 0;
        for (let i = 0; i < 10000; i++) {
            if (random.chance(0.25)) {
                hits++;
            }
        }
        expect(hits).toBeGreaterThan(2200);
        expect(hits).toBeLessThan(2800);
    });
});
