import { Vector2I } from "../../geometries/Vector2";
import { WorldStepEvent } from "../../physics/world/ContactEvent";
import { PhysicsBody } from "../../physics/world/PhysicsBody";
import { PhysicsWorld } from "../../physics/world/PhysicsWorld";
import type { HitCapsule } from "./PuppetHits";
import type { PuppetPlacement } from "./Puppet";
import type { PuppetRig } from "./PuppetRig";
import type { Skeleton } from "./Skeleton";

const DEGREES = Math.PI / 180;

/** The layer a ragdoll's bodies are on by default: they meet everything but other ragdolls' bodies. */
export const RAGDOLL_LAYER = 1 << 29;
/** A bone shorter than this (rig units) is a stick of this length in the ragdoll. */
const SHORTEST_BONE = 6;
/** The degrees a bone may turn past what its clips ever turn it. */
const LIMIT_MARGIN = 25;
/** A ragdoll whose every point moves slower than this (rig units a second) for `SETTLED_SECONDS` has settled. */
const SETTLED_SPEED = 20;
const SETTLED_SECONDS = 0.4;
/** How often the settling is checked, seconds. */
const SETTLE_WINDOW = 0.1;
/** The solving's rounds go in this many passes, each ending with the bodies pushed out of walls. */
const PASSES = 2;
/** The range of a bone no clip turns. */
const UNKEYED_LIMIT = 30;

/** How `Puppet.ragdoll()` starts one. */
export interface RagdollOptions {
    /**
     * A cut-out puppet comes apart at its joints: every part flies on its own (the Klopper's
     * "Knopper"). A soft skin stays whole (its picture would tear). Default false.
     */
    readonly scatter?: boolean;
    /** The puppet's own speed in the world when it fell (it was walking), units per second. */
    readonly velocity?: Vector2I;
    /** A push on one bone, units per second added to its two ends (a club's blow). */
    readonly push?: {
        readonly bone: number | string;
        readonly x: number;
        readonly y: number;
    };
    /** How fast scattered parts fly apart, units per second. Default 260. */
    readonly scatter_speed?: number;
    /** The scatter's spread, a seed. Default 1. */
    readonly seed?: number;
    /** The bodies' layer and the layers they meet. Default `RAGDOLL_LAYER` and all but it. */
    readonly layer?: number;
    readonly mask?: number;
    /** Rounds of the joints' solving per world step. Default 8. */
    readonly iterations?: number;
    /** The share of speed lost per second, besides the world's friction. Default 0.6. */
    readonly damping?: number;
}

/** A point of the ragdoll: a world body at a bone's joint or tip. */
interface Particle {
    readonly body: PhysicsBody<unknown>;
    /** 1 / mass. */
    readonly inverse_mass: number;
}

/** A bone of the ragdoll: a stick between two particles. */
interface Stick {
    readonly bone: number;
    readonly joint: number;
    readonly tip: number;
    /** The stick's length in the world. */
    readonly length: number;
    /** The bone's length in rig units (scaled) and the stick's: the tip lies `length` along the bone. */
    readonly bone_length: number;
    /** The parent's stick, -1 for a bone on a root (or scattered). */
    readonly parent: number;
    /** The joint is the parent's tip particle (merged). */
    readonly is_merged: boolean;
    /** Degrees the bone may turn on its parent, as a clip's rotation (offsets on the rest pose). */
    readonly low: number;
    readonly high: number;
}

/**
 * A puppet fallen as a ragdoll (since step 44, Knopper Klopper): every bone a stick between two
 * bodies of a `PhysicsWorld` (its joint and its tip). In each world step, once the world moved the
 * bodies (`world.steps`), every bone is held rigid with the joints of the bones on it (shape
 * matching) and within angle limits (`ragdoll_limits()`: the rig's `limits`, else how far its clips
 * turn each bone, plus a margin; a limit turns both sides of the joint by their weight). The bodies
 * are then put back with `world.place()`, which pushes them out of the walls; the walls they
 * touched stay in the solving for the next step. It starts with every bone exactly where the pose
 * had it, moving as the last frame moved it. Made by `puppet.ragdoll(world, options)`; the puppet
 * then draws the ragdoll's pose (the bones' angles: the drawing never stretches) until
 * `get_up()` or `remove()`.
 *
 * The bodies are on `RAGDOLL_LAYER` and don't meet each other. `scatter` lets a cut-out puppet's
 * parts go their own ways.
 */
