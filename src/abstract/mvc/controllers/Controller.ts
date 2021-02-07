import { ControllerCollectionBase, ModelCollectionBase, ViewCollectionBase } from "../Collections";
import { ControllerEvent } from "../events/ControllerEvent";
import { ControllerRouteResponse, ControllerRouteResponseType } from "./ControllerRouteResponse";

export interface ControllerInterface {

}
export class Controller<
    MODEL_COLLECTION extends ModelCollectionBase,
    VIEW_COLLECTION extends ViewCollectionBase,
    CONTROLLER_COLLECTION extends ControllerCollectionBase
    > implements ControllerInterface {
    public constructor(
        protected models: MODEL_COLLECTION,
        protected views: VIEW_COLLECTION,
        protected controllers: CONTROLLER_COLLECTION,
    ) {

    }
}

export function is_controller_interface(controller: any): controller is ControllerInterface {
    return controller instanceof Controller;
}
export interface EventControllerInterface {
    key_up?: (event: KeyboardEvent) => ControllerRouteResponse;
    key_down?: (event: KeyboardEvent) => ControllerRouteResponse;
    key_pressed?: (event: KeyboardEvent) => ControllerRouteResponse;
    mouse_up?: (event: MouseEvent, canvas_x: number, canvas_y: number) => ControllerRouteResponse;
    mouse_down?: (event: MouseEvent, canvas_x: number, canvas_y: number) => ControllerRouteResponse;
    mouse_pressed?: (event: MouseEvent, canvas_x: number, canvas_y: number) => ControllerRouteResponse;
    mouse_moved?: (event: MouseEvent, canvas_x: number, canvas_y: number) => ControllerRouteResponse;
    update?: (delta_seconds: number) => ControllerRouteResponse;
    custom_event?: (event: ControllerEvent) => ControllerRouteResponse;
}

export function is_event_controller_interface(controller: any): controller is EventControllerInterface {
    return controller instanceof Controller;
}