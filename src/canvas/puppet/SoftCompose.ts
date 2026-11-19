import type { KitPart, PartKit } from "./PartKit";
import { BoneData, SoftPictureData, SoftSkinData } from "./RigData";
import { Skeleton } from "./Skeleton";
import { parse_hex_color, RgbaPixels } from "./SoftMesh";

/**
 * One kit part placed on a creature at rest (since step 42): which part, into which picture, where
 * (rig units, the root at 0, 0, y down), and which bones its pixels follow.
 */
export interface SoftPlacement {
    /** The kit part's id. */
    readonly part: string;
    /** The soft skin's picture it is painted into (`"body"`, `"near_hind"`). */
    readonly picture: string;
    /** The bone its pixels follow (painted in its colour in the bone map). */
    readonly bone: string;
    /** Several bones: each pixel follows the one whose line at rest is nearest (a torso over the spine). */
    readonly bones?: readonly string[];
    /** Where the part's `pivot` goes. */
    readonly at: readonly [number, number];
    /** Where its `tip` goes: the part is turned and scaled to lie along the line from `at`. */
    readonly to?: readonly [number, number];
    /** Without `to`: the scale (default 1) and the turn in degrees from the way it was drawn (default 0). */
    readonly scale?: number;
    readonly rotation?: number;
    /** Across its line, times the scale along it (a fatter leg). Default 1. */
    readonly girth?: number;
    /** Mirrored across its line. */
    readonly flip?: boolean;
    /** The colour times this (the far side 0.76). Default 1. */
    readonly shade?: number;
    /**
     * Painted whole after the picture's other parts, outline and all (an eye, a horn in front).
     * The others are painted twice, whole and then without their outlines, so where parts overlap
     * only the outline round all of them shows: no seams.
     */
    readonly over?: boolean;
    /** Its pixels within `radius` of `at` follow this bone instead (a limb's root goes with the body). */
    readonly zone?: { readonly bone: string; readonly radius: number };
}

/** The three tint colours of a creature (`"#rrggbb"`): the mask's red, green and blue. */
export interface SoftTints {
    readonly main: string;
    readonly second: string;
    readonly accent: string;
}

export interface SoftComposeOptions {
    /** The rig's bones (their rest pose gives the lines for `bones` and the map's colours). */
    readonly bones: readonly BoneData[];
    /** The pictures back to front; others follow in the order they come. */
    readonly pictures?: readonly string[];
    /** The soft skin's grid on the graphics card (default 12) and on the CPU (32), its blur (20). */
    readonly cell_size?: number;
    readonly cpu_cell_size?: number;
    readonly blur?: number;
    /** The atlas's width (default 1024; wider when a picture needs it). */
    readonly atlas_width?: number;
    /** Empty pixels round each picture. Default 2. */
    readonly padding?: number;
}

/** A soft skin painted from kit parts: the atlas and the data for the rig's skin. */
export interface ComposedSoftSkin {
    /** The pictures and their bone maps, packed; straight RGBA. */
    readonly pixels: RgbaPixels;
    /** `skins.<name>.soft` of the rig. */
    readonly soft: SoftSkinData;
    /** The pictures' box around the root at rest: `[x, y, width, height]`. */
    readonly bounds: readonly [number, number, number, number];
}

const GAP = 4;
/** The bone maps' palette: four steps per channel, 64 colours at least 85 apart. */
const LEVELS = [0, 85, 170, 255];

/** The colour of the n-th bone in a composed map: neighbours far apart, all 64 used before one repeats. */
export function map_color(index: number): string {
    const turned = (index * 37 + 5) % 64;
    const r = LEVELS[turned & 3];
    const g = LEVELS[(turned >> 2) & 3];
    const b = LEVELS[(turned >> 4) & 3];
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The affine transform from a part's pixels (from its rect's top left) to rig units: six numbers
 * as a canvas takes them (`a, b, c, d, e, f`).
 */
