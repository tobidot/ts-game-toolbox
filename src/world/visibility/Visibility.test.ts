/* eslint-disable @typescript-eslint/naming-convention -- DOM names on the fake canvas, map characters as keys */
import { describe, expect, it } from "vitest";
import { Grid2D, GridPosition } from "../../data/Grid2D";
import { SeededRandom } from "../../random/SeededRandom";
import { TileMap } from "../TileMap";
import { draw_fog, fog_pixels } from "./DrawFog";
import {
    field_of_view,
    in_sight_radius,
    visit_field_of_view,
} from "./FieldOfView";
import { FogOfWar, FogSeenEvent, FogViewer } from "./FogOfWar";

/** `#` blocks sight, anything else is open. */
function grid_of(rows: string[]): Grid2D<string> {
    return new Grid2D<string>(
        rows[0].length,
        rows.length,
        (x, y) => rows[y][x],
    );
}

const WALLS = { blocks_sight: (value: string): boolean => value === "#" };

function key(x: number, y: number): string {
    return `${x},${y}`;
}

function seen_set(cells: readonly GridPosition[]): Set<string> {
    return new Set(cells.map((cell) => key(cell.x, cell.y)));
}

function random_map(seed: number, size: number, walls: number): Grid2D<string> {
    const random = new SeededRandom(seed);
    return new Grid2D<string>(size, size, () =>
        random.chance(walls) ? "#" : ".",
    );
}

