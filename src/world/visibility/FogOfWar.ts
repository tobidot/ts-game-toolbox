import { Grid2D, GridPosition } from "../../data/Grid2D";
import { EventBase, EventSocket } from "../../signals/EventSocket";
import { cast_light, FieldOfViewOptions } from "./FieldOfView";

/** What the fog knows of a cell: never seen, seen before (remembered), or seen right now. */
export type FogState = "unseen" | "seen" | "visible";

/**
 * One pair of eyes for `FogOfWar.update`: a cell (fractions are cut, so a unit's position in
 * cells will do) and a sight radius in cells. Viewers with an `id` are matched by it from one
 * update to the next; without one, by their place in the list. Give all an id or none.
 */
export interface FogViewer {
    readonly id?: string | number;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
}

/** What one `update` changed. */
export interface FogChanges {
    /** Viewers whose view was cast again (new, moved, a changed radius, or a changed cell near them). */
    recomputed: number;
    /** Cells seen for the first time. */
    seen: number;
    /** Cells that became visible. */
    shown: number;
    /** Cells that stopped being visible (they stay seen). */
    hidden: number;
}

/**
 * Cells seen for the first time in one `update` (or by `reveal_all`), all in one event: where a
 * game makes treasure, enemies' bases or a new tile appear.
 */
export class FogSeenEvent extends EventBase {
    public static readonly EVENT_NAME = "fog-seen";

    public constructor(public readonly cells: readonly GridPosition[]) {
        super(FogSeenEvent.EVENT_NAME);
    }
}

interface ViewerView {
    x: number;
    y: number;
    radius: number;
    /** The indices of the cells it sees. */
    cells: Int32Array;
    count: number;
    /** The update it was last listed in. */
    stamp: number;
}

/**
 * A fog of war over a grid that remembers: every cell is unseen, seen before, or visible now.
 * Many viewers add up (a count per cell); `update(viewers)` casts the view again only for viewers
 * that moved, changed their radius or stand near a cell the game reported as `changed`, and takes
 * back the view of viewers that are gone. Newly seen cells come as one `FogSeenEvent` per update.
 *
 * The fog asks `blocks_sight` once per cell and keeps the answer; tell it with `changed(x, y)`
 * when a door opens or a wall falls.
 */
export class FogOfWar<T> {
    public readonly width: number;
    public readonly height: number;
    /** `FogSeenEvent`s: cells seen for the first time. */
    public readonly events = new EventSocket<FogSeenEvent>();
    /** Goes up whenever any cell's state changed; a painter redraws when it differs. */
    public version = 0;

    private readonly grid: Grid2D<T>;
    private readonly options: FieldOfViewOptions<T>;
    /** 0 not asked yet, 1 open, 2 blocks sight. */
    private readonly sight: Uint8Array;
    /** How many viewers see each cell now. */
    private readonly viewers_seeing: Uint16Array;
    private readonly seen: Uint8Array;
    /** Cells that dropped to no viewer during the update in progress, by update stamp. */
    private readonly dropped: Uint32Array;
    private readonly views = new Map<string | number, ViewerView>();
    /** Cells reported changed since the last update. */
    private changed_cells: GridPosition[] = [];
    private stamp = 0;
    private seen_total = 0;
    private visible_total = 0;

    public constructor(grid: Grid2D<T>, options: FieldOfViewOptions<T>) {
        this.grid = grid;
        this.options = options;
        this.width = grid.width;
        this.height = grid.height;
        const size = grid.width * grid.height;
        this.sight = new Uint8Array(size);
        this.viewers_seeing = new Uint16Array(size);
        this.seen = new Uint8Array(size);
        this.dropped = new Uint32Array(size);
    }

    /** How many cells have been seen (visible ones included). */
    public get seen_count(): number {
        return this.seen_total;
    }

    /** How many cells some viewer sees now. */
    public get visible_count(): number {
        return this.visible_total;
    }

