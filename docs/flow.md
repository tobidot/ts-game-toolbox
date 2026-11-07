# Flow

Utilities for controlling the flow of the program, including assertions, async helpers, and progress tracking.

## Progress

The `Progress` class is used to track the progress of a long-running operation. It supports nested progress tracking.

### Usage

```typescript
import { Progress } from 'ts-game-toolbox';

const mainProgress = new Progress(100);
mainProgress.listen((percent) => console.log(`${percent * 100}%`));

const subTask = mainProgress.make_child_progress(50);
// ... do some work ...
subTask.mark_as_done(); 
// mainProgress is now at 50% (assuming it was the only child and current progress was 0)
```

## Sleep

A simple wrapper around `setTimeout` that returns a `Promise`.

### Usage

```typescript
import { sleep } from 'ts-game-toolbox';

async function run() {
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
- `STRATEGIES.latest` is the default. `STRATEGIES.combine` hands calls made while a run is going that run's promise and drops their arguments.
- `is_busy` is true while a run is going or one is waiting.

## Asserts

- `assert_never(val: never)`: Used for exhaustive type checking in switch statements.
- `assert_ok(condition: any, message?: string)`: Basic assertion.

## Types

- `Class<T>`: Represents a class constructor.
- `is_defined<T>(val: T | undefined | null): val is T`: Type guard for defined values.
