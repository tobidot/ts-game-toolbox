import { play_video_splash } from "../dom/VideoSplash";

/** `waiting`: the start screen asks for a click or key, so the intro may play with sound. */
export type IntroState = "pending" | "waiting" | "playing" | "done";

export interface IntroStartOptions {
    /** False skips the intro: the gate goes straight to `done`. Default true. */
    is_enabled?: boolean;
    /** Every state change while this connection lasts, for repainting and a status line. */
    on_change?: (state: IntroState) => void;
}

export interface IntroGateOptions {
    /** Where the intro video comes from; called once, when it is about to play. */
    load_url: () => Promise<string>;
    /** Give up on the video after this long. Default 6000. */
    timeout_ms?: number;
    /** Keep the last frame this long after the end. Default 1500. */
    hold_ms?: number;
    /** Behind a video that does not cover the container. Default "#111111". */
    background?: string;
    /** A failed intro (no library, no network, no codec); the game starts anyway. */
    on_error?: (error: unknown) => void;
}

/**
 * The opening of a browser game: a start screen, then an intro video with sound, then a short
 * hold on its last frame. Browsers play sound only after the visitor clicked or typed on the
 * page, so without that "user activation" the gate first waits for one (`waiting`); the
 * element paints its start screen meanwhile and passes the first click or key to `leave()`.
 *
 * Every way out ends in `done`: the video ended, was skipped, timed out, failed or was refused
 * (then it is retried muted). The game never depends on the intro. Aborting the signal given to
 * `start()` (an element being disconnected) stops the video and returns to `pending`, so the
 * next `start()` plays it again.
 */
export class IntroGate {
    private _state: IntroState = "pending";
    private $container: HTMLElement | null = null;
    private signal: AbortSignal | null = null;
    private on_change: IntroStartOptions["on_change"];

    public constructor(private readonly options: IntroGateOptions) {}

    public get state(): IntroState {
        return this._state;
    }

    /** True once the intro is over (or was never wanted): the game may take input. */
    public get is_done(): boolean {
        return this._state === "done";
    }

    /** True while the start screen should be shown. */
    public get is_waiting(): boolean {
        return this._state === "waiting";
    }

    /**
     * Called on every connection. The first time, it plays at once when the page already has a
     * user activation, waits for one otherwise, or skips straight to `done` when `is_enabled`
     * is false. Later calls only remember the new container, signal and listener.
     */
    public start(
        $container: HTMLElement,
        signal: AbortSignal,
        options: IntroStartOptions = {},
    ): void {
        this.$container = $container;
        this.signal = signal;
        this.on_change = options.on_change;
        signal.addEventListener("abort", () => this.on_abort(), { once: true });
        if (this._state !== "pending") {
            return;
        }
        if (options.is_enabled === false) {
            this.set_state("done");
        } else if (IntroGate.has_user_activation()) {
            void this.play();
        } else {
            this.set_state("waiting");
        }
    }

    /**
     * The click or key on the start screen. Returns true when it was consumed (the gate was
     * waiting); that gesture is what allows the sound, and it must not also act in the game.
     */
    public leave(): boolean {
        if (this._state !== "waiting") {
            return false;
        }
        void this.play();
        return true;
    }

    /** Whether the browser will play sound now: the visitor has clicked or typed on this page. */
    public static has_user_activation(): boolean {
        // older browsers have no `userActivation`: treat them as not activated
        return navigator.userActivation?.hasBeenActive ?? false;
    }

    private async play(): Promise<void> {
        const $container = this.$container;
        const signal = this.signal;
        if ($container === null || signal === null || signal.aborted) {
            return;
        }
        this.set_state("playing");
        try {
            const url = await this.options.load_url();
            if (signal.aborted) {
                return;
            }
            const options = {
                timeout_ms: this.options.timeout_ms ?? 6000,
                hold_ms: this.options.hold_ms ?? 1500,
                background: this.options.background,
                signal,
            };
            let outcome = await play_video_splash($container, url, {
                ...options,
                muted: false,
            });
            // A browser that still refuses sound gets the intro muted rather than not at all.
            if (outcome === "blocked") {
                outcome = await play_video_splash($container, url, options);
            }
            if (outcome === "aborted") {
                return;
            }
        } catch (error) {
            this.options.on_error?.(error);
        }
        if (signal.aborted) {
            return;
        }
        this.set_state("done");
    }

    private on_abort(): void {
        if (this._state === "playing") {
            this.set_state("pending");
        }
    }

    private set_state(state: IntroState): void {
        if (this._state === state) {
            return;
        }
        this._state = state;
        this.on_change?.(state);
    }
}
