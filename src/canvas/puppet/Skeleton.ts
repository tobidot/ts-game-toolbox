import { BoneData } from "./RigData";

const DEGREES = Math.PI / 180;

/** A point in the puppet's space (the root's, before `draw()` places and mirrors it). */
export interface PuppetPoint {
    x: number;
    y: number;
}

/**
 * The bones of one puppet and its pose. The rest pose comes from the data; the pose is what a clip
 * (or a game) adds to it: `rotation[i]` degrees on bone i's rest angle, `x[i]` and `y[i]` on its
 * rest position in the parent's frame. `update()` turns the pose into each bone's world transform,
 * parents first, once per frame; the getters read that.
 *
 * Bones are numbered in the data's order (parents first); `index_of(name)` finds one.
 */
export class Skeleton {
    public readonly names: readonly string[];
    /** Each bone's parent's number; -1 for a root. */
    public readonly parents: Int32Array;
    public readonly rest_x: Float64Array;
    public readonly rest_y: Float64Array;
    /** Degrees on the parent's angle. */
    public readonly rest_rotation: Float64Array;
    public readonly lengths: Float64Array;
    /** The pose: degrees added to each bone's rest rotation. */
    public readonly rotation: Float64Array;
    /** The pose: added to each bone's rest position, in its parent's frame. */
    public readonly x: Float64Array;
    public readonly y: Float64Array;
    /** The rest scale along and across each bone, from the data (default 1). */
    public readonly rest_scale_x: Float64Array;
    public readonly rest_scale_y: Float64Array;
    /**
     * The pose: each bone's scale along (`scale_x`) and across (`scale_y`) it, times its rest
     * scale; 1 at rest. A puppet's `set_shape()` writes them. A scaled bone draws its parts
     * stretched and moves its children's joints (a longer shin puts the foot lower); its frame
     * in `world` stays a plain turn, so children are never sheared.
     */
    public readonly scale_x: Float64Array;
    public readonly scale_y: Float64Array;
    /**
     * The world transform of each bone after `update()`: six numbers per bone, as a canvas takes
     * them (`a, b, c, d, e, f`: a point `(px, py)` of the bone lands at `a px + c py + e`,
     * `b px + d py + f`). A turn and a shift: the bone's scale is not in it (`world_point()`
     * and `bone_matrix()` add it).
     */
    public readonly world: Float64Array;
    /**
     * How far `update()` moved the body (all but the roots) up the screen so the soles stand
     * where they would unscaled: positive with longer legs. 0 without soles or scales.
     */
    public lift = 0;
    private readonly world_angles: Float64Array;
    private readonly by_name: ReadonlyMap<string, number>;
    private readonly tip: PuppetPoint = { x: 0, y: 0 };
    /** The soles: bone, x and y in the bone's frame, for each point that stands on the ground. */
    private sole_bones = new Int32Array(0);
    private sole_x = new Float64Array(0);
    private sole_y = new Float64Array(0);
    /** The world of the same pose unscaled, for the soles. */
    private readonly reference: Float64Array;
    private readonly reference_angles: Float64Array;

    private constructor(
        names: readonly string[],
        parents: Int32Array,
        rest_x: Float64Array,
        rest_y: Float64Array,
        rest_rotation: Float64Array,
        lengths: Float64Array,
        rest_scale_x: Float64Array,
        rest_scale_y: Float64Array,
    ) {
        const count = names.length;
        this.names = names;
        this.parents = parents;
        this.rest_x = rest_x;
        this.rest_y = rest_y;
        this.rest_rotation = rest_rotation;
        this.lengths = lengths;
        this.rest_scale_x = rest_scale_x;
        this.rest_scale_y = rest_scale_y;
        this.rotation = new Float64Array(count);
        this.x = new Float64Array(count);
        this.y = new Float64Array(count);
        this.scale_x = new Float64Array(count).fill(1);
        this.scale_y = new Float64Array(count).fill(1);
        this.world = new Float64Array(count * 6);
        this.world_angles = new Float64Array(count);
        this.reference = new Float64Array(count * 6);
        this.reference_angles = new Float64Array(count);
        this.by_name = new Map(names.map((name, index) => [name, index]));
        this.update();
    }