describe("field_of_view", () => {
    it("sees every cell of an open room inside a round radius, each once", () => {
        const grid = new Grid2D<string>(21, 21, ".");
        const cells = field_of_view(grid, { x: 10, y: 10 }, 5, WALLS);
        const expected: string[] = [];
        for (let y = 0; y < 21; y++) {
            for (let x = 0; x < 21; x++) {
                if (in_sight_radius(x - 10, y - 10, 5, "round")) {
                    expected.push(key(x, y));
                }
            }
        }
        expect(cells.length).toBe(expected.length);
        expect(seen_set(cells)).toEqual(new Set(expected));
        // Round: (r + 0.5)², so the four tips and a full disc, not a diamond.
        expect(expected.length).toBe(97);
        expect(seen_set(cells).has(key(15, 10))).toBe(true);
        expect(seen_set(cells).has(key(14, 14))).toBe(false);
    });

    it("sees a square with shape square, and only itself at radius 0", () => {
        const grid = new Grid2D<string>(21, 21, ".");
        const square = field_of_view(grid, { x: 10, y: 10 }, 3, {
            ...WALLS,
            shape: "square",
        });
        expect(square.length).toBe(49);
        expect(field_of_view(grid, { x: 10, y: 10 }, 0, WALLS)).toEqual([
            { x: 10, y: 10 },
        ]);
    });

    it("stops at the edge of the grid and sees nothing from outside", () => {
        const grid = new Grid2D<string>(5, 4, ".");
        const cells = field_of_view(grid, { x: 0, y: 0 }, 10, WALLS);
        expect(cells.length).toBe(20);
        expect(field_of_view(grid, { x: -1, y: 0 }, 3, WALLS)).toEqual([]);
        expect(field_of_view(grid, { x: 5, y: 2 }, 3, WALLS)).toEqual([]);
    });

    it("lets a pillar cast a shadow, and sees the pillar", () => {
        const grid = grid_of([
            "...............",
            "...............",
            "...............",
            "...............",
            "......#........",
            "...............",
            "...............",
        ]);
        const seen = seen_set(field_of_view(grid, { x: 3, y: 4 }, 12, WALLS));
        expect(seen.has(key(6, 4))).toBe(true);
        for (let x = 7; x < 15; x++) {
            expect(seen.has(key(x, 4))).toBe(false);
        }
        // The shadow widens behind the pillar, and the light passes beside it.
        expect(seen.has(key(14, 3))).toBe(false);
        expect(seen.has(key(14, 5))).toBe(false);
        expect(seen.has(key(8, 2))).toBe(true);
        expect(seen.has(key(8, 6))).toBe(true);
    });

    it("sees the walls of a room, corners included, and nothing behind them", () => {
        const grid = grid_of([
            "...........",
            ".#########.",
            ".#.......#.",
            ".#.......#.",
            ".#.......#.",
            ".#########.",
            "...........",
        ]);
        for (const viewer of [
            { x: 2, y: 2 },
            { x: 5, y: 3 },
            { x: 8, y: 4 },
        ]) {
            const seen = seen_set(field_of_view(grid, viewer, 20, WALLS));
            for (let y = 1; y <= 5; y++) {
                for (let x = 1; x <= 9; x++) {
                    expect(seen.has(key(x, y))).toBe(true);
                }
            }
            for (let x = 0; x < 11; x++) {
                expect(seen.has(key(x, 0))).toBe(false);
                expect(seen.has(key(x, 6))).toBe(false);
            }
            expect(seen.has(key(0, 3))).toBe(false);
            expect(seen.has(key(10, 3))).toBe(false);
        }
    });

    it("sees a corridor's walls far along it", () => {
        const grid = grid_of([
            "####################",
            "....................",
            "####################",
        ]);
        const seen = seen_set(field_of_view(grid, { x: 0, y: 1 }, 30, WALLS));
        expect(seen.size).toBe(60);
    });

    it("doesn't leak through a diagonal line of walls, from either side, in any direction", () => {
        const size = 15;
        // Walls on one diagonal; every other cell open.
        const diagonals = [
            (x: number, y: number): boolean => x === y,
            (x: number, y: number): boolean => x + y === size - 1,
        ];
        for (const on_wall of diagonals) {
            const grid = new Grid2D<string>(size, size, (x, y) =>
                on_wall(x, y) ? "#" : ".",
            );
            const side = (x: number, y: number): number =>
                on_wall === diagonals[0]
                    ? Math.sign(x - y)
                    : Math.sign(x + y - (size - 1));
            for (let vy = 0; vy < size; vy++) {
                for (let vx = 0; vx < size; vx++) {
                    if (on_wall(vx, vy)) {
                        continue;
                    }
                    for (const cell of field_of_view(
                        grid,
                        { x: vx, y: vy },
                        size * 2,
                        WALLS,
                    )) {
                        if (on_wall(cell.x, cell.y)) {
                            continue;
                        }
                        expect(side(cell.x, cell.y)).toBe(side(vx, vy));
                    }
                }
            }
        }
    });

    it("doesn't see past a diagonal gap between two wall cells from the corner of a room", () => {
        const grid = grid_of([".....", ".....", "..#..", ".#...", "....."]);
        const seen = seen_set(field_of_view(grid, { x: 1, y: 2 }, 8, WALLS));
        expect(seen.has(key(2, 3))).toBe(false);
        expect(seen.has(key(3, 4))).toBe(false);
        expect(seen.has(key(2, 2))).toBe(true);
        expect(seen.has(key(1, 3))).toBe(true);
    });

    it("is symmetric between open cells on random maps: A sees B when B sees A", () => {
        let pairs = 0;
        for (let seed = 1; seed <= 12; seed++) {
            const size = 22;
            const grid = random_map(seed, size, 0.18 + (seed % 4) * 0.08);
            const sees: Set<string>[] = [];
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    sees.push(
                        grid.get(x, y) === "#"
                            ? new Set()
                            : seen_set(field_of_view(grid, { x, y }, 9, WALLS)),
                    );
                }
            }
            for (let ay = 0; ay < size; ay++) {
                for (let ax = 0; ax < size; ax++) {
                    if (grid.get(ax, ay) === "#") {
                        continue;
                    }
                    for (const b of sees[ay * size + ax]) {
                        const [bx, by] = b.split(",").map(Number);
                        if (grid.get(bx, by) === "#") {
                            continue;
                        }
                        pairs++;
                        expect(
                            sees[by * size + bx].has(key(ax, ay)),
                            `(${ax}, ${ay}) sees (${bx}, ${by}) on map ${seed}`,
                        ).toBe(true);
                    }
                }
            }
        }
        expect(pairs).toBeGreaterThan(20000);
    });

    it("never sees through a wall: the line between the middles is open at every row's middle", () => {
        // What shadowcasting promises: walk the line from the viewer's middle to the seen cell's
        // middle one row (or column) at a time along its longer axis; at each row's middle it lies
        // in an open cell, or exactly on the border of one.
        let checked = 0;
        for (let seed = 30; seed < 36; seed++) {
            const grid = random_map(seed, 24, 0.3);
            const open = (x: number, y: number): boolean =>
                grid.get(x, y) !== "#";
            for (const viewer of [
                { x: 3, y: 3 },
                { x: 12, y: 12 },
                { x: 20, y: 5 },
                { x: 6, y: 19 },
            ]) {
                grid.set(viewer.x, viewer.y, ".");
                for (const cell of field_of_view(grid, viewer, 10, WALLS)) {
                    if (!open(cell.x, cell.y)) {
                        continue;
                    }
                    const dx = cell.x - viewer.x;
                    const dy = cell.y - viewer.y;
                    const along_x = Math.abs(dx) >= Math.abs(dy);
                    const steps = Math.max(Math.abs(dx), Math.abs(dy));
                    for (let k = 1; k < steps; k++) {
                        const major =
                            (along_x ? viewer.x : viewer.y) +
                            Math.sign(along_x ? dx : dy) * k;
                        const minor =
                            (along_x ? viewer.y : viewer.x) +
                            ((along_x ? dy : dx) * k) / steps;
                        const lower = Math.floor(minor + 0.5);
                        const is_tie =
                            Math.abs(minor - Math.floor(minor) - 0.5) < 1e-9;
                        const candidates = is_tie
                            ? [Math.floor(minor), Math.ceil(minor)]
                            : [lower];
                        const clear = candidates.some((m) =>
                            along_x ? open(major, m) : open(m, major),
                        );
                        expect(
                            clear,
                            `(${cell.x}, ${cell.y}) from (${viewer.x}, ${viewer.y}), step ${k}`,
                        ).toBe(true);
                    }
                    checked++;
                }
            }
        }
        expect(checked).toBeGreaterThan(300);
    });

    it("sees nothing behind a solid wall across the map", () => {
        const grid = new Grid2D<string>(30, 30, (x, y) =>
            y === 12 ? "#" : ".",
        );
        for (const viewer of [
            { x: 0, y: 0 },
            { x: 15, y: 11 },
            { x: 29, y: 5 },
        ]) {
            for (const cell of field_of_view(grid, viewer, 40, WALLS)) {
                expect(cell.y).toBeLessThanOrEqual(12);
            }
        }
    });

    it("visits each cell once through a callback and counts them", () => {
        const grid = random_map(5, 30, 0.25);
        const visited: string[] = [];
        const count = visit_field_of_view(
            grid,
            { x: 15, y: 15 },
            8,
            WALLS,
            (x, y) => {
                visited.push(key(x, y));
            },
        );
        expect(count).toBe(visited.length);
        expect(new Set(visited).size).toBe(visited.length);
        expect(new Set(visited)).toEqual(
            seen_set(field_of_view(grid, { x: 15, y: 15 }, 8, WALLS)),
        );
    });

    it("asks blocks_sight with the cell's value and position, and works on a TileMap layer", () => {
        const map = TileMap.from_ascii(
            ["....", ".#..", "...."],
            { ".": 0, "#": 1 },
            16,
            0,
        );
        const layer = map.layer(TileMap.GROUND);
        const asked: string[] = [];
        const cells = field_of_view(layer, { x: 0, y: 1 }, 5, {
            blocks_sight: (value, x, y) => {
                asked.push(key(x, y));
                return value === 1;
            },
        });
        expect(asked.length).toBeGreaterThan(0);
        expect(seen_set(cells).has(key(1, 1))).toBe(true);
        expect(seen_set(cells).has(key(3, 1))).toBe(false);
    });
});

