import { Line, LineI } from "./Line";
import { Segment } from "./Segment";
import { Vector2, Vector2I } from "./Vector2";
import type { PolygonI } from "./Polygon";

export type RayI = LineI;

/**
 * A single intersection between a ray and a polygon edge.
 */
export interface RayHitI {
    /**
     * The point in world space where the ray hit the polygon edge.
     */
    point: Vector2;
    /**
     * The distance along the ray's direction to the hit point.
     * (Assumes the ray's direction is normalized, e.g. via Ray.from_points)
     */
    distance: number;
    /**
     * The outward facing normal of the edge that was hit.
     */
    normal: Vector2;
}

/**
 * A `Ray` is a half-line: it shares `Line`'s `point + t * direction`
 * formula, but restricts `t` to `[0, ∞)`, i.e. it only extends forward from
 * `point` in the direction of `direction`. See the class doc on `Line` for
 * how `Line`/`Ray`/`Segment` relate to each other.
 */
export class Ray extends Line {
    public static from_points(start: Vector2I, end: Vector2I): Ray {
        return new Ray(
            new Vector2(start),
            new Vector2(end.x - start.x, end.y - start.y).normalize(),
        );
    }

    public cpy(): Ray {
        return new Ray(this.point, this.direction);
    }

    /**
     * Cast this ray against every edge of the given polygon and collect all hits,
     * sorted from nearest to farthest.
     * @param polygon The polygon to test against
     */
    public get_polygon_hit(polygon: PolygonI): Array<RayHitI> {
        const points = polygon.points;
        const hits: Array<RayHitI> = [];
        if (points.length < 2) {
            return hits;
        }

        for (let i = 0; i < points.length; i++) {
            const p1 = new Vector2(points[i]);
            const p2 = new Vector2(points[(i + 1) % points.length]);
            // Use the raw (non-normalized) edge segment, so the projected
            // parameter `u` maps cleanly onto the [0, 1] segment bounds.
            const edge = new Segment(p1, p2);

            const t = this.get_ray_projection(edge);
            if (t === null || t < 0) {
                continue;
            }
            const u = edge.get_ray_projection(this);
            if (u === null || u < 0 || u > 1) {
                continue;
            }

            const point = this.get_vector_at(t);
            const normal = new Vector2(
                edge.direction.y,
                -edge.direction.x,
            ).normalize();
            hits.push({ point, distance: t, normal });
        }

        hits.sort((a, b) => a.distance - b.distance);
        return hits;
    }

    /**
     * Cast this ray against the given polygon and return the nearest hit, if any.
     * @param polygon The polygon to test against
     */
    public get_nearest_polygon_hit(polygon: PolygonI): RayHitI | null {
        const hits = this.get_polygon_hit(polygon);
        return hits.length > 0 ? hits[0] : null;
    }
}
