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
Several kinds of event through one socket. An event is a class with a static `EVENT_NAME`; a listener attaches to a class and gets only its events. For things that happen, once each: a sale, a click (every UI widget has one as `events`).

```typescript
class SaleEvent extends EventBase {
    public static readonly EVENT_NAME = 'market.sale';
    public constructor(public readonly amount: number) {
        super(SaleEvent.EVENT_NAME);
    }
}

const market = new EventSocket<SaleEvent | MissEvent>();
market.attach(SaleEvent, (event) => play_sound('coin'));
market.dispatch(new SaleEvent(3));
market.detach(SaleEvent); // or by the handle attach() returned
```

### ObservableSocket
A value that tells its listeners when it changes, with `{ old, new }`. For state that several widgets show: cash, a price, a stock.

```typescript
const cash = new ObservableSocket(20);
cash.watch((change) => (cash_label.value = `${change.new} €`)); // at once, then on every change
cash.attach((change) => (buy_button.is_disabled = change.new < 9));
cash.set(cash.get() - 9);
```

- Listeners already read the new value from `get()`.
- Setting the same value (`Object.is`) tells nobody.
- `watch()` attaches and calls at once with the current value.

Handles are never reused, not even after `detach_all()`.

### ChainProperty
A property whose `set()` returns its owner, so settings can be chained. It doesn't tell anyone about changes.

