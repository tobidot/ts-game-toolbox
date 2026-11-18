import { SeededRandom } from "../SeededRandom";
import { Noise2D, NoiseKind, noise_2d } from "./Noise";

/** Push every sample by a second noise before reading the first: swirls and bent coasts. */
export interface NoiseWarp {
    /** How far a sample is pushed at most, in world units. */
    amount: number;
    /** How wide the pushing noise's hills are, in world units. */
    scale: number;
}

/**
 * Sink everything towards the bottom away from a middle point: an island in a sea. At the middle
 * the noise is untouched; at `radius` and beyond it is the bottom of the range.
 */
export interface NoiseFalloff {
    /** The middle, in world units. */
    x: number;
    y: number;
    /** Where the land has sunk to the bottom, in world units. */
    radius: number;
}

/** `"signed"` answers -1..1, `"unit"` answers 0..1 (a height map, a share). */
export type NoiseRange = "signed" | "unit";

/**
 * A noise as plain data, for `make_noise(recipe, seed)`. Every field has a default, so `{}` is
 * simplex noise with hills 100 units across in -1..1. Sizes are in world units (cells or
 * pixels, whatever the game samples in), never frequencies.
 */
export interface NoiseRecipe {
    /** The base noise; default `"simplex"`. */
    kind?: NoiseKind;
    /** How wide one hill of the first octave is, in world units; default 100. */
    scale?: number;
    /** How many layers of finer detail are added up, 1 to 12; default 1. */
    octaves?: number;
    /** Each octave is this share as strong as the one before; default 0.5. */
    persistence?: number;
    /** Each octave's hills are this many times narrower than the one before; default 2. */
    lacunarity?: number;
    /** Each octave becomes `1 - 2 |n|`: sharp crests where the noise crosses zero (mountain ridges). */
    ridged?: boolean;
    /** Push the samples by a second noise first; default none. */
    warp?: NoiseWarp | null;
    /** Move the window over the noise, in world units (scrolling clouds, the next map chunk). */
    offset?: { x: number; y: number };
    /** Sink towards the bottom away from a middle point; default none. */
    falloff?: NoiseFalloff | null;
    /** -1..1 (`"signed"`, the default) or 0..1 (`"unit"`). */
    range?: NoiseRange;
}

/**
 * How wide one hill is, in lattice steps, at frequency 1: the mean length of a run above zero
 * along a straight line, measured over 1 200 lines of 2 000 steps in six seeds. `make_noise`
 * divides by it, so `scale` is the width a player sees.
 */
export const NOISE_HILL_WIDTH: Readonly<Record<NoiseKind, number>> = {
    simplex: 0.6955,
    value: 2.125,
};

/** The most octaves a recipe may ask for; past 12 the finest hills are smaller than a pixel. */
export const MAX_NOISE_OCTAVES = 12;

/**
 * Ready-made recipes, all 0..1 like a height map. Spread one and change a field:
 * `{ ...NOISE_RECIPES.hills, scale: 60 }`.
 */
export const NOISE_RECIPES = {
    /** Rolling hills about 120 units across with three finer layers. */
    hills: {
        kind: "simplex",
        scale: 120,
        octaves: 4,
        persistence: 0.5,
        lacunarity: 2,
        range: "unit",
    },
    /** Ridged ranges about 240 units apart: sharp crests, wide valleys. */
    mountains: {
        kind: "simplex",
        scale: 240,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        ridged: true,
        range: "unit",
    },
    /** One island in the middle of a 512 by 512 map, with sea at its edges. */
    islands: {
        kind: "simplex",
        scale: 160,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        falloff: { x: 256, y: 256, radius: 256 },
        range: "unit",
    },
    /** Soft, many-layered clouds 200 units across. */
    clouds: {
        kind: "simplex",
        scale: 200,
        octaves: 6,
        persistence: 0.6,
        lacunarity: 2,
        range: "unit",
    },
    /** Swirling veins: a noise pushed 60 units around by a second one. */
    marble: {
        kind: "simplex",
        scale: 80,
        octaves: 3,
        persistence: 0.5,
        lacunarity: 2,
        warp: { amount: 60, scale: 160 },
        range: "unit",
    },
} satisfies Record<string, NoiseRecipe>;

/** The names of the ready-made recipes. */
export type NoiseRecipeName = keyof typeof NOISE_RECIPES;

/**
 * Turns a recipe into a noise function, `(x, y) => value` in the recipe's range, seeded: the
 * same recipe and seed give the same values on every machine (only `+ - * /`, `Math.floor`
 * and `Math.sqrt`, which every browser computes alike). Order of work per sample: `offset`,
 * `warp`, the octaves (each `ridged` when asked), their sum divided by the sum of their
 * strengths (so it stays in -1..1), `falloff` around the unmoved position, then `range`.
 * Throws on a recipe it can't make (a scale of 0, 40 octaves).
 */
