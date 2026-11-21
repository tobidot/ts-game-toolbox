import { describe, expect, it } from "vitest";
import { Grid2D } from "../../data/Grid2D";
import { TileMap } from "../../world/TileMap";
import { Noise2D, noise_2d, simplex_noise_2d, value_noise_2d } from "./Noise";
import { fill_grid, normalize_grid } from "./NoiseGrid";
import {
    make_noise,
    NOISE_RECIPES,
    NoiseRecipe,
    NoiseRecipeName,
} from "./NoiseRecipe";

const RECIPE_NAMES = Object.keys(NOISE_RECIPES) as NoiseRecipeName[];

/** The lowest and highest value of `count` samples spread over a wide area. */
function extremes(noise: Noise2D, count = 40000, spread = 977): number[] {
    let low = Infinity;
    let high = -Infinity;
    for (let k = 0; k < count; k++) {
        const value = noise(
            (k * 0.6180339887 * spread) % spread,
            ((k * 0.7548776662 * spread) % spread) - spread / 2,
        );
        low = Math.min(low, value);
        high = Math.max(high, value);
    }
    return [low, high];
}

/** The mean length of a run above `level` along horizontal lines `step` apart. */
function mean_run(noise: Noise2D, level: number, length: number): number {
    let runs = 0;
    let total = 0;
    for (let row = 0; row < 60; row++) {
        const y = row * 97.3 + 0.5;
        let inside = false;
        let run = 0;
        for (let x = 0; x < length; x += 1) {
            if (noise(x, y) > level) {
                if (!inside) {
                    inside = true;
                    run = 0;
                }
                run += 1;
            } else if (inside) {
                inside = false;
                runs++;
                total += run;
            }
        }
    }
    return total / runs;
}

/** How often a line of samples one unit apart turns from up to down or back: how much detail. */
function turns(noise: Noise2D): number {
    let count = 0;
    for (let y = 0; y < 2000; y += 37) {
        let last_step = 0;
        for (let x = 0; x < 2000; x += 1) {
            const step = noise(x + 1, y) - noise(x, y);
            if (step * last_step < 0) {
                count++;
            }
            last_step = step;
        }
    }
    return count;
}

describe("simplex_noise_2d and value_noise_2d", () => {
    it("answer the same pinned values for the same seed", () => {
        const simplex = simplex_noise_2d(42);
        const value = value_noise_2d(42);
        expect([
            simplex(0.5, 0.5),
            simplex(12.34, -5.67),
            simplex(-1000.25, 333.75),
        ]).toEqual(PINNED.simplex);
        expect([
            value(0.5, 0.5),
            value(12.34, -5.67),
            value(-1000.25, 333.75),
        ]).toEqual(PINNED.value);
        expect(simplex_noise_2d(42)(7.7, 8.8)).toBe(simplex(7.7, 8.8));
        expect(noise_2d(42)(7.7, 8.8)).toBe(simplex(7.7, 8.8));
        expect(noise_2d(42, "value")(7.7, 8.8)).toBe(value(7.7, 8.8));
    });

    it("differ between seeds", () => {
        for (const make of [simplex_noise_2d, value_noise_2d]) {
            const a = make(1);
            const b = make(2);
            let different = 0;
            for (let k = 0; k < 100; k++) {
                if (a(k * 0.73, k * 0.31) !== b(k * 0.73, k * 0.31)) {
                    different++;
                }
            }
            expect(different).toBeGreaterThan(90);
        }
    });

    it("stay in -1..1 and nearly reach both ends", () => {
        for (const make of [simplex_noise_2d, value_noise_2d]) {
            for (let seed = 1; seed <= 3; seed++) {
                const [low, high] = extremes(make(seed), 200000, 400);
                expect(low).toBeGreaterThanOrEqual(-1);
                expect(high).toBeLessThanOrEqual(1);
                expect(low).toBeLessThan(-0.7);
                expect(high).toBeGreaterThan(0.7);
            }
        }
    });

    it("are smooth: neighbouring samples are close, also across lattice lines", () => {
        for (const make of [simplex_noise_2d, value_noise_2d]) {
            const noise = make(5);
            let largest = 0;
            for (let k = 0; k < 20000; k++) {
                const x = k * 0.0371;
                const y = k * 0.0173 - 50;
                largest = Math.max(
                    largest,
                    Math.abs(noise(x + 0.001, y) - noise(x, y)),
                    Math.abs(noise(x, y + 0.001) - noise(x, y)),
                );
            }
            // A slope of under 10 per unit.
            expect(largest).toBeLessThan(0.01);
            // The slope just left and just right of a lattice line agrees: no crease.
            for (let line = -3; line <= 3; line++) {
                const y = 0.37 + line * 0.11;
                const left = (noise(line, y) - noise(line - 1e-4, y)) / 1e-4;
                const right = (noise(line + 1e-4, y) - noise(line, y)) / 1e-4;
                expect(Math.abs(left - right)).toBeLessThan(0.01);
            }
        }
    });

    it("work far from the origin and on negative coordinates", () => {
        const noise = simplex_noise_2d(9);
        for (const [x, y] of [
            [-12345.6, -0.5],
            [987654.3, 123456.7],
            [-1e8, 1e8],
        ]) {
            const value = noise(x, y);
            expect(Number.isFinite(value)).toBe(true);
            expect(Math.abs(value)).toBeLessThanOrEqual(1);
        }
    });
});

