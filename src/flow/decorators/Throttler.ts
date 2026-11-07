import { WithDefaultSettings } from "../../helpers";

/**
 * --------------------------------------------------------------------------------
 * 								Strategy
 * --------------------------------------------------------------------------------
 *
 * The first call after a rest runs at once (or after `wake_up_ms`). Calls that come
 * while it runs, or within `delay_ms` after it, wait and share one more run, so the
 * callback runs at most once per `delay_ms` however often it's called.
 */

/**
 * The possible settings for a throttler.
 */
interface Settings<PARAMETERS extends Array<any>, RESULT> {
    /**
     * The strategy to use for throttling.
     */
    strategy: ThrottleStrategy;
    /**
     * After a rest, how long to wait before the first run. The last (or first, see
     * `use_last_args`) arguments of that wait are used.
     */
    wake_up_ms: number;
    /**
     * How long after a run ends before the next may start.
     */
    delay_ms: number;
    /**
     * The function that is being throttled.
     */
    callback: (...args: PARAMETERS) => Promise<RESULT>;
}

/** Calls waiting for the same run, and what they'll be told. */
interface Batch<PARAMETERS, RESULT> {
    args: PARAMETERS;
    promise: Promise<RESULT>;
    resolve: (result: RESULT) => void;
    reject: (reason: unknown) => void;
}

/**
 * Runs an expensive callback at most once per `delay_ms`, however often it is asked
 * to: a slider that fires on every pointer move, a resize, a search box.
 */
export class Throttler<PARAMETERS extends Array<any>, RESULT> {
    public static readonly STRATEGIES = {
        /**
         * Calls that come while it waits or runs share one more run, with the last
         * call's arguments: what was asked for last always happens. The default.
         */
        latest: {
            queue_when_running: true,
            use_last_args: true,
        } as ThrottleStrategy,
        /**
         * Calls while the callback runs get that run's promise, and their arguments
         * are dropped. Calls while it waits share one more run, with the last arguments.
         */
        combine: {
            queue_when_running: false,
            use_last_args: true,
        } as ThrottleStrategy,
    };
    public static readonly DEFAULT_SETTINGS = {
        strategy: Throttler.STRATEGIES.latest,
        wake_up_ms: 0,
        delay_ms: 33,
    };

    /**
     * The settings for this throttler.
     */
    public settings: Settings<PARAMETERS, RESULT>;

    private running: Promise<RESULT> | null = null;
    private pending: Batch<PARAMETERS, RESULT> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private last_end_ms: number = -Infinity;

    public constructor(
        settings: WithDefaultSettings<
            Throttler<PARAMETERS, RESULT>,
            typeof Throttler
        >,
    ) {
        this.settings = Object.assign({}, Throttler.DEFAULT_SETTINGS, settings);
    }

    /** True while a run is going or one is waiting. */
    public get is_busy(): boolean {
        return this.running !== null || this.pending !== null;
    }

    /**
     * Asks for a run. The promise gives the result of the run these arguments
     * ended up in.
     */
    public run(...args: PARAMETERS): Promise<RESULT> {
        const { strategy, delay_ms, wake_up_ms } = this.settings;
        if (this.pending !== null) {
            if (strategy.use_last_args) {
                this.pending.args = args;
            }
            return this.pending.promise;
        }
        if (this.running !== null) {
            if (!strategy.queue_when_running) {
                return this.running;
            }
            // Scheduled when the run ends.
            return this.wait(args).promise;
        }
        const since_ms = Date.now() - this.last_end_ms;
        if (since_ms < delay_ms) {
            const batch = this.wait(args);
            this.schedule(delay_ms - since_ms);
            return batch.promise;
        }
        if (wake_up_ms > 0) {
            const batch = this.wait(args);
            this.schedule(wake_up_ms);
            return batch.promise;
        }
        return this.execute(args);
    }

    private wait(args: PARAMETERS): Batch<PARAMETERS, RESULT> {
        let resolve: (result: RESULT) => void = () => {};
        let reject: (reason: unknown) => void = () => {};
        const promise = new Promise<RESULT>((on_resolve, on_reject) => {
            resolve = on_resolve;
            reject = on_reject;
        });
        this.pending = { args, promise, resolve, reject };
        return this.pending;
    }

    private schedule(ms: number): void {
        this.timer = setTimeout(() => {
            this.timer = null;
            const batch = this.pending;
            this.pending = null;
            if (batch !== null) {
                this.execute(batch.args).then(batch.resolve, batch.reject);
            }
        }, ms);
    }

    private execute(args: PARAMETERS): Promise<RESULT> {
        // Async, so a callback that throws at once rejects like one that fails later.
        const run = (async () => this.settings.callback(...args))();
        this.running = run;
        const settle = () => {
            this.running = null;
            this.last_end_ms = Date.now();
            if (this.pending !== null && this.timer === null) {
                this.schedule(this.settings.delay_ms);
            }
        };
        run.then(settle, settle);
        return run;
    }
}

/**
 * The strategy to use for throttling.
 */
interface ThrottleStrategy {
    /**
     * A call while the callback runs:
     * TRUE => waits, and runs after it and the delay, with the others that waited.
     * FALSE => gets the running call's promise; its arguments are dropped.
     */
    queue_when_running: boolean;
    /**
     * Calls that wait together share one run:
     * TRUE => with the last call's arguments.
     * FALSE => with the first call's arguments.
     */
    use_last_args: boolean;
}
