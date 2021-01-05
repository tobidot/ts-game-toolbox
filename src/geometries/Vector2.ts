type radians = number;
type degrees = number;

export interface Vector2I {
    x: number;
    y: number;
}

export class Vector2 {
    public x: number;
    public y: number;

    public constructor(vec: Readonly<Vector2I>)
    public constructor(x?: number, y?: number)
    public constructor(x: number | Readonly<Vector2I> = 0, y: number = 0) {
        if (typeof x === "object") {
            this.x = x.x;
            this.y = x.y;
        } else {
            this.x = x;
            this.y = y;
        }
    }

    public set(vec: Readonly<Vector2I>): this
    public set(x: number, y: number): this
    public set(x: number | Readonly<Vector2I>, y: number = 0): this {
        if (typeof x === "object") {
            this.x = x.x;
            this.y = x.y;
        } else {
            this.x = x;
            this.y = y;
        }
        return this;
    }

    public sub(other: Vector2I): this {
        this.x -= other.x;
        this.y -= other.y;
        return this;
    }

    public add(other: Vector2I): this {
        this.x += other.x;
        this.y += other.y;
        return this;
    }

    public mul(scalar: number): this {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }

    public divide(scalar: number): this {
        this.x /= scalar;
        this.y /= scalar;
        return this;
    }

    public len2(): number {
        return this.x * this.x + this.y * this.y;
    }

    public len(): number {
        return Math.sqrt(this.len2());
    }

    public set_magnitude(magnitude: number): this {
        const len = this.len();
        this.x = this.x / len * magnitude;
        this.y = this.y / len * magnitude;
        return this;
    }

    public dot(other: Vector2I): number {
        return this.x * other.x + this.y * other.y;
    }

    public cross(other: Vector2I): Vector2 {
        return new Vector2(this.x * other.y, this.y * other.x);
    }

    public get_unsigned(): Vector2 {
        return new Vector2(Math.abs(this.x), Math.abs(this.y));
    }

    public cpy(): Vector2 {
        return new Vector2(this.x, this.y);
    }

    public normalize(): this {
        const len = this.len();
        if (len < 0.000001) return this;
        this.x /= len;
        this.y /= len;
        return this;
    }

    public get_projection_of(other: Vector2I): Vector2 {
        const len = this.dot(other) / this.len2();
        return this.cpy().mul(len);
    }

    public is_null_vector(): boolean {
        return Math.abs(this.x) < 0.001 && Math.abs(this.y) < 0.001;
    }

    public get_angle(): radians {
        // let 0 be showing up (0,1)
        return (Math.atan2(this.y, this.x) + (Math.PI / 2)) % (2 * Math.PI);
    }

    public rotate_radians_clockwise(radians: number): this {
        const sin = Math.sin(radians);
        const cos = Math.cos(radians);
        const new_x = -sin * this.y + cos * this.x;
        const new_y = sin * this.x + cos * this.y;
        this.y = new_y;
        this.x = new_x;
        return this;
    }

    public rotate_right_angles_clockwise(count: number = 1): this {
        if (count < 1) return this;
        const new_x = this.y;
        this.y = -this.x;
        this.x = new_x;
        return this.rotate_right_angles_clockwise(count - 1);
    }

    /**
     * ### Static methods
     */

    /**
     * Standard Vectors
     */
    public static readonly RIGHT = new Vector2(1, 0);
    public static readonly LEFT = new Vector2(-1, 0);
    public static readonly UP = new Vector2(0, -1);
    public static readonly DOWN = new Vector2(0, 1);

    /**
     * Create a Vector2 from an angle and a length.
     * An angle of 0 points to the right, turning clockwise.
     *
     * @param angle
     * @param length
     */
    public static from_angle(angle: radians, length: number = 1): Vector2 {
        return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
    }

}