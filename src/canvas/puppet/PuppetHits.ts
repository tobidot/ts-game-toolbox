import type { PuppetRig } from "./PuppetRig";
import type { PuppetSkin } from "./PuppetSkin";
import type { PuppetPoint, Skeleton } from "./Skeleton";
import { RgbaPixels } from "./SoftMesh";

/** A pixel counts for a hit shape when its alpha is at least this. */
const HIT_ALPHA = 128;
/** A map pixel names a bone when its colour is this near (squared RGB distance), as the soft mesh reads it. */
const MAP_DISTANCE = 60 * 60;
/** A bone with fewer pixels than this gets no hit shape (a root, a hip hidden under the body). */
const FEWEST_PIXELS = 12;
/** The share of a bone's pixels its radius reaches round its middle line. */
const RADIUS_SHARE = 0.96;
/** The share of a bone's pixels left out at each end of it (stray outline pixels). */
const END_SHARE = 0.005;

/**
 * A bone's hit shape: a capsule along the bone, in its frame at rest (rig units, as for anchors):
 * the line from `(from, across)` to `(to, across)`, `radius` round it. Made from the pixels of the
 * skin that are the bone's: a soft skin's by its bone map, a cut-out skin's by its parts.
 */
export interface HitCapsule {
    readonly bone: number;
    readonly name: string;
    /** Along the bone, where the middle line starts and ends. */
    readonly from: number;
    readonly to: number;
    /** Across the bone, where the middle line lies. */
    readonly across: number;
    readonly radius: number;
    /** Higher is drawn more on top (a cut-out skin's slot, a soft skin's picture). */
    readonly order: number;
    /** How many pixels it was made from. */
    readonly pixels: number;
}

/** A hit on a puppet, in the placement's space (see `Puppet.place()`). */
export interface PuppetHit {
    readonly bone: number;
    /** The bone's name: `"head"`. */
    readonly name: string;
    /** Where the hit is: a ray's way into the capsule, a point, a circle's nearest point. */
    readonly x: number;
    readonly y: number;
    /** Out of the capsule at the hit, a unit vector. */
    readonly normal: PuppetPoint;
    /** For a ray, how far along it (0 at `from`, 1 at `to`); 0 otherwise. */
    readonly t: number;
}

/** A capsule where it is now, in the puppet's own space: the middle line from a to b. */
export interface PlacedCapsule {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    radius: number;
}

/**
 * Every bone's hit capsule for a skin (since step 44). The skin's pixels decide: `pixels` is the
 * atlas (a soft skin reads its own; a cut-out skin's `pixels`). Without pixels a cut-out part counts
 * whole, its rectangle as its picture; a soft skin without pixels has none yet (an empty list).
 */
