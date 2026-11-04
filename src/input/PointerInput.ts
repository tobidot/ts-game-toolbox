/**
 * Frame-based pointer state: mouse, touch and pen unified, delivered as plain values in the
 * coordinate space the caller chooses.
 *
 * A game loop wants to ask "where is the pointer?", "is it pressed?", "is this a drag, and from
 * where?" and "what was tapped since the last frame?" at the one place it decides things. The
 * browser answers with five event types in three coordinate systems (client pixels, canvas
 * pixels, the game's reference units). This class listens on a target, runs every position
 * through one `transform` function, and keeps a `PointerState` the loop reads once per frame
 * before it calls `end_frame()`.
 *
 * Only the primary pointer is tracked (the first finger, the mouse, the pen); a second finger
 * is ignored instead of teleporting the position. The DOM listeners only map an event to a
 * point and call the `handle_*` methods, which hold the whole logic and are public so tests and
 * non-DOM callers can drive the state without events.
 */
export interface PointerPoint {
    x: number;
    y: number;
}

/** A press that moved past the drag threshold: where it started, where it is, the difference. */
export interface PointerDrag {
    start: PointerPoint;
    current: PointerPoint;
    delta: PointerPoint;
}

/** A drag that ended: where the press started and where it was released. */
export interface PointerDrop {
    start: PointerPoint;
    end: PointerPoint;
}

export type PointerType = "mouse" | "touch" | "pen" | "none";

export interface PointerState {
    /** Last known position, `null` while the pointer is outside the target. */
    position: PointerPoint | null;
    is_down: boolean;
    /** Where the current press started, `null` while nothing is pressed. */
    down_position: PointerPoint | null;
    /** The current drag, once the press moved past the threshold; else `null`. */
    drag: PointerDrag | null;
    /** 0 left / 1 middle / 2 right / -1 touch; the button of the last press. */
    button: number;
    pointer_type: PointerType;
}

export interface PointerInputOptions {
    /**
     * Maps client coordinates to the caller's space (canvas pixels, reference units, ...).
     * Default: CSS pixels relative to the target's bounding box.
     */
    transform?: (
        client_x: number,
        client_y: number,
        target: HTMLElement,
    ) => PointerPoint;
    /** How far a press may move and still count as a tap; default 4. */
    drag_threshold?: number;
    /** Swallow the right-click menu on the target; default `true`. */
    prevent_context_menu?: boolean;
}

function point_of(x: number, y: number): PointerPoint {
    return { x, y };
}

