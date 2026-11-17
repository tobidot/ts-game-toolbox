import { Grid2D, GridPosition } from "../../data/Grid2D";
import { CellCosts, GridPathOptions, IndexHeap } from "./GridSearch";

/**
 * The way from every cell of a grid to the nearest of some targets, worked out once for all
 * walkers: each cell knows its distance and the neighbour to step to next. Made by
 * `flow_field()`; it doesn't follow later changes of the grid, so build a new one when a cell
 * opens or closes.
 */
export class FlowField {
    /** How many cells have a way to a target, the targets included. */
    public readonly reached: number;

    /** @internal Built by `flow_field()`. */
    public constructor(
        public readonly width: number,
        public readonly height: number,
        private readonly distances: Float64Array,
        private readonly next: Int32Array,
    ) {
        let reached = 0;
        for (const distance of distances) {
            if (distance < Infinity) {
                reached++;
            }
        }
        this.reached = reached;
    }

    /** What the cheapest way from (x, y) to a target costs; 0 on a target, `Infinity` without a way or outside. */
    public distance_at(x: number, y: number): number {
        if (!this.is_inside(x, y)) {
            return Infinity;
        }
        return this.distances[y * this.width + x];
    }

    /** Whether (x, y) has a way to a target (a target has). */
    public is_reachable(x: number, y: number): boolean {
        return this.distance_at(x, y) < Infinity;
    }

    /** Whether (x, y) is one of the targets the field was built for. */
    public is_target(x: number, y: number): boolean {
        return this.distance_at(x, y) === 0;
    }

    /** The cell to step to from (x, y); `null` on a target and where there is no way. */
    public next_cell(x: number, y: number): GridPosition | null {
        if (!this.is_inside(x, y)) {
            return null;
        }
        const next = this.next[y * this.width + x];
        if (next < 0) {
            return null;
        }
        const nx = next % this.width;
        return { x: nx, y: (next - nx) / this.width };
    }

    /** The step from (x, y) towards the nearest target, each part -1, 0 or 1; (0, 0) on a target and without a way. */
    public direction_at(x: number, y: number): GridPosition {
        const next = this.next_cell(x, y);
        if (next === null) {
            return { x: 0, y: 0 };
        }
        return { x: next.x - x, y: next.y - y };
    }

    private is_inside(x: number, y: number): boolean {
        return (
            Number.isInteger(x) &&
            Number.isInteger(y) &&
            x >= 0 &&
            y >= 0 &&
            x < this.width &&
            y < this.height
        );
    }
}

/**
 * A flow field towards `targets`: one Dijkstra pass outwards from all of them at once, so each
 * open cell learns its cheapest way to the nearest one. Many walkers going to the same place
 * then cost one pass in all, not one search each. Targets that are blocked or outside are
 * skipped. The costs are the ones `find_path` adds up: a cell's distance is what a walker
 * starting there pays for the cells it steps onto, the target included.
 */
export function flow_field<T>(
    grid: Grid2D<T>,
    targets: readonly GridPosition[],
    options: GridPathOptions<T>,
): FlowField {
    const cells = new CellCosts(grid, options);
    const width = grid.width;
    const size = width * grid.height;
    const distances = new Float64Array(size).fill(Infinity);
    const next = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const open = new IndexHeap();
    for (const target of targets) {
        if (!grid.is_inside(target.x, target.y)) {
            continue;
        }
        const index = target.y * width + target.x;
        if (cells.of(index) < 0) {
            continue;
        }
        distances[index] = 0;
        open.push(index, 0, 0);
    }
    const steps = cells.diagonal ? 8 : 4;
    while (open.size > 0) {
        const current = open.pop();
        if (closed[current] === 1) {
            continue;
        }
        closed[current] = 1;
        // A walker next door pays for stepping onto `current`.
        const cost = cells.of(current);
        const x = current % width;
        const y = (current - x) / width;
        for (let step = 0; step < steps; step++) {
            const neighbour = cells.neighbour(x, y, step);
            if (neighbour < 0 || closed[neighbour] === 1) {
                continue;
            }
            if (cells.of(neighbour) < 0) {
                continue;
            }
            const total =
                distances[current] + (step >= 4 ? cost * Math.SQRT2 : cost);
            if (total < distances[neighbour]) {
                distances[neighbour] = total;
                next[neighbour] = current;
                open.push(neighbour, total, 0);
            }
        }
    }
    return new FlowField(width, grid.height, distances, next);
}
