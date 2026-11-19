import { SkinData } from "./RigData";

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
}

/**
 * A set of parts by slot name, in one picture: what a puppet wears. Skins of rigs with the same
 * skeleton fit each other's puppets (`puppet.set_skin(other_rig)`), which is reskinning.
 */
export class PuppetSkin {
    public readonly parts: ReadonlyMap<string, PuppetPart>;

    public constructor(
        public readonly name: string,
        /** The skeleton the parts are made for (the rig's `skeleton`). */
        public readonly skeleton: string,
        parts: ReadonlyMap<string, PuppetPart>,
        /** The atlas; null until it arrives. */
        public image: CanvasImageSource | null = null,
    ) {
        this.parts = parts;
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
            parts.set(slot, {
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
        return new PuppetSkin(name, skeleton, parts, image);
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
