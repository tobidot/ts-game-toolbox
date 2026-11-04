import { Vector2I } from "../geometries";
import { IntroState } from "../stage/IntroGate";
import { bind_stage_input } from "../stage/StageInput";
import { StageLayout } from "../stage/StageLayout";
import { Element as UiElement } from "../ui/Element";
import { ElementChangeEvent, ElementClickEvent } from "../ui/events";
import { CanvasGameProperties } from "./CanvasGameProperties";
import { CanvasGameReferences } from "./CanvasGameReferences";
import {
    CanvasGameRenderer,
    FrameExtras,
    GameFrame,
} from "./CanvasGameRenderer";
import { CanvasGameSettings, LayoutOf } from "./CanvasGameSettings";

/** The largest seed; seeds wrap around after it. */
export const MAX_SEED = 2147483647;

/** `"true"` or `"false"`, as boolean attributes are written; anything else throws. */
export function parse_boolean(raw: string): boolean {
    if (raw === "true") {
        return true;
    }
    if (raw === "false") {
        return false;
    }
    throw new Error('"true" or "false" expected');
}

/** Reads one attribute; `parse` may throw, then the fallback wins with a warning. */
export type AttributeReader = <T>(
    name: string,
    parse: (raw: string) => T,
    fallback: T,
) => T;

export function read_attribute<T>(
    host: Element,
    name: string,
    parse: (raw: string) => T,
    fallback: T,
): T {
    const raw = host.getAttribute(name);
    if (raw === null) {
        return fallback;
    }
    try {
        return parse(raw);
    } catch (error) {
        console.warn(
            `<${host.localName}>: attribute "${name}" is invalid, using the default:`,
            error,
        );
        return fallback;
    }
}

/**
 * Runs `tick` on the animation frame, at most `frames_per_second` times a second, until
 * `signal` aborts. The interval is kept on average (a late frame does not push the next one
 * back), and a long pause (a hidden tab) resumes with one tick instead of a burst.
 */
export function start_frame_loop(
    signal: AbortSignal,
    frames_per_second: number,
    tick: (time_ms: number) => void,
): void {
    const interval_ms = 1000 / frames_per_second;
    let due_ms = Number.NEGATIVE_INFINITY;
    let handle = 0;
    const on_frame = (time_ms: number): void => {
        if (signal.aborted) {
            return;
        }
        if (time_ms >= due_ms) {
            due_ms = Math.max(due_ms + interval_ms, time_ms - interval_ms / 2);
            tick(time_ms);
        }
        handle = requestAnimationFrame(on_frame);
    };
    handle = requestAnimationFrame(on_frame);
    signal.addEventListener("abort", () => cancelAnimationFrame(handle), {
        once: true,
    });
}

/**
 * The lifecycle every canvas game shares: attributes read once, the intro, input routed through
 * the start screen and the toolbox UI, the stage observed, a throttled frame loop, seeds, new
 * game and restart. A game subclasses it and overrides the hooks it needs; `create_game()` is
 * the only one it must. The type parameters are the game's own classes, so `this.settings` and
 * `this.properties` have the game's fields without casts.
 *
 * Attributes the shell reads: `init-seed` (a whole number; omitted: random) and `init-intro`
 * (`"false"` skips the intro). A game reads its own in `read_attributes()`.
 *
 * Seeds: game n of an element (n = `properties.restarts`, 0 for the first) is created with
 * `init-seed + n`. The same `init-seed` replays the same series of games, and a player can
 * report "the third game of seed 4711" and see exactly that game.
 */
export abstract class CanvasGameLogic<
    G,
    S extends CanvasGameSettings<StageLayout> = CanvasGameSettings,
    P extends CanvasGameProperties<G, S> = CanvasGameProperties<G, S>,
    F extends GameFrame<G> = GameFrame<G>,
