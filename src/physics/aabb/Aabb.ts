import { RectI } from "../../geometries/Rect";

/**
 * Axis-aligned bounding boxes: pure functions over the toolbox's `RectI`
 * (`left, top, width, height`, y grows downwards). Two kinds of test: the
 * static ones (`aabb_overlaps`, `aabb_resolve`) look at where two boxes are
 * *now*; the swept ones (`aabb_sweep`, `aabb_move`) look at the whole path of a
 * move, so a fast box cannot tunnel through a thin wall between two frames.
 */

/** The result of a swept test: when and from which side a mover meets a wall. */
export interface Hit {
    /**
     * The side of the wall that was hit, as a unit axis vector pointing away
     * from the wall: `(0, -1)` is the top of a floor, `(-1, 0)` the left face.
     */
    normal: { x: number; y: number };
    /** 0..1 of the move at which the boxes touch; 0 when they already overlapped. */
    time: number;
    /**
     * How far the mover already sat inside the wall when the move began (the
     * `aabb_resolve` push, signed); `(0, 0)` for a clean hit on the way.
     */
    overlap: { x: number; y: number };
}

/** Boxes overlap (touching edges do not count). */
export function aabb_overlaps(a: RectI, b: RectI): boolean {
    return (
        a.left < b.left + b.width &&
        a.left + a.width > b.left &&
        a.top < b.top + b.height &&
        a.top + a.height > b.top
    );
}

/**
 * Minimum translation to push `mover` out of `wall` (the smaller of x/y, the
 * other axis stays 0), or `null` when they do not overlap. The push goes to the
 * side where the mover's center already is.
 */
export function aabb_resolve(
    mover: RectI,
    wall: RectI,
): { x: number; y: number } | null {
    if (!aabb_overlaps(mover, wall)) return null;
    const mover_center_x = mover.left + mover.width / 2;
    const mover_center_y = mover.top + mover.height / 2;
    const wall_center_x = wall.left + wall.width / 2;
    const wall_center_y = wall.top + wall.height / 2;
    const push_x =
        mover_center_x < wall_center_x
            ? wall.left - (mover.left + mover.width)
            : wall.left + wall.width - mover.left;
    const push_y =
        mover_center_y < wall_center_y
            ? wall.top - (mover.top + mover.height)
            : wall.top + wall.height - mover.top;
    if (Math.abs(push_x) < Math.abs(push_y)) return { x: push_x, y: 0 };
    return { x: 0, y: push_y };
}

/**
 * Entry and exit time of one axis: the fraction of `delta` at which the
 * mover's span starts and stops overlapping the wall's span. A still axis is
 * either overlapping forever or never (touching counts as never).
 */
function axis_times(
    mover_start: number,
    mover_size: number,
    wall_start: number,
    wall_size: number,
    delta: number,
): { entry: number; exit: number } {
    const mover_end = mover_start + mover_size;
    const wall_end = wall_start + wall_size;
    if (delta === 0) {
        const apart = mover_end <= wall_start || mover_start >= wall_end;
        return apart
            ? { entry: Infinity, exit: -Infinity }
            : { entry: -Infinity, exit: Infinity };
    }
    if (delta > 0) {
        return {
            entry: (wall_start - mover_end) / delta,
            exit: (wall_end - mover_start) / delta,
        };
    }
    return {
        entry: (wall_end - mover_start) / delta,
        exit: (wall_start - mover_end) / delta,
    };
}

/**
 * Swept test: `mover` moving by `delta` against `wall`; returns the hit time
 * 0..1 and the normal, or `null` when the path misses the wall. Boxes that
 * already overlap are a hit at time 0 with the `aabb_resolve` push as the
 * overlap and its direction as the normal. The normal is on the axis the boxes
 * meet last (a corner hit counts as vertical).
 */
export function aabb_sweep(
    mover: RectI,
    delta: { x: number; y: number },
    wall: RectI,
): Hit | null {
    const push = aabb_resolve(mover, wall);
    if (push !== null) {
        return {
            normal: { x: Math.sign(push.x), y: Math.sign(push.y) },
            time: 0,
            overlap: push,
        };
    }
    const x = axis_times(
        mover.left,
        mover.width,
        wall.left,
        wall.width,
        delta.x,
    );
    const y = axis_times(
        mover.top,
        mover.height,
        wall.top,
        wall.height,
        delta.y,
    );
    const entry = Math.max(x.entry, y.entry);
    const exit = Math.min(x.exit, y.exit);
    if (entry >= exit || entry < 0 || entry > 1) return null;
    const normal =
        x.entry > y.entry
            ? { x: delta.x > 0 ? -1 : 1, y: 0 }
            : { x: 0, y: delta.y > 0 ? -1 : 1 };
    return { normal, time: entry, overlap: { x: 0, y: 0 } };
}

/**
 * Moves `mover` by `delta` against many walls, sliding along them: the move
 * stops at the first wall hit, the part of `delta` into that wall is dropped
 * and the rest is moved again (at most once per axis). Returns the final box
 * (a new object, `mover` is not changed) and the walls hit in order.
 */
export function aabb_move(
    mover: RectI,
    delta: { x: number; y: number },
    walls: readonly RectI[],
): { rect: RectI; hits: Hit[] } {
    const rect: RectI = {
        left: mover.left,
        top: mover.top,
        width: mover.width,
        height: mover.height,
    };
    const hits: Hit[] = [];
    let remaining = { x: delta.x, y: delta.y };
    for (let pass = 0; pass < 3; pass++) {
        let first: Hit | null = null;
        let first_wall: RectI | null = null;
        for (const wall of walls) {
            const hit = aabb_sweep(rect, remaining, wall);
            if (hit !== null && (first === null || hit.time < first.time)) {
                first = hit;
                first_wall = wall;
            }
        }
        if (first === null || first_wall === null) {
            rect.left += remaining.x;
            rect.top += remaining.y;
            return { rect, hits };
        }
        hits.push(first);
        rect.left += remaining.x * first.time + first.overlap.x;
        rect.top += remaining.y * first.time + first.overlap.y;
        // snap to the face that was hit, so rounding never leaves the box inside
        if (first.normal.x < 0) rect.left = first_wall.left - rect.width;
        else if (first.normal.x > 0)
            rect.left = first_wall.left + first_wall.width;
        if (first.normal.y < 0) rect.top = first_wall.top - rect.height;
        else if (first.normal.y > 0)
            rect.top = first_wall.top + first_wall.height;
        remaining = {
            x: first.normal.x !== 0 ? 0 : remaining.x * (1 - first.time),
            y: first.normal.y !== 0 ? 0 : remaining.y * (1 - first.time),
        };
        if (remaining.x === 0 && remaining.y === 0) return { rect, hits };
    }
    return { rect, hits };
}

/** The union box of several boxes (for broad phases); an empty list is a zero box at the origin. */
export function aabb_union(boxes: readonly RectI[]): RectI {
    if (boxes.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const box of boxes) {
        left = Math.min(left, box.left);
        top = Math.min(top, box.top);
        right = Math.max(right, box.left + box.width);
        bottom = Math.max(bottom, box.top + box.height);
    }
    return { left, top, width: right - left, height: bottom - top };
}
