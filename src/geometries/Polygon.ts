import { Line } from "./Line";
import { Ray } from "./Ray";
import { Vector2, Vector2I } from "./Vector2";

export interface PolygonI {
    points: Array<Vector2I>;
}

export class Polygon implements PolygonI {
    protected _points: Array<Vector2> = [];

    public constructor(points: Array<Vector2I>) {
        this.points = points;
    }

    public set points(points: Array<Vector2I>) {
        this._points = points.map((p) => new Vector2(p));
    }

    public get points(): Array<Vector2I> {
        return this._points;
    }

    public get lines(): Array<Line> {
        if (this.points.length < 2) {
            return [];
        }
        const lines: Array<Line> = [];
        for (let i = 1; i <= this.points.length; ++i) {
            const a = this.points[i - 1];
            const b = this._points[i % this.points.length];
            lines.push(new Line(a, b));
        }
        return lines;
    }

    /**
     * Check if a point is inside this polygone via even/odd rule
     * @param point
     */
    public contains(point: Vector2I): boolean {
        // const random_point = new Vector2(0, 0);
        const direction = new Vector2(0.66, 0.66); // Vector2.from_angle(Math.random() + Math.PI * 2)
        const ray = new Ray(point, direction);
        // cast a ray from a random point and count the crosssections with all lines of the plygone
        // if an even number of lines are crossed it is outside the polygone
        const lines = this.lines;
        let hits = 0;
        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i];
            const t = ray.get_ray_projection(line);
            const u = line.get_ray_projection(ray);
            if (t !== null && u !== null && t >= 0 && u >= 0 && u < 1) {
                hits++;
            }
        }
        // if it is odd it is inside
        return hits % 2 === 1;
    }
}
