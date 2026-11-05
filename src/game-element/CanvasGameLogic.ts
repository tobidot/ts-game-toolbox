import { AudioPlayer } from "../audio/AudioPlayer";
import { Progress } from "../flow";
import { Vector2I } from "../geometries";
import { IntroState } from "../stage/IntroGate";
import { bind_stage_input } from "../stage/StageInput";
import { StageLayout } from "../stage/StageLayout";
import { Element as UiElement } from "../ui/Element";
import {
    ElementChangeEvent,
    ElementClickEvent,
    ElementRefusedEvent,
} from "../ui/events";
import { CanvasGameProperties } from "./CanvasGameProperties";
import { CanvasGameReferences } from "./CanvasGameReferences";
import {
    CanvasGameRenderer,
    FrameExtras,
    GameFrame,
} from "./CanvasGameRenderer";
import { CanvasGameSettings, LayoutOf } from "./CanvasGameSettings";
import { MUTE_ICONS } from "./MuteIcons";

/** The mute buttons' pictures among the loaded images. */
const MUTE_ICON_NAMES = {
    sound: "shell-mute-sound",
    music: "shell-mute-music",
} as const;

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
    ) {
        properties.audio = new AudioPlayer(references.assets);
    }

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
            this.load_images();
            this.load_sounds();
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
                    if (!this.next_round_if_finished()) {
                        this.on_press(point, event);
                    }
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
                    if (!event.repeat && this.mute_by_key(event)) {
                        return;
                    }
                    if (
                        !event.repeat &&
                        settings.next_round_keys.includes(event.key) &&
                        this.next_round_if_finished()
                    ) {
                        event.preventDefault();
                        return;
                    }
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
        this.bind_music_resume(signal);
        this.bind_music_hold(signal);
        this.bind_mute_buttons();
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
        // A reconnected element whose intro is long over gets no state change.
        this.start_music();
        properties.intro.start(references.$stage, signal, {
            is_enabled: properties.intro_enabled,
            on_change: (state) => {
                const game = properties.game;
                this.set_status(
                    state === "done" && game !== null
                        ? this.ready_status(game)
                        : this.intro_status(state),
                );
                this.start_music();
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
        this.properties.audio.destroy();
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

    /** The end card has stayed `settings.round_end_hold_seconds`: a press starts the next round. */
    public get is_round_end_ready(): boolean {
        return (
            this.properties.round_over_seconds >=
            this.settings.round_end_hold_seconds
        );
    }

    /** Creates the game for `game_seed`. */
    public new_game(): void {
        const properties = this.properties;
        properties.game = this.create_game(this.game_seed);
        properties.best.settle();
        properties.is_round_reported = false;
        properties.round_over_seconds = 0;
        this.on_new_game(properties.game);
        this.show_game_theme(properties.game, 0);
        properties.is_dirty = true;
    }

    /** The next game of the series ("Neues Spiel"), and the status line says it is ready. */
    public restart(): void {
        // A game that ended on input since the last frame still counts.
        this.report_finished_round();
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

    /**
     * Whether `game` has ended. A game that says so gets the end of a round from the shell:
     * `on_round_finished()` once, and a press or a `settings.next_round_keys` key starts the next
     * round instead of reaching `on_press()` or the key hooks. Default: the game never ends.
     */
    protected is_round_finished(game: G): boolean {
        void game;
        return false;
    }

    /**
     * Exactly once per finished round, before the frame that shows the end is painted: offer the
     * result to `properties.best`, say it in the status line.
     */
    protected on_round_finished(game: G): void {
        void game;
    }

    /** A press or key on a finished round. Default: `restart()`. */
    protected start_next_round(): void {
        this.restart();
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
     * Which of `settings.themes` shows now. The shell asks every frame and swaps only when the
     * answer changes. Default: null, the game keeps its one look.
     */
    protected theme_name(game: G): string | null {
        void game;
        return null;
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

    /**
     * `handler` runs when `widget` refuses: a press released on it, or `click()` from a key, while
     * it is disabled. This is where a game says why; touch has no hover to say it with.
     */
    protected on_refused(widget: UiElement, handler: () => void): void {
        widget.events.detach(ElementRefusedEvent);
        widget.events.attach(ElementRefusedEvent, handler);
    }

    protected set_status(text: string): void {
        this.renderer.set_status(text);
    }

    private show_game_theme(game: G, fade_seconds?: number): void {
        const name = this.theme_name(game);
        if (name !== null) {
            this.properties.show_theme(name, fade_seconds);
        }
    }

    /** Runs `on_round_finished()` when the current game has just ended. */
    private report_finished_round(): void {
        const properties = this.properties;
        const game = properties.game;
        if (
            game === null ||
            properties.is_round_reported ||
            !this.is_round_finished(game)
        ) {
            return;
        }
        properties.is_round_reported = true;
        this.on_round_finished(game);
        properties.is_dirty = true;
    }

    /**
     * A press or key on a finished round is the shell's: it starts the next round, or does nothing
     * while the end card holds. Returns whether the round was finished.
     */
    private next_round_if_finished(): boolean {
        const game = this.properties.game;
        if (game === null || !this.is_round_finished(game)) {
            return false;
        }
        if (this.is_round_end_ready) {
            this.start_next_round();
        }
        return true;
    }

    /**
     * Loads `settings.images` and the icons of the mute buttons there are, once. Every image that
     * arrives repaints, because a still game repaints only when something changed; one that fails
     * stays unpainted (`AssetManager` warns).
     */
    private load_images(): void {
        const { sound_button, music_button } = this.properties;
        const images = {
            ...this.settings.images,
            ...(sound_button && { [MUTE_ICON_NAMES.sound]: MUTE_ICONS.sound }),
            ...(music_button && { [MUTE_ICON_NAMES.music]: MUTE_ICONS.music }),
        };
        if (Object.keys(images).length === 0) {
            return;
        }
        const progress = new Progress();
        progress.listen(() => {
            this.properties.is_dirty = true;
        });
        this.references.assets.load_images(images, progress).catch(() => {
            // Already warned about; the game runs on without that picture.
        });
        const assets = this.references.assets.images;
        if (sound_button !== null) {
            sound_button.icon = assets.get(MUTE_ICON_NAMES.sound) ?? null;
        }
        if (music_button !== null) {
            music_button.icon = assets.get(MUTE_ICON_NAMES.music) ?? null;
        }
    }

    /** Loads `settings.sounds`, once; one that fails stays silent (`AssetManager` warns). */
    private load_sounds(): void {
        const sounds = this.settings.sounds;
        if (Object.keys(sounds).length === 0) {
            return;
        }
        this.references.assets.load_audio(sounds, new Progress()).catch(() => {
            // Already warned about; the game runs on without that sound.
        });
    }

    /** Starts `settings.music`, but never before the intro is over. */
    private start_music(): void {
        const music = this.settings.music;
        if (music !== null && this.is_playing) {
            this.properties.audio.play_music(music);
        }
    }

    /** A track the browser refused (no intro, so no click yet) gets another try from every gesture. */
    private bind_music_resume(signal: AbortSignal): void {
        const resume = (): void => this.properties.audio.resume_music();
        this.host.addEventListener("pointerdown", resume, { signal });
        this.host.addEventListener("keydown", resume, { signal });
    }

    /** A hidden tab stops the frame loop, so the game stands still: the track stands still with it. */
    private bind_music_hold(signal: AbortSignal): void {
        const follow_tab = (): void => {
            this.properties.audio.is_music_held = document.hidden;
        };
        follow_tab();
        document.addEventListener("visibilitychange", follow_tab, { signal });
    }

    private bind_mute_buttons(): void {
        const { sound_button, music_button } = this.properties;
        if (sound_button !== null) {
            this.on_click(sound_button, () => this.toggle_sound_mute());
        }
        if (music_button !== null) {
            this.on_click(music_button, () => this.toggle_music_mute());
        }
    }

    /** The key of a showing mute button does what the button does; returns whether it was one. */
    private mute_by_key(event: KeyboardEvent): boolean {
        const { settings, properties } = this;
        const key = event.key.toLowerCase();
        if (
            properties.sound_button?.is_visible &&
            key === settings.sound_mute_key
        ) {
            this.toggle_sound_mute();
            return true;
        }
        if (
            properties.music_button?.is_visible &&
            key === settings.music_mute_key
        ) {
            this.toggle_music_mute();
            return true;
        }
        return false;
    }

    private toggle_sound_mute(): void {
        const audio = this.properties.audio;
        audio.is_sound_muted = !audio.is_sound_muted;
        this.answer_mute_toggle();
    }

    private toggle_music_mute(): void {
        const audio = this.properties.audio;
        audio.is_music_muted = !audio.is_music_muted;
        this.answer_mute_toggle();
    }

    /** A sound, unless the sounds are muted, and the buttons repaint in their new state. */
    private answer_mute_toggle(): void {
        const name = this.settings.mute_answer_sound;
        if (name in this.settings.sounds) {
            this.properties.audio.play_sound(name);
        }
        this.properties.is_dirty = true;
    }

    /** The mute buttons show what `audio` says, however it got changed. */
    private sync_mute_buttons(): void {
        const { sound_button, music_button, audio } = this.properties;
        if (sound_button !== null) {
            sound_button.is_off = audio.is_sound_muted;
        }
        if (music_button !== null) {
            music_button.is_off = audio.is_music_muted;
        }
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
            this.report_finished_round();
            if (properties.is_round_reported) {
                if (!this.is_round_end_ready) {
                    properties.is_dirty = true;
                }
                properties.round_over_seconds += delta_seconds;
            }
            keyboard.end_frame();
            this.show_game_theme(properties.game ?? game);
            if (properties.poll_animation()) {
                // A still game only repaints when something changed, and this is something.
                properties.is_dirty = true;
            }
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
        this.sync_mute_buttons();
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
