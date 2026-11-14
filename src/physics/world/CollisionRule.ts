import { PolygonI } from "../../geometries/Polygon";
import { RectI } from "../../geometries/Rect";
import { Vector2I } from "../../geometries/Vector2";
import { aabb_move, aabb_overlaps, aabb_resolve, WallHit } from "../aabb/Aabb";
import { Contact } from "../bounce/Bounce";
import { sat_move_shapes, sat_overlap_shapes } from "../sweeping_sat/Sat";

/**
 * A shape where it is now: its points in world space, the box around them, and the unit
 * normals of its edges (`sat_axes`), which stay the same as long as it doesn't turn.
 */
export interface ShapeAt {
    readonly polygon: PolygonI;
    readonly box: RectI;
    readonly axes: readonly Vector2I[];
}

/** Where a move ended: how far the mover went, and what it hit on the way, in order. */
export interface RuleMove {
    offset: Vector2I;
    hits: WallHit[];
}

/**
 * What a `PhysicsWorld` asks about two shapes. The world finds the pairs, moves the bodies and
 * turns contacts into speeds; a rule only answers the geometry. A game may pass its own.
 */
export interface CollisionRule {
    /** A short name for a switch or a table: `"aabb"`, `"aabb_sweep"`, `"sat_sweep"`. */
    readonly name: string;
    /** Whether `move()` looks at the whole path, so that nothing tunnels through a still shape. */
    readonly is_swept: boolean;
    /**
     * Where two shapes overlap now: the smallest push of `a` out of `b`, `normal` from `b`
     * towards `a`. Null when apart. The contact may be the same object on every call, written
     * anew: read it before asking again, and copy what you keep.
     */
    overlap(a: ShapeAt, b: ShapeAt): Contact | null;
    /** Moves `mover` by `delta` against still `walls`, sliding along what it hits. `mover` isn't changed. */
    move(mover: ShapeAt, delta: Vector2I, walls: readonly ShapeAt[]): RuleMove;
}

/** The contact the box rules hand out, written anew by each overlap. */
const box_contact: Contact = { normal: { x: 0, y: 0 }, depth: 0 };

/** `aabb_resolve` as a contact: the push's direction and length. */
function box_overlap(a: ShapeAt, b: ShapeAt): Contact | null {
    const push = aabb_resolve(a.box, b.box);
    if (push === null) {
        return null;
    }
    box_contact.normal.x = Math.sign(push.x);
    box_contact.normal.y = Math.sign(push.y);
    box_contact.depth = Math.abs(push.x) + Math.abs(push.y);
    return box_contact;
}

/** The contact `SAT_SWEEP` hands out, written anew by each overlap. */
const sat_contact: Contact = { normal: { x: 0, y: 0 }, depth: 0 };

/**
 * Boxes, the naive way: every shape counts as its bounding box, a move goes the whole way
 * first and is pushed out of whatever it ended in after (`aabb_resolve`). Cheap, and wrong in
 * two ways a game can see: a triangle stacks like a crate, and a body fast enough to jump a
 * thin wall in one step passes through. Its hits have `time` 1 and the push in `overlap`.
 */
export const AABB: CollisionRule = {
    name: "aabb",
    is_swept: false,
    overlap: box_overlap,
    move(mover, delta, walls) {
        const box = {
            left: mover.box.left + delta.x,
            top: mover.box.top + delta.y,
            width: mover.box.width,
            height: mover.box.height,
        };
        const hits: WallHit[] = [];
        for (let index = 0; index < walls.length; index++) {
            const push = aabb_resolve(box, walls[index].box);
            if (push !== null) {
                box.left += push.x;
                box.top += push.y;
                hits.push({
                    normal: { x: Math.sign(push.x), y: Math.sign(push.y) },
                    time: 1,
                    overlap: push,
                    wall: index,
                });
            }
        }
        return {
            offset: {
                x: box.left - mover.box.left,
                y: box.top - mover.box.top,
            },
            hits,
        };
    },
};

/**
 * Boxes, swept: every shape counts as its bounding box, and a move is `aabb_move`, which looks
 * at the whole path and slides along what it meets. Nothing tunnels; a triangle still stacks
 * like a crate.
 */
export const AABB_SWEEP: CollisionRule = {
    name: "aabb_sweep",
    is_swept: true,
    overlap: box_overlap,
    move(mover, delta, walls) {
        const moved = aabb_move(
            mover.box,
            delta,
            walls.map((wall) => wall.box),
        );
        return {
            offset: {
                x: moved.rect.left - mover.box.left,
                y: moved.rect.top - mover.box.top,
            },
            hits: moved.hits,
        };
    },
};

/**
 * Convex polygons, swept: `sat_overlap` between bodies and `sat_move` against still ones, so a
 * slope is a slope and nothing tunnels. Bodies don't turn, so a crate that lands flat on a
 * corner stays balanced there; step 26 tips it off by hand, the world doesn't. The axes come
 * with the shapes, worked out once per body.
 */
export const SAT_SWEEP: CollisionRule = {
    name: "sat_sweep",
    is_swept: true,
    overlap(a, b) {
        // shapes whose boxes are apart are apart: four comparisons spare the shadows
        if (!aabb_overlaps(a.box, b.box)) {
            return null;
        }
        return sat_overlap_shapes(a, b, sat_contact);
    },
    move(mover, delta, walls) {
        return sat_move_shapes(mover, delta, walls);
    },
};

/** The three rules, cheapest first. */
export const COLLISION_RULES: readonly CollisionRule[] = [
    AABB,
    AABB_SWEEP,
    SAT_SWEEP,
];