describe("make_noise", () => {
    it("answers the same pinned values for the same recipe and seed", () => {
        const hills = make_noise(NOISE_RECIPES.hills, 2026);
        expect([hills(0, 0), hills(100.5, 200.25), hills(-77, 512)]).toEqual(
            PINNED.hills,
        );
        const again = make_noise({ ...NOISE_RECIPES.hills }, 2026);
        expect(again(100.5, 200.25)).toBe(hills(100.5, 200.25));
        const other = make_noise(NOISE_RECIPES.hills, 2027);
        expect(other(100.5, 200.25)).not.toBe(hills(100.5, 200.25));
    });

    it("keeps every ready-made recipe in its range on a 256 x 256 fill", () => {
        for (const name of RECIPE_NAMES) {
            const grid = fill_grid(
                new Grid2D<number>(256, 256, 0),
                make_noise(NOISE_RECIPES[name], 11),
                { cell_size: 2 },
            );
            const values = grid.cells().map((cell) => cell.value);
            expect(Math.min(...values), name).toBeGreaterThanOrEqual(0);
            expect(Math.max(...values), name).toBeLessThanOrEqual(1);
            expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(
                0.3,
            );
        }
        const signed = extremes(
            make_noise(
                { octaves: 6, ridged: true, warp: { amount: 50, scale: 90 } },
                3,
            ),
        );
        expect(signed[0]).toBeGreaterThanOrEqual(-1);
        expect(signed[1]).toBeLessThanOrEqual(1);
    });

    it("makes hills as wide as `scale` says", () => {
        for (const kind of ["simplex", "value"] as const) {
            for (const scale of [40, 120]) {
                const noise = make_noise({ kind, scale }, 8);
                const width = mean_run(noise, 0, 6000);
                expect(width, `${kind} ${scale}`).toBeGreaterThan(scale * 0.85);
                expect(width, `${kind} ${scale}`).toBeLessThan(scale * 1.15);
            }
        }
    });

    it("adds detail with each octave without leaving the range", () => {
        let last = 0;
        for (const octaves of [1, 2, 4, 8]) {
            const noise = make_noise({ scale: 100, octaves }, 4);
            const detail = turns(noise);
            expect(detail).toBeGreaterThan(last * 1.5);
            last = detail;
            const [low, high] = extremes(noise);
            expect(low).toBeGreaterThanOrEqual(-1);
            expect(high).toBeLessThanOrEqual(1);
        }
        // The first octave stays where it was: more octaves only add on top.
        const one = make_noise({ scale: 100, octaves: 1 }, 4);
        const many = make_noise(
            { scale: 100, octaves: 6, persistence: 0.3 },
            4,
        );
        let close = 0;
        for (let k = 0; k < 200; k++) {
            if (Math.abs(one(k * 13, k * 7) - many(k * 13, k * 7)) < 0.35) {
                close++;
            }
        }
        expect(close).toBeGreaterThan(180);
    });

    it("folds each octave into a ridge with `ridged`", () => {
        const plain = make_noise({ scale: 50 }, 6);
        const ridged = make_noise({ scale: 50, ridged: true }, 6);
        for (let k = 0; k < 50; k++) {
            const x = k * 17.3;
            const y = k * 3.1;
            expect(ridged(x, y)).toBeCloseTo(1 - 2 * Math.abs(plain(x, y)), 12);
        }
    });

    it("moves the window with `offset`", () => {
        const plain = make_noise({ scale: 30, octaves: 3 }, 12);
        const moved = make_noise(
            { scale: 30, octaves: 3, offset: { x: 40, y: -25 } },
            12,
        );
        expect(moved(10, 10)).toBe(plain(50, -15));
    });

    it("pushes samples around with `warp`, and an amount of 0 pushes nothing", () => {
        const plain = make_noise({ scale: 60 }, 21);
        const still = make_noise(
            { scale: 60, warp: { amount: 0, scale: 100 } },
            21,
        );
        const warped = make_noise(
            { scale: 60, warp: { amount: 40, scale: 100 } },
            21,
        );
        let moved = 0;
        for (let k = 0; k < 100; k++) {
            expect(still(k * 9, k * 4)).toBe(plain(k * 9, k * 4));
            if (Math.abs(warped(k * 9, k * 4) - plain(k * 9, k * 4)) > 0.01) {
                moved++;
            }
        }
        expect(moved).toBeGreaterThan(80);
        // The warp is drawn before the octaves: their number never changes it.
        const two = make_noise(
            { scale: 60, octaves: 2, warp: { amount: 40, scale: 100 } },
            21,
        );
        const one_again = make_noise(
            { scale: 60, octaves: 1, warp: { amount: 40, scale: 100 } },
            21,
        );
        expect(one_again(33, 44)).toBe(warped(33, 44));
        expect(two(33, 44)).not.toBe(warped(33, 44));
    });

    it("sinks to the bottom at the falloff's radius and keeps the middle", () => {
        const recipe: NoiseRecipe = {
            scale: 40,
            octaves: 3,
            falloff: { x: 100, y: 100, radius: 80 },
            range: "unit",
        };
        const island = make_noise(recipe, 5);
        const open = make_noise({ ...recipe, falloff: null }, 5);
        expect(island(100, 100)).toBe(open(100, 100));
        expect(island(180, 100)).toBe(0);
        expect(island(100, 20)).toBe(0);
        expect(island(300, -400)).toBe(0);
        expect(island(140, 100)).toBeLessThan(open(140, 100) + 1e-12);
    });

    it('answers 0..1 with `range: "unit"`', () => {
        const signed = make_noise({ scale: 20, octaves: 2 }, 31);
        const unit = make_noise({ scale: 20, octaves: 2, range: "unit" }, 31);
        for (let k = 0; k < 50; k++) {
            expect(unit(k * 3, k)).toBeCloseTo((signed(k * 3, k) + 1) / 2, 14);
        }
    });

    it("refuses recipes it can't make", () => {
        expect(() => make_noise({ scale: 0 }, 1)).toThrow(/scale/);
        expect(() => make_noise({ octaves: 0 }, 1)).toThrow(/octaves/);
        expect(() => make_noise({ octaves: 13 }, 1)).toThrow(/octaves/);
        expect(() => make_noise({ octaves: 2.5 }, 1)).toThrow(/octaves/);
        expect(() => make_noise({ persistence: -1 }, 1)).toThrow(/persistence/);
        expect(() => make_noise({ lacunarity: 0.5 }, 1)).toThrow(/lacunarity/);
        expect(() => make_noise({ warp: { amount: 10, scale: 0 } }, 1)).toThrow(
            /warp/,
        );
        expect(() =>
            make_noise({ falloff: { x: 0, y: 0, radius: -5 } }, 1),
        ).toThrow(/falloff/);
        expect(() =>
            make_noise({ kind: "perlin" as unknown as "value" }, 1),
        ).toThrow(/kind/);
    });
});

