import { Menu, MenuEntry } from "../ui/menu/Menu";

export interface MenuInputOptions {
    /** How long a press waits while the input is held; 0 drops it. Default 1. */
    buffer_seconds?: number;
    /** How many presses may wait at once. Default 16. */
    buffer_size?: number;
}

/** A press as it came in: a key, or a level and an entry from a pointer. */
type Press = { key: string } | { depth: number; index: number };

/** A press in the buffer: how long it has waited in this hold, and which tree it was meant for. */
type WaitingPress = Press & { age: number; tree_version: number };

/** What a press came to, as far as the buffer cares. */
type PressResult = "choice" | "refused" | "nothing";

const MOVE_KEYS: ReadonlyMap<string, number> = new Map([
    ["ArrowUp", -1],
    ["ArrowDown", 1],
]);
const CONFIRM_KEYS: readonly string[] = ["Enter", " "];
const BACK_KEYS: readonly string[] = ["Escape", "ArrowLeft"];
const OPEN_KEY = "ArrowRight";

/**
 * Frame-based input for a `Menu`: keys and presses in, plain queries out, like `KeyboardState` and
 * `PointerInput`. A press changes the menu at once, unless the input is held: then it waits in a
 * buffer, and plays when the hold ends, in order. It holds a `Menu` and knows nothing about drawing;
 * a `MenuView` feeds it the pointer, or a game calls `handle_hover()` and `handle_press()` itself.
 *
 * The buffer holds presses, not choices: typing ahead means pressing Down, Down, Enter during a
 * wait, so the moves wait as well. A replayed press may open the next submenu and start the next
 * wait, and the rest then waits for that. Whatever is typed after a press means what that press
 * would have led to, so the buffer never gets a hole: the first press to run out of time takes the
 * rest with it, a press that doesn't fit is the one that goes, a refused press drops what comes
 * after it, and so does a new tree (`Menu.set_entries()`). Time only counts within one hold: as
 * long as the replay gets somewhere, a long chain of waits doesn't run out.
 *
 * Keys: Up and Down move, Enter and Space confirm, Escape and Left go back, Right opens a submenu,
 * and a letter picks the entry with that `key`. Only Up and Down repeat while held.
 */
export class MenuInput<T> {
    public readonly menu: Menu<T>;
    /** While true, presses wait in the buffer or drop, and nothing moves. */
    public is_held: boolean = false;
    /** Called inside the browser event, for what can't wait for the frame. */
    public on_choice: ((choice: T) => void) | null = null;
    /** Called when the cursor or the open level changed, for sounds. */
    public on_change: (() => void) | null = null;
    /** Every press lost so far: out of time, no room, or after a refusal. */
    public dropped_presses: number = 0;
    /** Every press on a disabled entry so far, what a view watches to show it. */
    public refusals: number = 0;
    /** Whether a replayed press after a refused one plays on. A fixed answer, see the docs. */
    protected readonly plays_on_after_refusal: boolean = false;
    /** Whether the buffer survives a new tree. A fixed answer, see the docs. */
    protected readonly keeps_buffer_on_new_tree: boolean = false;
    private readonly buffer_seconds: number;
    private readonly buffer_size: number;
    private _is_enabled: boolean = true;
    private buffer: WaitingPress[] = [];
    private frame_choices: T[] = [];
    private frame_refused: MenuEntry<T> | null = null;
    /** Where the pointer went during the hold; it counts once the hold is over. */
    private held_hover: { depth: number; index: number } | null = null;
    private controller: AbortController | null = null;

    private readonly on_key_down = (event: Event): void => {
        const key_event = event as KeyboardEvent;
        if (
            key_event.ctrlKey ||
            key_event.metaKey ||
            key_event.altKey ||
            !this.understands(key_event.key, key_event.repeat)
        ) {
            return;
        }
        key_event.preventDefault();
        this.handle_key(key_event.key, key_event.repeat);
    };

