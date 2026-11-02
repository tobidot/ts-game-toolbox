import { describe, expect, it } from "vitest";
import { TileLayer, TileMap } from "./TileMap";

type Tile = "wall" | "floor" | "exit" | "void";
const legend: Record<string, Tile> = Object.fromEntries([
    ["#", "wall"],
    [".", "floor"],
    ["E", "exit"],
]);

function picture(): TileMap<Tile> {
    return TileMap.from_ascii<Tile>(
        ["#####", "#...#", "#.E", "#####"],
        legend,
        32,
        "void",
    );
}

describe("TileMap", () => {
    it("parses an ASCII picture into the ground layer, sized by the longest row", () => {
        const map = picture();
        expect(map.width).toBe(5);
        expect(map.height).toBe(4);
        expect(map.tile_size).toBe(32);
        const ground = map.layer(TileMap.GROUND);
        expect(ground).toBeInstanceOf(TileLayer);
        expect(ground.get(0, 0)).toBe("wall");
        expect(ground.get(1, 1)).toBe("floor");
        expect(ground.get(2, 2)).toBe("exit");
        // The short third row and a character not in the legend fall back.
        expect(ground.get(3, 2)).toBe("void");
        expect(ground.get(4, 2)).toBe("void");
        const odd = TileMap.from_ascii<Tile>(["#?"], legend, 8, "void");
        expect(odd.layer(TileMap.GROUND).row(0)).toEqual(["wall", "void"]);
    });

    it("keeps named layers and throws for a missing or a duplicate name", () => {
        const map = new TileMap<Tile>(
            { width: 3, height: 2, tile_size: 16 },
            "floor",
        );
        const objects = map.add_layer("objects", "void");
        objects.visible = false;
        expect(map.layers().map((layer) => layer.name)).toEqual([
            "ground",
            "objects",
        ]);
        expect(map.layer("objects")).toBe(objects);
        expect(map.layer("objects").visible).toBe(false);
        expect(() => map.layer("sky")).toThrow();
        expect(() => map.add_layer("objects", "void")).toThrow();
        expect(
            () => new TileMap({ width: 1, height: 1, tile_size: 0 }, 0),
        ).toThrow();
    });

    it("converts between world and tile coordinates at the edges", () => {
        const map = picture();
        expect(map.world_to_tile(0, 0)).toEqual({ x: 0, y: 0 });
        expect(map.world_to_tile(31.9, 31.9)).toEqual({ x: 0, y: 0 });
        expect(map.world_to_tile(32, 32)).toEqual({ x: 1, y: 1 });
        expect(map.world_to_tile(-1, 0)).toEqual({ x: -1, y: 0 });
        expect(map.tile_to_world(2, 1)).toEqual({
            left: 64,
            top: 32,
            width: 32,
            height: 32,
        });
        expect(map.is_inside(4, 3)).toBe(true);
        expect(map.is_inside(5, 3)).toBe(false);
        expect(map.tile_at("ground", 40, 40)).toBe("floor");
        expect(map.tile_at("ground", 159.9, 127.9)).toBe("wall");
        expect(map.tile_at("ground", 160, 0)).toBeNull();
        expect(map.tile_at("ground", -0.1, 0)).toBeNull();
    });

    it("lists the rectangles of the tiles a predicate selects", () => {
        const map = TileMap.from_ascii<Tile>(["#.", ".#"], legend, 10, "void");
        expect(map.rects_where("ground", (tile) => tile === "wall")).toEqual([
            { left: 0, top: 0, width: 10, height: 10 },
            { left: 10, top: 10, width: 10, height: 10 },
        ]);
        expect(map.rects_where("ground", (tile) => tile === "exit")).toEqual(
            [],
        );
    });

    it("finds the tiles a world rectangle intersects", () => {
        const map = picture();
        const positions = (rect: {
            left: number;
            top: number;
            width: number;
            height: number;
        }) => map.tiles_in("ground", rect).map((tile) => `${tile.x},${tile.y}`);
        // A 20x20 rectangle starting inside tile (0,0) and reaching into (1,0), (0,1), (1,1).
        expect(positions({ left: 20, top: 20, width: 20, height: 20 })).toEqual(
            ["0,0", "1,0", "0,1", "1,1"],
        );
        // Ending exactly on the tile edge does not touch the next tile.
        expect(positions({ left: 0, top: 0, width: 32, height: 32 })).toEqual([
            "0,0",
        ]);
        // A point.
        expect(positions({ left: 70, top: 40, width: 0, height: 0 })).toEqual([
            "2,1",
        ]);
        // Clipped to the map.
        expect(
            positions({ left: 140, top: 100, width: 100, height: 100 }),
        ).toEqual(["4,3"]);
        expect(
            positions({ left: 200, top: 200, width: 10, height: 10 }),
        ).toEqual([]);
        expect(
            map.tiles_in("ground", {
                left: 64,
                top: 64,
                width: 1,
                height: 1,
            })[0].value,
        ).toBe("exit");
    });

    it("clones every layer independently", () => {
        const map = picture();
        const objects = map.add_layer("objects", "void");
        objects.set(1, 1, "exit");
        objects.visible = false;
        const copy = map.clone();
        expect(copy.width).toBe(map.width);
        expect(copy.tile_size).toBe(map.tile_size);
        expect(copy.layers().map((layer) => layer.name)).toEqual([
            "ground",
            "objects",
        ]);
        expect(copy.layer("objects").get(1, 1)).toBe("exit");
        expect(copy.layer("objects").visible).toBe(false);
        copy.layer("ground").set(1, 1, "wall");
        copy.layer("objects").set(1, 1, "void");
        expect(map.layer("ground").get(1, 1)).toBe("floor");
        expect(map.layer("objects").get(1, 1)).toBe("exit");
        expect(
            new TileMap({ width: 0, height: 0, tile_size: 4 }, 1).clone().width,
        ).toBe(0);
    });
});
