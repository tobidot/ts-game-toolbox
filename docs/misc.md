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
- **Sprite animation** (`canvas/animation`): `SpriteSheet`, `AnimationClip`, `AnimationPlayer`; see [animation.md](animation.md).
- **Particles** (`canvas/particles`): `Particles`, `PARTICLE_EFFECTS`, on the GPU or the CPU; see [particles.md](particles.md).
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

- **`KeyboardState`**: key events in, per-frame questions out: `is_down(key)`, `was_pressed`, `was_released`, `typed()`, then `end_frame()`. Keys are `KeyboardEvent.key`; the same by `KeyboardEvent.code`, the key's place whatever the layout types, are `is_code_down(code)`, `was_code_pressed`, `was_code_released` and `pressed_codes()`.
- **`PointerInput`**: the same for mouse, touch and pen: taps, drags, drops, the wheel.
- **`ComboMatcher`** and **`ComboList`**: a sequence of inputs (a dance step, a cheat code) with an optional `max_gap_seconds` between steps; `input()` says `"progress"`, `"complete"`, `"broken"` or `"ignored"`.
- **`MenuInput`**: keys and presses for a `Menu`, with a buffer of presses; `handle_actions(actions, device = "gamepad")` reads an `ActionMap`'s `move`, `confirm` and `back` as the keys they stand for. See [ui.md](ui.md#menus).
- **`ActionMap`** (`input/actions/`): input by name. See below.

### ActionMap

A game asks for "move" and "fire", not for keys; the keyboard, a gamepad and touch controls all feed the same actions. The game shell owns one (`settings.actions`, `properties.actions`, see [game-shell.md](game-shell.md#actions)); this is the module on its own.

- **Bindings are data** (`ActionBindings`): a `button` has `keys` (by `KeyboardEvent.code`: `"Space"`, `"KeyF"`), `pad` (buttons of the standard mapping by name: `a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`, `select`, `start`, `l3`, `r3`, `up`, `down`, `left`, `right`, `home`; `PAD_BUTTONS` has their indices), `touch: "button"` and a `label`. A `vector` has `keys` (crosses of four codes: `WASD`, `ARROWS`), `stick` (`"left"` or `"right"`), `dpad` and `touch: "stick"`. `DEFAULT_ACTIONS` is `move`, `confirm`, `back` and `pause`.
- **`new ActionMap({ bindings, keyboard, gamepads, touch, dead_zone, device })`**: `keyboard` a `KeyboardState`, `gamepads` a function that returns the pads (default `browser_gamepads`, `navigator.getGamepads()`; a test passes plain `GamepadLike` objects), `touch` a `TouchSource` (`TouchControls`, or a fake), `dead_zone` 0.2, `device` the `last_device` before the first input.
- **`update()`** once a frame, before the game reads. Two devices at once add up and are cut to 1 long: a key and a stick together are not faster.
- **Buttons**: `is_down(name)`, `just_pressed(name, device?)` (true for exactly one frame; a key pressed and let go between two frames still counts once), `just_released(name)`. **Vectors**: `vector(name, device?)`, at most 1 long; `nudge(name, device?)` is -1, 0 or 1 per axis on the frame a direction passes half way, a step for a cursor.
- **Devices**: `last_device` (`"keyboard"` with the mouse, `"gamepad"`, `"touch"`) follows the last input (a key, a new pad press or a stick leaving its dead zone, a touch); `note_device()` tells it about input it doesn't read, such as a mouse click. `pad` is the id of the standard pad in use; a connected pad with another mapping is ignored and its id is in `unsupported_pad`.
- **Sticks** get a radial dead zone: inside it they are still, outside the rest is scaled so a stick all the way still reaches 1 (`radial_dead_zone(x, y, dead_zone)`; `clamp_vector(x, y)` cuts to 1).
- `has(name)`, `clear()` (forget what is held; what a device still holds next frame is held, not pressed again). Asking for a name the map doesn't have, or a button as a vector, throws.

**`TouchControls`** are touch controls in layout coordinates, plain values in and out: a floating stick that appears where a thumb lands on the left half (`stick`, `stick_vector()`, reach `stick_radius`, a small dead zone of its own) and round buttons on the right (`buttons`, `is_button_down(action)`; `touch_buttons_of(bindings)` lists the ones the bindings ask for). `layout(width, height)` places the buttons, `handle_down(id, point)` / `handle_move` / `handle_up` take fingers by pointer id and say whether they were the controls', `is_shown` is true from the first touch on.

## Random, camera, tile maps

- **`SeededRandom`**: a seeded generator (mulberry32): `next()`, `int(min, max)`, `float(min, max)`, `chance(p)`, `fork()`. The same seed gives the same game. Seeded noise and recipes for maps are in [noise.md](noise.md).
- **`Camera2D`**: a view that follows a target inside the world's bounds, with a dead zone, look-ahead and smoothing; `apply(context)` puts its transform on the canvas, `world_to_screen` / `screen_to_world` map points, `is_visible(rect)` culls, `parallax(factor)` for background layers.
- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid; the ways across them (`find_path`, `flow_field`, `smooth_path`) are in [world.md](world.md).

## Testing

A custom test suite used for internal testing and available for general use.

- **TestClass**: Base class for tests.
- **TestDashboard**: A UI for viewing test results in the browser. The playground in `test-src/` (`npm run dev`) is built on it.
