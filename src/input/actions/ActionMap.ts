import { KeyboardState } from "../KeyboardState";
import {
    ActionBinding,
    ActionBindings,
    ButtonBinding,
    DEFAULT_ACTIONS,
    InputDevice,
    KeyCross,
    PAD_BUTTONS,
    VectorBinding,
} from "./ActionBindings";
import {
    ActionVector,
    GamepadLike,
    GamepadSource,
    ZERO_VECTOR,
    browser_gamepads,
    clamp_vector,
    radial_dead_zone,
} from "./Gamepads";
import { TouchSource } from "./TouchControls";

export interface ActionMapOptions {
    /** The game's actions. Default: `DEFAULT_ACTIONS` (move, confirm, back, pause). */
    bindings?: ActionBindings;
    /** Where the keys come from; null for none. */
    keyboard?: KeyboardState | null;
    /** Where the pads come from, asked in every `update()`. Default: the browser's. */
    gamepads?: GamepadSource;
    /** The touch controls; null for none. */
    touch?: TouchSource | null;
    /** The still part of a stick's reach, 0 to 1. Default 0.2. */
    dead_zone?: number;
    /** `last_device` until the first input. Default `"keyboard"`. */
    device?: InputDevice;
}

const DEVICES: readonly InputDevice[] = ["keyboard", "gamepad", "touch"];

/** How far a direction has to go before `nudge()` says so. */
const NUDGE_THRESHOLD = 0.5;

/** One action's state per device, this frame and the one before. */
interface ActionState {
    readonly binding: ActionBinding;
    down: Record<InputDevice, boolean>;
    was_down: Record<InputDevice, boolean>;
    vector: Record<InputDevice, ActionVector>;
    was_vector: Record<InputDevice, ActionVector>;
    combined: ActionVector;
    was_combined: ActionVector;
}

function per_device<T>(value: T): Record<InputDevice, T> {
    return { keyboard: value, gamepad: value, touch: value };
}

/** -1, 0 or 1: where `now` went past the threshold that `before` hadn't. */
function nudge_axis(now: number, before: number): number {
    if (Math.abs(now) < NUDGE_THRESHOLD) {
        return 0;
    }
    const is_new =
        Math.abs(before) < NUDGE_THRESHOLD ||
        Math.sign(before) !== Math.sign(now);
    return is_new ? Math.sign(now) : 0;
}

/**
 * Input by name: a game asks for "move" and "fire", not for keys, and the keyboard, a gamepad and
 * the touch controls all feed the same actions. A game written against the map plays with each
 * of them without a line of extra code.
 *
 * An action is a **button** (`is_down`, `just_pressed`, `just_released`) or a **vector** (`vector`,
 * at most 1 long: four keys, a stick, the cross, the touch stick). Its bindings are plain data
 * (`ActionBindings`), keys by `KeyboardEvent.code`, pad buttons by name in the browser's standard
 * mapping. `update()` reads every device once a frame (the game shell does it before the game's
 * `update()`); two devices at once add up and are cut to 1, so a key and a stick together are
 * not faster than either.
 *
 * One pad: the first connected one with the standard mapping. A pad with another mapping is
 * ignored and named in `unsupported_pad`, so the page can say so instead of guessing.
 * `last_device` is where the last input came from, for hints that say "Leertaste", "A" or "Tippen".
 */
export class ActionMap {
    public readonly bindings: ActionBindings;
    /** The id of the pad in use, null while there is none. */
    public pad: string | null = null;
    /** The id of a connected pad without the standard mapping, which is ignored; else null. */
    public unsupported_pad: string | null = null;
    private readonly keyboard: KeyboardState | null;
    private readonly gamepads: GamepadSource;
    private readonly touch: TouchSource | null;
    private readonly dead_zone: number;
    private readonly states = new Map<string, ActionState>();
    private _last_device: InputDevice;
    /** The pad's buttons in the last frame, to see new presses of buttons no action binds. */
    private was_pad_pressed: boolean[] = [];
    /** Whether the pad's sticks were out of the dead zone in the last frame. */
    private was_pad_tilted = false;
    private touch_count = 0;
    /** After `clear()`: the next `update()` takes what is held without calling it pressed. */
    private is_settling = false;

    public constructor(options: ActionMapOptions = {}) {
        this.bindings = options.bindings ?? DEFAULT_ACTIONS;
        this.keyboard = options.keyboard ?? null;
        this.gamepads = options.gamepads ?? browser_gamepads;
        this.touch = options.touch ?? null;
        this.dead_zone = options.dead_zone ?? 0.2;
        this._last_device = options.device ?? "keyboard";
        this.touch_count = this.touch?.touch_count ?? 0;
        for (const [name, binding] of Object.entries(this.bindings)) {
            this.states.set(name, {
                binding,
                down: per_device(false),
                was_down: per_device(false),
                vector: per_device(ZERO_VECTOR),
                was_vector: per_device(ZERO_VECTOR),
                combined: ZERO_VECTOR,
                was_combined: ZERO_VECTOR,
            });
        }
    }