export function make_noise(recipe: NoiseRecipe, seed: number): Noise2D {
    const kind = recipe.kind ?? "simplex";
    const scale = recipe.scale ?? 100;
    const octaves = recipe.octaves ?? 1;
    const persistence = recipe.persistence ?? 0.5;
    const lacunarity = recipe.lacunarity ?? 2;
    const ridged = recipe.ridged ?? false;
    const warp = recipe.warp ?? null;
    const falloff = recipe.falloff ?? null;
    const offset_x = recipe.offset?.x ?? 0;
    const offset_y = recipe.offset?.y ?? 0;
    const unit = (recipe.range ?? "signed") === "unit";
    check_recipe(kind, scale, octaves, persistence, lacunarity, warp, falloff);
    if (!Number.isFinite(offset_x) || !Number.isFinite(offset_y)) {
        throw new Error("make_noise: offset must be finite");
    }

    const random = new SeededRandom(seed);
    const base = noise_2d(random.int(0, 0xffffffff), kind);
    // Drawn before the octaves, so more or fewer octaves never change the warp.
    const warp_x = noise_2d(random.int(0, 0xffffffff), "simplex");
    const warp_y = noise_2d(random.int(0, 0xffffffff), "simplex");
    const frequency = new Float64Array(octaves);
    const strength = new Float64Array(octaves);
    const shift_x = new Float64Array(octaves);
    const shift_y = new Float64Array(octaves);
    let f = NOISE_HILL_WIDTH[kind] / scale;
    let a = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
        frequency[o] = f;
        strength[o] = a;
        total += a;
        // Every octave reads another part of the noise, so no point is a lattice corner of all.
        shift_x[o] = o === 0 ? 0 : random.float(-4096, 4096);
        shift_y[o] = o === 0 ? 0 : random.float(-4096, 4096);
        f *= lacunarity;
        a *= persistence;
    }
    const inverse_total = total > 0 ? 1 / total : 0;
    const warp_amount = warp === null ? 0 : warp.amount;
    const warp_frequency =
        warp === null ? 0 : NOISE_HILL_WIDTH.simplex / warp.scale;
    const inverse_radius_squared =
        falloff === null ? 0 : 1 / (falloff.radius * falloff.radius);

    return (x: number, y: number): number => {
        let px = x + offset_x;
        let py = y + offset_y;
        if (warp_amount > 0) {
            const wx = px * warp_frequency;
            const wy = py * warp_frequency;
            px += warp_amount * warp_x(wx, wy);
            py += warp_amount * warp_y(wx, wy);
        }
        let sum = 0;
        for (let o = 0; o < octaves; o++) {
            let n = base(
                px * frequency[o] + shift_x[o],
                py * frequency[o] + shift_y[o],
            );
            if (ridged) {
                n = 1 - 2 * (n < 0 ? -n : n);
            }
            sum += n * strength[o];
        }
        let value = sum * inverse_total;
        if (falloff !== null) {
            const dx = x - falloff.x;
            const dy = y - falloff.y;
            const t = (dx * dx + dy * dy) * inverse_radius_squared;
            const keep = t >= 1 ? 0 : 1 - t;
            value = (value + 1) * keep - 1;
        }
        if (value > 1) {
            value = 1;
        } else if (value < -1) {
            value = -1;
        }
        return unit ? (value + 1) * 0.5 : value;
    };
}

function check_recipe(
    kind: NoiseKind,
    scale: number,
    octaves: number,
    persistence: number,
    lacunarity: number,
    warp: NoiseWarp | null,
    falloff: NoiseFalloff | null,
): void {
    if (kind !== "simplex" && kind !== "value") {
        throw new Error(`make_noise: unknown kind "${String(kind)}"`);
    }
    if (!(scale > 0) || !Number.isFinite(scale)) {
        throw new Error(`make_noise: scale must be > 0, got ${scale}`);
    }
    if (
        !Number.isInteger(octaves) ||
        octaves < 1 ||
        octaves > MAX_NOISE_OCTAVES
    ) {
        throw new Error(
            `make_noise: octaves must be a whole number from 1 to ${MAX_NOISE_OCTAVES}, got ${octaves}`,
        );
    }
    if (!(persistence >= 0) || !Number.isFinite(persistence)) {
        throw new Error(
            `make_noise: persistence must be >= 0, got ${persistence}`,
        );
    }
    if (!(lacunarity >= 1) || !Number.isFinite(lacunarity)) {
        throw new Error(
            `make_noise: lacunarity must be >= 1, got ${lacunarity}`,
        );
    }
    if (warp !== null) {
        if (!(warp.amount >= 0) || !Number.isFinite(warp.amount)) {
            throw new Error(
                `make_noise: warp.amount must be >= 0, got ${warp.amount}`,
            );
        }
        if (!(warp.scale > 0) || !Number.isFinite(warp.scale)) {
            throw new Error(
                `make_noise: warp.scale must be > 0, got ${warp.scale}`,
            );
        }
    }
    if (falloff !== null) {
        if (!(falloff.radius > 0) || !Number.isFinite(falloff.radius)) {
            throw new Error(
                `make_noise: falloff.radius must be > 0, got ${falloff.radius}`,
            );
        }
        if (!Number.isFinite(falloff.x) || !Number.isFinite(falloff.y)) {
            throw new Error("make_noise: falloff.x and .y must be finite");
        }
    }
}