    /** `"unseen"` outside the grid. */
    public state_at(x: number, y: number): FogState {
        if (!this.is_inside(x, y)) {
            return "unseen";
        }
        const index = y * this.width + x;
        if (this.viewers_seeing[index] > 0) {
            return "visible";
        }
        return this.seen[index] === 1 ? "seen" : "unseen";
    }

    /** Some viewer sees the cell now. */
    public is_visible(x: number, y: number): boolean {
        return (
            this.is_inside(x, y) && this.viewers_seeing[y * this.width + x] > 0
        );
    }

    /** The cell has been seen, now or before. */
    public is_seen(x: number, y: number): boolean {
        return this.is_inside(x, y) && this.seen[y * this.width + x] === 1;
    }

    /** How many viewers see the cell now. */
    public viewers_at(x: number, y: number): number {
        return this.is_inside(x, y)
            ? this.viewers_seeing[y * this.width + x]
            : 0;
    }

    /**
     * Brings the fog up to these viewers: casts the view of each new or moved one, takes back
     * the view of those not listed any more, and dispatches one `FogSeenEvent` for the cells seen
     * for the first time. Viewers that stood still cost nothing.
     */
    public update(viewers: Iterable<FogViewer>): FogChanges {
        const stamp = ++this.stamp;
        const changes: FogChanges = {
            recomputed: 0,
            seen: 0,
            shown: 0,
            hidden: 0,
        };
        const dropped_cells: number[] = [];
        const newly_seen: GridPosition[] = [];
        const changed_cells = this.changed_cells;
        this.changed_cells = [];
        const moved: [string | number, FogViewer][] = [];
        let index = 0;
        for (const viewer of viewers) {
            const key = viewer.id ?? index;
            index++;
            const x = Math.floor(viewer.x);
            const y = Math.floor(viewer.y);
            const view = this.views.get(key);
            if (
                view !== undefined &&
                view.x === x &&
                view.y === y &&
                view.radius === viewer.radius &&
                !this.touches(view, changed_cells)
            ) {
                view.stamp = stamp;
                continue;
            }
            moved.push([key, viewer]);
        }
        // Take back first, so a cell handed from one viewer to another doesn't flicker.
        const moved_keys = new Set(moved.map(([key]) => key));
        for (const [key, view] of this.views) {
            const is_moved = moved_keys.has(key);
            if (view.stamp === stamp && !is_moved) {
                continue;
            }
            this.take_back(view, stamp, dropped_cells);
            if (!is_moved) {
                this.views.delete(key);
            }
        }
        for (const [key, viewer] of moved) {
            const view = this.cast(key, viewer, stamp);
            changes.recomputed++;
            const seeing = this.viewers_seeing;
            const cells = view.cells;
            for (let i = 0; i < view.count; i++) {
                const cell = cells[i];
                if (seeing[cell] === 0) {
                    if (this.dropped[cell] !== stamp) {
                        changes.shown++;
                        this.visible_total++;
                    } else {
                        // Dropped and taken up again in the same update: not a change.
                        this.dropped[cell] = 0;
                        this.visible_total++;
                    }
                    if (this.seen[cell] === 0) {
                        this.seen[cell] = 1;
                        this.seen_total++;
                        changes.seen++;
                        const cx = cell % this.width;
                        newly_seen.push({ x: cx, y: (cell - cx) / this.width });
                    }
                }
                seeing[cell]++;
            }
        }
        for (const cell of dropped_cells) {
            if (
                this.dropped[cell] === stamp &&
                this.viewers_seeing[cell] === 0
            ) {
                changes.hidden++;
            }
        }
        if (changes.seen > 0 || changes.shown > 0 || changes.hidden > 0) {
            this.version++;
        }
        if (newly_seen.length > 0) {
            this.events.dispatch(new FogSeenEvent(newly_seen));
        }
        return changes;
    }

    /**
     * Tells the fog that the cell at (x, y) may block sight differently now (a door, a dug wall):
     * the next `update` asks `blocks_sight` again and casts the views that could reach it.
     */
    public changed(x: number, y: number): void {
        if (!this.is_inside(x, y)) {
            return;
        }
        this.sight[y * this.width + x] = 0;
        this.changed_cells.push({ x, y });
    }

