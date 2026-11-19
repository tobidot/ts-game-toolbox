/* eslint-disable @typescript-eslint/naming-convention -- DOM names: canvas options and picture sizes */
import { SoftSkinData } from "./RigData";
import type { Skeleton } from "./Skeleton";
import {
    parse_hex_color,
    rest_inverse_of,
    RgbaPixels,
    SoftMesh,
    SoftMeshPicture,
} from "./SoftMesh";

/** Reads a picture's pixels (null where it can't: no canvas, or a picture from another origin). */
export type ReadPixels = (image: CanvasImageSource) => RgbaPixels | null;

/** The default reader: the picture drawn into a canvas of its size and read back once. */
export function read_pixels(image: CanvasImageSource): RgbaPixels | null {
    const size = image_size(image);
    if (size === null || size.width === 0 || size.height === 0) {
        return null;
    }
    try {
        let context:
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D
            | null = null;
        if (typeof OffscreenCanvas !== "undefined") {
            context = new OffscreenCanvas(size.width, size.height).getContext(
                "2d",
                { willReadFrequently: true },
            );
        } else if (
            typeof document !== "undefined" &&
            !(
                typeof navigator !== "undefined" &&
                navigator.userAgent.includes("jsdom")
            )
        ) {
            const canvas = document.createElement("canvas");
            canvas.width = size.width;
            canvas.height = size.height;
            context = canvas.getContext("2d", { willReadFrequently: true });
        }
        if (context === null) {
            return null;
        }
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, size.width, size.height);
    } catch {
        return null;
    }
}

/** A picture's size in pixels; null when it has none yet. */
export function image_size(
    image: CanvasImageSource,
): { width: number; height: number } | null {
    const sized = image as {
        naturalWidth?: number;
        naturalHeight?: number;
        videoWidth?: number;
        videoHeight?: number;
        width?: number | { baseVal?: { value: number } };
        height?: number | { baseVal?: { value: number } };
    };
    if (typeof sized.naturalWidth === "number" && sized.naturalWidth > 0) {
        return { width: sized.naturalWidth, height: sized.naturalHeight ?? 0 };
    }
    if (typeof sized.videoWidth === "number" && sized.videoWidth > 0) {
        return { width: sized.videoWidth, height: sized.videoHeight ?? 0 };
    }
    if (typeof sized.width === "number" && typeof sized.height === "number") {
        return { width: sized.width, height: sized.height };
    }
    return null;
}

/**
 * A soft skin at run time (`PuppetSkin.soft`): its data, the grid sizes, and the meshes made from
 * its picture, one per cell size, shared by every puppet that wears it. `cell_size` is the grid
 * on the graphics card, `cpu_cell_size` the coarser one drawn triangle by triangle on the CPU;
 * change either at any time and the next draw makes (or takes from the cache) the mesh for it.
 */
export class SoftSkin {
    /** The grid's spacing on the graphics card, in atlas pixels. */
    public cell_size: number;
    /** The grid's spacing on the CPU, in atlas pixels. */
    public cpu_cell_size: number;
    /** The bone map's blur, in atlas pixels (changing it makes the meshes again). */
    public blur: number;
    /**
     * Reads the atlas's pixels for the grid and the bone maps; a test sets `pixels` instead. Where
     * nothing can be read, every cell is kept and the points bind by distance.
     */
    public read_pixels: ReadPixels = read_pixels;
    private picture: CanvasImageSource | null = null;
    private read: RgbaPixels | null | undefined = undefined;
    private for_texture: RgbaPixels | null | undefined = undefined;
    private meshes = new Map<string, SoftMesh>();
    private rest: Skeleton | null = null;
    private inverse: Float64Array | null = null;
    private colors = new Map<number, readonly [number, number, number]>();
    private pictures: SoftMeshPicture[] = [];
    private allowed: number[] = [];
    /** Grows with every new picture or binding, so a layer knows to upload again. */
    public version = 0;

    public constructor(
        public readonly name: string,
        public readonly data: SoftSkinData,
        /** Atlas pixels per rig unit. */
        public readonly resolution: number,
    ) {
        if (!Array.isArray(data.pictures) || data.pictures.length === 0) {
            throw new Error(`soft skin "${name}": no pictures`);
        }
        for (const [index, picture] of data.pictures.entries()) {
            const where = `soft skin "${name}", picture ${picture.name ?? index}`;
            if (!is_rect(picture.rect)) {
                throw new Error(
                    `${where}: rect must be [x, y, width, height] with a width and height above 0`,
                );
            }
            if (
                picture.map !== undefined &&
                (!is_rect(picture.map) ||
                    picture.map[2] !== picture.rect[2] ||
                    picture.map[3] !== picture.rect[3])
            ) {
                throw new Error(
                    `${where}: map must be [x, y, width, height] as large as the picture`,
                );
            }
            if (
                !Array.isArray(picture.origin) ||
                picture.origin.length !== 2 ||
                !picture.origin.every(Number.isFinite)
            ) {
                throw new Error(`${where}: origin must be [x, y]`);
            }
        }
        for (const [bone, color] of Object.entries(data.colors ?? {})) {
            if (parse_hex_color(color) === null) {
                throw new Error(
                    `soft skin "${name}": the colour of "${bone}" must be "#rrggbb"`,
                );
            }
        }
        this.cell_size = positive(data.cell_size, 12, `${name}: cell_size`);
        this.cpu_cell_size = positive(
            data.cpu_cell_size,
            32,
            `${name}: cpu_cell_size`,
        );
        this.blur = data.blur ?? 8;
        if (!(this.blur >= 0) || !Number.isFinite(this.blur)) {
            throw new Error(`soft skin "${name}": blur must be 0 or more`);
        }
    }

