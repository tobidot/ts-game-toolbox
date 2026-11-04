import { Vector2I } from "../../geometries";

/**
 * How things walk somewhere and stand together, as pure functions: `steer_towards` moves a body
 * to a point at a speed and stops it there without shaking, `separate_bodies` keeps bodies from
 * standing on one spot. Call both once per step, the moves first; the same `delta_seconds` every
 * step (see `FixedStepClock`) keeps a crowd steady.
 */

export interface SteerOptions {
    /** Units per second. */
    speed: number;
    /** How close counts as there: the radii of both, for something that walks up to a thing. Default 0. */
    stop_distance?: number;
    /** On this last stretch before `stop_distance` the body slows down evenly. Default 0: it doesn't. */
    slow_distance?: number;
}

/** A body `separate_bodies` moves apart from others. */
export interface SeparatedBody extends Vector2I {
    radius: number;
    /** Pushes others and never moves itself: a building. */
    is_fixed?: boolean;
}

/** How much of an overlap goes per second, by default. */
const DEFAULT_STIFFNESS = 6;
/** Turns the index of a pair into a direction, and neighbours into very different ones. */
const GOLDEN_ANGLE = 2.399963;

/**
 * Moves `body` towards `target` for `delta_seconds`, and never past the point `stop_distance`
 * before it: a long step at high game speed ends there, it doesn't overshoot and come back.
 * Returns whether the body is there; one that is there stays where it is.
 */
export function steer_towards(
    body: Vector2I,
    target: Readonly<Vector2I>,
    delta_seconds: number,
    options: SteerOptions,
): boolean {
    const to_x = target.x - body.x;
    const to_y = target.y - body.y;
    const distance = Math.hypot(to_x, to_y);
    const left = distance - (options.stop_distance ?? 0);
    if (left <= 0) {
        return true;
    }
    const slow_distance = options.slow_distance ?? 0;
    const speed =
        left < slow_distance
            ? (options.speed * left) / slow_distance
            : options.speed;
    const step = Math.min(left, speed * delta_seconds);
    body.x += (to_x / distance) * step;
    body.y += (to_y / distance) * step;
    return step === left;
}

/**
 * Pushes overlapping circles apart, softly: each step takes `stiffness * delta_seconds` of an
 * overlap away, shared by the two, or all of it for the one next to a fixed body. All pushes are
 * added up first and applied together, so the order of the list doesn't matter and nobody gets
 * shoved along it. Two bodies on the very same spot part in a direction that follows from their
 * places in the list: no NaN, no random numbers, and a replay stays the same.
 *
 * Compares all pairs: fine for a few hundred bodies at a fixed step, and no index to keep up.
 */
export function separate_bodies(
    bodies: readonly SeparatedBody[],
    delta_seconds: number,
    stiffness: number = DEFAULT_STIFFNESS,
): void {
    const count = bodies.length;
    const share = Math.min(1, stiffness * delta_seconds);
    const push_x = new Float64Array(count);
    const push_y = new Float64Array(count);
    for (let a = 0; a < count; a++) {
        const first = bodies[a];
        for (let b = a + 1; b < count; b++) {
            const second = bodies[b];
            if (first.is_fixed && second.is_fixed) {
                continue;
            }
            const reach = first.radius + second.radius;
            const apart_x = second.x - first.x;
            const apart_y = second.y - first.y;
            const square = apart_x * apart_x + apart_y * apart_y;
            if (square >= reach * reach) {
                continue;
            }
            const distance = Math.sqrt(square);
            const angle = (a * count + b) * GOLDEN_ANGLE;
            const normal_x =
                distance > 0 ? apart_x / distance : Math.cos(angle);
            const normal_y =
                distance > 0 ? apart_y / distance : Math.sin(angle);
            const push = (reach - distance) * share;
            const first_part = first.is_fixed ? 0 : second.is_fixed ? 1 : 0.5;
            const second_part = 1 - first_part;
            push_x[a] -= normal_x * push * first_part;
            push_y[a] -= normal_y * push * first_part;
            push_x[b] += normal_x * push * second_part;
            push_y[b] += normal_y * push * second_part;
        }
    }
    for (let index = 0; index < count; index++) {
        bodies[index].x += push_x[index];
        bodies[index].y += push_y[index];
    }
}
