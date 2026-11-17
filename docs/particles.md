# Particles

Sparks, smoke, dust and trails, as many as the frame allows: a game emits effects (plain data) and, once a frame, updates and draws them onto its 2D context. They run on the graphics card (WebGL 2) where the browser can, else on the CPU; the game never sees WebGL. Since 6.1.0 (`canvas/particles`), first used by Spielwerk step 33, Feuerwerk.

- **`Particles`**: the one class a game uses: `emit`, `update`, `draw`, `clear`, `use_backend`, and what it says (`backend`, `fallback_reason`, `count`, `capacity`, `time`).
- **`ParticleEffect`**: one kind of particles as plain data; **`PARTICLE_EFFECTS`** has five ready-made ones.
- Below them, for tests and the curious: `ParticleStore` (the births and the clock), `CpuParticles` and `GpuParticles` (the two backends), `ParticleRaster` (the CPU's pixels).

## Four lines

```ts
const particles = new Particles();                     // GPU where it can, else CPU
particles.emit(PARTICLE_EFFECTS.burst, x, y);          // when something happens

// every frame:
particles.update(delta_seconds);
particles.draw(context);                               // under the context's transform
```

`draw(context)` paints in the context's own units, under its transform: a game that scales its world onto the canvas emits and draws in world units. Only `context.canvas`'s size matters (the GPU draws into a canvas that big).

## Effects as plain data

```ts
interface ParticleEffect {
    count: number;                       // particles one emit() makes
    speed: [number, number];             // [min, max] units per second
    angle: number;                       // radians: 0 right, -Math.PI / 2 up
    spread: number;                      // fan around angle: 2 * Math.PI all round, 0 a beam
    radius: number;                      // start up to this far from the point
    lifetime: [number, number];          // [min, max] seconds, both above 0
    gravity: number;                     // units per second², down; below 0 it rises
    speed_half_life: number;             // seconds until drag halves the speed; Infinity: none
    color: [string, string];             // [birth, death] "#rrggbb"
    alpha: [number, number];             // [birth, death] 0 to 1
    size: [number, number];              // [birth, death] diameter in units
    blend: "normal" | "glow";            // paint over, or add light
}
```

- **Pairs.** `speed` and `lifetime` are `[min, max]`, picked evenly per particle; `color`, `alpha` and `size` are `[birth, death]`, blended over each particle's life.
- **Drag as a half-life.** `speed_half_life: 0.5` halves the speed every half second. Under gravity a particle settles at a fall speed of `gravity * speed_half_life / Math.LN2`: a burst with `gravity: 60` and `0.5` sinks at 43 units a second at most.
- **Ready-made:** `burst` (a firework's star, 180 sparks), `fountain`, `smoke` and `trail` (each a few particles, to emit every frame from a point that stays or moves), `sparks` (a grinder's fan). Sized for a game about 960 by 640 units. Change one with a spread: `{ ...PARTICLE_EFFECTS.burst, count: 400, color: ["#c8f0ff", "#2050ff"] }`.
- **One emit's changes** (`EmitOptions`): `count`, `angle`, `color` (the birth colour; the death colour stays the effect's), and `vx`, `vy` added to every particle (a trail that keeps some of its rocket's speed).
- **Refused** with an error: a lifetime not above 0, a half-life not above 0, a count that isn't a whole number ≥ 0, a colour that isn't `#rrggbb`.

## Normal and glow

`"normal"` paints over what is below, as `source-over` does: smoke and dust darken or hide. `"glow"` adds light, as `"lighter"` does: sparks over sparks turn white, and they don't darken a dark sky. All normal particles are painted first, then all glowing ones, whatever the order they were emitted in.

## The backends

- **`backend` option**: `"auto"` (default) takes the GPU where the browser has WebGL 2 with float render targets (`EXT_color_buffer_float`), else the CPU. A forced `"gpu"` still falls back where it can't run.
- **`fallback_reason`**: why the GPU isn't used, or `null`: "WebGL 2 is missing", "float render targets are missing (EXT_color_buffer_float)", "no canvas to draw on here", "the GPU set-up failed: …", "the WebGL context was lost". A game shows it to the player; the CPU never has a reason.
- **`use_backend(choice)`** changes while it runs and answers the backend it got. The living particles go along, where they are: both backends work from the same births (below).
- **A lost WebGL context** (a driver reset, too many contexts in the page) is noticed at the next `update()`: the particles go on on the CPU, `fallback_reason` says so. `use_backend("gpu")` then makes a new context.
- **The GPU backend is kept** while the CPU runs, so changing back costs no new context: browsers keep only a few alive, and losing one on purpose is a console warning.
- **`destroy()`** frees the GPU's textures and its context. A game that keeps one `Particles` for its life (the shell's properties) destroys it when the element stops.

