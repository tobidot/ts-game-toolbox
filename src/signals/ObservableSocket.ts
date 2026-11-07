import { SignalSocket } from "./SignalSocket";

/**
 * Create a property as an observable,
 * wich allows other objects to hook into this socket and listen to changes
 * on this property
 */
export class ObservableSocket<T> extends SignalSocket<ObserverSignal<T>> {
    /**
     *
     * @param value The initial value
     */
    constructor(protected value: T) {
        super();
    }

    /**
     * This function should not be used directly it will be triggerd from the #set function
     * @internal
     */
    public dispatch(signal: ObserverSignal<T>) {
        super.dispatch(signal);
    }

    /**
     * Sets a new value and tells the listeners, which already read the new value from `get()`.
     * A value equal to the current one (`Object.is`) is stored and tells nobody.
     * @param new_value new value for the parameter
     * @return The new Value
     */
    public set(new_value: T): T {
        const old = this.value;
        this.value = new_value;
        if (!Object.is(old, new_value)) {
            super.dispatch({ old, new: new_value });
        }
        return new_value;
    }

    /**
     * Attaches a listener and calls it at once with the current value (`old` and `new` the same),
     * so a widget shows the value from the start without a second line for it.
     * @return The handle, for `detach()`
     */
    public watch(listener: (signal: ObserverSignal<T>) => void): number {
        const handle = this.attach(listener);
        listener({ old: this.value, new: this.value });
        return handle;
    }

    /**
     * Returns the current value
     * @returns The current value
     */
    public get(): T {
        return this.value;
    }
}

/**
 * The change signal
 */
export interface ObserverSignal<T> {
    old: T;
    new: T;
}
