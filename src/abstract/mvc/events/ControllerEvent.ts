export interface ControllerEvent {
    event_name: string;
    fire_at?: number;
}

export function is_controller_event(object: any): object is ControllerEvent {
    return is_controller_event(object);
}

export function is_specific_controller_event<T extends ControllerEvent>(object: any, name: T["event_name"]): object is T {
    return is_controller_event(object) && (!name || object.event_name === name);
}
