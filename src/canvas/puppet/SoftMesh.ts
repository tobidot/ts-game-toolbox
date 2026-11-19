import type { Skeleton } from "./Skeleton";

/** RGBA pixels, four bytes each, row by row: an `ImageData`, or a decoded PNG in a test. */
export interface RgbaPixels {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8Array | Uint8ClampedArray;
}

/** One picture of a soft skin as the mesh takes it: bones by number, rectangles in the atlas. */
export interface SoftMeshPicture {
    readonly rect: readonly [number, number, number, number];
    readonly map: readonly [number, number, number, number] | null;
    readonly origin: readonly [number, number];
    /** Bones its points may bind to; null for the skin's. */
    readonly bones: readonly number[] | null;
}

/** Everything `SoftMesh.from_picture()` needs. */
export interface SoftMeshSource {
    /** The atlas's pixels; null when they can't be read (then every cell is kept and points bind by distance). */
    readonly pixels: RgbaPixels | null;
    readonly pictures: readonly SoftMeshPicture[];
    /** Atlas pixels per rig unit. */
    readonly resolution: number;
    /** The grid's spacing, in atlas pixels. */
    readonly cell_size: number;
    /** The bone map's blur, in atlas pixels. */
    readonly blur: number;
    /** Each bone's colour in the bone maps, `[r, g, b]` 0..255, by bone number. */
    readonly colors: ReadonlyMap<number, readonly [number, number, number]>;
    /** Bones any point may bind to (a picture may narrow it). */
    readonly bones: readonly number[];
    /** The rig's skeleton at rest: where the bones lie in the pictures (for binding by distance). */
    readonly rest: Skeleton;
}

/** Bones per point: as in most skinning, four. */
export const SOFT_BONES_PER_POINT = 4;
/** A pixel of the bone map counts when its alpha is at least this. */
const MAP_ALPHA = 128;
/** A map pixel belongs to a bone when its colour is this near (squared RGB distance). */
const MAP_COLOR_DISTANCE = 60 * 60;
/** A bone with less than this share of a point's weight is left out. */
const SMALLEST_WEIGHT = 0.02;

/**
 * A soft skin's mesh: a grid over its pictures, cut where they have no pixels, every point bound to
 * up to four bones (`bones` and `weights`, four per point, the weights summing to 1). Points are
 * where the picture is at rest (`rest`, the rig's units, the root at 0, 0); `uv` is where they are in
 * the atlas. Triangles go picture by picture, back to front, so drawing them in order layers them.
 *
 * Made once per skin and cell size (`SoftSkin.mesh()`), shared by every puppet wearing the skin;
 * a puppet moves the points with its bones each frame: `skin_points()` on the CPU, the same
 * maths in the vertex shader on the graphics card.
 */
export class SoftMesh {
    public readonly count: number;
    /** Two per point: at rest, in rig units. */
    public readonly rest: Float64Array;
    /** Two per point: in the atlas's pixels. */
    public readonly uv: Float32Array;
    /** Four bone numbers per point (unused ones 0 with weight 0). */
    public readonly bones: Uint8Array;
    /** Four weights per point, summing to 1. */
    public readonly weights: Float32Array;
    /** Three per point: the weights' colour (each bone's colour, mixed by weight), for showing them. */
    public readonly colors: Float32Array;
    /** Three point numbers per triangle, back to front. */
    public readonly triangles: Uint32Array;
    /** How each point got its weights: `"map"`, or `"distance"` without a bone map there. */
    public readonly bound_by: readonly ("map" | "distance")[];

    public constructor(
        public readonly cell_size: number,
        rest: Float64Array,
        uv: Float32Array,
        bones: Uint8Array,
        weights: Float32Array,
        colors: Float32Array,
        triangles: Uint32Array,
        bound_by: readonly ("map" | "distance")[],
    ) {
        this.count = rest.length / 2;
        this.rest = rest;
        this.uv = uv;
        this.bones = bones;
        this.weights = weights;
        this.colors = colors;
        this.triangles = triangles;
        this.bound_by = bound_by;
    }

