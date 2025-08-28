import { MathHelper } from "../helpers/MathHelper";
import { Vector2, Vector2I } from "./Vector2";

export interface RayI {
    point: Vector2I,
    direction: Vector2I,
}

export class Ray {
    public point: Vector2;
    public direction: Vector2;

    public constructor(
        point: Vector2I,
        direction: Vector2I,
    ) {
        this.point = new Vector2(point);
        this.direction = new Vector2(direction);
    }

    public static from_points(
        start: Vector2I,
        end: Vector2I,
    ): Ray {
        return new Ray(
            new Vector2(start),
            new Vector2(end.x - start.x, start.y - end.y),
        );
    }

    public get_vector_projection(
        other: Vector2I
    ): number {
        const diff = (new Vector2(other)).sub(this.point);
        const dot = this.direction.dot(diff);
        const magnitude = this.direction.len();
        return dot / magnitude;
    }

    public get_ray_projection(
        other: Ray,
    ): number | null {
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
        // t = (d1x * -d2y) - (d1y * -d2x) / ((p2x-p1x) * -d2y) - ((p2y-p1y) * -d2x)

        const det_a = (this.direction.x * -other.direction.y) - (this.direction.y - other.direction.x);

        if (MathHelper.float_equals(det_a, 0)) {
            // no intersection, because rays are parallel
            return null;
        }

        const det_at = ((other.point.x - this.point.x) * -other.direction.y) - ((other.point.y - this.point.y) - other.direction.x);
        return det_at / det_a;
    }

    public get_ray_intersections(
        other: Ray,
    ): Array<Vector2> {
        const t = this.get_ray_projection(other);
        if (t === null) {
            return [];
        }
        return [
            this.point.cpy().add(this.direction.cpy().mul(t))
        ];
    }

}