export function placement_transform(
    part: Pick<KitPart, "pivot" | "tip">,
    placement: SoftPlacement,
): [number, number, number, number, number, number] {
    const axis_x = part.tip[0] - part.pivot[0];
    const axis_y = part.tip[1] - part.pivot[1];
    const alpha = Math.atan2(axis_y, axis_x);
    let beta: number;
    let scale: number;
    if (placement.to !== undefined) {
        const dx = placement.to[0] - placement.at[0];
        const dy = placement.to[1] - placement.at[1];
        beta = Math.atan2(dy, dx);
        scale = Math.hypot(dx, dy) / Math.hypot(axis_x, axis_y);
    } else {
        beta = alpha + ((placement.rotation ?? 0) * Math.PI) / 180;
        scale = placement.scale ?? 1;
    }
    const across = scale * (placement.girth ?? 1) * (placement.flip ? -1 : 1);
    // R(beta) * diag(scale, across) * R(-alpha)
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);
    const cb = Math.cos(beta);
    const sb = Math.sin(beta);
    const a = cb * scale * ca + sb * across * sa;
    const b = sb * scale * ca - cb * across * sa;
    const c = cb * scale * sa - sb * across * ca;
    const d = sb * scale * sa + cb * across * ca;
    const e = placement.at[0] - (a * part.pivot[0] + c * part.pivot[1]);
    const f = placement.at[1] - (b * part.pivot[0] + d * part.pivot[1]);
    return [a, b, c, d, e, f];
}

/** A point of a placed part (its pixels from the rect's top left) in rig units. */
export function placement_point(
    part: Pick<KitPart, "pivot" | "tip">,
    placement: SoftPlacement,
    point: readonly [number, number],
): [number, number] {
    const [a, b, c, d, e, f] = placement_transform(part, placement);
    return [a * point[0] + c * point[1] + e, b * point[0] + d * point[1] + f];
}

interface Painted {
    readonly placement: SoftPlacement;
    readonly part: KitPart;
    /** Rig units to the part's pixels. */
    readonly inverse: readonly number[];
    readonly box: readonly [number, number, number, number];
    readonly tint: Float32Array;
    readonly zone_bone: number;
    readonly bones: readonly number[];
}

/**
 * Paints kit parts into a soft skin: each picture's parts, scaled and turned onto the skeleton at
 * rest and tinted (the mask's red times `main`, green `second`, blue `accent`; the far side
 * shaded), laid over each other without seams, and beside it a bone map where every pixel has the
 * colour of the bone it follows (`bones`: the nearest line; `zone`: a joint's parent). The result
 * is the data step 41's `SoftMesh` takes: pictures back to front with their maps in one atlas, the
 * bone colours, the grid sizes and the blur. Pure arithmetic on pixels, so the same parts, places
 * and tints always paint the same bytes, in Node too.
 */
