import { RectI, Vector2I } from "../../geometries";

/**
 * What makes a thing bounce, as pure functions: find where two shapes touch (`circle_contact`,
 * `circle_rect_contact`), then turn that contact into new velocities (`reflect` off something
 * that does not move, `elastic_impact` between two things that do). `aabb_*` stops a box and
 * slides it along; this sends a body back. Moving the bodies apart is left to the caller: it
 * has the `depth`, and only it knows which bodies may move.
 */

export interface Circle {
    x: number;
    y: number;
    radius: number;
}

/** Where two shapes touch: `normal` is a unit vector, `depth` how far they overlap along it. */
export interface Contact {
    normal: Vector2I;
    depth: number;
}

/** One side of a collision. `mass` may be `Infinity` for something that cannot be moved. */
export interface Impactor {
    velocity: Vector2I;
    mass: number;
}

function dot(a: Vector2I, b: Vector2I): number {
    return a.x * b.x + a.y * b.y;
}

/**
 * The velocity after hitting a surface; unchanged when already moving away from it. `normal` is
 * the surface's unit normal, `restitution` how much of the speed along it comes back: 1 (the
 * default) bounces perfectly, 0 stops dead along the normal and keeps sliding.
 */
export function reflect(
    velocity: Vector2I,
    normal: Vector2I,
    restitution: number = 1,
): Vector2I {
    const along_normal = dot(velocity, normal);
    if (along_normal >= 0) {
        return { x: velocity.x, y: velocity.y };
    }
    const change = (1 + restitution) * along_normal;
    return {
        x: velocity.x - change * normal.x,
        y: velocity.y - change * normal.y,
    };
}

/**
 * Where two circles touch; the normal points from `b` to `a`, so moving `a` along it by `depth`
 * separates them. Null when apart, touching counts as apart. Two circles at the very same spot
 * have no direction between them and get the normal (1, 0).
 */
export function circle_contact(a: Circle, b: Circle): Contact | null {
    const delta_x = a.x - b.x;
    const delta_y = a.y - b.y;
    const reach = a.radius + b.radius;
    const distance_squared = delta_x * delta_x + delta_y * delta_y;
    if (distance_squared >= reach * reach) {
        return null;
    }
    const distance = Math.sqrt(distance_squared);
    if (distance === 0) {
        return { normal: { x: 1, y: 0 }, depth: reach };
    }
    return {
        normal: { x: delta_x / distance, y: delta_y / distance },
        depth: reach - distance,
    };
}

/**
 * Where a circle touches a box, using the closest point on the box; the normal points from the
 * box to the circle, so a box's corner gives a diagonal one. Null when apart. A circle whose
 * centre is inside the box leaves through the nearest edge.
 */
export function circle_rect_contact(
    circle: Circle,
    rect: RectI,
): Contact | null {
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const closest_x = Math.max(rect.left, Math.min(right, circle.x));
    const closest_y = Math.max(rect.top, Math.min(bottom, circle.y));
    const delta_x = circle.x - closest_x;
    const delta_y = circle.y - closest_y;
    const distance_squared = delta_x * delta_x + delta_y * delta_y;
    if (distance_squared > 0) {
        if (distance_squared >= circle.radius * circle.radius) {
            return null;
        }
        const distance = Math.sqrt(distance_squared);
        return {
            normal: { x: delta_x / distance, y: delta_y / distance },
            depth: circle.radius - distance,
        };
    }
    const exits = [
        { normal: { x: -1, y: 0 }, distance: circle.x - rect.left },
        { normal: { x: 1, y: 0 }, distance: right - circle.x },
        { normal: { x: 0, y: -1 }, distance: circle.y - rect.top },
        { normal: { x: 0, y: 1 }, distance: bottom - circle.y },
    ];
    let nearest = exits[0];
    for (const exit of exits) {
        if (exit.distance < nearest.distance) {
            nearest = exit;
        }
    }
    return {
        normal: nearest.normal,
        depth: circle.radius + nearest.distance,
    };
}

/**
 * The velocities after two bodies collide along `normal` (a unit vector, from `b` to `a`, as
 * `circle_contact` gives it), conserving momentum. `restitution` is how much of the closing
 * speed comes back: 1 (the default) loses nothing. Bodies already moving apart are unchanged.
 */
export function elastic_impact(
    a: Impactor,
    b: Impactor,
    normal: Vector2I,
    restitution: number = 1,
): { a: Vector2I; b: Vector2I } {
    const closing = dot(a.velocity, normal) - dot(b.velocity, normal);
    // Each body changes by the same impulse, divided by its own mass.
    const inverse_a = 1 / a.mass;
    const inverse_b = 1 / b.mass;
    const inverse_sum = inverse_a + inverse_b;
    if (closing >= 0 || inverse_sum === 0) {
        return {
            a: { x: a.velocity.x, y: a.velocity.y },
            b: { x: b.velocity.x, y: b.velocity.y },
        };
    }
    const impulse = (-(1 + restitution) * closing) / inverse_sum;
    return {
        a: {
            x: a.velocity.x + impulse * inverse_a * normal.x,
            y: a.velocity.y + impulse * inverse_a * normal.y,
        },
        b: {
            x: b.velocity.x - impulse * inverse_b * normal.x,
            y: b.velocity.y - impulse * inverse_b * normal.y,
        },
    };
}
