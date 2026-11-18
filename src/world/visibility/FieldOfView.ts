import { Grid2D, GridPosition } from "../../data/Grid2D";

/** How far a viewer sees: a disc (`"round"`, radius + ½ so the edge isn't spiky) or a square. */
export type SightShape = "round" | "square";

/**
 * What a field of view needs to know. Only `blocks_sight` is required: which cells light can't
 * pass. Works on any `Grid2D`, and so on a `TileMap` layer.
 */
export interface FieldOfViewOptions<T> {
    /** Whether a cell with this value stops sight; it is seen itself, what lies behind it isn't. */
    blocks_sight: (value: T, x: number, y: number) => boolean;
    /** Default `"round"`. */
    shape?: SightShape;
}

/**
 * Whether a cell `dx`, `dy` away from the viewer lies inside a sight `radius` (in cells). Round:
 * `dx² + dy² ≤ r² + r`, the disc of radius r + ½ on whole cells; square: both at most r.
 */
export function in_sight_radius(
    dx: number,
    dy: number,
    radius: number,
    shape: SightShape = "round",
): boolean {
    if (shape === "square") {
        return Math.abs(dx) <= radius && Math.abs(dy) <= radius;
    }
    return dx * dx + dy * dy <= radius * radius + radius;
}

/**
 * The cells visible from `origin` within `radius` cells, each once, the origin first. Symmetric
 * shadowcasting (after Albert Ford): an open cell B is seen from an open cell A exactly when A is
 * seen from B, and a cell that blocks sight is seen whenever light reaches any part of it, so
 * the walls of a room and of a long corridor all show. Light never squeezes between two blocking
 * cells that touch only at a corner. Nothing is seen from outside the grid.
 */
export function field_of_view<T>(
    grid: Grid2D<T>,
    origin: GridPosition,
    radius: number,
    options: FieldOfViewOptions<T>,
): GridPosition[] {
    const cells: GridPosition[] = [];
    visit_field_of_view(grid, origin, radius, options, (x, y) => {
        cells.push({ x, y });
    });
    return cells;
}

/**
 * `field_of_view` without a list: calls `visit(x, y)` once for every visible cell and returns how
 * many there were. For a game that marks cells in its own arrays.
 */
export function visit_field_of_view<T>(
    grid: Grid2D<T>,
    origin: GridPosition,
    radius: number,
    options: FieldOfViewOptions<T>,
    visit: (x: number, y: number) => void,
): number {
    const width = grid.width;
    const height = grid.height;
    const blocks_sight = options.blocks_sight;
    return cast_light(
        width,
        height,
        origin.x,
        origin.y,
        radius,
        options.shape ?? "round",
        (x, y) =>
            x < 0 ||
            y < 0 ||
            x >= width ||
            y >= height ||
            blocks_sight(grid.get(x, y), x, y),
        visit,
    );
}

/**
 * The scan behind `visit_field_of_view`, on a plain question `blocks(x, y)` (true outside the
 * grid). Four quadrants of 90° (each two octants), row by row away from the viewer; a row's
 * light is a range of slopes, cut where a blocking cell stands. Slopes are kept as whole-number
 * fractions, so ties come out the same from both ends and the result stays symmetric.
 * @internal shared with `FogOfWar`
 */
