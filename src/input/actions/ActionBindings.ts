/**
 * The device an input came from. `keyboard` is the keyboard and the mouse, `gamepad` a pad in
 * the browser's standard mapping, `touch` a finger on the shell's touch controls.
 */
export type InputDevice = "keyboard" | "gamepad" | "touch";

/** The buttons of the browser's "standard" gamepad layout, by their place on an Xbox pad. */
export const PAD_BUTTONS = {
    a: 0,
    b: 1,
    x: 2,
    y: 3,
    lb: 4,
    rb: 5,
    lt: 6,
    rt: 7,
    select: 8,
    start: 9,
    l3: 10,
    r3: 11,
    up: 12,
    down: 13,
    left: 14,
    right: 15,
    home: 16,
} as const;

export type PadButtonName = keyof typeof PAD_BUTTONS;

/** Four keys that make a direction, by `KeyboardEvent.code`. */
export interface KeyCross {
    readonly up: string;
    readonly left: string;
    readonly down: string;
    readonly right: string;
}

/** W, A, S and D, wherever they are on the keyboard's layout (Z, Q, S, D on a French one). */
export const WASD: KeyCross = {
    up: "KeyW",
    left: "KeyA",
    down: "KeyS",
    right: "KeyD",
};

/** The four arrow keys. */
export const ARROWS: KeyCross = {
    up: "ArrowUp",
    left: "ArrowLeft",
    down: "ArrowDown",
    right: "ArrowRight",
};

/** An action that is held or not: fire, jump, confirm. */
export interface ButtonBinding {
    readonly kind: "button";
    /** Keys by `KeyboardEvent.code` ("Space", "KeyF", "Enter"). */
    readonly keys?: readonly string[];
    /** Buttons of a standard gamepad. */
    readonly pad?: readonly PadButtonName[];
    /** `"button"`: a round button among the shell's touch controls. */
    readonly touch?: "button";
    /** The touch button's text; default: the action's name. */
    readonly label?: string;
}

/** An action with a direction and a strength, at most 1 long: move, aim. */
export interface VectorBinding {
    readonly kind: "vector";
    /** Each cross of four keys gives a direction; diagonals are as long as straight lines. */
    readonly keys?: readonly KeyCross[];
    /** A stick of a standard gamepad, with the dead zone of the `ActionMap`. */
    readonly stick?: "left" | "right";
    /** The gamepad's cross of four buttons as a direction too. */
    readonly dpad?: boolean;
    /** `"stick"`: the shell's floating touch stick. */
    readonly touch?: "stick";
}

export type ActionBinding = ButtonBinding | VectorBinding;

/** A game's actions by name. Plain data, so they could be saved and rebound later. */
export type ActionBindings = Readonly<Record<string, ActionBinding>>;

/**
 * What a game gets when it declares nothing: `move` (WASD, the arrows, the left stick and the
 * cross, the touch stick), `confirm` (Space or Enter, A, a touch button), `back` (Escape, B) and
 * `pause` (P, Start). A game that declares its own may spread these in and add to them.
 */
export const DEFAULT_ACTIONS = {
    move: {
        kind: "vector",
        keys: [WASD, ARROWS],
        stick: "left",
        dpad: true,
        touch: "stick",
    },
    confirm: {
        kind: "button",
        keys: ["Space", "Enter", "NumpadEnter"],
        pad: ["a"],
        touch: "button",
        label: "OK",
    },
    back: { kind: "button", keys: ["Escape"], pad: ["b"] },
    pause: { kind: "button", keys: ["KeyP"], pad: ["start"] },
} as const satisfies ActionBindings;

/** The touch buttons the bindings ask for, in their order: the action and its text. */
export function touch_buttons_of(
    bindings: ActionBindings,
): Array<{ action: string; label: string }> {
    const buttons: Array<{ action: string; label: string }> = [];
    for (const [action, binding] of Object.entries(bindings)) {
        if (binding.kind === "button" && binding.touch === "button") {
            buttons.push({ action, label: binding.label ?? action });
        }
    }
    return buttons;
}
