import { ShapeData } from "./RigData";

/** A soft push of a shape value on the parts of one bone, read from `ShapePushData`. */
export interface PuppetPush {
    readonly bone: number;
    /** `[a, b, c, d]` along the bone; null: everywhere. */
    readonly along: readonly [number, number, number, number] | null;
    /** `[from, to]` across the bone; null: everywhere. */
    readonly across: readonly [number, number] | null;
    readonly push_x: number;
    readonly push_y: number;
    readonly swell: number;
}

/** A body shape value of a rig, read from `ShapeData`: the bones it scales and its pushes. */
export interface PuppetShape {
    readonly name: string;
    readonly title: string;
    readonly min: number;
    readonly max: number;
    /** Per bone (by number): the scale added along and across it per unit of the value. */
    readonly bones: readonly {
        readonly bone: number;
        readonly length: number;
        readonly width: number;
    }[];
    readonly pushes: readonly PuppetPush[];
}

/**
 * Reads a rig's `shapes`; `index_of` names the bones. Throws, with the shape's name, on an
 * unknown bone, a `min` above `max`, an `along` that doesn't rise or a value that isn't a number.
 */
export function shapes_from_data(
    data: Readonly<Record<string, ShapeData>>,
    index_of: (bone: string) => number,
): Map<string, PuppetShape> {
    const shapes = new Map<string, PuppetShape>();
    for (const [name, shape] of Object.entries(data)) {
        const where = `shape "${name}"`;
        const min = shape.min ?? -1;
        const max = shape.max ?? 1;
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
            throw new Error(
                `${where}: min and max must be numbers, min not above max`,
            );
        }
        const bones: { bone: number; length: number; width: number }[] = [];
        for (const [bone_name, scale] of Object.entries(shape.bones ?? {})) {
            const bone = index_of(bone_name);
            if (bone < 0) {
                throw new Error(`${where}: no bone "${bone_name}"`);
            }
            if (
                !Array.isArray(scale) ||
                scale.length !== 2 ||
                !scale.every(Number.isFinite)
            ) {
                throw new Error(
                    `${where}, bone "${bone_name}": [length, width] must be two numbers`,
                );
            }
            bones.push({ bone, length: scale[0], width: scale[1] });
        }
        const pushes: PuppetPush[] = [];
        for (const push of shape.pushes ?? []) {
            const bone = index_of(push.bone);
            if (bone < 0) {
                throw new Error(`${where}: a push on no bone "${push.bone}"`);
            }
            const along = push.along ?? null;
            if (
                along !== null &&
                (!Array.isArray(along) ||
                    along.length !== 4 ||
                    !along.every(Number.isFinite) ||
                    along[0] > along[1] ||
                    along[1] > along[2] ||
                    along[2] > along[3])
            ) {
                throw new Error(
                    `${where}, push on "${push.bone}": along must be four rising numbers [a, b, c, d]`,
                );
            }
            const across = push.across ?? null;
            if (
                across !== null &&
                (!Array.isArray(across) ||
                    across.length !== 2 ||
                    !across.every(Number.isFinite) ||
                    across[0] === across[1])
            ) {
                throw new Error(
                    `${where}, push on "${push.bone}": across must be two different numbers [from, to]`,
                );
            }
            const vector = push.push ?? [0, 0];
            const swell = push.swell ?? 0;
            if (
                !Array.isArray(vector) ||
                vector.length !== 2 ||
                !vector.every(Number.isFinite) ||
                !Number.isFinite(swell)
            ) {
                throw new Error(
                    `${where}, push on "${push.bone}": push [along, across] and swell must be numbers`,
                );
            }
            pushes.push({
                bone,
                along,
                across,
                push_x: vector[0],
                push_y: vector[1],
                swell,
            });
        }
        shapes.set(name, {
            name,
            title: shape.title ?? name,
            min,
            max,
            bones,
            pushes,
        });
    }
    return shapes;
}

/** 0 at 0, 1 at 1, flat at both ends. */
function smooth(part: number): number {
    if (part <= 0) {
        return 0;
    }
    if (part >= 1) {
        return 1;
    }
    return part * part * (3 - 2 * part);
}

