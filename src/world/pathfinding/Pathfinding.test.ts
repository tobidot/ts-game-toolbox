import { describe, expect, it } from "vitest";
import { Grid2D, GridPosition } from "../../data/Grid2D";
import { SeededRandom } from "../../random/SeededRandom";
import { TileMap } from "../TileMap";
import { find_path } from "./FindPath";
import { flow_field } from "./FlowField";
import { has_line_of_sight, smooth_path } from "./SmoothPath";

/** `#` is earth, `~` is mud (costs 10), anything else is open. */
function grid_of(rows: string[]): Grid2D<string> {
    return new Grid2D<string>(
        rows[0].length,
        rows.length,
        (x, y) => rows[y][x],
    );
}

const open = (value: string): boolean => value !== "#";
const mud_cost = (value: string): number => (value === "~" ? 10 : 1);

/** No cell of the path is earth, every step goes to a neighbour, and a diagonal never cuts a corner. */
function expect_walkable(
    grid: Grid2D<string>,
    path: GridPosition[],
    diagonal: boolean,
): void {
    for (const cell of path) {
        expect(open(grid.get(cell.x, cell.y))).toBe(true);
    }
    for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
        if (dx !== 0 && dy !== 0) {
            expect(diagonal).toBe(true);
            expect(open(grid.get(path[i - 1].x + dx, path[i - 1].y))).toBe(
                true,
            );
            expect(open(grid.get(path[i - 1].x, path[i - 1].y + dy))).toBe(
                true,
            );
        }
    }
}

function path_cost(
    grid: Grid2D<string>,
    path: GridPosition[],
    cost: (value: string) => number = () => 1,
): number {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const is_diagonal =
            path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
        total +=
            cost(grid.get(path[i].x, path[i].y)) *
            (is_diagonal ? Math.SQRT2 : 1);
    }
    return total;
}

function random_grid(
    seed: number,
    width: number,
    height: number,
): Grid2D<string> {
    const random = new SeededRandom(seed);
    return new Grid2D<string>(width, height, () => {
        const roll = random.next();
        if (roll < 0.28) {
            return "#";
        }
        return roll < 0.4 ? "~" : ".";
    });
}

describe("find_path", () => {
    it("goes straight down a corridor", () => {
        const grid = grid_of(["#######", "......#", "#######"]);
        const path = find_path(
            grid,
            { x: 0, y: 1 },
            { x: 5, y: 1 },
            {
                passable: open,
            },
        );
        expect(path).toEqual([0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 1 })));
    });

    it("finds the one gap in a wall", () => {
        const grid = grid_of([".....", ".....", "###.#", ".....", "....."]);
        const path = find_path(
            grid,
            { x: 0, y: 0 },
            { x: 0, y: 4 },
            {
                passable: open,
            },
        );
        expect(path).not.toBeNull();
        expect(path).toContainEqual({ x: 3, y: 2 });
        expect(path!.length).toBe(11);
        expect_walkable(grid, path!, false);
    });

    it("answers null when there is no way, or the goal is earth or outside", () => {
        const grid = grid_of(["..#..", "..#..", "..#.."]);
        const options = { passable: open };
        expect(
            find_path(grid, { x: 0, y: 0 }, { x: 4, y: 2 }, options),
        ).toBeNull();
        expect(
            find_path(grid, { x: 0, y: 0 }, { x: 2, y: 1 }, options),
        ).toBeNull();
        expect(
            find_path(grid, { x: 0, y: 0 }, { x: 9, y: 1 }, options),
        ).toBeNull();
        expect(
            find_path(grid, { x: -1, y: 0 }, { x: 1, y: 1 }, options),
        ).toBeNull();
    });

    it("starts where the walker stands, even on earth, and a path to itself is one cell", () => {
        const grid = grid_of(["#...."]);
        expect(
            find_path(grid, { x: 0, y: 0 }, { x: 2, y: 0 }, { passable: open }),
        ).toEqual([
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
        ]);
        expect(
            find_path(grid, { x: 3, y: 0 }, { x: 3, y: 0 }, { passable: open }),
        ).toEqual([{ x: 3, y: 0 }]);
    });

    it("takes the long way when the short one is expensive", () => {
        const grid = grid_of([
            ".......",
            ".#####.",
            ".~~~~~.",
            ".#####.",
            ".......",
        ]);
        const from = { x: 0, y: 2 };
        const to = { x: 6, y: 2 };
        const short = find_path(grid, from, to, { passable: open });
        expect(short!.length).toBe(7);
        const cheap = find_path(grid, from, to, {
            passable: open,
            cost: mud_cost,
        });
        expect(cheap!.length).toBe(11);
        expect(cheap!.some((cell) => grid.get(cell.x, cell.y) === "~")).toBe(
            false,
        );
    });

    it("steps diagonally when asked, but never past a blocked corner", () => {
        const room = grid_of(["....", "....", "....", "...."]);
        const diagonal = find_path(
            room,
            { x: 0, y: 0 },
            { x: 3, y: 3 },
            {
                passable: open,
                diagonal: true,
            },
        );
        expect(diagonal).toEqual([0, 1, 2, 3].map((i) => ({ x: i, y: i })));

        const squeeze = grid_of([".#", "#."]);
        expect(
            find_path(
                squeeze,
                { x: 0, y: 0 },
                { x: 1, y: 1 },
                {
                    passable: open,
                    diagonal: true,
                },
            ),
        ).toBeNull();

        const corner = grid_of(["..", "#."]);
        const around = find_path(
            corner,
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            {
                passable: open,
                diagonal: true,
            },
        );
        expect(around).toEqual([
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
        ]);
    });

    it("gives up after max_steps cells", () => {
        const grid = grid_of(["..........", "#########.", ".........."]);
        const from = { x: 0, y: 0 };
        const to = { x: 0, y: 2 };
        expect(find_path(grid, from, to, { passable: open })!.length).toBe(21);
        expect(
            find_path(grid, from, to, { passable: open, max_steps: 8 }),
        ).toBeNull();
    });

    it("finds the cheapest path, the same cost the flow field measures", () => {
        for (let seed = 1; seed <= 30; seed++) {
            const grid = random_grid(seed, 24, 16);
            const diagonal = seed % 2 === 0;
            const options = { passable: open, cost: mud_cost, diagonal };
            const to = { x: 23, y: 15 };
            grid.set(to.x, to.y, ".");
            const field = flow_field(grid, [to], options);
            for (const from of [
                { x: 0, y: 0 },
                { x: 12, y: 3 },
                { x: 5, y: 14 },
            ]) {
                grid.set(from.x, from.y, ".");
                const path = find_path(grid, from, to, options);
                const field_after = flow_field(grid, [to], options);
                if (path === null) {
                    expect(field_after.is_reachable(from.x, from.y)).toBe(
                        false,
                    );
                    continue;
                }
                expect_walkable(grid, path, diagonal);
                expect(path_cost(grid, path, mud_cost)).toBeCloseTo(
                    field_after.distance_at(from.x, from.y),
                    9,
                );
            }
            expect(field.width).toBe(24);
        }
    });

    it("works on a tile map layer", () => {
        const map = TileMap.from_ascii(
            ["#####", "#..E#", "#.#.#", "#...#", "#####"],
            Object.fromEntries([
                ["#", "wall"],
                [".", "floor"],
                ["E", "exit"],
            ]),
            32,
            "wall",
        );
        const ground = map.layer(TileMap.GROUND);
        const path = find_path(
            ground,
            { x: 1, y: 3 },
            { x: 3, y: 1 },
            {
                passable: (value) => value !== "wall",
            },
        );
        expect(path!.length).toBe(5);
    });
});

