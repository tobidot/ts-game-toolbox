import type { RgbaPixels } from "./SoftMesh";
import { read_pixels, ReadPixels } from "./SoftSkin";

/**
 * A part kit as plain data (since step 42): body parts in one atlas, each rendered on its own in
 * grey shading (with its outline) and a tint mask beside it, with its joint points. A creature
 * generator places parts on a skeleton, scales and tints them and paints them into a soft skin
 * (`compose_soft_skin()`). The shape of a catalogue entry's `rig` for such a picture
 * (`is_part_kit_data()` tells it from a puppet's, a wardrobe's and a mark sheet's).
 */
export interface PartKitData {
    /** What the kit is made for (`["quadruped"]`); a part may say for itself. */
    readonly kinds?: readonly string[];
    readonly parts: Readonly<Record<string, KitPartData>>;
}

/**
 * One part: its picture, its mask and its points, all in the atlas's pixels from the part's top
 * left. The part lies along the line from `pivot` to `tip`: placed on a bone, `pivot` sits on the
 * joint and `tip` on the bone's tip.
 */
export interface KitPartData {
    /** What it is: `head`, `jaw`, `torso`, `neck`, `tail`, `tail_tip`, `leg_upper`, `foot`, `wing`, `eye`, `horn`, ... */
    readonly role: string;
    /** What a game shows ("Schnauze"). Default: the id. */
    readonly title?: string;
    /** `[x, y, width, height]`: the part in grey (white where fully lit), with its outline. */
    readonly rect: readonly [number, number, number, number];
    /**
     * As large as `rect`: the tint mask. Red takes the main colour, green the second, blue the
     * accent; black keeps the picture as drawn (eyes, teeth). Its alpha is the part without its
     * outline (where parts of one picture overlap, their outlines are painted over).
     */
    readonly mask: readonly [number, number, number, number];
    readonly pivot: readonly [number, number];
    readonly tip: readonly [number, number];
    /** Named points: a head's `jaw` (the hinge), `chin`, `mouth`, `eye`, `horn`, `ear`; a torso's `back_*`; ... */
    readonly points?: Readonly<Record<string, readonly [number, number]>>;
    /** A head's lower jaw (a part's id); a head without one has no jaw. */
    readonly jaw?: string;
    /** A foot or a hand with claws. */
    readonly claws?: boolean;
    /** The kinds it fits; default the kit's. */
    readonly kinds?: readonly string[];
    /** How often it is picked against the others of its role. Default 1. */
    readonly weight?: number;
}

/** A catalogue `rig` that is a part kit (parts), not a puppet, a wardrobe or a mark sheet. */
export function is_part_kit_data(data: unknown): data is PartKitData {
    return (
        typeof data === "object" &&
        data !== null &&
        "parts" in data &&
        !("bones" in data) &&
        !("pieces" in data) &&
        !("marks" in data)
    );
}

/** A kit's part with its id. */
export interface KitPart extends KitPartData {
    readonly id: string;
}

/**
 * A part kit at run time: its data and its atlas, now or later (the shell's `references.part_kit(name)`
 * fills both from the catalogue). The atlas's pixels are read once (`pixels`); a test sets them.
 */
export class PartKit {
    /** Grows with new data or a new picture. */
    public version = 0;
    /** Reads the atlas's pixels; a test sets `pixels` instead. */
    public read_pixels: ReadPixels = read_pixels;
    private kit_data: PartKitData | null = null;
    private part_map = new Map<string, KitPart>();
    private picture: CanvasImageSource | null = null;
    private read: RgbaPixels | null | undefined = undefined;

    /** A kit from data (and its atlas, now or later); throws on data that doesn't hold together. */
    public static from_data(
        data: PartKitData,
        image: CanvasImageSource | null = null,
    ): PartKit {
        const kit = new PartKit();
        kit.set_data(data);
        kit.image = image;
        return kit;
    }

    /** Reads the data; throws with a clear message (a part without a rect, a jaw that isn't a part) and keeps what it had. */
    public set_data(data: PartKitData): void {
        if (
            typeof data !== "object" ||
            data === null ||
            typeof data.parts !== "object"
        ) {
            throw new Error("a part kit holds parts");
        }
        const parts = new Map<string, KitPart>();
        for (const [id, part] of Object.entries(data.parts)) {
            const where = `part "${id}"`;
            if (typeof part.role !== "string" || part.role === "") {
                throw new Error(`${where}: no role`);
            }
            for (const key of ["rect", "mask"] as const) {
                const rect = part[key];
                if (
                    !Array.isArray(rect) ||
                    rect.length !== 4 ||
                    !rect.every(Number.isFinite) ||
                    rect[2] <= 0 ||
                    rect[3] <= 0
                ) {
                    throw new Error(
                        `${where}: ${key} must be [x, y, width, height]`,
                    );
                }
            }
            if (
                part.mask[2] !== part.rect[2] ||
                part.mask[3] !== part.rect[3]
            ) {
                throw new Error(
                    `${where}: the mask must be as large as the part`,
                );
            }
            for (const key of ["pivot", "tip"] as const) {
                const point = part[key];
                if (
                    !Array.isArray(point) ||
                    point.length !== 2 ||
                    !point.every(Number.isFinite)
                ) {
                    throw new Error(`${where}: ${key} must be [x, y]`);
                }
            }
            if (
                part.pivot[0] === part.tip[0] &&
                part.pivot[1] === part.tip[1]
            ) {
                throw new Error(`${where}: pivot and tip are the same point`);
            }
            parts.set(id, { ...part, id });
        }
        for (const part of parts.values()) {
            if (part.jaw !== undefined && !parts.has(part.jaw)) {
                throw new Error(
                    `part "${part.id}": its jaw "${part.jaw}" is not a part`,
                );
            }
        }
        this.kit_data = data;
        this.part_map = parts;
        this.version += 1;
    }

    public get data(): PartKitData | null {
        return this.kit_data;
    }

    public get has_data(): boolean {
        return this.kit_data !== null;
    }

    /** The data and the pixels are there. */
    public get is_ready(): boolean {
        return this.kit_data !== null && this.pixels !== null;
    }

    public get image(): CanvasImageSource | null {
        return this.picture;
    }

    public set image(image: CanvasImageSource | null) {
        if (image === this.picture) {
            return;
        }
        this.picture = image;
        this.read = undefined;
        this.version += 1;
    }

    /** The atlas's pixels, read once (null without a picture or where it can't be read). */
    public get pixels(): RgbaPixels | null {
        if (this.read === undefined) {
            this.read =
                this.picture === null ? null : this.read_pixels(this.picture);
        }
        return this.read;
    }

    public set pixels(pixels: RgbaPixels | null) {
        this.read = pixels;
        this.version += 1;
    }

    public get parts(): ReadonlyMap<string, KitPart> {
        return this.part_map;
    }

    public part(id: string): KitPart | null {
        return this.part_map.get(id) ?? null;
    }

    /** The parts of a role that fit a kind (all of the role without one), in the data's order. */
    public parts_of(role: string, kind?: string): KitPart[] {
        const kit_kinds = this.kit_data?.kinds;
        return [...this.part_map.values()].filter((part) => {
            if (part.role !== role) {
                return false;
            }
            const kinds = part.kinds ?? kit_kinds;
            return (
                kind === undefined ||
                kinds === undefined ||
                kinds.includes(kind)
            );
        });
    }
}
