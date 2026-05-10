# Ts Game Toolbox - AI Documentation Context

This file provides a consolidated view of the library's documentation, optimized for ingestion by AI agents (LLMs).

## Table of Contents
1. [Overview](#overview)
2. [Assets](#assets)
3. [Geometries](#geometries)
4. [Trees](#trees)
5. [Signals](#signals)
6. [Flow](#flow)
7. [UI](#ui)
8. [Physics](#physics)
9. [Miscellaneous](#miscellaneous)

## Overview
Ts Game Toolbox is a collection of reusable functions and classes for Games or Programs developed in Javascript/Typescript.

---

## Assets
Tools to help with loading, storing, and retrieving various types of assets.

### AssetManager
The `AssetManager` is responsible for loading images and audio files. It tracks progress and stores the loaded elements for easy access.

#### Usage
```typescript
import { AssetManager, Progress } from 'ts-game-toolbox';

const manager = new AssetManager();
const progress = new Progress();

progress.listen((percent) => {
    console.log(`Loading: ${Math.round(percent * 100)}%`);
});

await manager.load({
    images: {
        'hero': '/assets/images/hero.png',
        'background': '/assets/images/bg.jpg'
    },
    audio: {
        'jump': '/assets/audio/jump.mp3',
        'music': '/assets/audio/theme.mp3'
    }
}, progress);

// Accessing assets
const heroImage = manager.images.get('hero').element;
const jumpSound = manager.audio.get('jump').element;
```

#### Methods
- `load(assets: { images?, audio? }, progress: Progress): Promise<void>`: Loads both images and audio.
- `load_images(assets: Record<string, string>, progress: Progress): Promise<void>`: Loads images specifically.
- `load_audio(assets: Record<string, string>, progress: Progress): Promise<void>`: Loads audio specifically.
- `list_pending(): string[]`: Returns a list of paths for assets that are still loading.

---

## Geometries
Contains classes and functions handling Geometric calculations.

The Geometric functions and classes assume a 2D-coordinate system, where:
- `-x` is left
- `+x` is right
- `-y` is top
- `+y` is bottom (Standard screen coordinates)

### Vector2
A 2D vector class with common mathematical operations.

#### Usage
```typescript
import { Vector2 } from 'ts-game-toolbox';

const pos = new Vector2(10, 20);
const dir = new Vector2(1, 0);

pos.add(dir.mul(5)); // pos is now (15, 20)

const distance = pos.len();
const normalized = pos.cpy().normalize();
```

### Rect
Represents a rectangle defined by `top`, `left`, `width`, and `height`.

#### Usage
```typescript
import { Rect } from 'ts-game-toolbox';

const box = new Rect({ top: 0, left: 0, width: 100, height: 100 });
const other = new Rect({ top: 50, left: 50, width: 100, height: 100 });

if (box.intersects(other)) {
    console.log("Collision!");
}

// Other useful methods
const area = box.get_area();
const center = box.center;
box.expand_to({ x: 200, y: 200 });
const corners = box.get_corners(); // [tl, tr, br, bl]
```

#### Methods and Properties
- `intersects(other: RectI): boolean`
- `contains(point: Vector2I): boolean`
- `is_within(outer: RectI): boolean`
- `expand_to(point: Vector2I): this`
- `get_corners(): Vector2I[]`
- `center: Vector2I` (getter and setter)
- `lerp(target: Rect, t: number): this`

### Other Shapes
- **Line**: A line segment defined by two points.
- **Polygon**: A shape defined by a set of points.
- **Ray**: A ray starting from a point in a direction.

---

## Trees
Data structures for spatial partitioning and efficient data access.

### QuadTree
A `QuadTree` is used to partition a 2D space by recursively subdividing it into four quadrants. It is highly efficient for spatial queries like "find all objects in this rectangle".

#### Usage
```typescript
import { QuadTree, Rect } from 'ts-game-toolbox';

// Define a type that extends RectI
interface Entity extends RectI {
    id: string;
}

const tree = new QuadTree<Entity>({ top: 0, left: 0, width: 1000, height: 1000 });

const e1: Entity = { id: '1', top: 10, left: 10, width: 5, height: 5 };
tree.add(e1);

// Querying the tree
const results = tree.pick({ top: 0, left: 0, width: 20, height: 20 });
console.log(results); // [e1]
```

### Collection
A simple wrapper around an array with additional utility methods.

---

## Signals
Helpers to connect distant parts of the programs with events and signals.

### SignalSocket
A `SignalSocket` transmits a specific type of value to all attached listeners.

#### Usage
```typescript
import { SignalSocket } from 'ts-game-toolbox';

const scoreSignal = new SignalSocket<number>();

const handle = scoreSignal.attach((score) => {
    console.log(`New score: ${score}`);
});

scoreSignal.dispatch(100);

scoreSignal.detach(handle);
```

### EventSocket
Similar to `SignalSocket`, but designed for event-based communication.

### ObservableSocket
A socket that can be observed for changes.

### ChainProperty
A property that can be chained and observed. When the value of a `ChainProperty` changes, it can trigger updates in other properties.

#### Usage
```typescript
import { ChainProperty } from 'ts-game-toolbox';

const name = new ChainProperty<string>("John");
name.attach((newName) => {
    console.log(`Name changed to: ${newName}`);
});

name.set("Jane");
```

---

## Flow
Utilities for controlling the flow of the program, including assertions, async helpers, and progress tracking.

### Progress
The `Progress` class is used to track the progress of a long-running operation. It supports nested progress tracking.

#### Usage
```typescript
import { Progress } from 'ts-game-toolbox';

const mainProgress = new Progress(100);
mainProgress.listen((percent) => console.log(`${percent * 100}%`));

const subTask = mainProgress.make_child_progress(50);
// ... do some work ...
subTask.mark_as_done(); 
// mainProgress is now at 50% (assuming it was the only child and current progress was 0)
```

### Sleep
A simple wrapper around `setTimeout` that returns a `Promise`.

#### Usage
```typescript
import { sleep } from 'ts-game-toolbox';

async function run() {
    console.log("Waiting...");
    await sleep(1000);
    console.log("Done!");
}
```

### Throttler
A decorator to throttle function calls.

### Asserts
- `assert_never(val: never)`: Used for exhaustive type checking in switch statements.
- `assert_ok(condition: any, message?: string)`: Basic assertion.

### Types
- `Class<T>`: Represents a class constructor.
- `is_defined<T>(val: T | undefined | null): val is T`: Type guard for defined values.

---

## UI
A simple canvas-based UI system.

### UiManager
The `UiManager` handles event propagation and rendering for a set of UI elements.

#### Usage
```typescript
import { UiManager, Group, Button } from 'ts-game-toolbox';

const ui = new UiManager();
const menu = new Group();

const btn = new Button({ top: 10, left: 10, width: 100, height: 40 });
btn.on_click(() => console.log("Button clicked!"));

menu.add(btn);
ui.active_menu = menu;

// In your event listeners
canvas.addEventListener('mousedown', (e) => {
    ui.pointer_down({ x: e.offsetX, y: e.offsetY });
});

// In your render loop
function draw() {
    ui.draw(ctx);
}
```

### Widgets
The library provides several built-in widgets:
- **Button**: A simple clickable button.
- **CheckBox**: A toggleable checkbox.
- **Slider**: A horizontal slider to select a value.
- **Label**: Displays text.
- **Gallery**: A scrollable or paginated collection of items.
- **ValueLabel**: A label that displays a value from an observable.

### Layout and Groups
Elements can be grouped using the `Group` class, which also acts as a container for hits and drawing.
Each element is defined by its position (`top`, `left`) and size (`width`, `height`).

---

## Physics
*Note: The physics module is currently under development.*

### Sweeping SAT
The library includes an implementation of the Sweeping Separating Axis Theorem (SAT) for collision detection between convex shapes, especially those moving at high velocities.

- **SweepingSatWorld**: A container for physics bodies and the simulation logic.
- **PhysicsBody**: Represents a physical object with a shape and position.

---

## Miscellaneous Utilities
Other helpful tools included in the library.

### Commons
- **Colors**: A collection of common color constants.

### Data
- **RgbColor**: A class to handle RGB colors and conversions.

### DOM
- **CanvasHelper**: Utilities for working with the HTML5 Canvas API.
- **QuerySelector**: Helper for selecting DOM elements with type safety.

### Helpers
- **ID**: Utilities for generating unique IDs.
- **MathHelper**: Additional mathematical functions (e.g., clamping, interpolation).
- **Settings**: A simple settings manager.

### Testing
A custom test suite used for internal testing and available for general use.
- **TestClass**: Base class for tests.
- **TestDashboard**: A UI for viewing test results in the browser.
