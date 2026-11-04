import { PhysicsBody } from "./PhysicsBody";
import { RectI } from "../../geometries/Rect";
import { Vector2I } from "../../geometries/Vector2";

/**
 * A small time-of-impact result for a swept-AABB test.
 */
export interface SweptAabbResult {
    /**
     * The fraction (0..1) of the tested movement at which the collision occurs.
     */
    time: number;
    /**
     * The surface normal of the static box at the point of impact.
     */
    normal: Vector2I;
}

/**
 * A minimal physics world implementing swept-AABB collision resolution.
 *
 * Each body's `shape` is treated as an axis-aligned bounding box, derived
 * from the min/max of its polygon points and offset by its `position`.
 * Fast moving bodies are swept against static bodies so that they can not
 * tunnel through thin obstacles, no matter how large their velocity/dt is.
 */
export class SweepingSatWorld {
    public bodies: Array<PhysicsBody<void>> = [];

    constructor() {}

    /**
     * Get the axis-aligned bounding box of a body in world space.
     * @param body
     */
    public get_aabb(body: PhysicsBody<void>): RectI {
        const points = body.shape.points;
        let min_x = Infinity;
        let min_y = Infinity;
        let max_x = -Infinity;
        let max_y = -Infinity;
        for (const point of points) {
            min_x = Math.min(min_x, point.x);
            min_y = Math.min(min_y, point.y);
            max_x = Math.max(max_x, point.x);
            max_y = Math.max(max_y, point.y);
        }
        return {
            left: body.position.x + min_x,
            top: body.position.y + min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        };
    }

    /**
     * Standard swept-AABB "time of impact" test.
     *
     * Expands the static box by the size of the moving box, which turns the
     * problem into a ray-vs-box intersection, then finds the entry/exit time
     * of the ray on both axes (slab method).
     *
     * @param moving_box The bounding box of the moving body, before movement is applied
     * @param velocity The movement vector to apply this frame (already multiplied by dt)
     * @param static_box The bounding box of the static obstacle
     * @returns
     *  The fraction of `velocity` (0..1) at which the boxes first touch, and
     *  the normal of the surface that was hit, or `null` when there is no
     *  collision within this frame's movement.
     */
    public sweep_aabb(
        moving_box: RectI,
        velocity: Vector2I,
        static_box: RectI,
    ): SweptAabbResult | null {
        const expanded_box: RectI = {
            left: static_box.left - moving_box.width,
            top: static_box.top - moving_box.height,
            width: static_box.width + moving_box.width,
            height: static_box.height + moving_box.height,
        };
        const origin: Vector2I = { x: moving_box.left, y: moving_box.top };

        let entry_x: number;
        let exit_x: number;
        if (velocity.x === 0) {
            if (
                origin.x <= expanded_box.left ||
                origin.x >= expanded_box.left + expanded_box.width
            ) {
                return null;
            }
            entry_x = -Infinity;
            exit_x = Infinity;
        } else {
            const t1 = (expanded_box.left - origin.x) / velocity.x;
            const t2 =
                (expanded_box.left + expanded_box.width - origin.x) /
                velocity.x;
            entry_x = Math.min(t1, t2);
            exit_x = Math.max(t1, t2);
        }

        let entry_y: number;
        let exit_y: number;
        if (velocity.y === 0) {
            if (
                origin.y <= expanded_box.top ||
                origin.y >= expanded_box.top + expanded_box.height
            ) {
                return null;
            }
            entry_y = -Infinity;
            exit_y = Infinity;
        } else {
            const t1 = (expanded_box.top - origin.y) / velocity.y;
            const t2 =
                (expanded_box.top + expanded_box.height - origin.y) /
                velocity.y;
            entry_y = Math.min(t1, t2);
            exit_y = Math.max(t1, t2);
        }

        const entry_time = Math.max(entry_x, entry_y);
        const exit_time = Math.min(exit_x, exit_y);

        if (entry_time > exit_time || entry_time < 0 || entry_time > 1) {
            return null;
        }

        const normal: Vector2I = { x: 0, y: 0 };
        if (entry_x > entry_y) {
            normal.x = velocity.x > 0 ? -1 : 1;
        } else {
            normal.y = velocity.y > 0 ? -1 : 1;
        }

        return { time: entry_time, normal };
    }

    /**
     * Advance the simulation by `dt` seconds.
     *
     * Non-static bodies are moved by `velocity * dt`. Before committing the
     * movement, it is swept against every static body to find the earliest
     * time of impact. When a collision is found, the body is only moved up
     * to (just before) that point in time and the velocity component along
     * the collision normal is zeroed out, which is what prevents fast
     * bodies from tunnelling through thin static obstacles.
     *
     * @param dt Elapsed time in seconds
     */
    public update(dt: number): void {
        const epsilon = 0.0001;
        const static_bodies = this.bodies.filter((body) => body.is_static);
        for (const body of this.bodies) {
            if (body.is_static) {
                continue;
            }
            const movement: Vector2I = {
                x: body.velocity.x * dt,
                y: body.velocity.y * dt,
            };
            if (movement.x === 0 && movement.y === 0) {
                continue;
            }

            const moving_box = this.get_aabb(body);
            let earliest_hit: SweptAabbResult | null = null;
            for (const static_body of static_bodies) {
                const static_box = this.get_aabb(static_body);
                const hit = this.sweep_aabb(moving_box, movement, static_box);
                if (
                    hit !== null &&
                    (earliest_hit === null || hit.time < earliest_hit.time)
                ) {
                    earliest_hit = hit;
                }
            }

            if (earliest_hit === null) {
                body.position.x += movement.x;
                body.position.y += movement.y;
                continue;
            }

            const safe_time = Math.max(0, earliest_hit.time - epsilon);
            body.position.x += movement.x * safe_time;
            body.position.y += movement.y * safe_time;
            if (earliest_hit.normal.x !== 0) {
                body.velocity.x = 0;
            }
            if (earliest_hit.normal.y !== 0) {
                body.velocity.y = 0;
            }
        }
    }
}
