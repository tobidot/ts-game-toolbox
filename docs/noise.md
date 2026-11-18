# Noise

Hills, coasts, clouds and marble for generated maps: smooth noise, seeded, the same on every machine. A noise is a function `(x, y) => number`; a recipe is plain data that says which noise, how big and how many layers. Since 6.2.0 (`random/noise`), first used by Spielwerk step 34, Inselkarte.

- **`simplex_noise_2d(seed)`** and **`value_noise_2d(seed)`** (or `noise_2d(seed, kind)`): the two base noises, -1..1, one lattice step per unit.
- **`NoiseRecipe`** and **`make_noise(recipe, seed)`**: a recipe as plain data turned into the same kind of function, with sizes in world units. **`NOISE_RECIPES`** has five ready-made ones.
- **`fill_grid(grid, noise, options)`** samples into any `Grid2D<number>` (and so a `TileMap` layer); **`normalize_grid(grid, range)`** stretches the values to the full range.

## Three lines

```ts
const heights = new Grid2D<number>(320, 240, 0);
fill_grid(heights, make_noise(NOISE_RECIPES.hills, seed), { cell_size: 1.5 });
normalize_grid(heights);   // lowest 0, highest 1
```

## Recipes as plain data

```ts
interface NoiseRecipe {
    kind?: "simplex" | "value";       // default "simplex"
    scale?: number;                   // how wide one hill is, in world units; default 100
    octaves?: number;                 // layers of finer detail, 1 to 12; default 1
    persistence?: number;             // each octave this share as strong as the one before; default 0.5
    lacunarity?: number;              // each octave's hills this many times narrower; default 2
    ridged?: boolean;                 // each octave folded to 1 - 2|n|: sharp crests (ridges)
    warp?: { amount, scale } | null;  // push every sample up to `amount` units by a second noise `scale` wide
    offset?: { x, y };                // move the window over the noise, in world units
    falloff?: { x, y, radius } | null;// sink to the bottom towards `radius` from (x, y): an island
    range?: "signed" | "unit";        // -1..1 (default) or 0..1
}
```

Every field has a default, so `make_noise({}, seed)` is simplex noise with hills 100 units across. Spread a ready-made recipe and change what differs: `{ ...NOISE_RECIPES.hills, scale: 60 }`. A recipe the noise can't make (a scale of 0, 40 octaves, a lacunarity under 1) throws.

**Sizes one can picture.** `scale` is not a frequency: it is how wide one hill of the first octave is, measured as the mean length of a run above zero along a straight line (simplex: 0.6955 lattice steps at frequency 1, value noise: 2.125; `NOISE_HILL_WIDTH`). A test checks that `scale: 40` and `scale: 120` give hills within 15 % of that, for both kinds. `warp.amount`, `offset` and `falloff` are world units too.

What happens to one sample, in order: `offset`, `warp` (two simplex noises push x and y), the octaves (each `ridged` when asked), their sum divided by the sum of their strengths (so it stays in -1..1), `falloff` around the unmoved position, then `range`. The warp's seeds are drawn before the octaves', so more or fewer octaves never change the warp, and the first octave stays where it was: more octaves only add detail.

| Name | What | The recipe |
| --- | --- | --- |
| `hills` | rolling hills 120 across | simplex, 4 octaves |
| `mountains` | ridged ranges 240 apart | simplex, 5 octaves, `ridged` |
| `islands` | one island in a 512 by 512 map | simplex 160, 5 octaves, `falloff` (256, 256) radius 256 |
| `clouds` | soft, many-layered | simplex 200, 6 octaves, persistence 0.6 |
| `marble` | swirling veins | simplex 80, 3 octaves, `warp` 60 by 160 |

All five answer 0..1 (`range: "unit"`), like a height map.

## The same everywhere

The permutation of each noise is `SeededRandom(seed)` shuffling 0..255; the octaves' offsets and the warp's seeds come from the same stream. The arithmetic is `+ - * /`, `Math.floor` and `Math.sqrt` only (all exact in IEEE 754, so every browser computes the same bits): no `Math.random`, no `Math.sin`, `Math.pow` or `Math.hypot`, whose last bits may differ between engines. The twelve simplex gradients are written as numbers. A test pins values exactly (`toEqual`, not `toBeCloseTo`).

Simplex noise is Ken Perlin's (2001) in Stefan Gustavson's form, scaled by 101.65 so its peak (0.0098371 raw, found by climbing from a dense sampling) lands at 0.99994; it is clamped as well. Value noise blends a random height on every whole-numbered point with a quintic curve, so neither the slope nor the bend jumps at a lattice line (a test compares the slope just left and right of one). Coordinates should stay below about a billion.

## Grids

```ts
fill_grid(grid, noise, { x0?, y0?, cell_size? }): Grid2D<number>
normalize_grid(grid, range = "unit"): Grid2D<number>
```

`fill_grid` gives cell (x, y) the noise at its middle, `(x0 + (x + 0.5) * cell_size, y0 + (y + 0.5) * cell_size)`. A chunk of a larger map passes its place in the world as `x0` / `y0`, and its edges meet the next chunk's. `normalize_grid` maps the lowest value to the bottom of the range and the highest to the top, keeping the order; a flat grid becomes the middle.

## How long a fill takes

The best of seven fills in Node and five in Chromium, after one to warm up, on an Intel i7-11700F (Spielwerk step 34, `measure_fills()` in its `src/game/Measure.ts`):

| Recipe | 256 × 256, Node 22 | 512 × 512, Node 22 | 512 × 512, Chromium (Playwright, headless) |
| --- | --- | --- | --- |
| `hills` (4 octaves) | 8.0 ms | 30 ms | 35 ms |
| `marble` (3 + warp) | 9.1 ms | 37 ms | 40 ms |
| `islands` (5) | 10.4 ms | 43 ms | 46 ms |
| `mountains` (5, ridged) | 11.0 ms | 46 ms | 49 ms |
| `clouds` (6) | 12.2 ms | 51 ms | 57 ms |

One simplex sample costs about 20 ns, about what the fastest JavaScript simplex libraries reach, and the time grows with octaves × cells. So 256 × 256 cells of `hills` fit into a frame at 60 FPS (a test checks it), 512 × 512 take about two frames. A map that is filled once at the start doesn't mind; a game that refills while a slider moves keeps the grid near 300 × 200 (Inselkarte: 320 × 240 cells with a warp, 17 ms at 5 octaves, about 31 ms at 7), fills only the part that changed, or spreads a large fill over frames in chunks (`x0`, `y0`).