export class PuppetRagdoll {
    public readonly particles: readonly Particle[];
    public readonly sticks: readonly Stick[];
    /** Seconds since it fell. */
    public age = 0;
    private readonly listener: number;
    private readonly iterations: number;
    private readonly damping: number;
    private still_for = 0;
    private is_removed = false;
    /** The roots' pose and frames at the fall (they stay). */
    private readonly root_world: Float64Array;
    private readonly x0: Float64Array;
    private readonly y0: Float64Array;
    private readonly by_bone: Int32Array;
    private readonly rest_rotation: Float64Array;
    private readonly clusters: readonly Cluster[];
    private readonly weights: Float64Array;
    /** Per stick: its tip and every point of the bones on it (what turns with it). */
    private readonly below: readonly number[][];
    /** Each point where the world moved it this step, and where the solving moves it. */
    private readonly before_x: Float64Array;
    private readonly before_y: Float64Array;
    private readonly x: Float64Array;
    private readonly y: Float64Array;
    /** Per point, the last wall it touched: the line (normal, distance) and in which step. */
    private readonly plane_x: Float64Array;
    private readonly plane_y: Float64Array;
    private readonly plane_d: Float64Array;
    private readonly plane_step: Float64Array;
    private step_count = 0;
    private window_age = 0;
    /** Each point at the last settling check (how fast it really moves). */
    private readonly last_x: Float64Array;
    private readonly last_y: Float64Array;
    /** Per stick: every other point of its ragdoll but its joint (what turns the other way). */
    private readonly rest_of: readonly number[][];