export function hit_capsules(
    rig: PuppetRig,
    skin: PuppetSkin,
    pixels: RgbaPixels | null,
): HitCapsule[] {
    const rest = rig.make_skeleton();
    rest.reset_pose();
    rest.update();
    const samples = new Map<number, number[]>();
    const add = (
        bone: number,
        along: number,
        across: number,
        order: number,
    ) => {
        let list = samples.get(bone);
        if (list === undefined) {
            list = [];
            samples.set(bone, list);
        }
        list.push(along, across, order);
    };
    const point = { x: 0, y: 0 };
    const soft = skin.soft;
    if (soft !== null) {
        const atlas = soft.pixels;
        if (atlas === null) {
            return [];
        }
        const colors = [...soft.bone_colors.entries()];
        const resolution = soft.resolution;
        const step = Math.max(1, Math.round(resolution * 2));
        for (const [order, picture] of soft.data.pictures.entries()) {
            const [left, top, width, height] = picture.rect;
            const map = picture.map ?? null;
            const allowed =
                picture.bones?.map((name) => rest.index_of(name)) ?? soft.bones;
            for (let v = 0; v < height; v += step) {
                for (let u = 0; u < width; u += step) {
                    if (alpha(atlas, left + u, top + v) < HIT_ALPHA) {
                        continue;
                    }
                    const x = (u + 0.5 - picture.origin[0]) / resolution;
                    const y = (v + 0.5 - picture.origin[1]) / resolution;
                    let bone = -1;
                    if (map !== null) {
                        bone = bone_of_color(
                            atlas,
                            map[0] + u,
                            map[1] + v,
                            colors,
                        );
                    }
                    if (bone < 0 || !allowed.includes(bone)) {
                        bone = nearest_bone(rest, allowed, x, y);
                    }
                    if (bone < 0) {
                        continue;
                    }
                    rest.local_point(bone, x, y, point);
                    add(bone, point.x, point.y, order);
                }
            }
        }
    } else {
        for (const [order, slot] of rig.slots.entries()) {
            const part = skin.parts.get(slot.name);
            if (part === undefined) {
                continue;
            }
            const m = part.transform;
            const step = Math.max(
                1,
                Math.round(
                    Math.hypot(m[0], m[1]) > 0 ? 2 / Math.hypot(m[0], m[1]) : 2,
                ),
            );
            for (let v = 0; v < part.height; v += step) {
                for (let u = 0; u < part.width; u += step) {
                    if (
                        pixels !== null &&
                        alpha(pixels, part.source_x + u, part.source_y + v) <
                            HIT_ALPHA
                    ) {
                        continue;
                    }
                    const px = u + 0.5;
                    const py = v + 0.5;
                    add(
                        slot.bone,
                        m[0] * px + m[2] * py + m[4],
                        m[1] * px + m[3] * py + m[5],
                        order,
                    );
                }
            }
        }
    }
    const capsules: HitCapsule[] = [];
    for (const [bone, list] of samples) {
        const count = list.length / 3;
        if (count < FEWEST_PIXELS) {
            continue;
        }
        const along = new Float64Array(count);
        const across = new Float64Array(count);
        let order = 0;
        for (let index = 0; index < count; index++) {
            along[index] = list[index * 3];
            across[index] = list[index * 3 + 1];
            order = Math.max(order, list[index * 3 + 2]);
        }
        const middle = quantile(across, 0.5);
        const away = new Float64Array(count);
        for (let index = 0; index < count; index++) {
            away[index] = Math.abs(across[index] - middle);
        }
        const radius = Math.max(1, quantile(away, RADIUS_SHARE));
        const low = quantile(along, END_SHARE);
        const high = quantile(along, 1 - END_SHARE);
        let from = low + radius;
        let to = high - radius;
        if (from > to) {
            from = (low + high) / 2;
            to = from;
        }
        capsules.push({
            bone,
            name: rest.names[bone],
            from,
            to,
            across: middle,
            radius,
            order,
            pixels: count,
        });
    }
    return capsules.sort((a, b) => a.bone - b.bone);
}

/**
 * The hit shapes of one puppet: its skin's capsules (shared by every puppet wearing the skin) where
 * its bones are now. `Puppet` asks it for `hit_at`, `ray_hit` and `overlaps`.
 */
export class PuppetHitTest {
    private placed: PlacedCapsule[] = [];

    /** Lays the capsules onto the skeleton's pose now (after `update()`). */
    public place(
        capsules: readonly HitCapsule[],
        skeleton: Skeleton,
    ): readonly PlacedCapsule[] {
        while (this.placed.length < capsules.length) {
            this.placed.push({ ax: 0, ay: 0, bx: 0, by: 0, radius: 0 });
        }
        const point = { x: 0, y: 0 };
        for (const [index, capsule] of capsules.entries()) {
            const placed = this.placed[index];
            skeleton.world_point(
                capsule.bone,
                capsule.from,
                capsule.across,
                point,
            );
            placed.ax = point.x;
            placed.ay = point.y;
            skeleton.world_point(
                capsule.bone,
                capsule.to,
                capsule.across,
                point,
            );
            placed.bx = point.x;
            placed.by = point.y;
            placed.radius = capsule.radius * skeleton.width_scale(capsule.bone);
        }
        return this.placed;
    }

