import { describe, expect, it } from "vitest";
import { ComboList, ComboMatcher } from "./ComboMatcher";

describe("ComboMatcher", () => {
    it("reports progress, then complete, then ignores further input", () => {
        const matcher = new ComboMatcher(["A", "B", "C"]);
        expect(matcher.position).toBe(0);
        expect(matcher.progress).toBe(0);
        expect(matcher.input("A")).toBe("progress");
        expect(matcher.input("B")).toBe("progress");
        expect(matcher.progress).toBeCloseTo(2 / 3);
        expect(matcher.input("C")).toBe("complete");
        expect(matcher.is_complete).toBe(true);
        expect(matcher.input("A")).toBe("ignored");
        expect(matcher.position).toBe(3);
        matcher.reset();
        expect(matcher.position).toBe(0);
        expect(matcher.is_complete).toBe(false);
    });

    it("ignores inputs that do not start the sequence", () => {
        const matcher = new ComboMatcher(["A", "B"]);
        expect(matcher.input("X")).toBe("ignored");
        expect(matcher.position).toBe(0);
    });

    it("breaks a partial match on a wrong input", () => {
        const matcher = new ComboMatcher(["A", "B", "C"]);
        matcher.input("A");
        matcher.input("B");
        expect(matcher.input("X")).toBe("broken");
        expect(matcher.position).toBe(0);
    });

    it("restarts when the wrong input is the first element (A A B on A B)", () => {
        const matcher = new ComboMatcher(["A", "B"]);
        expect(matcher.input("A")).toBe("progress");
        expect(matcher.input("A")).toBe("broken");
        expect(matcher.position).toBe(1);
        expect(matcher.input("B")).toBe("complete");
    });

    it("restarts at the longest tail that is also a head (A B A B on A B A C)", () => {
        const matcher = new ComboMatcher(["A", "B", "A", "C"]);
        matcher.input("A");
        matcher.input("B");
        matcher.input("A");
        expect(matcher.input("B")).toBe("broken");
        expect(matcher.position).toBe(2);
        expect(matcher.input("A")).toBe("progress");
        expect(matcher.input("C")).toBe("complete");
    });

    it("drops a partial match when the gap between steps is too long", () => {
        const matcher = new ComboMatcher(["A", "B", "C"], {
            max_gap_seconds: 0.5,
        });
        expect(matcher.input("A", 0)).toBe("progress");
        expect(matcher.input("B", 0.4)).toBe("progress");
        expect(matcher.input("C", 1.2)).toBe("broken");
        expect(matcher.position).toBe(0);
        // A late input that is itself the first step restarts the combo.
        matcher.input("A", 2);
        expect(matcher.input("A", 3)).toBe("broken");
        expect(matcher.position).toBe(1);
        expect(matcher.input("B", 3.1)).toBe("progress");
        expect(matcher.input("C", 3.2)).toBe("complete");
    });

    it("applies no gap rule without a clock or without a limit", () => {
        const limited = new ComboMatcher(["A", "B"], { max_gap_seconds: 0.1 });
        limited.input("A");
        expect(limited.input("B")).toBe("complete");
        const unlimited = new ComboMatcher(["A", "B"]);
        unlimited.input("A", 0);
        expect(unlimited.input("B", 1000)).toBe("complete");
    });

    it("compares with a custom equality", () => {
        const matcher = new ComboMatcher(
            [{ key: "a" }, { key: "b" }],
            {},
            (a, b) => a.key === b.key,
        );
        expect(matcher.input({ key: "a" })).toBe("progress");
        expect(matcher.input({ key: "b" })).toBe("complete");
    });

    it("rejects an empty sequence and copies the given one", () => {
        expect(() => new ComboMatcher([])).toThrow();
        const sequence = ["A"];
        const matcher = new ComboMatcher(sequence);
        sequence.push("B");
        expect(matcher.sequence).toEqual(["A"]);
        expect(matcher.input("A")).toBe("complete");
    });
});

describe("ComboList", () => {
    it("reports the combos an input completed, overlapping ones included", () => {
        const list = new ComboList([
            { name: "punch", sequence: ["A", "B"] },
            { name: "super", sequence: ["A", "B", "C"] },
            { name: "kick", sequence: ["B", "C"] },
        ]);
        expect(list.input("A")).toEqual([]);
        expect(list.input("B")).toEqual(["punch"]);
        expect(list.progress_of("super")).toBeCloseTo(2 / 3);
        expect(list.input("C")).toEqual(["super", "kick"]);
        // A completed combo restarts right away.
        list.input("A");
        expect(list.input("B")).toEqual(["punch"]);
    });

    it("applies the gap rule to every combo and resets them together", () => {
        const list = new ComboList([{ name: "dash", sequence: ["R", "R"] }], {
            max_gap_seconds: 0.3,
        });
        list.input("R", 0);
        expect(list.input("R", 1)).toEqual([]);
        expect(list.input("R", 1.1)).toEqual(["dash"]);
        list.input("R", 2);
        list.reset();
        expect(list.progress_of("dash")).toBe(0);
        expect(list.progress_of("unknown")).toBe(0);
    });
});