    public constructor(
        public readonly world: PhysicsWorld<unknown>,
        private readonly rig: PuppetRig,
        skeleton: Skeleton,
        /** The skeleton's world matrices a frame before, and that frame's seconds (speeds); null for none. */
        previous: Float64Array | null,
        previous_seconds: number,
        private readonly placement: PuppetPlacement,
        capsules: readonly HitCapsule[],
        public readonly is_scattered: boolean,
        options: RagdollOptions = {},
    ) {
        this.iterations = options.iterations ?? 8;
        this.damping = options.damping ?? 0.6;
        const layer = options.layer ?? RAGDOLL_LAYER;
        const mask = options.mask ?? ~layer >>> 0;
        const count = skeleton.count;
        this.root_world = Float64Array.from(skeleton.world);
        this.rest_rotation = skeleton.rest_rotation;
        this.x0 = Float64Array.from(skeleton.x);
        this.y0 = Float64Array.from(skeleton.y);
        const limits = ragdoll_limits(rig);
        const scale = placement.scale;
        const side = placement.flip_x ? -scale : scale;
        const carried = options.velocity ?? { x: 0, y: 0 };
        const particles: Particle[] = [];
        const sticks: Stick[] = [];
        const by_bone = new Int32Array(count).fill(-1);
        const radius_of = new Map<number, number>();
        for (const capsule of capsules) {
            radius_of.set(capsule.bone, capsule.radius);
        }
        let random = (options.seed ?? 1) >>> 0 || 1;
        const next_random = () => {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            return random / 4294967296;
        };
        const pushed =
            options.push === undefined
                ? -1
                : typeof options.push.bone === "string"
                  ? skeleton.index_of(options.push.bone)
                  : options.push.bone;
        // The middle of the body, to scatter away from.
        let middle_x = 0;
        let middle_y = 0;
        for (let bone = 0; bone < count; bone++) {
            middle_x += skeleton.world_x(bone) / count;
            middle_y += skeleton.world_y(bone) / count;
        }
        const add_particle = (
            local_x: number,
            local_y: number,
            speed_x: number,
            speed_y: number,
            radius: number,
            mass: number,
        ): number => {
            const r = Math.max(1, radius * scale);
            const shape = {
                points: Array.from({ length: 8 }, (_, at) => ({
                    x: Math.cos((at * Math.PI) / 4 + Math.PI / 8) * r,
                    y: Math.sin((at * Math.PI) / 4 + Math.PI / 8) * r,
                })),
            };
            const body = world.add({
                shape,
                position: {
                    x: placement.x + local_x * side,
                    y: placement.y + local_y * scale,
                },
                velocity: {
                    x: speed_x * side + carried.x,
                    y: speed_y * scale + carried.y,
                },
                mass,
                layer,
                mask,
            });
            particles.push({ body, inverse_mass: 1 / mass });
            return particles.length - 1;
        };
        /** Where a point of a bone was a frame ago, moving at: (now - then) / seconds. */
        const speed_of = (
            bone: number,
            x: number,
            y: number,
            now_x: number,
            now_y: number,
        ): [number, number] => {
            if (previous === null || !(previous_seconds > 0)) {
                return [0, 0];
            }
            const at = bone * 6;
            const before_x =
                previous[at] * x + previous[at + 2] * y + previous[at + 4];
            const before_y =
                previous[at + 1] * x + previous[at + 3] * y + previous[at + 5];
            return [
                (now_x - before_x) / previous_seconds,
                (now_y - before_y) / previous_seconds,
            ];
        };
        const world_m = skeleton.world;
        for (let bone = 0; bone < count; bone++) {
            const parent = skeleton.parents[bone];
            if (parent < 0) {
                continue;
            }
            const at = bone * 6;
            const length_scale = skeleton.length_scale(bone);
            const bone_length = Math.max(
                SHORTEST_BONE,
                skeleton.lengths[bone] * length_scale,
            );
            const joint_x = world_m[at + 4];
            const joint_y = world_m[at + 5];
            const tip_x = joint_x + world_m[at] * bone_length;
            const tip_y = joint_y + world_m[at + 1] * bone_length;
            const radius = Math.min(
                24,
                Math.max(3, (radius_of.get(bone) ?? 6) * 0.8),
            );
            const mass = Math.max(1, (bone_length * radius) / 100);
            const parent_stick =
                this.is_scattered || skeleton.parents[parent] < 0
                    ? -1
                    : by_bone[parent];
            let joint = -1;
            let is_merged = false;
            if (parent_stick >= 0) {
                const above_tip =
                    particles[sticks[parent_stick].tip].body.position;
                const tip_now = this.to_local(above_tip.x, above_tip.y);
                if (
                    Math.abs(tip_now.x - joint_x) < 1e-6 &&
                    Math.abs(tip_now.y - joint_y) < 1e-6
                ) {
                    joint = sticks[parent_stick].tip;
                    is_merged = true;
                }
            }
            const [joint_speed_x, joint_speed_y] = speed_of(
                bone,
                0,
                0,
                joint_x,
                joint_y,
            );
            let [tip_speed_x, tip_speed_y] = speed_of(
                bone,
                bone_length / length_scale,
                0,
                tip_x,
                tip_y,
            );
            let extra_x = 0;
            let extra_y = 0;
            if (this.is_scattered) {
                // Away from the body's middle, a little up, and spinning.
                const away_x = (joint_x + tip_x) / 2 - middle_x;
                const away_y = (joint_y + tip_y) / 2 - middle_y;
                const away = Math.hypot(away_x, away_y) || 1;
                const speed =
                    (options.scatter_speed ?? 260) *
                    (0.6 + 0.8 * next_random());
                extra_x = (away_x / away) * speed;
                extra_y = (away_y / away) * speed - speed * 0.5;
                const spin = (next_random() - 0.5) * 2 * speed;
                tip_speed_x += -world_m[at + 1] * spin;
                tip_speed_y += world_m[at] * spin;
            }
            if (bone === pushed && options.push !== undefined) {
                // The push is in the world: its x mirrors with the puppet.
                extra_x += options.push.x / side;
                extra_y += options.push.y / scale;
            }
            if (joint < 0) {
                joint = add_particle(
                    joint_x,
                    joint_y,
                    joint_speed_x + extra_x,
                    joint_speed_y + extra_y,
                    radius,
                    mass / 2,
                );
            }
            const tip = add_particle(
                tip_x,
                tip_y,
                tip_speed_x + extra_x,
                tip_speed_y + extra_y,
                radius,
                mass / 2,
            );
            const limit = limits.get(bone) ?? [-180, 180];
            by_bone[bone] = sticks.length;
            sticks.push({
                bone,
                joint,
                tip,
                length: bone_length * scale,
                bone_length,
                parent: parent_stick,
                is_merged,
                low: limit[0],
                high: limit[1],
            });
        }
        this.particles = particles;
        this.sticks = sticks;
        this.by_bone = by_bone;
        this.weights = Float64Array.from(
            particles,
            (particle) => particle.inverse_mass,
        );
        // Each bone a rigid shape of its points as they are now: its joint, its tip, its children's joints.
        this.clusters = sticks.map((stick, index) => {
            const points = [stick.joint, stick.tip];
            for (const child of sticks) {
                if (child.parent === index && !points.includes(child.joint)) {
                    points.push(child.joint);
                }
            }
            return make_cluster(points, particles, this.weights);
        });
        this.below = sticks.map(() => []);
        for (const [index, stick] of sticks.entries()) {
            // Up the chain: the stick's points belong to every stick above it.
            for (let above = index; above >= 0; above = sticks[above].parent) {
                const list = this.below[above];
                for (const point of [stick.joint, stick.tip]) {
                    if (
                        point !== sticks[above].joint &&
                        !list.includes(point)
                    ) {
                        list.push(point);
                    }
                }
            }
        }
        this.before_x = new Float64Array(particles.length);
        this.before_y = new Float64Array(particles.length);
        this.x = new Float64Array(particles.length);
        this.last_x = new Float64Array(particles.length);
        this.plane_x = new Float64Array(particles.length);
        this.plane_y = new Float64Array(particles.length);
        this.plane_d = new Float64Array(particles.length);
        this.plane_step = new Float64Array(particles.length).fill(-2);
        this.last_y = new Float64Array(particles.length);
        this.y = new Float64Array(particles.length);
        this.rest_of = sticks.map((stick, index) => {
            let top = index;
            while (sticks[top].parent >= 0) {
                top = sticks[top].parent;
            }
            const whole = [sticks[top].joint, ...this.below[top]];
            return whole.filter(
                (point) =>
                    point !== stick.joint && !this.below[index].includes(point),
            );
        });
        this.listener = world.steps.attach(WorldStepEvent, (event) => {
            this.solve(event.seconds);
        });
    }