function distance(a: PointerPoint, b: PointerPoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointer_type_of(event: PointerEvent): PointerType {
    const type = event.pointerType;
    if (type === "touch" || type === "pen" || type === "mouse") {
        return type;
    }
    return "mouse";
}

export class PointerInput {
    private readonly transform: (
        client_x: number,
        client_y: number,
        target: HTMLElement,
    ) => PointerPoint;
    private readonly drag_threshold: number;
    private readonly prevent_context_menu: boolean;
    private readonly current: PointerState = {
        position: null,
        is_down: false,
        down_position: null,
        drag: null,
        button: -1,
        pointer_type: "none",
    };
    private frame_taps: PointerPoint[] = [];
    private frame_drops: PointerDrop[] = [];
    private frame_wheel = 0;
    private target: HTMLElement | null = null;
    private controller: AbortController | null = null;
    /** The id of the pressed pointer, so a second finger cannot end the first one's press. */
    private pressed_id: number | null = null;

    public constructor(options: PointerInputOptions = {}) {
        this.transform =
            options.transform ??
            ((client_x, client_y, target) => {
                const rect = target.getBoundingClientRect();
                return point_of(client_x - rect.left, client_y - rect.top);
            });
        this.drag_threshold = options.drag_threshold ?? 4;
        this.prevent_context_menu = options.prevent_context_menu ?? true;
    }

    /**
     * Listens for `pointerdown/move/up/cancel/leave`, `wheel` and `contextmenu` on `target`.
     * Stops at `detach()` or when `signal` aborts; attaching twice moves the listeners.
     */
    public attach(target: HTMLElement, signal?: AbortSignal): void {
        this.detach();
        if (signal?.aborted) {
            return;
        }
        const controller = new AbortController();
        this.controller = controller;
        this.target = target;
        const options = { signal: controller.signal };
        target.addEventListener("pointerdown", this.on_pointer_down, options);
        target.addEventListener("pointermove", this.on_pointer_move, options);
        target.addEventListener("pointerup", this.on_pointer_up, options);
        target.addEventListener(
            "pointercancel",
            this.on_pointer_cancel,
            options,
        );
        target.addEventListener("pointerleave", this.on_pointer_leave, options);
        target.addEventListener("wheel", this.on_wheel, options);
        target.addEventListener("contextmenu", this.on_context_menu, options);
        signal?.addEventListener("abort", () => this.detach(), options);
    }

    /** Removes the listeners and forgets the pointer; safe to call when not attached. */
    public detach(): void {
        this.controller?.abort();
        this.controller = null;
        this.target = null;
        this.pressed_id = null;
        this.handle_cancel();
        this.current.position = null;
        this.end_frame();
    }

    /** The state as of now; read it once per frame, then `end_frame()`. */
    public get state(): Readonly<PointerState> {
        return this.current;
    }

    /** Presses released without a drag since the last `end_frame()`, at their press position. */
    public taps(): PointerPoint[] {
        return this.frame_taps.slice();
    }

    /** Drags that ended since the last `end_frame()`. */
    public drops(): PointerDrop[] {
        return this.frame_drops.slice();
    }

    /** The wheel steps since the last `end_frame()`: each event counts ±1 by its direction. */
    public wheel(): number {
        return this.frame_wheel;
    }

    /** Ends the frame: forgets taps, drops and wheel steps, keeps position and press. */
    public end_frame(): void {
        this.frame_taps = [];
        this.frame_drops = [];
        this.frame_wheel = 0;
    }

    // ---- the plain-value core ----

    /** A press at `point`; a press while one is active is ignored. */
    public handle_down(
        point: PointerPoint,
        button: number = 0,
        pointer_type: PointerType = "mouse",
    ): void {
        const state = this.current;
        if (state.is_down) {
            return;
        }
        state.position = point;
        state.down_position = point;
        state.is_down = true;
        state.drag = null;
        state.button = pointer_type === "touch" ? -1 : button;
        state.pointer_type = pointer_type;
    }

    /** A move to `point`; starts or continues a drag once past the threshold. */
    public handle_move(point: PointerPoint): void {
        const state = this.current;
        state.position = point;
        if (!state.is_down || state.down_position === null) {
            return;
        }
        if (
            state.drag === null &&
            distance(state.down_position, point) < this.drag_threshold
        ) {
            return;
        }
        const start = state.down_position;
        state.drag = {
            start,
            current: point,
            delta: point_of(point.x - start.x, point.y - start.y),
        };
    }

    /** A release at `point`: a tap when the press never dragged, else a drop. */
    public handle_up(point: PointerPoint): void {
        const state = this.current;
        state.position = point;
        if (!state.is_down || state.down_position === null) {
            return;
        }
        if (state.drag === null) {
            this.frame_taps.push(state.down_position);
        } else {
            this.frame_drops.push({ start: state.down_position, end: point });
        }
        state.is_down = false;
        state.down_position = null;
        state.drag = null;
    }

    /** The press was taken away (the browser scrolls, the window lost focus): no tap, no drop. */
    public handle_cancel(): void {
        const state = this.current;
        state.is_down = false;
        state.down_position = null;
        state.drag = null;
    }

    /** The pointer left the target: the position is unknown unless a press keeps it. */
    public handle_leave(): void {
        if (!this.current.is_down) {
            this.current.position = null;
        }
    }

    /** One wheel event; only the direction of `delta_y` counts. */
    public handle_wheel(delta_y: number): void {
        this.frame_wheel += Math.sign(delta_y);
    }

    // ---- DOM listeners: map the event, call the core ----

    private point_of_event(event: MouseEvent): PointerPoint | null {
        if (this.target === null) {
            return null;
        }
        return this.transform(event.clientX, event.clientY, this.target);
    }

    /** Only the primary pointer counts, and while pressed only that one. */
    private is_tracked(event: PointerEvent): boolean {
        if (this.pressed_id !== null) {
            return event.pointerId === this.pressed_id;
        }
        return event.isPrimary !== false;
    }

    private readonly on_pointer_down = (event: PointerEvent): void => {
        if (!this.is_tracked(event) || this.current.is_down) {
            return;
        }
        const point = this.point_of_event(event);
        if (point === null) {
            return;
        }
        this.pressed_id = event.pointerId;
        this.handle_down(point, event.button, pointer_type_of(event));
        try {
            this.target?.setPointerCapture(event.pointerId);
        } catch {
            // jsdom and some embedded views have no pointer capture; the drag then ends on leave.
        }
    };

    private readonly on_pointer_move = (event: PointerEvent): void => {
        if (!this.is_tracked(event)) {
            return;
        }
        const point = this.point_of_event(event);
        if (point === null) {
            return;
        }
        if (this.current.pointer_type === "none") {
            this.current.pointer_type = pointer_type_of(event);
        }
        this.handle_move(point);
    };

    private readonly on_pointer_up = (event: PointerEvent): void => {
        if (!this.is_tracked(event)) {
            return;
        }
        const point = this.point_of_event(event);
        if (point === null) {
            return;
        }
        this.pressed_id = null;
        this.handle_up(point);
    };

    private readonly on_pointer_cancel = (event: PointerEvent): void => {
        if (!this.is_tracked(event)) {
            return;
        }
        this.pressed_id = null;
        this.handle_cancel();
    };

    private readonly on_pointer_leave = (event: PointerEvent): void => {
        if (!this.is_tracked(event)) {
            return;
        }
        this.handle_leave();
    };

    private readonly on_wheel = (event: WheelEvent): void => {
        this.handle_wheel(event.deltaY);
    };

    private readonly on_context_menu = (event: Event): void => {
        if (this.prevent_context_menu) {
            event.preventDefault();
        }
    };
}
