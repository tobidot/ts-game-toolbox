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
    constructor(
        protected value: T
    ) {
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
     * Sets a new value for the socket and emits a ObserverSignal with the change
     * @param new_value new value for the parameter
     * @return The new Value
     */
    public set(new_value: T): T {
        super.dispatch({
            old: this.value,
            new: new_value,
        });
        return this.value = new_value;
    }

    /**
     * Returns the current value
     * @returns The current value
     */
    public get(): T {
        return this.value;
    }
};

/**
 * The change signal
 */
interface ObserverSignal<T> {
    old: T,
    new: T,
}