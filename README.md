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
| World | `TileMap`, and pathfinding on any grid: `find_path` (A*), `flow_field` for many walkers to one place, `smooth_path` | [world.md](docs/world.md) |
| Everything else | Colors, math helpers, `SpriteBatch`, `PixelCanvas`, seeded random, camera, testing | [misc.md](docs/misc.md) |

The playground in `test-src/` shows most modules at work: `npm run dev`.

For AI agents, [docs/ai.md](docs/ai.md) holds all of the docs in one file, and [docs/handover.md](docs/handover.md) is a prompt to hand the library to another agent.

## Changelog

One document per major version in [changelog/](changelog/README.md), each with what was added, changed and removed, and how to migrate. A major version is the only place where existing code has to change.