    /** Every body has stopped (asleep, or slower than a few units a second for a while). */
    public get is_settled(): boolean {
        return this.still_for >= SETTLED_SECONDS;
    }

    /** It was taken out of its world. */
    public get removed(): boolean {
        return this.is_removed;
    }

    /** Adds a speed to a bone's two ends (a second blow). */
    public push(bone: number | string, x: number, y: number): void {
        const index =
            typeof bone === "string" ? this.rig.bone_index(bone) : bone;
        const stick = index < 0 ? -1 : this.by_bone[index];
        if (stick < 0) {
            return;
        }
        for (const particle of [
            this.sticks[stick].joint,
            this.sticks[stick].tip,
        ]) {
            const body = this.particles[particle].body;
            body.velocity = {
                x: body.velocity.x + x,
                y: body.velocity.y + y,
            };
        }
    }

    /** Where a bone's joint is now, in the world (the placement's space); null for a root. */
    public joint_of(bone: number | string): Vector2I | null {
        const index =
            typeof bone === "string" ? this.rig.bone_index(bone) : bone;
        const stick = index < 0 ? -1 : this.by_bone[index];
        if (stick < 0) {
            return null;
        }
        const position = this.particles[this.sticks[stick].joint].body.position;
        return { x: position.x, y: position.y };
    }

