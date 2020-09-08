export interface Listener<T> {
    (signal: T): void;
}

export class SignalSocket<T> {
    private listeners: Array<Listener<T>> = [];
    public add(listener: Listener<T>): void {
        this.listeners.push(listener);
    }
    public remove(listener: Listener<T>): void {
        const index: number = this.listeners.indexOf(listener);
        if (index < 0) return;
        const length = this.listeners.length;
        this.listeners[index] = this.listeners[length - 1];
        this.listeners.pop();
    }
    public trigger_event(signal: T) {
        this.listeners.forEach((listener: Listener<T>) => {
            listener(signal);
        });
    }
}