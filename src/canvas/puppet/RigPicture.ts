import {
    CreatureAttackData,
    make_bite,
    make_claw,
    make_fire,
} from "./CreatureAttack";
import { chains_of, make_gaits, root_chain } from "./CreatureGait";
import { PuppetClip } from "./PuppetClip";
import {
    JiggleData,
    PuppetClipData,
    PuppetKeyData,
    RigData,
    RigDrawingData,
    SoftPictureData,
} from "./RigData";
import {
    fit_template,
    FittedSkeleton,
    JointPoints,
    skeleton_template,
    SkeletonTemplate,
} from "./SkeletonTemplate";
import { Skeleton } from "./Skeleton";
import { map_color, SoftTints } from "./SoftCompose";
import { parse_hex_color, RgbaPixels } from "./SoftMesh";

/** Empty pixels between packed pictures, as the Blender scripts of steps 38 to 42 pack them. */
export const PACK_GAP = 4;
/** Empty pixels kept round a picture's drawn pixels when it is cut out. */
export const CROP_PADDING = 2;

/**
 * Shelf packing, tallest first (ties by name), `GAP` apart, in an atlas `width` wide; its height
 * a multiple of 4. The same packing as the Blender scripts of steps 38 to 42 (`render.py`), so a
 * rig rebuilt from its source folder lands at the same rectangles.
 */
export function pack_boxes(
    boxes: Readonly<Record<string, readonly [number, number]>>,
    width: number,
): { places: Record<string, [number, number]>; height: number } {
    const order = Object.keys(boxes).sort((a, b) => {
        const by_height = boxes[b][1] - boxes[a][1];
        if (by_height !== 0) {
            return by_height;
        }
        return a < b ? -1 : a > b ? 1 : 0;
    });
    const places: Record<string, [number, number]> = {};
    let x = PACK_GAP;
    let y = PACK_GAP;
    let shelf = 0;
    for (const name of order) {
        const [box_width, box_height] = boxes[name];
        if (x + box_width + PACK_GAP > width) {
            x = PACK_GAP;
            y += shelf + PACK_GAP;
            shelf = 0;
        }
        places[name] = [x, y];
        x += box_width + PACK_GAP;
        shelf = Math.max(shelf, box_height);
    }
    const total = y + shelf + PACK_GAP;
    return { places, height: Math.ceil(total / 4) * 4 };
}

