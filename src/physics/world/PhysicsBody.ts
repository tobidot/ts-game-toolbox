import { PolygonI } from "../../geometries/Polygon";
import { RectI } from "../../geometries/Rect";
import { Vector2I } from "../../geometries/Vector2";
import { ShapeAt } from "./CollisionRule";

/** What `PhysicsWorld.add()` takes. */
export interface BodyOptions<D> {
    /** A convex polygon around the body's own origin, which is where `position` puts it. */
    shape: PolygonI;
    position: Vector2I;
    /** Units per second. Default: still. */
    velocity?: Vector2I;
    /** A still body never moves: a floor, a wall, a ramp. Default: false. */
    is_static?: boolean;
    /** Only the ratio between two bodies matters. Default: 1, and `Infinity` for a still body. */
    mass?: number;
    /** Whatever the game wants back from an event: its own object, a kind, a number. */
    data?: D;
}

/**
 * One body of a `PhysicsWorld`: a convex shape that translates and never turns. The game may
 * write `position` and `velocity` between steps; `polygon` and `box` follow on their next read.
 * A still body stays where it was added.
 */
export class PhysicsBody<D = unknown> implements ShapeAt {
    /** The shape around the body's own origin, as it was added. */
    public readonly shape: PolygonI;
    /** Where the shape's origin is, in world units. */
    public readonly position: Vector2I;
    /** Units per second. */
    public velocity: Vector2I;
    public readonly is_static: boolean;
    public readonly mass: number;
    public data: D;
    /** False once `PhysicsWorld.remove()` took it out. */
    public is_in_world = true;
    /** The shape's box around its own origin. */
    private readonly local_box: RectI;
    private readonly world_polygon: PolygonI;
    private readonly world_box: RectI;
    /** Where `world_polygon` was last placed; NaN forces the first placement. */
    private placed_x = NaN;
    private placed_y = NaN;

    public constructor(options: BodyOptions<D>) {
        const points = options.shape.points;
        if (points.length < 3) {
            throw new Error("PhysicsBody: a shape needs at least 3 points");
        }
        this.shape = {
            points: points.map((point) => ({ x: point.x, y: point.y })),
        };
        this.position = { x: options.position.x, y: options.position.y };
        const velocity = options.velocity ?? { x: 0, y: 0 };
        this.velocity = { x: velocity.x, y: velocity.y };
        this.is_static = options.is_static ?? false;
        this.mass = this.is_static ? Infinity : (options.mass ?? 1);
        this.data = options.data as D;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const point of points) {
            left = Math.min(left, point.x);
            top = Math.min(top, point.y);
            right = Math.max(right, point.x);
            bottom = Math.max(bottom, point.y);
        }
        this.local_box = {
            left,
            top,
            width: right - left,
            height: bottom - top,
        };
        this.world_polygon = {
            points: points.map(() => ({ x: 0, y: 0 })),
        };
        this.world_box = { ...this.local_box };
    }

    /** The shape where the body is now, in world units. The same object every time: copy it to keep it. */
    public get polygon(): PolygonI {
        this.place();
        return this.world_polygon;
    }

    /** The box around `polygon`. The same object every time: copy it to keep it. */
    public get box(): RectI {
        this.place();
        return this.world_box;
    }

    /** Moves the cached shape and box to `position`, when it changed since the last read. */
    private place(): void {
        const x = this.position.x;
        const y = this.position.y;
        if (x === this.placed_x && y === this.placed_y) {
            return;
        }
        this.placed_x = x;
        this.placed_y = y;
        const local = this.shape.points;
        const placed = this.world_polygon.points;
        for (let index = 0; index < local.length; index++) {
            placed[index].x = local[index].x + x;
            placed[index].y = local[index].y + y;
        }
        this.world_box.left = this.local_box.left + x;
        this.world_box.top = this.local_box.top + y;
    }
}
