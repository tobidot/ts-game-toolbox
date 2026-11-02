import { SeededRandom } from "../../random/SeededRandom";

/**
 * A scheduler for timed spawns, pure and seedable. Moles, enemies, coins, raindrops: anything
 * that should appear "every so often" in a frame loop. No `setInterval`, no clock: the spawner
 * gets time through `update(delta_seconds)` like a `Timer`, so a test can push it to any moment
 * and a seed makes every rhythm reproducible.
 */
export interface SpawnerOptions {
    /** Seconds between spawns: a fixed number or a range picked with the random source. */
    interval: number | { min: number; max: number };
    /** Spawns happen while this returns true (e.g. "fewer than 3 moles up"). Default: always. */
    can_spawn?: () => boolean;
    /** Starts spawning immediately (first spawn after the first interval). Default true. */
    autostart?: boolean;
    /** The random source for ranges; default: a SeededRandom(0). */
    random?: { float(min: number, max: number): number };
    /** How many spawns one `update()` may catch up on after a long frame; default 3. */
    max_per_update?: number;
}

/**
 * Calls `factory` every interval and hands the results back from `update()`. An interval is a
 * fixed number of seconds or a range the random source picks from; `rate_multiplier` scales
 * every interval (0.5 = twice as fast) for difficulty ramps. When `can_spawn` returns false the
 * tick is skipped and the next interval starts; the spawn is not queued up.
 */
export class Spawner<T> {
    private readonly factory: () => T;
    private readonly interval: number | { min: number; max: number };
    private readonly can_spawn: () => boolean;
    private readonly random: { float(min: number, max: number): number };
    private readonly max_per_update: number;
    private _rate_multiplier = 1;
    private _seconds_until_next = 0;
    private _is_running = false;
    private _spawned_count = 0;

    public constructor(factory: () => T, options: SpawnerOptions) {
        Spawner.assert_interval(options.interval);
        this.factory = factory;
        this.interval = options.interval;
        this.can_spawn = options.can_spawn ?? (() => true);
        this.random = options.random ?? new SeededRandom(0);
        this.max_per_update = Math.max(
            1,
            Math.floor(options.max_per_update ?? 3),
        );
        this._seconds_until_next = this.roll_interval();
        if (options.autostart ?? true) this.start();
    }

    /** `true` while `update()` advances towards the next spawn. */
    public get is_running(): boolean {
        return this._is_running;
    }

    /** Seconds until the next spawn is due; 0 when one is overdue. */
    public get seconds_until_next(): number {
        return Math.max(0, this._seconds_until_next);
    }

    /** How many items were spawned since construction or the last `reset()`. */
    public get spawned_count(): number {
        return this._spawned_count;
    }

    /** Scales the interval (e.g. 0.5 = twice as fast) for difficulty ramps. */
    public get rate_multiplier(): number {
        return this._rate_multiplier;
    }

    /**
     * Sets the scale of every interval, including the one already running: a spawn that was
     * 1 s away is 0.5 s away after `rate_multiplier = 0.5`. Must be greater than 0.
     */
    public set rate_multiplier(value: number) {
        if (!(value > 0)) {
            throw new Error(
                "Spawner: the rate multiplier must be greater than 0",
            );
        }
        this._seconds_until_next *= value / this._rate_multiplier;
        this._rate_multiplier = value;
    }

    /**
     * Advances; returns the items spawned during this update (0..n, catching up after a long
     * frame but at most `max_per_update`). A backlog beyond that limit is dropped, not carried
     * into the next frame: the next spawn is a full interval away again.
     */
    public update(delta_seconds: number): T[] {
        const spawned: T[] = [];
        if (!this._is_running || !(delta_seconds > 0)) return spawned;
        this._seconds_until_next -= delta_seconds;
        // A microsecond of tolerance: 60 frames of 1/60 s add up to "almost" one second.
        while (this._seconds_until_next <= 1e-6) {
            if (spawned.length >= this.max_per_update) {
                this._seconds_until_next = this.roll_interval();
                break;
            }
            if (this.can_spawn()) {
                spawned.push(this.factory());
                this._spawned_count += 1;
            }
            this._seconds_until_next += this.roll_interval();
        }
        return spawned;
    }

    /** Runs (again); resumes the interval that was paused by `stop()`. */
    public start(): void {
        this._is_running = true;
    }

    /** Pauses; `start()` resumes where it stopped. */
    public stop(): void {
        this._is_running = false;
    }

    /** A fresh first interval and a spawn count of 0; keeps running if it was running. */
    public reset(): void {
        this._spawned_count = 0;
        this._seconds_until_next = this.roll_interval();
    }

    /** One interval in seconds, scaled by the rate multiplier. */
    private roll_interval(): number {
        const base =
            typeof this.interval === "number"
                ? this.interval
                : this.random.float(this.interval.min, this.interval.max);
        return base * this._rate_multiplier;
    }

    private static assert_interval(
        interval: number | { min: number; max: number },
    ): void {
        const ok =
            typeof interval === "number"
                ? interval > 0
                : interval.min > 0 && interval.max >= interval.min;
        if (!ok) {
            throw new Error(
                "Spawner: the interval must be > 0 seconds (a range: 0 < min <= max)",
            );
        }
    }
}

/**
 * Weighted choice helper used by the game for mole kinds; lives here because spawners want it.
 * An entry's chance is `weight / sum of weights`; entries with a weight of 0 are never picked.
 * Throws when no entry has a positive weight.
 */
export function weighted_pick<T>(
    random: { next(): number },
    entries: Array<{ item: T; weight: number }>,
): T {
    let total = 0;
    for (const entry of entries) {
        if (entry.weight > 0) total += entry.weight;
    }
    if (!(total > 0)) {
        throw new Error("weighted_pick: no entry has a positive weight");
    }
    let roll = random.next() * total;
    let last: T | undefined;
    for (const entry of entries) {
        if (!(entry.weight > 0)) continue;
        last = entry.item;
        roll -= entry.weight;
        if (roll < 0) return entry.item;
    }
    // Rounding at the very end of the range: the last positive entry.
    return last as T;
}