/** A blank picture. */
export function blank_pixels(width: number, height: number): RgbaPixels {
    return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Copies a rectangle of one picture into another at `x`, `y` (straight RGBA, no blending). */
export function copy_pixels(
    from: RgbaPixels,
    rect: readonly [number, number, number, number],
    to: RgbaPixels,
    x: number,
    y: number,
): void {
    const [left, top, width, height] = rect;
    for (let row = 0; row < height; row++) {
        const source = ((top + row) * from.width + left) * 4;
        const target = ((y + row) * to.width + x) * 4;
        (to.data as Uint8Array).set(
            from.data.subarray(source, source + width * 4),
            target,
        );
    }
}

/**
 * A picture moved by whole pixels (`dx` right, `dy` down) on a canvas of its own size: what leaves
 * the canvas is cut. The same picture when both are 0.
 */
export function shift_pixels(
    from: RgbaPixels,
    dx: number,
    dy: number,
): RgbaPixels {
    if (dx === 0 && dy === 0) {
        return from;
    }
    const { width, height } = from;
    const out = blank_pixels(width, height);
    const left = Math.max(0, -dx);
    const right = Math.min(width, width - dx);
    const top = Math.max(0, -dy);
    const bottom = Math.min(height, height - dy);
    if (left >= right || top >= bottom) {
        return out;
    }
    copy_pixels(
        from,
        [left, top, right - left, bottom - top],
        out,
        left + dx,
        top + dy,
    );
    return out;
}

/** A rectangle of a picture as a picture of its own. */
export function cut_pixels(
    from: RgbaPixels,
    rect: readonly [number, number, number, number],
): RgbaPixels {
    const out = blank_pixels(rect[2], rect[3]);
    copy_pixels(from, rect, out, 0, 0);
    return out;
}

/**
 * The box round a picture's drawn pixels (alpha above 0) with `padding` kept, inside the picture;
 * null for an empty picture.
 */
export function drawn_box(
    pixels: RgbaPixels,
    padding = CROP_PADDING,
): [number, number, number, number] | null {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let y = 0; y < pixels.height; y++) {
        for (let x = 0; x < pixels.width; x++) {
            if (pixels.data[(y * pixels.width + x) * 4 + 3] > 0) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
    }
    if (!Number.isFinite(left)) {
        return null;
    }
    const x0 = Math.max(0, left - padding);
    const y0 = Math.max(0, top - padding);
    const x1 = Math.min(pixels.width, right + 1 + padding);
    const y1 = Math.min(pixels.height, bottom + 1 + padding);
    return [x0, y0, x1 - x0, y1 - y0];
}

/** The lowest row with a pixel at least half covered, over all pictures (the drawing's ground); null when empty. */
export function lowest_drawn_row(
    pictures: readonly RgbaPixels[],
): number | null {
    let lowest = -1;
    for (const pixels of pictures) {
        for (let y = pixels.height - 1; y > lowest; y--) {
            let found = false;
            for (let x = 0; x < pixels.width; x++) {
                if (pixels.data[(y * pixels.width + x) * 4 + 3] >= 128) {
                    found = true;
                    break;
                }
            }
            if (found) {
                lowest = y;
                break;
            }
        }
    }
    return lowest < 0 ? null : lowest + 1;
}

/** One layer of a drawing: its pixels (all layers the same size) and what binds where. */
export interface PictureLayer {
    /** `"back"`, `"body"`, `"front"` (the file `1-back.png` is the layer `back`). */
    readonly name: string;
    readonly pixels: RgbaPixels;
    /** The bones its pixels may follow; none: every bone but the root. */
    readonly bones?: readonly string[] | null;
    /**
     * A hand-painted bone map as large as the layer (every pixel in its bone's colour, as in
     * `colors`); none: painted from the joints (each pixel the nearest bone it may follow).
     */
    readonly map?: RgbaPixels | null;
    /** A tint mask as large as the layer: red takes `tints.main`, green `second`, blue `accent`. */
    readonly tint?: RgbaPixels | null;
    /**
     * Moves the layer's pixels (with its bone map and tint mask) by whole pixels against the
     * joints, `[dx, dy]` (right, down), before it is rigged: a part drawn or generated a few pixels
     * off lines up with its joints again (since step 43). What leaves the canvas is cut.
     */
    readonly offset?: readonly [number, number] | null;
}

/** A layer's offset in whole pixels; `[0, 0]` for none. */
export function layer_offset(
    layer: Pick<PictureLayer, "offset">,
): [number, number] {
    const offset = layer.offset ?? null;
    return offset === null
        ? [0, 0]
        : [Math.round(offset[0]) + 0, Math.round(offset[1]) + 0];
}

/** A layer with its offset applied to its pixels, map and tint (the same layer without one). */
function shifted_layer(layer: PictureLayer): PictureLayer {
    const [dx, dy] = layer_offset(layer);
    if (dx === 0 && dy === 0) {
        return layer;
    }
    const shift = (pixels: RgbaPixels | null | undefined) =>
        pixels === undefined || pixels === null
            ? pixels
            : shift_pixels(pixels, dx, dy);
    return {
        ...layer,
        pixels: shift_pixels(layer.pixels, dx, dy),
        map: shift(layer.map),
        tint: shift(layer.tint),
    };
}

/** Everything `rig_from_picture()` takes. */
export interface RigFromPicture {
    /** Back to front; every layer as large as the first. */
    readonly layers: readonly PictureLayer[];
    /** The joints placed on the picture (picture pixels), by the template's joint names. */
    readonly joints: JointPoints;
    /** A template or its name (`"zweibeiner"`). */
    readonly template: SkeletonTemplate | string;
    /** The ground line's y in the picture's pixels; default the lowest drawn row. */
    readonly ground?: number;
    /** The skin's name. Default `"drawn"`. */
    readonly name?: string;
    /**
     * A rig of the same bones whose keyed clips carry over (step 38's wanderer for a Zweibeiner):
     * its angles on the fitted rest pose, the hip lifted so the soles stand where its soles stood.
     */
    readonly keyed_clips?: RigData | null;
    /** Colours for the tint mask's channels; without them the picture stays as drawn. */
    readonly tints?: Partial<SoftTints> | null;
    /** Make bite, fire and claw where the body allows. Default true. */
    readonly attacks?: boolean;
    /** Bone map colours by bone; default `map_color(index)` (as step 42 paints them). */
    readonly colors?: Readonly<Record<string, string>> | null;
    readonly cell_size?: number;
    readonly cpu_cell_size?: number;
    readonly blur?: number;
    /** The atlas's width; default 1024, wider when a picture needs it. */
    readonly atlas_width?: number;
}

/** A rigged picture: the rig with its soft skin, the atlas in memory, and what was made on the way. */
export interface PictureRig {
    readonly rig: RigData;
    /** The atlas: each layer cut to its drawn pixels, its bone map beside it; straight RGBA. */
    readonly pixels: RgbaPixels;
    readonly fitted: FittedSkeleton;
    /** The attacks made (their clips are also among the rig's clips), with their hit areas. */
    readonly attacks: Readonly<Record<string, CreatureAttackData>>;
    /** Each layer's bone map as used (painted or given), as large as the layer. */
    readonly maps: readonly RgbaPixels[];
}

/**
 * Paints a layer's bone map from the fitted skeleton: every pixel the layer draws (alpha above 0)
 * in the colour of the nearest bone it may follow, measured to the bone's line at rest.
 */
export function paint_bone_map(
    layer: RgbaPixels,
    fitted: FittedSkeleton,
    bones: readonly string[],
    colors: Readonly<Record<string, string>>,
): RgbaPixels {
    const out = blank_pixels(layer.width, layer.height);
    const lines = bones
        .map((name) => ({
            line: fitted.lines[name],
            rgb: parse_hex_color(colors[name] ?? ""),
        }))
        .filter((item) => item.line !== undefined && item.rgb !== null);
    if (lines.length === 0) {
        return out;
    }
    const [ox, oy] = fitted.origin;
    const data = out.data as Uint8Array;
    for (let y = 0; y < layer.height; y++) {
        for (let x = 0; x < layer.width; x++) {
            const at = (y * layer.width + x) * 4;
            if (layer.data[at + 3] === 0) {
                continue;
            }
            const px = x + 0.5 - ox;
            const py = y + 0.5 - oy;
            let best = 0;
            let best_distance = Infinity;
            for (let index = 0; index < lines.length; index++) {
                const distance = segment_distance(lines[index].line, px, py);
                if (distance < best_distance) {
                    best_distance = distance;
                    best = index;
                }
            }
            const rgb = lines[best].rgb!;
            data[at] = rgb[0];
            data[at + 1] = rgb[1];
            data[at + 2] = rgb[2];
            data[at + 3] = 255;
        }
    }
    return out;
}

function segment_distance(
    line: {
        readonly x0: number;
        readonly y0: number;
        readonly x1: number;
        readonly y1: number;
    },
    x: number,
    y: number,
): number {
    const dx = line.x1 - line.x0;
    const dy = line.y1 - line.y0;
    const squared = dx * dx + dy * dy;
    let t =
        squared > 0 ? ((x - line.x0) * dx + (y - line.y0) * dy) / squared : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (line.x0 + dx * t), y - (line.y0 + dy * t));
}

