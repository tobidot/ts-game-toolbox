import { ControllerEvent } from "../events/ControllerEvent";
interface TimeProvider {
    ingame_time_in_seconds: number
}

export function event(event: string | ControllerEvent, time_provider: TimeProvider): ControllerEventConstructor {
    return new ControllerEventConstructor(event, time_provider);
}


export class ControllerEventConstructor implements ControllerEvent {
    public event_name: string;
    public fire_at?: number;

    constructor(public event: string | ControllerEvent, protected time_provide: TimeProvider) {
        if (typeof event === "string") {
            this.event_name = event;
        } else {
            this.event_name = event.event_name;
            Object.assign(this, event);
        }
    }

    public after_x_seconds(seconds: number): this {
        this.fire_at = this.time_provide.ingame_time_in_seconds + seconds;
        return this;
    }

    public set_data(data: any) {
        Object.assign(this, data);
        return this;
    }
}