describe("fill_grid and normalize_grid", () => {
    it("samples every cell at its middle in world units", () => {
        const noise = make_noise({ scale: 25, octaves: 2 }, 3);
        const grid = fill_grid(new Grid2D<number>(4, 3, 0), noise, {
            x0: 100,
            y0: -40,
            cell_size: 8,
        });
        expect(grid.get(0, 0)).toBe(noise(104, -36));
        expect(grid.get(3, 2)).toBe(noise(100 + 3.5 * 8, -40 + 2.5 * 8));
        const plain = fill_grid(new Grid2D<number>(2, 2, 0), noise);
        expect(plain.get(1, 1)).toBe(noise(1.5, 1.5));
    });

    it("lets chunks of a large map fit together", () => {
        const noise = make_noise(NOISE_RECIPES.hills, 77);
        const whole = fill_grid(new Grid2D<number>(16, 8, 0), noise, {
            cell_size: 4,
        });
        const right = fill_grid(new Grid2D<number>(8, 8, 0), noise, {
            x0: 32,
            cell_size: 4,
        });
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                expect(right.get(x, y)).toBe(whole.get(x + 8, y));
            }
        }
    });

    it("fills a tile map layer", () => {
        const map = new TileMap<number>(
            { width: 10, height: 6, tile_size: 16 },
            0,
        );
        const layer = map.layer(TileMap.GROUND);
        fill_grid(layer, make_noise(NOISE_RECIPES.clouds, 1), {
            cell_size: 16,
        });
        expect(layer.count((value) => value > 0)).toBe(60);
    });

    it("stretches a 0..1 fill so it hits both ends", () => {
        const grid = fill_grid(
            new Grid2D<number>(64, 64, 0),
            make_noise({ ...NOISE_RECIPES.hills, scale: 30 }, 4),
        );
        const before = grid.cells().map((cell) => cell.value);
        expect(Math.min(...before)).toBeGreaterThan(0);
        expect(Math.max(...before)).toBeLessThan(1);
        normalize_grid(grid);
        const after = grid.cells().map((cell) => cell.value);
        expect(Math.min(...after)).toBe(0);
        expect(Math.max(...after)).toBe(1);
        // Order is kept.
        for (let k = 1; k < before.length; k++) {
            expect(Math.sign(after[k] - after[k - 1])).toBe(
                Math.sign(before[k] - before[k - 1]),
            );
        }
        normalize_grid(grid, "signed");
        const signed = grid.cells().map((cell) => cell.value);
        expect(Math.min(...signed)).toBe(-1);
        expect(Math.max(...signed)).toBe(1);
        const flat = normalize_grid(new Grid2D<number>(3, 3, 0.7));
        expect(flat.get(1, 1)).toBe(0.5);
    });

    it("refuses a cell size of 0", () => {
        expect(() =>
            fill_grid(new Grid2D<number>(2, 2, 0), () => 0, { cell_size: 0 }),
        ).toThrow(/cell_size/);
    });

    it("fills 256 x 256 cells of hills in under one frame", () => {
        const grid = new Grid2D<number>(256, 256, 0);
        const noise = make_noise(NOISE_RECIPES.hills, 1);
        let best = Infinity;
        for (let round = 0; round < 10; round++) {
            const start = performance.now();
            fill_grid(grid, noise, { cell_size: 2 });
            best = Math.min(best, performance.now() - start);
        }
        // One frame on a desktop; a shared CI runner gets three, so only a real slowdown fails there.
        const env = (
            globalThis as {
                process?: { env: Record<string, string | undefined> };
            }
        ).process?.env;
        const budget = env?.CI ? 3000 / 60 : 1000 / 60;
        expect(best).toBeLessThan(budget);
    });
});

/** Values read once and written down: a change here means maps change for every game. */
const PINNED = {
    simplex: [0.163260191228131, 0.1964078517560366, 0.5977762614187858],
    value: [0.1053913168143481, -0.11714912538403982, -0.32198788050498983],
    hills: [0.5987138738290363, 0.6965428959026241, 0.5330781388904139],
};