/**
 * Lays a tint mask's colours into a picture: where the mask's red, green or blue is, the
 * picture's lightness times `main`, `second` or `accent` (mixed by how strong each channel is);
 * black and empty mask pixels keep the picture as drawn.
 */
export function tint_pixels(
    pixels: RgbaPixels,
    mask: RgbaPixels,
    tints: Partial<SoftTints>,
): RgbaPixels {
    const out: RgbaPixels = {
        width: pixels.width,
        height: pixels.height,
        data: new Uint8Array(pixels.data),
    };
    const colors = [tints.main, tints.second, tints.accent].map((hex) =>
        hex === undefined ? null : parse_hex_color(hex),
    );
    const data = out.data as Uint8Array;
    for (let at = 0; at < data.length; at += 4) {
        const alpha = mask.data[at + 3] / 255;
        if (alpha === 0 || data[at + 3] === 0) {
            continue;
        }
        const lightness =
            (0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2]) /
            255;
        let r = 0;
        let g = 0;
        let b = 0;
        let used = 0;
        for (let channel = 0; channel < 3; channel++) {
            const color = colors[channel];
            const weight = (mask.data[at + channel] / 255) * alpha;
            if (color === null || weight === 0) {
                continue;
            }
            r += color[0] * lightness * weight;
            g += color[1] * lightness * weight;
            b += color[2] * lightness * weight;
            used += weight;
        }
        if (used === 0) {
            continue;
        }
        const keep = Math.max(0, 1 - used);
        data[at] = Math.round(Math.min(255, r + data[at] * keep));
        data[at + 1] = Math.round(Math.min(255, g + data[at + 1] * keep));
        data[at + 2] = Math.round(Math.min(255, b + data[at + 2] * keep));
    }
    return out;
}