    public constructor(menu: Menu<T>, options: MenuInputOptions = {}) {
        this.menu = menu;
        this.buffer_seconds = options.buffer_seconds ?? 1;
        this.buffer_size = options.buffer_size ?? 16;
    }

    /**
     * Listens for keys on `target`. Pointer presses come from a `MenuView`, or `handle_press()`.
     * The game shell does not need this: it hands every placed `MenuView`'s input the keys itself,
     * and only after the intro. Stops at `detach()` or when `signal` aborts.
     */
    public attach(target: HTMLElement, signal?: AbortSignal): void {
        this.detach();
        if (signal?.aborted) {
            return;
        }
        const controller = new AbortController();
        this.controller = controller;
        const options = { signal: controller.signal };
        target.addEventListener("keydown", this.on_key_down, options);
        signal?.addEventListener("abort", () => this.detach(), options);
    }

    /** Removes the listeners; safe to call when not attached. */
    public detach(): void {
        this.controller?.abort();
        this.controller = null;
    }

    /**
     * False while this menu isn't the one in use, on a screen that doesn't show it: presses go
     * nowhere and leave no trace. Turning it off forgets what was waiting.
     */
    public get is_enabled(): boolean {
        return this._is_enabled;
    }

    public set is_enabled(val: boolean) {
        if (!val) {
            this.clear();
        }
        this._is_enabled = val;
    }

    /** How many presses wait right now. */
    public get waiting_presses(): number {
        return this.buffer.length;
    }

    /** Final choices since the last `end_frame()`, in order. */
    public choices(): T[] {
        return this.frame_choices.slice();
    }

    /** The newest final choice since the last `end_frame()`. */
    public get last_choice(): T | null {
        return this.frame_choices.at(-1) ?? null;
    }

    /** The disabled entry pressed last since `end_frame()`, so a game can say why. */
    public get last_refused(): MenuEntry<T> | null {
        return this.frame_refused;
    }

    /**
     * Ages the buffer, and replays it once released, up to the next hold or the next choice, so a
     * game reading `choices()` in its update can start a hold before anything plays on.
     */
    public update(delta_seconds: number): void {
        for (const press of this.buffer) {
            press.age += delta_seconds;
        }
        if (
            this.buffer.length > 0 &&
            this.buffer[0].age > this.buffer_seconds
        ) {
            this.drop_buffer();
        }
        this.replay();
        if (
            !this.is_held &&
            this.buffer.length === 0 &&
            this.held_hover !== null
        ) {
            const { depth, index } = this.held_hover;
            this.held_hover = null;
            this.handle_hover(depth, index);
        }
    }

    /** Ends the frame: forgets the choices and the refusal, keeps what is waiting. */
    public end_frame(): void {
        this.frame_choices = [];
        this.frame_refused = null;
    }

    /** Forgets what waits, without counting it as dropped, and the frame's choices and refusal. */
    public clear(): void {
        this.buffer = [];
        this.held_hover = null;
        this.end_frame();
    }

    /** A key as in `KeyboardEvent.key`. A repeat from a held key only counts for Up and Down. */
    public handle_key(key: string, is_repeat: boolean = false): void {
        if (this.understands(key, is_repeat)) {
            this.press({ key });
        }
    }

    /**
     * The pointer is over the entry `index` of the level at `depth`. It moves the cursor on the open
     * level, and does nothing on a parent: going back is a press, not a hover.
     */
    public handle_hover(depth: number, index: number): void {
        if (!this._is_enabled) {
            return;
        }
        if (this.is_held || this.buffer.length > 0) {
            this.held_hover = { depth, index };
            return;
        }
        if (depth === this.menu.levels.length - 1) {
            this.changing(() => {
                this.menu.point_at(index);
                return "nothing";
            });
        }
    }

    /**
     * A press on the entry `index` of the level at `depth`. On a parent it goes back to that level:
     * on the entry that is open, that's all; on another one, that one is confirmed too.
     */
    public handle_press(depth: number, index: number): void {
        this.press({ depth, index });
    }

