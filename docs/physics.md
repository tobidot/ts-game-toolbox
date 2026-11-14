# Physics

Collision and motion for 2D games, y down. Most of it is pure functions over the toolbox's shapes: the game owns its bodies, steps them and decides what a hit means. `PhysicsWorld` is the one part that owns bodies itself.

- **`physics/aabb`**: boxes (`RectI`), overlapping now or swept along a move.
- **`physics/sweeping_sat`**: the same for convex polygons, by the separating axis test.
- **`physics/bounce`**: contacts of circles and boxes, and the speeds after a hit.
- **`physics/kinematics`**: motion under constant acceleration: a step, or a projectile's arc in closed form.
- **`physics/steering`**: walking to a point and standing in a crowd.
- **`physics/world`**: `PhysicsWorld`, bodies the library moves in even steps.

> **Since 6.0.0** `SweepingSatWorld` and the old `PhysicsBody` of `physics/sweeping_sat` are gone. Use `PhysicsWorld` with `rule: SAT_SWEEP` for bodies the library should own, or `sat_move` for a game that owns its bodies. `PhysicsBody` is now the body of a `PhysicsWorld`, made by `world.add()`.

## Boxes (AABB)

`physics/aabb` works on `RectI` (`left, top, width, height`). The static tests look at where two boxes are now; the swept ones look at the whole path of a move, so a fast box can't tunnel through a thin wall between two frames.

- **`aabb_overlaps(a, b)`**: whether two boxes overlap. Touching edges don't count.
- **`aabb_resolve(mover, wall)`**: the smallest push that moves `mover` out of `wall`, along x or y (the other is 0), towards the side the mover's center is on; `null` when apart.
- **`aabb_sweep(mover, delta, wall)`**: a `Hit` when `mover`, moving by `delta`, meets `wall`, or `null`. `time` is 0..1 of the move, `normal` the wall's face as a unit vector pointing away from it (`(0, -1)` is the top of a floor), `overlap` the push when the boxes already overlapped at the start (then `time` is 0).
- **`aabb_move(mover, delta, walls)`**: moves with sliding: the move stops at the first wall hit, the part of `delta` into that wall is dropped and the rest goes on, at most once per axis. Returns `{ rect, hits }`: the new box (`mover` isn't changed) and the hits in order. Each hit is a `WallHit`, a `Hit` with `wall`, the index of the wall in `walls`.
- **`aabb_union(boxes)`**: the box around several boxes.

```ts
const moved = aabb_move(player.box, { x: velocity.x * dt, y: velocity.y * dt }, walls);
player.box = moved.rect;
for (const hit of moved.hits) {
    if (hit.normal.y < 0) {
        player.is_on_ground = true;
    }
    if (walls[hit.wall] === goal) {
        win();
    }
}
```

## Sweeping SAT

`physics/sweeping_sat` is the separating axis test for convex polygons (`PolygonI`, points in world space, either winding; split a concave shape into convex parts). Pure functions like `aabb_*`.

- **`sat_overlap(a, b)`**: the smallest push that moves `a` out of `b`, as bounce's `Contact` (`normal` from `b` towards `a`, `depth`), or `null`. Touching edges don't count.
- **`sat_sweep(mover, delta, wall)`**: when `mover`, moving by `delta`, first touches a still `wall`, as aabb's `Hit` (`time` 0..1, `normal` the wall face's unit normal). Exact for any speed, so nothing tunnels. Already overlapping is a hit at time 0 with the push in `overlap`.
- **`sat_move(mover, delta, walls)`**: moves with sliding like `aabb_move`, at most 3 passes, and returns `{ offset, hits }`: how far the mover went, and the `WallHit`s in order, each with its `wall` index. A mover that starts inside a wall is pushed out first. It stays `SAT_SKIN` (0.01) off what it hit.
- **Prepared shapes.** Each call above works out the edge normals of both shapes. A shape that never turns keeps them: `sat_shape(polygon)` gives a `SatShape`, `{ polygon, axes }` (`sat_axes`, each edge direction once, so a box has 2), and `sat_overlap_shapes`, `sat_sweep_shapes` and `sat_move_shapes` take that form. A world's `PhysicsBody` keeps its `axes`, and `SAT_SWEEP` uses them. `sat_overlap_shapes(a, b, out)` writes the contact into `out`, so a hot loop allocates nothing.

