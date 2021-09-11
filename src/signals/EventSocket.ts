import { Class } from "..";
import { Observable } from "./Interfaces";

/**
 * Base class for all events that can be thrown
 */
export class EventBase {
    /**
     * 
     * @param event_name The unique identifier for the event
     */
    constructor(
        public readonly event_name: string
    ) { }
}

/**
 * The method beeing called for a given Eventtype
 */
export type EventCallback<T extends EventBase> = (event: T) => void;

/**
 * An EventSocket provides an easy way to 
 */
export class EventSocket<T extends EventBase>
    implements Observable<Listener<T>, number, T>
{
    /**
     * The list of listeners attached
     */
    protected listeners: Array<Listener<T> | undefined> = [];

    /**
     * Dispatches an event to all listeners that are listening to this specific event.
     * 
     * @param event The dispatched event
     */
    public dispatch(event: T): void {
        this.listeners.forEach((next: Listener<T> | undefined) => {
            if (!next) return;
            if (event.event_name !== next.type.event_name) return;
            next.callback(event);
        });
    }

    /**
     * Attaches a new Eventlistener to this Eventsocket.
     * 
     * @param listener The Listener to attach
     */
    public attach(listener: Listener<T>): number;
    /**
     * Attaches a new Eventlistener to this Eventsocket.
     * 
     * @param type The EventClass to listen for
     * @param callback The function to call when event occurs
     */
    public attach<EVENT extends T>(
        type: EventClass<EVENT>,
        callback: EventCallback<EVENT>,
    ): number;
    public attach<EVENT extends T>(
        type: EventClass<EVENT> | Listener<T>,
        callback?: EventCallback<EVENT>,
    ): number {
        if (!!callback) {
            this.attach({
                type: type as EventClass<EVENT>,
                // i cannot staticly ensure that a listener for event A gets called with event B.
                // But this will be ensured in the dispatch method.
                // so i have to tell the compiler this is ok.
                callback: callback as EventCallback<T>,
            });
        }
        const listener = type as Listener<T>;
        return this.listeners.push(listener) - 1;
    };

    /**
     * 
     */
    public detach<EVENT extends T>(identifier: EventClass<EVENT> | number): boolean {
        if (typeof identifier === "number") {
            if (!(identifier in this.listeners)) return false;
            delete this.listeners[identifier];
            return true;
        }
        let one_hit = false;
        for (let i = 0; i < this.listeners.length; ++i) {
            const listener = this.listeners[i];
            if (!listener) continue;
            if (listener.type.event_name !== identifier.event_name) continue;
            delete this.listeners[i];
            one_hit = true;
        }
        return one_hit;
    }

    public detach_all() {
        this.listeners = [];
    }

}



/**
 * @internal
 * The abstract class of an event
 */
type EventClass<T extends EventBase> = Class<T> & {
    readonly event_name: string;
};

/**
 * @internal
 * The internal listener object
 */
interface Listener<T extends EventBase> {
    type: EventClass<T>,
    callback: EventCallback<T>,
}