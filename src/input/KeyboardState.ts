/**
 * Frame-based keyboard state: DOM events in, plain queries out.
 *
 * A game loop wants to ask "is Left held?" or "was Space pressed since the last frame?" at the
 * one place it decides things, instead of spreading `keydown` handlers over the logic. This
 * class listens on a target (the element, usually), remembers what happened, and the loop reads
 * it once per frame and then calls `end_frame()` to start collecting again.
 *
 * Keys are identified by `KeyboardEvent.key` ("ArrowLeft", "a", "A", "Ä", " ", "Enter").
 * `is_down` holds while the key is held; `was_pressed` / `was_released` and `typed` are edges
 * and characters collected since the last `end_frame()`. Only `EventTarget` and the event
 * types are used, never `document` or `window`, so the class also works in jsdom and in tests
 * that dispatch synthetic events.
 */
export class KeyboardState {
    private readonly down_keys = new Set<string>();
    private readonly pressed_keys = new Set<string>();
    private readonly released_keys = new Set<string>();
    private typed_characters: string[] = [];
    private controller: AbortController | null = null;

    private readonly on_key_down = (event: Event): void => {
        if (!is_keyboard_event(event)) {
            return;
        }
        const key = event.key;
        if (!event.repeat && !this.down_keys.has(key)) {
            this.pressed_keys.add(key);
        }
        this.down_keys.add(key);
        if (is_printable(event)) {
            this.typed_characters.push(key);
        }
    };

    private readonly on_key_up = (event: Event): void => {
        if (!is_keyboard_event(event)) {
            return;
        }
        const key = event.key;
        if (this.down_keys.delete(key)) {
            this.released_keys.add(key);
        }
    };

    private readonly on_blur = (): void => {
        this.clear();
    };

    /**
     * Listens for `keydown` / `keyup` on `target` and clears everything on `blur` (keys released
     * while the target had no focus are never reported, so a held key must not stick).
     * Stops at `detach()` or when `signal` aborts; attaching twice moves the listeners.
     */
    public attach(target: EventTarget, signal?: AbortSignal): void {
        this.detach();
        if (signal?.aborted) {
            return;
        }
        const controller = new AbortController();
        this.controller = controller;
        const options = { signal: controller.signal };
        target.addEventListener("keydown", this.on_key_down, options);
        target.addEventListener("keyup", this.on_key_up, options);
        target.addEventListener("blur", this.on_blur, options);
        signal?.addEventListener("abort", () => this.detach(), options);
    }

    /** Removes the listeners and forgets every key; safe to call when not attached. */
    public detach(): void {
        this.controller?.abort();
        this.controller = null;
        this.clear();
    }

    /** `true` while `key` is held down. */
    public is_down(key: string): boolean {
        return this.down_keys.has(key);
    }

    /** `true` when `key` went down since the last `end_frame()` (auto-repeat does not count). */
    public was_pressed(key: string): boolean {
        return this.pressed_keys.has(key);
    }

    /** `true` when `key` was released since the last `end_frame()`. */
    public was_released(key: string): boolean {
        return this.released_keys.has(key);
    }

    /**
     * The printable characters typed since the last `end_frame()`, in order, auto-repeat
     * included: a single-character `key` without Ctrl or Meta (AltGr still types).
     */
    public typed(): string[] {
        return this.typed_characters.slice();
    }

    /** Ends the frame: forgets presses, releases and typed characters, keeps what is held. */
    public end_frame(): void {
        this.pressed_keys.clear();
        this.released_keys.clear();
        this.typed_characters = [];
    }

    /** Forgets everything, held keys included. */
    public clear(): void {
        this.down_keys.clear();
        this.end_frame();
    }
}

function is_keyboard_event(event: Event): event is KeyboardEvent {
    return typeof (event as KeyboardEvent).key === "string";
}

function is_printable(event: KeyboardEvent): boolean {
    if (event.key.length !== 1) {
        return false;
    }
    if (event.metaKey) {
        return false;
    }
    // Ctrl alone is a shortcut; Ctrl+Alt is AltGr on Windows keyboards and types a character.
    return !event.ctrlKey || event.altKey;
}
