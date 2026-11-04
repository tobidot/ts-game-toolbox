/**
 * Timers for frame loops. A frame loop hands every system a `delta_seconds` (the time since the
 * last frame); a `Timer` adds those up and tells you when a duration has passed, no matter
 * whether the frames came in at 60 per second or in one 2-second hiccup. A `Cooldown` is the
 * other direction: something was used, and it is not ready again until the time has run down.
 */
export interface TimerOptions {
    /** Start over when the duration is reached instead of stopping; default `false`. */
    repeat?: boolean;
    /** Run right after construction; default `false` (call `start()`). */
    autostart?: boolean;
}

/**
 * Counts `duration` seconds of frame deltas. One-shot by default: `update()` returns 1 once,
 * then the timer is done and stops. Repeating: every full duration counts as one completion
 * and the rest carries over, so a big frame step can complete a timer several times.
 */
export class Timer {
    /** The length of one run in seconds; never changes, make a new timer for a new duration. */
    public readonly duration: number;
    private readonly repeat: boolean;
    private _elapsed = 0;
    private _completions = 0;
    private _is_running = false;
    private _is_done = false;

    public constructor(duration_seconds: number, options: TimerOptions = {}) {
        if (!(duration_seconds > 0)) {
            throw new Error(
                "Timer: the duration must be greater than 0 seconds",
            );
        }
        this.duration = duration_seconds;
        this.repeat = options.repeat ?? false;
        if (options.autostart) {
            this.start();
        }
    }

    /** Seconds into the current run, 0..duration. */
    public get elapsed(): number {
        return this._elapsed;
    }

    /** Seconds until the current run completes. */
    public get remaining(): number {
        return this.duration - this._elapsed;
    }

    /** 0..1 through the current run, clamped. */
    public get progress(): number {
        return Math.min(1, Math.max(0, this._elapsed / this.duration));
    }

    /** How many times the timer has completed since the last `reset()`. */
    public get completions(): number {
        return this._completions;
    }

    public get is_running(): boolean {
        return this._is_running;
    }

    /** A one-shot timer that reached its duration; a repeating timer is never done. */
    public get is_done(): boolean {
        return this._is_done;
    }

    /**
     * Rises 0..1 over the first run and falls 1..0 over the second, then again: two durations
     * per round trip. The marker of a sweep, the breathing of a glow.
     */
    public get ping_pong(): number {
        const progress = this.progress;
        return this._completions % 2 === 0 ? progress : 1 - progress;
    }

    /** Runs (again); a finished one-shot timer starts over from 0. */
    public start(): void {
        if (this._is_done) {
            this.reset();
        }
        this._is_running = true;
    }

    /** Pauses; `start()` resumes where it stopped. */
    public stop(): void {
        this._is_running = false;
    }

    /** Back to 0 and not done; keeps running if it was running. */
    public reset(): void {
        this._elapsed = 0;
        this._completions = 0;
        this._is_done = false;
    }

    /**
     * Advances by a frame delta. Returns how many times the timer completed during this update:
     * 0, 1, or more when repeating and the delta spans several durations.
     */
    public update(delta_seconds: number): number {
        if (!this._is_running || !(delta_seconds > 0)) {
            return 0;
        }
        this._elapsed += delta_seconds;
        if (this._elapsed < this.duration) {
            return 0;
        }
        if (!this.repeat) {
            this._elapsed = this.duration;
            this._completions += 1;
            this._is_done = true;
            this._is_running = false;
            return 1;
        }
        const completions = Math.floor(this._elapsed / this.duration);
        this._elapsed -= completions * this.duration;
        this._completions += completions;
        return completions;
    }
}

/**
 * Blocks an action for a while after it was used: `try_use()` succeeds when ready and starts
 * the wait; `update()` runs the wait down. Ready from the start.
 */
export class Cooldown {
    /** How long a use blocks, in seconds. */
    public readonly seconds: number;
    private _remaining = 0;

    public constructor(seconds: number) {
        if (!(seconds >= 0)) {
            throw new Error("Cooldown: the duration must be 0 seconds or more");
        }
        this.seconds = seconds;
    }

    public get is_ready(): boolean {
        return this._remaining <= 0;
    }

    /** Seconds until ready; 0 when ready. */
    public get remaining(): number {
        return this._remaining;
    }

    /** 0 right after a use, 1 when ready again: the fill of a recharge bar. */
    public get progress(): number {
        if (this.seconds <= 0) {
            return 1;
        }
        return Math.min(1, Math.max(0, 1 - this._remaining / this.seconds));
    }

    /** Runs the wait down by a frame delta. */
    public update(delta_seconds: number): void {
        if (!(delta_seconds > 0) || this._remaining <= 0) {
            return;
        }
        this._remaining = Math.max(0, this._remaining - delta_seconds);
    }

    /** `true` and starts the wait when ready; `false` (and nothing else) while blocked. */
    public try_use(): boolean {
        if (!this.is_ready) {
            return false;
        }
        this._remaining = this.seconds;
        return true;
    }

    /** Ready immediately. */
    public reset(): void {
        this._remaining = 0;
    }
}
