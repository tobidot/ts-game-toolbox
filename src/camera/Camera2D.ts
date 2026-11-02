import { RectI } from "../geometries/Rect";
import { Vector2, Vector2I } from "../geometries/Vector2";

/**
 * A 2D camera for a side-scroller or any scrolling world: a view rectangle in world units that
 * follows a target, stays inside the world's bounds, and maps world <-> screen coordinates.
 *
 * The camera is a transform. The world is painted in its own coordinates; `apply` puts the
 * matching translate/scale on the context and the renderer never thinks about scrolling.
 * `position` is the top-left of the view in world units, `zoom` scales the world onto the
 * viewport (1 = one world unit per viewport unit). Screen convention: y grows downwards.
 */
export interface Camera2DOptions {
    /** The size of the view in world units at zoom 1 (the reference resolution, usually). */
    viewport: { width: number; height: number };
    /** The world; the camera never shows anything outside. Smaller than the view: centered. */
    bounds?: RectI;
    /**
     * A rectangle relative to the viewport center: the target may move inside it without the
     * camera scrolling. Without one the camera keeps the target exactly centered.
     */
    dead_zone?: RectI;
    /** Extra offset, in the direction the target moves, so the player sees where they go. */
    look_ahead?: { x: number; y: number };
    /**
     * 0 = the camera snaps to the target every frame, 0.9 = it keeps 90 % of its distance per
     * 1/60 s (very smooth). Also smooths the look-ahead, so it slides instead of jumping.
     */
    smoothing?: number;
}

export class Camera2D {
    /** Top-left of the view in world units. */
    public readonly position = new Vector2(0, 0);
    /** 1 = 1:1; 2 shows half the world twice as big. */
    public zoom = 1;
    public readonly viewport: { width: number; height: number };
    public bounds: RectI | null;
    public dead_zone: RectI | null;
    public readonly look_ahead: Vector2;
    public smoothing: number;
    /** The look-ahead offset currently applied; slides towards the velocity's direction. */
    private readonly look_offset = new Vector2(0, 0);

    public constructor(options: Camera2DOptions) {
        this.viewport = { ...options.viewport };
        this.bounds = options.bounds ? { ...options.bounds } : null;
        this.dead_zone = options.dead_zone ? { ...options.dead_zone } : null;
        this.look_ahead = new Vector2(options.look_ahead ?? { x: 0, y: 0 });
        this.smoothing = clamp01(options.smoothing ?? 0);
    }

    /** The visible world rectangle: `position` and the viewport divided by the zoom. */
    public get view(): RectI {
        return {
            left: this.position.x,
            top: this.position.y,
            width: this.viewport.width / this.zoom,
            height: this.viewport.height / this.zoom,
        };
    }

    /** The world point at the center of the view. */
    public get center(): Vector2 {
        const view = this.view;
        return new Vector2(
            view.left + view.width / 2,
            view.top + view.height / 2,
        );
    }

    /**
     * Follows `target`, one frame: the point (plus the look-ahead in the direction of
     * `velocity`) is pushed back into the dead zone, the camera moves towards that, smoothed,
     * and is clamped to the bounds. `delta_seconds` defaults to 1/60.
     */
    public follow(
        target: Vector2I,
        velocity: Vector2I = { x: 0, y: 0 },
        delta_seconds: number = 1 / 60,
    ): void {
        const blend = this.blend(delta_seconds);
        // the look-ahead slides towards the velocity's direction and stays when the target stops
        const wanted_x =
            velocity.x > 0
                ? this.look_ahead.x
                : velocity.x < 0
                  ? -this.look_ahead.x
                  : this.look_offset.x;
        const wanted_y =
            velocity.y > 0
                ? this.look_ahead.y
                : velocity.y < 0
                  ? -this.look_ahead.y
                  : this.look_offset.y;
        this.look_offset.x += (wanted_x - this.look_offset.x) * blend;
        this.look_offset.y += (wanted_y - this.look_offset.y) * blend;

        const point = {
            x: target.x + this.look_offset.x,
            y: target.y + this.look_offset.y,
        };
        const center = this.center;
        const wanted_center = this.dead_zone
            ? push_into_zone(center, this.dead_zone, point)
            : new Vector2(point);
        center.x += (wanted_center.x - center.x) * blend;
        center.y += (wanted_center.y - center.y) * blend;
        this.set_center(center);
        this.clamp();
    }

