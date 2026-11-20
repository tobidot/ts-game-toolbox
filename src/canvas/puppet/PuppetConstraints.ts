import { bend_of, two_bone_ik } from "./PuppetIk";
import type { PuppetRig } from "./PuppetRig";
import { ConstraintData } from "./RigData";
import type { PuppetPoint, Skeleton } from "./Skeleton";

const DEGREES = Math.PI / 180;

/** The default fade of a constraint switched on or off, in seconds. */
export const CONSTRAINT_FADE = 0.15;
/** Rounds of the aim's spreading at most; it stops once the line is within `AIM_TOLERANCE`. */
const AIM_ROUNDS = 16;
/** Degrees: close enough for an aim. */
const AIM_TOLERANCE = 0.01;

/** How `aim()`, `look_at()` and `reach()` take their target. */
export interface ConstraintTargetOptions {
    /** Seconds the constraint fades in when it was off. Default `CONSTRAINT_FADE`. */
    readonly fade?: number;
    /**
     * For an aim: the point in the anchor's frame whose line (along the anchor's angle) goes
     * through the target, a gun's muzzle in its hand. Default the anchor itself.
     */
    readonly from?: readonly [number, number];
}

/** One constraint of a puppet: its data, its target and its weight. */
export class PuppetConstraint {
    /** The weight now, 0 to 1 (fading towards `target_weight`). */
    public weight: number;
    public target_weight: number;
    /** The target in the placement's space (see `Puppet.place()`); NaN for none yet. */
    public target_x = NaN;
    public target_y = NaN;
    /** For an aim, the point in the anchor's frame whose line goes through the target. */
    public from: readonly [number, number] = [0, 0];
    private rate = Infinity;

    public constructor(
        public readonly name: string,
        public data: ConstraintData,
    ) {
        const enabled = data.enabled ?? true;
        this.weight = enabled ? (data.weight ?? 1) : 0;
        this.target_weight = this.weight;
    }

    /** It turns bones now: has a target and a weight. */
    public get is_active(): boolean {
        return this.weight > 0 && Number.isFinite(this.target_x);
    }

    /** Fades the weight to `weight` over `fade` seconds (0 at once). */
    public fade_to(weight: number, fade: number): void {
        this.target_weight = Math.min(1, Math.max(0, weight));
        const gap = Math.abs(this.target_weight - this.weight);
        this.rate = fade > 0 && gap > 0 ? gap / fade : Infinity;
    }

    public update(delta_seconds: number): void {
        if (this.weight === this.target_weight) {
            return;
        }
        const step = this.rate * Math.max(0, delta_seconds);
        const gap = this.target_weight - this.weight;
        if (!Number.isFinite(step) || step >= Math.abs(gap)) {
            this.weight = this.target_weight;
        } else {
            this.weight += Math.sign(gap) * step;
        }
    }
}

/** Where the puppet is drawn, to take targets in the game's space. */
interface Placement {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly flip_x: boolean;
}

/**
 * Constraints that turn a puppet's bones towards a point after its clips and layers (since step
 * 44, Knopper Klopper), each with a weight that fades:
 *
 * - **`aim`** turns a chain of bones (spine, upper arm, forearm) so the line of an anchor (a hand,
 *   or a gun's muzzle in it: `from`) goes through the target, spread over the chain by `weights`
 *   and kept within each bone's `limits` (degrees on the pose the clips gave).
 * - **`look_at`** turns one bone (a head) so its `axis` points at the target, within `limits`.
 * - **`reach`** puts the end of two bones on the target with step 42's two-bone IK (a foot on a
 *   slope, the far hand on a gun's grip), bending the middle joint the way it bends now.
 *
 * Constraints are data on the rig (`constraints` in its data) or made in code (`set()`); a name a
 * game asks for that neither has is made from the bone names: `arm_r` and `arm_l` (aims of the
 * spine, upper arm and forearm at the hand), `head` (a look), `foot_r`, `foot_l`, `hand_r` and
 * `hand_l` (reaches). Targets are in the space the puppet is placed in (`puppet.place()`).
 *
 * ```ts
 * hero.constraints.aim("arm_r", mouse_x, mouse_y, { from: muzzle });
 * hero.constraints.look_at("head", mouse_x, mouse_y);
 * hero.constraints.reach("hand_l", grip.x, grip.y);
 * hero.constraints.release("arm_r");        // fades out
 * ```
 */