describe("flow_field", () => {
    it("counts the steps down a corridor and points at the target", () => {
        const grid = grid_of(["......#."]);
        const field = flow_field(grid, [{ x: 0, y: 0 }], { passable: open });
        expect([0, 1, 2, 3, 4, 5].map((x) => field.distance_at(x, 0))).toEqual([
            0, 1, 2, 3, 4, 5,
        ]);
        expect(field.direction_at(3, 0)).toEqual({ x: -1, y: 0 });
        expect(field.direction_at(0, 0)).toEqual({ x: 0, y: 0 });
        expect(field.is_target(0, 0)).toBe(true);
        expect(field.next_cell(3, 0)).toEqual({ x: 2, y: 0 });
        expect(field.next_cell(0, 0)).toBeNull();
        expect(field.reached).toBe(6);
    });

    it("leaves cut-off cells, earth and the outside unreachable", () => {
        const grid = grid_of(["..#.."]);
        const field = flow_field(grid, [{ x: 0, y: 0 }], { passable: open });
        for (const x of [2, 3, 4, 9]) {
            expect(field.is_reachable(x, 0)).toBe(false);
            expect(field.distance_at(x, 0)).toBe(Infinity);
            expect(field.direction_at(x, 0)).toEqual({ x: 0, y: 0 });
            expect(field.next_cell(x, 0)).toBeNull();
        }
    });

    it("splits down the middle between two targets", () => {
        const grid = grid_of([".........", ".........", "........."]);
        const field = flow_field(
            grid,
            [
                { x: 0, y: 1 },
                { x: 8, y: 1 },
            ],
            { passable: open, diagonal: true },
        );
        // Each cell is led to the target on its own side.
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 9; x++) {
                if (x === 4) {
                    continue;
                }
                let cell: GridPosition = { x, y };
                while (!field.is_target(cell.x, cell.y)) {
                    cell = field.next_cell(cell.x, cell.y)!;
                }
                expect(cell.x).toBe(x < 4 ? 0 : 8);
            }
        }
        expect(field.distance_at(4, 1)).toBe(4);
    });

    it("leads every reachable cell to a target, in as many steps as it says", () => {
        const grid = grid_of([
            "..........",
            ".####.###.",
            ".#......#.",
            ".#.####.#.",
            "...#..#...",
        ]);
        const field = flow_field(grid, [{ x: 4, y: 2 }], { passable: open });
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                if (!field.is_reachable(x, y)) {
                    continue;
                }
                let cell: GridPosition = { x, y };
                let steps = 0;
                while (!field.is_target(cell.x, cell.y)) {
                    cell = field.next_cell(cell.x, cell.y)!;
                    expect(open(grid.get(cell.x, cell.y))).toBe(true);
                    steps++;
                }
                expect(steps).toBe(field.distance_at(x, y));
            }
        }
        expect(field.is_reachable(4, 4)).toBe(false);
    });

    it("never points past a blocked corner", () => {
        const grid = grid_of([".#", "#."]);
        const field = flow_field(grid, [{ x: 1, y: 1 }], {
            passable: open,
            diagonal: true,
        });
        expect(field.is_reachable(0, 0)).toBe(false);
    });

    it("prefers the dry way round the mud", () => {
        const grid = grid_of([".....", ".~~~.", "....."]);
        const field = flow_field(grid, [{ x: 4, y: 1 }], {
            passable: open,
            cost: mud_cost,
        });
        expect(field.distance_at(0, 1)).toBe(6);
        expect(field.direction_at(0, 1).x).toBe(0);
    });

    it("skips targets that are earth or outside", () => {
        const grid = grid_of(["#..."]);
        const field = flow_field(
            grid,
            [
                { x: 0, y: 0 },
                { x: 7, y: 0 },
                { x: 3, y: 0 },
            ],
            { passable: open },
        );
        expect(field.is_target(0, 0)).toBe(false);
        expect(field.distance_at(1, 0)).toBe(2);
    });
});

