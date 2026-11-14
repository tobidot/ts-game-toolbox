# Flow

Utilities for controlling the flow of the program: progress tracking, time in frame loops, async helpers and assertions.

## Progress

`Progress` tracks a long-running operation, for a loading bar. A task has a `max` (default 1) and may have child tasks; each child counts as one unit of its parent's `max`, however big its own `max` is. `get_percent()` is 0 to 1.

```typescript
import { Progress } from "@game.object/ts-game-toolbox";

const loading = new Progress(2); // two parts
loading.listen((percent) => {
    console.log(`${Math.round(percent * 100)}%`);
});

const images = loading.make_child_progress(10); // ten files
const sounds = loading.make_child_progress(4);
images.set_self_progress(5); // loading is at 25%
images.mark_as_done(); // 50%
sounds.mark_as_done(); // 100%
```

- **`set_self_progress(current)`** and **`mark_as_done()`** move a task; every listener up the tree hears about it.
- **Nothing to do is done.** A task whose `max` is 0 or less is at 1. (Up to 5.6.0 it returned 100.)
- **Work that arrives later.** `append_child_progress(max = 1)` adds a child and grows its parent's `max` by one, for files requested one by one while others already load. Start such a task with `new Progress(0)`: until something is added it counts as done. `AssetManager.progress` works this way. `remove_child_progress(child)` takes such a child back (work withdrawn before it ran) and shrinks `max` by one again.

## FixedStepClock

Turns uneven frame deltas into even steps of a fixed length, so a simulation plays out alike at any frame rate and a seed replays exactly. What a frame leaves over is kept for the next.

```typescript
const clock = new FixedStepClock(1 / 60);

function frame(delta_seconds: number): void {
    clock.advance(delta_seconds, () => {
        game.step(clock.step_seconds);
    });
}
```

- **`advance(delta_seconds, step, keep_seconds = 0)`** runs `step` once per whole step the time now holds. A step that returns anything but `undefined` ends the run (say, with the game's next phase): `advance()` returns that value and drops the time left over, but for at most `keep_seconds`. Keeping half a step after a stop lets the next frame of a step's length run exactly one step.
- **`unused_seconds`** is the time no step has used yet; inside a step, at least `step_seconds` of it means another step is due in this `advance()`. `PhysicsWorld.update()` uses that to stop catching up when steps get costly.
- **`reset()`** forgets the time left over.

## Tween

A value that moves from `from` to `to` over `seconds` of `update()` calls, shaped by an easing. Nothing moves unless the loop says so: a paused game holds its animations, and a test can jump to any moment.

```typescript
const fade = new Tween(0, 1, 0.4, ease_out);

function frame(delta_seconds: number): void {
    fade.update(delta_seconds);
    ctx.globalAlpha = fade.value;
    if (fade.is_done) {
        start_round();
    }
}
```

- **`value`** is exactly `from` before the first step and exactly `to` at the end, however large the last step was. It stays there until **`restart()`**.
- **Easings** are `(t) => number` on 0..1 (`Easing`): `ease_linear` (the default), `ease_in`, `ease_out`, `ease_in_out`, or your own.
- **`is_done`** turns true once the whole time has passed. A negative or empty `update()` does nothing.

## Timers, states and spawns

- **`Timer(duration_seconds, options?)`**: adds up frame deltas and says when a duration has passed; one-shot or `repeat`ing, runs after `start()` (or `autostart`), with `progress`, `remaining`, `completions` and `ping_pong`. **`Cooldown(seconds)`**: `try_use()` succeeds when ready and starts the wait, `update()` runs it down.
- **`StateMachine<S, C>`**: string states with `enter`, `exit` and `update` handlers over one shared context; `update` may return the next state. `current`, `previous`, `seconds_in_state`, `transition(to)`, `on_transition(listener)`.
- **`Spawner<T>`**: timed spawns for a frame loop, pure and seedable; `weighted_pick` picks from weighted entries.

## Sleep

A simple wrapper around `setTimeout` that returns a `Promise`.

```typescript
import { sleep } from "@game.object/ts-game-toolbox";

async function run(): Promise<void> {
    console.log("Waiting...");
    await sleep(1000);
    console.log("Done!");
}
```

## Throttler

Runs an expensive async callback at most once per `delay_ms`, however often it's asked to: a slider that fires on every pointer move, a resize, a search box.

```ts
const maps = new Throttler<[Screws], Terrain>({
    delay_ms: 120,
    callback: async (screws) => make_terrain(screws),
});
maps.run(screws).then((terrain) => show(terrain));
```

- The first call after a rest runs at once (or after `wake_up_ms`).
- Calls that come while it runs, or within `delay_ms` after it ends, wait and share one more run with the last call's arguments, so what was asked for last always happens.
- Every call that shared a run gets the same promise, and so the same result: a caller that counts results should count distinct ones.
- `STRATEGIES.latest` is the default (up to 5.6.0 it was `combine`). `STRATEGIES.combine` hands calls made while a run is going that run's promise and drops their arguments.
- `is_busy` is true while a run is going or one is waiting.

## Asserts

- `assert_never(val: never)`: Used for exhaustive type checking in switch statements.
- `assert_ok(condition, message?)`: Throws when `condition` is falsy; narrows the type after it.
- `throw_expression(message)`: Throws, where an expression is needed (`value ?? throw_expression("missing")`).

## Types

- `Class<T>`: Represents a class constructor.
- `is_undefined`, `is_object`, `is_function`, `is_string`, `is_number`: Type guards.