    /** The box round every body now, in the world. */
    public bounds(): {
        left: number;
        top: number;
        right: number;
        bottom: number;
    } {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const particle of this.particles) {
            const box = particle.body.box;
            left = Math.min(left, box.left);
            top = Math.min(top, box.top);
            right = Math.max(right, box.left + box.width);
            bottom = Math.max(bottom, box.top + box.height);
        }
        return { left, top, right, bottom };
    }

    /**
     * How far the sticks are from whole now, in world units: the most a stick's length is off, and
     * the most a point of a bone (its joint, its tip, its children's joints on it) is off the bone
     * held rigid (0 for scattered parts). For tests.
     */
    public stretch(): { length: number; joint: number } {
        let length = 0;
        for (const stick of this.sticks) {
            const a = this.particles[stick.joint].body.position;
            const b = this.particles[stick.tip].body.position;
            length = Math.max(
                length,
                Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - stick.length),
            );
        }
        const x = this.particles.map((particle) => particle.body.position.x);
        const y = this.particles.map((particle) => particle.body.position.y);
        let joint = 0;
        for (const cluster of this.clusters) {
            joint = Math.max(
                joint,
                fit_cluster(cluster, x, y, this.weights, false),
            );
        }
        return { length, joint };
    }

    /** Takes the bodies out of the world and stops listening to it. */
    public remove(): void {
        if (this.is_removed) {
            return;
        }
        this.is_removed = true;
        this.world.steps.detach(this.listener);
        for (const particle of this.particles) {
            this.world.remove(particle.body);
        }
    }

    /**
     * Writes the ragdoll's pose into the skeleton (the puppet's space at its placement) and updates
     * it: every bone's angle from its stick; the bones on a root (a hip) and scattered parts also
     * where their joints are. The roots stay where they were.
     */
    public write(skeleton: Skeleton): void {
        const count = skeleton.count;
        const angles = new Float64Array(count);
        const joint_x = new Float64Array(count);
        const joint_y = new Float64Array(count);
        for (let bone = 0; bone < count; bone++) {
            const parent = skeleton.parents[bone];
            if (parent < 0) {
                angles[bone] =
                    Math.atan2(
                        this.root_world[bone * 6 + 1],
                        this.root_world[bone * 6],
                    ) / DEGREES;
                joint_x[bone] = this.root_world[bone * 6 + 4];
                joint_y[bone] = this.root_world[bone * 6 + 5];
                continue;
            }
            const stick = this.sticks[this.by_bone[bone]];
            const a = this.particles[stick.joint].body.position;
            const b = this.particles[stick.tip].body.position;
            const from = this.to_local(a.x, a.y);
            const to = this.to_local(b.x, b.y);
            angles[bone] = Math.atan2(to.y - from.y, to.x - from.x) / DEGREES;
            joint_x[bone] = from.x;
            joint_y[bone] = from.y;
            skeleton.rotation[bone] = wrap(
                angles[bone] - angles[parent] - skeleton.rest_rotation[bone],
            );
            const is_placed = this.is_scattered || skeleton.parents[parent] < 0;
            if (!is_placed) {
                skeleton.x[bone] = this.x0[bone];
                skeleton.y[bone] = this.y0[bone];
                continue;
            }
            // The joint where its body is, in the parent's frame (with the parent's scale).
            const radians = angles[parent] * DEGREES;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const dx = from.x - joint_x[parent];
            const dy = from.y - joint_y[parent];
            skeleton.x[bone] =
                (cos * dx + sin * dy) / skeleton.length_scale(parent) -
                skeleton.rest_x[bone];
            skeleton.y[bone] =
                (-sin * dx + cos * dy) / skeleton.width_scale(parent) -
                skeleton.rest_y[bone];
        }
        skeleton.update();
    }

    /** A point of the world in the puppet's own space at its placement. */
    private to_local(x: number, y: number): { x: number; y: number } {
        const placement = this.placement;
        const scale = placement.scale;
        return {
            x: (x - placement.x) / (placement.flip_x ? -scale : scale),
            y: (y - placement.y) / scale,
        };
    }

    /** Once the world moved the bodies in a step: the bones held rigid and within limits, the speeds told of it. */
    private solve(seconds: number): void {
        this.age += seconds;
        const particles = this.particles;
        const count = particles.length;
        const before_x = this.before_x;
        const before_y = this.before_y;
        const x = this.x;
        const y = this.y;
        this.step_count += 1;
        this.watch(seconds);
        const keep = Math.max(0, 1 - this.damping * seconds);
        // A few passes, each ending with the bodies placed and out of the walls.
        const passes = Math.min(PASSES, this.iterations);
        for (let pass = 0; pass < passes; pass++) {
            for (let index = 0; index < count; index++) {
                const body = particles[index].body;
                before_x[index] = x[index] = body.position.x;
                before_y[index] = y[index] = body.position.y;
            }
            const rounds =
                Math.floor((this.iterations * (pass + 1)) / passes) -
                Math.floor((this.iterations * pass) / passes);
            this.hold(rounds);
            for (let index = 0; index < count; index++) {
                const body = particles[index].body;
                const moved_x = x[index] - before_x[index];
                const moved_y = y[index] - before_y[index];
                if (Math.abs(moved_x) > 1e-7 || Math.abs(moved_y) > 1e-7) {
                    body.velocity.x += moved_x / seconds;
                    body.velocity.y += moved_y / seconds;
                    if (this.world.place(body, x[index], y[index])) {
                        this.touch(index, x[index], y[index]);
                    }
                }
            }
        }
        for (const particle of particles) {
            const body = particle.body;
            if (!body.is_sleeping && keep < 1) {
                body.velocity.x *= keep;
                body.velocity.y *= keep;
            }
        }
    }

    /**
     * How far each point really went in the last `SETTLE_WINDOW` seconds (not its speed, which a
     * resting body on the ground keeps getting from gravity and losing again): all slow for
     * `SETTLED_SECONDS` is settled.
     */
    private watch(seconds: number): void {
        this.window_age += seconds;
        if (this.window_age < SETTLE_WINDOW && this.age > seconds) {
            return;
        }
        let fastest = 0;
        for (const [index, particle] of this.particles.entries()) {
            const position = particle.body.position;
            fastest = Math.max(
                fastest,
                Math.hypot(
                    position.x - this.last_x[index],
                    position.y - this.last_y[index],
                ),
            );
            this.last_x[index] = position.x;
            this.last_y[index] = position.y;
        }
        const is_first = this.age <= seconds;
        if (
            !is_first &&
            fastest / this.window_age < SETTLED_SPEED * this.placement.scale
        ) {
            this.still_for += this.window_age;
        } else {
            this.still_for = 0;
        }
        this.window_age = 0;
    }

    /**
     * Point `index` was pushed out of a wall from (x, y): it stays on the wall's side of the line
     * it was pushed out to, for the rest of this step and the next (a contact the solving keeps,
     * so a bone isn't bent into the ground and back each step).
     */
    private touch(index: number, x: number, y: number): void {
        const position = this.particles[index].body.position;
        const dx = position.x - x;
        const dy = position.y - y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-9) {
            return;
        }
        this.plane_x[index] = dx / length;
        this.plane_y[index] = dy / length;
        this.plane_d[index] =
            (dx / length) * position.x + (dy / length) * position.y;
        this.plane_step[index] = this.step_count;
    }

    /** `rounds` of holding every bone rigid and within its limits, on the points in `x` and `y`. */
    private hold(rounds: number): void {
        const x = this.x;
        const y = this.y;
        const weight = this.weights;
        const sticks = this.sticks;
        for (let round = 0; round < rounds; round++) {
            // Every bone held rigid: its joint, its tip and its children's joints on it.
            for (const cluster of this.clusters) {
                fit_cluster(cluster, x, y, weight, true);
            }
            // The walls the points touched.
            for (let index = 0; index < this.plane_step.length; index++) {
                if (this.plane_step[index] < this.step_count - 1) {
                    continue;
                }
                const nx = this.plane_x[index];
                const ny = this.plane_y[index];
                const below =
                    nx * x[index] + ny * y[index] - this.plane_d[index];
                if (below < 0) {
                    x[index] -= below * nx;
                    y[index] -= below * ny;
                }
            }
            for (const [index, stick] of sticks.entries()) {
                const a = stick.joint;
                const b = stick.tip;
                // The angle on the parent, within its limits: the tip turns round the joint.
                if (stick.parent >= 0) {
                    const above = sticks[stick.parent];
                    const parent_angle =
                        Math.atan2(
                            y[above.tip] - y[above.joint],
                            x[above.tip] - x[above.joint],
                        ) / DEGREES;
                    const angle =
                        Math.atan2(y[b] - y[a], x[b] - x[a]) / DEGREES;
                    // In the puppet's own space a mirrored puppet turns the other way.
                    const relative = this.placement.flip_x
                        ? wrap(parent_angle - angle)
                        : wrap(angle - parent_angle);
                    const turned = wrap(
                        relative - this.rest_rotation[stick.bone],
                    );
                    let fix = 0;
                    if (turned < stick.low || turned > stick.high) {
                        // Outside: back to the nearer limit, the short way round.
                        const to_low = wrap(stick.low - turned);
                        const to_high = wrap(stick.high - turned);
                        fix =
                            Math.abs(to_low) < Math.abs(to_high)
                                ? to_low
                                : to_high;
                    }
                    if (fix !== 0) {
                        // Both sides of the joint turn, each by its share: a light hip doesn't
                        // swing a heavy torso round, nor the other way.
                        const child = this.below[index];
                        const rest = this.rest_of[index];
                        const child_inertia = inertia(child, a, x, y, weight);
                        const rest_inertia = inertia(rest, a, x, y, weight);
                        const radians =
                            (this.placement.flip_x ? -fix : fix) * DEGREES;
                        const total = child_inertia + rest_inertia || 1;
                        turn_points(
                            child,
                            a,
                            (radians * rest_inertia) / total,
                            x,
                            y,
                        );
                        turn_points(
                            rest,
                            a,
                            (-radians * child_inertia) / total,
                            x,
                            y,
                        );
                    }
                }
            }
        }
    }
}