describe("smooth_path and has_line_of_sight", () => {
    it("sees across open cells and not through earth", () => {
        const grid = grid_of([".....", "..#..", "....."]);
        expect(
            has_line_of_sight(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, open),
        ).toBe(true);
        expect(
            has_line_of_sight(grid, { x: 0, y: 1 }, { x: 4, y: 1 }, open),
        ).toBe(false);
        expect(
            has_line_of_sight(grid, { x: 0, y: 0 }, { x: 4, y: 2 }, open),
        ).toBe(false);
        expect(
            has_line_of_sight(grid, { x: 1, y: 0 }, { x: 1, y: 2 }, open),
        ).toBe(true);
    });

    it("does not squeeze between two earth cells that touch at a corner", () => {
        const grid = grid_of(["..#", ".#.", "..."]);
        expect(
            has_line_of_sight(grid, { x: 1, y: 0 }, { x: 2, y: 1 }, open),
        ).toBe(false);
        expect(
            has_line_of_sight(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, open),
        ).toBe(false);
        const one_corner = grid_of(["..", "#."]);
        expect(
            has_line_of_sight(one_corner, { x: 0, y: 0 }, { x: 1, y: 1 }, open),
        ).toBe(false);
    });

    it("pulls a path across an open room straight", () => {
        const grid = grid_of(["......", "......", "......", "......"]);
        const path = find_path(
            grid,
            { x: 0, y: 0 },
            { x: 5, y: 3 },
            {
                passable: open,
            },
        )!;
        expect(path.length).toBe(9);
        expect(smooth_path(grid, path, open)).toEqual([
            { x: 0, y: 0 },
            { x: 5, y: 3 },
        ]);
    });

    it("keeps the corner of an L and every leg in sight", () => {
        const grid = grid_of(["......", "####..", "####..", "####.."]);
        const path = find_path(
            grid,
            { x: 0, y: 0 },
            { x: 4, y: 3 },
            {
                passable: open,
            },
        )!;
        const smooth = smooth_path(grid, path, open);
        expect(smooth.length).toBeGreaterThan(2);
        expect(smooth.length).toBeLessThan(path.length);
        expect(smooth[0]).toEqual({ x: 0, y: 0 });
        expect(smooth[smooth.length - 1]).toEqual({ x: 4, y: 3 });
        for (let i = 1; i < smooth.length; i++) {
            expect(
                has_line_of_sight(grid, smooth[i - 1], smooth[i], open),
            ).toBe(true);
        }
    });

    it("keeps every leg in sight on random grids", () => {
        for (let seed = 1; seed <= 20; seed++) {
            const grid = random_grid(seed, 30, 20);
            grid.set(0, 0, ".");
            grid.set(29, 19, ".");
            const path = find_path(
                grid,
                { x: 0, y: 0 },
                { x: 29, y: 19 },
                {
                    passable: open,
                    diagonal: true,
                },
            );
            if (path === null) {
                continue;
            }
            const smooth = smooth_path(grid, path, open);
            expect(smooth[0]).toEqual(path[0]);
            expect(smooth[smooth.length - 1]).toEqual(path[path.length - 1]);
            for (let i = 1; i < smooth.length; i++) {
                expect(
                    has_line_of_sight(grid, smooth[i - 1], smooth[i], open),
                ).toBe(true);
            }
        }
    });

    it("hands back short paths as they are", () => {
        const grid = grid_of(["..."]);
        const path = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
        ];
        expect(smooth_path(grid, path, open)).toEqual(path);
        expect(smooth_path(grid, path, open)).not.toBe(path);
        expect(smooth_path(grid, [], open)).toEqual([]);
    });
});
