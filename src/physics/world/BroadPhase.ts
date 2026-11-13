import { RectI } from "../../geometries/Rect";
import { aabb_overlaps } from "../aabb/Aabb";

/** How a `PhysicsWorld` finds the pairs that may touch: a uniform grid, or every pair. */
export type BroadPhaseOptions =
    | { kind: "none" }
    | {
          kind: "grid";
          /** The side of a cell in world units: about the size of a common body. */
          cell_size: number;
      };

/**
 * Finds the pairs of boxes that overlap, so the narrow test (a `CollisionRule`) only runs on
 * those. Both kinds give exactly the same pairs in the same order, so a world plays the same
 * with either: only the time differs.
 */
export interface BroadPhase {
    /**
     * Replaces `out` with every overlapping pair of `boxes` (touching doesn't count), as flat
     * index pairs `first, second` with `first < second`, sorted by `first`, then `second`.
     */
    pairs(boxes: readonly RectI[], out: number[]): void;
    /** Keeps `boxes` for `near()`: the still bodies, which don't move between steps. */
    stand(boxes: readonly RectI[]): void;
    /** Replaces `out` with the indices of the standing boxes that may touch `box`, ascending. */
    near(box: RectI, out: number[]): void;
}

/** The broad phase `options` ask for. */
export function create_broad_phase(options: BroadPhaseOptions): BroadPhase {
    if (options.kind === "none") {
        return new NoBroadPhase();
    }
    return new GridBroadPhase(options.cell_size);
}

/**
 * No broad phase: every pair of boxes is compared, and every standing box is near. What a
 * grid has to beat.
 */
export class NoBroadPhase implements BroadPhase {
    private standing_count = 0;

    public pairs(boxes: readonly RectI[], out: number[]): void {
        out.length = 0;
        for (let first = 0; first < boxes.length; first++) {
            const box = boxes[first];
            for (let second = first + 1; second < boxes.length; second++) {
                if (aabb_overlaps(box, boxes[second])) {
                    out.push(first, second);
                }
            }
        }
    }

    public stand(boxes: readonly RectI[]): void {
        this.standing_count = boxes.length;
    }

    public near(box: RectI, out: number[]): void {
        void box;
        out.length = this.standing_count;
        for (let index = 0; index < this.standing_count; index++) {
            out[index] = index;
        }
    }
}

/** The cells a grid lays over its boxes, and which box lies in which cell. */
class Cells {
    public left = 0;
    public top = 0;
    public columns = 0;
    public rows = 0;
    /** Where each cell's entries start in `entries`; one more than there are cells. */
    public starts = new Int32Array(1);
    /** The box indices, cell after cell, ascending within a cell. */
    public entries = new Int32Array(0);
    private filled = new Int32Array(0);

    public constructor(public readonly cell_size: number) {}

    /** The column of world `x`, clamped into the grid: a far box lands in an edge cell. */
    public column(x: number): number {
        const column = Math.floor(x / this.cell_size) - this.left;
        return column < 0
            ? 0
            : column >= this.columns
              ? this.columns - 1
              : column;
    }

    public row(y: number): number {
        const row = Math.floor(y / this.cell_size) - this.top;
        return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
    }

    /**
     * Lays the grid over `boxes` and sorts their indices into the cells: one pass counts, one
     * places, so nothing is allocated once the arrays are big enough.
     */
    public fill(boxes: readonly RectI[]): void {
        const size = this.cell_size;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const box of boxes) {
            left = Math.min(left, box.left);
            top = Math.min(top, box.top);
            right = Math.max(right, box.left + box.width);
            bottom = Math.max(bottom, box.top + box.height);
        }
        if (boxes.length === 0) {
            left = top = right = bottom = 0;
        }
        this.left = Math.floor(left / size);
        this.top = Math.floor(top / size);
        this.columns = Math.min(
            Math.floor(right / size) - this.left + 1,
            GridBroadPhase.MAX_SIDE,
        );
        this.rows = Math.min(
            Math.floor(bottom / size) - this.top + 1,
            GridBroadPhase.MAX_SIDE,
        );
        const cells = this.columns * this.rows;
        if (this.starts.length < cells + 1) {
            this.starts = new Int32Array(cells + 1);
            this.filled = new Int32Array(cells);
        }
        const starts = this.starts;
        starts.fill(0, 0, cells + 1);
        let total = 0;
        for (const box of boxes) {
            const first_column = this.column(box.left);
            const last_column = this.column(box.left + box.width);
            const first_row = this.row(box.top);
            const last_row = this.row(box.top + box.height);
            for (let row = first_row; row <= last_row; row++) {
                for (
                    let column = first_column;
                    column <= last_column;
                    column++
                ) {
                    starts[row * this.columns + column + 1] += 1;
                    total += 1;
                }
            }
        }
        for (let cell = 0; cell < cells; cell++) {
            starts[cell + 1] += starts[cell];
        }
        if (this.entries.length < total) {
            this.entries = new Int32Array(total * 2);
        }
        const filled = this.filled;
        filled.fill(0, 0, cells);
        const entries = this.entries;
        for (let index = 0; index < boxes.length; index++) {
            const box = boxes[index];
            const first_column = this.column(box.left);
            const last_column = this.column(box.left + box.width);
            const first_row = this.row(box.top);
            const last_row = this.row(box.top + box.height);
            for (let row = first_row; row <= last_row; row++) {
                for (
                    let column = first_column;
                    column <= last_column;
                    column++
                ) {
                    const cell = row * this.columns + column;
                    entries[starts[cell] + filled[cell]] = index;
                    filled[cell] += 1;
                }
            }
        }
    }
}

