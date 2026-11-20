import { KitPartData, PartKit, PartKitData } from "./PartKit";
import {
    AttachmentData,
    MarkPictureData,
    MarkSheetData,
    PiecePartData,
    RigData,
    SoftPictureData,
    SoftSkinData,
    WardrobeData,
} from "./RigData";
import {
    blank_pixels,
    copy_pixels,
    cut_pixels,
    pack_boxes,
    PictureLayer,
    PictureRig,
    rig_from_picture,
} from "./RigPicture";
import { JointPoints } from "./SkeletonTemplate";
import { SoftTints } from "./SoftCompose";
import { RgbaPixels } from "./SoftMesh";

/**
 * Editable source folders (since step 43): one folder per character, one picture per part, and a
 * short `rig.json` (or `kit.json` for a part kit); the packed atlas and the catalogue's `rig` are
 * built from them (`build_rig_source()`), and an atlas with its rig can be taken apart into one
 * (`split_rig_atlas()`). Five kinds:
 *
 * - `picture`: a hand-drawn character, `rest.png` or layers `1-back.png`, `2-body.png`, ... (back
 *   to front, all as large), a skeleton template and the joints placed on it; optional bone maps
 *   (`bones.png`, `1-back.bones.png`) and tint masks (`tint.png`, `1-back.tint.png`). Or, written
 *   by a Blender script, the layers with their bone maps and the whole rig (`rig`) instead of a
 *   template: a soft skin (step 41).
 * - `parts`: a cut-out puppet (steps 38, 40): `parts/<slot>.png`, tint layers `parts/<slot>.<layer>.png`.
 * - `wardrobe`: clothes (step 39): `pieces/<piece>/<part>.png`.
 * - `marks`: a mark sheet (step 40): `marks/<id>.png`.
 * - `kit`: a part kit (step 42), `kit.json`: `parts/<id>.png` with its tint mask `parts/<id>.tint.png`.
 */
export const RIG_SOURCE_FORMAT = "spielwerk-rig-source";

export type RigSourceKind = "picture" | "parts" | "wardrobe" | "marks" | "kit";

interface SourceBase {
    readonly format: typeof RIG_SOURCE_FORMAT;
    readonly version: 1;
    readonly kind: RigSourceKind;
    /** The packed atlas's width. Default 1024 (512 for the Blender puppets, as they were). */
    readonly atlas_width?: number;
    /** A skin of another character (a library id): an editor starts from its joints. */
    readonly skin_of?: string;
    /** What a person calls it ("Kobold"). */
    readonly title?: string;
}

/**
 * A hand-drawn character: the template, the joints placed on the picture (its pixels), the ground
 * line, and per layer the bones it may follow (a layer left out follows every bone).
 */
export interface DrawnSourceData extends SourceBase {
    readonly kind: "picture";
    /** `zweibeiner`, `vierbeiner`, `wurm` or `flieger`. */
    readonly template: string;
    readonly joints: JointPoints;
    /** The ground line's y; default the lowest drawn row. */
    readonly ground?: number;
    /** Layer name -> the bones it may follow. */
    readonly layers?: Readonly<Record<string, readonly string[]>>;
    /** The skin's name; default the folder's. */
    readonly name?: string;
    /** A library id whose keyed clips carry over (`rendered/puppet/wanderer` for a Zweibeiner). */
    readonly clips_from?: string;
    /** Colours for the tint masks. */
    readonly tints?: Partial<SoftTints>;
    readonly cell_size?: number;
    readonly cpu_cell_size?: number;
    readonly blur?: number;
}

/** A soft skin written whole (step 41's Blender puppets): the rig without the atlas rectangles. */
export interface SoftSourceData extends SourceBase {
    readonly kind: "picture";
    readonly rig: RigData;
}

/** A cut-out puppet: the rig without rectangles; a part's `layers` are names (`["skin", "hair"]`). */
export interface PartsSourceData extends SourceBase {
    readonly kind: "parts";
    readonly rig: RigData;
}

export interface WardrobeSourceData extends SourceBase {
    readonly kind: "wardrobe";
    readonly rig: WardrobeData;
}