    /** Puts `point` in the middle of the view (within the bounds) and forgets the look-ahead. */
    public center_on(point: Vector2I): void {
        this.look_offset.set(0, 0);
        this.set_center(point);
        this.clamp();
    }

    /** Keeps the view inside the bounds; a world smaller than the view is centered in it. */
    public clamp(): void {
        const bounds = this.bounds;
        if (bounds === null) return;
        const view = this.view;
        this.position.x = clamp_axis(
            this.position.x,
            view.width,
            bounds.left,
            bounds.width,
        );
        this.position.y = clamp_axis(
            this.position.y,
            view.height,
            bounds.top,
            bounds.height,
        );
    }

    /** World units -> viewport units (what `apply` does to a drawn point). */
    public world_to_screen(point: Vector2I): Vector2 {
        return new Vector2(
            (point.x - this.position.x) * this.zoom,
            (point.y - this.position.y) * this.zoom,
        );
    }

    /** Viewport units -> world units: where a click on the screen lands in the world. */
    public screen_to_world(point: Vector2I): Vector2 {
        return new Vector2(
            point.x / this.zoom + this.position.x,
            point.y / this.zoom + this.position.y,
        );
    }

    /** Whether `rect` (grown by `margin` on every side) touches the view. */
    public is_visible(rect: RectI, margin: number = 0): boolean {
        const view = this.view;
        return (
            rect.left - margin < view.left + view.width &&
            rect.left + rect.width + margin > view.left &&
            rect.top - margin < view.top + view.height &&
            rect.top + rect.height + margin > view.top
        );
    }

    /**
     * Applies the camera to a 2D context (multiplied onto the current transform, so a
     * letterbox transform set before stays): world coordinates can be drawn directly.
     */
    public apply(context: CanvasRenderingContext2D): void {
        context.transform(
            this.zoom,
            0,
            0,
            this.zoom,
            -this.position.x * this.zoom,
            -this.position.y * this.zoom,
        );
    }

    /**
     * Parallax: the camera position a background layer sees. A layer with `factor` is drawn
     * as if the camera stood at `position * factor`: 0 = fixed to the screen, 1 = moves with
     * the world, 0.3 = far away, scrolling slowly. Draw the layer at `x - parallax(f).x`.
     */
    public parallax(factor: number): Vector2 {
        return new Vector2(this.position.x * factor, this.position.y * factor);
    }

    private set_center(center: Vector2I): void {
        const view = this.view;
        this.position.set(
            center.x - view.width / 2,
            center.y - view.height / 2,
        );
    }

    /** How much of the remaining distance one frame of `delta_seconds` covers. */
    private blend(delta_seconds: number): number {
        if (this.smoothing <= 0) return 1;
        return 1 - Math.pow(this.smoothing, Math.max(0, delta_seconds) * 60);
    }
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** The view's `left`/`top` on one axis so the view stays inside the bounds (or centered). */
function clamp_axis(
    start: number,
    size: number,
    bounds_start: number,
    bounds_size: number,
): number {
    if (size >= bounds_size) return bounds_start + (bounds_size - size) / 2;
    return Math.min(
        Math.max(start, bounds_start),
        bounds_start + bounds_size - size,
    );
}

/**
 * The center the view needs so that `point` lies inside the dead zone (given relative to the
 * current center): the center only moves when the point leaves the zone, and only as far as it
 * takes to catch it at the zone's edge.
 */
function push_into_zone(
    center: Vector2I,
    zone: RectI,
    point: Vector2I,
): Vector2 {
    const wanted = new Vector2(center);
    const left = center.x + zone.left;
    const right = left + zone.width;
    const top = center.y + zone.top;
    const bottom = top + zone.height;
    if (point.x < left) wanted.x += point.x - left;
    else if (point.x > right) wanted.x += point.x - right;
    if (point.y < top) wanted.y += point.y - top;
    else if (point.y > bottom) wanted.y += point.y - bottom;
    return wanted;
}