export class PuppetConstraints {
    private list: PuppetConstraint[] = [];
    private version = -1;
    private readonly scratch: PuppetPoint = { x: 0, y: 0 };
    private before = new Float64Array(0);
    /** A look's axis per bone, from the rest pose. */
    private axes = new Map<number, number>();

    public constructor(
        private readonly rig: PuppetRig,
        private readonly placement: Placement,
    ) {}

    /** The constraints in the order they are applied: the rig's, then those made since. */
    public get constraints(): readonly PuppetConstraint[] {
        this.refresh();
        return this.list;
    }

    /** The constraint of that name (made from the bone names if the rig can); null for none. */
    public get(name: string): PuppetConstraint | null {
        this.refresh();
        const found = this.list.find((constraint) => constraint.name === name);
        if (found !== undefined) {
            return found;
        }
        if (!this.rig.has_data) {
            return null;
        }
        const made = default_constraint(name, this.rig);
        if (made === null) {
            return null;
        }
        return this.set(name, made);
    }

    /** Adds a constraint in code, or replaces the one of that name. */
    public set(name: string, data: ConstraintData): PuppetConstraint {
        this.refresh();
        const constraint = new PuppetConstraint(name, data);
        const at = this.list.findIndex((known) => known.name === name);
        if (at >= 0) {
            constraint.target_x = this.list[at].target_x;
            constraint.target_y = this.list[at].target_y;
            this.list[at] = constraint;
        } else {
            this.list.push(constraint);
        }
        return constraint;
    }

    /** Aims the chain `name` at a point; false for no such aim. */
    public aim(
        name: string,
        x: number,
        y: number,
        options: ConstraintTargetOptions = {},
    ): boolean {
        return this.target(name, "aim", x, y, options);
    }

    /** Turns the bone of `name` to look at a point; false for no such look. */
    public look_at(
        name: string,
        x: number,
        y: number,
        options: ConstraintTargetOptions = {},
    ): boolean {
        return this.target(name, "look_at", x, y, options);
    }

    /** Puts the end of the two bones of `name` on a point; false for no such reach. */
    public reach(
        name: string,
        x: number,
        y: number,
        options: ConstraintTargetOptions = {},
    ): boolean {
        return this.target(name, "reach", x, y, options);
    }

    /** Fades a constraint out over `fade` seconds (its target stays for the next time). */
    public release(name: string, fade: number = CONSTRAINT_FADE): boolean {
        this.refresh();
        const constraint = this.list.find((known) => known.name === name);
        if (constraint === undefined) {
            return false;
        }
        constraint.fade_to(0, fade);
        return true;
    }

    /** Switches a constraint on (fading to its data's weight) or off; false for no such constraint. */
    public set_enabled(
        name: string,
        enabled: boolean,
        fade: number = CONSTRAINT_FADE,
    ): boolean {
        const constraint = this.get(name);
        if (constraint === null) {
            return false;
        }
        constraint.fade_to(enabled ? (constraint.data.weight ?? 1) : 0, fade);
        return true;
    }

    /** Moves the weights on. */
    public update(delta_seconds: number): void {
        for (const constraint of this.list) {
            constraint.update(delta_seconds);
        }
    }

    /**
     * Turns the bones of every active constraint, in order, on the world pose the clips gave (call
     * after `skeleton.update()`); updates the skeleton after each.
     */
    public apply(skeleton: Skeleton): void {
        if (this.list.length === 0) {
            return;
        }
        if (this.before.length !== skeleton.count) {
            this.before = new Float64Array(skeleton.count);
        }
        for (const constraint of this.list) {
            if (!constraint.is_active) {
                continue;
            }
            const local = this.to_local(
                constraint.target_x,
                constraint.target_y,
            );
            this.before.set(skeleton.rotation);
            const data = constraint.data;
            let bones: number[];
            if (data.kind === "aim") {
                bones = this.apply_aim(skeleton, data, constraint, local);
            } else if (data.kind === "look_at") {
                bones = this.apply_look(skeleton, data, local);
            } else {
                bones = this.apply_reach(skeleton, data, local);
            }
            if (constraint.weight < 1 && bones.length > 0) {
                for (const bone of bones) {
                    const from = this.before[bone];
                    skeleton.rotation[bone] =
                        from +
                        wrap(skeleton.rotation[bone] - from) *
                            constraint.weight;
                }
                skeleton.update();
            }
        }
    }

