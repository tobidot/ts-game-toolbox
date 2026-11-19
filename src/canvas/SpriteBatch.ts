import { RectI } from "../geometries/Rect";
import type { AnimationPlayer } from "./animation/AnimationPlayer";
import type { SheetAnchor } from "./animation/SpriteSheet";

/**
 * The numbers kept per sprite: x, y, angle, width, height (as drawn), the source rectangle
 * (left, top, width, height), the anchor as drawn (x, y) and the flags.
 */
const FIELDS = 12;
/** Flag: the entry is a frame of a sheet, drawn from its source rectangle around its anchor. */
const FRAME = 1;
/** Flag: mirrored left to right around the anchor. */
const FLIPPED = 2;

/** Which transform the context holds while the batch draws. */
const ON_BASE = 0;
const ON_MIRROR = 1;
const ON_SPRITE = 2;

/** How `SpriteBatch.add_frame()` draws a frame of a sheet. */
export interface BatchFrameOptions {
    /** The point of the frame (picture pixels from its top left) drawn at x, y. Default: its middle. */
    readonly anchor?: SheetAnchor | null;
    /** Default 1: one pixel of the picture is one unit of the context. */
    readonly scale?: number;
    /** Mirrored left to right around the anchor. */
    readonly flip_x?: boolean;
    /** Radians, clockwise on the screen, around the anchor. Default 0. */
    readonly angle?: number;
    /**
     * The picture is this many times the size `rect` and `anchor` count in (a sheet's
     * `picture_scale` after `prescale()`): the source is read there, the drawn size stays.
     * Default 1.
     */
    readonly picture_scale?: number;
}

/** How `SpriteBatch.add_animation()` draws a player's frame. */
export interface BatchAnimationOptions {
    readonly scale?: number;
    readonly flip_x?: boolean;
    readonly angle?: number;
}

/** The sprites of one image, packed. */
interface ImageRun {
    readonly image: CanvasImageSource;
    values: Float64Array;
    count: number;
}

/**
 * Draws many sprites quickly: a game adds each one (an image, where its middle is, how it is
 * turned and how big it is drawn) and draws them all at once. The batch draws image by image,
 * so the browser switches pictures as seldom as it can, and gives each sprite exactly one
 * `setTransform`, worked out on top of the context's transform as it is at `draw()`: no
 * `save()`, `translate()`, `rotate()` and `restore()` per sprite. Afterwards the transform is
 * what it was.
 *
 * Frames of a sprite sheet go in with `add_frame()` (a source rectangle and an anchor) or
 * `add_animation(player, x, y)`; all frames of one sheet are one picture, so a crowd of a sheet
 * is drawn in one run. An unturned frame needs no transform of its own, and a run of mirrored
 * ones shares one: only where flipped and unflipped frames take turns does the batch switch.
 *
 * Drawing image by image changes which sprite lies on top: all sprites of the first image come
 * first. Within an image, sprites keep the order they were added in, so add them sorted (by y,
 * for a view from above at an angle) and a sheet's crowd overlaps right. Draw what must be on
 * top in a batch of its own. Angles are radians, clockwise on the screen (the canvas's
 * `rotate()`); a sprite at angle 0 faces right. The batch keeps its storage between frames, so
 * a frame allocates nothing once the crowd has stopped growing.
 */
export class SpriteBatch {
    private readonly runs: ImageRun[] = [];
    private readonly run_of = new Map<CanvasImageSource, ImageRun>();
    private total = 0;
    /** Where the entry `slot()` made last starts in its run's values. */
    private at = 0;

    /** Sprites added since the last `draw()`. */
    public get size(): number {
        return this.total;
    }

    /** Adds `image`, drawn `width` by `height` around `x`, `y` and turned by `angle`. */
    public add(
        image: CanvasImageSource,
        x: number,
        y: number,
        angle: number,
        width: number,
        height: number,
    ): void {
        const values = this.slot(image);
        const at = this.at;
        values[at] = x;
        values[at + 1] = y;
        values[at + 2] = angle;
        values[at + 3] = width;
        values[at + 4] = height;
        values[at + 9] = width / 2;
        values[at + 10] = height / 2;
        values[at + 11] = 0;
    }

    /**
     * Adds the part `rect` of `image` (a frame of a sheet) with its anchor at `x`, `y`: scaled,
     * mirrored and turned around the anchor as `options` say.
     */
    public add_frame(
        image: CanvasImageSource,
        rect: RectI,
        x: number,
        y: number,
        options?: BatchFrameOptions,
    ): void {
        const scale = options?.scale ?? 1;
        const shrink = options?.picture_scale ?? 1;
        const anchor = options?.anchor;
        const values = this.slot(image);
        const at = this.at;
        values[at] = x;
        values[at + 1] = y;
        values[at + 2] = options?.angle ?? 0;
        values[at + 3] = rect.width * scale;
        values[at + 4] = rect.height * scale;
        values[at + 5] = rect.left * shrink;
        values[at + 6] = rect.top * shrink;
        values[at + 7] = rect.width * shrink;
        values[at + 8] = rect.height * shrink;
        values[at + 9] = (anchor?.x ?? rect.width / 2) * scale;
        values[at + 10] = (anchor?.y ?? rect.height / 2) * scale;
        values[at + 11] = options?.flip_x === true ? FRAME | FLIPPED : FRAME;
    }

