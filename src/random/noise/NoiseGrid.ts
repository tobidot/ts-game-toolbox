import { Grid2D } from "../../data/Grid2D";
import { Noise2D } from "./Noise";
import { NoiseRange } from "./NoiseRecipe";

/** Where a grid lies in the noise's world, for `fill_grid`. */
export interface FillGridOptions {
    /** The world position of the grid's top left corner; default (0, 0). */
    x0?: number;
    y0?: number;
    /** How many world units one cell is wide; default 1. */
    cell_size?: number;
}

/**
 * Samples `noise` into every cell of `grid` (any `Grid2D<number>`, so a `TileMap` layer too):
 * cell (x, y) gets the noise at its middle, `(x0 + (x + 0.5) * cell_size, y0 + (y + 0.5) *
 * cell_size)`. Neighbouring chunks of a large map fit together when their `x0` / `y0` are their
 * places in the world. Returns the grid.
 */
export function fill_grid(
    grid: Grid2D<number>,
    noise: Noise2D,
    options: FillGridOptions = {},
): Grid2D<number> {
    const x0 = options.x0 ?? 0;
    const y0 = options.y0 ?? 0;
    const cell_size = options.cell_size ?? 1;
    if (!(cell_size > 0) || !Number.isFinite(cell_size)) {
        throw new Error(`fill_grid: cell_size must be > 0, got ${cell_size}`);
    }
    for (let y = 0; y < grid.height; y++) {
        const world_y = y0 + (y + 0.5) * cell_size;
        for (let x = 0; x < grid.width; x++) {
            grid.set(x, y, noise(x0 + (x + 0.5) * cell_size, world_y));
        }
    }
    return grid;
}

/**
 * Stretches the values of `grid` so its lowest becomes the bottom of `range` and its highest
 * the top (0..1 for `"unit"`, the default; -1..1 for `"signed"`), keeping their order. A grid
 * where every cell is the same becomes the middle of the range. Returns the grid.
 */
export function normalize_grid(
    grid: Grid2D<number>,
    range: NoiseRange = "unit",
): Grid2D<number> {
    let low = Infinity;
    let high = -Infinity;
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            const value = grid.get(x, y);
            if (value < low) {
                low = value;
            }
            if (value > high) {
                high = value;
            }
        }
    }
    const bottom = range === "unit" ? 0 : -1;
    const top = 1;
    const span = high - low;
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            if (!(span > 0)) {
                grid.set(x, y, (bottom + top) / 2);
                continue;
            }
            const share = (grid.get(x, y) - low) / span;
            grid.set(x, y, bottom + share * (top - bottom));
        }
    }
    return grid;
}