/**
 * Rigs a hand-drawn picture (since step 43, Knochenwerkstatt): the template fitted to the placed
 * joints, each layer cut to its drawn pixels with a bone map beside it (painted from the joints
 * unless one is given), packed into one atlas in memory, and the clips of the template's kind
 * made at once: step 42's gaits (`idle`, `walk`, `run`) and attacks (`bite` with a jaw, `fire`,
 * `claw` with a limb to strike with), and with `keyed_clips` step 38's clips carried over. The
 * result is the data step 41's soft skin draws (`PuppetRig.from_data(rig)` with
 * `canvas_of_pixels(pixels)`); pure arithmetic on pixels, so it runs in Node too.
 */
export function rig_from_picture(input: RigFromPicture): PictureRig {
    const template =
        typeof input.template === "string"
            ? skeleton_template(input.template)
            : input.template;
    if (input.layers.length === 0) {
        throw new Error("rig_from_picture: no layers");
    }
    const width = input.layers[0].pixels.width;
    const height = input.layers[0].pixels.height;
    for (const layer of input.layers) {
        if (layer.pixels.width !== width || layer.pixels.height !== height) {
            throw new Error(
                `rig_from_picture: layer "${layer.name}" is ${layer.pixels.width} x ${layer.pixels.height}, the first ${width} x ${height}; all layers must be as large`,
            );
        }
        for (const [what, extra] of [
            ["bone map", layer.map],
            ["tint mask", layer.tint],
        ] as const) {
            if (
                extra !== undefined &&
                extra !== null &&
                (extra.width !== width || extra.height !== height)
            ) {
                throw new Error(
                    `rig_from_picture: the ${what} of "${layer.name}" must be as large as the layer (${width} x ${height})`,
                );
            }
        }
    }
    const names = new Set<string>();
    // Moved layers are rigged where they were moved to.
    const layers = input.layers.map(shifted_layer);
    for (const layer of layers) {
        if (names.has(layer.name)) {
            throw new Error(`rig_from_picture: layer "${layer.name}" twice`);
        }
        names.add(layer.name);
    }
    const ground =
        input.ground ??
        lowest_drawn_row(layers.map((layer) => layer.pixels)) ??
        height;
    const fitted = fit_template(template, input.joints, ground);
    const bone_names = fitted.bones.map((bone) => bone.name);
    const colors: Record<string, string> = {};
    for (const [index, name] of bone_names.entries()) {
        if (index > 0) {
            colors[name] = input.colors?.[name] ?? map_color(index);
        }
    }
    const all_bones = bone_names.slice(1);
    const cut: Array<{
        name: string;
        picture: RgbaPixels;
        map: RgbaPixels;
        box: [number, number, number, number];
        bones: readonly string[] | null;
    }> = [];
    const maps: RgbaPixels[] = [];
    for (const layer of layers) {
        const bones = layer.bones ?? null;
        for (const bone of bones ?? []) {
            if (!bone_names.includes(bone) || bone === "root") {
                throw new Error(
                    `rig_from_picture: layer "${layer.name}" names no bone "${bone}" of the ${template.title}`,
                );
            }
        }
        let pixels = layer.pixels;
        if (
            layer.tint !== undefined &&
            layer.tint !== null &&
            input.tints !== undefined &&
            input.tints !== null
        ) {
            pixels = tint_pixels(pixels, layer.tint, input.tints);
        }
        const map =
            layer.map ??
            paint_bone_map(pixels, fitted, bones ?? all_bones, colors);
        maps.push(map);
        const box = drawn_box(pixels);
        if (box === null) {
            continue;
        }
        cut.push({
            name: layer.name,
            picture: cut_pixels(pixels, box),
            map: cut_pixels(map, box),
            box,
            bones,
        });
    }
    if (cut.length === 0) {
        throw new Error("rig_from_picture: the picture is empty");
    }
    const boxes: Record<string, [number, number]> = {};
    for (const item of cut) {
        boxes[item.name] = [item.box[2], item.box[3]];
        boxes[`${item.name}#map`] = [item.box[2], item.box[3]];
    }
    const widest = Math.max(...cut.map((item) => item.box[2]));
    const atlas_width = Math.max(
        input.atlas_width ?? 1024,
        Math.ceil((widest + 2 * PACK_GAP) / 4) * 4,
    );
    const { places, height: atlas_height } = pack_boxes(boxes, atlas_width);
    const atlas = blank_pixels(atlas_width, atlas_height);
    const pictures: SoftPictureData[] = [];
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const [ox, oy] = fitted.origin;
    for (const item of cut) {
        const [x, y] = places[item.name];
        const [mx, my] = places[`${item.name}#map`];
        const [, , w, h] = item.box;
        copy_pixels(item.picture, [0, 0, w, h], atlas, x, y);
        copy_pixels(item.map, [0, 0, w, h], atlas, mx, my);
        pictures.push({
            name: item.name,
            rect: [x, y, w, h],
            map: [mx, my, w, h],
            origin: [r2(ox - item.box[0]), r2(oy - item.box[1])],
            ...(item.bones !== null ? { bones: item.bones } : {}),
        });
        left = Math.min(left, item.box[0] - ox);
        top = Math.min(top, item.box[1] - oy);
        right = Math.max(right, item.box[0] + w - ox);
        bottom = Math.max(bottom, item.box[1] + h - oy);
    }
    const body = fitted.body;
    const clips: Record<string, PuppetClipData> = {};
    const made = make_gaits(body);
    Object.assign(clips, made);
    const attacks: Record<string, CreatureAttackData> = {};
    if (input.attacks !== false) {
        const jaw =
            template.jaw !== undefined && bone_names.includes(template.jaw)
                ? template.jaw
                : null;
        const bite = make_bite(body, jaw);
        const fire = make_fire(body, jaw);
        const claw = make_claw(body);
        for (const attack of [bite, fire, claw]) {
            if (attack !== null) {
                attacks[attack.name] = attack;
                clips[attack.name] = attack.clip;
            }
        }
    }
    if (input.keyed_clips !== undefined && input.keyed_clips !== null) {
        Object.assign(clips, carry_clips(input.keyed_clips, fitted));
    }
    const jiggle: Record<string, JiggleData> = {};
    for (const tail of chains_of(body, "tail")) {
        for (const [index, bone] of tail.bones.entries()) {
            if (index > 0) {
                jiggle[bone] = {
                    half_life: 0.3,
                    strength: 0.5 + 0.1 * index,
                    max: 22,
                };
            }
        }
    }
    const skin = input.name ?? "drawn";
    const rig: RigData = {
        skeleton: template.skeleton,
        facing: "right",
        bounds: [r2(left), r2(top), r2(right - left), r2(bottom - top)],
        bones: fitted.bones,
        slots: fitted.slots,
        skins: {
            [skin]: {
                attachments: {},
                soft: {
                    pictures,
                    colors,
                    cell_size: input.cell_size ?? 12,
                    cpu_cell_size: input.cpu_cell_size ?? 32,
                    blur: input.blur ?? 20,
                },
            },
        },
        default_skin: skin,
        anchors: fitted.anchors,
        clips,
        default_clip: "idle",
        ...(Object.keys(jiggle).length > 0 ? { jiggle } : {}),
        drawing: {
            template: template.name,
            joints: Object.fromEntries(
                Object.entries(input.joints).map(([name, at]) => [
                    name,
                    [r2(at[0]), r2(at[1])] as const,
                ]),
            ),
            ground: r2(ground),
            size: [width, height],
            layers: input.layers.map((layer) => ({
                name: layer.name,
                ...(layer.bones !== undefined && layer.bones !== null
                    ? { bones: layer.bones }
                    : {}),
                ...(layer.map !== undefined && layer.map !== null
                    ? { map: true }
                    : {}),
                ...(is_moved(layer) ? { offset: layer_offset(layer) } : {}),
            })),
        },
    };
    return { rig, pixels: atlas, fitted, attacks, maps };
}