describe("FogOfWar", () => {
    const cave = grid_of([
        "....#.......",
        "....#.......",
        "....#.......",
        "............",
        "....#.......",
    ]);

    it("starts unseen and shows what a viewer sees", () => {
        const fog = new FogOfWar(cave, WALLS);
        expect(fog.width).toBe(12);
        expect(fog.height).toBe(5);
        expect(fog.state_at(0, 0)).toBe("unseen");
        expect(fog.seen_count).toBe(0);
        fog.update([{ x: 1, y: 1, radius: 3 }]);
        expect(fog.state_at(1, 1)).toBe("visible");
        expect(fog.is_visible(2, 2)).toBe(true);
        expect(fog.state_at(9, 1)).toBe("unseen");
        expect(fog.visible_count).toBe(fog.seen_count);
        expect(fog.visible_count).toBe(
            field_of_view(cave, { x: 1, y: 1 }, 3, WALLS).length,
        );
    });

    it("keeps seen cells seen when the viewer leaves", () => {
        const fog = new FogOfWar(cave, WALLS);
        const scout: FogViewer = { id: "scout", x: 1, y: 1, radius: 3 };
        fog.update([scout]);
        const first = fog.seen_count;
        fog.update([{ ...scout, x: 8, y: 3 }]);
        expect(fog.state_at(1, 1)).toBe("seen");
        expect(fog.is_seen(1, 1)).toBe(true);
        expect(fog.is_visible(1, 1)).toBe(false);
        expect(fog.state_at(8, 3)).toBe("visible");
        expect(fog.seen_count).toBeGreaterThan(first);
        fog.update([]);
        expect(fog.visible_count).toBe(0);
        expect(fog.state_at(8, 3)).toBe("seen");
    });

    it("adds two viewers up, and one leaving keeps what the other sees", () => {
        const fog = new FogOfWar(cave, WALLS);
        const a: FogViewer = { id: "a", x: 1, y: 1, radius: 2 };
        const b: FogViewer = { id: "b", x: 2, y: 2, radius: 2 };
        fog.update([a, b]);
        const both = new Set([
            ...seen_set(field_of_view(cave, a, 2, WALLS)),
            ...seen_set(field_of_view(cave, b, 2, WALLS)),
        ]);
        expect(fog.visible_count).toBe(both.size);
        const changes = fog.update([b]);
        const only_b = seen_set(field_of_view(cave, b, 2, WALLS));
        expect(fog.visible_count).toBe(only_b.size);
        expect(changes.hidden).toBe(both.size - only_b.size);
        expect(changes.shown).toBe(0);
        expect(changes.recomputed).toBe(0);
        expect(fog.is_visible(2, 2)).toBe(true);
    });

    it("recomputes only viewers that moved, and says what changed", () => {
        const fog = new FogOfWar(cave, WALLS);
        const viewers: FogViewer[] = [
            { id: 1, x: 1, y: 1, radius: 3 },
            { id: 2, x: 9, y: 2, radius: 3 },
        ];
        const first = fog.update(viewers);
        expect(first.recomputed).toBe(2);
        expect(first.seen).toBe(fog.seen_count);
        expect(first.shown).toBe(fog.visible_count);
        const still = fog.update(viewers.map((viewer) => ({ ...viewer })));
        expect(still).toEqual({ recomputed: 0, seen: 0, shown: 0, hidden: 0 });
        const version = fog.version;
        const moved = fog.update([viewers[0], { ...viewers[1], x: 10 }]);
        expect(moved.recomputed).toBe(1);
        expect(fog.version).toBeGreaterThan(version);
        // Viewers without an id are told apart by their place in the list.
        const by_index = new FogOfWar(cave, WALLS);
        by_index.update([{ x: 1, y: 1, radius: 2 }]);
        expect(by_index.update([{ x: 1, y: 1, radius: 2 }]).recomputed).toBe(0);
    });

    it("tells about newly seen cells once, so a game can make treasure appear", () => {
        const fog = new FogOfWar(cave, WALLS);
        const events: FogSeenEvent[] = [];
        fog.events.attach(FogSeenEvent, (event) => {
            events.push(event);
        });
        fog.update([{ id: 0, x: 1, y: 1, radius: 2 }]);
        expect(events.length).toBe(1);
        expect(events[0].cells.length).toBe(fog.seen_count);
        fog.update([{ id: 0, x: 1, y: 2, radius: 2 }]);
        const total = events.reduce(
            (sum, event) => sum + event.cells.length,
            0,
        );
        expect(total).toBe(fog.seen_count);
        const all = new Set(
            events.flatMap((event) =>
                event.cells.map((cell) => key(cell.x, cell.y)),
            ),
        );
        expect(all.size).toBe(total);
        // Walking back over known ground tells nothing.
        fog.update([{ id: 0, x: 1, y: 1, radius: 2 }]);
        expect(events.length).toBe(2);
    });

    it("follows a change of the map once told, and reveal_all and forget", () => {
        const door = grid_of(["..#..", "..#..", "..#.."]);
        const fog = new FogOfWar(door, WALLS);
        const viewer = { id: "v", x: 0, y: 1, radius: 6 };
        fog.update([viewer]);
        expect(fog.is_visible(4, 1)).toBe(false);
        door.set(2, 1, ".");
        fog.update([viewer]);
        expect(fog.is_visible(4, 1)).toBe(false);
        fog.changed(2, 1);
        const changes = fog.update([viewer]);
        expect(changes.recomputed).toBe(1);
        expect(fog.is_visible(4, 1)).toBe(true);
        fog.reveal_all();
        expect(fog.seen_count).toBe(15);
        expect(fog.state_at(4, 0)).not.toBe("unseen");
        fog.forget();
        expect(fog.seen_count).toBe(fog.visible_count);
        expect(fog.state_at(0, 1)).toBe("visible");
    });

    it("answers unseen outside the grid and takes viewers between cells", () => {
        const fog = new FogOfWar(cave, WALLS);
        fog.update([
            { x: 1.7, y: 1.2, radius: 1 },
            { x: -3, y: 2, radius: 4 },
        ]);
        expect(fog.is_visible(1, 1)).toBe(true);
        expect(fog.state_at(-1, 0)).toBe("unseen");
        expect(fog.state_at(0, 99)).toBe("unseen");
    });

    it("never forgets a seen cell over a long random walk, and agrees with fresh views", () => {
        const grid = random_map(9, 40, 0.25);
        const fog = new FogOfWar(grid, WALLS);
        const random = new SeededRandom(3);
        const walkers: { id: number; x: number; y: number; radius: number }[] =
            [];
        for (let i = 0; i < 5; i++) {
            walkers.push({
                id: i,
                x: random.int(0, 39),
                y: random.int(0, 39),
                radius: 5,
            });
        }
        let seen_before = new Uint8Array(40 * 40);
        for (let step = 0; step < 60; step++) {
            for (const walker of walkers) {
                walker.x = Math.max(
                    0,
                    Math.min(39, walker.x + random.int(-2, 2)),
                );
                walker.y = Math.max(
                    0,
                    Math.min(39, walker.y + random.int(-2, 2)),
                );
            }
            const live = walkers.slice(0, step % 7 === 0 ? 3 : 5);
            fog.update(live.map((walker) => ({ ...walker })));
            const visible = new Set<string>();
            for (const walker of live) {
                for (const cell of field_of_view(
                    grid,
                    walker,
                    walker.radius,
                    WALLS,
                )) {
                    visible.add(key(cell.x, cell.y));
                }
            }
            const now = new Uint8Array(40 * 40);
            for (let y = 0; y < 40; y++) {
                for (let x = 0; x < 40; x++) {
                    const state = fog.state_at(x, y);
                    expect(state === "visible").toBe(visible.has(key(x, y)));
                    if (seen_before[y * 40 + x] === 1) {
                        expect(state).not.toBe("unseen");
                    }
                    now[y * 40 + x] = state === "unseen" ? 0 : 1;
                }
            }
            seen_before = now;
            expect(fog.visible_count).toBe(visible.size);
        }
    });
});

