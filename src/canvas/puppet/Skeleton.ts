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
    /**
     * The world transform of each bone after `update()`: six numbers per bone, as a canvas takes
     * them (`a, b, c, d, e, f`: a point `(px, py)` of the bone lands at `a px + c py + e`,
     * `b px + d py + f`).
     */
    public readonly world: Float64Array;
    private readonly world_angles: Float64Array;
    private readonly by_name: ReadonlyMap<string, number>;
    private readonly tip: PuppetPoint = { x: 0, y: 0 };

    private constructor(
        names: readonly string[],
        parents: Int32Array,
        rest_x: Float64Array,
        rest_y: Float64Array,
        rest_rotation: Float64Array,
        lengths: Float64Array,
    ) {
        const count = names.length;
        this.names = names;
        this.parents = parents;
        this.rest_x = rest_x;
        this.rest_y = rest_y;
        this.rest_rotation = rest_rotation;
        this.lengths = lengths;
        this.rotation = new Float64Array(count);
        this.x = new Float64Array(count);
        this.y = new Float64Array(count);
        this.world = new Float64Array(count * 6);
        this.world_angles = new Float64Array(count);
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
        }
        return new Skeleton(
            names,
            parents,
            rest_x,
            rest_y,
            rest_rotation,
            lengths,
        );
    }

    /** Another skeleton with the same bones, at rest. */
    public clone(): Skeleton {
        return new Skeleton(
            this.names,
            this.parents,
            this.rest_x,
            this.rest_y,
            this.rest_rotation,
            this.lengths,
        );
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

    /** Each bone's world transform from the pose, parents first. */
    public update(): void {
        const world = this.world;
        const count = this.names.length;
        for (let index = 0; index < count; index++) {
            const turn = this.rest_rotation[index] + this.rotation[index];
            const radians = turn * DEGREES;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const local_x = this.rest_x[index] + this.x[index];
            const local_y = this.rest_y[index] + this.y[index];
            const at = index * 6;
            const parent = this.parents[index];
            if (parent < 0) {
                world[at] = cos;
                world[at + 1] = sin;
                world[at + 2] = -sin;
                world[at + 3] = cos;
                world[at + 4] = local_x;
                world[at + 5] = local_y;
                this.world_angles[index] = turn;
                continue;
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
            this.world_angles[index] = this.world_angles[parent] + turn;
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

    /** A point given in bone `index`'s frame (`x` along the bone), in the puppet's space. */
    public world_point(
        index: number,
        x: number,
        y: number,
        out: PuppetPoint = { x: 0, y: 0 },
    ): PuppetPoint {
        const at = index * 6;
        const world = this.world;
        out.x = world[at] * x + world[at + 2] * y + world[at + 4];
        out.y = world[at + 1] * x + world[at + 3] * y + world[at + 5];
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
