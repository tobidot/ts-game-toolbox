import { JiggleData } from "./RigData";
import type { Skeleton } from "./Skeleton";

const DEGREES = 180 / Math.PI;

/**
 * The spring's step: 240 per second, whatever the frame rate, so 30 and 144 updates a second
 * swing alike. An update moves the target in a straight line over its steps.
 */
export const JIGGLE_STEP = 1 / 240;
/** How much a swing is damped against its own speed (below 1 it swings back). */
const DAMPING_RATIO = 0.3;
/** Longer updates than this are cut (a tab that slept doesn't swing for an hour). */
const MOST_PER_UPDATE = 0.25;

/** A bone that jiggles, read from the rig: its number and its spring. */
export interface PuppetJiggleBone {
    readonly name: string;
    readonly bone: number;
    readonly half_life: number;
    readonly strength: number;
    readonly max: number;
}

/** The rig's `jiggle` data as bones by number; throws on an unknown bone or numbers out of range. */
export function jiggle_from_data(
    data: Readonly<Record<string, JiggleData>>,
    index_of: (bone: string) => number,
): PuppetJiggleBone[] {
    const out: PuppetJiggleBone[] = [];
    for (const [name, jiggle] of Object.entries(data)) {
        const bone = index_of(name);
        if (bone < 0) {
            throw new Error(`jiggle: no bone "${name}"`);
        }
        const half_life = jiggle.half_life ?? 0.2;
        const strength = jiggle.strength ?? 1;
        const max = jiggle.max ?? 30;
        if (!(half_life > 0) || !Number.isFinite(half_life)) {
            throw new Error(`jiggle "${name}": half_life must be above 0`);
        }
        if (!(strength >= 0) || !Number.isFinite(strength)) {
            throw new Error(`jiggle "${name}": strength must be 0 or more`);
        }
        if (!(max >= 0) || !Number.isFinite(max)) {
            throw new Error(`jiggle "${name}": max must be 0 or more`);
        }
        out.push({ name, bone, half_life, strength, max });
    }
    // Parents first (bones are numbered so): a tail's root swings before its tip.
    return out.sort((a, b) => a.bone - b.bone);
}

/**
 * The jiggle of one puppet: per bone of the rig's `jiggle`, the tip of the bone follows where the
 * clip puts it through a damped spring, and the bone is turned by how far the tip lags (times its
 * `strength`, at most `max` degrees). Ears flop after a shake, a tail swings after a turn.
 *
 * Stepped in fixed steps of `JIGGLE_STEP`, so the swing is the same at any frame rate. A puppet
 * that moves across the stage says so with `carry(dx, dy)`, and its ears lag behind the move too.
 */
export class PuppetJiggle {
    /** False: no bone jiggles (and the springs rest where the clip is). */
    public enabled = true;
    /** Times every bone's strength; 0 is still, 2 twice as floppy. */
    public strength = 1;
    private bones: readonly PuppetJiggleBone[] = [];
    // Per bone: the spring's tip (x, y), its speed, and where the clip put the tip at the last update.
    private tip_x = new Float64Array(0);
    private tip_y = new Float64Array(0);
    private speed_x = new Float64Array(0);
    private speed_y = new Float64Array(0);
    private target_x = new Float64Array(0);
    private target_y = new Float64Array(0);
    /** The angle each bone is turned by now, in degrees. */
    private turn = new Float64Array(0);
    private is_started = false;
    /** Time not stepped yet (less than one step). */
    private left = 0;
    private carried_x = 0;
    private carried_y = 0;

    /** The bones to jiggle (from the rig; a new rig's data starts the springs again). */
    public set_bones(bones: readonly PuppetJiggleBone[]): void {
        this.bones = bones;
        const count = bones.length;
        this.tip_x = new Float64Array(count);
        this.tip_y = new Float64Array(count);
        this.speed_x = new Float64Array(count);
        this.speed_y = new Float64Array(count);
        this.target_x = new Float64Array(count);
        this.target_y = new Float64Array(count);
        this.turn = new Float64Array(count);
        this.is_started = false;
        this.left = 0;
    }

    /** The bones that jiggle, by name. */
    public get bone_names(): readonly string[] {
        return this.bones.map((bone) => bone.name);
    }

    /**
     * The puppet moved by `dx`, `dy` in its own space (units of the rig, mirrored back when it is
     * drawn with `flip_x`): the springs stay where they were in the world, so they lag behind.
     */
    public carry(dx: number, dy: number): void {
        this.carried_x += dx;
        this.carried_y += dy;
    }