export interface MarksSourceData extends SourceBase {
    readonly kind: "marks";
    readonly rig: MarkSheetData;
}

/** A part kit's `kit.json`: the parts without rectangles (role, title, pivot, tip, points, ...). */
export interface KitSourceData extends SourceBase {
    readonly kind: "kit";
    readonly kinds?: readonly string[];
    readonly parts: Readonly<
        Record<string, Omit<KitPartData, "rect" | "mask">>
    >;
}

export type RigSourceData =
    | DrawnSourceData
    | SoftSourceData
    | PartsSourceData
    | WardrobeSourceData
    | MarksSourceData
    | KitSourceData;

/** A built source: the catalogue's `rig` and the atlas. */
export interface BuiltRigSource {
    readonly rig: RigData | WardrobeData | MarkSheetData | PartKitData;
    readonly pixels: RgbaPixels;
    /** For a hand-drawn character: the fitted skeleton, the attacks, the painted maps. */
    readonly picture?: PictureRig;
}

/** Reads a picture of the folder by its name in it (`parts/head.png`); null when there is none. */
export type ReadSourcePicture = (file: string) => RgbaPixels | null;

export interface BuildRigSourceOptions {
    /** The names of the folder's files (to find a drawing's layers). */
    readonly files?: readonly string[];
    /** The rig of a library id (`clips_from`). */
    readonly rig_of?: (id: string) => RigData | null;
    /** The skin's name when the source has none (the folder's). */
    readonly name?: string;
}

/** The source's file names a person sees: `rig.json`, or `kit.json` for a kit. */
export function source_data_file(kind: RigSourceKind): string {
    return kind === "kit" ? "kit.json" : "rig.json";
}

/** A drawing's layers from the folder's file names: `rest.png` alone, or `1-back.png`, `2-body.png`, ... in their order. */
export function drawn_layer_files(
    files: readonly string[],
): { name: string; file: string; map: string | null; tint: string | null }[] {
    const set = new Set(files);
    const numbered = files
        .map((file) => /^(\d+)-([^.]+)\.png$/.exec(file))
        .filter((match): match is RegExpExecArray => match !== null)
        .sort((a, b) => Number(a[1]) - Number(b[1]) || (a[2] < b[2] ? -1 : 1));
    if (numbered.length > 0) {
        return numbered.map((match) => {
            const stem = `${match[1]}-${match[2]}`;
            return {
                name: match[2],
                file: match[0],
                map: set.has(`${stem}.bones.png`) ? `${stem}.bones.png` : null,
                tint: set.has(`${stem}.tint.png`) ? `${stem}.tint.png` : null,
            };
        });
    }
    if (set.has("rest.png")) {
        return [
            {
                name: "body",
                file: "rest.png",
                map: set.has("bones.png") ? "bones.png" : null,
                tint: set.has("tint.png") ? "tint.png" : null,
            },
        ];
    }
    return [];
}

/** Puts the given fields into an object just before its first key of `before` (else first). */
function insert_before<T extends object>(
    object: T,
    fields: Record<string, unknown>,
    before: readonly string[],
): T {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(object);
    const at = keys.findIndex((key) => before.includes(key));
    const where = at < 0 ? 0 : at;
    for (const [index, key] of keys.entries()) {
        if (index === where) {
            Object.assign(out, fields);
        }
        out[key] = (object as Record<string, unknown>)[key];
    }
    if (keys.length === 0 || where >= keys.length) {
        Object.assign(out, fields);
    }
    return out as T;
}

/** An object without some keys, the rest in order. */
function without<T extends object>(object: T, drop: readonly string[]): T {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(object)) {
        if (!drop.includes(key)) {
            out[key] = value;
        }
    }
    return out as T;
}

function need(read: ReadSourcePicture, file: string): RgbaPixels {
    const pixels = read(file);
    if (pixels === null) {
        throw new Error(`the source folder has no ${file}`);
    }
    return pixels;
}

/** The only skin of a parts or soft rig: its name and data. */
function only_skin(rig: RigData): [string, RigData["skins"][string]] {
    const entries = Object.entries(rig.skins ?? {});
    if (entries.length !== 1) {
        throw new Error(
            `a source folder holds one skin; this rig has ${entries.length} (${entries.map(([name]) => name).join(", ")})`,
        );
    }
    return entries[0];
}

