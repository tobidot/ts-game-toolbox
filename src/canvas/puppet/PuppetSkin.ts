import { SkinData } from "./RigData";
import { RgbaPixels } from "./SoftMesh";
import { read_pixels, SoftSkin } from "./SoftSkin";

const DEGREES = Math.PI / 180;

/**
 * One part of a skin, ready to draw: its rectangle of the picture and the transform that puts it
 * on its bone (turned by its rotation, its pivot on the bone's joint, `1 / resolution` in size).
 */
export interface PuppetPart {
    readonly slot: string;
    readonly source_x: number;
    readonly source_y: number;
    readonly width: number;
    readonly height: number;
    /** Six numbers (`a, b, c, d, e, f`) from the part's pixels to its bone's frame. */
    readonly transform: Float64Array;
    /** Its tint layers by name: `[x, y]` of each layer's rectangle (as large as the part's) in the atlas. */
    readonly layers?: ReadonlyMap<string, readonly [number, number]>;
}

/**
 * A set of parts by slot name, in one picture: what a puppet wears. Skins of rigs with the same
 * skeleton fit each other's puppets (`puppet.set_skin(other_rig)`), which is reskinning.
 */
export class PuppetSkin {
    public readonly parts: ReadonlyMap<string, PuppetPart>;
    /**
     * A soft skin (since step 41): whole pictures on a grid that bends with the bones, drawn
     * instead of parts. Null for a skin of cut-out parts.
     */
    public readonly soft: SoftSkin | null;
    private picture: CanvasImageSource | null;
    /** The atlas's pixels once read; undefined before. */
    private read: RgbaPixels | null | undefined = undefined;

    public constructor(
        public readonly name: string,
        /** The skeleton the parts are made for (the rig's `skeleton`). */
        public readonly skeleton: string,
        parts: ReadonlyMap<string, PuppetPart>,
        image: CanvasImageSource | null = null,
        soft: SoftSkin | null = null,
    ) {
        this.parts = parts;
        this.soft = soft;
        this.picture = null;
        this.image = image;
    }

    /** The atlas; null until it arrives. */
    public get image(): CanvasImageSource | null {
        return this.picture;
    }

    public set image(image: CanvasImageSource | null) {
        this.picture = image;
        this.read = undefined;
        if (this.soft !== null) {
            this.soft.image = image;
        }
    }

    /**
     * The atlas's pixels, read once (a soft skin's are its `soft.pixels`); null where they can't be
     * read (no canvas, another origin, no picture yet). Set them for a test. Hit shapes come from them.
     */
    public get pixels(): RgbaPixels | null {
        if (this.soft !== null) {
            return this.soft.pixels;
        }
        if (this.read === undefined) {
            if (this.picture === null) {
                return null;
            }
            this.read = read_pixels(this.picture);
        }
        return this.read;
    }

    public set pixels(pixels: RgbaPixels | null) {
        if (this.soft !== null) {
            this.soft.pixels = pixels;
            return;
        }
        this.read = pixels;
    }

    /**
     * A skin from data. `has_slot` says which slots the rig has; a part for any other throws.
     */
    public static from_data(
        name: string,
        skeleton: string,
        data: SkinData,
        has_slot: (slot: string) => boolean,
        image: CanvasImageSource | null = null,
    ): PuppetSkin {
        const resolution = data.resolution ?? 1;
        if (!(resolution > 0)) {
            throw new Error(`skin "${name}": resolution must be above 0`);
        }
        const parts = new Map<string, PuppetPart>();
        for (const [slot, part] of Object.entries(data.attachments ?? {})) {
            if (!has_slot(slot)) {
                throw new Error(`skin "${name}": no slot "${slot}"`);
            }
            const rect = part.rect;
            const pivot = part.pivot;
            if (
                !Array.isArray(rect) ||
                rect.length !== 4 ||
                !rect.every(Number.isFinite) ||
                !Array.isArray(pivot) ||
                pivot.length !== 2 ||
                !pivot.every(Number.isFinite)
            ) {
                throw new Error(
                    `skin "${name}", slot "${slot}": rect [x, y, width, height] and pivot [x, y] must be numbers`,
                );
            }
            let layers: Map<string, readonly [number, number]> | undefined;
            for (const [layer, box] of Object.entries(part.layers ?? {})) {
                if (
                    !Array.isArray(box) ||
                    box.length !== 4 ||
                    !box.every(Number.isFinite) ||
                    box[2] !== rect[2] ||
                    box[3] !== rect[3]
                ) {
                    throw new Error(
                        `skin "${name}", slot "${slot}": layer "${layer}" must be [x, y, width, height] as large as the part`,
                    );
                }
                layers = layers ?? new Map();
                layers.set(layer, [box[0], box[1]]);
            }
            parts.set(slot, {
                ...(layers === undefined ? {} : { layers }),
                slot,
                source_x: rect[0],
                source_y: rect[1],
                width: rect[2],
                height: rect[3],
                transform: part_transform(
                    pivot,
                    part.rotation ?? 0,
                    resolution,
                ),
            });
        }
        const soft =
            data.soft === undefined
                ? null
                : new SoftSkin(name, data.soft, resolution);
        return new PuppetSkin(name, skeleton, parts, image, soft);
    }
}

/**
 * The six numbers (`a, b, c, d, e, f`) from a part's pixels to the frame it hangs in: turned by
 * `rotation` degrees, `pivot` on the frame's origin, `1 / resolution` in size.
 */
export function part_transform(
    pivot: readonly [number, number],
    rotation: number,
    resolution: number,
): Float64Array {
    const radians = rotation * DEGREES;
    const cos = Math.cos(radians) / resolution;
    const sin = Math.sin(radians) / resolution;
    return Float64Array.of(
        cos,
        sin,
        -sin,
        cos,
        -(cos * pivot[0] - sin * pivot[1]),
        -(sin * pivot[0] + cos * pivot[1]),
    );
}
