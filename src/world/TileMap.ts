import { Grid2D } from "../data/Grid2D";
import { RectI } from "../geometries/Rect";

/** Size of a tile map: tiles across, tiles down and the edge length of one tile in world units. */
export interface TileMapOptions {
    width: number;
    height: number;
    tile_size: number;
}

/** One tile of a layer with its position: the answer of `TileMap.tiles_in()`. */
export interface TileEntry<T> {
    x: number;
    y: number;
    value: T;
}

/**
 * One named layer of a `TileMap`: a `Grid2D` that knows its name and whether it is drawn.
 * A map keeps a static ground layer (floor, walls) apart from a layer of things that move
 * (boxes, the player), and a renderer skips the layers that are not `visible`.
 */
export class TileLayer<T> extends Grid2D<T> {
    public visible = true;

    public constructor(
        public readonly name: string,
        width: number,
        height: number,
        fill: T | ((x: number, y: number) => T),
    ) {
        super(width, height, fill);
    }

    /** A copy with the same name, visibility and values, independent storage. */
    public clone(): TileLayer<T> {
        const copy = new TileLayer<T>(
            this.name,
            this.width,
            this.height,
            (x, y) => this.get(x, y),
        );
        copy.visible = this.visible;
        return copy;
    }
}

/**
 * A tile map: several `TileLayer`s of the same size, and the arithmetic between tile
 * positions and world coordinates. Tile (x, y) covers the world rectangle from
 * `(x * tile_size, y * tile_size)` with edge `tile_size`. What a tile value means is the
 * game's business; the map answers where things are and which tiles a rectangle touches.
 *
 * The constructor creates the first layer, `TileMap.GROUND`, filled with `fill`.
 */
export class TileMap<T> {
    /** The name of the layer every map starts with. */
    public static readonly GROUND = "ground";

    public readonly width: number;
    public readonly height: number;
    public readonly tile_size: number;
    private readonly _layers: TileLayer<T>[] = [];
    private readonly _fill: T;

    public constructor(options: TileMapOptions, fill: T) {
        if (!(options.tile_size > 0)) {
            throw new Error(
                `TileMap: tile_size must be > 0, got ${options.tile_size}`,
            );
        }
        this.width = options.width;
        this.height = options.height;
        this.tile_size = options.tile_size;
        this._fill = fill;
        this.add_layer(TileMap.GROUND, fill);
    }

    /**
     * Parses an ASCII picture into the ground layer: one character per tile, one string per
     * row, `legend` maps characters to tile values. The map is as wide as the longest row;
     * short rows and characters missing from the legend become `fallback`.
     */
    public static from_ascii<T>(
        rows: readonly string[],
        legend: Record<string, T>,
        tile_size: number,
        fallback: T,
    ): TileMap<T> {
        const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const map = new TileMap<T>(
            { width, height: rows.length, tile_size },
            fallback,
        );
        const ground = map.layer(TileMap.GROUND);
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const character = row[x];
                if (Object.hasOwn(legend, character)) {
                    ground.set(x, y, legend[character]);
                }
            }
        });
        return map;
    }

    /** Adds a layer filled with `fill` on top of the existing ones; names are unique. */
    public add_layer(name: string, fill: T): TileLayer<T> {
        if (this._layers.some((layer) => layer.name === name)) {
            throw new Error(`TileMap: layer "${name}" exists already`);
        }
        const layer = new TileLayer<T>(name, this.width, this.height, fill);
        this._layers.push(layer);
        return layer;
    }

    /** The layer called `name`; throws when there is none. */
    public layer(name: string): TileLayer<T> {
        const layer = this._layers.find((candidate) => candidate.name === name);
        if (layer === undefined) {
            throw new Error(`TileMap: no layer "${name}"`);
        }
        return layer;
    }

    /** All layers, bottom to top, in the order they were added. */
    public layers(): TileLayer<T>[] {
        return this._layers.slice();
    }

    /** `true` when (x, y) is a tile position of this map. */
    public is_inside(x: number, y: number): boolean {
        return this._layers[0].is_inside(x, y);
    }

    /** The tile position that contains the world point; may lie outside the map. */
    public world_to_tile(
        world_x: number,
        world_y: number,
    ): { x: number; y: number } {
        return {
            x: Math.floor(world_x / this.tile_size),
            y: Math.floor(world_y / this.tile_size),
        };
    }

    /** The world rectangle tile (x, y) covers. */
    public tile_to_world(x: number, y: number): RectI {
        return {
            left: x * this.tile_size,
            top: y * this.tile_size,
            width: this.tile_size,
            height: this.tile_size,
        };
    }

    /** The value of `layer` under the world point, or `null` outside the map. */
    public tile_at(layer: string, world_x: number, world_y: number): T | null {
        const tile = this.world_to_tile(world_x, world_y);
        if (!this.is_inside(tile.x, tile.y)) return null;
        return this.layer(layer).get(tile.x, tile.y);
    }

    /** Every tile rectangle of `layer` whose value satisfies `predicate`, for collision lists. */
    public rects_where(
        layer: string,
        predicate: (value: T) => boolean,
    ): RectI[] {
        const result: RectI[] = [];
        for (const cell of this.layer(layer).cells()) {
            if (predicate(cell.value)) {
                result.push(this.tile_to_world(cell.x, cell.y));
            }
        }
        return result;
    }

    /**
     * Tiles of `layer` that intersect the world rectangle, row by row. A rectangle that ends
     * exactly on a tile edge does not touch the next tile; one with no width or height is a
     * point and touches the tile it lies in.
     */
    public tiles_in(layer: string, rect: RectI): TileEntry<T>[] {
        const grid = this.layer(layer);
        const first = this.world_to_tile(rect.left, rect.top);
        const last_x = Math.max(
            first.x,
            Math.ceil((rect.left + rect.width) / this.tile_size) - 1,
        );
        const last_y = Math.max(
            first.y,
            Math.ceil((rect.top + rect.height) / this.tile_size) - 1,
        );
        const result: TileEntry<T>[] = [];
        for (
            let y = Math.max(0, first.y);
            y <= Math.min(this.height - 1, last_y);
            y++
        ) {
            for (
                let x = Math.max(0, first.x);
                x <= Math.min(this.width - 1, last_x);
                x++
            ) {
                result.push({ x, y, value: grid.get(x, y) });
            }
        }
        return result;
    }

    /** A copy with every layer cloned: a snapshot for undo, a scratch map for a search. */
    public clone(): TileMap<T> {
        const copy = new TileMap<T>(
            {
                width: this.width,
                height: this.height,
                tile_size: this.tile_size,
            },
            this._fill,
        );
        copy._layers.length = 0;
        for (const layer of this._layers) copy._layers.push(layer.clone());
        return copy;
    }
}
