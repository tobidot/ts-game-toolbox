import { PolygonI } from "../../geometries/Polygon";
import { Vector2I } from "../../geometries/Vector2";
import { Hit, WallHit } from "../aabb/Aabb";
import { Contact } from "../bounce/Bounce";

/**
 * The separating axis test for convex polygons, as pure functions like `aabb_*`: whether two
 * shapes touch now (`sat_overlap`), when a moving one meets a still one on the way
 * (`sat_sweep`), and where a mover ends up sliding along many (`sat_move`). Points are in
 * world space (y grows downwards), in either winding. Only convex polygons are supported:
 * a concave one is treated as if its dents were filled, so split it into convex parts.
 *
 * Two convex shapes are apart exactly when there is a line between them, and that line is
 * always parallel to one of their edges. So it is enough to look at the shapes' shadows on
 * the normal of every edge: if any pair of shadows doesn't overlap, the shapes don't either.
 * The axis where the shadows overlap least is the shortest way out. Swept, the same shadows
 * move along each axis at the projected speed, which is `aabb_sweep`'s slab test on more than
 * two axes, exact for a move without turning.
 */

/** How far `sat_move` keeps a mover off what it hit, in world units: invisible at pixel scale, far above rounding. */
export const SAT_SKIN = 0.01;

/**
 * A convex polygon with the unit normals of its edges. A shape that never turns has the same
 * axes wherever it goes, so they can be worked out once (`sat_shape`) instead of on every test;
 * `PhysicsBody` keeps them. The `sat_*_shapes` functions take this form, the others work out
 * the axes per call.
 */
export interface SatShape {
    readonly polygon: PolygonI;
    readonly axes: readonly Vector2I[];
}

/** Two unit axes this close to parallel count as one: invisible at any game's scale. */
const PARALLEL = 1e-9;

/**
 * The unit normals of the edges of `polygon`, each direction once: an edge parallel to an
 * earlier one (the other side of a box) has the same shadows and adds no axis.
 */
export function sat_axes(polygon: PolygonI): Vector2I[] {
    const axes: Vector2I[] = [];
    const points = polygon.points;
    for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length === 0) {
            continue;
        }
        const axis = {
            x: (from.y - to.y) / length,
            y: (to.x - from.x) / length,
        };
        const is_new = axes.every(
            (other) => Math.abs(axis.x * other.y - axis.y * other.x) > PARALLEL,
        );
        if (is_new) {
            axes.push(axis);
        }
    }
    return axes;
}

/** `polygon` with its axes worked out, for the `sat_*_shapes` functions. */
export function sat_shape(polygon: PolygonI): SatShape {
    return { polygon, axes: sat_axes(polygon) };
}

/** The shadow of a polygon on an axis. */
interface Shadow {
    min: number;
    max: number;
}

/** The shadow of `polygon` moved by `offset` on `axis`. */
function shadow(polygon: PolygonI, axis: Vector2I, offset: Vector2I): Shadow {
    let min = Infinity;
    let max = -Infinity;
    for (const point of polygon.points) {
        const along = point.x * axis.x + point.y * axis.y;
        min = Math.min(min, along);
        max = Math.max(max, along);
    }
    const shift = offset.x * axis.x + offset.y * axis.y;
    return { min: min + shift, max: max + shift };
}

const NOWHERE: Vector2I = { x: 0, y: 0 };

/**
 * Where `a` and `b` overlap: the smallest push that moves `a` out of `b`, as bounce's `Contact`
 * (`normal` a unit vector from `b` towards `a`, `depth` how far along it). Null when they are
 * apart; touching edges don't count, as in `aabb_overlaps`. Convex polygons only.
 */
export function sat_overlap(a: PolygonI, b: PolygonI): Contact | null {
    return sat_overlap_shapes(sat_shape(a), sat_shape(b));
}

/** `sat_overlap` on shapes whose axes are worked out already. */
export function sat_overlap_shapes(a: SatShape, b: SatShape): Contact | null {
    let best: Contact | null = null;
    for (const axes of [a.axes, b.axes]) {
        for (const axis of axes) {
            const of_a = shadow(a.polygon, axis, NOWHERE);
            const of_b = shadow(b.polygon, axis, NOWHERE);
            // `a` leaves along +axis by `forward`, along -axis by `backward`
            const forward = of_b.max - of_a.min;
            const backward = of_a.max - of_b.min;
            if (forward <= 0 || backward <= 0) {
                return null;
            }
            const depth = Math.min(forward, backward);
            if (best === null || depth < best.depth) {
                const sign = forward < backward ? 1 : -1;
                best = {
                    normal: { x: axis.x * sign, y: axis.y * sign },
                    depth,
                };
            }
        }
    }
    return best;
}

/**
 * Swept test: `mover` moving by `delta` against a still `wall`. Returns aabb's `Hit`: `time`
 * 0..1 of the move at which they first touch, `normal` the unit normal of the wall's face that
 * was hit (pointing away from the wall, towards the mover), and `overlap` the zero vector. Null
 * when the path misses, stops short, moves away or only grazes. Shapes that already overlap
 * are a hit at time 0 with the `sat_overlap` push as `overlap` and its direction as `normal`.
 * Exact for any speed, so nothing tunnels. When the shapes meet on two faces at once (a corner
 * on a corner), the first of the axes wins.
 */