    /** A point of the placement's space in the puppet's own. */
    private to_local(x: number, y: number): PuppetPoint {
        const placement = this.placement;
        const scale = placement.scale;
        return {
            x: (x - placement.x) / (placement.flip_x ? -scale : scale),
            y: (y - placement.y) / scale,
        };
    }

    private target(
        name: string,
        kind: ConstraintData["kind"],
        x: number,
        y: number,
        options: ConstraintTargetOptions,
    ): boolean {
        const constraint = this.get(name);
        if (constraint === null || constraint.data.kind !== kind) {
            return false;
        }
        constraint.target_x = x;
        constraint.target_y = y;
        if (options.from !== undefined) {
            constraint.from = options.from;
        }
        const weight = constraint.data.weight ?? 1;
        if (constraint.target_weight !== weight) {
            constraint.fade_to(weight, options.fade ?? CONSTRAINT_FADE);
        }
        return true;
    }

    /** The aim: spreads the line's error over the chain, round after round, within the limits. */
    private apply_aim(
        skeleton: Skeleton,
        data: Extract<ConstraintData, { kind: "aim" }>,
        constraint: PuppetConstraint,
        target: PuppetPoint,
    ): number[] {
        const anchor = this.rig.anchors.get(data.anchor);
        if (anchor === undefined) {
            return [];
        }
        const chain = data.chain.map((name) => skeleton.index_of(name));
        if (chain.some((bone) => bone < 0)) {
            return [];
        }
        const weights = chain.map((_, at) => data.weights?.[at] ?? 1);
        const limits = chain.map(
            (_, at) => data.limits?.[at] ?? ([-180, 180] as const),
        );
        const [from_x, from_y] = constraint.from;
        const point = this.scratch;
        const free = new Array<boolean>(chain.length);
        for (let round = 0; round < AIM_ROUNDS; round++) {
            const angle =
                skeleton.world_rotation(anchor.bone) + anchor.rotation;
            skeleton.world_point(anchor.bone, anchor.x, anchor.y, point);
            const radians = angle * DEGREES;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const line_x = point.x + cos * from_x - sin * from_y;
            const line_y = point.y + sin * from_x + cos * from_y;
            const wanted =
                Math.atan2(target.y - line_y, target.x - line_x) / DEGREES;
            const error = wrap(wanted - angle);
            if (Math.abs(error) < AIM_TOLERANCE) {
                break;
            }
            let sum = 0;
            for (let at = 0; at < chain.length; at++) {
                const offset =
                    skeleton.rotation[chain[at]] - this.before[chain[at]];
                const [low, high] = limits[at];
                free[at] =
                    weights[at] > 0 &&
                    (error > 0 ? offset < high - 1e-9 : offset > low + 1e-9);
                if (free[at]) {
                    sum += weights[at];
                }
            }
            if (sum <= 0) {
                break;
            }
            for (let at = 0; at < chain.length; at++) {
                if (!free[at]) {
                    continue;
                }
                const bone = chain[at];
                const [low, high] = limits[at];
                const offset =
                    skeleton.rotation[bone] -
                    this.before[bone] +
                    (error * weights[at]) / sum;
                skeleton.rotation[bone] =
                    this.before[bone] + Math.min(high, Math.max(low, offset));
            }
            skeleton.update();
        }
        return chain;
    }

    /** The look: one turn of the bone, its axis onto the target, within its limits. */
    private apply_look(
        skeleton: Skeleton,
        data: Extract<ConstraintData, { kind: "look_at" }>,
        target: PuppetPoint,
    ): number[] {
        const bone = skeleton.index_of(data.bone);
        if (bone < 0) {
            return [];
        }
        let axis = data.axis ?? this.axes.get(bone);
        if (axis === undefined) {
            axis = rest_axis(this.rig, bone);
            this.axes.set(bone, axis);
        }
        const wanted =
            Math.atan2(
                target.y - skeleton.world_y(bone),
                target.x - skeleton.world_x(bone),
            ) / DEGREES;
        const error = wrap(wanted - (skeleton.world_rotation(bone) + axis));
        const [low, high] = data.limits ?? [-45, 45];
        skeleton.rotation[bone] += Math.min(high, Math.max(low, error));
        skeleton.update();
        return [bone];
    }