    /**
     * The capsule containing a point of the puppet's space that is drawn most on top (nearest its
     * middle line on a tie); -1 for none.
     */
    public at(
        capsules: readonly HitCapsule[],
        skeleton: Skeleton,
        x: number,
        y: number,
    ): number {
        const placed = this.place(capsules, skeleton);
        let best = -1;
        let best_order = -Infinity;
        let best_depth = Infinity;
        for (const [index, capsule] of capsules.entries()) {
            const shape = placed[index];
            const distance = distance_to_segment(
                x,
                y,
                shape.ax,
                shape.ay,
                shape.bx,
                shape.by,
            );
            if (distance > shape.radius) {
                continue;
            }
            const depth = distance / shape.radius;
            if (
                capsule.order > best_order ||
                (capsule.order === best_order && depth < best_depth)
            ) {
                best = index;
                best_order = capsule.order;
                best_depth = depth;
            }
        }
        return best;
    }

    /**
     * Where a segment of the puppet's space first enters a capsule: the capsule's index and the
     * share of the way (`t`); -1 for none. Of capsules entered at nearly the same place, the one
     * drawn more on top.
     */
    public ray(
        capsules: readonly HitCapsule[],
        skeleton: Skeleton,
        from_x: number,
        from_y: number,
        to_x: number,
        to_y: number,
    ): { index: number; t: number } {
        const placed = this.place(capsules, skeleton);
        const length = Math.hypot(to_x - from_x, to_y - from_y);
        // Two entries closer than this along the ray count as one place (half a unit).
        const tie = length > 0 ? 0.5 / length : 0;
        let best = -1;
        let best_t = Infinity;
        for (const [index, capsule] of capsules.entries()) {
            const shape = placed[index];
            const t = segment_capsule(from_x, from_y, to_x, to_y, shape);
            if (t < 0) {
                continue;
            }
            if (
                t < best_t - tie ||
                (t <= best_t + tie &&
                    best >= 0 &&
                    capsule.order > capsules[best].order)
            ) {
                best = index;
                best_t = Math.min(t, best_t);
            }
        }
        return { index: best, t: best_t };
    }

    /** The capsule a circle of the puppet's space touches, the one drawn most on top; -1 for none. */
    public touching(
        capsules: readonly HitCapsule[],
        skeleton: Skeleton,
        x: number,
        y: number,
        radius: number,
    ): number {
        const placed = this.place(capsules, skeleton);
        let best = -1;
        let best_order = -Infinity;
        let best_gap = Infinity;
        for (const [index, capsule] of capsules.entries()) {
            const shape = placed[index];
            const gap =
                distance_to_segment(
                    x,
                    y,
                    shape.ax,
                    shape.ay,
                    shape.bx,
                    shape.by,
                ) - shape.radius;
            if (gap > radius) {
                continue;
            }
            if (
                capsule.order > best_order ||
                (capsule.order === best_order && gap < best_gap)
            ) {
                best = index;
                best_order = capsule.order;
                best_gap = gap;
            }
        }
        return best;
    }

    /** The point of a placed capsule's surface nearest to a point, and the way out there. */
    public surface(
        index: number,
        x: number,
        y: number,
    ): { x: number; y: number; nx: number; ny: number } {
        const shape = this.placed[index];
        const dx = shape.bx - shape.ax;
        const dy = shape.by - shape.ay;
        const squared = dx * dx + dy * dy;
        let along = 0;
        if (squared > 0) {
            along = Math.min(
                1,
                Math.max(
                    0,
                    ((x - shape.ax) * dx + (y - shape.ay) * dy) / squared,
                ),
            );
        }
        const cx = shape.ax + along * dx;
        const cy = shape.ay + along * dy;
        let nx = x - cx;
        let ny = y - cy;
        const length = Math.hypot(nx, ny);
        if (length > 1e-9) {
            nx /= length;
            ny /= length;
        } else {
            // On the middle line: out to the side.
            const side = Math.hypot(dx, dy);
            nx = side > 0 ? -dy / side : 0;
            ny = side > 0 ? dx / side : -1;
        }
        return { x: cx + nx * shape.radius, y: cy + ny * shape.radius, nx, ny };
    }
}

