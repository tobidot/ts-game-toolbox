import { SignalSocket } from "./SignalSocket";


export class ObservableSocket<T> extends SignalSocket<{ old: T, new: T }> {
    constructor(private value: T) {
        super();
    }

    public trigger_event() { throw new Error('Do not call this directly'); }

    public set(new_value: T): void {
        super.trigger_event({
            old: this.value,
            new: new_value,
        });
        this.value = new_value;
    }

    public get(): T {
        return this.value;
    }
};