/** A built character opened again for rigging: what `rig_from_picture()` takes, back from its rig and atlas. */
export interface OpenedDrawing {
    readonly template: string;
    readonly joints: JointPoints;
    readonly ground: number;
    /** The skin's name. */
    readonly name: string;
    /** Each layer as large as the drawn picture, its pixels where they were drawn (tints laid in). */
    readonly layers: readonly PictureLayer[];
}

/**
 * Opens a character built by `rig_from_picture()` again (since step 43): its layers cut back out
 * of the atlas and put where they were drawn, a hand-painted bone map with them, and the template,
 * joints and ground from the rig's `drawing`. Null for a rig that was not drawn (no `drawing`).
 * `rig_from_picture(opened)` gives the same rig again.
 */
export function drawing_from_rig(
    rig: RigData,
    atlas: RgbaPixels,
): OpenedDrawing | null {
    const drawing: RigDrawingData | undefined = rig.drawing;
    if (drawing === undefined) {
        return null;
    }
    const name = rig.default_skin ?? Object.keys(rig.skins)[0];
    const soft = rig.skins[name]?.soft;
    if (soft === undefined) {
        return null;
    }
    const template = skeleton_template(drawing.template);
    const fitted = fit_template(template, drawing.joints, drawing.ground);
    const [ox, oy] = fitted.origin;
    const [width, height] = drawing.size;
    const layers: PictureLayer[] = drawing.layers.map((layer) => {
        const pixels = blank_pixels(width, height);
        const picture = soft.pictures.find((each) => each.name === layer.name);
        let map: RgbaPixels | null = null;
        // A moved layer goes back where it was drawn, its offset with it.
        const [dx, dy] = layer_offset(layer);
        if (picture !== undefined) {
            const x = Math.round(ox - picture.origin[0]) - dx;
            const y = Math.round(oy - picture.origin[1]) - dy;
            copy_pixels(atlas, picture.rect, pixels, x, y);
            if (layer.map === true && picture.map !== undefined) {
                map = blank_pixels(width, height);
                copy_pixels(atlas, picture.map, map, x, y);
            }
        }
        return {
            name: layer.name,
            pixels,
            bones: layer.bones ?? null,
            map,
            ...(dx !== 0 || dy !== 0 ? { offset: [dx, dy] as const } : {}),
        };
    });
    const joints: Record<string, [number, number]> = {};
    for (const [joint, at] of Object.entries(drawing.joints)) {
        joints[joint] = [at[0], at[1]];
    }
    return {
        template: drawing.template,
        joints,
        ground: drawing.ground,
        name,
        layers,
    };
}

