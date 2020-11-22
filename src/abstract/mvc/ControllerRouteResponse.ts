import { EventControllerInterface } from "./Controller";
import { ControllerEvent } from "./ControllerEvent";
import { ViewInterface } from "./View";

export type ControllerRouteResponse = null | ViewInterface | EventControllerInterface | ControllerEvent | ControllerRouteResponseType;

export interface ControllerRouteResponseType {
    view?: ViewInterface | null;
    controller?: EventControllerInterface | null;
    events?: Array<ControllerEvent>;
}