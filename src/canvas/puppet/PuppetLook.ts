import { MarkPicture } from "./MarkSheet";
import { PartMesh } from "./PartMesh";
import { MarkBlend } from "./RigData";

/** Makes the canvas a puppet lays a part's look into; null when there is none to make (no DOM). */
export type MakePuppetCanvas = (
    width: number,
    height: number,
) => HTMLCanvasElement | OffscreenCanvas | null;

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas from the page's document, else an `OffscreenCanvas`, else none. */
export function default_puppet_canvas(
    width: number,
    height: number,
): HTMLCanvasElement | OffscreenCanvas | null {
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }
    return null;
}

/** A tint layer of a part: where its grey shading lies in the part's atlas, and the colour. */
export interface LookLayer {
    readonly x: number;
    readonly y: number;
    readonly tint: string;
}

/** A mark laid onto a part. */
export interface LookMark {
    readonly picture: MarkPicture;
    /** From the mark picture's pixels to the part's pixels. */
    readonly transform: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
    ];
    readonly tint: string | null;
    readonly blend: MarkBlend;
    readonly opacity: number;
    /** `[x, y]` in the part's atlas of what it is clipped to: a layer's rectangle, or the part's own. */
    readonly clip: readonly [number, number];
}

/** What a part looks like: its pixels, its tints, its marks and its moved mesh. */
export interface LookInput {
    readonly image: CanvasImageSource;
    readonly source_x: number;
    readonly source_y: number;
    readonly width: number;
    readonly height: number;
    readonly layers: readonly LookLayer[];
    readonly marks: readonly LookMark[];
    readonly mesh: PartMesh | null;
    /** The mesh's moved points; null when it doesn't move. */
    readonly deformed: Float64Array | null;
}

/** A part's look laid into a canvas of its own: drawn instead of the part, `shift` part pixels off. */
export interface BakedLook {
    readonly canvas: HTMLCanvasElement | OffscreenCanvas;
    readonly width: number;
    readonly height: number;
    /** Where the canvas's top left lies in the part's pixels (left of and above it when the mesh grew). */
    readonly shift_x: number;
    readonly shift_y: number;
}

/**
 * Lays parts' looks into canvases once per change, so drawing a puppet stays one `drawImage` per
 * part: the part, each tint layer multiplied with its colour and laid over it, each mark clipped
 * to the part (or its skin) and multiplied or laid on, then the whole moved through the mesh.
 */
export class PuppetBaker {
    private readonly scratch: (HTMLCanvasElement | OffscreenCanvas | null)[] = [
        null,
        null,
    ];

    public constructor(private readonly make_canvas: MakePuppetCanvas) {}

    /** A canvas can be made here. */
    public get can_bake(): boolean {
        return this.scratch_canvas(0, 1, 1) !== null;
    }

    /** The look laid into `previous`'s canvas (or a new one); null when no canvas can be made. */
    public bake(
        input: LookInput,
        previous: BakedLook | null,
    ): BakedLook | null {
        const width = input.width;
        const height = input.height;
        let image: CanvasImageSource = input.image;
        let source_x = input.source_x;
        let source_y = input.source_y;
        if (input.layers.length > 0 || input.marks.length > 0) {
            const composed = this.compose(input);
            if (composed === null) {
                return null;
            }
            image = composed;
            source_x = 0;
            source_y = 0;
        }
        let left = 0;
        let top = 0;
        let out_width = width;
        let out_height = height;
        const deformed = input.deformed;
        if (input.mesh !== null && deformed !== null) {
            const box = PartMesh.box_of(deformed);
            left = Math.floor(Math.min(box[0], 0)) - 1;
            top = Math.floor(Math.min(box[1], 0)) - 1;
            out_width = Math.ceil(Math.max(box[2], width)) + 1 - left;
            out_height = Math.ceil(Math.max(box[3], height)) + 1 - top;
        }
        let canvas = previous?.canvas ?? null;
        if (canvas === null) {
            canvas = this.make_canvas(out_width, out_height);
            if (canvas === null) {
                return null;
            }
        }
        canvas.width = out_width;
        canvas.height = out_height;
        const context = canvas.getContext("2d") as Context2D | null;
        if (context === null) {
            return null;
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, out_width, out_height);
        if (input.mesh !== null && deformed !== null) {
            input.mesh.draw(
                context,
                image,
                source_x,
                source_y,
                width,
                height,
                deformed,
                [1, 0, 0, 1, 0, 0],
                -left,
                -top,
                0.5,
            );
            context.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            context.drawImage(
                image,
                source_x,
                source_y,
                width,
                height,
                0,
                0,
                width,
                height,
            );
        }
        return {
            canvas,
            width: out_width,
            height: out_height,
            shift_x: left,
            shift_y: top,
        };
    }