/** A part file's name: safe as a file name (`/` and `:` are not). */
function file_part(name: string): string {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.startsWith(".")) {
        throw new Error(`"${name}" can't be a file name in a source folder`);
    }
    return name;
}

/**
 * Builds a source folder (since step 43): the pictures packed into one atlas as the Blender scripts
 * pack them (`pack_boxes`), and the catalogue's `rig` with every rectangle filled in; a
 * hand-drawn character goes through `rig_from_picture()`. Throws on a picture that is missing or
 * not as large as it must be.
 */
export function build_rig_source(
    source: RigSourceData,
    read: ReadSourcePicture,
    options: BuildRigSourceOptions = {},
): BuiltRigSource {
    if (source.format !== RIG_SOURCE_FORMAT) {
        throw new Error(`not a rig source (format "${String(source.format)}")`);
    }
    if (source.kind === "picture" && "template" in source) {
        return build_drawn(source, read, options);
    }
    const width = source.atlas_width ?? 1024;
    const boxes: Record<string, [number, number]> = {};
    const pictures: Record<string, RgbaPixels> = {};
    const add = (key: string, file: string) => {
        const pixels = need(read, file);
        boxes[key] = [pixels.width, pixels.height];
        pictures[key] = pixels;
    };
    const same_size = (a: string, b: string) => {
        if (boxes[a][0] !== boxes[b][0] || boxes[a][1] !== boxes[b][1]) {
            throw new Error(
                `${b} must be as large as ${a} (${boxes[a][0]} x ${boxes[a][1]})`,
            );
        }
    };
    const pack = () => {
        const { places, height } = pack_boxes(boxes, width);
        const atlas = blank_pixels(width, height);
        const rects: Record<string, [number, number, number, number]> = {};
        for (const [key, [x, y]] of Object.entries(places)) {
            const pixels = pictures[key];
            copy_pixels(
                pixels,
                [0, 0, pixels.width, pixels.height],
                atlas,
                x,
                y,
            );
            rects[key] = [x, y, pixels.width, pixels.height];
        }
        return { atlas, rects };
    };
    if (source.kind === "picture") {
        const rig = source.rig;
        const [skin_name, skin] = only_skin(rig);
        const soft = skin.soft;
        if (soft === undefined) {
            throw new Error("a picture source's rig needs a soft skin");
        }
        for (const [index, picture] of soft.pictures.entries()) {
            const stem = `${index + 1}-${file_part(picture.name ?? `picture${index + 1}`)}`;
            add(picture.name ?? stem, `${stem}.png`);
            if (read(`${stem}.bones.png`) !== null) {
                add(`${picture.name ?? stem}#map`, `${stem}.bones.png`);
                same_size(picture.name ?? stem, `${picture.name ?? stem}#map`);
            }
        }
        const { atlas, rects } = pack();
        const pictures_out: SoftPictureData[] = soft.pictures.map(
            (picture, index) => {
                const key = picture.name ?? `${index + 1}-picture${index + 1}`;
                return insert_before(
                    picture,
                    {
                        rect: rects[key],
                        ...(rects[`${key}#map`] !== undefined
                            ? { map: rects[`${key}#map`] }
                            : {}),
                    },
                    ["origin"],
                );
            },
        );
        const soft_out: SoftSkinData = { ...soft, pictures: pictures_out };
        return {
            rig: {
                ...rig,
                skins: { [skin_name]: { ...skin, soft: soft_out } },
            },
            pixels: atlas,
        };
    }
    if (source.kind === "parts") {
        const rig = source.rig;
        const [skin_name, skin] = only_skin(rig);
        for (const [slot, part] of Object.entries(skin.attachments)) {
            add(slot, `parts/${file_part(slot)}.png`);
            for (const layer of part_layers(part)) {
                add(
                    `${slot}#${layer}`,
                    `parts/${file_part(slot)}.${file_part(layer)}.png`,
                );
                same_size(slot, `${slot}#${layer}`);
            }
        }
        const { atlas, rects } = pack();
        const attachments: Record<string, AttachmentData> = {};
        for (const [slot, part] of Object.entries(skin.attachments)) {
            const layers = part_layers(part);
            const filled: Record<string, unknown> = { ...part };
            if (layers.length > 0) {
                filled.layers = Object.fromEntries(
                    layers.map((layer) => [layer, rects[`${slot}#${layer}`]]),
                );
            }
            attachments[slot] = insert_before(
                filled as unknown as AttachmentData,
                { rect: rects[slot] },
                ["pivot"],
            );
        }
        return {
            rig: { ...rig, skins: { [skin_name]: { ...skin, attachments } } },
            pixels: atlas,
        };
    }
    if (source.kind === "wardrobe") {
        const rig = source.rig;
        for (const [id, piece] of Object.entries(rig.pieces)) {
            for (const [index, part] of piece.parts.entries()) {
                const name = part.name ?? String(index);
                add(
                    `${id}:${name}`,
                    `pieces/${file_part(id)}/${file_part(name)}.png`,
                );
            }
        }
        const { atlas, rects } = pack();
        const pieces: Record<string, WardrobeData["pieces"][string]> = {};
        for (const [id, piece] of Object.entries(rig.pieces)) {
            pieces[id] = {
                ...piece,
                parts: piece.parts.map(
                    (part, index) =>
                        insert_before(
                            part,
                            {
                                rect: rects[
                                    `${id}:${part.name ?? String(index)}`
                                ],
                            },
                            ["pivot"],
                        ) as PiecePartData,
                ),
            };
        }
        return { rig: { ...rig, pieces }, pixels: atlas };
    }
    if (source.kind === "marks") {
        const rig = source.rig;
        for (const id of Object.keys(rig.marks)) {
            add(id, `marks/${file_part(id)}.png`);
        }
        const { atlas, rects } = pack();
        const marks: Record<string, MarkPictureData> = {};
        for (const [id, mark] of Object.entries(rig.marks)) {
            marks[id] = insert_before(mark, { rect: rects[id] }, [
                "pivot",
                "title",
            ]);
        }
        return { rig: { ...rig, marks }, pixels: atlas };
    }
    const kit = kit_from_pictures(source, read);
    return { rig: kit.data, pixels: kit.pixels };
}