    /** The bones from data, parents first; throws on a bone before its parent or a name twice. */
    public static from_data(bones: readonly BoneData[]): Skeleton {
        const names: string[] = [];
        const count = bones.length;
        const parents = new Int32Array(count);
        const rest_x = new Float64Array(count);
        const rest_y = new Float64Array(count);
        const rest_rotation = new Float64Array(count);
        const lengths = new Float64Array(count);
        const rest_scale_x = new Float64Array(count);
        const rest_scale_y = new Float64Array(count);
        for (const [index, bone] of bones.entries()) {
            if (typeof bone.name !== "string" || bone.name === "") {
                throw new Error(`bone ${index} has no name`);
            }
            if (names.includes(bone.name)) {
                throw new Error(`bone "${bone.name}" twice`);
            }
            let parent = -1;
            if (bone.parent !== undefined) {
                parent = names.indexOf(bone.parent);
                if (parent < 0) {
                    throw new Error(
                        `bone "${bone.name}": its parent "${bone.parent}" must come before it`,
                    );
                }
            }
            names.push(bone.name);
            parents[index] = parent;
            rest_x[index] = finite(bone.x, `bone "${bone.name}": x`);
            rest_y[index] = finite(bone.y, `bone "${bone.name}": y`);
            rest_rotation[index] = finite(
                bone.rotation,
                `bone "${bone.name}": rotation`,
            );
            lengths[index] = finite(bone.length, `bone "${bone.name}": length`);
            rest_scale_x[index] = positive(
                bone.scale_x,
                `bone "${bone.name}": scale_x`,
            );
            rest_scale_y[index] = positive(
                bone.scale_y,
                `bone "${bone.name}": scale_y`,
            );
        }
        return new Skeleton(
            names,
            parents,
            rest_x,
            rest_y,
            rest_rotation,
            lengths,
            rest_scale_x,
            rest_scale_y,
        );
    }

    /** Another skeleton with the same bones (and soles), at rest. */
    public clone(): Skeleton {
        const copy = new Skeleton(
            this.names,
            this.parents,
            this.rest_x,
            this.rest_y,
            this.rest_rotation,
            this.lengths,
            this.rest_scale_x,
            this.rest_scale_y,
        );
        copy.sole_bones = this.sole_bones;
        copy.sole_x = this.sole_x;
        copy.sole_y = this.sole_y;
        return copy;
    }

    /**
     * The points that stand on the ground (bone and place in its frame): with scaled bones
     * `update()` raises or lowers the body so the lowest of them is where it would be unscaled.
     */
    public set_soles(
        points: readonly { bone: number; x: number; y: number }[],
    ): void {
        this.sole_bones = Int32Array.from(points.map((point) => point.bone));
        this.sole_x = Float64Array.from(points.map((point) => point.x));
        this.sole_y = Float64Array.from(points.map((point) => point.y));
    }

    /** The bone's scale along it: rest times pose. */
    public length_scale(index: number): number {
        return this.rest_scale_x[index] * this.scale_x[index];
    }

    /** The bone's scale across it: rest times pose. */
    public width_scale(index: number): number {
        return this.rest_scale_y[index] * this.scale_y[index];
    }