/** A push's weight at a point of its bone's frame: `along`'s trapezoid times `across`'s ramp. */
export function push_weight(push: PuppetPush, x: number, y: number): number {
    let weight = 1;
    const along = push.along;
    if (along !== null) {
        if (x <= along[0] || x >= along[3]) {
            return 0;
        }
        if (x < along[1]) {
            weight = smooth((x - along[0]) / (along[1] - along[0]));
        } else if (x > along[2]) {
            weight = smooth((along[3] - x) / (along[3] - along[2]));
        }
    }
    const across = push.across;
    if (across !== null) {
        weight *= smooth((y - across[0]) / (across[1] - across[0]));
    }
    return weight;
}

/** Plain data for a `PartMesh`: points in a part's pixels, triangles, weights per shape value. */
export interface PartMeshData {
    /** `[u0, v0, u1, v1, ...]` in the part's pixels (from its rectangle's top left). */
    readonly points: readonly number[];
    /** Three point numbers per triangle. */
    readonly triangles: readonly number[];
    /**
     * Per shape value, a point's weight: how far it moves (in the part's pixels, `[du0, dv0, du1,
     * dv1, ...]`) at value 1. A point whose weights are all 0 never moves.
     */
    readonly weights: Readonly<Record<string, readonly number[]>>;
}

/**
 * A picture part drawn as a small triangle mesh whose points move with the body shape values:
 * a belly that rounds, an arm that gets thicker. Each point has a weight per shape value (how
 * far and which way it moves at value 1); `deform(values)` gives the points for some values, and
 * `draw()` draws the part through them, one affine-transformed triangle at a time (clipped to the
 * triangle, a little larger so no seam shows). Triangles whose points never move are drawn as one
 * piece. `PartMesh.for_part()` makes one from a rig's shape pushes, for any part on a bone: the
 * skin's, a coat's, so both move alike.
 */
export class PartMesh {
    /** The points, `[u0, v0, ...]` in the part's pixels. */
    public readonly points: Float64Array;
    public readonly triangles: Uint32Array;
    /** Per shape value, `[du0, dv0, ...]` at value 1. */
    public readonly weights: ReadonlyMap<string, Float64Array>;
    /** The triangles whose three points have no weight: drawn as one piece. */
    public readonly still: Uint32Array;
    /** The others, drawn one by one. */
    public readonly moving: Uint32Array;

    public constructor(data: PartMeshData) {
        const count = data.points.length / 2;
        if (!Number.isInteger(count) || !data.points.every(Number.isFinite)) {
            throw new Error("a mesh's points must be pairs of numbers");
        }
        if (
            data.triangles.length % 3 !== 0 ||
            !data.triangles.every(
                (point) =>
                    Number.isInteger(point) && point >= 0 && point < count,
            )
        ) {
            throw new Error(
                "a mesh's triangles must be threes of its point numbers",
            );
        }
        this.points = Float64Array.from(data.points);
        this.triangles = Uint32Array.from(data.triangles);
        const weights = new Map<string, Float64Array>();
        for (const [name, values] of Object.entries(data.weights)) {
            if (values.length !== count * 2 || !values.every(Number.isFinite)) {
                throw new Error(
                    `mesh weights for "${name}": two numbers per point`,
                );
            }
            weights.set(name, Float64Array.from(values));
        }
        this.weights = weights;
        const moves = new Uint8Array(count);
        for (const values of weights.values()) {
            for (let point = 0; point < count; point++) {
                if (values[point * 2] !== 0 || values[point * 2 + 1] !== 0) {
                    moves[point] = 1;
                }
            }
        }
        const still: number[] = [];
        const moving: number[] = [];
        for (let index = 0; index < this.triangles.length; index += 3) {
            const a = this.triangles[index];
            const b = this.triangles[index + 1];
            const c = this.triangles[index + 2];
            const target =
                moves[a] + moves[b] + moves[c] === 0 ? still : moving;
            target.push(a, b, c);
        }
        this.still = Uint32Array.from(still);
        this.moving = Uint32Array.from(moving);
    }