/** The fixed step of a flinch's spring, in seconds: the same at any frame rate. */
export const FLINCH_STEP = 1 / 240;
/** Degrees per second a flinch of strength 1 kicks its bone. */
export const FLINCH_KICK = 480;

/**
 * Bones that flinch: an added turn on each, kicked by a hit and springing back to 0 (since step 44).
 * A damped spring stepped in fixed steps of `FLINCH_STEP`, so 30 and 144 updates a second end in the
 * same place.
 */
export class PuppetFlinch {
    /** How long a swing takes to halve, in seconds. */
    public half_life = 0.09;
    /** The most degrees a bone flinches. */
    public max = 45;
    private turn = new Float64Array(0);
    private speed = new Float64Array(0);
    private left = 0;
    private is_still = true;

    /** Degrees the bone is turned by its flinch now. */
    public offset(bone: number): number {
        return this.turn[bone] ?? 0;
    }

    /** Some bone still flinches. */
    public get is_moving(): boolean {
        return !this.is_still;
    }

    /**
     * Kicks a bone by `degrees_per_second` (clockwise positive); its parent half as much, the one
     * above a quarter (roots never).
     */
    public kick(
        skeleton: Skeleton,
        bone: number,
        degrees_per_second: number,
    ): void {
        this.fit(skeleton.count);
        let share = 1;
        for (
            let at = bone;
            at >= 0 && skeleton.parents[at] >= 0 && share >= 0.25;
            at = skeleton.parents[at]
        ) {
            this.speed[at] += degrees_per_second * share;
            share /= 2;
        }
        this.is_still = false;
    }

    /** Moves the springs on by `delta_seconds`, in fixed steps. */
    public step(delta_seconds: number): void {
        if (this.is_still) {
            this.left = 0;
            return;
        }
        const total = this.left + Math.min(0.25, Math.max(0, delta_seconds));
        const steps = Math.floor(total / FLINCH_STEP + 1e-9);
        this.left = Math.max(0, total - steps * FLINCH_STEP);
        const decay = Math.LN2 / this.half_life;
        // Slightly under-damped: a flinch swings back a little past its rest.
        const omega = decay / 0.6;
        const stiffness = omega * omega;
        const damping = 2 * 0.6 * omega;
        let moving = false;
        for (let bone = 0; bone < this.turn.length; bone++) {
            let turn = this.turn[bone];
            let speed = this.speed[bone];
            if (turn === 0 && speed === 0) {
                continue;
            }
            for (let step = 0; step < steps; step++) {
                speed += (-stiffness * turn - damping * speed) * FLINCH_STEP;
                turn += speed * FLINCH_STEP;
                if (turn > this.max) {
                    turn = this.max;
                    speed = Math.min(0, speed);
                } else if (turn < -this.max) {
                    turn = -this.max;
                    speed = Math.max(0, speed);
                }
            }
            if (Math.abs(turn) < 1e-3 && Math.abs(speed) < 0.05) {
                turn = 0;
                speed = 0;
            } else {
                moving = true;
            }
            this.turn[bone] = turn;
            this.speed[bone] = speed;
        }
        this.is_still = !moving;
    }

    /** Adds the turns to the pose (before `skeleton.update()`). */
    public apply(skeleton: Skeleton): void {
        if (this.is_still) {
            return;
        }
        const count = Math.min(skeleton.count, this.turn.length);
        for (let bone = 0; bone < count; bone++) {
            skeleton.rotation[bone] += this.turn[bone];
        }
    }

    /** Every bone still. */
    public reset(): void {
        this.turn.fill(0);
        this.speed.fill(0);
        this.left = 0;
        this.is_still = true;
    }

    private fit(count: number): void {
        if (this.turn.length !== count) {
            this.turn = new Float64Array(count);
            this.speed = new Float64Array(count);
        }
    }
}

function alpha(pixels: RgbaPixels, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) {
        return 0;
    }
    return pixels.data[(y * pixels.width + x) * 4 + 3];
}

