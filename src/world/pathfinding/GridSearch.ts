import { Grid2D } from "../../data/Grid2D";

/**
 * What a search on a grid needs to know. Only `passable` is required: which cells a walker may
 * stand on. Works on any `Grid2D`, and so on a `TileMap` layer.
 */
export interface GridPathOptions<T> {
    /** Whether a walker may stand on a cell with this value. */
    passable: (value: T, x: number, y: number) => boolean;
    /**
     * What stepping onto the cell costs; default 1. Values below 1 count as 1, so the distance
     * estimate of `find_path` never guesses too high and the path stays the cheapest. A diagonal
     * step costs √2 times as much.
     */
    cost?: (value: T, x: number, y: number) => number;
    /**
     * Eight neighbours instead of four; default false. A diagonal step needs both cells beside it
     * open, so a walker never cuts past a blocked corner.
     */
    diagonal?: boolean;
}

/** The neighbour offsets: the four straight ones first, then the diagonals. */
export const STEP_X = [1, 0, -1, 0, 1, -1, -1, 1] as const;
export const STEP_Y = [0, 1, 0, -1, 1, 1, -1, -1] as const;

/** Answers "may I step there, and what does it cost" by array index, asking the game once per cell. */
export class CellCosts<T> {
    public readonly width: number;
    public readonly height: number;
    public readonly diagonal: boolean;
    /** NaN: not asked yet; -1: blocked; else the cost of stepping onto the cell. */
    private readonly costs: Float64Array;

    public constructor(
        private readonly grid: Grid2D<T>,
        private readonly options: GridPathOptions<T>,
    ) {
        this.width = grid.width;
        this.height = grid.height;
        this.diagonal = options.diagonal ?? false;
        this.costs = new Float64Array(grid.width * grid.height).fill(NaN);
    }

    /** The cost of stepping onto cell `index`, or -1 when it is blocked. */
    public of(index: number): number {
        const known = this.costs[index];
        if (!Number.isNaN(known)) {
            return known;
        }
        const x = index % this.width;
        const y = (index - x) / this.width;
        const value = this.grid.get(x, y);
        let cost = -1;
        if (this.options.passable(value, x, y)) {
            const asked =
                this.options.cost === undefined
                    ? 1
                    : this.options.cost(value, x, y);
            cost = asked > 1 ? asked : 1;
        }
        this.costs[index] = cost;
        return cost;
    }

    /**
     * The index of the neighbour of (x, y) in direction `step` (0..7), or -1 when it lies outside
     * the grid or the step would cut past a blocked corner. Whether the neighbour itself is open
     * is left to the caller.
     */
    public neighbour(x: number, y: number, step: number): number {
        const nx = x + STEP_X[step];
        const ny = y + STEP_Y[step];
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) {
            return -1;
        }
        if (step >= 4) {
            if (
                this.of(y * this.width + nx) < 0 ||
                this.of(ny * this.width + x) < 0
            ) {
                return -1;
            }
        }
        return ny * this.width + nx;
    }
}

/**
 * A binary min-heap of cell indices, ordered by `key`, then by `tie` (lower first). A cell may be
 * in it more than once; the search skips the copies it has closed already.
 */
export class IndexHeap {
    private readonly items: number[] = [];
    private readonly keys: number[] = [];
    private readonly ties: number[] = [];

    public get size(): number {
        return this.items.length;
    }

    public push(item: number, key: number, tie: number): void {
        const items = this.items;
        const keys = this.keys;
        const ties = this.ties;
        let at = items.length;
        items.push(item);
        keys.push(key);
        ties.push(tie);
        while (at > 0) {
            const parent = (at - 1) >> 1;
            if (
                keys[parent] < key ||
                (keys[parent] === key && ties[parent] <= tie)
            ) {
                break;
            }
            items[at] = items[parent];
            keys[at] = keys[parent];
            ties[at] = ties[parent];
            at = parent;
        }
        items[at] = item;
        keys[at] = key;
        ties[at] = tie;
    }

    /** Takes the item with the lowest key out; -1 when empty. */
    public pop(): number {
        const items = this.items;
        const keys = this.keys;
        const ties = this.ties;
        if (items.length === 0) {
            return -1;
        }
        const top = items[0];
        const item = items.pop()!;
        const key = keys.pop()!;
        const tie = ties.pop()!;
        const size = items.length;
        if (size === 0) {
            return top;
        }
        let at = 0;
        for (;;) {
            const left = at * 2 + 1;
            if (left >= size) {
                break;
            }
            const right = left + 1;
            let child = left;
            if (
                right < size &&
                (keys[right] < keys[left] ||
                    (keys[right] === keys[left] && ties[right] < ties[left]))
            ) {
                child = right;
            }
            if (
                key < keys[child] ||
                (key === keys[child] && tie <= ties[child])
            ) {
                break;
            }
            items[at] = items[child];
            keys[at] = keys[child];
            ties[at] = ties[child];
            at = child;
        }
        items[at] = item;
        keys[at] = key;
        ties[at] = tie;
        return top;
    }
}
