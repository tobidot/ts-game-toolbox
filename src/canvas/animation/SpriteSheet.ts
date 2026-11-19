import { RectI } from "../../geometries/Rect";
import { AnimationClip } from "./AnimationClip";
import { AnimationPlayer } from "./AnimationPlayer";
import { ClipData, SheetData } from "./SheetData";

/** How `SpriteSheet.grid()` cuts a picture. */
export interface SheetGridOptions {
    /** Default: as many as fit the picture's width. */
    readonly columns?: number;
    /** Default: as many as fit the picture's height. */
    readonly rows?: number;
    /** Fewer frames than columns times rows, when the last row is not full. */
    readonly count?: number;
    /** Space around the grid, in pixels. Default 0. */
    readonly margin?: number;
    /** Space between two frames, in pixels. Default 0. */
    readonly spacing?: number;
    /** The point of each frame drawn at the sprite's position. Default: the middle. */
    readonly anchor?: SheetAnchor;
}

/** A point within a frame, in the picture's pixels from the frame's top left. */
export interface SheetAnchor {
    readonly x: number;
    readonly y: number;
}

/**
 * One frame of a packed sheet: where it lies in the picture, and, if it has its own, the point
 * drawn at the sprite's position. A packer that trims frames gives each one its own anchor, so
 * the feet stay on the spot while the frames differ in size.
 */
export interface SheetFrame extends RectI {
    readonly anchor?: SheetAnchor;
}

/** How `SpriteSheet.draw_frame()` and `AnimationPlayer.draw()` draw. */
export interface FrameDrawOptions {
    /** Default 1: one pixel of the picture is one unit of the context. */
    readonly scale?: number;
    /** Mirrored left to right around the anchor: a sprite that faces right faces left. */
    readonly flip_x?: boolean;
}

/** Makes the canvas `SpriteSheet.prescale()` draws the smaller picture into; null when there is none to make. */
export type MakeSheetCanvas = (
    width: number,
    height: number,
) => HTMLCanvasElement | OffscreenCanvas | null;