> {
    public constructor(
        protected readonly host: HTMLElement,
        public readonly references: CanvasGameReferences<LayoutOf<S>>,
        public readonly properties: P,
        protected readonly renderer: CanvasGameRenderer<G, S, F>,
        protected readonly settings: S,
    ) {}

    // ---- lifecycle ----

    /** Called on every connection of the element. */
    public start(): void {
        const host = this.host;
        const properties = this.properties;
        const references = this.references;
        const settings = this.settings;
        if (!host.hasAttribute("tabindex")) {
            host.tabIndex = 0;
        }
        properties.abort_controller = new AbortController();
        const signal = properties.abort_controller.signal;

        if (!properties.is_attributes_read) {
            properties.is_attributes_read = true;
            const read: AttributeReader = (name, parse, fallback) =>
                read_attribute(host, name, parse, fallback);
            properties.seed = read("init-seed", parse_seed, random_seed());
            properties.intro_enabled = read("init-intro", parse_boolean, true);
            this.read_attributes(read);
        }

        const stage = references.stage;
        const mark_dirty = () => (properties.is_dirty = true);
        bind_stage_input(
            signal,
            {
                stage,
                ui: properties.ui,
                intro: properties.intro,
                host,
                blocked_keys: settings.game_keys,
            },
            {
                on_press: (point, event) => {
                    properties.pointer = point;
                    this.on_press(point, event);
                },
                on_move: (point, event) => {
                    // A hover painted from `properties.pointer` follows without a hook.
                    properties.pointer = point;
                    mark_dirty();
                    this.on_move(point, event);
                },
                on_release: (point, event) => this.on_release(point, event),
                on_leave: (event) => {
                    properties.pointer = null;
                    mark_dirty();
                    this.on_leave(event);
                },
                on_key_down: (event) => {
                    this.on_key_down(event);
                    if (!event.repeat) {
                        this.on_key_press(event);
                    }
                },
                on_key_up: (event) => this.on_key_up(event),
                on_shortcut: (event) => this.on_shortcut(event),
                on_change: mark_dirty,
            },
        );
        properties.keyboard.attach(host, signal);
        stage.attach(properties.page);
        stage.observe(signal, () => {
            if (stage.layout !== properties.layout) {
                properties.pointer = null;
                properties.place_widgets(stage.layout);
                this.on_layout(stage.layout);
            }
            mark_dirty();
        });
        properties.last_tick_ms = null;
        start_frame_loop(signal, settings.frames_per_second, (time_ms) =>
            this.tick(time_ms),
        );

        if (properties.game === null) {
            this.new_game();
        }
        properties.intro.start(references.$stage, signal, {
            is_enabled: properties.intro_enabled,
            on_change: (state) => {
                const game = properties.game;
                this.set_status(
                    state === "done" && game !== null
                        ? this.ready_status(game)
                        : this.intro_status(state),
                );
                mark_dirty();
            },
        });
        this.on_start(signal);
        mark_dirty();
    }

    /** Called on every disconnection; the state stays for a reconnect. */
    public stop(): void {
        this.properties.abort_controller?.abort();
        this.properties.abort_controller = null;
        this.on_stop();
    }

    /** True once the intro is over: the game takes input and animates. */
    public get is_playing(): boolean {
        return this.properties.intro.is_done;
    }

    /** The seed of the current game: `init-seed + restarts`, wrapped into 0..MAX_SEED. */
    public get game_seed(): number {
        const properties = this.properties;
        return (properties.seed + properties.restarts) % (MAX_SEED + 1);
    }

    /** Creates the game for `game_seed`. */
    public new_game(): void {
        const properties = this.properties;
        properties.game = this.create_game(this.game_seed);
        this.on_new_game(properties.game);
        properties.is_dirty = true;
    }

    /** The next game of the series ("Neues Spiel"), and the status line says it is ready. */
    public restart(): void {
        this.properties.restarts += 1;
        this.new_game();
        const game = this.properties.game;
        if (game !== null && this.is_playing) {
            this.set_status(this.ready_status(game));
        }
    }

    // ---- hooks a game overrides ----

    /** The DOM-free game for `seed`. */
    protected abstract create_game(seed: number): G;

    /** The game's own `init-*` attributes, read once. */
    protected read_attributes(read: AttributeReader): void {
        void read;
    }

    protected on_start(signal: AbortSignal): void {
        void signal;
    }

    protected on_stop(): void {}

    protected on_new_game(game: G): void {
        void game;
    }

    /** The stage picked another layout; widgets added with `properties.place()` have moved already. */
    protected on_layout(layout: LayoutOf<S>): void {
        void layout;
    }

    /**
     * Moves the game by `delta_seconds` and reads `properties.keyboard`. Return true when the
     * screen changed. Runs only after the intro.
     */
    protected update(game: G, delta_seconds: number): boolean {
        void game;
        void delta_seconds;
        return false;
    }

    /**
     * What the renderer gets beyond `game` and `ui`: whatever `paint()` needs that the game
     * itself doesn't know (messages, session records). Default: nothing more.
     */
    protected frame(game: G): FrameExtras<F> {
        void game;
        return {} as FrameExtras<F>;
    }

    /**
     * Before every repaint: whatever follows from the game's state outside the canvas picture,
     * such as which widgets show, their labels and classes. Default: nothing.
     */
    protected sync(game: G): void {
        void game;
    }

    /**
     * The status line after every repaint while playing, for a game whose line always follows
     * its state ("Zug 3, X ist dran"). Null keeps what `set_status()` last said. Default: null.
     */
    protected live_status(game: G): string | null {
        void game;
        return null;
    }

    /**
     * The status line once the game can be played: after the intro and after every restart.
     * Default: `live_status()`, else "<title>. Bereit.".
     */
    protected ready_status(game: G): string {
        return this.live_status(game) ?? `${this.settings.title}. Bereit.`;
    }

    /** The status line while the start screen waits and the intro plays. */
    protected intro_status(state: IntroState): string {
        if (state === "waiting") {
            return `${this.settings.title}. Klicken oder eine Taste drücken zum Starten.`;
        }
        return state === "playing" ? "Intro" : `${this.settings.title}.`;
    }

    /** A press on the scene no widget took, in layout coordinates. */
    protected on_press(point: Vector2I, event: PointerEvent): void {
        void point;
        void event;
    }

    protected on_move(point: Vector2I, event: PointerEvent): void {
        void point;
        void event;
    }

    protected on_release(point: Vector2I, event: PointerEvent): void {
        void point;
        void event;
    }

    protected on_leave(event: PointerEvent): void {
        void event;
    }

    /** A key without Ctrl, Alt or Meta, after the intro; repeats while it is held. */
    protected on_key_down(event: KeyboardEvent): void {
        void event;
    }

    /** Like `on_key_down()`, but once per press: holding the key repeats nothing. */
    protected on_key_press(event: KeyboardEvent): void {
        void event;
    }

    protected on_key_up(event: KeyboardEvent): void {
        void event;
    }

    /** A key with Ctrl, Alt or Meta (Ctrl+Z ...), after the intro. */
    protected on_shortcut(event: KeyboardEvent): void {
        void event;
    }

    // ---- helpers ----

    /** `handler` runs on every click of `widget`; safe to call on every `start()`. */
    protected on_click(widget: UiElement, handler: () => void): void {
        widget.events.detach(ElementClickEvent);
        widget.events.attach(ElementClickEvent, handler);
    }

    /** `handler` runs whenever `widget` (a slider, a checkbox) changes its value. */
    protected on_change(widget: UiElement, handler: () => void): void {
        widget.events.detach(ElementChangeEvent);
        widget.events.attach(ElementChangeEvent, handler);
    }

    protected set_status(text: string): void {
        this.renderer.set_status(text);
    }

    private tick(time_ms: number): void {
        const properties = this.properties;
        const game = properties.game;
        if (game === null) {
            return;
        }
        const last = properties.last_tick_ms;
        const delta_seconds =
            last === null ? 0 : Math.min(0.1, (time_ms - last) / 1000);
        properties.last_tick_ms = time_ms;
        const keyboard = properties.keyboard;
        if (!this.is_playing) {
            // The key that left the start screen, or one pressed during the logo, is no move.
            keyboard.clear();
        } else {
            if (this.update(game, delta_seconds)) {
                properties.is_dirty = true;
            }
            keyboard.end_frame();
        }
        if (!properties.is_dirty) {
            return;
        }
        properties.is_dirty = false;
        // `update()` may have started the next game: paint that one, not the old.
        const current = properties.game ?? game;
        if (properties.intro.is_waiting) {
            this.renderer.render_start(current);
            return;
        }
        this.sync(current);
        this.renderer.render({
            ...this.frame(current),
            game: current,
            ui: properties.ui,
        } as F);
        if (this.is_playing) {
            const status = this.live_status(current);
            if (status !== null) {
                this.set_status(status);
            }
        }
    }
}

function parse_seed(raw: string): number {
    const seed = Number(raw);
    if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
        throw new Error(`a whole number from 0 to ${MAX_SEED} expected`);
    }
    return seed;
}

/** Only the element may roll once, for its seed; everything in a game draws from `SeededRandom`. */
function random_seed(): number {
    return Math.floor(Math.random() * MAX_SEED);
}