/** Whether a layer is moved against the joints. */
function is_moved(layer: Pick<PictureLayer, "offset">): boolean {
    const [dx, dy] = layer_offset(layer);
    return dx !== 0 || dy !== 0;
}

function r2(value: number): number {
    return Math.round(value * 100) / 100 + 0;
}

function r3(value: number): number {
    return Math.round(value * 1000) / 1000 + 0;
}

/** The lowest of the given anchors (largest y) in the skeleton's pose now. */
function lowest_of(
    skeleton: Skeleton,
    anchors: RigData["anchors"],
    names: readonly string[],
): number {
    let lowest = -Infinity;
    for (const name of names) {
        const anchor = anchors?.[name];
        const index =
            anchor === undefined ? -1 : skeleton.index_of(anchor.bone);
        if (anchor === undefined || index < 0) {
            continue;
        }
        lowest = Math.max(
            lowest,
            skeleton.world_point(index, anchor.x, anchor.y).y,
        );
    }
    return lowest;
}

/**
 * Carries another rig's keyed clips onto a fitted skeleton of the same bones (step 38's clips onto
 * a drawn Zweibeiner): every angle as an offset on the fitted rest pose; shifts and `travel`
 * scaled by how much longer the legs are; and at every key the root chain's first bone (the hip)
 * raised or lowered so the lowest sole is as high over the ground as the source's was, so feet
 * that stood on the ground stand on it, and a jump jumps as high for its size. Clips naming a
 * bone the skeleton lacks are left out.
 */
