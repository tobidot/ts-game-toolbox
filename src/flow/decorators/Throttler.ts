import assert from "assert";
import { WithDefaultSettings } from "../../helpers";
import { assert_never } from "../asserts/AssertNever";
import { sleep } from "../async/Sleep";
import { assert_ok } from "../asserts/AssertOk";

/**
 * --------------------------------------------------------------------------------
 * 								Strategy
 * --------------------------------------------------------------------------------
 * 
 * When the throttler is called, it could be in one of the following states:
 * - SLEEPING: The throttler is sleeping and not attempting to run any function right now.
 * - AWAKENING: The throttler is waiting for the wake_up_ms to pass.
 * - READY: The throttler is ready to run the function.
 * - RUNNING: The throttler is running the function.
 * - DELAYING: The throttler is waiting for the delay_ms to pass.
 * 
 * 
*/


/**
 * The possible settings for a throttler.
 */
interface Settings<PARAMETERS extends Array<any>, RESULT> {
    /**
     * The strategy to use for throttling.
     */
    strategy: ThrottleStrategy,
    /**
     * The amout of ms to wait before the function should first run (when not being throttled).
     */
    wake_up_ms: number,
    /**
     * The amount of ms to wait before the function should run again.
     */
    delay_ms: number,
    /**
     * The function that is being throttled.
     */
    callback: (...args: PARAMETERS) => Promise<RESULT>;
}

/**
 * A decorator that throttles a function call.
 * @param strategy The strategy to use for throttling.
 * @param delay_ms The amount of ms to wait before the function should run again.
 */
export class Throttler<PARAMETERS extends Array<any>, RESULT> {
    public static readonly STRATEGIES: { [key: string]: ThrottleStrategy } = {
        /**
         * The first function call will be executed.
         * Calls during awake and running get the same promise returend.
         * (using the first call's arguments)
         */
        COMBINE: {
            queue_when_running: false,
            use_last_args: true,
        }
    }
    public static readonly default_settings = {
        strategy: Throttler.STRATEGIES.COMBINE,
        wake_up_ms: 0,
        delay_ms: 33,
    }

    /**
     * The settings for this throttler.
     */
    public settings: Settings<PARAMETERS, RESULT>;
    /**
     * Some logic calls to the throttler.
     */
    public logic: Logic<PARAMETERS, RESULT>;
    /**
     * The properties for this throttler.
     */
    public props: Properties<PARAMETERS, RESULT>;

    /**
     * Creates a new throttler.
     * @param callback 
     * @param settings 
     */
    public constructor(
        settings: WithDefaultSettings<Throttler<PARAMETERS, RESULT>, typeof Throttler>
    ) {
        this.settings = Object.assign({}, Throttler.default_settings, settings);
        this.logic = new Logic(this);
        this.props = new Properties(this);
    }

    /**
     * Attempts to call the function.
     * @param args 
     * @returns 
     */
    public async run(...args: PARAMETERS): Promise<RESULT> {
        const promise = this.logic.run(...args);
        return await promise;
    }

}

class Properties<PARAMETERS extends Array<any>, RESULT> {
    /** The state the throttler is currently in */
    public state: State = State.READY;
    /** The time the state last changed */
    public last_state_change_at: number = performance.now();
    /** The args given to the currently running call */
    public callback_args: PARAMETERS | null = null;
    /** The promise returned by the callback */
    public callback_promise: Promise<RESULT> | null = null;
    /** The last result returned by the callback */
    public callback_result: RESULT | null = null;
    /** The promise to when the throttler is awakened */
    public awakening_promise: Promise<PARAMETERS> | null = null;
    /** The promise to when the throttler is delayed */
    public delay_promise: Promise<void> | null = null;

    public constructor(
        public parent: Throttler<any, any>,
    ) {

    }
}



class Logic<PARAMETERS extends Array<any>, RESULT> {
    public constructor(
        public parent: Throttler<PARAMETERS, RESULT>,
    ) {

    }

    /**
     * Attempts to call the function.
     * @param args 
     * @returns 
     */
    public async run(...args: PARAMETERS): Promise<RESULT> {
        switch (this.parent.props.state) {
            case State.SLEEPING:
            case State.AWAKENING:
                // If the throttler is sleeping, wake it up and run the function again.
                return this.wake_up(...args).then((use_args) => this.run(...use_args));
            case State.READY:
            case State.RUNNING:
                return this.run_now(...args);
            case State.DELAYING:
                // If the throttler is delaying wait before calling the function again.
                return await this.delay().then(() => this.run(...args));
            default: 
                return assert_never(this.parent.props.state);
        }
    }