    /** The springs at rest where the clip is now, nothing turned. */
    public reset(): void {
        this.is_started = false;
        this.turn.fill(0);
        this.speed_x.fill(0);
        this.speed_y.fill(0);
        this.carried_x = 0;
        this.carried_y = 0;
        this.left = 0;
    }

    /** How far bone `name` is turned by its jiggle now, in degrees (0 for a bone that doesn't jiggle). */
    public offset(name: string): number {
        const at = this.bones.findIndex((bone) => bone.name === name);
        return at < 0 ? 0 : this.turn[at];
    }

    /**
     * Moves the springs on by `delta_seconds` towards where the skeleton's pose puts the tips, and
     * turns the bones by their lag. The skeleton must be updated (world transforms) with the
     * clip's pose; it is updated again when a bone turned.
     */
    public step(delta_seconds: number, skeleton: Skeleton): void {
        const count = this.bones.length;
        if (count === 0) {
            return;
        }
        if (!this.enabled) {
            this.reset();
            return;
        }
        const tip = { x: 0, y: 0 };
        const bones = this.bones;
        if (!this.is_started) {
            for (let index = 0; index < count; index++) {
                this.tip_of(skeleton, bones[index].bone, tip);
                this.tip_x[index] = tip.x;
                this.tip_y[index] = tip.y;
                this.target_x[index] = tip.x;
                this.target_y[index] = tip.y;
            }
            this.speed_x.fill(0);
            this.speed_y.fill(0);
            this.carried_x = 0;
            this.carried_y = 0;
            this.is_started = true;
        }
        const seconds = Math.min(MOST_PER_UPDATE, Math.max(0, delta_seconds));
        const total = this.left + seconds;
        const steps = Math.floor(total / JIGGLE_STEP + 1e-9);
        this.left = Math.max(0, total - steps * JIGGLE_STEP);
        // The world stood still while the puppet moved: in its space, the springs moved back.
        const shift_x = -this.carried_x;
        const shift_y = -this.carried_y;
        this.carried_x = 0;
        this.carried_y = 0;
        let is_turned = false;
        for (let index = 0; index < count; index++) {
            const jiggle = bones[index];
            this.tip_of(skeleton, jiggle.bone, tip);
            const from_x = this.target_x[index];
            const from_y = this.target_y[index];
            // Where the spring's tip was, in the puppet's space now.
            let x = this.tip_x[index] + shift_x;
            let y = this.tip_y[index] + shift_y;
            let vx = this.speed_x[index];
            let vy = this.speed_y[index];
            const decay = Math.LN2 / jiggle.half_life;
            const omega = decay / DAMPING_RATIO;
            const stiffness = omega * omega;
            const damping = 2 * DAMPING_RATIO * omega;
            for (let step = 1; step <= steps; step++) {
                const part = step / steps;
                const goal_x = from_x + (tip.x - from_x) * part;
                const goal_y = from_y + (tip.y - from_y) * part;
                vx += (stiffness * (goal_x - x) - damping * vx) * JIGGLE_STEP;
                vy += (stiffness * (goal_y - y) - damping * vy) * JIGGLE_STEP;
                x += vx * JIGGLE_STEP;
                y += vy * JIGGLE_STEP;
            }
            this.tip_x[index] = x;
            this.tip_y[index] = y;
            this.speed_x[index] = vx;
            this.speed_y[index] = vy;
            this.target_x[index] = tip.x;
            this.target_y[index] = tip.y;
            // The lag as an angle about the bone's joint: from where the clip has the tip to the spring's.
            const joint_x = skeleton.world_x(jiggle.bone);
            const joint_y = skeleton.world_y(jiggle.bone);
            const wanted = Math.atan2(tip.y - joint_y, tip.x - joint_x);
            const lagging = Math.atan2(y - joint_y, x - joint_x);
            let lag = (lagging - wanted) * DEGREES;
            lag = ((((lag + 180) % 360) + 360) % 360) - 180;
            const limit = jiggle.max;
            const turn = Math.max(
                -limit,
                Math.min(limit, lag * jiggle.strength * this.strength),
            );
            this.turn[index] = turn;
            if (turn !== 0) {
                skeleton.rotation[jiggle.bone] += turn;
                is_turned = true;
            }
        }
        if (is_turned) {
            skeleton.update();
        }
    }

    /** Where the bone's tip is (its length along it from its joint; 1 unit for a bone without length). */
    private tip_of(
        skeleton: Skeleton,
        bone: number,
        out: { x: number; y: number },
    ): void {
        const length = skeleton.lengths[bone];
        skeleton.world_point(bone, length > 0 ? length : 1, 0, out);
    }
}
