/**
 * Small number helpers that geometry and game code keep needing.
 */

/** `value` held inside [min, max]. */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Linear interpolation: `from` at t = 0, `to` at t = 1. `t` is not clamped. */
export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/**
 * The signed turn from angle `from` to angle `to`, in radians, wrapped into
 * [-π, π]: the shortest way round.
 */
export function angle_difference(from: number, to: number): number {
    let difference = (to - from) % (Math.PI * 2);
    if (difference > Math.PI) {
        difference -= Math.PI * 2;
    }
    if (difference < -Math.PI) {
        difference += Math.PI * 2;
    }
    return difference;
}
