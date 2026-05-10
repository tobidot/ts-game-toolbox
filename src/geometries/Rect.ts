import { Vector2, Vector2I } from "./Vector2";

export interface RectI {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * @class Rect
 * A helper class for Rectangles
 */
export class Rect implements RectI {
    public left: number = 0;
    public top: number = 0;
    public width: number = 0;
    public height: number = 0;

    public constructor(other: RectI);
    public constructor(
        left: number,
        top: number,
        width: number,
        height: number,
    );
    public constructor(
        left?: RectI | number,
        top?: number,
        width?: number,
        height?: number,
    ) {
        if (left !== undefined) {
            if (typeof left === "number") {
                this.set(
                    left,
                    top as number,
                    width as number,
                    height as number,
                );
            } else {
                this.set(left);
            }
        }
    }

    public get_left(): number {
        return this.left;
    }

    public get_top(): number {
        return this.top;
    }

    public get right(): number {
        return this.left + this.width;
    }

    public get_right(): number {
        return this.left + this.width;
    }

    public get_bottom(): number {
        return this.top + this.height;
    }

    public get bottom(): number {
        return this.top + this.height;
    }

    public get_width(): number {
        return this.width;
    }

    public get_height(): number {
        return this.height;
    }

    public cpy(): Rect {
        return new Rect(this);
    }

    public set(other: RectI): this;
    public set(left: number, top: number, width: number, height: number): this;
    public set(
        left: number | RectI,
        top?: number,
        width?: number,
        height?: number,
    ): this {
        if (typeof left === "object") {
            this.left = left.left;
            this.top = left.top;
            this.width = left.width;
            this.height = left.height;
        } else {
            this.left = left;
            this.top = top as number;
            if (width !== undefined) this.width = width;
            if (height !== undefined) this.height = height;
        }
        return this;
    }

    /**
     * Secondary properties
     */

    public get_area(): number {
        return this.width * this.height;
    }

    public get center(): Vector2I {
        return new Vector2(
            this.left + this.width / 2,
            this.top + this.height / 2,
        );
    }

    public set center(center: Vector2I) {
        this.left = center.x - this.width / 2;
        this.top = center.y - this.height / 2;
    }

    public set_center(center: Vector2I): this {
        this.center = center;
        return this;
    }

    public move(offset: Vector2I): this {
        this.left += offset.x;
        this.top += offset.y;
        return this;
    }

    /**
     * Expand this rectangle to include the given target.
     * @param target
     */
    public expand_to(target: Readonly<Vector2I>): this {
        if (this.contains(target)) return this;
        const left = Math.min(this.left, target.x);
        const top = Math.min(this.top, target.y);
        const right = Math.max(this.get_right(), target.x);
        const bottom = Math.max(this.get_bottom(), target.y);
        return this.set(left, top, right - left, bottom - top);
    }

    /**
     * Check if this rectangle intersects with another.
     * @param other The other rectangle to check against
     */
    public intersects(other: RectI): boolean {
        return Rect.intersects(this, other);
    }

    public overlaps_with(other: RectI): boolean {
        return Rect.intersects(this, other);
    }

    public is_within(outer: RectI): boolean {
        return Rect.is_within(this, outer);
    }

    /**
     * Check if a point or another rectangle is within this rectangle.
     */
    public contains(point: Vector2I): boolean;
    public contains(x: number, y: number): boolean;
    public contains(x: number | Vector2I, y?: number): boolean {
        if (typeof x === "object") {
            return Rect.contains(this, x);
        }
        if (typeof y !== "number") throw new Error("Unexpected type error");
        return Rect.contains(this, { x, y });
    }

    /**
     * Linearly interpolate this rectangle towards a target.
     * @param target The target rectangle
     * @param t The interpolation factor (0 to 1)
     * @returns this for chaining
     */
    public lerp(target: Rect, t: number): this {
        const it = 1 - t;
        this.left = this.left * it + target.left * t;
        this.top = this.top * it + target.top * t;
        this.width = this.width * it + target.width * t;
        this.height = this.height * it + target.height * t;
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
            { x: this.left, y: this.top },
            { x: this.right, y: this.top },
            { x: this.right, y: this.bottom },
            { x: this.left, y: this.bottom },
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
        return (
            point.x >= rect.left &&
            point.y >= rect.top &&
            point.x <= rect.left + rect.width &&
            point.y <= rect.top + rect.height
        );
    }

    public static contains_exclusive(rect: RectI, point: Vector2I): boolean {
        return (
            point.x > rect.left &&
            point.y > rect.top &&
            point.x < rect.left + rect.width &&
            point.y < rect.top + rect.height
        );
    }

    public static intersects(a: RectI, b: RectI): boolean {
        const overlap_x =
            (a.left + a.width > b.left && a.left <= b.left) ||
            (b.left + b.width > a.left && b.left <= a.left);
        const overlap_y =
            (a.top + a.height > b.top && a.top <= b.top) ||
            (b.top + b.height > a.top && b.top <= a.top);
        return overlap_x && overlap_y;
    }

    public static is_within(inner: RectI, outer: RectI) {
        const within_x =
            inner.left > outer.left &&
            inner.left + inner.width < outer.left + outer.width;
        const within_y =
            inner.top > outer.top &&
            inner.top + inner.height < outer.top + outer.height;
        return within_x && within_y;
    }
}
