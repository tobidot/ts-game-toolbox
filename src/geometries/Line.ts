import { MathHelper } from "../helpers/MathHelper";
import { Vector2, Vector2I } from "./Vector2";

export interface LineI {
    point: Vector2I;
    direction: Vector2I;
}

/**
 * `Line` is the most general of the three related geometry classes
 * (`Line`, `Ray`, `Segment`). It represents an infinite line defined by the
 * parametric formula:
 *   P(t) = point + t * direction
 * with `t` left completely unrestricted (`t` ∈ (-∞, ∞)).
 *
 * `Ray` extends `Line` and additionally restricts `t` to `[0, ∞)` (a
 * half-line starting at `point`, going forward in `direction`), while
 * `Segment` extends `Line` and restricts `t` to `[0, 1]` (a bounded portion
 * between two points). This matches the common mathematical convention
 * where a line is the most general/unbounded of the three, a ray is a
 * half-bounded specialization of it, and a segment is the fully bounded
 * specialization.
 *
 * Being a line/ray/segment is purely about that `t` restriction, not about
 * whether `direction` happens to be normalized - normalizing `direction`
 * only changes what a given `t` *means* (a world-space distance vs. a
 * multiple of the original vector), it has no bearing on the shape's
 * bounds.
 */
export class Line {
    public point: Vector2;
    public direction: Vector2;

    public constructor(point: Vector2I, direction: Vector2I) {
        this.point = new Vector2(point);
        this.direction = new Vector2(direction);
    }

    public static from_points(start: Vector2I, end: Vector2I): Line {
        return new Line(
            new Vector2(start),
            new Vector2(end.x - start.x, end.y - start.y).normalize(),
        );
    }

    /**
     * Create an independent copy of this line.
     *
     * Note: subclasses that use a different constructor signature (e.g.
     * `Segment`, which takes `start`/`end` instead of `point`/`direction`)
     * must override this, otherwise the copy would silently downgrade to a
     * plain `Line` and lose subclass-specific methods.
     */
    public cpy(): Line {
        return new Line(this.point, this.direction);
    }

    /**
     * Get the point at parameter `t` along the line, i.e. `point + t * direction`.
     * When `direction` is normalized (e.g. via `Line.from_points`), `t` is a
     * world-space distance; otherwise (e.g. on a `Segment`) it is a fraction
     * of `direction`'s own length.
     * @param t
     */
    public get_vector_at(t: number): Vector2 {
        return this.point.cpy().add(this.direction.cpy().mul(t));
    }

    /**
     * Project a point onto this line and return the `t` parameter such
     * that `this.get_vector_at(t)` yields the closest point on the
     * infinite line through `point`/`direction` to `other`.
     *
     * This divides by `direction.len2()` (not `direction.len()`), so it
     * returns a correct, directly reusable `t` regardless of whether
     * `direction` is normalized - e.g. it also works for `Segment`, whose
     * `direction` is the raw, non-normalized `end - start` vector.
     */
    public get_vector_projection(other: Vector2I): number {
        const diff = new Vector2(other).sub(this.point);
        const dot = this.direction.dot(diff);
        return dot / this.direction.len2();
    }

    public get_ray_projection(other: Line): number | null {
        // Line defintion
        // L1(t) = P1 + t * D1
        // L2(u) = P2 + u * D2

        // Equal them
        // P1 + t * D1 = P2 + u * D2
        // t * D1 - u * D2 = P2 - P2

        // To Matrix
        // t * d1x - u * d2x = p2x - p1x
        // t * d1y - u * d2y = p2y - p1y
        // [d1x -d2x] * [t] = [p2x - p1x]
        // [d1y -d2y]   [u]   [p2y - p1y]

        // Cramer
        // A * v = b    => t = det(At) / det(A)
        // with
        // v = [t]
        //     [u]
        // b = [(p2x-p1x)]
        //     [(p2y-p1y)]
        // A = [d1x -d2x]
        //     [d1y -d2y]
        // At = [(p2x-p1x) -d2x]
        //      [(p2y-p1y) -d2y]

        // det(A) = (d1x * -d2y) - (d1y * -d2x)
        // det(At) = ((p2x-p1x) * -d2y) - ((p2y-p1y) * -d2x)
        // t = ((d1x * -d2y) - (d1y * -d2x)) / (((p2x-p1x) * -d2y) - ((p2y-p1y) * -d2x))

        const det_a =
            this.direction.x * -other.direction.y -
            this.direction.y * -other.direction.x;

        if (MathHelper.float_equals(det_a, 0)) {
            // no intersection, because lines are parallel
            return null;
        }

        const det_at =
            (other.point.x - this.point.x) * -other.direction.y -
            (other.point.y - this.point.y) * -other.direction.x;
        return det_at / det_a;
    }

    public get_ray_intersections(other: Line): Array<Vector2> {
        const t = this.get_ray_projection(other);
        if (t === null) {
            return [];
        }
        return [this.get_vector_at(t)];
    }
}