/**
 * A uniform grid, laid anew over the boxes on every call, as a world needs it when everything
 * moves. A pair is compared only in the cell where the overlap of their boxes starts, so it is
 * found once however many cells both cover. Boxes much bigger than a cell work, but cost a
 * cell each.
 */
export class GridBroadPhase implements BroadPhase {
    /** At most this many columns and rows: a body far outside lands in an edge cell instead. */
    public static readonly MAX_SIDE = 1024;
    public static readonly MAX_CELLS =
        GridBroadPhase.MAX_SIDE * GridBroadPhase.MAX_SIDE;
    private readonly moving: Cells;
    private readonly standing: Cells;
    private standing_boxes: readonly RectI[] = [];
    /** Per standing box, the last `near()` call that found it, so a box in many cells counts once. */
    private stamps = new Int32Array(0);
    private stamp = 0;
    /** Pairs per first index, for the sort. */
    private counts = new Int32Array(0);
    private sorted: number[] = [];

    public constructor(public readonly cell_size: number) {
        if (!(cell_size > 0)) {
            throw new Error("GridBroadPhase: a cell must be bigger than 0");
        }
        this.moving = new Cells(cell_size);
        this.standing = new Cells(cell_size);
    }

    /** How many cells the last `pairs()` laid out. */
    public get cell_count(): number {
        return this.moving.columns * this.moving.rows;
    }

    public pairs(boxes: readonly RectI[], out: number[]): void {
        const cells = this.moving;
        cells.fill(boxes);
        const found = this.sorted;
        found.length = 0;
        const starts = cells.starts;
        const entries = cells.entries;
        const count = cells.columns * cells.rows;
        for (let cell = 0; cell < count; cell++) {
            const end = starts[cell + 1];
            for (let at = starts[cell]; at < end; at++) {
                const first = entries[at];
                const a = boxes[first];
                for (let other = at + 1; other < end; other++) {
                    const second = entries[other];
                    const b = boxes[second];
                    if (!aabb_overlaps(a, b)) {
                        continue;
                    }
                    // only in the cell where their overlap starts
                    const column = cells.column(Math.max(a.left, b.left));
                    const row = cells.row(Math.max(a.top, b.top));
                    if (row * cells.columns + column === cell) {
                        found.push(first, second);
                    }
                }
            }
        }
        this.sort(found, boxes.length, out);
    }

    /**
     * Sorts the flat pairs by first index (counting), then by second (insertion, a first
     * index has few pairs), into `out`: the order a loop over every pair finds them in.
     */
    private sort(found: number[], box_count: number, out: number[]): void {
        if (this.counts.length < box_count + 1) {
            this.counts = new Int32Array(box_count * 2 + 1);
        }
        const counts = this.counts;
        counts.fill(0, 0, box_count + 1);
        for (let at = 0; at < found.length; at += 2) {
            counts[found[at] + 1] += 1;
        }
        for (let index = 0; index < box_count; index++) {
            counts[index + 1] += counts[index];
        }
        out.length = found.length;
        for (let at = 0; at < found.length; at += 2) {
            const first = found[at];
            const slot = counts[first] * 2;
            counts[first] += 1;
            out[slot] = first;
            out[slot + 1] = found[at + 1];
        }
        // `counts[first]` is now where the next first index starts; sort each run by second
        let start = 0;
        for (let index = 0; index < box_count; index++) {
            const end = counts[index] * 2;
            for (let at = start + 3; at < end; at += 2) {
                const second = out[at];
                let to = at;
                while (to > start + 1 && out[to - 2] > second) {
                    out[to] = out[to - 2];
                    to -= 2;
                }
                out[to] = second;
            }
            start = end;
        }
    }

    public stand(boxes: readonly RectI[]): void {
        this.standing_boxes = boxes;
        this.standing.fill(boxes);
        this.stamps = new Int32Array(boxes.length);
        this.stamp = 0;
    }

    public near(box: RectI, out: number[]): void {
        out.length = 0;
        const boxes = this.standing_boxes;
        if (boxes.length === 0) {
            return;
        }
        const cells = this.standing;
        this.stamp += 1;
        const stamp = this.stamp;
        const stamps = this.stamps;
        const first_column = cells.column(box.left);
        const last_column = cells.column(box.left + box.width);
        const first_row = cells.row(box.top);
        const last_row = cells.row(box.top + box.height);
        for (let row = first_row; row <= last_row; row++) {
            for (let column = first_column; column <= last_column; column++) {
                const cell = row * cells.columns + column;
                const end = cells.starts[cell + 1];
                for (let at = cells.starts[cell]; at < end; at++) {
                    const index = cells.entries[at];
                    if (stamps[index] === stamp) {
                        continue;
                    }
                    stamps[index] = stamp;
                    if (aabb_overlaps(box, boxes[index])) {
                        out.push(index);
                    }
                }
            }
        }
        out.sort((a, b) => a - b);
    }
}