export function carry_clips(
    source: RigData,
    fitted: FittedSkeleton,
): Record<string, PuppetClipData> {
    const target = Skeleton.from_data(fitted.bones);
    const from = Skeleton.from_data(source.bones);
    const soles = fitted.template.soles.filter(
        (name) =>
            source.anchors?.[name] !== undefined &&
            fitted.anchors[name] !== undefined,
    );
    const leg_of = (skeleton: Skeleton, anchors: RigData["anchors"]) => {
        skeleton.reset_pose();
        skeleton.update();
        const lowest = lowest_of(skeleton, anchors, soles);
        let highest_hip = Infinity;
        for (const chain of fitted.template.chains) {
            if (chain.stands !== true) {
                continue;
            }
            const index = skeleton.index_of(chain.bones[0]);
            if (index >= 0) {
                highest_hip = Math.min(highest_hip, skeleton.world_y(index));
            }
        }
        return Number.isFinite(lowest) && Number.isFinite(highest_hip)
            ? lowest - highest_hip
            : 0;
    };
    const target_leg = leg_of(target, fitted.anchors);
    const source_leg = leg_of(from, source.anchors);
    const ratio =
        target_leg > 0 && source_leg > 0
            ? target_leg / source_leg
            : fitted.size;
    const hip_name = root_chain(fitted.body).bones[0];
    const hip = target.index_of(hip_name);
    const out: Record<string, PuppetClipData> = {};
    for (const [name, data] of Object.entries(source.clips ?? {})) {
        if (
            Object.keys(data.tracks).some((bone) => target.index_of(bone) < 0)
        ) {
            continue;
        }
        const source_clip = PuppetClip.from_data(
            name,
            data,
            (bone) => from.index_of(bone),
            from.count,
        );
        const tracks: Record<string, PuppetKeyData[]> = {};
        for (const [bone, keys] of Object.entries(data.tracks)) {
            tracks[bone] = keys.map((key) => {
                const copy: {
                    -readonly [K in keyof PuppetKeyData]: PuppetKeyData[K];
                } = { ...key };
                if (key.x !== undefined) {
                    copy.x = r2(key.x * ratio);
                }
                if (key.y !== undefined) {
                    copy.y = r2(key.y * ratio);
                }
                return copy;
            });
        }
        if (soles.length > 0 && hip >= 0) {
            const times = new Set<number>();
            for (const keys of Object.values(data.tracks)) {
                for (const key of keys) {
                    times.add(key.t);
                }
            }
            const sorted = [...times].sort((a, b) => a - b);
            const carried = PuppetClip.from_data(
                name,
                { ...data, tracks },
                (bone) => target.index_of(bone),
                target.count,
            );
            const old_hip = tracks[hip_name] ?? [];
            const hip_keys: PuppetKeyData[] = [];
            for (const t of sorted) {
                from.reset_pose();
                source_clip.sample(t, from);
                from.update();
                const lift = -lowest_of(from, source.anchors, soles);
                target.reset_pose();
                carried.sample(t, target);
                target.update();
                const lowest = lowest_of(target, fitted.anchors, soles);
                const wanted = -lift * ratio;
                const near = old_hip.find((key) => key.t === t);
                const key: {
                    -readonly [K in keyof PuppetKeyData]: PuppetKeyData[K];
                } = { t };
                if (old_hip.some((each) => each.rotation !== undefined)) {
                    key.rotation = r3(target.rotation[hip]);
                }
                if (old_hip.some((each) => each.x !== undefined)) {
                    key.x = r2(target.x[hip]);
                }
                key.y = r2(
                    target.y[hip] + to_parent_y(target, hip, wanted - lowest),
                );
                if (near?.ease !== undefined) {
                    key.ease = near.ease;
                } else if (
                    old_hip.length > 0 &&
                    old_hip[0].ease !== undefined
                ) {
                    key.ease = old_hip[0].ease;
                }
                hip_keys.push(key);
            }
            tracks[hip_name] = hip_keys;
        }
        out[name] = {
            ...data,
            ...(data.travel !== undefined
                ? { travel: r2(data.travel * ratio) }
                : {}),
            tracks,
        };
    }
    return out;
}

/**
 * How far a bone's shift (in its parent's frame) must change to move it `dy` down in the world:
 * the root's frame is the world's, so on a bone hanging on the root it is `dy` itself.
 */
function to_parent_y(skeleton: Skeleton, index: number, dy: number): number {
    const parent = skeleton.parents[index];
    if (parent < 0) {
        return dy;
    }
    const angle = (skeleton.world_rotation(parent) * Math.PI) / 180;
    // A world shift (0, dy) seen in the parent's frame: its y part.
    return dy * Math.cos(angle);
}
