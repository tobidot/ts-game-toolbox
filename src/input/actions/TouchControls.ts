import { Vector2I } from "../../geometries/Vector2";
import { ActionVector, ZERO_VECTOR, radial_dead_zone } from "./Gamepads";

/** What an `ActionMap` reads from touch controls; a test can pass its own. */
export interface TouchSource {
    /** The stick's direction, at most 1 long; zero while no thumb is on it. */
    stick_vector(): ActionVector;
    /** Whether a finger holds the button of `action`. */
    is_button_down(action: string): boolean;
    /** How many touches it has taken so far: when it grows, the last input was a touch. */
    readonly touch_count: number;
}

export interface TouchControlsOptions {
    /** A floating stick on the left half. Default false. */
    stick?: boolean;
    /** Round buttons on the right, from the right edge inwards. Default none. */
    buttons?: ReadonlyArray<{ action: string; label: string }>;
    /** How far the knob goes from where the thumb landed, in layout units. Default 64. */
    stick_radius?: number;
    /** The buttons' radius in layout units. Default 46. */
    button_radius?: number;
    /** How far from the edges the buttons sit. Default 36. */
    margin?: number;
    /** The part of the stick's reach that is still, so a resting thumb doesn't drift. Default 0.12. */
    dead_zone?: number;
}

/** The stick while a thumb is on it: where it landed and where the knob is now. */
export interface TouchStick {
    readonly id: number;
    readonly origin: Vector2I;
    readonly knob: Vector2I;
}

/** One round button: its action, text, place and whether a finger holds it. */
export interface TouchButton {
    readonly action: string;
    readonly label: string;
    center: Vector2I;
    readonly radius: number;
    is_down: boolean;
}

/**
 * Touch controls for a game without a touch scheme of its own: a stick that appears where the
 * thumb lands on the left half, and round buttons on the right. Several fingers at once, each by
 * its pointer id, so a thumb can steer while the other presses. Plain values in, plain values out
 * (layout coordinates); the game shell feeds it the touches no widget took and paints it, only
 * after the first touch (`is_shown`).
 */
export class TouchControls implements TouchSource {
    public readonly buttons: TouchButton[];
    public readonly stick_radius: number;
    public readonly has_stick: boolean;
    private readonly margin: number;
    private readonly dead_zone: number;
    private width = 0;
    private _stick: TouchStick | null = null;
    /** Which pointer holds which button. */
    private readonly held = new Map<number, TouchButton>();
    private _touch_count = 0;

    public constructor(options: TouchControlsOptions = {}) {
        this.has_stick = options.stick ?? false;
        this.stick_radius = options.stick_radius ?? 64;
        this.margin = options.margin ?? 36;
        this.dead_zone = options.dead_zone ?? 0.12;
        const radius = options.button_radius ?? 46;
        this.buttons = (options.buttons ?? []).map(({ action, label }) => ({
            action,
            label,
            center: { x: 0, y: 0 },
            radius,
            is_down: false,
        }));
    }

    /** Whether there is anything to touch at all. */
    public get is_enabled(): boolean {
        return this.has_stick || this.buttons.length > 0;
    }

    /** True from the first touch on: before that, a mouse player never sees the controls. */
    public get is_shown(): boolean {
        return this._touch_count > 0;
    }

    public get touch_count(): number {
        return this._touch_count;
    }

    /** The stick while a thumb is on it, else null. */
    public get stick(): TouchStick | null {
        return this._stick;
    }

    /**
     * Places the buttons for a layout of `width` by `height`: the first in the bottom right corner,
     * the next to its left and a little higher, as thumbs reach them.
     */
    public layout(width: number, height: number): void {
        this.width = width;
        let index = 0;
        for (const button of this.buttons) {
            const step = button.radius * 2.4;
            button.center = {
                x: width - this.margin - button.radius - index * step,
                y: height - this.margin - button.radius - index * step * 0.45,
            };
            index += 1;
        }
    }

    /**
     * A finger came down at `point`. Returns whether the controls took it: on a button, or on the
     * left half for the stick while no other thumb holds it.
     */
    public handle_down(id: number, point: Vector2I): boolean {
        if (!this.is_enabled) {
            return false;
        }
        const button = this.buttons.find(
            (candidate) =>
                Math.hypot(
                    point.x - candidate.center.x,
                    point.y - candidate.center.y,
                ) <= candidate.radius,
        );
        if (button !== undefined) {
            this._touch_count += 1;
            button.is_down = true;
            this.held.set(id, button);
            return true;
        }
        if (
            this.has_stick &&
            this._stick === null &&
            point.x < this.width / 2
        ) {
            this._touch_count += 1;
            this._stick = { id, origin: point, knob: point };
            return true;
        }
        return false;
    }

    /** The finger `id` moved; returns whether it is one of the controls'. */
    public handle_move(id: number, point: Vector2I): boolean {
        const stick = this._stick;
        if (stick !== null && stick.id === id) {
            const dx = point.x - stick.origin.x;
            const dy = point.y - stick.origin.y;
            const length = Math.hypot(dx, dy);
            const reach = Math.min(
                1,
                this.stick_radius / Math.max(length, 1e-9),
            );
            this._stick = {
                id,
                origin: stick.origin,
                knob: {
                    x: stick.origin.x + dx * reach,
                    y: stick.origin.y + dy * reach,
                },
            };
            return true;
        }
        return this.held.has(id);
    }

    /** The finger `id` was lifted or lost; returns whether it was one of the controls'. */
    public handle_up(id: number): boolean {
        if (this._stick !== null && this._stick.id === id) {
            this._stick = null;
            return true;
        }
        const button = this.held.get(id);
        if (button === undefined) {
            return false;
        }
        this.held.delete(id);
        button.is_down = [...this.held.values()].includes(button);
        return true;
    }

    /** Lets go of everything, as when the element disconnects. */
    public release_all(): void {
        this._stick = null;
        this.held.clear();
        for (const button of this.buttons) {
            button.is_down = false;
        }
    }

    public stick_vector(): ActionVector {
        const stick = this._stick;
        if (stick === null) {
            return ZERO_VECTOR;
        }
        return radial_dead_zone(
            (stick.knob.x - stick.origin.x) / this.stick_radius,
            (stick.knob.y - stick.origin.y) / this.stick_radius,
            this.dead_zone,
        );
    }

    public is_button_down(action: string): boolean {
        return this.buttons.some(
            (button) => button.action === action && button.is_down,
        );
    }
}