/** How hard the points are to turn round point `pivot`: the sum of mass times distance squared. */
function inertia(
    points: readonly number[],
    pivot: number,
    x: Float64Array,
    y: Float64Array,
    weights: Float64Array,
): number {
    let sum = 0;
    for (const point of points) {
        const dx = x[point] - x[pivot];
        const dy = y[point] - y[pivot];
        sum += (dx * dx + dy * dy) / weights[point];
    }
    return sum;
}

/** Turns the points round point `pivot` by `radians`. */
function turn_points(
    points: readonly number[],
    pivot: number,
    radians: number,
    x: Float64Array,
    y: Float64Array,
): void {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const px = x[pivot];
    const py = y[pivot];
    for (const point of points) {
        const ox = x[point] - px;
        const oy = y[point] - py;
        x[point] = px + cos * ox - sin * oy;
        y[point] = py + sin * ox + cos * oy;
    }
}

/** A bone held rigid: its points and where they lie round their middle at the fall. */
interface Cluster {
    readonly points: readonly number[];
    /** Two numbers per point: its place round the weighted middle, at the fall. */
    readonly rest: Float64Array;
}

function make_cluster(
    points: readonly number[],
    particles: readonly Particle[],
    weights: Float64Array,
): Cluster {
    let middle_x = 0;
    let middle_y = 0;
    let total = 0;
    for (const point of points) {
        const mass = 1 / weights[point];
        middle_x += particles[point].body.position.x * mass;
        middle_y += particles[point].body.position.y * mass;
        total += mass;
    }
    middle_x /= total;
    middle_y /= total;
    const rest = new Float64Array(points.length * 2);
    for (const [at, point] of points.entries()) {
        rest[at * 2] = particles[point].body.position.x - middle_x;
        rest[at * 2 + 1] = particles[point].body.position.y - middle_y;
    }
    return { points, rest };
}