/** The bone whose map colour is nearest a map pixel's, if near enough; -1 otherwise. */
function bone_of_color(
    pixels: RgbaPixels,
    x: number,
    y: number,
    colors: readonly (readonly [number, readonly [number, number, number]])[],
): number {
    if (alpha(pixels, x, y) < HIT_ALPHA) {
        return -1;
    }
    const at = (y * pixels.width + x) * 4;
    const r = pixels.data[at];
    const g = pixels.data[at + 1];
    const b = pixels.data[at + 2];
    let best = -1;
    let best_distance = MAP_DISTANCE;
    for (const [bone, color] of colors) {
        const distance =
            (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
        if (distance <= best_distance) {
            best = bone;
            best_distance = distance;
        }
    }
    return best;
}

/** Of `bones`, the one whose line passes nearest a point (bones of no length by their joint). */
function nearest_bone(
    skeleton: Skeleton,
    bones: readonly number[],
    x: number,
    y: number,
): number {
    let best = -1;
    let best_distance = Infinity;
    for (const bone of bones) {
        if (skeleton.parents[bone] < 0) {
            continue;
        }
        const distance = skeleton.distance_to_bone(bone, x, y);
        if (distance < best_distance) {
            best = bone;
            best_distance = distance;
        }
    }
    return best;
}

/** The value below which `share` of the numbers lie (they get sorted). */
function quantile(values: Float64Array, share: number): number {
    values.sort();
    const at = Math.min(
        values.length - 1,
        Math.max(0, Math.round(share * (values.length - 1))),
    );
    return values[at];
}

export function distance_to_segment(
    x: number,
    y: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const squared = dx * dx + dy * dy;
    let along = 0;
    if (squared > 0) {
        along = Math.min(
            1,
            Math.max(0, ((x - ax) * dx + (y - ay) * dy) / squared),
        );
    }
    return Math.hypot(x - (ax + along * dx), y - (ay + along * dy));
}

/**
 * Where a segment from (x0, y0) to (x1, y1) first comes within a capsule's radius of its middle
 * line, as a share of the segment (0 when it starts inside); -1 when it never does.
 */
function segment_capsule(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    shape: PlacedCapsule,
): number {
    const radius = shape.radius;
    if (
        distance_to_segment(x0, y0, shape.ax, shape.ay, shape.bx, shape.by) <=
        radius
    ) {
        return 0;
    }
    const dx = x1 - x0;
    const dy = y1 - y0;
    let best = Infinity;
    // The round ends.
    for (const [cx, cy] of [
        [shape.ax, shape.ay],
        [shape.bx, shape.by],
    ]) {
        const t = segment_circle(x0, y0, dx, dy, cx, cy, radius);
        if (t >= 0 && t < best) {
            best = t;
        }
    }
    // The straight sides: the line at the radius on either side, between the ends.
    const ux = shape.bx - shape.ax;
    const uy = shape.by - shape.ay;
    const length = Math.hypot(ux, uy);
    if (length > 1e-9) {
        const ax = ux / length;
        const ay = uy / length;
        // In the capsule's frame: s along it from its start, d across it.
        const s0 = (x0 - shape.ax) * ax + (y0 - shape.ay) * ay;
        const d0 = -(x0 - shape.ax) * ay + (y0 - shape.ay) * ax;
        const ds = dx * ax + dy * ay;
        const dd = -dx * ay + dy * ax;
        if (Math.abs(dd) > 1e-12) {
            for (const side of [radius, -radius]) {
                const t = (side - d0) / dd;
                if (t < 0 || t > 1) {
                    continue;
                }
                const s = s0 + ds * t;
                if (s >= 0 && s <= length && t < best) {
                    best = t;
                }
            }
        }
    }
    return Number.isFinite(best) ? best : -1;
}

/** Where a segment (start and step) first meets a circle, as a share of the step; -1 when it doesn't. */
function segment_circle(
    x0: number,
    y0: number,
    dx: number,
    dy: number,
    cx: number,
    cy: number,
    radius: number,
): number {
    const fx = x0 - cx;
    const fy = y0 - cy;
    const a = dx * dx + dy * dy;
    if (a === 0) {
        return -1;
    }
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return -1;
    }
    const root = Math.sqrt(discriminant);
    const t = (-b - root) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
}