    /**
     * The grid over the pictures: a cell of `cell_size` atlas pixels is kept where the picture has
     * a pixel (or touches one), and each point is bound to up to four bones: the bone map blurred
     * by `blur` pixels and sampled at the point (a leg never takes weight from the leg beside it
     * unless they touch within the blur), or by its distance to the bone lines where there is no map.
     */
    public static from_picture(source: SoftMeshSource): SoftMesh {
        const cell = source.cell_size;
        if (!(cell >= 1) || !Number.isFinite(cell)) {
            throw new Error("a soft mesh's cell size must be at least 1 pixel");
        }
        const rest: number[] = [];
        const uv: number[] = [];
        const bones: number[] = [];
        const weights: number[] = [];
        const triangles: number[] = [];
        const bound_by: ("map" | "distance")[] = [];
        const scratch = new Float64Array(source.rest.count);
        for (const picture of source.pictures) {
            const [rect_x, rect_y, width, height] = picture.rect;
            const columns = Math.max(1, Math.ceil(width / cell));
            const rows = Math.max(1, Math.ceil(height / cell));
            const kept = new Uint8Array(columns * rows);
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    kept[row * columns + column] = has_pixels(
                        source.pixels,
                        rect_x,
                        rect_y,
                        width,
                        height,
                        column * cell,
                        row * cell,
                        cell,
                    )
                        ? 1
                        : 0;
                }
            }
            const labels = label_map(source, picture);
            const allowed = picture.bones ?? source.bones;
            const point_at = new Int32Array((columns + 1) * (rows + 1)).fill(
                -1,
            );
            const point = (column: number, row: number): number => {
                const at = row * (columns + 1) + column;
                if (point_at[at] >= 0) {
                    return point_at[at];
                }
                const u = Math.min(column * cell, width);
                const v = Math.min(row * cell, height);
                const index = rest.length / 2;
                point_at[at] = index;
                const x = (u - picture.origin[0]) / source.resolution;
                const y = (v - picture.origin[1]) / source.resolution;
                rest.push(x, y);
                uv.push(rect_x + u, rect_y + v);
                const by = bind_point(
                    source,
                    labels,
                    width,
                    height,
                    u,
                    v,
                    x,
                    y,
                    allowed,
                    scratch,
                );
                bound_by.push(by);
                const chosen = strongest(scratch, allowed);
                for (let slot = 0; slot < SOFT_BONES_PER_POINT; slot++) {
                    bones.push(chosen.bones[slot]);
                    weights.push(chosen.weights[slot]);
                }
                return index;
            };
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    if (kept[row * columns + column] === 0) {
                        continue;
                    }
                    const a = point(column, row);
                    const b = point(column + 1, row);
                    const c = point(column + 1, row + 1);
                    const d = point(column, row + 1);
                    // The diagonals alternate, so a bend looks alike either way.
                    if ((column + row) % 2 === 0) {
                        triangles.push(a, b, c, a, c, d);
                    } else {
                        triangles.push(a, b, d, b, c, d);
                    }
                }
            }
        }
        const count = rest.length / 2;
        const colors = new Float32Array(count * 3);
        for (let index = 0; index < count; index++) {
            for (let slot = 0; slot < SOFT_BONES_PER_POINT; slot++) {
                const weight = weights[index * 4 + slot];
                if (weight === 0) {
                    continue;
                }
                const color = bone_color(
                    source.colors,
                    bones[index * 4 + slot],
                );
                colors[index * 3] += (weight * color[0]) / 255;
                colors[index * 3 + 1] += (weight * color[1]) / 255;
                colors[index * 3 + 2] += (weight * color[2]) / 255;
            }
        }
        return new SoftMesh(
            cell,
            Float64Array.from(rest),
            Float32Array.from(uv),
            Uint8Array.from(bones),
            Float32Array.from(weights),
            colors,
            Uint32Array.from(triangles),
            bound_by,
        );
    }

    /** The box around the points at rest: `[left, top, right, bottom]` in rig units. */
    public rest_box(): [number, number, number, number] {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (let index = 0; index < this.rest.length; index += 2) {
            left = Math.min(left, this.rest[index]);
            right = Math.max(right, this.rest[index]);
            top = Math.min(top, this.rest[index + 1]);
            bottom = Math.max(bottom, this.rest[index + 1]);
        }
        return [left, top, right, bottom];
    }
}

