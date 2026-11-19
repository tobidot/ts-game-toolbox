# Ts Game Toolbox

`@game.object/ts-game-toolbox` is a TypeScript toolbox for small browser games on a 2D canvas: geometry, physics, input, assets, a themed canvas UI and a game shell that turns a canvas game into a custom element with intro, start screen, scaling and sound. It has no runtime dependencies and ships as TypeScript source, so a game bundles only what it imports and can read every line it runs.

What sets it apart is how it grows. Every module since 5.4 was written for a small, playable game in the [Spielwerk series](https://www.game-object.de/pages/spielwerk), one step at a time, and each step's page shows the module at work, with the numbers measured where speed matters. So the pieces are tried in a real game before they land here: a physics world that takes its collision rule as a plug-in (`aabb`, `aabb_sweep`, `sat_sweep`) and carries thousands of bodies, an asset manager that loads files by priority as you scroll, a canvas UI with themes, transitions and menus.

```bash
npm install @game.object/ts-game-toolbox
```

## Features

| Feature | What it gives you | Docs |
| --- | --- | --- |
| Game shell | `CanvasGameElement` and its five parts, the stage and its layouts, intro, start screen, `AudioPlayer`, `FrameBudget` | [game-shell.md](docs/game-shell.md) |
| Physics | AABB and sweeping SAT as functions, bounce, kinematics, steering, and `PhysicsWorld` with swappable rules, a grid, layers and contact events | [physics.md](docs/physics.md) |
| Geometries | `Vector2`, `Rect`, `Polygon`, `Line`, `Ray`, and the coordinate system | [geometries.md](docs/geometries.md) |
| Trees | `QuadTree` and `Collection` | [trees.md](docs/trees.md) |
| Assets | `AssetManager`: sets loaded at once, or a queue of requests by priority with progress and `cancel()` | [assets.md](docs/assets.md) |
| UI | Canvas widgets, states, themes and movement, menus, scrolling | [ui.md](docs/ui.md) |
| Signals | Event and signal sockets, observable values | [signals.md](docs/signals.md) |
| Flow | `Progress`, `FixedStepClock`, `Tween`, timers, `Throttler`, asserts | [flow.md](docs/flow.md) |
| Input | `ActionMap`: actions by name from the keyboard, a gamepad and touch controls, owned by the game shell; `KeyboardState`, `PointerInput`, `MenuInput` | [misc.md](docs/misc.md#input), [game-shell.md](docs/game-shell.md#actions) |
| World | `TileMap`, and pathfinding on any grid: `find_path` (A*), `flow_field` for many walkers to one place, `smooth_path`; visibility: `field_of_view` (symmetric shadowcasting), `FogOfWar` (unseen, seen, visible; many viewers, incremental, events for newly seen cells), `draw_fog` | [world.md](docs/world.md) |
| Animation | Sprite sheets cut by grid or from a catalogue entry's data, clips as plain data, `AnimationPlayer` with play, queue, `then`, speed and frame events; crowds: sheet frames in `SpriteBatch`, `CrowdAnimation` for thousands in flat arrays, `prescale` | [animation.md](docs/animation.md) |
| Puppets | Cut-out puppets (2D skeletal animation): a rig as plain data (bones, slots, skins in one atlas, anchors, keyed clips), `Puppet` with `PuppetPlayer` (fades, queue, `then`, moments), reskinning on the same skeleton, picking a bone; `logic.load_puppet()` from a catalogue | [puppet.md](docs/puppet.md) |
| Particles | `Particles`: effects as plain data (`PARTICLE_EFFECTS`), on the GPU (WebGL 2) or the CPU behind one API, picked by itself, exact motion, a lost context goes on on the CPU | [particles.md](docs/particles.md) |
| Noise | Seeded simplex and value noise as functions, recipes as plain data with sizes in world units (`make_noise`, `NOISE_RECIPES`: hills, mountains, islands, clouds, marble), `fill_grid` into any `Grid2D`, `normalize_grid` | [noise.md](docs/noise.md) |
| Saves | Versioned save slots (`SaveSlots`): migrations one version at a time, `validate`, a load that always plays (broken or newer files kept aside, never overwritten), saves in order with the last one winning, autosave on a timer and when the page hides, export and import as readable JSON; stores of text (`memory_store`, `local_storage_store`, or a host's own); the shell's `open_save_store()` hook and `SaveSlotsPage` | [saves.md](docs/saves.md) |
| Everything else | Colors, math helpers, `SpriteBatch`, `PixelCanvas`, seeded random, camera, testing | [misc.md](docs/misc.md) |

The playground in `test-src/` shows most modules at work: `npm run dev`.

For AI agents, [docs/ai.md](docs/ai.md) holds all of the docs in one file, and [docs/handover.md](docs/handover.md) is a prompt to hand the library to another agent.

## Changelog

One document per major version in [changelog/](changelog/README.md), each with what was added, changed and removed, and how to migrate. A major version is the only place where existing code has to change.
