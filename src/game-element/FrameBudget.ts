/** The thresholds a `FrameBudget` holds a game to; every one has a default in `FRAME_BUDGET`. */
export interface FrameBudgetSettings {
    /** The FPS shown and judged are averaged over this long, in seconds. */
    readonly window_seconds: number;
    /** Below this, nothing new: `is_full`. */
    readonly full_below_fps: number;
    /** `is_full` ends again at this: a few frames of room, so a notice doesn't flicker. */
    readonly room_from_fps: number;
    /** Below this, the oldest fade out (`is_fading`) ... */
    readonly fade_below_fps: number;
    /** ... until the frame rate is back over this. Two thresholds, so it doesn't flicker on and off. */
    readonly fade_until_fps: number;
    /** How fast they fade: this share of them a second ... */
    readonly fade_share_per_second: number;
    /** ... but at least this many a second. */
    readonly fade_at_least: number;
    /** `carried` counts what the game held at this or more: 60 FPS but for one dropped frame in the window. */
    readonly record_fps: number;
    /** A frame longer than this, in seconds, is a background tab or a breakpoint, not the game's doing: not counted. */
    readonly ignore_frame_seconds: number;
}

/**
 * The defaults: a game held to 60 FPS on every screen. Comparing with the screen's own rate
 * would let a 144 Hz screen look overloaded at 100 FPS.
 */
export const FRAME_BUDGET: FrameBudgetSettings = {
    window_seconds: 0.5,
    full_below_fps: 50,
    room_from_fps: 55,
    fade_below_fps: 40,
    fade_until_fps: 50,
    fade_share_per_second: 0.2,
    fade_at_least: 30,
    record_fps: 58,
    ignore_frame_seconds: 0.25,
};

/** Thirty frames of 1/60 s add up to a hair under half a second; this much short still counts as full. */
const WINDOW_SLACK = 1e-9;

interface Frame {
    readonly seconds: number;
    readonly count: number;
}

/**
 * Holds a game with many things on screen (shapes, zombies) to a frame rate: it says whether
 * the device takes more (`is_full`), whether the oldest should fade until it keeps up again
 * (`is_fading`, `fade_count()`), and how many it carried at full speed (`carried`, for a
 * record). It only sees the frame lengths fed to it, so a test can feed any series. Feed it
 * the frame's real length (`properties.frame_seconds`), not the capped delta `update()` gets.
 */
export class FrameBudget {
    public readonly settings: FrameBudgetSettings;
    private frames: Frame[] = [];
    private seconds = 0;
    private full = false;
    private fading = false;
    /** Things owed to the fade from earlier frames, as a fraction. */
    private fade_owed = 0;

    public constructor(settings: Partial<FrameBudgetSettings> = {}) {
        this.settings = { ...FRAME_BUDGET, ...settings };
    }

    /** One frame of `frame_seconds`, with `count` things in the game. */
    public feed(frame_seconds: number, count: number): void {
        const settings = this.settings;
        if (
            !(frame_seconds > 0) ||
            frame_seconds > settings.ignore_frame_seconds
        ) {
            return;
        }
        this.frames.push({ seconds: frame_seconds, count });
        this.seconds += frame_seconds;
        while (
            this.frames.length > 1 &&
            this.seconds - this.frames[0].seconds >=
                settings.window_seconds - WINDOW_SLACK
        ) {
            this.seconds -= this.frames[0].seconds;
            this.frames.shift();
        }
        const fps = this.fps;
        if (fps === null) {
            return;
        }
        if (fps < settings.full_below_fps) {
            this.full = true;
        } else if (fps >= settings.room_from_fps) {
            this.full = false;
        }
        if (fps < settings.fade_below_fps) {
            this.fading = true;
        } else if (fps > settings.fade_until_fps) {
            this.fading = false;
            this.fade_owed = 0;
        }
    }

    /** Frames per second over the window; null until a whole window has been seen. */
    public get fps(): number | null {
        if (this.seconds < this.settings.window_seconds - WINDOW_SLACK) {
            return null;
        }
        return this.frames.length / this.seconds;
    }

    /** Nothing new: the device doesn't keep up. */
    public get is_full(): boolean {
        return this.full;
    }

    /** The oldest fade out until the device keeps up again. */
    public get is_fading(): boolean {
        return this.fading;
    }

    /** The fewest things in the window when it ran at `record_fps` or more: what the device carried. Null when it didn't. */
    public get carried(): number | null {
        const fps = this.fps;
        if (fps === null || fps < this.settings.record_fps) {
            return null;
        }
        let fewest = Infinity;
        for (const frame of this.frames) {
            fewest = Math.min(fewest, frame.count);
        }
        return fewest;
    }

    /** How many of `count` fade out in a frame of `delta_seconds`; 0 unless fading. */
    public fade_count(count: number, delta_seconds: number): number {
        if (!this.fading || count === 0) {
            return 0;
        }
        const settings = this.settings;
        const per_second = Math.max(
            settings.fade_at_least,
            count * settings.fade_share_per_second,
        );
        this.fade_owed += per_second * delta_seconds;
        const faded = Math.min(count, Math.floor(this.fade_owed));
        this.fade_owed -= faded;
        return faded;
    }

    /** Forgets every frame: after a switch, the new set-up is judged on its own frames. */
    public reset(): void {
        this.frames = [];
        this.seconds = 0;
        this.full = false;
        this.fading = false;
        this.fade_owed = 0;
    }
}