/** A colour of the bone map for a bone without one: a hue by its number. */
export function bone_color(
    colors: ReadonlyMap<number, readonly [number, number, number]>,
    bone: number,
): readonly [number, number, number] {
    const known = colors.get(bone);
    if (known !== undefined) {
        return known;
    }
    const hue = (bone * 137.508) % 360;
    const f = (n: number) => {
        const k = (n + hue / 30) % 12;
        return Math.round(
            255 * (0.55 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
        );
    };
    return [f(0), f(8), f(4)];
}

/** `"#d04040"` as `[208, 64, 64]`; null when it isn't one. */
export function parse_hex_color(text: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
    if (match === null) {
        return null;
    }
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Does the cell (with a pixel's margin) hold a pixel of the picture? Without pixels: yes. */
function has_pixels(
    pixels: RgbaPixels | null,
    rect_x: number,
    rect_y: number,
    width: number,
    height: number,
    u: number,
    v: number,
    cell: number,
): boolean {
    if (pixels === null) {
        return true;
    }
    const left = Math.max(0, Math.floor(u) - 1);
    const top = Math.max(0, Math.floor(v) - 1);
    const right = Math.min(width, Math.ceil(u + cell) + 1);
    const bottom = Math.min(height, Math.ceil(v + cell) + 1);
    for (let y = top; y < bottom; y++) {
        const py = rect_y + y;
        if (py < 0 || py >= pixels.height) {
            continue;
        }
        const row = py * pixels.width;
        for (let x = left; x < right; x++) {
            const px = rect_x + x;
            if (px < 0 || px >= pixels.width) {
                continue;
            }
            if (pixels.data[(row + px) * 4 + 3] > 0) {
                return true;
            }
        }
    }
    return false;
}

/** The bone map's pixels as bone numbers (-1 for none); null without a map or pixels. */
function label_map(
    source: SoftMeshSource,
    picture: SoftMeshPicture,
): Int16Array | null {
    const pixels = source.pixels;
    const map = picture.map;
    if (pixels === null || map === null || source.colors.size === 0) {
        return null;
    }
    const [map_x, map_y, width, height] = map;
    const palette = [...source.colors.entries()];
    const labels = new Int16Array(width * height).fill(-1);
    for (let y = 0; y < height; y++) {
        const py = map_y + y;
        if (py < 0 || py >= pixels.height) {
            continue;
        }
        for (let x = 0; x < width; x++) {
            const px = map_x + x;
            if (px < 0 || px >= pixels.width) {
                continue;
            }
            const at = (py * pixels.width + px) * 4;
            if (pixels.data[at + 3] < MAP_ALPHA) {
                continue;
            }
            let best = -1;
            let best_distance = MAP_COLOR_DISTANCE;
            for (const [bone, [r, g, b]] of palette) {
                const dr = pixels.data[at] - r;
                const dg = pixels.data[at + 1] - g;
                const db = pixels.data[at + 2] - b;
                const distance = dr * dr + dg * dg + db * db;
                if (distance < best_distance) {
                    best = bone;
                    best_distance = distance;
                }
            }
            labels[y * width + x] = best;
        }
    }
    return labels;
}

/**
 * Fills `out` (one weight per bone) for a point at `u`, `v` of its picture: the bone map blurred
 * (a Gaussian of `blur` pixels' reach) if the map has a bone near the point, else by distance to
 * the bone lines at rest.
 */
function bind_point(
    source: SoftMeshSource,
    labels: Int16Array | null,
    width: number,
    height: number,
    u: number,
    v: number,
    x: number,
    y: number,
    allowed: readonly number[],
    out: Float64Array,
): "map" | "distance" {
    out.fill(0);
    if (labels !== null) {
        const reach = Math.max(1, Math.ceil(source.blur));
        const sigma = Math.max(0.5, source.blur / 2);
        if (gather(labels, width, height, u, v, reach, sigma, out)) {
            return "map";
        }
        // A corner off the picture, past the blur: the nearest bone of the map, a little further out.
        if (
            gather(
                labels,
                width,
                height,
                u,
                v,
                reach * 2 + Math.ceil(source.cell_size),
                sigma * 2 + source.cell_size,
                out,
            )
        ) {
            return "map";
        }
    }
    by_distance(source.rest, allowed, x, y, out);
    return "distance";
}

/** Adds the map's bones around (u, v), weighted by a Gaussian; false when there are none. */
function gather(
    labels: Int16Array,
    width: number,
    height: number,
    u: number,
    v: number,
    reach: number,
    sigma: number,
    out: Float64Array,
): boolean {
    let total = 0;
    const left = Math.max(0, Math.floor(u - reach));
    const right = Math.min(width - 1, Math.ceil(u + reach));
    const top = Math.max(0, Math.floor(v - reach));
    const bottom = Math.min(height - 1, Math.ceil(v + reach));
    const spread = 2 * sigma * sigma;
    for (let py = top; py <= bottom; py++) {
        const dy = py + 0.5 - v;
        for (let px = left; px <= right; px++) {
            const bone = labels[py * width + px];
            if (bone < 0 || bone >= out.length) {
                continue;
            }
            const dx = px + 0.5 - u;
            const squared = dx * dx + dy * dy;
            if (squared > reach * reach) {
                continue;
            }
            const weight = Math.exp(-squared / spread);
            out[bone] += weight;
            total += weight;
        }
    }
    return total > 0;
}

/** Weights by distance to each allowed bone's line at rest: nearer is much heavier. */
function by_distance(
    rest: Skeleton,
    allowed: readonly number[],
    x: number,
    y: number,
    out: Float64Array,
): void {
    let nearest = Infinity;
    const distances = allowed.map((bone) => {
        const distance = rest.distance_to_bone(bone, x, y);
        nearest = Math.min(nearest, distance);
        return distance;
    });
    // Within a few units of the nearest line the bones share; further off they fade fast.
    const reach = Math.max(4, nearest * 0.5);
    for (const [at, bone] of allowed.entries()) {
        const over = distances[at] - nearest;
        out[bone] += Math.exp(-(over * over) / (2 * reach * reach));
    }
}

/** The four heaviest allowed bones of `weights`, normalised; tiny shares left out. */
function strongest(
    weights: Float64Array,
    allowed: readonly number[],
): { bones: number[]; weights: number[] } {
    const order = allowed
        .filter((bone) => weights[bone] > 0)
        .sort((a, b) => weights[b] - weights[a] || a - b)
        .slice(0, SOFT_BONES_PER_POINT);
    let total = 0;
    for (const bone of order) {
        total += weights[bone];
    }
    const kept = order.filter(
        (bone) => total > 0 && weights[bone] / total >= SMALLEST_WEIGHT,
    );
    let sum = 0;
    for (const bone of kept) {
        sum += weights[bone];
    }
    const out_bones = [0, 0, 0, 0];
    const out_weights = [0, 0, 0, 0];
    if (kept.length === 0) {
        out_bones[0] = allowed[0] ?? 0;
        out_weights[0] = 1;
        return { bones: out_bones, weights: out_weights };
    }
    for (const [slot, bone] of kept.entries()) {
        out_bones[slot] = bone;
        out_weights[slot] = weights[bone] / sum;
    }
    // Rounding to 32-bit floats: the first weight takes what is left, so they sum to 1.
    let rounded = 0;
    for (let slot = 1; slot < SOFT_BONES_PER_POINT; slot++) {
        out_weights[slot] = Math.fround(out_weights[slot]);
        rounded += out_weights[slot];
    }
    out_weights[0] = 1 - rounded;
    return { bones: out_bones, weights: out_weights };
}

/**
 * Each bone's skinning matrix, six numbers per bone (`a, b, c, d, e, f` as a canvas takes them):
 * from where a point lay at rest to where its bone puts it now, `placement` included (the
 * puppet's place and size on the context, with the context's own transform). A point bound only
 * to bone i lands at `matrix_i * point`.
 */
export function soft_matrices(
    skeleton: Skeleton,
    rest_inverse: Float64Array,
    placement: readonly [number, number, number, number, number, number],
    out: Float64Array,
): Float64Array {
    const bone = new Float64Array(6);
    const [pa, pb, pc, pd, pe, pf] = placement;
    for (let index = 0; index < skeleton.count; index++) {
        skeleton.bone_matrix(index, bone);
        const at = index * 6;
        // The bone now times its rest pose turned back.
        const ia = rest_inverse[at];
        const ib = rest_inverse[at + 1];
        const ic = rest_inverse[at + 2];
        const id = rest_inverse[at + 3];
        const ie = rest_inverse[at + 4];
        const jf = rest_inverse[at + 5];
        const a = bone[0] * ia + bone[2] * ib;
        const b = bone[1] * ia + bone[3] * ib;
        const c = bone[0] * ic + bone[2] * id;
        const d = bone[1] * ic + bone[3] * id;
        const e = bone[0] * ie + bone[2] * jf + bone[4];
        const f = bone[1] * ie + bone[3] * jf + bone[5];
        // Placed on the context.
        out[at] = pa * a + pc * b;
        out[at + 1] = pb * a + pd * b;
        out[at + 2] = pa * c + pc * d;
        out[at + 3] = pb * c + pd * d;
        out[at + 4] = pa * e + pc * f + pe;
        out[at + 5] = pb * e + pd * f + pf;
    }
    return out;
}

/** The rest pose's bone matrices turned back, six numbers per bone: what `soft_matrices()` starts from. */
export function rest_inverse_of(rest: Skeleton): Float64Array {
    const out = new Float64Array(rest.count * 6);
    const m = new Float64Array(6);
    for (let index = 0; index < rest.count; index++) {
        rest.bone_matrix(index, m);
        const determinant = m[0] * m[3] - m[1] * m[2];
        const at = index * 6;
        if (determinant === 0) {
            out[at] = 1;
            out[at + 3] = 1;
            continue;
        }
        out[at] = m[3] / determinant;
        out[at + 1] = -m[1] / determinant;
        out[at + 2] = -m[2] / determinant;
        out[at + 3] = m[0] / determinant;
        out[at + 4] = (m[2] * m[5] - m[3] * m[4]) / determinant;
        out[at + 5] = (m[1] * m[4] - m[0] * m[5]) / determinant;
    }
    return out;
}

/**
 * Every point of the mesh where its bones put it now (linear blend skinning): `out[2i], out[2i+1]`
 * is the sum over its four bones of weight times `matrix * rest point`. The CPU's drawing and
 * the grid use it; the vertex shader does the same (`skin_point_as_shader`).
 */
export function skin_points(
    mesh: SoftMesh,
    matrices: Float64Array,
    out: Float64Array,
): Float64Array {
    const rest = mesh.rest;
    const bones = mesh.bones;
    const weights = mesh.weights;
    for (let index = 0; index < mesh.count; index++) {
        const x = rest[index * 2];
        const y = rest[index * 2 + 1];
        let sum_x = 0;
        let sum_y = 0;
        for (let slot = 0; slot < SOFT_BONES_PER_POINT; slot++) {
            const weight = weights[index * 4 + slot];
            if (weight === 0) {
                continue;
            }
            const at = bones[index * 4 + slot] * 6;
            sum_x +=
                weight *
                (matrices[at] * x + matrices[at + 2] * y + matrices[at + 4]);
            sum_y +=
                weight *
                (matrices[at + 1] * x +
                    matrices[at + 3] * y +
                    matrices[at + 5]);
        }
        out[index * 2] = sum_x;
        out[index * 2 + 1] = sum_y;
    }
    return out;
}