    /** Where the last input came from: `keyboard` (with the mouse), `gamepad` or `touch`. */
    public get last_device(): InputDevice {
        return this._last_device;
    }

    /** Says where an input came from that the map doesn't read itself, such as a mouse click. */
    public note_device(device: InputDevice): void {
        this._last_device = device;
    }

    /** Reads every device and works out the actions; once a frame, before the game reads them. */
    public update(): void {
        const pad = this.find_pad();
        let has_keyboard_input =
            (this.keyboard?.pressed_codes().length ?? 0) > 0;
        let has_pad_input = this.read_pad_activity(pad);
        const touch_count = this.touch?.touch_count ?? 0;
        const has_touch_input = touch_count > this.touch_count;
        this.touch_count = touch_count;
        for (const [name, state] of this.states) {
            state.was_down = state.down;
            state.was_vector = state.vector;
            state.was_combined = state.combined;
            if (state.binding.kind === "button") {
                state.down = this.read_button(name, state.binding, pad);
            } else {
                state.vector = this.read_vector(state.binding, pad);
                const { keyboard, gamepad, touch } = state.vector;
                state.combined = clamp_vector(
                    keyboard.x + gamepad.x + touch.x,
                    keyboard.y + gamepad.y + touch.y,
                );
            }
            if (this.is_settling) {
                state.was_down = state.down;
                state.was_vector = state.vector;
                state.was_combined = state.combined;
            }
        }
        if (this.is_settling) {
            this.is_settling = false;
            has_keyboard_input = false;
            has_pad_input = false;
        }
        if (has_keyboard_input) {
            this._last_device = "keyboard";
        }
        if (has_pad_input) {
            this._last_device = "gamepad";
        }
        if (has_touch_input) {
            this._last_device = "touch";
        }
    }

    /**
     * Forgets what is held, as after the start screen or a lost focus. What a device still holds at
     * the next `update()` counts as held, not as pressed again.
     */
    public clear(): void {
        for (const state of this.states.values()) {
            state.down = per_device(false);
            state.was_down = per_device(false);
            state.vector = per_device(ZERO_VECTOR);
            state.was_vector = per_device(ZERO_VECTOR);
            state.combined = ZERO_VECTOR;
            state.was_combined = ZERO_VECTOR;
        }
        this.is_settling = true;
    }

    /** Whether the map has an action by that name. */
    public has(name: string): boolean {
        return this.states.has(name);
    }

    /** Whether the button `name` is held, by any device. */
    public is_down(name: string): boolean {
        const state = this.button_state(name);
        return DEVICES.some((device) => state.down[device]);
    }

    /**
     * Whether the button `name` went down this frame: true for exactly one frame per press. With
     * `device`, only a press from that device counts.
     */
    public just_pressed(name: string, device?: InputDevice): boolean {
        const state = this.button_state(name);
        if (device !== undefined) {
            return state.down[device] && !state.was_down[device];
        }
        const is_down = DEVICES.some((each) => state.down[each]);
        const was_down = DEVICES.some((each) => state.was_down[each]);
        return is_down && !was_down;
    }

    /** Whether the button `name` was let go this frame, by the last device that held it. */
    public just_released(name: string): boolean {
        const state = this.button_state(name);
        const is_down = DEVICES.some((device) => state.down[device]);
        const was_down = DEVICES.some((device) => state.was_down[device]);
        return was_down && !is_down;
    }

    /** The vector `name`: every device added up, at most 1 long. */
    public vector(name: string, device?: InputDevice): ActionVector {
        const state = this.vector_state(name);
        return device === undefined ? state.combined : state.vector[device];
    }

    /**
     * -1, 0 or 1 per axis, on the frame the vector `name` went past half way in that direction: a
     * step for a cursor, as a key press is. With `device`, only that device's part counts.
     */
    public nudge(name: string, device?: InputDevice): ActionVector {
        const state = this.vector_state(name);
        const now =
            device === undefined ? state.combined : state.vector[device];
        const before =
            device === undefined
                ? state.was_combined
                : state.was_vector[device];
        const x = nudge_axis(now.x, before.x);
        const y = nudge_axis(now.y, before.y);
        return x === 0 && y === 0 ? ZERO_VECTOR : { x, y };
    }

    private state_of(name: string): ActionState {
        const state = this.states.get(name);
        if (state === undefined) {
            throw new Error(
                `ActionMap: no action "${name}"; it has ${[...this.states.keys()].join(", ")}`,
            );
        }
        return state;
    }

    private button_state(name: string): ActionState {
        const state = this.state_of(name);
        if (state.binding.kind !== "button") {
            throw new Error(`ActionMap: "${name}" is not a button`);
        }
        return state;
    }

