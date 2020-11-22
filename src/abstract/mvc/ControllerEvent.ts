export interface ControllerEvent {
    event_name: string;
    fire_at?: number;
}

export function is_controller_event(object: any): object is ControllerEvent {
    return typeof object === "object" && "event_name" in object;
}