/**
 * Shape matching: the turn and shift that lay a cluster's rest shape best onto its points now (by
 * mass). With `apply`, the points move there. Answers how far the farthest point was off.
 */
function fit_cluster(
    cluster: Cluster,
    x: Float64Array | number[],
    y: Float64Array | number[],
    weights: Float64Array,
    apply: boolean,
): number {
    const points = cluster.points;
    const rest = cluster.rest;
    let middle_x = 0;
    let middle_y = 0;
    let total = 0;
    for (const point of points) {
        const mass = 1 / weights[point];
        middle_x += x[point] * mass;
        middle_y += y[point] * mass;
        total += mass;
    }
    middle_x /= total;
    middle_y /= total;
    let dot = 0;
    let cross = 0;
    for (const [at, point] of points.entries()) {
        const mass = 1 / weights[point];
        const rx = rest[at * 2];
        const ry = rest[at * 2 + 1];
        const cx = x[point] - middle_x;
        const cy = y[point] - middle_y;
        dot += mass * (rx * cx + ry * cy);
        cross += mass * (rx * cy - ry * cx);
    }
    const length = Math.hypot(dot, cross) || 1;
    const cos = dot / length;
    const sin = cross / length;
    let farthest = 0;
    for (const [at, point] of points.entries()) {
        const rx = rest[at * 2];
        const ry = rest[at * 2 + 1];
        const goal_x = middle_x + cos * rx - sin * ry;
        const goal_y = middle_y + sin * rx + cos * ry;
        farthest = Math.max(
            farthest,
            Math.hypot(goal_x - x[point], goal_y - y[point]),
        );
        if (apply) {
            x[point] = goal_x;
            y[point] = goal_y;
        }
    }
    return farthest;
}