#### Usage
```typescript
class Zoo {
    public foo = new ChainProperty<Zoo, number>(this, 0);
    public bar = new ChainProperty<Zoo, string>(this, 'hello');
}
new Zoo().foo.set(5).bar.set('hey');
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
`new Throttler<ARGS, RESULT>({ delay_ms, callback: async (...args) => result })`, then `run(...args)`: at most one run per `delay_ms`. Calls while it runs or waits share one more run with the last arguments and get the same promise. `STRATEGIES.latest` (default) or `combine`; `is_busy`.

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
`physics/sweeping_sat` is the separating axis test for convex polygons (`PolygonI`, points in world space, either winding; split a concave shape into convex parts). Pure functions like `aabb_*`: the game owns its bodies, steps them and decides what a hit means.

- **`sat_overlap(a, b)`**: the smallest push that moves `a` out of `b`, as bounce's `Contact` (`normal` from `b` towards `a`, `depth`), or `null`. Touching edges don't count.
- **`sat_sweep(mover, delta, wall)`**: when `mover`, moving by `delta`, first touches a still `wall`, as aabb's `Hit` (`time` 0..1, `normal` the wall face's unit normal). Exact for any speed, so nothing tunnels. Already overlapping is a hit at time 0 with the push in `overlap`.
- **`sat_move(mover, delta, walls)`**: moves with sliding like `aabb_move`, at most 3 passes, and returns `{ offset, hits }`: how far the mover went. It stays `SAT_SKIN` (0.01) off what it hit.
- **Prepared shapes.** Each call above works out the edge normals of both shapes. A shape that never turns keeps them: `sat_shape(polygon)` gives `{ polygon, axes }` (`sat_axes`, each edge direction once, so a box has 2), and `sat_overlap_shapes`, `sat_sweep_shapes` and `sat_move_shapes` take that form. `PhysicsBody` keeps its `axes`, and `SAT_SWEEP` uses them. `sat_overlap_shapes(a, b, out)` writes the contact into `out`, so a hot loop allocates nothing.

```ts
const shape = new Polygon(crate_points).translated(parcel.position);
const moved = sat_move(shape, { x: velocity.x * dt, y: velocity.y * dt }, walls);
parcel.position.x += moved.offset.x;
parcel.position.y += moved.offset.y;
for (const hit of moved.hits) {
    velocity = reflect(velocity, hit.normal, 0.1);
}
```

### The physics world
`physics/world` is a world the library owns: `PhysicsWorld` keeps the bodies, moves them in even steps, finds the pairs that touch and turns contacts into speeds. A `CollisionRule` says how two shapes meet; bodies translate and never turn.

```ts
const world = new PhysicsWorld<Crate>({
    rule: SAT_SWEEP, // or AABB, AABB_SWEEP, or a game's own CollisionRule
    gravity: { x: 0, y: 900 },
    restitution: 0.2,
    friction: 0.1,
});
world.add({ shape: floor_points, position: { x: 400, y: 620 }, is_static: true });
const body = world.add({ shape: crate_points, position, velocity, mass: 2, data: crate });
world.update(delta_seconds); // the even steps that are due
world.events.attach(ContactEvent, (event) => { /* event.a, event.b, event.normal, event.speed */ });
world.remove(body);
```

- **Rules.** `AABB` counts every shape as its box and moves first, pushing out after (`aabb_resolve`): a fast body jumps a thin wall. `AABB_SWEEP` uses `aabb_move`, `SAT_SWEEP` uses `sat_overlap` and `sat_move`: nothing tunnels through a still body. A rule answers `overlap(a, b)` and `move(mover, delta, walls)` on a `ShapeAt` (`polygon` and `box` in world space, and the edge normals in `axes`).
- **Bodies.** `shape` is a convex polygon around the body's own origin, `position` puts it. Still bodies (`is_static`) never move. `position` and `velocity` may be written between steps; `polygon` and `box` follow. `data` is the game's.
- **`update(delta_seconds)`** runs the even steps that are due (`FixedStepClock`), at most `max_steps_per_update` (default 4), and a further one only while the steps so far in this update took less than `catch_up_ms` (default 8, half a frame at 60 FPS). The time still due is dropped but for half a step: a device that can't keep up runs the world slower, and its frame rate slides with the cost of one step instead of falling to a quarter once a step costs a frame. `step()` runs one by hand.
- **A step.** Gravity; every moving body moves against the still ones with the rule's `move()`; then `passes` times (default 2), overlapping moving bodies are pushed apart by mass and lose their closing speed (`elastic_impact`), and what got pushed into a wall is pushed back out. Moving bodies don't sweep against each other.
- **Piles.** A body resting on something still is a still floor to the body on top: the upper one takes the whole push and lands on it like on a wall. The world handles pairs lowest first along gravity, so the support climbs a pile in one pass. A contact holds up when its normal is at most 60 degrees off straight up (`holds_up(normal, down)`); a face of exactly 60 degrees, as on triangles and hexagons, carries however its normal was rounded. Contacts closing slower than `bounce_speed` (default 60) don't bounce, or a resting pile would bounce each body off the one below.
- **Broad phase.** `broad_phase: { kind: "grid", cell_size: 64 }` (the default) lays a uniform grid over the moving bodies' boxes anew every step and compares a pair only in the cell where their overlap starts; still bodies stand in a grid of their own until one is added or removed. `{ kind: "none" }` compares every pair, to measure against. Both hand out the same pairs in the same order, so a world plays exactly the same with either; `world.broad_phase` switches between steps. Pick a cell about twice the size of a common body.
- **Layers and masks.** A body is on `layer` (bits, default 1) and meets the layers in its `mask` (default `ALL_LAYERS`). Two bodies meet when each one's layer is in the other's mask; pairs that don't are never tested, so bullets (`layer: BULLETS, mask: WALLS | ZOMBIES`) cost nothing against each other. A still body's walls are filtered the same way.
- **Events.** `ContactEvent`s go out after the step, never during it, so a listener may remove bodies. Contacts closing slower than `contact_event_speed` send none.
- **Contacts are lent.** A rule's `overlap()` may hand out the same contact object on every call, written anew: read it before asking again. A step allocates nothing per pair.
- **Stats.** `world.stats`: `bodies`, `pairs_tested`, `contacts`, `step_ms` and `steps`, for the last step and update.
- **No spin.** A crate that lands flat on a corner stays balanced there. Step 26 (Paketrutsche) tips such a body off by hand; the world leaves that to the game until bodies can turn.

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