    /**
     * Start the wake up process for this throttler.
     * @param args 
     * @returns 
     */
    public async wake_up(...args: PARAMETERS): Promise<PARAMETERS> {
        if (this.parent.settings.strategy.use_last_args) {
            // while waking up the callback, always override the callback args, so the last before run will be used.
            this.parent.props.callback_args = args;
        } else {
            // while waking up the callback, only write the args if not yet set, so the first before run will be used.
            this.parent.props.callback_args = this.parent.props.callback_args || args;
        }
        if (this.parent.props.state === State.AWAKENING) {
            assert_ok(this.parent.props.awakening_promise, "The throttler is awakening but has no awakening promise.");
            // if the throttler is already awakening, return the promise to when it has awoken.
            return this.parent.props.awakening_promise;
        }
        assert_ok(this.parent.props.state === State.SLEEPING, "Unexpected call to wake_up when the throttler is not sleeping.");
        // mark the throttler as awakening.
        this.set_state(State.AWAKENING);
        this.parent.props.awakening_promise = sleep(this.parent.settings.wake_up_ms)
            .then(() => {
                assert_ok(this.parent.props.callback_args, "The throttler has awoken but has no callback args are set.");
                return this.parent.props.callback_args
            });
        const use_args = await this.parent.props.awakening_promise;
        // mark the throttler as ready.
        this.set_state(State.READY);
        this.parent.props.awakening_promise = null;
        return use_args;
    }

    /**
     * Promise a delay before running the callback again.
     * @returns 
     */
    public async delay(): Promise<void> {
        if (this.parent.props.state === State.DELAYING) {
            assert_ok(this.parent.props.delay_promise, "The throttler is delayed but has no delay promise.");
            // if the throttler is already delaying, return the promise to when it has awoken.
            return this.parent.props.delay_promise;
        }
        assert_ok(this.parent.props.state === State.RUNNING, "Unexpected call to delay when the throttler is not running.");
        // mark the throttler as delaying.
        this.set_state(State.DELAYING);
        this.parent.props.delay_promise = sleep(this.parent.settings.delay_ms);
        await this.parent.props.delay_promise;
        // mark the throttler as sleeping. (It will not go into sleep as this should be called while a throttling occured.)
        this.set_state(State.READY);
        this.parent.props.delay_promise = null;
    }

    /**
     * Runs the callback now.
     * @param args 
     * @returns 
     */
    public async run_now(...args: PARAMETERS): Promise<RESULT> {
        if (this.parent.props.state === State.RUNNING) {
            assert_ok(this.parent.props.callback_promise, "The throttler is running but has no callback promise.");
            if (this.parent.settings.strategy.queue_when_running) {
                // if the callback is currently running attempt to call again, after it has finished.
                return this.parent.props.callback_promise.then(() => this.run_now(...args));
            }
            // if the callback is currently running, return the promise to when it has finished.
            return this.parent.props.callback_promise;
        }
        if (this.parent.settings.strategy.use_last_args) {
            // while running the callback, the args are the first call's args.
            this.parent.props.callback_args = args;
        }
        try {
            this.set_state(State.RUNNING);
            this.parent.props.callback_args = args;
            this.parent.props.callback_promise = this.parent.settings.callback(...this.parent.props.callback_args);
            this.parent.props.callback_result = await this.parent.props.callback_promise;
            return this.parent.props.callback_result;
        } finally {
            this.parent.props.callback_promise = null;
            this.delay();
        }
    }

    /**
     * Sets the new state for the throttler. And updates the last state change time.
     * @param state The new state to change to.
     */
    public set_state(state: State) {
        this.parent.props.state = state;
        this.parent.props.last_state_change_at = performance.now();
    }
}


/**
 * The strategy to use for throttling.
 * 
 */
interface ThrottleStrategy {
    /**
     * Queue another callback while the callback is actively running?
     * TRUE => Queue the callback and run it when the current callback is done and throttle delay is waited.
     * FALSE => Combine the call with the currently running callback returning the same promise.
     */ 
    queue_when_running: boolean,
    /**
     * When combining calls, should the last call's arguments be used?
     * TRUE => Use the last call's arguments.
     * FALSE => Use the first call's arguments.
     */
    use_last_args: boolean,
}


enum State {
    SLEEPING,
    AWAKENING,
    READY,
    RUNNING,
    DELAYING,
}