/** A part's tint layer names, from a source (a list) or a rig (an object of rectangles). */
function part_layers(part: AttachmentData): string[] {
    const layers = part.layers as unknown;
    if (Array.isArray(layers)) {
        return layers.map(String);
    }
    if (layers !== null && typeof layers === "object") {
        return Object.keys(layers);
    }
    return [];
}

function build_drawn(
    source: DrawnSourceData,
    read: ReadSourcePicture,
    options: BuildRigSourceOptions,
): BuiltRigSource {
    const files = options.files ?? [];
    const found = drawn_layer_files(
        files.length > 0
            ? files
            : ["rest.png", "bones.png", "tint.png"].filter(
                  (file) => read(file) !== null,
              ),
    );
    if (found.length === 0) {
        throw new Error(
            "a drawn character needs rest.png or layers 1-<name>.png, 2-<name>.png, ...",
        );
    }
    const layers: PictureLayer[] = found.map((layer) => ({
        name: layer.name,
        pixels: need(read, layer.file),
        bones: source.layers?.[layer.name] ?? null,
        map: layer.map === null ? null : read(layer.map),
        tint: layer.tint === null ? null : read(layer.tint),
    }));
    const keyed =
        source.clips_from === undefined
            ? null
            : (options.rig_of?.(source.clips_from) ?? null);
    const picture = rig_from_picture({
        layers,
        joints: source.joints,
        template: source.template,
        ground: source.ground,
        name: source.name ?? options.name,
        keyed_clips: keyed,
        tints: source.tints ?? null,
        cell_size: source.cell_size,
        cpu_cell_size: source.cpu_cell_size,
        blur: source.blur,
        atlas_width: source.atlas_width,
    });
    return { rig: picture.rig, pixels: picture.pixels, picture };
}

