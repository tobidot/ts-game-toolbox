import { Vector2, Vector2I } from "../../geometries/Vector2";

/**
 * Motion under constant acceleration, in the toolbox's `Vector2`. Two ways to the same
 * answer: `integrate` steps a body one frame at a time (what a game loop does, any
 * acceleration, collisions in between), the closed formulas (`projectile_position`,
 * `flight_time`, `range`, `apex`) jump straight to a moment of a projectile under gravity
 * (what a landing marker, a preview arc or a test needs). Screen convention throughout:
 * y grows downwards, so gravity is a positive number and "up" is a negative `y` velocity.
 */

/** A body with a position and a velocity, both mutated by `integrate`. */
export interface KinematicState {
    position: Vector2;
    velocity: Vector2;
}

/**
 * Semi-implicit (symplectic) Euler: the velocity takes the acceleration first, then the
 * position moves with the *new* velocity. Mutates and returns `state`. With small steps it
 * converges to `projectile_position`; with a constant acceleration it never gains energy.
 */
export function integrate(
    state: KinematicState,
    acceleration: Vector2I,
    delta_seconds: number,
): KinematicState {
    state.velocity.x += acceleration.x * delta_seconds;
    state.velocity.y += acceleration.y * delta_seconds;
    state.position.x += state.velocity.x * delta_seconds;
    state.position.y += state.velocity.y * delta_seconds;
    return state;
}

/**
 * Analytic position of a projectile launched from `origin` with `velocity` after `t`
 * seconds under `gravity` (y down is positive): `p = o + v·t + ½·g·t²` on the y axis.
 */
export function projectile_position(
    origin: Vector2I,
    velocity: Vector2I,
    gravity: number,
    t: number,
): Vector2 {
    return new Vector2(
        origin.x + velocity.x * t,
        origin.y + velocity.y * t + 0.5 * gravity * t * t,
    );
}

/**
 * Time until the projectile reaches `ground_y` on its way down (0 when it never does: no
 * gravity and no downward velocity, or it starts below the ground and moves away). From
 * the ground itself with an upward velocity this is `2·|vy| / g`.
 */
export function flight_time(
    origin: Vector2I,
    velocity: Vector2I,
    gravity: number,
    ground_y: number,
): number {
    const height = ground_y - origin.y; // positive: the ground is below the origin
    if (gravity <= 0) {
        // no gravity: a straight line, hits the ground only when moving towards it
        if (velocity.y <= 0 || height < 0) return 0;
        return height / velocity.y;
    }
    // ½·g·t² + vy·t - height = 0, the larger root is the landing
    const discriminant = velocity.y * velocity.y + 2 * gravity * height;
    if (discriminant < 0) return 0;
    const t = (-velocity.y + Math.sqrt(discriminant)) / gravity;
    return t > 0 ? t : 0;
}

/** Horizontal distance covered until `ground_y` (signed: negative when flying left). */
export function range(
    origin: Vector2I,
    velocity: Vector2I,
    gravity: number,
    ground_y: number,
): number {
    return velocity.x * flight_time(origin, velocity, gravity, ground_y);
}

/**
 * Highest point of the arc: where the vertical velocity is 0. A projectile that never rises
 * (no upward velocity, or no gravity) has its apex at the origin.
 */
export function apex(
    origin: Vector2I,
    velocity: Vector2I,
    gravity: number,
): Vector2 {
    if (gravity <= 0 || velocity.y >= 0) return new Vector2(origin);
    const t = -velocity.y / gravity;
    return projectile_position(origin, velocity, gravity, t);
}

/**
 * Launch velocity from a speed and an angle in radians: 0 is right, positive is up on a
 * y-down screen (so 45° = `Math.PI / 4` gives `(s·cos, -s·sin)`).
 */
export function launch_velocity(speed: number, angle: number): Vector2 {
    return new Vector2(Math.cos(angle) * speed, -Math.sin(angle) * speed);
}
