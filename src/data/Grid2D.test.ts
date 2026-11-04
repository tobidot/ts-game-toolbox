import { describe, expect, it } from "vitest";
import { Grid2D } from "./Grid2D";

describe("Grid2D", () => {
    it("fills with a value or a function and reads cells row-major", () => {
        const constant = new Grid2D(2, 2, 0);
        expect(constant.cells().map((cell) => cell.value)).toEqual([
            0, 0, 0, 0,
        ]);
        const grid = new Grid2D(3, 2, (x, y) => `${x},${y}`);
        expect(grid.width).toBe(3);
        expect(grid.height).toBe(2);
        expect(grid.index_of(2, 1)).toBe(5);
        expect(grid.cells()).toEqual([
            { x: 0, y: 0, value: "0,0" },
            { x: 1, y: 0, value: "1,0" },
            { x: 2, y: 0, value: "2,0" },
            { x: 0, y: 1, value: "0,1" },
            { x: 1, y: 1, value: "1,1" },
            { x: 2, y: 1, value: "2,1" },
        ]);
        expect(grid.row(1)).toEqual(["0,1", "1,1", "2,1"]);
        expect(grid.column(2)).toEqual(["2,0", "2,1"]);
    });

    it("gets and sets inside, throws outside", () => {
        const grid = new Grid2D(3, 3, ".");
        grid.set(1, 2, "X");
        expect(grid.get(1, 2)).toBe("X");
        expect(grid.is_inside(2, 2)).toBe(true);
        expect(grid.is_inside(3, 0)).toBe(false);
        expect(grid.is_inside(-1, 0)).toBe(false);
        expect(grid.is_inside(1.5, 0)).toBe(false);
        expect(() => grid.get(3, 0)).toThrow();
        expect(() => grid.get(0, -1)).toThrow();
        expect(() => grid.set(0, 3, "O")).toThrow();
        expect(() => grid.row(3)).toThrow();
        expect(() => grid.column(-1)).toThrow();
        expect(() => new Grid2D(-1, 2, 0)).toThrow();
    });

    it("lines(3) on a 3x3 grid yields exactly the 8 Tic-Tac-Toe lines", () => {
        const grid = new Grid2D(3, 3, 0);
        const lines = grid.lines(3);
        expect(lines).toHaveLength(8);
        const keys = lines.map((line) =>
            line.map((p) => `${p.x}${p.y}`).join("-"),
        );
        expect(keys).toContain("00-10-20"); // top row
        expect(keys).toContain("00-01-02"); // left column
        expect(keys).toContain("00-11-22"); // main diagonal
        expect(keys).toContain("02-11-20"); // anti diagonal
        for (const line of lines) {
            expect(line).toHaveLength(3);
        }
        expect(grid.lines(4)).toHaveLength(0);
        expect(grid.lines(1)).toHaveLength(9);
        expect(new Grid2D(7, 6, 0).lines(4)).toHaveLength(69);
    });

    it("lists the neighbours at a corner, with and without diagonals", () => {
        const grid = new Grid2D(3, 3, (x, y) => y * 3 + x);
        expect(grid.neighbours(0, 0)).toEqual([
            { x: 1, y: 0, value: 1 },
            { x: 0, y: 1, value: 3 },
        ]);
        expect(grid.neighbours(0, 0, true)).toEqual([
            { x: 1, y: 0, value: 1 },
            { x: 0, y: 1, value: 3 },
            { x: 1, y: 1, value: 4 },
        ]);
        expect(grid.neighbours(1, 1, true)).toHaveLength(8);
        expect(grid.neighbours(1, 1)).toHaveLength(4);
    });

    it("map and clone are independent of the source", () => {
        const grid = new Grid2D(2, 2, 1);
        const doubled = grid.map((value, x, y) => value * 2 + x + y * 10);
        expect(doubled.cells().map((cell) => cell.value)).toEqual([
            2, 3, 12, 13,
        ]);
        const copy = grid.clone();
        copy.set(0, 0, 99);
        doubled.set(1, 1, 0);
        expect(grid.get(0, 0)).toBe(1);
        expect(grid.get(1, 1)).toBe(1);
        expect(copy.get(0, 0)).toBe(99);
    });

    it("fills and counts", () => {
        const grid = new Grid2D(3, 3, "");
        grid.set(0, 0, "X");
        grid.set(2, 2, "O");
        expect(grid.count((value) => value === "")).toBe(7);
        expect(grid.count((value) => value !== "")).toBe(2);
        grid.fill("O");
        expect(grid.count((value) => value === "O")).toBe(9);
    });
});
