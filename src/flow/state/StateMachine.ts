/**
 * What one state of a `StateMachine` does. Every handler is optional; a state without handlers
 * is a plain label the machine can sit in.
 */
export interface StateHandlers<S extends string, C> {
    /** Called when the machine arrives in this state; `from` is `null` for the initial state. */
    enter?(context: C, from: S | null): void;
    /** Called when the machine leaves this state, before the next state's `enter`. */
    exit?(context: C, to: S): void;
    /** Returns the next state to transition to, or nothing to stay. */
    update?(context: C, delta_seconds: number): S | void;
}

/** Called after every completed transition; `from` is `null` for the initial `enter`. */
export type TransitionListener<S extends string> = (
    from: S | null,
    to: S,
) => void;

/**
 * A small finite state machine over string states, with one shared context object. Every state
 * has an enter / exit / update contract; `update` may return the next state. Phases of a game
 * ("entering", "checking", "won") stay explicit this way instead of being spread over boolean
 * flags.
 *
 * The initial state's `enter` runs in the constructor, with `from === null`.
 */
export class StateMachine<S extends string, C> {
    private _current: S;
    private _previous: S | null = null;
    private _seconds_in_state = 0;
    private readonly listeners: Array<TransitionListener<S>> = [];

    public constructor(
        private readonly states: Record<S, StateHandlers<S, C>>,
        initial: S,
        private readonly context: C,
    ) {
        this._current = initial;
        this.handlers(initial).enter?.(this.context, null);
        this.notify(null, initial);
    }

    /** The state the machine is in. */
    public get current(): S {
        return this._current;
    }

    /** The state before the last transition, `null` until the first transition. */
    public get previous(): S | null {
        return this._previous;
    }

    /** Time accumulated by `update` since the current state was entered. */
    public get seconds_in_state(): number {
        return this._seconds_in_state;
    }

    /** `true` while the machine is in the given state. */
    public is(state: S): boolean {
        return this._current === state;
    }

    /**
     * Leaves the current state (`exit`) and enters `to` (`enter`), then notifies the listeners.
     * Transitioning to the current state re-enters it: exit, enter, timer reset.
     */
    public transition(to: S): void {
        if (!(to in this.states)) {
            throw new Error(`StateMachine: unknown state "${to}"`);
        }
        const from = this._current;
        this.handlers(from).exit?.(this.context, to);
        this._previous = from;
        this._current = to;
        this._seconds_in_state = 0;
        this.handlers(to).enter?.(this.context, from);
        this.notify(from, to);
    }

    /**
     * Advances the state timer and runs the current state's `update`. When that returns a
     * state, exactly one transition follows; the new state's `update` waits for the next call.
     */
    public update(delta_seconds: number): void {
        this._seconds_in_state += delta_seconds;
        const next = this.handlers(this._current).update?.(
            this.context,
            delta_seconds,
        );
        if (next !== undefined) {
            this.transition(next);
        }
    }

    /** Registers a listener for every transition; returns the function that removes it again. */
    public on_transition(listener: TransitionListener<S>): () => void {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        };
    }

    private handlers(state: S): StateHandlers<S, C> {
        return this.states[state];
    }

    private notify(from: S | null, to: S): void {
        // Copy: a listener may unsubscribe itself while being called.
        for (const listener of [...this.listeners]) {
            listener(from, to);
        }
    }
}