describe("draw_fog", () => {
    const grid = grid_of(["...", "...", "..."]);

    it("turns the fog into pixels: unseen opaque, seen dimmed, visible clear", () => {
        const fog = new FogOfWar(grid, WALLS);
        fog.update([{ x: 0, y: 0, radius: 1 }]);
        fog.update([{ x: 0, y: 1, radius: 0 }]);
        const pixels = new Uint8ClampedArray(9 * 4);
        fog_pixels(fog, pixels, { unseen_color: "#102030", seen_alpha: 0.5 });
        const at = (x: number, y: number): number[] =>
            Array.from(pixels.slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4));
        expect(at(0, 1)).toEqual([16, 32, 48, 0]);
        expect(at(0, 0)).toEqual([16, 32, 48, 128]);
        expect(at(2, 2)).toEqual([16, 32, 48, 255]);
    });

    it("draws one picture of the fog scaled to the cells, redrawn only after a change", () => {
        const fog = new FogOfWar(grid, WALLS);
        const puts: number[] = [];
        const drawn: unknown[][] = [];
        const picture = {
            width: 3,
            height: 3,
            getContext: () => ({
                createImageData: (w: number, h: number) => ({
                    width: w,
                    height: h,
                    data: new Uint8ClampedArray(w * h * 4),
                }),
                putImageData: () => {
                    puts.push(fog.version);
                },
            }),
        };
        const context = {
            imageSmoothingEnabled: true,
            globalCompositeOperation: "source-over",
            fillStyle: "",
            save: () => undefined,
            restore: () => undefined,
            drawImage: (...args: unknown[]) => {
                drawn.push(args);
            },
        } as unknown as CanvasRenderingContext2D;
        const options = {
            make_canvas: () => picture as unknown as OffscreenCanvas,
            x: 10,
            y: 20,
        };
        draw_fog(context, fog, 16, options);
        draw_fog(context, fog, 16, options);
        expect(puts.length).toBe(1);
        expect(drawn[0].slice(1)).toEqual([10, 20, 48, 48]);
        fog.update([{ x: 1, y: 1, radius: 1 }]);
        draw_fog(context, fog, 16, { ...options, soft: true });
        expect(puts.length).toBe(2);
        // A grey wash over what was seen: a second picture, drawn as saturation.
        draw_fog(context, fog, 16, { ...options, grey_seen: true });
        expect(drawn.length).toBe(5);
    });

    it("does nothing where no canvas can be made", () => {
        const fog = new FogOfWar(grid, WALLS);
        const context = {
            drawImage: () => {
                throw new Error("drawn");
            },
        } as unknown as CanvasRenderingContext2D;
        expect(() =>
            draw_fog(context, fog, 8, { make_canvas: () => null }),
        ).not.toThrow();
    });
});

describe("visibility, measured", () => {
    it("updates a 200 x 200 fog for 100 moving viewers well inside a frame", () => {
        const grid = random_map(42, 200, 0.12);
        const fog = new FogOfWar(grid, WALLS);
        const random = new SeededRandom(1);
        const viewers: { id: number; x: number; y: number; radius: number }[] =
            [];
        for (let i = 0; i < 100; i++) {
            viewers.push({
                id: i,
                x: random.int(0, 199),
                y: random.int(0, 199),
                radius: 8,
            });
        }
        fog.update(viewers);
        let best = Infinity;
        for (let round = 0; round < 8; round++) {
            for (const viewer of viewers) {
                viewer.x = (viewer.x + 1) % 200;
            }
            const start = performance.now();
            const changes = fog.update(
                viewers.map((viewer) => ({ ...viewer })),
            );
            best = Math.min(best, performance.now() - start);
            expect(changes.recomputed).toBe(100);
        }
        expect(best).toBeLessThan(1000 / 60);
    });
});