## Exact motion, no read back

Each particle is stored once, at its birth: place, velocity, birth time, lifetime, drag, gravity, colours, sizes, opacities. Where it is at any time follows in closed form (constant gravity, drag k = ln 2 / half-life): moved = (1 − e^(−k t)) / k, so one long step lands exactly where many short ones do. Both backends step the same formula, the GPU in a fragment shader over two float textures that take turns, the CPU over a `Float32Array`; nothing is read back from the graphics card, ever. `count` comes from the births and the lifetimes alone.

- **`capacity`** (default 131 072, rounded up to whole rows of 1 024, at most 2 097 152): the most alive at once. When all are taken, the oldest makes room. The births take 64 bytes a particle; the CPU adds 20 for the motion, the GPU 80 bytes of graphics memory.
- **`random`** (an option and a field): where spread, speeds and lifetimes come from, default `Math.random`. A seeded one replays a show; a game swaps it for a new round on the same particles.
- **`time`**: the particles' own clock, the sum of `update()`s.
- **`snapshot()`**: every living particle's place, colour, opacity, size and blend, worked out on the CPU from the births, on either backend: for tests.

## How the CPU paints

The CPU path is real, not a stand-in: it runs every unit test and is what a browser without WebGL 2 shows. It splats each particle into a float buffer (`ParticleRaster`, premultiplied colour) exactly as the GPU rasterises its point sprites, one buffer for normal and one for glow, and puts each onto the 2D context with one `putImageData` (onto an `OffscreenCanvas`) and one `drawImage`. Dots smaller than 2 pixels are one solid pixel at (size / 2)² of the opacity on both backends, so they don't vanish between pixel centres. A test passes `make_canvas: () => null`: the CPU then paints squares with `fillRect`, which a fake context can count.

Why not one `drawImage` per particle: a 2D context spends about 2.5 µs on each, so 60 FPS ends near 5 000 particles. The raster holds 20 000 at 60 FPS and 50 000 at about 53 (the table below).

## How many, at 60 FPS

Measured for Spielwerk step 33 on a 960 by 640 canvas, glowing bursts of 2 seconds' life, nothing else drawn ("alone"), and in the game Feuerwerk with its sky, town and counters ("in the game": the most alive while the frame budget saw 58 FPS or more). Headless Chromium uses SwiftShader, software GL on the CPU; headless Chrome with `--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan` runs on the graphics card (an RTX 4070).

| | CPU, alone | CPU, in the game | GPU, alone | GPU, in the game |
|---|---|---|---|---|
| Headless Chromium, SwiftShader (software) | 20 000 (52 FPS at 50 000) | 33 000 | 100 000 (45 FPS at 150 000) | 29 000 |
| Headless Chrome, RTX 4070 (ANGLE, Vulkan) | 20 000 (54 FPS at 50 000) | 33 000 | 2 000 000 (the most it stores; JS ~9 ms a frame) | 262 000 |

In the game the births come in lumps (a star at ×200 is 36 000 particles in one frame) and the dots are bigger than in the probe, so the GPU's record lies below its probe's. In software GL the GPU path is no faster than the CPU's: copying the WebGL canvas onto a software 2D canvas costs as much as the work saved.

## Lessons from the GPU

- **Samplers are `lowp` by default in GLSL ES.** Under ANGLE on NVIDIA (Vulkan) a `lowp sampler2D` reads a float texture at half precision: positions jitter and packed colours turn white or black. The shaders declare `precision highp sampler2D`.
- **Colours are packed** as one float 0xrrggbb (exact in a float32) and unpacked with `floor` and `mod` in floats: `int(packed + 0.5)` overflowed for `#ffffff` on one driver.
- **Headless Chrome on a graphics card loses the first WebGL context of a fresh page** about 2 ms after making it. The fallback catches it; `use_backend("gpu")` gets a working one.
- **Shaders are plain string modules** (`shaders.ts`): the toolbox ships TypeScript source, so there is no bundler step to import `.glsl` files.
- **Headless Chromium logs "GPU stall due to ReadPixels"** when a WebGL canvas is drawn onto its software 2D canvas. The particles never read back themselves; a browser check may filter that line.
