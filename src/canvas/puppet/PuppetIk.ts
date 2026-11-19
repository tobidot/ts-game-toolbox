import type { Skeleton } from "./Skeleton";

const DEGREES = Math.PI / 180;

/**
 * Two-bone inverse kinematics: turns `upper` and `lower` (its child) so that the point `end_x`,
 * `end_y` of `lower` (in its frame, as for `world_point()`: an ankle at the shin's tip is
 * `(length, 0)`) reaches `target_x`, `target_y` in the puppet's space. `bend` picks the side the
 * middle joint goes to: 1 turns the upper bone clockwise on the screen from the line to the
 * target, -1 the other way (`bend_of()` reads it from the pose). Only the two bones' `rotation`
 * changes; the skeleton is updated afterwards.
 *
 * Call it after `skeleton.update()` (the parents must be where they are). Answers false when the
 * target is out of reach: the bones then point at it as far as they go (stretched, or folded as
 * far as they can).
 */
export function two_bone_ik(
    skeleton: Skeleton,
    upper: number,
    lower: number,
    end_x: number,
    end_y: number,
    target_x: number,
    target_y: number,
    bend: number = 1,
): boolean {
    if (skeleton.parents[lower] !== upper) {
        throw new Error(
            `two_bone_ik: "${skeleton.names[lower]}" does not hang on "${skeleton.names[upper]}"`,
        );
    }
    // The middle joint in the upper bone's frame, and the end in the lower's (with their scales).
    const joint_x =
        (skeleton.rest_x[lower] + skeleton.x[lower]) *
        skeleton.length_scale(upper);
    const joint_y =
        (skeleton.rest_y[lower] + skeleton.y[lower]) *
        skeleton.width_scale(upper);
    const tip_x = end_x * skeleton.length_scale(lower);
    const tip_y = end_y * skeleton.width_scale(lower);
    const a = Math.hypot(joint_x, joint_y);
    const b = Math.hypot(tip_x, tip_y);
    const start_x = skeleton.world_x(upper);
    const start_y = skeleton.world_y(upper);
    const dx = target_x - start_x;
    const dy = target_y - start_y;
    const wanted = Math.hypot(dx, dy);
    const shortest = Math.abs(a - b);
    const longest = a + b;
    const distance = Math.min(Math.max(wanted, shortest + 1e-9), longest);
    const is_reached =
        wanted <= longest + 1e-6 && wanted >= shortest - 1e-6 && a > 0;
    const towards = Math.atan2(dy, dx);
    let opening = 0;
    if (a > 0 && distance > 0) {
        const cosine =
            (a * a + distance * distance - b * b) / (2 * a * distance);
        opening = Math.acos(Math.min(1, Math.max(-1, cosine)));
    }
    const side = bend >= 0 ? 1 : -1;
    const upper_angle = towards + side * opening;
    const knee_x = start_x + a * Math.cos(upper_angle);
    const knee_y = start_y + a * Math.sin(upper_angle);
    const lower_angle = Math.atan2(
        start_y + Math.sin(towards) * distance - knee_y,
        start_x + Math.cos(towards) * distance - knee_x,
    );
    // From the lines to the bones' frames: a joint off the bone's axis turns the frame back.
    const upper_frame = upper_angle - Math.atan2(joint_y, joint_x);
    const lower_frame = lower_angle - Math.atan2(tip_y, tip_x);
    const parent = skeleton.parents[upper];
    const parent_angle = parent < 0 ? 0 : skeleton.world_rotation(parent);
    skeleton.rotation[upper] = wrap(
        upper_frame / DEGREES - parent_angle - skeleton.rest_rotation[upper],
    );
    skeleton.rotation[lower] = wrap(
        lower_frame / DEGREES -
            upper_frame / DEGREES -
            skeleton.rest_rotation[lower],
    );
    skeleton.update();
    return is_reached;
}

/**
 * Which way the middle joint of `upper` and `lower` is bent in the skeleton's pose now (1 or -1,
 * as `two_bone_ik()` takes it): keep a knee bending the way it was drawn.
 */
export function bend_of(
    skeleton: Skeleton,
    upper: number,
    lower: number,
    end_x: number,
    end_y: number,
): number {
    const start_x = skeleton.world_x(upper);
    const start_y = skeleton.world_y(upper);
    const knee_x = skeleton.world_x(lower);
    const knee_y = skeleton.world_y(lower);
    const end = skeleton.world_point(lower, end_x, end_y);
    // The knee on the clockwise side of the line from the start to the end: turning the upper bone
    // clockwise from that line reaches it.
    const cross =
        (end.x - start_x) * (knee_y - start_y) -
        (end.y - start_y) * (knee_x - start_x);
    return cross >= 0 ? 1 : -1;
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