    /** Every cell counts as seen (a map bought, a cheat, the end of a round). */
    public reveal_all(): void {
        const newly_seen: GridPosition[] = [];
        for (let index = 0; index < this.seen.length; index++) {
            if (this.seen[index] === 0) {
                this.seen[index] = 1;
                const x = index % this.width;
                newly_seen.push({ x, y: (index - x) / this.width });
            }
        }
        this.seen_total = this.seen.length;
        if (newly_seen.length > 0) {
            this.version++;
            this.events.dispatch(new FogSeenEvent(newly_seen));
        }
    }

    /** Forgets everything not visible right now: a new round on the same map. */
    public forget(): void {
        let total = 0;
        for (let index = 0; index < this.seen.length; index++) {
            const visible = this.viewers_seeing[index] > 0 ? 1 : 0;
            this.seen[index] = visible;
            total += visible;
        }
        if (total !== this.seen_total) {
            this.version++;
        }
        this.seen_total = total;
    }

    /**
     * Copies the states into `target` (one byte per cell, row by row): 0 unseen, 1 seen, 2
     * visible. For a painter or a minimap that looks at every cell.
     */
    public copy_states(target: Uint8Array | Uint8ClampedArray): void {
        const seeing = this.viewers_seeing;
        const seen = this.seen;
        const size = Math.min(target.length, seen.length);
        for (let index = 0; index < size; index++) {
            target[index] = seeing[index] > 0 ? 2 : seen[index];
        }
    }

    private is_inside(x: number, y: number): boolean {
        return (
            x >= 0 &&
            y >= 0 &&
            x < this.width &&
            y < this.height &&
            Number.isInteger(x) &&
            Number.isInteger(y)
        );
    }

    /** Whether a changed cell lies in the square a view could reach. */
    private touches(view: ViewerView, cells: readonly GridPosition[]): boolean {
        for (const cell of cells) {
            if (
                Math.abs(cell.x - view.x) <= view.radius &&
                Math.abs(cell.y - view.y) <= view.radius
            ) {
                return true;
            }
        }
        return false;
    }

    private take_back(
        view: ViewerView,
        stamp: number,
        dropped_cells: number[],
    ): void {
        const seeing = this.viewers_seeing;
        const cells = view.cells;
        for (let i = 0; i < view.count; i++) {
            const cell = cells[i];
            seeing[cell]--;
            if (seeing[cell] === 0) {
                this.dropped[cell] = stamp;
                dropped_cells.push(cell);
                this.visible_total--;
            }
        }
        view.count = 0;
    }

    private cast(
        key: string | number,
        viewer: FogViewer,
        stamp: number,
    ): ViewerView {
        const x = Math.floor(viewer.x);
        const y = Math.floor(viewer.y);
        let view = this.views.get(key);
        if (view === undefined) {
            view = {
                x,
                y,
                radius: viewer.radius,
                cells: new Int32Array(0),
                count: 0,
                stamp,
            };
            this.views.set(key, view);
        }
        view.x = x;
        view.y = y;
        view.radius = viewer.radius;
        view.stamp = stamp;
        view.count = 0;
        const width = this.width;
        const height = this.height;
        const sight = this.sight;
        const grid = this.grid;
        const blocks_sight = this.options.blocks_sight;
        const target = view;
        cast_light(
            width,
            height,
            x,
            y,
            viewer.radius,
            this.options.shape ?? "round",
            (cx, cy) => {
                if (cx < 0 || cy < 0 || cx >= width || cy >= height) {
                    return true;
                }
                const index = cy * width + cx;
                let known = sight[index];
                if (known === 0) {
                    known = blocks_sight(grid.get(cx, cy), cx, cy) ? 2 : 1;
                    sight[index] = known;
                }
                return known === 2;
            },
            (cx, cy) => {
                if (target.count === target.cells.length) {
                    const grown = new Int32Array(
                        Math.max(64, target.cells.length * 2),
                    );
                    grown.set(target.cells);
                    target.cells = grown;
                }
                target.cells[target.count++] = cy * width + cx;
            },
        );
        return view;
    }
}
