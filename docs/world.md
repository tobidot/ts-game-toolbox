# World

Grids a game is played on, and the ways across them. Everything here works on `Grid2D`, so on a `TileMap` layer as well (a `TileLayer` is a `Grid2D`).

- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid, and the arithmetic between tile positions and world coordinates (`world_to_tile`, `tile_to_world`, `tiles_in`, `rects_where`, `from_ascii`).
- **`world/pathfinding`**: the cheapest way from one cell to another (`find_path`), from every cell to the nearest of some targets (`flow_field`), and fewer corners on the way (`smooth_path`). Since 6.1.0.

## Pathfinding

Functions, like the physics functions: the game owns its walkers, asks for a way and walks it. There is no pathfinding "world" that keeps walkers.

The one thing a game must say is which cells can be walked. Everything else has a default:

```ts
interface GridPathOptions<T> {
    passable: (value: T, x: number, y: number) => boolean;
    cost?: (value: T, x: number, y: number) => number;   // stepping onto the cell; default 1
    diagonal?: boolean;                                   // eight neighbours; default false (four)
}
```

- **Costs** are what stepping onto a cell costs. A value below 1 counts as 1, so the distance estimate never guesses too high and the path stays the cheapest. A diagonal step costs √2 times the cell's cost.
- **Diagonals never cut a corner.** A diagonal step needs both cells beside it open, not only one: a walker has a body, and squeezing past the corner of a wall would put it half inside.

### One walker, one goal: `find_path`

```ts
find_path(grid, from, to, { passable, cost?, diagonal?, max_steps? }): GridPosition[] | null
```

A* with a binary heap; the estimate is the Manhattan distance, or the octile one with `diagonal`. The answer is the list of cells from `from` to `to`, both included, or `null` when there is no way, the goal is blocked or either cell lies outside. A path to the cell itself is that one cell.

- The start cell is never tested: a walker standing on a cell that was just closed still finds its way out.
- `max_steps`: how many cells to look at before giving up with `null` (default: no limit), for a map so large that a far goal shouldn't cost a frame.

### Many walkers, one place: `flow_field`

```ts
const field = flow_field(grid, targets, { passable, cost?, diagonal? });
field.next_cell(x, y);      // the cell to step to, or null on a target and without a way
field.direction_at(x, y);   // the same as a step: each part -1, 0 or 1
field.distance_at(x, y);    // what the cheapest way costs; 0 on a target, Infinity without one
field.is_reachable(x, y);
field.is_target(x, y);
field.reached;              // how many cells have a way
```

One Dijkstra pass outwards from all targets at once: every open cell learns the cheapest way to the nearest target. A hundred walkers going to the same place then cost one pass in all, not a search each. The distances are the costs `find_path` adds up, so the two always agree. Targets that are blocked or outside are skipped. The field doesn't follow later changes of the grid: build a new one when a cell opens or closes.

### Fewer corners: `smooth_path` and `has_line_of_sight`

A path of cells zigzags. `smooth_path(grid, path, passable)` keeps the first and the last cell and, from each kept cell, skips ahead while the cell after the next one is still in straight sight; every leg of the result is a straight line over open cells. The path given is not changed.

`has_line_of_sight(grid, a, b, passable)` walks the grid from the middle of `a` to the middle of `b`, every cell the line touches; where it passes exactly through a corner, both cells beside it must be open, as for a diagonal step. Measured against a test of the line against each blocked cell's box (`Rect.touches_segment`), the walk is about 3.5 times faster (0.22–0.25 µs against 0.80–0.89 µs per line on a 48 by 30 grid) and gives the same answers.

### Which one

From step 31 (Ameisenbau), on a nest of 32 by 24 cells, Node 22:

| Nest | Open cells | One flow field | One A* path | Field cheaper from |
| --- | --- | --- | --- | --- |
| The start nest (long tunnels) | 137 | 26–27 µs | 8.4–9.1 µs | 3–4 walkers |
| Every cell dug open | 763 | 144–178 µs | 10.9–11.1 µs | 14–17 walkers |

A* is cheap where the estimate leads it straight to the goal; a flow field pays for every open cell, wanted or not. A handful of walkers with goals of their own want A*; a crowd going to one place wants a field. Rebuilding two fields and a path per walker on the way after the player digs: 65 µs on the start nest, 0.33 ms with everything open.

```ts
const WALKING = { passable: (kind: Cell) => kind === "tunnel", diagonal: true };

// After every dig: one field for all carriers ...
to_store = flow_field(nest, store_cells, WALKING);
// ... and one path per nurse.
const path = find_path(nest, nurse_cell, nursery_cell, WALKING);
nurse.path = path === null ? null : smooth_path(nest, path, WALKING.passable);

// Each frame, per carrier:
const next = to_store.next_cell(cell.x, cell.y);
if (next === null && !to_store.is_target(cell.x, cell.y)) {
    carrier.is_stuck = true; // no way: wait for the next dig
}
```

- **Walk to the middle of the next cell.** A walker heading for the middle of a neighbour stays inside the open cells (a diagonal neighbour has both side cells open). A walker that is off the middle of its own cell walks to that middle first before the first leg of a smoothed path, or the leg's line of sight doesn't hold for it.
- **A walker as wide as a cell** brushes the earth along a smoothed leg; the line test is for the middle line only.
