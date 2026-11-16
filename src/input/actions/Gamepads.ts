/** A direction and a strength: at most 1 long from an `ActionMap`. */
export interface ActionVector {
    readonly x: number;
    readonly y: number;
}

/** The part of the browser's `Gamepad` an `ActionMap` reads; a test passes plain objects. */
export interface GamepadLike {
    readonly id: string;
    readonly index: number;
    readonly connected: boolean;
    /** `"standard"` for the layout the toolbox knows; anything else is ignored. */
    readonly mapping: string;
    readonly buttons: readonly {
        readonly pressed: boolean;
        readonly value: number;
    }[];
    readonly axes: readonly number[];
}

/** Where the pads come from, asked once a frame. */
export type GamepadSource = () => readonly (GamepadLike | null)[];

/** The browser's pads (`navigator.getGamepads()`), none where there is no such API. */
export const browser_gamepads: GamepadSource = () => {
    if (
        typeof navigator === "undefined" ||
        typeof navigator.getGamepads !== "function"
    ) {
        return [];
    }
    try {
        return navigator.getGamepads();
    } catch {
        // A page whose permissions policy forbids gamepads throws: then there are none.
        return [];
    }
};

/** The zero vector, shared. */
export const ZERO_VECTOR: ActionVector = Object.freeze({ x: 0, y: 0 });

/**
 * A stick's raw axes with a radial dead zone: inside `dead_zone` it is still, and the rest is
 * scaled so a stick pushed all the way still reaches 1. The result is at most 1 long, also on a
 * pad whose corners report more.
 */
export function radial_dead_zone(
    x: number,
    y: number,
    dead_zone: number,
): ActionVector {
    const length = Math.hypot(x, y);
    if (length <= dead_zone || length === 0) {
        return ZERO_VECTOR;
    }
    const scaled = Math.min(1, (length - dead_zone) / (1 - dead_zone));
    return { x: (x / length) * scaled, y: (y / length) * scaled };
}

/** `(x, y)`, cut to at most 1 long. */
export function clamp_vector(x: number, y: number): ActionVector {
    const length = Math.hypot(x, y);
    if (length <= 1) {
        return x === 0 && y === 0 ? ZERO_VECTOR : { x, y };
    }
    return { x: x / length, y: y / length };
}