export function compose_soft_skin(
    kit: PartKit,
    placements: readonly SoftPlacement[],
    tints: SoftTints,
    options: SoftComposeOptions,
): ComposedSoftSkin {
    const pixels = kit.pixels;
    if (pixels === null) {
        throw new Error("compose_soft_skin: the kit's pixels can't be read");
    }
    const rest = Skeleton.from_data(options.bones);
    rest.update();
    const colors: Record<string, string> = {};
    const color_values: (readonly [number, number, number])[] = [];
    for (const [index, name] of rest.names.entries()) {
        const color = map_color(index);
        if (rest.parents[index] >= 0) {
            colors[name] = color;
        }
        color_values.push(parse_hex_color(color)!);
    }
    const bone_of = (name: string, what: string): number => {
        const index = rest.index_of(name);
        if (index < 0) {
            throw new Error(`compose_soft_skin: ${what}: no bone "${name}"`);
        }
        return index;
    };
    const tint_rgb = [tints.main, tints.second, tints.accent].map((hex, at) => {
        const rgb = parse_hex_color(hex);
        if (rgb === null) {
            throw new Error(
                `compose_soft_skin: the ${["main", "second", "accent"][at]} tint must be "#rrggbb"`,
            );
        }
        return rgb.map((value) => value / 255);
    });
    // The bones' lines at rest, for pixels that follow the nearest of several.
    const lines = new Float64Array(rest.count * 4);
    for (let index = 0; index < rest.count; index++) {
        const tip = rest.world_point(index, rest.lengths[index], 0);
        lines[index * 4] = rest.world_x(index);
        lines[index * 4 + 1] = rest.world_y(index);
        lines[index * 4 + 2] = tip.x;
        lines[index * 4 + 3] = tip.y;
    }
    const by_picture = new Map<string, Painted[]>();
    for (const placement of placements) {
        const part = kit.part(placement.part);
        if (part === null) {
            throw new Error(
                `compose_soft_skin: the kit has no part "${placement.part}"`,
            );
        }
        const forward = placement_transform(part, placement);
        const det = forward[0] * forward[3] - forward[1] * forward[2];
        if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
            throw new Error(
                `compose_soft_skin: part "${placement.part}" is placed with no size`,
            );
        }
        const inverse = [
            forward[3] / det,
            -forward[1] / det,
            -forward[2] / det,
            forward[0] / det,
        ];
        const [, , width, height] = part.rect;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const [px, py] of [
            [0, 0],
            [width, 0],
            [0, height],
            [width, height],
        ]) {
            const x = forward[0] * px + forward[2] * py + forward[4];
            const y = forward[1] * px + forward[3] * py + forward[5];
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
        const shade = placement.shade ?? 1;
        const tint = new Float32Array(12);
        for (let channel = 0; channel < 3; channel++) {
            for (let k = 0; k < 3; k++) {
                tint[channel * 3 + k] = tint_rgb[channel][k] * shade;
            }
            tint[9 + channel] = shade;
        }
        const painted: Painted = {
            placement,
            part,
            inverse: [...inverse, forward[4], forward[5]],
            box: [left, top, right, bottom],
            tint,
            zone_bone:
                placement.zone === undefined
                    ? -1
                    : bone_of(
                          placement.zone.bone,
                          `zone of "${placement.part}"`,
                      ),
            bones: (placement.bones ?? [placement.bone]).map((bone) =>
                bone_of(bone, `part "${placement.part}"`),
            ),
        };
        bone_of(placement.bone, `part "${placement.part}"`);
        let list = by_picture.get(placement.picture);
        if (list === undefined) {
            list = [];
            by_picture.set(placement.picture, list);
        }
        list.push(painted);
    }
    const order = [
        ...(options.pictures ?? []).filter((name) => by_picture.has(name)),
        ...[...by_picture.keys()].filter(
            (name) => !(options.pictures ?? []).includes(name),
        ),
    ];
    const padding = options.padding ?? 2;
    interface Picture {
        readonly name: string;
        readonly left: number;
        readonly top: number;
        readonly width: number;
        readonly height: number;
        readonly color: Float32Array;
        readonly labels: Int16Array;
        readonly used: Set<number>;
    }
    const pictures: Picture[] = [];
    for (const name of order) {
        const list = by_picture.get(name)!;
        const left =
            Math.floor(Math.min(...list.map((item) => item.box[0]))) - padding;
        const top =
            Math.floor(Math.min(...list.map((item) => item.box[1]))) - padding;
        const right =
            Math.ceil(Math.max(...list.map((item) => item.box[2]))) + padding;
        const bottom =
            Math.ceil(Math.max(...list.map((item) => item.box[3]))) + padding;
        const width = right - left;
        const height = bottom - top;
        const picture: Picture = {
            name,
            left,
            top,
            width,
            height,
            color: new Float32Array(width * height * 4),
            labels: new Int16Array(width * height).fill(-1),
            used: new Set<number>(),
        };
        const under = list.filter((item) => item.placement.over !== true);
        const over = list.filter((item) => item.placement.over === true);
        for (const item of under) {
            paint(picture, item, "whole");
        }
        for (const item of under) {
            paint(picture, item, "inside");
        }
        for (const item of over) {
            paint(picture, item, "whole");
        }
        pictures.push(picture);
    }

    function paint(
        picture: Picture,
        item: Painted,
        pass: "whole" | "inside",
    ): void {
        const [rect_x, rect_y, rect_w, rect_h] = item.part.rect;
        const [mask_x, mask_y] = item.part.mask;
        const [ia, ib, ic, id, e, f] = item.inverse;
        const from_x = Math.max(0, Math.floor(item.box[0]) - picture.left - 1);
        const to_x = Math.min(
            picture.width,
            Math.ceil(item.box[2]) - picture.left + 1,
        );
        const from_y = Math.max(0, Math.floor(item.box[1]) - picture.top - 1);
        const to_y = Math.min(
            picture.height,
            Math.ceil(item.box[3]) - picture.top + 1,
        );
        const data = pixels!.data;
        const atlas_width = pixels!.width;
        const atlas_height = pixels!.height;
        const tint = item.tint;
        const zone = item.placement.zone;
        const at = item.placement.at;
        const sample = new Float32Array(9);
        for (let v = from_y; v < to_y; v++) {
            const y = picture.top + v + 0.5;
            for (let u = from_x; u < to_x; u++) {
                const x = picture.left + u + 0.5;
                // The part's pixel under this one (its middles at .5).
                const dx = x - e;
                const dy = y - f;
                const sx = ia * dx + ic * dy - 0.5;
                const sy = ib * dx + id * dy - 0.5;
                if (sx < -1 || sy < -1 || sx > rect_w || sy > rect_h) {
                    continue;
                }
                bilinear(
                    data,
                    atlas_width,
                    atlas_height,
                    rect_x,
                    rect_y,
                    mask_x,
                    mask_y,
                    rect_w,
                    rect_h,
                    sx,
                    sy,
                    sample,
                );
                const alpha = sample[3];
                if (alpha <= 0.002) {
                    continue;
                }
                // The tint: red, green and blue of the mask take the three colours, the rest stays.
                let r = sample[4];
                let g = sample[5];
                let b = sample[6];
                const rest_share = Math.max(0, 1 - r - g - b);
                const fr =
                    r * tint[0] +
                    g * tint[3] +
                    b * tint[6] +
                    rest_share * tint[9];
                const fg =
                    r * tint[1] +
                    g * tint[4] +
                    b * tint[7] +
                    rest_share * tint[10];
                const fb =
                    r * tint[2] +
                    g * tint[5] +
                    b * tint[8] +
                    rest_share * tint[11];
                r = sample[0] * fr;
                g = sample[1] * fg;
                b = sample[2] * fb;
                let cover = alpha;
                if (pass === "inside") {
                    cover = Math.min(alpha, sample[7]);
                    if (cover <= 0.002) {
                        continue;
                    }
                    const share = cover / alpha;
                    r *= share;
                    g *= share;
                    b *= share;
                }
                const index = (v * picture.width + u) * 4;
                const color = picture.color;
                const keep = 1 - cover;
                color[index] = r + color[index] * keep;
                color[index + 1] = g + color[index + 1] * keep;
                color[index + 2] = b + color[index + 2] * keep;
                color[index + 3] = cover + color[index + 3] * keep;
                if (cover >= 0.5) {
                    let bone = item.bones[0];
                    if (
                        zone !== undefined &&
                        (x - at[0]) * (x - at[0]) + (y - at[1]) * (y - at[1]) <
                            zone.radius * zone.radius
                    ) {
                        bone = item.zone_bone;
                    } else if (item.bones.length > 1) {
                        bone = nearest_line(lines, item.bones, x, y);
                    }
                    picture.labels[v * picture.width + u] = bone;
                    picture.used.add(bone);
                }
            }
        }
    }

    // Pack the pictures and their maps (shelves, tallest first) into one atlas.
    const boxes: {
        name: string;
        picture: number;
        is_map: boolean;
        width: number;
        height: number;
    }[] = [];
    for (const [index, picture] of pictures.entries()) {
        boxes.push({
            name: picture.name,
            picture: index,
            is_map: false,
            width: picture.width,
            height: picture.height,
        });
        boxes.push({
            name: `${picture.name}#map`,
            picture: index,
            is_map: true,
            width: picture.width,
            height: picture.height,
        });
    }
    const widest = Math.max(0, ...boxes.map((box) => box.width));
    const atlas_width = Math.max(options.atlas_width ?? 1024, widest + GAP * 2);
    const sorted = [...boxes].sort(
        (p, q) => q.height - p.height || (p.name < q.name ? -1 : 1),
    );
    const places = new Map<string, [number, number]>();
    let shelf_x = GAP;
    let shelf_y = GAP;
    let shelf_height = 0;
    for (const box of sorted) {
        if (shelf_x + box.width + GAP > atlas_width) {
            shelf_x = GAP;
            shelf_y += shelf_height + GAP;
            shelf_height = 0;
        }
        places.set(box.name, [shelf_x, shelf_y]);
        shelf_x += box.width + GAP;
        shelf_height = Math.max(shelf_height, box.height);
    }
    const atlas_height = Math.max(
        4,
        Math.ceil((shelf_y + shelf_height + GAP) / 4) * 4,
    );
    const out = new Uint8ClampedArray(atlas_width * atlas_height * 4);
    const soft_pictures: SoftPictureData[] = [];
    let bounds_left = Infinity;
    let bounds_top = Infinity;
    let bounds_right = -Infinity;
    let bounds_bottom = -Infinity;
    for (const picture of pictures) {
        const [px, py] = places.get(picture.name)!;
        const [mx, my] = places.get(`${picture.name}#map`)!;
        for (let v = 0; v < picture.height; v++) {
            for (let u = 0; u < picture.width; u++) {
                const from = (v * picture.width + u) * 4;
                const alpha = picture.color[from + 3];
                const to = ((py + v) * atlas_width + px + u) * 4;
                if (alpha > 0.0005) {
                    out[to] = Math.round((picture.color[from] / alpha) * 255);
                    out[to + 1] = Math.round(
                        (picture.color[from + 1] / alpha) * 255,
                    );
                    out[to + 2] = Math.round(
                        (picture.color[from + 2] / alpha) * 255,
                    );
                    out[to + 3] = Math.round(alpha * 255);
                }
                const label = picture.labels[v * picture.width + u];
                if (label >= 0) {
                    const map_at = ((my + v) * atlas_width + mx + u) * 4;
                    const rgb = color_values[label];
                    out[map_at] = rgb[0];
                    out[map_at + 1] = rgb[1];
                    out[map_at + 2] = rgb[2];
                    out[map_at + 3] = 255;
                }
            }
        }
        soft_pictures.push({
            name: picture.name,
            rect: [px, py, picture.width, picture.height],
            map: [mx, my, picture.width, picture.height],
            origin: [-picture.left, -picture.top],
            bones: [...picture.used]
                .sort((p, q) => p - q)
                .map((bone) => rest.names[bone]),
        });
        bounds_left = Math.min(bounds_left, picture.left);
        bounds_top = Math.min(bounds_top, picture.top);
        bounds_right = Math.max(bounds_right, picture.left + picture.width);
        bounds_bottom = Math.max(bounds_bottom, picture.top + picture.height);
    }
    if (soft_pictures.length === 0) {
        throw new Error("compose_soft_skin: no parts placed");
    }
    return {
        pixels: { width: atlas_width, height: atlas_height, data: out },
        soft: {
            pictures: soft_pictures,
            colors,
            cell_size: options.cell_size ?? 12,
            cpu_cell_size: options.cpu_cell_size ?? 32,
            blur: options.blur ?? 20,
        },
        bounds: [
            bounds_left,
            bounds_top,
            bounds_right - bounds_left,
            bounds_bottom - bounds_top,
        ],
    };
}

