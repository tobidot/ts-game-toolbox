import { describe, expect, it } from "vitest";
import { SessionBest } from "./SessionBest";

describe("SessionBest", () => {
    it("keeps the highest result and flags a new best", () => {
        const best = new SessionBest();
        expect(best.value).toBeNull();
        expect(best.offer(5)).toBe(true);
        expect(best.offer(3)).toBe(false);
        expect(best.is_new).toBe(false);
        expect(best.offer(8)).toBe(true);
        expect(best.value).toBe(8);
        best.settle();
        expect(best.is_new).toBe(false);
    });

    it("keeps the lowest when lower wins, e.g. a time", () => {
        const best = new SessionBest("lower");
        best.offer(12.5);
        expect(best.offer(14)).toBe(false);
        expect(best.offer(9.75)).toBe(true);
        expect(best.value).toBe(9.75);
    });
});