const LIMITS = new WeakMap<
    PuppetRig,
    { readonly version: number; readonly limits: Map<number, [number, number]> }
>();

/**
 * How far each bone may turn on its parent in a ragdoll, in degrees as a clip's rotation (on the rest
 * pose): the rig's `limits` where it names them, else the range its clips turn the bone through (with
 * 0) widened by 25 degrees each way, or ±30 for a bone no clip turns. Made once per rig.
 */
export function ragdoll_limits(rig: PuppetRig): Map<number, [number, number]> {
    const known = LIMITS.get(rig);
    if (known !== undefined && known.version === rig.version) {
        return known.limits;
    }
    const count = rig.bone_count;
    const low = new Float64Array(count).fill(0);
    const high = new Float64Array(count).fill(0);
    const keyed = new Uint8Array(count);
    const rotation = new Float64Array(count);
    const x = new Float64Array(count);
    const y = new Float64Array(count);
    for (const clip of rig.clips.values()) {
        const samples = Math.max(8, Math.ceil(clip.length * 30));
        for (let at = 0; at <= samples; at++) {
            clip.sample_into((clip.length * at) / samples, rotation, x, y);
            for (let bone = 0; bone < count; bone++) {
                const value = wrap(rotation[bone]);
                if (value !== 0) {
                    keyed[bone] = 1;
                }
                low[bone] = Math.min(low[bone], value);
                high[bone] = Math.max(high[bone], value);
            }
        }
    }
    const limits = new Map<number, [number, number]>();
    for (let bone = 0; bone < count; bone++) {
        if (keyed[bone] === 0) {
            limits.set(bone, [-UNKEYED_LIMIT, UNKEYED_LIMIT]);
            continue;
        }
        const from = Math.max(-180, low[bone] - LIMIT_MARGIN);
        const to = Math.min(180, high[bone] + LIMIT_MARGIN);
        limits.set(bone, [from, to]);
    }
    for (const [name, limit] of Object.entries(rig.data?.limits ?? {})) {
        const bone = rig.bone_index(name);
        if (bone >= 0) {
            limits.set(bone, [limit[0], limit[1]]);
        }
    }
    LIMITS.set(rig, { version: rig.version, limits });
    return limits;
}

/** Degrees in (-180, 180]. */
function wrap(degrees: number): number {
    let turned = degrees % 360;
    if (turned > 180) {
        turned -= 360;
    }
    if (turned <= -180) {
        turned += 360;
    }
    return turned;
}