/**
 * Samples a part's picture (premultiplied) and mask at `sx`, `sy` (its pixels, middles at whole
 * numbers) into `out`: 0-3 the picture (r, g, b premultiplied, alpha), 4-6 the mask's colour (0..1,
 * taken where the mask has alpha; red alone where it has none: an outline takes the main colour),
 * 7 the mask's alpha (the part without its outline).
 */
function bilinear(
    data: Uint8Array | Uint8ClampedArray,
    atlas_width: number,
    atlas_height: number,
    rect_x: number,
    rect_y: number,
    mask_x: number,
    mask_y: number,
    width: number,
    height: number,
    sx: number,
    sy: number,
    out: Float32Array,
): void {
    out.fill(0);
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    let mask_weight = 0;
    for (let k = 0; k < 4; k++) {
        const x = x0 + (k & 1);
        const y = y0 + (k >> 1);
        if (x < 0 || y < 0 || x >= width || y >= height) {
            continue;
        }
        const weight =
            ((k & 1) === 1 ? fx : 1 - fx) * (k >> 1 === 1 ? fy : 1 - fy);
        if (weight <= 0) {
            continue;
        }
        const ax = rect_x + x;
        const ay = rect_y + y;
        if (ax < 0 || ay < 0 || ax >= atlas_width || ay >= atlas_height) {
            continue;
        }
        const at = (ay * atlas_width + ax) * 4;
        const alpha = (data[at + 3] / 255) * weight;
        out[0] += (data[at] / 255) * alpha;
        out[1] += (data[at + 1] / 255) * alpha;
        out[2] += (data[at + 2] / 255) * alpha;
        out[3] += alpha;
        const mx = mask_x + x;
        const my = mask_y + y;
        if (mx < 0 || my < 0 || mx >= atlas_width || my >= atlas_height) {
            continue;
        }
        const mask_at = (my * atlas_width + mx) * 4;
        const mask_alpha = (data[mask_at + 3] / 255) * weight;
        out[4] += (data[mask_at] / 255) * mask_alpha;
        out[5] += (data[mask_at + 1] / 255) * mask_alpha;
        out[6] += (data[mask_at + 2] / 255) * mask_alpha;
        out[7] += mask_alpha;
        mask_weight += mask_alpha;
    }
    if (mask_weight > 0.001) {
        out[4] /= mask_weight;
        out[5] /= mask_weight;
        out[6] /= mask_weight;
    } else {
        out[4] = 1;
        out[5] = 0;
        out[6] = 0;
    }
}

