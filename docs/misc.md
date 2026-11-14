# Miscellaneous Utilities

Other helpful tools included in the library.

## Commons

- **Colors**: A collection of common color constants.

## Data

- **RgbColor**: A class to handle RGB colors and conversions.
- **HsvColor**: hue, saturation and value: `to_rgb()`, `to_css()`, `with_hue()` and friends, `lerp()`.
- **Grid2D**: a fixed grid of values, row-major: `get`, `set`, `is_inside`, `cells()`, `row()`, `column()`.

## DOM

- **CanvasHelper**: Utilities for working with the HTML5 Canvas API.
- **QuerySelector**: Helper for selecting DOM elements with type safety.
- **`play_video_splash(container, url, options)`**: plays a video over the container and resolves with how it ended (`"ended"`, `"skipped"`, `"timeout"`, `"error"`, `"blocked"`, `"aborted"`). `hold_ms` keeps the last frame that long after the end; a click or key during the hold counts as `"ended"`, not as skipped. The game shell's `IntroGate` uses it for the intro (see [game-shell.md](game-shell.md)).

## Math helpers

Exported from the root as well:

- **`clamp(value, min, max)`**: `value` held inside `[min, max]`.
- **`lerp(from, to, t)`**: `from` at `t = 0`, `to` at `t = 1`; `t` is not clamped.
- **`angle_difference(from, to)`**: the signed turn from one angle to another in radians, wrapped into `[-π, π]`: the shortest way round.

```ts
const facing = facing_now + clamp(angle_difference(facing_now, wanted), -turn_speed * dt, turn_speed * dt);
```

The `helpers` folder also has **ID** (unique ids), **MathHelper** (`float_equals`) and **Settings**.

## Canvas

- **`PixelCanvas`**: a buffer of palette indices with the tools of a small pixel editor: `set`, `line`, `rect`, `flood_fill`, `snapshot` / `restore` for undo, and `to_image_data(palette)` for painting it. Step 14 (Pixel Paint) is built on it.
- **`SpriteBatch`**: many sprites drawn quickly. `add(image, x, y, angle, width, height)` for each (the middle of the sprite, radians clockwise, 0 faces right), then `draw(context)` once a frame. It draws image by image, with one `setTransform` per sprite on top of the context's transform and no `save()` / `restore()`, and leaves the transform as it was. All sprites of the first image added lie under those of the next: draw what must be on top in a batch of its own. The batch keeps its storage between frames. Step 29 (Horde) draws its crowd with it.

```ts
const batch = new SpriteBatch();
for (const zombie of zombies) {
    batch.add(zombie_image, zombie.x, zombie.y, zombie.angle, 32, 32);
}
camera.apply(context);
batch.draw(context);
```

## Input

- **`KeyboardState`**: key events in, per-frame questions out: `is_down(key)`, `was_pressed`, `was_released`, `typed()`, then `end_frame()`. Keys are `KeyboardEvent.key`.
- **`PointerInput`**: the same for mouse, touch and pen: taps, drags, drops, the wheel.
- **`ComboMatcher`** and **`ComboList`**: a sequence of inputs (a dance step, a cheat code) with an optional `max_gap_seconds` between steps; `input()` says `"progress"`, `"complete"`, `"broken"` or `"ignored"`.
- **`MenuInput`**: keys and presses for a `Menu`, with a buffer of presses; see [ui.md](ui.md#menus).

## Random, camera, tile maps

- **`SeededRandom`**: a seeded generator (mulberry32): `next()`, `int(min, max)`, `float(min, max)`, `chance(p)`, `fork()`. The same seed gives the same game.
- **`Camera2D`**: a view that follows a target inside the world's bounds, with a dead zone, look-ahead and smoothing; `apply(context)` puts its transform on the canvas, `world_to_screen` / `screen_to_world` map points, `is_visible(rect)` culls, `parallax(factor)` for background layers.
- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid.

## Testing

A custom test suite used for internal testing and available for general use.

- **TestClass**: Base class for tests.
- **TestDashboard**: A UI for viewing test results in the browser. The playground in `test-src/` (`npm run dev`) is built on it.
