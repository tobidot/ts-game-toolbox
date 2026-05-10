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

A decorator to throttle function calls.

## Asserts

- `assert_never(val: never)`: Used for exhaustive type checking in switch statements.
- `assert_ok(condition: any, message?: string)`: Basic assertion.

## Types

- `Class<T>`: Represents a class constructor.
- `is_defined<T>(val: T | undefined | null): val is T`: Type guard for defined values.