function nearest_line(
    lines: Float64Array,
    bones: readonly number[],
    x: number,
    y: number,
): number {
    let best = bones[0];
    let best_distance = Infinity;
    for (const bone of bones) {
        const ax = lines[bone * 4];
        const ay = lines[bone * 4 + 1];
        const dx = lines[bone * 4 + 2] - ax;
        const dy = lines[bone * 4 + 3] - ay;
        const squared = dx * dx + dy * dy;
        let along = 0;
        if (squared > 0) {
            along = Math.min(
                1,
                Math.max(0, ((x - ax) * dx + (y - ay) * dy) / squared),
            );
        }
        const distance = Math.hypot(
            x - (ax + along * dx),
            y - (ay + along * dy),
        );
        if (distance < best_distance) {
            best_distance = distance;
            best = bone;
        }
    }
    return best;
}

/**
 * A picture of the pixels to draw from: a canvas of the page or an `OffscreenCanvas` with them in
 * it; null where there is neither (Node), where the skin draws from its pixels alone.
 */
export function canvas_of_pixels(
    pixels: RgbaPixels,
): HTMLCanvasElement | OffscreenCanvas | null {
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    const is_jsdom =
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom");
    if (is_jsdom) {
        return null;
    }
    if (
        typeof document !== "undefined" &&
        typeof document.createElement === "function"
    ) {
        const element = document.createElement("canvas");
        if (typeof element.getContext === "function") {
            element.width = pixels.width;
            element.height = pixels.height;
            canvas = element;
        }
    }
    if (canvas === null && typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(pixels.width, pixels.height);
    }
    if (canvas === null) {
        return null;
    }
    const context = canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (context === null || typeof ImageData === "undefined") {
        return null;
    }
    const data = new Uint8ClampedArray(pixels.data.length);
    data.set(pixels.data);
    context.putImageData(
        new ImageData(data, pixels.width, pixels.height),
        0,
        0,
    );
    return canvas;
}