/** A canvas from the page's document, else an `OffscreenCanvas`, else none. */
function default_sheet_canvas(
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

/** The size a picture says it has: `naturalWidth` for an image, `width` for a canvas. */
function picture_size(
    image: CanvasImageSource,
): { width: number; height: number } | null {
    const sized = image as {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        naturalWidth?: number;
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        naturalHeight?: number;
        width?: unknown;
        height?: unknown;
    };
    if (
        typeof sized.naturalWidth === "number" &&
        typeof sized.naturalHeight === "number" &&
        sized.naturalWidth > 0
    ) {
        return { width: sized.naturalWidth, height: sized.naturalHeight };
    }
    if (typeof sized.width === "number" && typeof sized.height === "number") {
        return { width: sized.width, height: sized.height };
    }
    return null;
}

/** How many frames of `size` with `spacing` between them fit into `length` less two margins. */
function fitting(
    length: number,
    size: number,
    margin: number,
    spacing: number,
): number {
    return Math.max(
        0,
        Math.floor((length - 2 * margin + spacing) / (size + spacing)),
    );
}

/**
 * Frames in one picture, and the clips that play them. `SpriteSheet.grid(image, 32, 32)` cuts a
 * grid row by row from the top left; `from_frames()` takes packed rectangles; `from_data()` takes
 * a catalogue entry's `sheet` as it is. Clips are plain data (`add_clips({ walk: { frames: "0-7",
 * fps: 12, loop: true } })`), and `player("walk")` gives a sprite its own `AnimationPlayer`.
 *
 * The picture may come later than the data, and the data later than the players: `image` and
 * `set_data()` fill an empty sheet, and a player made before waits for its clip. Until the picture
 * is there, drawing draws nothing and says so.
 */
export class SpriteSheet {
    /** The frames, numbered as the clips count them. */
    public frames: RectI[];
    /** The point of every frame drawn at the sprite's position; null: the frame's middle. */
    public anchor: SheetAnchor | null;
    /**
     * Anchors of single frames (packed sheets, `from_frames()`), by frame; a frame without one
     * (null or past the end) uses `anchor`. Empty for a grid.
     */
    public frame_anchors: (SheetAnchor | null)[] = [];
    /** The clip a new player starts with; null: the first clip. */
    public default_clip: string | null = null;
    public readonly clips = new Map<string, AnimationClip>();
    private picture: CanvasImageSource | null = null;
    private shrink = 1;

    public constructor(
        image: CanvasImageSource | null = null,
        frames: RectI[] = [],
        anchor: SheetAnchor | null = null,
    ) {
        this.image = image;
        this.frames = frames;
        this.anchor = anchor;
    }

    /** Null until the picture has come. A new picture is drawn as it is (`picture_scale` 1). */
    public get image(): CanvasImageSource | null {
        return this.picture;
    }

    public set image(image: CanvasImageSource | null) {
        this.picture = image;
        this.shrink = 1;
    }

    /**
     * How large `image` is against the picture the frames were cut from: 1, or what
     * `prescale()` made it. Frames and anchors always count in the first picture's pixels.
     */
    public get picture_scale(): number {
        return this.shrink;
    }

    /**
     * Draws the picture once at `scale` into a canvas of its own and draws from that from now
     * on: a sheet shown at a quarter of its size reads a sixteenth of the pixels per sprite,
     * which is what a crowd of thousands costs. Choose the size the sprites are shown at (their
     * scale times the view's). Frames, anchors and the drawn size stay as they were. Only
     * shrinks; false (and nothing changed) when `scale` is 1 or more, there is no picture yet, or
     * no canvas could be made.
     */
    public prescale(
        scale: number,
        make_canvas: MakeSheetCanvas = default_sheet_canvas,
    ): boolean {
        const image = this.picture;
        const size = image === null ? null : picture_size(image);
        if (image === null || size === null || !(scale > 0) || scale >= 1) {
            return false;
        }
        const total = this.shrink * scale;
        const width = Math.max(
            1,
            Math.round((size.width / this.shrink) * total),
        );
        const height = Math.max(
            1,
            Math.round((size.height / this.shrink) * total),
        );
        const canvas = make_canvas(width, height);
        const context = canvas?.getContext("2d") as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D
            | null
            | undefined;
        if (canvas === null || context === null || context === undefined) {
            return false;
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);
        this.picture = canvas;
        this.shrink = total;
        return true;
    }

    /**
     * Cuts `image` into frames of `frame_width` by `frame_height`, row by row from the top left
     * (cell `n` is at column `n % columns`). Without a picture yet, say `columns` and `rows`.
     */
    public static grid(
        image: CanvasImageSource | null,
        frame_width: number,
        frame_height: number,
        options: SheetGridOptions = {},
    ): SpriteSheet {
        const sheet = new SpriteSheet(image, [], options.anchor ?? null);
        sheet.frames = SpriteSheet.grid_frames(
            image === null ? null : picture_size(image),
            frame_width,
            frame_height,
            options,
        );
        return sheet;
    }

    /**
     * Frames of any size, packed anywhere in the picture. A frame may bring its own `anchor`;
     * the others use `anchor` (default: their middle).
     */
    public static from_frames(
        image: CanvasImageSource | null,
        frames: readonly SheetFrame[],
        anchor: SheetAnchor | null = null,
    ): SpriteSheet {
        const sheet = new SpriteSheet(
            image,
            frames.map((frame) => ({
                left: frame.left,
                top: frame.top,
                width: frame.width,
                height: frame.height,
            })),
            anchor,
        );
        if (frames.some((frame) => frame.anchor !== undefined)) {
            sheet.frame_anchors = frames.map((frame) =>
                frame.anchor === undefined ? null : { ...frame.anchor },
            );
        }
        return sheet;
    }

    /** A sheet from plain data, as a catalogue entry's `sheet` has it: frames, anchor and clips. */
    public static from_data(
        image: CanvasImageSource | null,
        data: SheetData,
    ): SpriteSheet {
        return new SpriteSheet(image).set_data(data);
    }

    /** The picture is there and there are frames to draw. */
    public get is_ready(): boolean {
        return this.image !== null && this.frames.length > 0;
    }

    /**
     * Frames, anchor, clips and default clip from plain data, replacing what the sheet had. The
     * picture stays. Players made before pick up their clips at their next `update()`.
     */
    public set_data(data: SheetData): this {
        const clips = Object.entries(data.clips ?? {}).map(([name, clip]) =>
            AnimationClip.from_data(name, clip),
        );
        let rows = data.rows;
        if (rows === undefined && this.image === null) {
            const highest = Math.max(
                0,
                ...clips.flatMap((clip) => clip.frames),
            );
            rows = Math.floor(highest / data.columns) + 1;
        }
        const size = this.image === null ? null : picture_size(this.image);
        this.frames = SpriteSheet.grid_frames(
            size === null
                ? null
                : {
                      width: size.width / this.shrink,
                      height: size.height / this.shrink,
                  },
            data.frame_width,
            data.frame_height,
            {
                columns: data.columns,
                rows,
                margin: data.margin,
                spacing: data.spacing,
            },
        );
        this.anchor = data.anchor ? { ...data.anchor } : null;
        this.frame_anchors = [];
        this.clips.clear();
        for (const clip of clips) {
            this.clips.set(clip.name, clip);
        }
        this.default_clip = data.default ?? null;
        return this;
    }

    /** Adds clips from plain data (`{ walk: { frames: "0-7", fps: 12, loop: true } }`), and maybe the default. */
    public add_clips(
        clips: Readonly<Record<string, ClipData>>,
        default_clip?: string,
    ): this {
        for (const [name, data] of Object.entries(clips)) {
            this.clips.set(name, AnimationClip.from_data(name, data));
        }
        if (default_clip !== undefined) {
            this.default_clip = default_clip;
        }
        return this;
    }

    /** The clip of that name; null when there is none (yet). */
    public clip(name: string): AnimationClip | null {
        return this.clips.get(name) ?? null;
    }

    /** The clip a player starts with when it is told none: `default_clip`, else the first. */
    public get start_clip(): string | null {
        if (this.default_clip !== null && this.clips.has(this.default_clip)) {
            return this.default_clip;
        }
        const first = this.clips.keys().next();
        return first.done ? null : first.value;
    }

    /** The point of `frame` drawn at the sprite's position: its own anchor, else the sheet's; null: its middle. */
    public anchor_of(frame: number): SheetAnchor | null {
        return this.frame_anchors[frame] ?? this.anchor;
    }

    /** A new player for one sprite, playing `clip` (default: the start clip). */
    public player(clip?: string): AnimationPlayer {
        return new AnimationPlayer(this, clip);
    }

    /**
     * Draws frame `frame` with the anchor at `x`, `y`. False when the picture or the frame is
     * not there yet.
     */
    public draw_frame(
        context: CanvasRenderingContext2D,
        frame: number,
        x: number,
        y: number,
        options: FrameDrawOptions = {},
    ): boolean {
        const rect = this.frames[frame];
        const image = this.image;
        if (rect === undefined || image === null) {
            return false;
        }
        const scale = options.scale ?? 1;
        const anchor = this.anchor_of(frame);
        const anchor_x = (anchor?.x ?? rect.width / 2) * scale;
        const anchor_y = (anchor?.y ?? rect.height / 2) * scale;
        const width = rect.width * scale;
        const height = rect.height * scale;
        const shrink = this.shrink;
        if (options.flip_x !== true) {
            context.drawImage(
                image,
                rect.left * shrink,
                rect.top * shrink,
                rect.width * shrink,
                rect.height * shrink,
                x - anchor_x,
                y - anchor_y,
                width,
                height,
            );
            return true;
        }
        context.save();
        context.translate(x, y);
        context.scale(-1, 1);
        context.drawImage(
            image,
            rect.left * shrink,
            rect.top * shrink,
            rect.width * shrink,
            rect.height * shrink,
            -anchor_x,
            -anchor_y,
            width,
            height,
        );
        context.restore();
        return true;
    }

    private static grid_frames(
        size: { width: number; height: number } | null,
        frame_width: number,
        frame_height: number,
        options: SheetGridOptions,
    ): RectI[] {
        const margin = options.margin ?? 0;
        const spacing = options.spacing ?? 0;
        const columns =
            options.columns ??
            (size === null
                ? null
                : fitting(size.width, frame_width, margin, spacing));
        const rows =
            options.rows ??
            (size === null
                ? null
                : fitting(size.height, frame_height, margin, spacing));
        if (columns === null || rows === null) {
            throw new Error(
                "SpriteSheet.grid: say columns and rows, or give a picture with a size",
            );
        }
        const count = Math.min(options.count ?? columns * rows, columns * rows);
        const frames: RectI[] = [];
        for (let cell = 0; cell < count; cell++) {
            frames.push({
                left: margin + (cell % columns) * (frame_width + spacing),
                top:
                    margin +
                    Math.floor(cell / columns) * (frame_height + spacing),
                width: frame_width,
                height: frame_height,
            });
        }
        return frames;
    }
}