/**
 * Kit parts from single pictures (since step 43): `kit.json`'s parts with each part's picture
 * (`parts/<id>.png`) and tint mask (`parts/<id>.tint.png`), packed into one atlas as step 42's
 * kits are; a `PartKit` with its pixels, ready for `compose_soft_skin()`.
 */
export function kit_from_pictures(
    source: KitSourceData,
    read: ReadSourcePicture,
): { kit: PartKit; data: PartKitData; pixels: RgbaPixels } {
    const width = source.atlas_width ?? 1024;
    const boxes: Record<string, [number, number]> = {};
    const pictures: Record<string, RgbaPixels> = {};
    for (const id of Object.keys(source.parts)) {
        const picture = need(read, `parts/${file_part(id)}.png`);
        const mask = need(read, `parts/${file_part(id)}.tint.png`);
        if (mask.width !== picture.width || mask.height !== picture.height) {
            throw new Error(
                `parts/${id}.tint.png must be as large as parts/${id}.png (${picture.width} x ${picture.height})`,
            );
        }
        boxes[id] = [picture.width, picture.height];
        boxes[`${id}#mask`] = [mask.width, mask.height];
        pictures[id] = picture;
        pictures[`${id}#mask`] = mask;
    }
    const { places, height } = pack_boxes(boxes, width);
    const atlas = blank_pixels(width, height);
    for (const [key, [x, y]] of Object.entries(places)) {
        const pixels = pictures[key];
        copy_pixels(pixels, [0, 0, pixels.width, pixels.height], atlas, x, y);
    }
    const parts: Record<string, KitPartData> = {};
    for (const [id, part] of Object.entries(source.parts)) {
        const [x, y] = places[id];
        const [mx, my] = places[`${id}#mask`];
        const [w, h] = boxes[id];
        parts[id] = insert_before(
            part as KitPartData,
            { rect: [x, y, w, h], mask: [mx, my, w, h] },
            ["pivot"],
        );
    }
    const data: PartKitData = {
        ...(source.kinds !== undefined ? { kinds: source.kinds } : {}),
        parts,
    };
    const kit = PartKit.from_data(data);
    kit.pixels = atlas;
    return { kit, data, pixels: atlas };
}

/** What a catalogue rig is, for its source folder. */
export function rig_source_kind(rig: unknown): RigSourceKind {
    const data = rig as Record<string, unknown>;
    if (data === null || typeof data !== "object") {
        throw new Error("no rig data");
    }
    if ("bones" in data) {
        const skins = Object.values(
            (data.skins ?? {}) as Record<string, { soft?: unknown }>,
        );
        return skins.some((skin) => skin.soft !== undefined)
            ? "picture"
            : "parts";
    }
    if ("pieces" in data) {
        return "wardrobe";
    }
    if ("marks" in data) {
        return "marks";
    }
    if ("parts" in data) {
        return "kit";
    }
    throw new Error("a rig of no kind a source folder knows");
}

/**
 * Takes a built atlas and its rig apart into a source folder (since step 43): every part,
 * picture, bone map and mask cut out into a file of its own, and the rig without its rectangles.
 * `build_rig_source()` packs them back into the same rectangles when the atlas was packed with
 * `pack_boxes` at `atlas_width` (the atlas's own width by default).
 */