    /** The reach: two-bone IK onto the target, the middle joint bent as it is now (or as the data says). */
    private apply_reach(
        skeleton: Skeleton,
        data: Extract<ConstraintData, { kind: "reach" }>,
        target: PuppetPoint,
    ): number[] {
        const upper = skeleton.index_of(data.upper);
        const lower = skeleton.index_of(data.lower);
        if (upper < 0 || lower < 0 || skeleton.parents[lower] !== upper) {
            return [];
        }
        let end_x = skeleton.lengths[lower];
        let end_y = 0;
        if (Array.isArray(data.end)) {
            [end_x, end_y] = data.end as readonly [number, number];
        } else if (typeof data.end === "string") {
            const anchor = this.rig.anchors.get(data.end);
            if (anchor !== undefined && anchor.bone === lower) {
                end_x = anchor.x;
                end_y = anchor.y;
            }
        }
        const bend = data.bend ?? bend_of(skeleton, upper, lower, end_x, end_y);
        two_bone_ik(
            skeleton,
            upper,
            lower,
            end_x,
            end_y,
            target.x,
            target.y,
            bend,
        );
        return [upper, lower];
    }

    /** Takes the rig's constraints when its data (first) comes or changes. */
    private refresh(): void {
        if (this.version === this.rig.version) {
            return;
        }
        this.version = this.rig.version;
        this.axes.clear();
        const made = this.list;
        this.list = [];
        for (const [name, data] of Object.entries(
            this.rig.data?.constraints ?? {},
        )) {
            this.list.push(new PuppetConstraint(name, data));
        }
        for (const constraint of made) {
            if (!this.list.some((known) => known.name === constraint.name)) {
                this.list.push(constraint);
            }
        }
    }
}

/**
 * A constraint made from the bone names, for a rig that names none: `arm_r` / `arm_l` aim the
 * spine (the upper arm's parent), the upper arm and the forearm at the hand's anchor (or the arm's
 * tip); `head` looks; `foot_r` / `foot_l` reach with the thigh and shin; `hand_r` / `hand_l`
 * reach with the upper arm and forearm. Null when the bones aren't there.
 */
export function default_constraint(
    name: string,
    rig: PuppetRig,
): ConstraintData | null {
    const bone = (bone_name: string) => rig.bone_index(bone_name);
    const names = rig.bone_names;
    const first_of = (candidates: readonly string[]) =>
        candidates.find((candidate) => bone(candidate) >= 0) ?? null;
    const side = /_(l|r)$/.exec(name)?.[1] ?? null;
    if (side !== null && name.startsWith("arm_")) {
        const upper = `upper_arm_${side}`;
        const lower = first_of([`lower_arm_${side}`, `forearm_${side}`]);
        const anchor =
            [`hand_${side}`, `arm_${side}_tip`].find((anchor_name) =>
                rig.anchors.has(anchor_name),
            ) ?? null;
        if (bone(upper) < 0 || lower === null || anchor === null) {
            return null;
        }
        const spine_index = rig.make_skeleton().parents[bone(upper)];
        const chain =
            spine_index >= 0
                ? [names[spine_index], upper, lower]
                : [upper, lower];
        return {
            kind: "aim",
            chain,
            anchor,
            weights: chain.length === 3 ? [0.2, 0.55, 0.25] : [0.7, 0.3],
            limits:
                chain.length === 3
                    ? [
                          [-35, 35],
                          [-180, 180],
                          [-50, 50],
                      ]
                    : [
                          [-180, 180],
                          [-50, 50],
                      ],
        };
    }
    if (name === "head" && bone("head") >= 0) {
        return { kind: "look_at", bone: "head", limits: [-40, 40] };
    }
    if (side !== null && name.startsWith("foot_")) {
        const lower = first_of([`shin_${side}`]);
        if (bone(`thigh_${side}`) < 0 || lower === null) {
            return null;
        }
        return { kind: "reach", upper: `thigh_${side}`, lower };
    }
    if (side !== null && name.startsWith("hand_")) {
        const lower = first_of([`lower_arm_${side}`, `forearm_${side}`]);
        if (bone(`upper_arm_${side}`) < 0 || lower === null) {
            return null;
        }
        return { kind: "reach", upper: `upper_arm_${side}`, lower };
    }
    return null;
}

/** The angle from a bone's line to the way the puppet faces (+x) at rest: a head that points up looks ahead at +90. */
function rest_axis(rig: PuppetRig, bone: number): number {
    const rest = rig.make_skeleton();
    rest.update();
    return wrap(-rest.world_rotation(bone));
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
