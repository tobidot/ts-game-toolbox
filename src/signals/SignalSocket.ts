import { Observable } from "./Interfaces";

/**
 * A listener to this Socket
 */
export interface Listener<T> {
    (signal: T): void;
}

/**
 * A SignalSocket provides a way to notify other parties of a change in a specific variable.
 * Compared to the #EventSocket this is only transmitting a very specific event.
 * @template T The ValueType transmitted in this socket
 */
export class SignalSocket<T> implements Observable<Listener<T>, number, T> {
    /**
     * The listeners
     */
    protected listeners: Array<Listener<T>> = [];

    /**
     * Attach a listener to the socket.
     * @param listener Callback function called when a signal is dispatched
     * @return {number} The handle to this listener, used for detaching
     */
    public attach(listener: Listener<T>): number {
        return this.listeners.push(listener) - 1;
    }

    /**
     * Trigger a change event and notify all listeners.
     * @param signal The value to transmit
     */
    public dispatch(signal: T) {
        this.listeners.forEach((listener: Listener<T>) => {
            listener(signal);
        });
    }

    /**
     * Remove a specific listener from the socket.
     * @param handle the handle returned upon attaching the listener
     * @return {boolean} TRUE if the handle was found and removed, FALSE otherwise
     */
    public detach(handle: number): boolean {
        if (!(handle in this.listeners)) return false;
        delete this.listeners[handle];
        return true;
    }

    /**
     * removes all listeners from this socket
     */
    public detach_all() {
        this.listeners = [];
    }
}
