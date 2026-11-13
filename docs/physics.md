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