    /** Some bone is scaled (rest or pose). */
    public get is_scaled(): boolean {
        for (let index = 0; index < this.names.length; index++) {
            if (
                this.length_scale(index) !== 1 ||
                this.width_scale(index) !== 1
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Bone `index`'s frame with its scale, six numbers as `world` has them: what its parts are
     * drawn with. The same as `world` for an unscaled bone.
     */
    public bone_matrix(
        index: number,
        out: Float64Array = new Float64Array(6),
    ): Float64Array {
        const at = index * 6;
        const world = this.world;
        const scale_x = this.length_scale(index);
        const scale_y = this.width_scale(index);
        out[0] = world[at] * scale_x;
        out[1] = world[at + 1] * scale_x;
        out[2] = world[at + 2] * scale_y;
        out[3] = world[at + 3] * scale_y;
        out[4] = world[at + 4];
        out[5] = world[at + 5];
        return out;
    }

    public get count(): number {
        return this.names.length;
    }

    /** The bone's number; -1 when there is none of that name. */
    public index_of(name: string): number {
        return this.by_name.get(name) ?? -1;
    }

    /** Back to the rest pose (call `update()` after). */
    public reset_pose(): void {
        this.rotation.fill(0);
        this.x.fill(0);
        this.y.fill(0);
    }

    /**
     * Each bone's world transform from the pose, parents first. With scaled bones and soles, the
     * body (all but the roots) is then moved up or down so the lowest sole is where it would be
     * unscaled (`lift`): longer legs stand on the ground in every clip.
     */
    public update(): void {
        const is_scaled = this.is_scaled;
        this.pass(this.world, this.world_angles, is_scaled);
        this.lift = 0;
        const soles = this.sole_bones.length;
        if (!is_scaled || soles === 0) {
            return;
        }
        this.pass(this.reference, this.reference_angles, false);
        let lowest_unscaled = -Infinity;
        let lowest = -Infinity;
        const world = this.world;
        const reference = this.reference;
        for (let index = 0; index < soles; index++) {
            const bone = this.sole_bones[index];
            const at = bone * 6;
            const x = this.sole_x[index];
            const y = this.sole_y[index];
            lowest_unscaled = Math.max(
                lowest_unscaled,
                reference[at + 1] * x +
                    reference[at + 3] * y +
                    reference[at + 5],
            );
            const scaled_x = x * this.length_scale(bone);
            const scaled_y = y * this.width_scale(bone);
            lowest = Math.max(
                lowest,
                world[at + 1] * scaled_x +
                    world[at + 3] * scaled_y +
                    world[at + 5],
            );
        }
        const shift = lowest_unscaled - lowest;
        this.lift = -shift;
        for (let index = 0; index < this.names.length; index++) {
            if (this.parents[index] >= 0) {
                world[index * 6 + 5] += shift;
            }
        }
    }

    /** The world transforms, with each parent's scale moving its children's joints, or without. */
    private pass(
        world: Float64Array,
        world_angles: Float64Array,
        is_scaled: boolean,
    ): void {
        const count = this.names.length;
        for (let index = 0; index < count; index++) {
            const turn = this.rest_rotation[index] + this.rotation[index];
            const radians = turn * DEGREES;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            let local_x = this.rest_x[index] + this.x[index];
            let local_y = this.rest_y[index] + this.y[index];
            const at = index * 6;
            const parent = this.parents[index];
            if (parent < 0) {
                world[at] = cos;
                world[at + 1] = sin;
                world[at + 2] = -sin;
                world[at + 3] = cos;
                world[at + 4] = local_x;
                world[at + 5] = local_y;
                world_angles[index] = turn;
                continue;
            }
            if (is_scaled) {
                local_x *= this.length_scale(parent);
                local_y *= this.width_scale(parent);
            }
            const p = parent * 6;
            const pa = world[p];
            const pb = world[p + 1];
            const pc = world[p + 2];
            const pd = world[p + 3];
            world[at] = pa * cos + pc * sin;
            world[at + 1] = pb * cos + pd * sin;
            world[at + 2] = -pa * sin + pc * cos;
            world[at + 3] = -pb * sin + pd * cos;
            world[at + 4] = pa * local_x + pc * local_y + world[p + 4];
            world[at + 5] = pb * local_x + pd * local_y + world[p + 5];
            world_angles[index] = world_angles[parent] + turn;
        }
    }

    /** Where bone `index`'s joint is, after `update()`. */
    public world_x(index: number): number {
        return this.world[index * 6 + 4];
    }

    public world_y(index: number): number {
        return this.world[index * 6 + 5];
    }

    /** The bone's angle in the puppet's space, in degrees (not wrapped). */
    public world_rotation(index: number): number {
        return this.world_angles[index];
    }

    /**
     * A point given in bone `index`'s frame (`x` along the bone, as at scale 1), in the puppet's
     * space: on a scaled bone it moves with the scale (an anchor on a longer shin).
     */
    public world_point(
        index: number,
        x: number,
        y: number,
        out: PuppetPoint = { x: 0, y: 0 },
    ): PuppetPoint {
        const at = index * 6;
        const world = this.world;
        const scaled_x = x * this.length_scale(index);
        const scaled_y = y * this.width_scale(index);
        out.x = world[at] * scaled_x + world[at + 2] * scaled_y + world[at + 4];
        out.y =
            world[at + 1] * scaled_x + world[at + 3] * scaled_y + world[at + 5];
        return out;
    }

    /** A point of the puppet's space in bone `index`'s frame, as at scale 1: `world_point()` turned back. */
    public local_point(
        index: number,
        x: number,
        y: number,
        out: PuppetPoint = { x: 0, y: 0 },
    ): PuppetPoint {
        const at = index * 6;
        const world = this.world;
        const dx = x - world[at + 4];
        const dy = y - world[at + 5];
        // The frame is a plain turn: its inverse is its transpose.
        out.x =
            (world[at] * dx + world[at + 1] * dy) / this.length_scale(index);
        out.y =
            (world[at + 2] * dx + world[at + 3] * dy) / this.width_scale(index);
        return out;
    }

    /** How far a point of the puppet's space is from a bone's line (joint to tip). */
    public distance_to_bone(index: number, x: number, y: number): number {
        const tip = this.tip;
        this.world_point(index, this.lengths[index], 0, tip);
        return distance_to_segment(
            x,
            y,
            this.world_x(index),
            this.world_y(index),
            tip.x,
            tip.y,
        );
    }

    /**
     * The bone whose line (joint to tip) passes nearest to a point of the puppet's space, if it
     * is within `within`; -1 otherwise. For picking bones with a pointer (`Puppet.to_local()`).
     */
    public nearest_bone(x: number, y: number, within: number): number {
        let best = -1;
        let best_distance = within;
        for (let index = 0; index < this.names.length; index++) {
            const distance = this.distance_to_bone(index, x, y);
            if (distance <= best_distance) {
                best = index;
                best_distance = distance;
            }
        }
        return best;
    }
}

function positive(value: number | undefined, what: string): number {
    if (value === undefined) {
        return 1;
    }
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${what} must be a number above 0`);
    }
    return value;
}

function finite(value: number | undefined, what: string): number {
    if (value === undefined) {
        return 0;
    }
    if (!Number.isFinite(value)) {
        throw new Error(`${what} must be a number`);
    }
    return value;
}

function distance_to_segment(
    x: number,
    y: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const squared = dx * dx + dy * dy;
    let along = 0;
    if (squared > 0) {
        along = Math.min(
            1,
            Math.max(0, ((x - ax) * dx + (y - ay) * dy) / squared),
        );
    }
    return Math.hypot(x - (ax + along * dx), y - (ay + along * dy));
}
