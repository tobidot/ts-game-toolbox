import { Ray } from "./Ray";
import { Vector2, Vector2I } from "./Vector2";

export interface LineI {
    point: Vector2I,
    direction: Vector2I,
}

export class Line extends Ray {
    public constructor(
        start: Vector2I,
        end: Vector2I,
    ) {
        super(start, new Vector2(end).sub(start));
    }

    public static from_points(
        start: Vector2I,
        end: Vector2I,
    ): Line {
        return new Line(
            new Vector2(start),
            new Vector2(end.x - start.x, start.y - end.y),
        );
    }

    public get_line_intersections(
        other: Ray,
    ): Array<Vector2> {
        const t = this.get_ray_projection(other);
        const u = other.get_ray_projection(this);
        if (t === null || u === null) {
            // parallel
            return [];
        }
        if (t > 1 || t < 0 || u > 1 || u < 0) {
            // outside of line segment
            return [];
        }
        return [
            this.point.cpy().add(this.direction.cpy().mul(t))
        ];
    }

}