export function sat_sweep(
    mover: PolygonI,
    delta: Vector2I,
    wall: PolygonI,
): Hit | null {
    return sat_sweep_shapes(sat_shape(mover), delta, sat_shape(wall));
}

/** `sat_sweep` on shapes whose axes are worked out already. */
export function sat_sweep_shapes(
    mover: SatShape,
    delta: Vector2I,
    wall: SatShape,
): Hit | null {
    return sweep(mover, NOWHERE, delta, wall);
}

/**
 * `sat_sweep` for `mover` moved by `offset` first. One pass over the axes finds both the
 * overlap now and the times the shadows meet and part on the way.
 */
function sweep(
    mover: SatShape,
    offset: Vector2I,
    delta: Vector2I,
    wall: SatShape,
): Hit | null {
    // the overlap now: the smallest push out, while every axis overlaps
    let is_inside = true;
    let depth = Infinity;
    let push: Vector2I = NOWHERE;
    // the swept test: when the shadows meet on every axis, and when they part on one
    let entry = -Infinity;
    let exit = Infinity;
    let normal: Vector2I | null = null;
    for (const axes of [mover.axes, wall.axes]) {
        for (const axis of axes) {
            const of_mover = shadow(mover.polygon, axis, offset);
            const of_wall = shadow(wall.polygon, axis, NOWHERE);
            const forward = of_wall.max - of_mover.min;
            const backward = of_mover.max - of_wall.min;
            if (forward <= 0 || backward <= 0) {
                is_inside = false;
            } else if (is_inside && Math.min(forward, backward) < depth) {
                depth = Math.min(forward, backward);
                const sign = forward < backward ? 1 : -1;
                push = { x: axis.x * sign, y: axis.y * sign };
            }
            const speed = delta.x * axis.x + delta.y * axis.y;
            if (speed === 0) {
                if (forward <= 0 || backward <= 0) {
                    // apart on this axis and never closer along it
                    return null;
                }
                continue;
            }
            const axis_entry =
                speed > 0
                    ? (of_wall.min - of_mover.max) / speed
                    : (of_wall.max - of_mover.min) / speed;
            const axis_exit =
                speed > 0
                    ? (of_wall.max - of_mover.min) / speed
                    : (of_wall.min - of_mover.max) / speed;
            if (axis_entry > entry) {
                entry = axis_entry;
                // the face the mover runs into faces against its motion
                const sign = speed > 0 ? -1 : 1;
                normal = { x: axis.x * sign, y: axis.y * sign };
            }
            exit = Math.min(exit, axis_exit);
        }
    }
    if (is_inside) {
        return {
            normal: push,
            time: 0,
            overlap: { x: push.x * depth, y: push.y * depth },
        };
    }
    if (normal === null || entry >= exit || entry < 0 || entry > 1) {
        return null;
    }
    return { normal, time: entry, overlap: { x: 0, y: 0 } };
}

/**
 * Moves `mover` by `delta` against many still `walls`, sliding along them like `aabb_move`:
 * the move stops at the first hit, the part of the rest that goes into that wall's face is
 * dropped, and the remainder is moved again, at most 3 passes. A mover that starts inside a
 * wall is pushed out first. It ends `SAT_SKIN` off every face it hit, so rounding never leaves
 * it inside. Returns how far the mover actually went (`mover` is not changed) and the hits in
 * order, each with its index in `walls`.
 */
export function sat_move(
    mover: PolygonI,
    delta: Vector2I,
    walls: readonly PolygonI[],
): { offset: Vector2I; hits: WallHit[] } {
    return sat_move_shapes(sat_shape(mover), delta, walls.map(sat_shape));
}

/** `sat_move` on shapes whose axes are worked out already. */
export function sat_move_shapes(
    mover: SatShape,
    delta: Vector2I,
    walls: readonly SatShape[],
): { offset: Vector2I; hits: WallHit[] } {
    const offset = { x: 0, y: 0 };
    const hits: WallHit[] = [];
    let remaining = { x: delta.x, y: delta.y };
    for (let pass = 0; pass < 3; pass++) {
        let first: Hit | null = null;
        let first_index = -1;
        for (let index = 0; index < walls.length; index++) {
            const hit = sweep(mover, offset, remaining, walls[index]);
            if (hit !== null && (first === null || hit.time < first.time)) {
                first = hit;
                first_index = index;
            }
        }
        if (first === null) {
            offset.x += remaining.x;
            offset.y += remaining.y;
            return { offset, hits };
        }
        hits.push({ ...first, wall: first_index });
        const normal = first.normal;
        offset.x +=
            remaining.x * first.time + first.overlap.x + normal.x * SAT_SKIN;
        offset.y +=
            remaining.y * first.time + first.overlap.y + normal.y * SAT_SKIN;
        const rest = {
            x: remaining.x * (1 - first.time),
            y: remaining.y * (1 - first.time),
        };
        const into = rest.x * normal.x + rest.y * normal.y;
        remaining =
            into < 0
                ? { x: rest.x - into * normal.x, y: rest.y - into * normal.y }
                : rest;
        if (Math.hypot(remaining.x, remaining.y) <= SAT_SKIN / 100) {
            return { offset, hits };
        }
    }
    return { offset, hits };
}