    private vector_state(name: string): ActionState {
        const state = this.state_of(name);
        if (state.binding.kind !== "vector") {
            throw new Error(`ActionMap: "${name}" is not a vector`);
        }
        return state;
    }

    /** The first connected pad in the standard mapping; notes the first other one as unsupported. */
    private find_pad(): GamepadLike | null {
        let found: GamepadLike | null = null;
        let unsupported: string | null = null;
        for (const pad of this.gamepads()) {
            if (pad === null || !pad.connected) {
                continue;
            }
            if (pad.mapping !== "standard") {
                unsupported ??= pad.id;
                continue;
            }
            found ??= pad;
        }
        this.pad = found?.id ?? null;
        this.unsupported_pad = unsupported;
        if (found === null) {
            this.was_pad_pressed = [];
            this.was_pad_tilted = false;
        }
        return found;
    }

    /** Whether `pad` had a new press, or a stick left the dead zone, since the last frame. */
    private read_pad_activity(pad: GamepadLike | null): boolean {
        if (pad === null) {
            return false;
        }
        const pressed = pad.buttons.map(is_pad_button_down);
        const has_new_press = pressed.some(
            (is_down, index) => is_down && !this.was_pad_pressed[index],
        );
        this.was_pad_pressed = pressed;
        const is_tilted =
            stick_of(pad, "left", this.dead_zone) !== ZERO_VECTOR ||
            stick_of(pad, "right", this.dead_zone) !== ZERO_VECTOR;
        const has_new_tilt = is_tilted && !this.was_pad_tilted;
        this.was_pad_tilted = is_tilted;
        return has_new_press || has_new_tilt;
    }

    private read_button(
        name: string,
        binding: ButtonBinding,
        pad: GamepadLike | null,
    ): Record<InputDevice, boolean> {
        const keyboard = this.keyboard;
        const is_key_down =
            keyboard !== null &&
            (binding.keys ?? []).some(
                (code) =>
                    keyboard.is_code_down(code) ||
                    keyboard.was_code_pressed(code),
            );
        const is_pad_down =
            pad !== null &&
            (binding.pad ?? []).some((name) =>
                is_pad_button_down(pad.buttons[PAD_BUTTONS[name]]),
            );
        const is_touch_down =
            binding.touch === "button" &&
            this.touch !== null &&
            this.touch.is_button_down(name);
        return {
            keyboard: is_key_down,
            gamepad: is_pad_down,
            touch: is_touch_down,
        };
    }

    private read_vector(
        binding: VectorBinding,
        pad: GamepadLike | null,
    ): Record<InputDevice, ActionVector> {
        let keys = ZERO_VECTOR;
        if (this.keyboard !== null && binding.keys !== undefined) {
            keys = this.key_vector(binding.keys);
        }
        let gamepad = ZERO_VECTOR;
        if (pad !== null) {
            const stick =
                binding.stick === undefined
                    ? ZERO_VECTOR
                    : stick_of(pad, binding.stick, this.dead_zone);
            const cross = binding.dpad ? dpad_of(pad) : ZERO_VECTOR;
            gamepad = clamp_vector(stick.x + cross.x, stick.y + cross.y);
        }
        const touch =
            binding.touch === "stick" && this.touch !== null
                ? this.touch.stick_vector()
                : ZERO_VECTOR;
        return { keyboard: keys, gamepad, touch };
    }

    /** Every cross held: each axis -1 to 1, the diagonal cut to 1. */
    private key_vector(crosses: readonly KeyCross[]): ActionVector {
        const keyboard = this.keyboard;
        if (keyboard === null) {
            return ZERO_VECTOR;
        }
        const held = (code: string): number =>
            keyboard.is_code_down(code) || keyboard.was_code_pressed(code)
                ? 1
                : 0;
        let x = 0;
        let y = 0;
        for (const cross of crosses) {
            x += held(cross.right) - held(cross.left);
            y += held(cross.down) - held(cross.up);
        }
        return clamp_vector(Math.sign(x), Math.sign(y));
    }
}

function is_pad_button_down(
    button: { readonly pressed: boolean; readonly value: number } | undefined,
): boolean {
    return button !== undefined && (button.pressed || button.value > 0.5);
}

function stick_of(
    pad: GamepadLike,
    stick: "left" | "right",
    dead_zone: number,
): ActionVector {
    const first = stick === "left" ? 0 : 2;
    return radial_dead_zone(
        pad.axes[first] ?? 0,
        pad.axes[first + 1] ?? 0,
        dead_zone,
    );
}

function dpad_of(pad: GamepadLike): ActionVector {
    const held = (name: keyof typeof PAD_BUTTONS): number =>
        is_pad_button_down(pad.buttons[PAD_BUTTONS[name]]) ? 1 : 0;
    return clamp_vector(
        held("right") - held("left"),
        held("down") - held("up"),
    );
}
