import { Vector2I } from "../geometries";
import { UiManager } from "../ui/UiManager";
import { CanvasStage } from "./CanvasStage";
import { IntroGate } from "./IntroGate";

export interface StageInputTargets {
    stage: CanvasStage;
    ui: UiManager;
    /** While it is not done, the game gets no input; its start screen takes the first gesture. */
    intro?: IntroGate;
    /** Gets the keyboard listeners and is focused on every press, usually the custom element. */
    host: HTMLElement;
    /** Keys whose browser default (scrolling, navigating) is blocked, also during the intro. */
    blocked_keys?: readonly string[];
}

/**
 * The game's own input, called only after the intro. Pointer hooks get the position in layout
 * coordinates (`stage.layout`), next to the event for `pointerId` or `pointerType`.
 */
export interface StageInputHandlers {
    /** A press the toolbox UI did not take (no button under it). */
    on_press?: (point: Vector2I, event: PointerEvent) => void;
    on_move?: (point: Vector2I, event: PointerEvent) => void;
    /** The press is over: `pointerup`, or `pointercancel` (check `event.type` to tell them apart). */
    on_release?: (point: Vector2I, event: PointerEvent) => void;
    /** The pointer left the canvas; a held press may want to end here. */
    on_leave?: (event: PointerEvent) => void;
    /** Keys without Ctrl, Alt or Meta. */
    on_key_down?: (event: KeyboardEvent) => void;
    /** Keys with Ctrl, Alt or Meta: shortcuts like Ctrl+Z. */
    on_shortcut?: (event: KeyboardEvent) => void;
    on_key_up?: (event: KeyboardEvent) => void;
    /** Something the player sees may have changed: repaint. */
    on_change?: () => void;
}

/**
 * The input wiring every canvas game repeats: pointer events on the stage's canvas go to the
 * toolbox UI in canvas pixels, the first click or key on the start screen goes to the intro
 * (and nowhere else), and whatever is left goes to the game's handlers. All listeners end
 * when `signal` aborts, so call it once per connection.
 */
export function bind_stage_input(
    signal: AbortSignal,
    targets: StageInputTargets,
    handlers: StageInputHandlers = {},
): void {
    const { stage, ui, intro, host } = targets;
    const $canvas = stage.$canvas;
    const changed = () => handlers.on_change?.();
    const is_playing = () => intro?.is_done ?? true;
    const listen = <K extends keyof HTMLElementEventMap>(
        $target: HTMLElement,
        type: K,
        listener: (event: HTMLElementEventMap[K]) => void,
    ) => $target.addEventListener(type, listener, { signal });

    listen($canvas, "pointerdown", (event) => {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
        host.focus({ preventScroll: true });
        // The click that leaves the start screen only starts the intro; it presses nothing.
        if (intro?.leave()) {
            return changed();
        }
        if (!is_playing()) {
            return;
        }
        // A drag keeps reporting outside the canvas until the button is released.
        try {
            $canvas.setPointerCapture?.(event.pointerId);
        } catch {
            // a synthetic event has no active pointer to capture
        }
        ui.pointer_down(stage.to_canvas(event));
        changed();
        // A `UiPage` counts as hit everywhere: the UI took the press only if a widget holds it.
        const locked = ui.mouse_locked_element;
        if (locked !== null && locked !== ui.active_menu) {
            return;
        }
        handlers.on_press?.(stage.to_layout(event), event);
    });
    listen($canvas, "pointermove", (event) => {
        if (ui.pointer_move(stage.to_canvas(event))) {
            changed();
        }
        if (is_playing()) {
            handlers.on_move?.(stage.to_layout(event), event);
        }
    });
    listen($canvas, "pointerup", (event) => {
        ui.pointer_up(stage.to_canvas(event));
        changed();
        if (is_playing()) {
            handlers.on_release?.(stage.to_layout(event), event);
        }
    });
    // A cancelled pointer (a scroll took over, the touch was lost) releases nothing in the UI:
    // `pointer_up` would click the held widget.
    listen($canvas, "pointercancel", (event) => {
        ui.pointer_exit();
        changed();
        if (is_playing()) {
            handlers.on_release?.(stage.to_layout(event), event);
        }
    });
    listen($canvas, "pointerleave", (event) => {
        ui.pointer_exit();
        changed();
        if (is_playing()) {
            handlers.on_leave?.(event);
        }
    });

    listen(host, "keydown", (event) => {
        const is_shortcut = event.ctrlKey || event.metaKey || event.altKey;
        // Tab keeps moving the focus; any other key on the start screen starts the intro.
        if (!is_shortcut && event.key !== "Tab" && intro?.leave()) {
            event.preventDefault();
            return changed();
        }
        if (!is_shortcut && targets.blocked_keys?.includes(event.key)) {
            event.preventDefault();
        }
        if (!is_playing()) {
            return;
        }
        if (is_shortcut) {
            handlers.on_shortcut?.(event);
        } else {
            handlers.on_key_down?.(event);
        }
    });
    listen(host, "keyup", (event) => {
        if (is_playing()) {
            handlers.on_key_up?.(event);
        }
    });
}
