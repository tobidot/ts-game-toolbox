import { Rect } from "./Rect";
import { Segment } from "./Segment";
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

    public get lines(): Array<Segment> {
        if (this.points.length < 2) {
            return [];
        }
        const lines: Array<Segment> = [];
        for (let i = 1; i <= this.points.length; ++i) {
            const a = this.points[i - 1];
            const b = this._points[i % this.points.length];
            lines.push(new Segment(a, b));
        }
        return lines;
    }

    /**
     * The smallest rect around the points: what to ask a `QuadTree` for
     * before testing `contains()` on what it returns.
     */
    public get bounding_rect(): Rect {
        if (this._points.length === 0) {
            return new Rect({ left: 0, top: 0, width: 0, height: 0 });
        }
        const xs = this._points.map((point) => point.x);
        const ys = this._points.map((point) => point.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        return new Rect({
            left,
            top,
            width: Math.max(...xs) - left,
            height: Math.max(...ys) - top,
        });
    }

    /**
     * Is the point inside? Counts the edges a line going right from the point
     * crosses: an odd number means inside. An edge counts when one of its ends
     * lies above the point and the other doesn't, so a corner counts once for
     * a line passing through and not at all for one that only grazes it.
     */
    public contains(point: Vector2I): boolean {
        const points = this._points;
        let is_inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i];
            const b = points[j];
            if (a.y > point.y !== b.y > point.y) {
                const x = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
                if (point.x < x) {
                    is_inside = !is_inside;
                }
            }
        }
        return is_inside;
    }
}
