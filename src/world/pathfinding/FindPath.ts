import { Grid2D, GridPosition } from "../../data/Grid2D";
import { CellCosts, GridPathOptions, IndexHeap } from "./GridSearch";

/** `find_path`'s options: the grid's rules, and how far to look. */
export interface FindPathOptions<T> extends GridPathOptions<T> {
    /** How many cells to look at before giving up with `null`; default: no limit. */
    max_steps?: number;
}

/**
 * The cheapest path from `from` to `to` on `grid`, by A*: a list of cells from start to goal,
 * both included, or `null` when there is no way (or the goal is blocked or outside). The start
 * is never tested, so a walker standing on a cell that was just closed still finds its way out.
 * The distance estimate is the Manhattan distance, or the octile one with `diagonal`.
 */
export function find_path<T>(
    grid: Grid2D<T>,
    from: GridPosition,
    to: GridPosition,
    options: FindPathOptions<T>,
): GridPosition[] | null {
    if (!grid.is_inside(from.x, from.y) || !grid.is_inside(to.x, to.y)) {
        return null;
    }
    const cells = new CellCosts(grid, options);
    const width = grid.width;
    const start = from.y * width + from.x;
    const goal = to.y * width + to.x;
    if (cells.of(goal) < 0) {
        return null;
    }
    if (start === goal) {
        return [{ x: to.x, y: to.y }];
    }
    const diagonal = cells.diagonal;
    const steps = diagonal ? 8 : 4;
    const estimate = (x: number, y: number): number => {
        const dx = Math.abs(x - to.x);
        const dy = Math.abs(y - to.y);
        if (!diagonal) {
            return dx + dy;
        }
        return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const size = width * grid.height;
    const spent = new Float64Array(size).fill(Infinity);
    const came_from = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const open = new IndexHeap();
    const max_steps = options.max_steps ?? Infinity;
    spent[start] = 0;
    const start_estimate = estimate(from.x, from.y);
    open.push(start, start_estimate, start_estimate);
    let looked_at = 0;
    while (open.size > 0) {
        const current = open.pop();
        if (closed[current] === 1) {
            continue;
        }
        if (current === goal) {
            return trace_back(came_from, goal, width);
        }
        closed[current] = 1;
        looked_at++;
        if (looked_at > max_steps) {
            return null;
        }
        const x = current % width;
        const y = (current - x) / width;
        for (let step = 0; step < steps; step++) {
            const next = cells.neighbour(x, y, step);
            if (next < 0 || closed[next] === 1) {
                continue;
            }
            const cost = cells.of(next);
            if (cost < 0) {
                continue;
            }
            const total =
                spent[current] + (step >= 4 ? cost * Math.SQRT2 : cost);
            if (total < spent[next]) {
                spent[next] = total;
                came_from[next] = current;
                const nx = next % width;
                const left = estimate(nx, (next - nx) / width);
                open.push(next, total + left, left);
            }
        }
    }
    return null;
}

function trace_back(
    came_from: Int32Array,
    goal: number,
    width: number,
): GridPosition[] {
    const path: GridPosition[] = [];
    for (let at = goal; at >= 0; at = came_from[at]) {
        const x = at % width;
        path.push({ x, y: (at - x) / width });
    }
    return path.reverse();
}