export function split_rig_atlas(
    rig: RigData | WardrobeData | MarkSheetData | PartKitData,
    atlas: RgbaPixels,
    options: { readonly atlas_width?: number } = {},
): { source: RigSourceData; files: Record<string, RgbaPixels> } {
    const kind = rig_source_kind(rig);
    const files: Record<string, RgbaPixels> = {};
    const atlas_width = options.atlas_width ?? atlas.width;
    const base = {
        format: RIG_SOURCE_FORMAT as typeof RIG_SOURCE_FORMAT,
        version: 1 as const,
        kind,
        atlas_width,
    };
    if (kind === "picture" || kind === "parts") {
        const data = rig as RigData;
        const [skin_name, skin] = only_skin(data);
        if (kind === "picture") {
            const soft = skin.soft!;
            const pictures = soft.pictures.map((picture, index) => {
                const stem = `${index + 1}-${file_part(picture.name ?? `picture${index + 1}`)}`;
                files[`${stem}.png`] = cut_pixels(atlas, picture.rect);
                if (picture.map !== undefined) {
                    files[`${stem}.bones.png`] = cut_pixels(atlas, picture.map);
                }
                return without(picture, ["rect", "map"]) as SoftPictureData;
            });
            return {
                source: {
                    ...base,
                    kind: "picture",
                    rig: {
                        ...data,
                        skins: {
                            [skin_name]: {
                                ...skin,
                                soft: { ...soft, pictures },
                            },
                        },
                    },
                },
                files,
            };
        }
        const attachments: Record<string, unknown> = {};
        for (const [slot, part] of Object.entries(skin.attachments)) {
            files[`parts/${file_part(slot)}.png`] = cut_pixels(
                atlas,
                part.rect,
            );
            const stripped = without(
                part as unknown as Record<string, unknown>,
                ["rect"],
            );
            if (part.layers !== undefined) {
                for (const [layer, box] of Object.entries(part.layers)) {
                    files[`parts/${file_part(slot)}.${file_part(layer)}.png`] =
                        cut_pixels(atlas, box);
                }
                stripped.layers = Object.keys(part.layers);
            }
            attachments[slot] = stripped;
        }
        return {
            source: {
                ...base,
                kind: "parts",
                rig: {
                    ...data,
                    skins: {
                        [skin_name]: {
                            ...skin,
                            attachments:
                                attachments as RigData["skins"][string]["attachments"],
                        },
                    },
                },
            },
            files,
        };
    }
    if (kind === "wardrobe") {
        const data = rig as WardrobeData;
        const pieces: Record<string, WardrobeData["pieces"][string]> = {};
        for (const [id, piece] of Object.entries(data.pieces)) {
            pieces[id] = {
                ...piece,
                parts: piece.parts.map((part, index) => {
                    files[
                        `pieces/${file_part(id)}/${file_part(part.name ?? String(index))}.png`
                    ] = cut_pixels(atlas, part.rect);
                    return without(part, ["rect"]) as PiecePartData;
                }),
            };
        }
        return {
            source: { ...base, kind: "wardrobe", rig: { ...data, pieces } },
            files,
        };
    }
    if (kind === "marks") {
        const data = rig as MarkSheetData;
        const marks: Record<string, MarkPictureData> = {};
        for (const [id, mark] of Object.entries(data.marks)) {
            files[`marks/${file_part(id)}.png`] = cut_pixels(atlas, mark.rect);
            marks[id] = without(mark, ["rect"]) as MarkPictureData;
        }
        return {
            source: { ...base, kind: "marks", rig: { ...data, marks } },
            files,
        };
    }
    const data = rig as PartKitData;
    const parts: Record<string, Omit<KitPartData, "rect" | "mask">> = {};
    for (const [id, part] of Object.entries(data.parts)) {
        files[`parts/${file_part(id)}.png`] = cut_pixels(atlas, part.rect);
        files[`parts/${file_part(id)}.tint.png`] = cut_pixels(atlas, part.mask);
        parts[id] = without(part, ["rect", "mask"]);
    }
    return {
        source: {
            ...base,
            kind: "kit",
            ...(data.kinds !== undefined ? { kinds: data.kinds } : {}),
            parts,
        },
        files,
    };
}

/** How many pixels of two pictures differ by more than `tolerance` in any channel (sizes must match). */
export function pixel_difference(
    a: RgbaPixels,
    b: RgbaPixels,
    tolerance = 0,
): number {
    if (a.width !== b.width || a.height !== b.height) {
        return Math.max(a.width * a.height, b.width * b.height);
    }
    let differ = 0;
    for (let at = 0; at < a.data.length; at += 4) {
        // Fully clear pixels are the same whatever colour they keep.
        if (a.data[at + 3] === 0 && b.data[at + 3] === 0) {
            continue;
        }
        for (let channel = 0; channel < 4; channel++) {
            if (
                Math.abs(a.data[at + channel] - b.data[at + channel]) >
                tolerance
            ) {
                differ += 1;
                break;
            }
        }
    }
    return differ;
}