    /** The part with its tints and marks, in a scratch canvas of its size. */
    private compose(
        input: LookInput,
    ): HTMLCanvasElement | OffscreenCanvas | null {
        const width = input.width;
        const height = input.height;
        const part = this.scratch_canvas(0, width, height);
        const work = this.scratch_canvas(1, width, height);
        if (part === null || work === null) {
            return null;
        }
        const target = part.getContext("2d") as Context2D | null;
        const layer = work.getContext("2d") as Context2D | null;
        if (target === null || layer === null) {
            return null;
        }
        const image = input.image;
        reset(target, width, height);
        target.drawImage(
            image,
            input.source_x,
            input.source_y,
            width,
            height,
            0,
            0,
            width,
            height,
        );
        for (const tint of input.layers) {
            reset(layer, width, height);
            layer.drawImage(
                image,
                tint.x,
                tint.y,
                width,
                height,
                0,
                0,
                width,
                height,
            );
            // The colour times the shading, then the layer's own outline again.
            layer.globalCompositeOperation = "multiply";
            layer.fillStyle = tint.tint;
            layer.fillRect(0, 0, width, height);
            layer.globalCompositeOperation = "destination-in";
            layer.drawImage(
                image,
                tint.x,
                tint.y,
                width,
                height,
                0,
                0,
                width,
                height,
            );
            target.drawImage(work, 0, 0);
        }
        for (const mark of input.marks) {
            const picture = mark.picture;
            const mark_image = picture.sheet.image;
            if (mark_image === null) {
                continue;
            }
            reset(layer, width, height);
            const m = mark.transform;
            layer.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
            layer.drawImage(
                mark_image,
                picture.source_x,
                picture.source_y,
                picture.width,
                picture.height,
                0,
                0,
                picture.width,
                picture.height,
            );
            if (mark.tint !== null) {
                layer.globalCompositeOperation = "multiply";
                layer.fillStyle = mark.tint;
                layer.fillRect(0, 0, picture.width, picture.height);
                layer.globalCompositeOperation = "destination-in";
                layer.drawImage(
                    mark_image,
                    picture.source_x,
                    picture.source_y,
                    picture.width,
                    picture.height,
                    0,
                    0,
                    picture.width,
                    picture.height,
                );
            }
            // Clipped to the part's outline (or its skin): nothing reaches past it.
            layer.setTransform(1, 0, 0, 1, 0, 0);
            layer.globalCompositeOperation = "destination-in";
            layer.drawImage(
                image,
                mark.clip[0],
                mark.clip[1],
                width,
                height,
                0,
                0,
                width,
                height,
            );
            target.globalAlpha = mark.opacity;
            target.globalCompositeOperation =
                mark.blend === "multiply" ? "multiply" : "source-over";
            target.drawImage(work, 0, 0);
            target.globalAlpha = 1;
            target.globalCompositeOperation = "source-over";
        }
        return part;
    }

    /** One of the two scratch canvases, at least `width` x `height` and cleared by the caller. */
    private scratch_canvas(
        index: number,
        width: number,
        height: number,
    ): HTMLCanvasElement | OffscreenCanvas | null {
        let canvas = this.scratch[index];
        if (canvas === null) {
            canvas = this.make_canvas(Math.max(1, width), Math.max(1, height));
            this.scratch[index] = canvas;
        }
        if (canvas === null) {
            return null;
        }
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return canvas;
    }
}

/** Plain drawing again, nothing on it. */
function reset(context: Context2D, width: number, height: number): void {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
}
