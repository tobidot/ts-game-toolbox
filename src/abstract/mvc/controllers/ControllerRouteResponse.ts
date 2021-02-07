import { ControllerEvent } from "../events/ControllerEvent";
import { ViewInterface } from "../views/View";
import { EventControllerInterface } from "./Controller";

export type ControllerRouteResponse = null | ViewInterface | EventControllerInterface | ControllerEvent | ControllerRouteResponseType;

export interface ControllerRouteResponseType {
    view?: ViewInterface | null;
    controller?: EventControllerInterface | null;
    events?: Array<ControllerEvent>;
}