```ts
const shape = new Polygon(crate_points).translated(parcel.position);
const moved = sat_move(shape, { x: velocity.x * dt, y: velocity.y * dt }, walls);
parcel.position.x += moved.offset.x;
parcel.position.y += moved.offset.y;
for (const hit of moved.hits) {
    velocity = reflect(velocity, hit.normal, 0.1);
}
```

## Bounce

`physics/bounce` finds where two shapes touch and turns that into new velocities. `aabb_*` stops a box and slides it along; this sends a body back. Moving the bodies apart is left to the caller: it has the `depth`, and only it knows which bodies may move.

- **`Contact`**: `normal`, a unit vector, and `depth`, how far the shapes overlap along it.
- **`circle_contact(a, b)`**: two `Circle`s (`x`, `y`, `radius`); the normal points from `b` to `a`. `null` when apart; touching counts as apart. Two circles on the same spot get the normal `(1, 0)`.
- **`circle_rect_contact(circle, rect)`**: a circle against a box, by the box's closest point; the normal points from the box to the circle, so a corner gives a diagonal one. A circle whose center is inside leaves through the nearest edge.
- **`reflect(velocity, normal, restitution = 1)`**: the velocity after hitting something that doesn't move. `restitution` is the share of the speed along the normal that comes back: 1 bounces perfectly, 0 stops along the normal and keeps sliding. Unchanged when already moving away.
- **`elastic_impact(a, b, normal, restitution = 1)`**: two `Impactor`s (`velocity`, `mass`; `Infinity` for something that can't be moved) collide along `normal` (from `b` to `a`); returns `{ a, b }`, the new velocities, with momentum kept. Bodies already moving apart are unchanged.

```ts
const contact = circle_contact(ball, other);
if (contact !== null) {
    ball.x += contact.normal.x * contact.depth;
    ball.y += contact.normal.y * contact.depth;
    const after = elastic_impact(
        { velocity: ball.velocity, mass: 1 },
        { velocity: other.velocity, mass: 3 },
        contact.normal,
        0.9,
    );
    ball.velocity = after.a;
    other.velocity = after.b;
}
```

## Kinematics

`physics/kinematics` is motion under constant acceleration in `Vector2`. Gravity is a positive number (y down), so "up" is a negative `y` velocity.

- **`integrate(state, acceleration, delta_seconds)`**: one step of semi-implicit Euler on a `KinematicState` (`position`, `velocity`, both `Vector2`, both changed): the velocity takes the acceleration first, then the position moves with the new velocity.
- **`projectile_position(origin, velocity, gravity, t)`**: where a projectile is after `t` seconds, in closed form.
- **`flight_time(origin, velocity, gravity, ground_y)`**: the time until it comes down to `ground_y`; 0 when it never does.
- **`range(...)`** (same arguments): the horizontal distance until then, negative when flying left.
- **`apex(origin, velocity, gravity)`**: the highest point of the arc; the origin when it never rises.
- **`launch_velocity(speed, angle)`**: a velocity from a speed and an angle in radians, 0 right and positive up.

```ts
const velocity = launch_velocity(600, Math.PI / 4);
const landing_x = start.x + range(start, velocity, 900, ground_y); // a landing marker
const state = { position: new Vector2(start), velocity };
integrate(state, { x: 0, y: 900 }, delta_seconds); // every frame
```

## Steering

`physics/steering` walks things to a point and keeps a crowd from standing on one spot. Call both once per step, the moves first; the same `delta_seconds` every step (see `FixedStepClock`) keeps a crowd steady.

- **`steer_towards(body, target, delta_seconds, options)`**: moves `body` (its `x` and `y`) towards `target` at `options.speed`, never past the point `stop_distance` before it, and returns whether it is there. On the last `slow_distance` it slows down, to at least a tenth of its speed, so it still arrives.
- **`seek_velocity(body, target, options, out?)`**: the same walk as a velocity, for a body a `PhysicsWorld` moves and keeps apart from the others. Zero within `stop_distance`. Written into `out` and returned, so a crowd of thousands passes one vector.
- **`separate_bodies(bodies, delta_seconds, stiffness = 6)`**: pushes overlapping circles (`SeparatedBody`: `x`, `y`, `radius`, `is_fixed` for a building) apart, `stiffness * delta_seconds` of each overlap per step. All pushes are added up first, so the order of the list doesn't matter. Two bodies on the same spot part in a direction that follows from their places in the list: no random numbers, a replay stays the same. Compares every pair: fine for a few hundred bodies.
- **A crowd needs room.** Several bodies that share a target and are kept apart can't all reach its middle: give them a `stop_distance` of at least the room they take, or the ones in the crowd never arrive.

```ts
for (const unit of units) {
    unit.is_there = steer_towards(unit, unit.target, step_seconds, {
        speed: 80,
        stop_distance: unit.radius + target_radius,
        slow_distance: 20,
    });
}
separate_bodies(units, step_seconds);
```

## The physics world

`physics/world` is a world the library owns: `PhysicsWorld` keeps the bodies, moves them in even steps, finds the pairs that touch and turns contacts into speeds. A `CollisionRule` says how two shapes meet; bodies translate and never turn.

```ts
const world = new PhysicsWorld<Crate>({
    rule: SAT_SWEEP, // the default; or AABB, AABB_SWEEP, or a game's own CollisionRule
    gravity: { x: 0, y: 900 },
    restitution: 0.2,
    friction: 0.1,
});
world.add({ shape: floor_shape, position: { x: 400, y: 620 }, is_static: true });
const body = world.add({ shape: crate_shape, position, velocity, mass: 2, data: crate });
world.events.attach(ContactEvent, (event) => {
    // event.a, event.b, event.normal, event.speed
});
world.update(delta_seconds); // the even steps that are due
world.remove(body);
```

- **Rules.** `AABB` counts every shape as its box and moves first, pushing out after (`aabb_resolve`): a fast body jumps a thin wall. `AABB_SWEEP` uses `aabb_move`, `SAT_SWEEP` (the default) uses `sat_overlap` and `sat_move`: nothing tunnels through a still body. `COLLISION_RULES` lists the three, cheapest first; each has a `name` (`"aabb"`, `"aabb_sweep"`, `"sat_sweep"`) and `is_swept`. A rule answers `overlap(a, b)` and `move(mover, delta, walls)` on a `ShapeAt` (`polygon` and `box` in world space, and the edge normals in `axes`). `world.rule` may be switched between steps.
- **Bodies.** `world.add(options)` takes `BodyOptions` and returns a `PhysicsBody`. `shape` is a convex polygon (`{ points }`, at least 3) around the body's own origin, `position` puts it. Still bodies (`is_static`) never move. `mass` defaults to 1 (`Infinity` when still); only the ratio between two bodies matters. `position` and `velocity` may be written between steps; `polygon` and `box` follow. `data` is the game's. `world.bodies` lists them in the order they were added.
- **`update(delta_seconds)`** runs the even steps that are due (`FixedStepClock`, `step_seconds` default 1/60), at most `max_steps_per_update` (default 4), and a further one only while the steps so far in this update took less than `catch_up_ms` (default 8, half a frame at 60 FPS). The time still due is dropped but for half a step: a device that can't keep up runs the world slower, and its frame rate slides with the cost of one step instead of falling to a quarter once a step costs a frame. `step()` runs one by hand.
- **A step.** Gravity; every moving body moves against the still ones with the rule's `move()`; then `passes` times (default 2), overlapping moving bodies are pushed apart by mass and lose their closing speed (`elastic_impact` with `restitution`, default 0), and what got pushed into a wall is pushed back out. `friction` (default 0) is the share of the speed a contact takes along its normal that sliding loses too. Moving bodies don't sweep against each other, so two fast ones can pass through each other.
- **Piles.** A body resting on something still is a still floor to the body on top: the upper one takes the whole push and lands on it like on a wall. The world handles pairs lowest first along gravity, so the support climbs a pile in one pass. A contact holds up when its normal is at most 60 degrees off straight up (`holds_up(normal, down)`); a face of exactly 60 degrees, as on triangles and hexagons, carries however its normal was rounded. Contacts closing slower than `bounce_speed` (default 60) don't bounce, or a resting pile would bounce each body off the one below.
- **Broad phase.** `broad_phase: { kind: "grid", cell_size: 64 }` (the default) lays a uniform grid over the moving bodies' boxes anew every step and compares a pair only in the cell where their overlap starts; still bodies stand in a grid of their own until one is added or removed. `{ kind: "none" }` compares every pair, to measure against. Both hand out the same pairs in the same order, so a world plays exactly the same with either; `world.broad_phase` switches between steps. Pick a cell about the size of a common body; the size hardly matters (step 27: cells of 16 to 48 within 5 % of each other).
- **Layers and masks.** A body is on `layer` (bits, default 1) and meets the layers in its `mask` (default `ALL_LAYERS`). Two bodies meet when each one's layer is in the other's mask (`body.meets(other)`); pairs that don't are never tested, so bullets (`layer: BULLETS, mask: WALLS | ZOMBIES`) cost nothing against each other. A still body's walls are filtered the same way.
- **Sleeping.** A body that has stayed within `sleep_distance` (default 0.5 units) of one spot for `sleep_seconds` (default 0.5; `Infinity` never) falls asleep (`body.is_sleeping`): the world stops moving it, doesn't test two sleepers against each other, and an awake body that touches a sleeper is pushed off it as off a wall. A body pushed deeper than twice `sleep_distance` in a step is wedged, not resting: it stays awake, and a sleeper it is pushed into wakes and gives way, so no overlap is frozen in. A settled heap costs next to nothing. A sleeper wakes when a neighbour moved more than a fifth of `sleep_distance` in its last step (a falling body does at once, a jittering one doesn't), when a body or wall it touches is removed, when the game gives it a speed or moves it, when gravity changes, and on `body.wake()`. Waking spreads a step at a time, only as far as things move: take out the bottom of a column and the column falls, a layer a step later. `stats.sleeping` counts them.
- **Events.** `ContactEvent`s go out after the step, never during it, so a listener may remove bodies. `a` always moves, `b` moves or is still; `normal` points from `b` towards `a`, `speed` is how fast they closed. Contacts closing slower than `contact_event_speed` (default 0) send none, and so do contacts where neither body is on `contact_event_layers` (default `ALL_LAYERS`): a crowd of thousands pushing itself apart makes as many contacts a step, and an event each costs time and garbage (step 29: 17,000 events a step at 5,000 zombies; filtered, 10.8 → 9.0 ms a step and 12.3 → 9.6 ms a frame).
- **Contacts are lent.** A rule's `overlap()` may hand out the same contact object on every call, written anew: read it before asking again. A step allocates nothing per pair.
- **Stats.** `world.stats`: `bodies`, `pairs_tested`, `contacts`, `step_ms`, `sleeping` and `steps`, for the last step and update.
- **No spin.** A crate that lands flat on a corner stays balanced there. Step 26 (Paketrutsche) tips such a body off by hand; the world leaves that to the game until bodies can turn.