    /** Whether this key does something on a menu; a letter only when the tree has any. */
    private understands(key: string, is_repeat: boolean): boolean {
        if (MOVE_KEYS.has(key)) {
            return true;
        }
        if (is_repeat) {
            return false;
        }
        return (
            CONFIRM_KEYS.includes(key) ||
            BACK_KEYS.includes(key) ||
            key === OPEN_KEY ||
            (key.length === 1 && this.menu.has_keys)
        );
    }

    private press(press: Press): void {
        if (!this._is_enabled) {
            return;
        }
        this.replay();
        if (this.is_held || this.buffer.length > 0) {
            this.wait(press);
            return;
        }
        this.apply(press);
    }

    /** Into the buffer, if there's time to wait at all and room; else the press is gone. */
    private wait(press: Press): void {
        if (
            this.buffer_seconds <= 0 ||
            this.buffer.length >= this.buffer_size
        ) {
            this.dropped_presses += 1;
            return;
        }
        this.buffer.push({
            ...press,
            age: 0,
            tree_version: this.menu.tree_version,
        });
    }

    private drop_buffer(): void {
        this.dropped_presses += this.buffer.length;
        this.buffer = [];
    }

    private replay(): void {
        while (!this.is_held && this.buffer.length > 0) {
            const press = this.buffer[0];
            if (
                !this.keeps_buffer_on_new_tree &&
                press.tree_version !== this.menu.tree_version
            ) {
                this.drop_buffer();
                return;
            }
            this.buffer.shift();
            for (const waiting of this.buffer) {
                waiting.age = 0;
            }
            const result = this.apply(press);
            if (result === "refused" && !this.plays_on_after_refusal) {
                this.drop_buffer();
                return;
            }
            if (result === "choice") {
                return;
            }
        }
    }

    private apply(press: Press): PressResult {
        return this.changing(() =>
            "key" in press
                ? this.apply_key(press.key)
                : this.apply_press(press.depth, press.index),
        );
    }

    /** Runs `action`, and tells when the cursor or the open level has changed by it. */
    private changing(action: () => PressResult): PressResult {
        const cursor = this.menu.cursor;
        const entries = this.menu.entries;
        const result = action();
        if (this.menu.cursor !== cursor || this.menu.entries !== entries) {
            this.on_change?.();
        }
        return result;
    }

    private apply_key(key: string): PressResult {
        const menu = this.menu;
        const step = MOVE_KEYS.get(key);
        if (step !== undefined) {
            menu.move(step);
            return "nothing";
        }
        if (CONFIRM_KEYS.includes(key)) {
            return this.confirm();
        }
        if (BACK_KEYS.includes(key)) {
            menu.back();
            return "nothing";
        }
        if (key === OPEN_KEY) {
            return menu.current?.entries === undefined
                ? "nothing"
                : this.confirm();
        }
        const index = menu.index_of_key(key);
        if (index < 0) {
            return "nothing";
        }
        menu.point_at(index);
        return this.confirm();
    }

    private apply_press(depth: number, index: number): PressResult {
        const menu = this.menu;
        const level = menu.levels[depth];
        if (level === undefined || index >= level.entries.length) {
            return "nothing";
        }
        const is_parent = depth < menu.levels.length - 1;
        const is_on_open_path = is_parent && level.cursor === index;
        menu.back_to(depth);
        if (is_on_open_path) {
            return "nothing";
        }
        menu.point_at(index);
        return this.confirm();
    }

    private confirm(): PressResult {
        const menu = this.menu;
        const entry = menu.current;
        if (entry !== null && menu.is_disabled(entry)) {
            this.frame_refused = entry;
            this.refusals += 1;
            return "refused";
        }
        const choice = menu.confirm();
        if (choice === null) {
            return "nothing";
        }
        this.frame_choices.push(choice);
        this.on_choice?.(choice);
        return "choice";
    }
}
