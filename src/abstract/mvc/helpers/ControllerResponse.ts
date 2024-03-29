import { is_event_controller_interface } from "../controllers/Controller";
import { ControllerRouteResponseType, ControllerRouteResponse } from "../controllers/ControllerRouteResponse";
import { is_controller_event } from "../events/ControllerEvent";
import { is_view_interface } from "../views/View";


export function update_controller_response<T extends ControllerRouteResponseType>(base: T, response: ControllerRouteResponse): T {
    if (response === null) {
        return base;
    }
    if (is_view_interface(response)) {
        base.view = response;
        return base;
    }
    if (is_event_controller_interface(response)) {
        base.controller = response;
        return base;
    }
    if (is_controller_event(response)) {
        if (base.events === undefined) base.events = [];
        base.events.push(response);
        return base;
    }
    base.controller = response.controller;
    base.view = response.view;
    if (response.events !== undefined) {
        if (base.events === undefined) base.events = [];
        base.events.push(...response.events);
    }
    return base;
}