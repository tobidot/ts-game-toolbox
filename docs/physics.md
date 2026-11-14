# Physics

*Note: The physics module is currently under development.*

## Sweeping SAT
`physics/sweeping_sat` is the separating axis test for convex polygons (`PolygonI`, points in world space, either winding; split a concave shape into convex parts). Pure functions like `aabb_*`: the game owns its bodies, steps them and decides what a hit means.

- **`sat_overlap(a, b)`**: the smallest push that moves `a` out of `b`, as bounce's `Contact` (`normal` from `b` towards `a`, `depth`), or `null`. Touching edges don't count.
- **`sat_sweep(mover, delta, wall)`**: when `mover`, moving by `delta`, first touches a still `wall`, as aabb's `Hit` (`time` 0..1, `normal` the wall face's unit normal). Exact for any speed, so nothing tunnels. Already overlapping is a hit at time 0 with the push in `overlap`.
- **`sat_move(mover, delta, walls)`**: moves with sliding like `aabb_move`, at most 3 passes, and returns `{ offset, hits }`: how far the mover went. It stays `SAT_SKIN` (0.01) off what it hit.

```ts
const shape = new Polygon(crate_points).translated(parcel.position);
const moved = sat_move(shape, { x: velocity.x * dt, y: velocity.y * dt }, walls);
parcel.position.x += moved.offset.x;
parcel.position.y += moved.offset.y;
for (const hit of moved.hits) {
    velocity = reflect(velocity, hit.normal, 0.1);
}
```

## The physics world
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

- **Rules.** `AABB` counts every shape as its box and moves first, pushing out after (`aabb_resolve`): a fast body jumps a thin wall. `AABB_SWEEP` uses `aabb_move`, `SAT_SWEEP` uses `sat_overlap` and `sat_move`: nothing tunnels through a still body. A rule answers `overlap(a, b)` and `move(mover, delta, walls)` on a `ShapeAt` (`polygon` and `box` in world space).
- **Bodies.** `shape` is a convex polygon around the body's own origin, `position` puts it. Still bodies (`is_static`) never move. `position` and `velocity` may be written between steps; `polygon` and `box` follow. `data` is the game's.
- **`update(delta_seconds)`** runs the even steps that are due (`FixedStepClock`), at most `max_steps_per_update` (default 4), and a further one only while the steps so far in this update took less than `catch_up_ms` (default 8, half a frame at 60 FPS). The time still due is dropped but for half a step: a device that can't keep up runs the world slower, and its frame rate slides with the cost of one step instead of falling to a quarter once a step costs a frame. `step()` runs one by hand.
- **A step.** Gravity; every moving body moves against the still ones with the rule's `move()`; then `passes` times (default 2), overlapping moving bodies are pushed apart by mass and lose their closing speed (`elastic_impact`), and what got pushed into a wall is pushed back out. Moving bodies don't sweep against each other.
- **Piles.** A body resting on something still is a still floor to the body on top: the upper one takes the whole push and lands on it like on a wall. The world handles pairs lowest first along gravity, so the support climbs a pile in one pass. Contacts closing slower than `bounce_speed` (default 60) don't bounce, or a resting pile would bounce each body off the one below.
- **Broad phase.** `broad_phase: { kind: "grid", cell_size: 64 }` (the default) lays a uniform grid over the moving bodies' boxes anew every step and compares a pair only in the cell where their overlap starts; still bodies stand in a grid of their own until one is added or removed. `{ kind: "none" }` compares every pair, to measure against. Both hand out the same pairs in the same order, so a world plays exactly the same with either; `world.broad_phase` switches between steps. Pick a cell about twice the size of a common body.
- **Layers and masks.** A body is on `layer` (bits, default 1) and meets the layers in its `mask` (default `ALL_LAYERS`). Two bodies meet when each one's layer is in the other's mask; pairs that don't are never tested, so bullets (`layer: BULLETS, mask: WALLS | ZOMBIES`) cost nothing against each other. A still body's walls are filtered the same way.
- **Events.** `ContactEvent`s go out after the step, never during it, so a listener may remove bodies. Contacts closing slower than `contact_event_speed` send none.
- **Stats.** `world.stats`: `bodies`, `pairs_tested`, `contacts`, `step_ms` and `steps`, for the last step and update.
- **No spin.** A crate that lands flat on a corner stays balanced there. Step 26 (Paketrutsche) tips such a body off by hand; the world leaves that to the game until bodies can turn.
