import { Grid2D, GridPosition } from "../../data/Grid2D";

/**
 * Whether the straight line between the centres of cells `a` and `b` crosses only open cells.
 * It walks the grid cell by cell along the line (every cell the line touches, both ends
 * included); where the line passes exactly through a corner, both cells beside it must be open,
 * as for a diagonal step of `find_path`.
 */
export function has_line_of_sight<T>(
    grid: Grid2D<T>,
    a: GridPosition,
    b: GridPosition,
    passable: (value: T, x: number, y: number) => boolean,
): boolean {
    const is_open = (x: number, y: number): boolean =>
        grid.is_inside(x, y) && passable(grid.get(x, y), x, y);
    let x = a.x;
    let y = a.y;
    if (!is_open(x, y)) {
        return false;
    }
    const nx = Math.abs(b.x - a.x);
    const ny = Math.abs(b.y - a.y);
    const sx = Math.sign(b.x - a.x);
    const sy = Math.sign(b.y - a.y);
    let ix = 0;
    let iy = 0;
    while (ix < nx || iy < ny) {
        // Where the line leaves the cell: through the side, the top or bottom, or a corner.
        const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
        if (decision === 0) {
            if (!is_open(x + sx, y) || !is_open(x, y + sy)) {
                return false;
            }
            x += sx;
            y += sy;
            ix++;
            iy++;
        } else if (decision < 0) {
            x += sx;
            ix++;
        } else {
            y += sy;
            iy++;
        }
        if (!is_open(x, y)) {
            return false;
        }
    }
    return true;
}

/**
 * A shorter list of the same path's cells, for walkers that shouldn't zigzag: from each kept cell
 * it skips ahead as long as the cell after the next one is still in straight sight
 * (`has_line_of_sight`). The first and the last cell always stay; every leg of the result is a
 * straight line over open cells. The path given is not changed.
 */
export function smooth_path<T>(
    grid: Grid2D<T>,
    path: readonly GridPosition[],
    passable: (value: T, x: number, y: number) => boolean,
): GridPosition[] {
    if (path.length <= 2) {
        return path.slice();
    }
    const result: GridPosition[] = [path[0]];
    const last = path.length - 1;
    let anchor = 0;
    while (anchor < last) {
        let reach = anchor + 1;
        while (
            reach < last &&
            has_line_of_sight(grid, path[anchor], path[reach + 1], passable)
        ) {
            reach++;
        }
        result.push(path[reach]);
        anchor = reach;
    }
    return result;
}