    /**
     * Binds the skin to its rig's bones (by name; throws on one the rig doesn't have) and its rest
     * pose: where each bone lies in the pictures.
     */
    public bind(rest: Skeleton): void {
        const index_of = (bone: string, what: string): number => {
            const index = rest.index_of(bone);
            if (index < 0) {
                throw new Error(
                    `soft skin "${this.name}": ${what}: no bone "${bone}"`,
                );
            }
            return index;
        };
        const colors = new Map<number, readonly [number, number, number]>();
        for (const [bone, color] of Object.entries(this.data.colors ?? {})) {
            colors.set(index_of(bone, "colors"), parse_hex_color(color)!);
        }
        const allowed =
            this.data.bones !== undefined
                ? this.data.bones.map((bone) => index_of(bone, "bones"))
                : colors.size > 0
                  ? [...colors.keys()].sort((a, b) => a - b)
                  : rest.names.map((_, index) => index);
        this.pictures = this.data.pictures.map((picture) => ({
            rect: picture.rect,
            map: picture.map ?? null,
            origin: picture.origin,
            bones:
                picture.bones === undefined
                    ? null
                    : picture.bones.map((bone) =>
                          index_of(bone, `picture ${picture.name ?? ""} bones`),
                      ),
        }));
        if (allowed.some((bone) => bone > 255)) {
            throw new Error(`soft skin "${this.name}": at most 256 bones`);
        }
        this.colors = colors;
        this.allowed = allowed;
        rest.reset_pose();
        rest.update();
        this.rest = rest;
        this.inverse = rest_inverse_of(rest);
        this.meshes.clear();
        this.version += 1;
    }

    /** The atlas; a new one makes the meshes again. */
    public get image(): CanvasImageSource | null {
        return this.picture;
    }

    public set image(image: CanvasImageSource | null) {
        if (image === this.picture) {
            return;
        }
        this.picture = image;
        this.read = undefined;
        this.for_texture = undefined;
        this.meshes.clear();
        this.version += 1;
    }

    /** The atlas's pixels, read once (null where they can't be read). Set them for a test. */
    public get pixels(): RgbaPixels | null {
        if (this.read === undefined) {
            this.read =
                this.picture === null ? null : this.read_pixels(this.picture);
        }
        return this.read;
    }

    public set pixels(pixels: RgbaPixels | null) {
        this.read = pixels;
        this.for_texture = undefined;
        this.meshes.clear();
        this.version += 1;
    }

    /**
     * The atlas for the graphics card: its pixels with the bone maps cleared, so a map never bleeds
     * into a picture at a small size; null where the pixels can't be read (the picture as it is then).
     */
    public get texture_pixels(): RgbaPixels | null {
        if (this.for_texture === undefined) {
            const pixels = this.pixels;
            if (pixels === null) {
                this.for_texture = null;
            } else {
                const data = new Uint8ClampedArray(pixels.data);
                for (const picture of this.pictures) {
                    if (picture.map === null) {
                        continue;
                    }
                    const [x, y, width, height] = picture.map;
                    for (
                        let row = y;
                        row < y + height && row < pixels.height;
                        row++
                    ) {
                        const from = (row * pixels.width + x) * 4;
                        data.fill(0, from, from + width * 4);
                    }
                }
                this.for_texture = {
                    width: pixels.width,
                    height: pixels.height,
                    data,
                };
            }
        }
        return this.for_texture;
    }

    /** The rest pose turned back, six numbers per bone (null until bound). */
    public get rest_inverse(): Float64Array | null {
        return this.inverse;
    }

    /** The bones a point may bind to, by number. */
    public get bones(): readonly number[] {
        return this.allowed;
    }

    /** The bone map's colours by bone number. */
    public get bone_colors(): ReadonlyMap<
        number,
        readonly [number, number, number]
    > {
        return this.colors;
    }

    /**
     * The mesh for a grid of `cell_size` pixels, made on first use from the picture and kept;
     * null while the skin isn't bound or has no picture.
     */
    public mesh(cell_size: number): SoftMesh | null {
        if (this.rest === null || this.picture === null) {
            return null;
        }
        const key = `${cell_size}:${this.blur}`;
        let mesh = this.meshes.get(key);
        if (mesh === undefined) {
            mesh = SoftMesh.from_picture({
                pixels: this.pixels,
                pictures: this.pictures,
                resolution: this.resolution,
                cell_size,
                blur: this.blur,
                colors: this.colors,
                bones: this.allowed,
                rest: this.rest,
            });
            this.meshes.set(key, mesh);
        }
        return mesh;
    }
}

function is_rect(
    value: unknown,
): value is readonly [number, number, number, number] {
    return (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every(Number.isFinite) &&
        value[2] > 0 &&
        value[3] > 0
    );
}

function positive(
    value: number | undefined,
    fallback: number,
    what: string,
): number {
    if (value === undefined) {
        return fallback;
    }
    if (!(value >= 1) || !Number.isFinite(value)) {
        throw new Error(`soft skin ${what} must be at least 1`);
    }
    return value;
}
