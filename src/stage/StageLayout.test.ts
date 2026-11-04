import { describe, expect, it } from "vitest";
import {
    fit_layout,
    grid_cell,
    grid_in,
    pick_layout,
    rect_contains,
} from "./StageLayout";

const wide = { name: "wide", width: 960, height: 640 };
const tall = { name: "tall", width: 600, height: 960 };

describe("fit_layout", () => {
    it("scales to the tighter side and centres the rest", () => {
        // 1920x640 is three times as wide as the layout is relative to its height
        expect(fit_layout(wide, 1920, 640)).toEqual({
            scale: 1,
            offset_x: 480,
            offset_y: 0,
        });
        const fit = fit_layout(wide, 480, 1000);
        expect(fit.scale).toBe(0.5);
        expect(fit.offset_x).toBe(0);
        expect(fit.offset_y).toBe((1000 - 320) / 2);
    });
});

describe("pick_layout", () => {
    it("picks the layout that shows the game largest", () => {
        expect(pick_layout([wide, tall], 1280, 600).name).toBe("wide");
        expect(pick_layout([wide, tall], 390, 760).name).toBe("tall");
    });

    it("keeps the first layout near the break-even shape", () => {
        // 960x780: wide scale 1.21875 (by height), tall 0.8125: wide; at 700x1000 tall wins clearly
        expect(pick_layout([wide, tall], 960, 780).name).toBe("wide");
        expect(pick_layout([wide, tall], 700, 1000).name).toBe("tall");
        // equal scales: the first one stays
        expect(
            pick_layout([wide, { ...wide, name: "copy" }], 960, 640).name,
        ).toBe("wide");
    });

    it("refuses an empty list", () => {
        expect(() => pick_layout([], 100, 100)).toThrow();
    });
});

describe("grids", () => {
    it("splits an area into cells and finds them again", () => {
        const pad = { left: 10, top: 20, width: 300, height: 410 };
        const grid = grid_in(pad, 3, 4, 10);
        expect(grid.width).toBeCloseTo(280 / 3);
        expect(grid.height).toBe(95);
        const last = grid_cell(grid, 11);
        expect(last.left + last.width).toBeCloseTo(310);
        expect(last.top + last.height).toBe(430);
        expect(rect_contains(last, { x: 309, y: 429 })).toBe(true);
        expect(rect_contains(last, { x: 310, y: 400 })).toBe(false);
    });
});
