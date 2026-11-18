import { SeededRandom } from "../SeededRandom";

/**
 * A noise: a smooth function of a position that answers -1..1 (or 0..1 for a recipe with
 * `range: "unit"`). The same seed gives the same function on every machine.
 */
export type Noise2D = (x: number, y: number) => number;

/** The two kinds of base noise. */
export type NoiseKind = "simplex" | "value";

/**
 * Simplex noise as published by Ken Perlin (2001) in Stefan Gustavson's form, with twelve
 * gradients 30° apart (written as numbers, no `Math.cos` at run time). One lattice step is one
 * unit; `make_noise` scales it to the size a game asks for.
 */
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRADIENT_X = [
    1, 0.8660254037844387, 0.5, 0, -0.5, -0.8660254037844387, -1,
    -0.8660254037844387, -0.5, 0, 0.5, 0.8660254037844387,
];
const GRADIENT_Y = [
    0, 0.5, 0.8660254037844387, 1, 0.8660254037844387, 0.5, 0, -0.5,
    -0.8660254037844387, -1, -0.8660254037844387, -0.5,
];

/**
 * Scales the raw simplex sum to -1..1. The highest raw sum, found by climbing from a dense
 * sampling over six seeds, is 0.0098371; 101.65 brings it to 0.99994. The result is clamped as
 * well, so no rounding steps outside.
 */
export const SIMPLEX_NORMALIZE = 101.65;

/**
 * The shuffled numbers 0..255 twice over (512 entries), from `SeededRandom(seed)`. Both noises
 * hash lattice points through it: `perm[x & 255 + perm[y & 255]]`.
 */
export function noise_permutation(seed: number): Uint8Array {
    const random = new SeededRandom(seed);
    const order: number[] = [];
    for (let i = 0; i < 256; i++) {
        order.push(i);
    }
    random.shuffle(order);
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        perm[i] = order[i & 255];
    }
    return perm;
}

/**
 * Seeded simplex noise, `(x, y) => -1..1`: smooth, without grid lines, about one hill or one
 * valley per unit. Coordinates should stay below about a billion.
 */
export function simplex_noise_2d(seed: number): Noise2D {
    const perm = noise_permutation(seed);
    // The gradient of a lattice point whose hash is h (0..255).
    const gx = new Float64Array(256);
    const gy = new Float64Array(256);
    for (let h = 0; h < 256; h++) {
        gx[h] = GRADIENT_X[h % 12];
        gy[h] = GRADIENT_Y[h % 12];
    }
    return (x: number, y: number): number => {
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;
        const x0 = x - (i - t);
        const y0 = y - (j - t);
        let i1 = 0;
        let j1 = 1;
        if (x0 > y0) {
            i1 = 1;
            j1 = 0;
        }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 255;
        const jj = j & 255;
        let sum = 0;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 > 0) {
            const g = perm[ii + perm[jj]];
            t0 *= t0;
            sum += t0 * t0 * (gx[g] * x0 + gy[g] * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 > 0) {
            const g = perm[ii + i1 + perm[jj + j1]];
            t1 *= t1;
            sum += t1 * t1 * (gx[g] * x1 + gy[g] * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 > 0) {
            const g = perm[ii + 1 + perm[jj + 1]];
            t2 *= t2;
            sum += t2 * t2 * (gx[g] * x2 + gy[g] * y2);
        }
        return clamp_signed(sum * SIMPLEX_NORMALIZE);
    };
}

/**
 * Seeded value noise, `(x, y) => -1..1`: a random height on every whole-numbered point, blended
 * between them with a quintic curve (smooth in slope and bend, so no creases along the grid).
 * Blockier than simplex and a little cheaper; one lattice step is one unit.
 */
export function value_noise_2d(seed: number): Noise2D {
    const perm = noise_permutation(seed);
    const random = new SeededRandom(seed + 1);
    const heights = new Float64Array(256);
    for (let i = 0; i < 256; i++) {
        heights[i] = random.float(-1, 1);
    }
    return (x: number, y: number): number => {
        const xf = Math.floor(x);
        const yf = Math.floor(y);
        const fx = x - xf;
        const fy = y - yf;
        const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
        const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
        const i = xf & 255;
        const j = yf & 255;
        const row0 = perm[j];
        const row1 = perm[j + 1];
        const a = heights[perm[i + row0]];
        const b = heights[perm[i + 1 + row0]];
        const c = heights[perm[i + row1]];
        const d = heights[perm[i + 1 + row1]];
        const top = a + (b - a) * u;
        const bottom = c + (d - c) * u;
        return clamp_signed(top + (bottom - top) * v);
    };
}

/** `simplex_noise_2d(seed)` or `value_noise_2d(seed)` by name; simplex by default. */
export function noise_2d(seed: number, kind: NoiseKind = "simplex"): Noise2D {
    if (kind === "value") {
        return value_noise_2d(seed);
    }
    return simplex_noise_2d(seed);
}

function clamp_signed(value: number): number {
    if (value > 1) {
        return 1;
    }
    if (value < -1) {
        return -1;
    }
    return value;
}