export function cast_light(
    width: number,
    height: number,
    origin_x: number,
    origin_y: number,
    radius: number,
    shape: SightShape,
    blocks: (x: number, y: number) => boolean,
    visit: (x: number, y: number) => void,
): number {
    const ox = Math.floor(origin_x);
    const oy = Math.floor(origin_y);
    if (ox < 0 || oy < 0 || ox >= width || oy >= height) {
        return 0;
    }
    visit(ox, oy);
    let count = 1;
    // No row lies further away than the grid is wide or high.
    const reach = Math.floor(Math.min(radius, Math.max(width, height)));
    if (!(reach >= 1)) {
        return count;
    }
    const round = shape === "round";
    const limit = radius * radius + radius;
    // The diagonals belong to two quadrants each: marked here and visited once at the end.
    const diagonals = new Uint8Array(4 * (reach + 1));
    // A stack of rows still to scan: depth, start slope (sn / sd), end slope (en / ed).
    const stack: number[] = [];
    for (let quadrant = 0; quadrant < 4; quadrant++) {
        // The quadrant's frame: column `c` across, row `d` away from the viewer.
        // North (c, -d), east (d, c), south (-c, d), west (-d, -c).
        const cx = quadrant === 0 ? 1 : quadrant === 2 ? -1 : 0;
        const cy = quadrant === 1 ? 1 : quadrant === 3 ? -1 : 0;
        const dx = quadrant === 1 ? 1 : quadrant === 3 ? -1 : 0;
        const dy = quadrant === 0 ? -1 : quadrant === 2 ? 1 : 0;
        const blocked = (c: number, d: number): boolean =>
            blocks(ox + c * cx + d * dx, oy + c * cy + d * dy);
        stack.push(1, -1, 1, 1, 1);
        while (stack.length > 0) {
            const ed = stack.pop()!;
            const en = stack.pop()!;
            let sd = stack.pop()!;
            let sn = stack.pop()!;
            const depth = stack.pop()!;
            // Round the slopes to columns: ties up at the start, down at the end.
            let min_col = Math.floor((2 * depth * sn + sd) / (2 * sd));
            let max_col = Math.ceil((2 * depth * en - ed) / (2 * ed));
            if (round) {
                // Light past the disc only ever reaches cells further out: skip those columns.
                const half = Math.floor(Math.sqrt(limit - depth * depth));
                min_col = Math.max(min_col, -half);
                max_col = Math.min(max_col, half);
            }
            // -1: no cell yet in this row, 0: the last cell let light through, 1: it blocked.
            let previous = -1;
            for (let col = min_col; col <= max_col; col++) {
                const wall = blocked(col, depth);
                // An open cell whose only way in is between two blocking cells that touch at a
                // corner: the cell behind it and the one beside it on the viewer's side.
                const squeezed =
                    !wall &&
                    col !== 0 &&
                    blocked(col, depth - 1) &&
                    blocked(col > 0 ? col - 1 : col + 1, depth);
                if (
                    wall ||
                    (!squeezed &&
                        col * sd >= depth * sn &&
                        col * ed <= depth * en)
                ) {
                    const x = ox + col * cx + depth * dx;
                    const y = oy + col * cy + depth * dy;
                    if (
                        x >= 0 &&
                        y >= 0 &&
                        x < width &&
                        y < height &&
                        (round
                            ? col * col + depth * depth <= limit
                            : depth <= radius)
                    ) {
                        if (col === -depth) {
                            diagonals[quadrant * (reach + 1) + depth] = 1;
                        } else if (col === depth) {
                            diagonals[
                                ((quadrant + 1) % 4) * (reach + 1) + depth
                            ] = 1;
                        } else {
                            visit(x, y);
                            count++;
                        }
                    }
                }
                const stops = wall || squeezed;
                if (previous === 1 && !stops) {
                    sn = 2 * col - 1;
                    sd = 2 * depth;
                }
                if (previous === 0 && stops && depth < reach) {
                    stack.push(depth + 1, sn, sd, 2 * col - 1, 2 * depth);
                }
                previous = stops ? 1 : 0;
            }
            if (previous === 0 && depth < reach) {
                stack.push(depth + 1, sn, sd, en, ed);
            }
        }
    }
    // Diagonal 0 is the north-west one (-d, -d), then north-east, south-east, south-west.
    for (let diagonal = 0; diagonal < 4; diagonal++) {
        const sx = diagonal === 1 || diagonal === 2 ? 1 : -1;
        const sy = diagonal >= 2 ? 1 : -1;
        for (let depth = 1; depth <= reach; depth++) {
            if (diagonals[diagonal * (reach + 1) + depth] === 1) {
                visit(ox + sx * depth, oy + sy * depth);
                count++;
            }
        }
    }
    return count;
}
