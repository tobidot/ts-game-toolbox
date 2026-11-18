import { FogOfWar } from "./FogOfWar";

/** A canvas of `width` x `height` pixels for the fog's picture; null where there is none. */
export type MakeFogCanvas = (
    width: number,
    height: number,
) => HTMLCanvasElement | OffscreenCanvas | null;

/** How `draw_fog` paints. */
export interface DrawFogOptions {
    /** The fog over cells never seen; default `"#111111"` (a `#rgb` or `#rrggbb` color). */
    unseen_color?: string;
    /** How much of `unseen_color` lies over cells seen before; default 0.6. 0 shows them as visible. */
    seen_alpha?: number;
    /** Soft edges: the picture is scaled smoothly, so the fog fades over one cell. Default false. */
    soft?: boolean;
    /**
     * Cells seen before lose their color as well (drawn as grey under the dimming), so only what is
     * seen now is in color. Uses the canvas blend mode `saturation`. Default false.
     */
    grey_seen?: boolean;
    /** Where the grid's top left corner is drawn, in the context's units; default 0, 0. */
    x?: number;
    y?: number;
    /** For tests, or a worker: makes the fog's small canvas. Default: an `OffscreenCanvas`, else a `<canvas>`. */
    make_canvas?: MakeFogCanvas;
}

interface FogPicture {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    image: ImageData;
    /** The fog's version and the colors the pixels were made with; -1 when never made. */
    version: number;
    key: string;
}

interface FogPictures {
    dim: FogPicture | null;
    grey: FogPicture | null;
    states: Uint8Array;
}

const pictures = new WeakMap<object, FogPictures>();

/**
 * Paints the fog over a grid drawn with cells of `cell_size`: cells never seen covered by
 * `unseen_color`, cells seen before dimmed by `seen_alpha` (and greyed with `grey_seen`), cells
 * visible now left clear. The fog is one small picture, a pixel per cell, kept with the fog and
 * made again only when `fog.version` changed; each call is one `drawImage` (two with
 * `grey_seen`), whatever the grid's size. Draw it after the map and before what should stay on
 * top (the player's own units, the interface).
 */
export function draw_fog<T>(
    context: CanvasRenderingContext2D,
    fog: FogOfWar<T>,
    cell_size: number,
    options: DrawFogOptions = {},
): void {
    let set = pictures.get(fog);
    if (set === undefined) {
        set = {
            dim: null,
            grey: null,
            states: new Uint8Array(fog.width * fog.height),
        };
        pictures.set(fog, set);
    }
    const make_canvas = options.make_canvas ?? default_fog_canvas;
    const width = fog.width * cell_size;
    const height = fog.height * cell_size;
    const x = options.x ?? 0;
    const y = options.y ?? 0;
    const color = options.unseen_color ?? "#111111";
    const seen_alpha = options.seen_alpha ?? 0.6;
    if (options.grey_seen === true) {
        set.grey ??= make_picture(fog, make_canvas);
        if (set.grey === null) {
            return;
        }
        refresh(set.grey, fog, set.states, "grey", () =>
            fill_pixels(
                set.states,
                set.grey!.image.data,
                [128, 128, 128],
                255,
                255,
            ),
        );
    }
    set.dim ??= make_picture(fog, make_canvas);
    if (set.dim === null) {
        return;
    }
    refresh(set.dim, fog, set.states, `${color} ${seen_alpha}`, () =>
        fill_pixels(
            set.states,
            set.dim!.image.data,
            parse_color(color),
            seen_alpha * 255,
            255,
        ),
    );
    context.save();
    context.imageSmoothingEnabled = options.soft === true;
    if (options.grey_seen === true && set.grey !== null) {
        context.globalCompositeOperation = "saturation";
        context.drawImage(set.grey.canvas, x, y, width, height);
        context.globalCompositeOperation = "source-over";
    }
    context.drawImage(set.dim.canvas, x, y, width, height);
    context.restore();
}

/**
 * The fog's picture as RGBA pixels, one per cell row by row, into `target` (at least
 * `width * height * 4` long): `unseen_color` opaque, seen cells with `seen_alpha`, visible cells
 * clear. What `draw_fog` puts on its canvas; for a WebGL texture or a minimap of one's own.
 */
export function fog_pixels<T>(
    fog: FogOfWar<T>,
    target: Uint8ClampedArray,
    options: Pick<DrawFogOptions, "unseen_color" | "seen_alpha"> = {},
): void {
    const states = new Uint8Array(fog.width * fog.height);
    fog.copy_states(states);
    fill_pixels(
        states,
        target,
        parse_color(options.unseen_color ?? "#111111"),
        (options.seen_alpha ?? 0.6) * 255,
        255,
    );
}

function fill_pixels(
    states: Uint8Array,
    target: Uint8ClampedArray,
    rgb: readonly number[],
    seen_alpha: number,
    unseen_alpha: number,
): void {
    const seen = Math.round(seen_alpha);
    for (let index = 0; index < states.length; index++) {
        const at = index * 4;
        const state = states[index];
        target[at] = rgb[0];
        target[at + 1] = rgb[1];
        target[at + 2] = rgb[2];
        target[at + 3] = state === 2 ? 0 : state === 1 ? seen : unseen_alpha;
    }
}

function refresh<T>(
    picture: FogPicture,
    fog: FogOfWar<T>,
    states: Uint8Array,
    key: string,
    fill: () => void,
): void {
    if (picture.version === fog.version && picture.key === key) {
        return;
    }
    fog.copy_states(states);
    fill();
    picture.context.putImageData(picture.image, 0, 0);
    picture.version = fog.version;
    picture.key = key;
}

function make_picture<T>(
    fog: FogOfWar<T>,
    make_canvas: MakeFogCanvas,
): FogPicture | null {
    const canvas = make_canvas(fog.width, fog.height);
    if (canvas === null) {
        return null;
    }
    const context = canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (context === null) {
        return null;
    }
    return {
        canvas,
        context,
        image: context.createImageData(fog.width, fog.height),
        version: -1,
        key: "",
    };
}

/** `#rgb` or `#rrggbb` to three bytes; anything else is black. */
function parse_color(color: string): number[] {
    const hex = color.trim().replace(/^#/, "");
    const full =
        hex.length === 3
            ? hex
                  .split("")
                  .map((digit) => digit + digit)
                  .join("")
            : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) {
        return [0, 0, 0];
    }
    return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
}

function default_fog_canvas(
    width: number,
    height: number,
): HTMLCanvasElement | OffscreenCanvas | null {
    if (
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom")
    ) {
        // jsdom has canvases without contexts and complains about each.
        return null;
    }
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    return null;
}
