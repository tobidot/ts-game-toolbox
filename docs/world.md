# World

Grids a game is played on, and the ways across them. Everything here works on `Grid2D`, so on a `TileMap` layer as well (a `TileLayer` is a `Grid2D`).

- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid, and the arithmetic between tile positions and world coordinates (`world_to_tile`, `tile_to_world`, `tiles_in`, `rects_where`, `from_ascii`).
- **`world/pathfinding`**: the cheapest way from one cell to another (`find_path`), from every cell to the nearest of some targets (`flow_field`), and fewer corners on the way (`smooth_path`). Since 6.1.0.
- **`world/visibility`**: what can be seen from where (`field_of_view`, symmetric shadowcasting), a `FogOfWar` with unseen, seen and visible cells for many viewers, and `draw_fog`. Since 6.2.0.

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

## Visibility

What can be seen from where, on any `Grid2D`: one viewer's field of view as a function, and a fog of war that remembers. Since 6.2.0 (`world/visibility`), first used by Spielwerk step 36, Laterne. `has_line_of_sight` (pathfinding) answers one pair of cells; this answers a whole view at once.

The one thing a game must say is which cells stop sight:

```ts
interface FieldOfViewOptions<T> {
    blocks_sight: (value: T, x: number, y: number) => boolean;
    shape?: "round" | "square";   // default "round": dx² + dy² ≤ r² + r, a disc of radius r + ½
}
```

### One view: `field_of_view`

```ts
field_of_view(grid, origin, radius, { blocks_sight }): GridPosition[]       // each visible cell once, the origin first
visit_field_of_view(grid, origin, radius, options, (x, y) => ...): number   // no list: a callback, returns the count
in_sight_radius(dx, dy, radius, shape?): boolean
```

Symmetric shadowcasting after Albert Ford: four quadrants of 90° (each two octants), scanned row by row away from the viewer; a row's light is a range of slopes, cut where a blocking cell stands. Slopes are whole-number fractions, so ties come out the same from both ends.

- **Symmetric.** An open cell B is seen from an open cell A exactly when A is seen from B (a test checks every pair on twelve random maps). A scout who sees an enemy is seen by it.
- **Walls are seen, not what is behind them.** A blocking cell shows whenever light reaches any part of it, so a room's walls and corners and a long corridor's walls all show; nothing behind a solid wall does.
- **No squeezing through corners.** Light never passes between two blocking cells that touch only at a corner (a diagonal line of walls is a wall, from either side). This is one rule added to Ford's scan: an open cell whose only way in is between two such cells counts as blocked.
- **What "seen" means.** The line from the viewer's middle to the cell's middle, sampled at each row's middle along its longer axis, lies in open cells (or exactly on the border of one). This is a little more generous than a line that may not touch any wall at all: a line may graze a wall's corner by up to half a cell between two row middles.
- Outside the grid counts as blocking; from outside the grid nothing is seen. Radius 0 sees the cell itself.

### Many viewers that remember: `FogOfWar`

```ts
const fog = new FogOfWar(grid, { blocks_sight });
fog.update([{ id: 1, x: 10, y: 4, radius: 8 }, ...]);   // FogChanges { recomputed, seen, shown, hidden }
fog.state_at(x, y);          // "unseen" | "seen" | "visible"
fog.is_visible(x, y); fog.is_seen(x, y); fog.viewers_at(x, y);
fog.seen_count; fog.visible_count; fog.version;
fog.events.attach(FogSeenEvent, (event) => event.cells);  // cells seen for the first time, one event per update
fog.changed(x, y);           // a door opened: the next update casts the views that could reach it
fog.reveal_all(); fog.forget(); fog.copy_states(bytes);
```

- **Incremental.** A count per cell says how many viewers see it. `update(viewers)` casts the view again only for viewers that are new, moved to another cell, changed their radius, or stand within their radius of a cell reported `changed`; it takes back the view of viewers no longer listed. A unit standing still costs nothing. Viewers are matched by `id`, or by their place in the list when they have none (give all an id or none). Positions are cut to whole cells, so a unit's position in cells will do.
- **Events for treasure.** `FogSeenEvent.cells` lists the cells seen for the first time in that update: where a game makes a treasure, an enemy base or a tile appear. Walking back over known ground tells nothing.
- **Remembers.** A cell once seen stays `"seen"` when no one sees it any more; `forget()` keeps only what is visible now (a new round), `reveal_all()` marks everything seen.
- The fog asks `blocks_sight` once per cell and keeps the answer; `changed(x, y)` asks again.

### Drawing it: `draw_fog`

```ts
draw_fog(context, fog, cell_size, { unseen_color: "#111111", seen_alpha: 0.6, soft: false, grey_seen: false, x: 0, y: 0 });
```

One picture of one pixel per cell, kept with the fog and made again only when `fog.version` changed, scaled onto the grid with one `drawImage`. Unseen cells get `unseen_color`, cells seen before get it at `seen_alpha`, visible cells stay clear. `soft` scales the picture smoothly, so the fog fades over one cell. `grey_seen` drains the color from cells seen before (a second picture drawn with the blend mode `saturation`), so only what is seen now is in color. Draw it after the map and before what should stay on top. `fog_pixels(fog, rgba, options)` gives the same pixels for a texture of one's own.

### What it costs

Measured in Spielwerk step 36 (`src/game/Measure.ts`, the browser check calls it through the bundle), Intel i7-11700F, Node 22 and Playwright's headless Chromium. A 200 × 200 map with 12 % of the cells scattered rock (or none), views from 400 places; the fog updates are the best and middle of 12, with every viewer moved one cell (so every view is cast again; standing still is free). Chromium's clock counts in 0.1 ms steps, so its fog numbers are the mean of the batch.

| One view | Cells seen | Node 22 | Chromium |
| --- | --- | --- | --- |
| radius 8, 12 % rock | 141 | 9–11 µs (13 000–16 000 cells/ms) | 9–10 µs (14 000–16 000 cells/ms) |
| radius 16, 12 % rock | 321 | 21–25 µs | 21–23 µs |
| radius 8, open | 225 | 10–12 µs (19 000–22 000 cells/ms) | 10–11 µs |
| radius 16, open | 861 | 35–42 µs (20 000–24 000 cells/ms) | 35–38 µs |

| Fog update, 200 × 200, all moved | Node 22 | Chromium |
| --- | --- | --- |
| 10 viewers, radius 8 | 0.23–0.26 ms | 0.12–0.2 ms |
| 100 viewers, radius 8 | 1.4–2.2 ms | 1.1 ms |
| 10 viewers, radius 16 | 0.3–0.5 ms | 0.3–0.4 ms |
| 100 viewers, radius 16 | 2.7–3.0 ms | 2.4–2.6 ms |

A hundred units all moving at once fit in a frame many times over; units step into a new cell only now and then, so a real-time strategy game pays a fraction of that. Step 36's own fog (three scouts, radius 6, a 48 × 36 cave): 0.013–0.02 ms per update.

```ts
// A real-time strategy game: units in world units, cells of 32.
const fog = new FogOfWar(map, { blocks_sight: (tile) => tile.is_wall });
fog.events.attach(FogSeenEvent, (event) => reveal_treasures(event.cells));
// Each frame:
fog.update(units.map((unit) => ({ id: unit.id, x: unit.x / 32, y: unit.y / 32, radius: unit.sight })));
draw_fog(context, fog, 32, { soft: true });
// Enemies show only where some unit sees: fog.is_visible(cell.x, cell.y).
```
