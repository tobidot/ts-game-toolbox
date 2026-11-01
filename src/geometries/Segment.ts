import { Line, LineI } from "./Line";
import { Vector2, Vector2I } from "./Vector2";

export type SegmentI = LineI;

/**
 * A `Segment` is a bounded portion of a `Line`: it shares `Line`'s
 * `point + t * direction` formula, but its `direction` is the raw
 * (non-normalized) `end - start` vector, and `get_segment_intersections()`
 * restricts both `t` and `u` to `[0, 1]`. See the class doc on `Line` for
 * how `Line`/`Ray`/`Segment` relate to each other.
 */
export class Segment extends Line {
    public constructor(start: Vector2I, end: Vector2I) {
        super(start, new Vector2(end).sub(start));
    }

    public static from_points(start: Vector2I, end: Vector2I): Segment {
        return new Segment(new Vector2(start), new Vector2(end));
    }

    /**
     * Create an independent copy of this segment.
     * Overridden because `Segment`'s constructor takes `start`/`end`, not
     * `point`/`direction` like `Line`'s - reusing `Line.cpy()` here would
     * silently return a plain `Line` and lose `get_segment_intersections()`.
     */
    public cpy(): Segment {
        return new Segment(
            this.point.cpy(),
            this.point.cpy().add(this.direction),
        );
    }

    public get_segment_intersections(other: Line): Array<Vector2> {
        const t = this.get_ray_projection(other);
        const u = other.get_ray_projection(this);
        if (t === null || u === null) {
            // parallel
            return [];
        }
        if (t > 1 || t < 0 || u > 1 || u < 0) {
            // outside of the segment's bounds
            return [];
        }
        return [this.get_vector_at(t)];
    }
}