    /**
     * Adds the frame `player` shows now, with the sheet's anchor for it at `x`, `y`. False (and
     * nothing added) while the sheet's picture or the frame is not there yet.
     */
    public add_animation(
        player: AnimationPlayer,
        x: number,
        y: number,
        options?: BatchAnimationOptions,
    ): boolean {
        const frame = player.frame;
        const sheet = player.sheet;
        const image = sheet.image;
        const rect = frame < 0 ? undefined : sheet.frames[frame];
        if (image === null || rect === undefined) {
            return false;
        }
        this.add_frame(image, rect, x, y, {
            anchor: sheet.anchor_of(frame),
            scale: options?.scale,
            flip_x: options?.flip_x,
            angle: options?.angle,
            picture_scale: sheet.picture_scale,
        });
        return true;
    }

    /** Draws every sprite added since the last time and empties the batch. Returns how many it drew. */
    public draw(context: CanvasRenderingContext2D): number {
        const drawn = this.total;
        if (drawn === 0) {
            return 0;
        }
        const base = context.getTransform();
        const { a, b, c, d, e, f } = base;
        let held = ON_BASE;
        for (const run of this.runs) {
            const values = run.values;
            const image = run.image;
            for (let index = 0; index < run.count; index++) {
                const at = index * FIELDS;
                const x = values[at];
                const y = values[at + 1];
                const angle = values[at + 2];
                const width = values[at + 3];
                const height = values[at + 4];
                const flags = values[at + 11];
                if (flags === 0) {
                    // A whole picture: one transform of its own, as ever.
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    // base * translate(x, y) * rotate(angle)
                    context.setTransform(
                        a * cos + c * sin,
                        b * cos + d * sin,
                        c * cos - a * sin,
                        d * cos - b * sin,
                        a * x + c * y + e,
                        b * x + d * y + f,
                    );
                    held = ON_SPRITE;
                    context.drawImage(
                        image,
                        -width / 2,
                        -height / 2,
                        width,
                        height,
                    );
                    continue;
                }
                const anchor_x = values[at + 9];
                const anchor_y = values[at + 10];
                const is_flipped = (flags & FLIPPED) !== 0;
                if (angle === 0 && !is_flipped) {
                    if (held !== ON_BASE) {
                        context.setTransform(a, b, c, d, e, f);
                        held = ON_BASE;
                    }
                    context.drawImage(
                        image,
                        values[at + 5],
                        values[at + 6],
                        values[at + 7],
                        values[at + 8],
                        x - anchor_x,
                        y - anchor_y,
                        width,
                        height,
                    );
                    continue;
                }
                if (angle === 0) {
                    // Every mirrored frame shares one transform: base * scale(-1, 1). A frame
                    // drawn from -(x + anchor) puts its anchor at x, its left edge right of it.
                    if (held !== ON_MIRROR) {
                        context.setTransform(-a, -b, c, d, e, f);
                        held = ON_MIRROR;
                    }
                    context.drawImage(
                        image,
                        values[at + 5],
                        values[at + 6],
                        values[at + 7],
                        values[at + 8],
                        -(x + anchor_x),
                        y - anchor_y,
                        width,
                        height,
                    );
                    continue;
                }
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const mirror = is_flipped ? -1 : 1;
                // base * translate(x, y) * rotate(angle) * scale(mirror, 1)
                context.setTransform(
                    (a * cos + c * sin) * mirror,
                    (b * cos + d * sin) * mirror,
                    c * cos - a * sin,
                    d * cos - b * sin,
                    a * x + c * y + e,
                    b * x + d * y + f,
                );
                held = ON_SPRITE;
                context.drawImage(
                    image,
                    values[at + 5],
                    values[at + 6],
                    values[at + 7],
                    values[at + 8],
                    -anchor_x,
                    -anchor_y,
                    width,
                    height,
                );
            }
        }
        if (held !== ON_BASE) {
            context.setTransform(a, b, c, d, e, f);
        }
        this.clear();
        return drawn;
    }

    /** Forgets the sprites added since the last `draw()`; the images it has seen keep their storage. */
    public clear(): void {
        for (const run of this.runs) {
            run.count = 0;
        }
        this.total = 0;
    }

    /** Room for one more sprite of `image`: its run's values, with `at` set to the new entry. */
    private slot(image: CanvasImageSource): Float64Array {
        let run = this.run_of.get(image);
        if (run === undefined) {
            run = { image, values: new Float64Array(64 * FIELDS), count: 0 };
            this.run_of.set(image, run);
            this.runs.push(run);
        }
        if ((run.count + 1) * FIELDS > run.values.length) {
            const grown = new Float64Array(run.values.length * 2);
            grown.set(run.values);
            run.values = grown;
        }
        this.at = run.count * FIELDS;
        run.count += 1;
        this.total += 1;
        return run.values;
    }
}
