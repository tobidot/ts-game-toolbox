import {Vector2, Vector2I} from "./Vector2";

export interface RectI {
    x: number,
    y: number,
    w: number,
    h: number
}

/**
 * @class Rect
 * A helper class for Rectangles
 */
export class Rect implements RectI {
    public constructor(public x: number = 0, public y: number = 0, public w: number = 0, public h: number = 0) {

    }

    public get left(): number {
        return this.x;
    }

    public get_left(): number {
        return this.x;
    }

    public get top(): number {
        return this.y;
    }

    public get_top(): number {
        return this.y;
    }

    public get right(): number {
        return this.x + this.w;
    }

    public get_right(): number {
        return this.x + this.w;
    }

    public get_bottom(): number {
        return this.y + this.h;
    }

    public get bottom(): number {
        return this.y + this.h;
    }

    public get width(): number {
        return this.w;
    }

    public get_width(): number {
        return this.w;
    }

    public get height(): number {
        return this.h;
    }

    public get_height(): number {
        return this.h;
    }

    public cpy(): Rect {
        return new Rect(this.x, this.y, this.w, this.h);
    }

    public set(x: RectI): this;
    public set(x: number, y: number, w?: number, h?: number): this;
    public set(x: number | RectI, y?: number, w?: number, h?: number): this {
        if (typeof x === "object") {
            this.x = x.x;
            this.y = x.y;
            this.w = x.w;
            this.h = x.h;
        } else {
            this.x = x;
            this.y = y as number;
            if (w !== undefined) this.w = w;
            if (h !== undefined) this.h = h;
        }
        return this;
    }

    /**
     * Secondary properties
     */

    public get_area(): number {
        return this.w * this.h;
    }

    public get center(): Vector2I {
        return new Vector2(this.x + this.w / 2, this.y + this.h / 2);
    }

    public set center(center: Vector2I) {
        this.x = center.x - this.w / 2;
        this.y = center.y - this.h / 2;
    }

    public set_center(center: Vector2I): this {
        this.center = center;
        return this;
    }


    /**
     * Expand this rectangle to include the given target.
     * @param target
     */
    public expand_to(target: Readonly<Vector2I>): this {
        if (this.contains(target)) return this;
        const left = Math.min(this.x, target.x);
        const top = Math.min(this.y, target.y);
        const right = Math.max(this.get_right(), target.x);
        const bottom = Math.max(this.get_bottom(), target.y);
        return this.set(left, top, right - left, bottom - top);
    }

    public overlaps_with(other: RectI): boolean {
        return Rect.overlap(this, other);
    }

    public is_within(outer: RectI): boolean {
        return Rect.is_within(this, outer);
    }

    public contains(point: Vector2I): boolean;
    public contains(x: number, y: number): boolean;
    public contains(x: number | Vector2I, y?: number): boolean {
        if (typeof x === "object") {
            return Rect.contains(this, x);
        }
        if (typeof y !== "number") throw new Error("Unexpected type error");
        return Rect.contains(this, {x, y});
    }

    /**
     * Manipulate this rectangle to change into the target rectangle by the factor t.
     *
     * @param target
     * @param t
     *  0 => rectangle is unchanged
     *  ..
     *  1 => the rectangle is identical to the target rectangle.
     */
    public lerp(target: Rect, t: number): this {
        const it = 1 - t;
        this.x = this.x * it + target.x * t;
        this.y = this.y * it + target.y * t;
        this.w = this.w * it + target.w * t;
        this.h = this.h * it + target.h * t;
        return this;
    }

    /**
     * This functions returns the corners of this rectangle in clockwise order.
     * Starting with the left-top one.
     *
     * @returns array
     * [ left_top, right_top, right_bottom, left_bottom ]
     */
    public get_corners(): [Vector2I, Vector2I, Vector2I, Vector2I] {
        return [
            {x: this.left, y: this.top},
            {x: this.right, y: this.top},
            {x: this.right, y: this.bottom},
            {x: this.left, y: this.bottom},
        ];
    }


    /**
     * ### static function
     */

    /**
     * Is the given point inside the rectangle.
     * The borders of the rectangle count as inside.
     * @see Rect.contains_exclusive
     *
     * @param rect
     *  The rectangle defining the boundry
     * @param point
     *  The point to check
     * @return boolean
     *  True => the point is inside
     */
    public static contains(rect: RectI, point: Vector2I): boolean {
        return (point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.w && point.y <= rect.y + rect.h);
    }

    /**
     * Is the given point inside the rectangle.
     * The borders of the rectangle count as outside.
     * @see Rect.contains
     *
     * @param rect
     *  The rectangle bilding the boundry
     * @param point
     *  The point to check
     * @return boolean
     *  True => the point is inside
     */
    public static contains_exclusive(rect: RectI, point: Vector2I): boolean {
        return (point.x > rect.x && point.y > rect.y && point.x < rect.x + rect.w && point.y < rect.y + rect.h);
    }

    /**
     * Do theses Rectangles overlap
     * @param a
     * @param b
     */
    public static overlap(a: RectI, b: RectI): boolean {
        const overlap_x = (a.x + a.w > b.x && a.x <= b.x) || (b.x + b.w > a.x && b.x <= a.x);
        const overlap_y = (a.y + a.h > b.y && a.y <= b.y) || (b.y + b.h > a.y && b.y <= a.y);
        return overlap_x && overlap_y;
    }

    /**
     * Is the inner rectangle completly within the outer rectangle.
     *
     * @param inner
     * @param outer
     */
    public static is_within(inner: RectI, outer: RectI) {
        const within_x = inner.x > outer.x && inner.x + inner.w < outer.x + outer.w;
        const within_y = inner.y > outer.y && inner.y + inner.h < outer.y + outer.h;
        return within_x && within_y;
    }
}