    /**
     * A grid mesh over a part of `width` x `height` pixels, its points moved by the pushes of the
     * rig's shapes on the part's bone. `transform` takes the part's pixels into the bone's frame
     * (`PuppetPart.transform`); `cell` is the grid's spacing in pixels. Null when no push reaches
     * the part: it is drawn as a plain picture.
     */
    public static for_part(
        width: number,
        height: number,
        transform: Float64Array,
        bone: number,
        shapes: Iterable<PuppetShape>,
        cell = 16,
    ): PartMesh | null {
        const pushes: { name: string; push: PuppetPush }[] = [];
        for (const shape of shapes) {
            for (const push of shape.pushes) {
                if (push.bone === bone) {
                    pushes.push({ name: shape.name, push });
                }
            }
        }
        if (pushes.length === 0 || width <= 0 || height <= 0) {
            return null;
        }
        const columns = Math.max(1, Math.ceil(width / cell));
        const rows = Math.max(1, Math.ceil(height / cell));
        const points: number[] = [];
        for (let row = 0; row <= rows; row++) {
            for (let column = 0; column <= columns; column++) {
                points.push((column / columns) * width, (row / rows) * height);
            }
        }
        const [a, b, c, d] = transform;
        const determinant = a * d - b * c;
        if (determinant === 0) {
            return null;
        }
        const weights: Record<string, number[]> = {};
        let has_weight = false;
        for (const { name, push } of pushes) {
            const values =
                weights[name] ?? new Array<number>(points.length).fill(0);
            weights[name] = values;
            for (let point = 0; point < points.length; point += 2) {
                const u = points[point];
                const v = points[point + 1];
                const x = a * u + c * v + transform[4];
                const y = b * u + d * v + transform[5];
                const weight = push_weight(push, x, y);
                if (weight === 0) {
                    continue;
                }
                // The move in the bone's frame, then back into the part's pixels.
                const move_x = weight * push.push_x;
                const move_y = weight * (push.push_y + push.swell * y);
                values[point] += (d * move_x - c * move_y) / determinant;
                values[point + 1] += (a * move_y - b * move_x) / determinant;
                has_weight = has_weight || move_x !== 0 || move_y !== 0;
            }
        }
        if (!has_weight) {
            return null;
        }
        const triangles: number[] = [];
        const across = columns + 1;
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const top_left = row * across + column;
                const top_right = top_left + 1;
                const bottom_left = top_left + across;
                const bottom_right = bottom_left + 1;
                // Diagonals alternate, so the mesh bends alike both ways.
                if ((row + column) % 2 === 0) {
                    triangles.push(top_left, top_right, bottom_right);
                    triangles.push(top_left, bottom_right, bottom_left);
                } else {
                    triangles.push(top_left, top_right, bottom_left);
                    triangles.push(top_right, bottom_right, bottom_left);
                }
            }
        }
        return new PartMesh({ points, triangles, weights });
    }

    public get point_count(): number {
        return this.points.length / 2;
    }

    public get triangle_count(): number {
        return this.triangles.length / 3;
    }

    /** Some point moves for these values. */
    public moves_for(values: ReadonlyMap<string, number>): boolean {
        for (const name of this.weights.keys()) {
            if ((values.get(name) ?? 0) !== 0) {
                return true;
            }
        }
        return false;
    }

    /** The points for these shape values: each point plus value times weight, for every value. */
    public deform(
        values: ReadonlyMap<string, number>,
        out: Float64Array = new Float64Array(this.points.length),
    ): Float64Array {
        out.set(this.points);
        for (const [name, weights] of this.weights) {
            const value = values.get(name) ?? 0;
            if (value === 0) {
                continue;
            }
            for (let index = 0; index < out.length; index++) {
                out[index] += value * weights[index];
            }
        }
        return out;
    }

    /**
     * Draws the part (`image`'s rectangle `source_x`, `source_y`, `width`, `height`) through the
     * moved points `deformed`, under the context's transform `base` (a, b, c, d, e, f: from the
     * part's pixels to the context's), shifted by `shift_x`, `shift_y` part pixels. The still
     * triangles go in one piece, every moving one by itself; each triangle is clipped a little
     * larger (`grow` pixels of the context) so neighbours meet without a seam. Leaves the context's
     * transform at `base`.
     */
    public draw(
        context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        image: CanvasImageSource,
        source_x: number,
        source_y: number,
        width: number,
        height: number,
        deformed: Float64Array,
        base: readonly [number, number, number, number, number, number],
        shift_x = 0,
        shift_y = 0,
        grow = 0.6,
    ): void {
        const [ba, bb, bc, bd, be, bf] = base;
        const scale = Math.sqrt(Math.abs(ba * bd - bb * bc)) || 1;
        const grow_units = grow / scale;
        const points = this.points;
        // The still piece: its own pixels, only shifted.
        if (this.still.length > 0) {
            context.save();
            context.setTransform(
                ba,
                bb,
                bc,
                bd,
                ba * shift_x + bc * shift_y + be,
                bb * shift_x + bd * shift_y + bf,
            );
            context.beginPath();
            for (let index = 0; index < this.still.length; index += 3) {
                trace_triangle(context, points, this.still, index, grow_units);
            }
            context.clip();
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
            context.restore();
        }
        const triangles = this.moving;
        for (let index = 0; index < triangles.length; index += 3) {
            const p0 = triangles[index] * 2;
            const p1 = triangles[index + 1] * 2;
            const p2 = triangles[index + 2] * 2;
            const u0 = points[p0];
            const v0 = points[p0 + 1];
            const du1 = points[p1] - u0;
            const dv1 = points[p1 + 1] - v0;
            const du2 = points[p2] - u0;
            const dv2 = points[p2 + 1] - v0;
            const determinant = du1 * dv2 - du2 * dv1;
            if (determinant === 0) {
                continue;
            }
            const x0 = deformed[p0] + shift_x;
            const y0 = deformed[p0 + 1] + shift_y;
            const dx1 = deformed[p1] + shift_x - x0;
            const dy1 = deformed[p1 + 1] + shift_y - y0;
            const dx2 = deformed[p2] + shift_x - x0;
            const dy2 = deformed[p2 + 1] + shift_y - y0;
            // The affine map taking the triangle's own pixels onto its moved points.
            const a = (dx1 * dv2 - dx2 * dv1) / determinant;
            const b = (dy1 * dv2 - dy2 * dv1) / determinant;
            const c = (dx2 * du1 - dx1 * du2) / determinant;
            const d = (dy2 * du1 - dy1 * du2) / determinant;
            const e = x0 - a * u0 - c * v0;
            const f = y0 - b * u0 - d * v0;
            context.save();
            context.setTransform(ba, bb, bc, bd, be, bf);
            context.beginPath();
            trace_moved_triangle(
                context,
                x0,
                y0,
                x0 + dx1,
                y0 + dy1,
                x0 + dx2,
                y0 + dy2,
                grow_units,
            );
            context.clip();
            context.setTransform(
                ba * a + bc * b,
                bb * a + bd * b,
                ba * c + bc * d,
                bb * c + bd * d,
                ba * e + bc * f + be,
                bb * e + bd * f + bf,
            );
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
            context.restore();
        }
        context.setTransform(ba, bb, bc, bd, be, bf);
    }

    /**
     * How far a point of the part (its own pixels) moves for these values: the weights of the
     * triangle it lies in, mixed by where in it it lies; nothing outside the mesh.
     */
    public offset_at(
        values: ReadonlyMap<string, number>,
        u: number,
        v: number,
    ): { u: number; v: number } {
        const out = { u: 0, v: 0 };
        const triangles = this.triangles;
        const points = this.points;
        for (let index = 0; index < triangles.length; index += 3) {
            const p0 = triangles[index] * 2;
            const p1 = triangles[index + 1] * 2;
            const p2 = triangles[index + 2] * 2;
            const x1 = points[p1] - points[p0];
            const y1 = points[p1 + 1] - points[p0 + 1];
            const x2 = points[p2] - points[p0];
            const y2 = points[p2 + 1] - points[p0 + 1];
            const determinant = x1 * y2 - x2 * y1;
            if (determinant === 0) {
                continue;
            }
            const s =
                ((u - points[p0]) * y2 - x2 * (v - points[p0 + 1])) /
                determinant;
            const t =
                (x1 * (v - points[p0 + 1]) - (u - points[p0]) * y1) /
                determinant;
            if (s < -1e-9 || t < -1e-9 || s + t > 1 + 1e-9) {
                continue;
            }
            const r = 1 - s - t;
            for (const [name, weights] of this.weights) {
                const value = values.get(name) ?? 0;
                if (value === 0) {
                    continue;
                }
                out.u +=
                    value *
                    (r * weights[p0] + s * weights[p1] + t * weights[p2]);
                out.v +=
                    value *
                    (r * weights[p0 + 1] +
                        s * weights[p1 + 1] +
                        t * weights[p2 + 1]);
            }
            return out;
        }
        return out;
    }

    /** The box around the moved points: `[left, top, right, bottom]` in the part's pixels. */
    public static box_of(
        deformed: Float64Array,
    ): [number, number, number, number] {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (let index = 0; index < deformed.length; index += 2) {
            left = Math.min(left, deformed[index]);
            right = Math.max(right, deformed[index]);
            top = Math.min(top, deformed[index + 1]);
            bottom = Math.max(bottom, deformed[index + 1]);
        }
        return [left, top, right, bottom];
    }

    /**
     * Where a point of the moved mesh (part pixels, after `deform()`) came from in the part's own
     * pixels; null outside the mesh. For finding what a pointer touches on a moved part.
     */
    public to_source(
        deformed: Float64Array,
        x: number,
        y: number,
    ): { u: number; v: number } | null {
        const triangles = this.triangles;
        const points = this.points;
        for (let index = 0; index < triangles.length; index += 3) {
            const p0 = triangles[index] * 2;
            const p1 = triangles[index + 1] * 2;
            const p2 = triangles[index + 2] * 2;
            const x0 = deformed[p0];
            const y0 = deformed[p0 + 1];
            const x1 = deformed[p1] - x0;
            const y1 = deformed[p1 + 1] - y0;
            const x2 = deformed[p2] - x0;
            const y2 = deformed[p2 + 1] - y0;
            const determinant = x1 * y2 - x2 * y1;
            if (determinant === 0) {
                continue;
            }
            const s = ((x - x0) * y2 - x2 * (y - y0)) / determinant;
            const t = (x1 * (y - y0) - (x - x0) * y1) / determinant;
            if (s < -1e-9 || t < -1e-9 || s + t > 1 + 1e-9) {
                continue;
            }
            return {
                u:
                    points[p0] +
                    s * (points[p1] - points[p0]) +
                    t * (points[p2] - points[p0]),
                v:
                    points[p0 + 1] +
                    s * (points[p1 + 1] - points[p0 + 1]) +
                    t * (points[p2 + 1] - points[p0 + 1]),
            };
        }
        return null;
    }
}

/** A triangle of the mesh's own points, grown by `grow` around its middle, into the path. */
function trace_triangle(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    points: Float64Array,
    triangles: Uint32Array,
    index: number,
    grow: number,
): void {
    const p0 = triangles[index] * 2;
    const p1 = triangles[index + 1] * 2;
    const p2 = triangles[index + 2] * 2;
    trace_moved_triangle(
        context,
        points[p0],
        points[p0 + 1],
        points[p1],
        points[p1 + 1],
        points[p2],
        points[p2 + 1],
        grow,
    );
}

function trace_moved_triangle(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    grow: number,
): void {
    const middle_x = (x0 + x1 + x2) / 3;
    const middle_y = (y0 + y1 + y2) / 3;
    const out = (x: number, y: number): [number, number] => {
        const dx = x - middle_x;
        const dy = y - middle_y;
        const length = Math.hypot(dx, dy) || 1;
        return [x + (dx / length) * grow, y + (dy / length) * grow];
    };
    const [ax, ay] = out(x0, y0);
    const [bx, by] = out(x1, y1);
    const [cx, cy] = out(x2, y2);
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.lineTo(cx, cy);
    context.closePath();
}
