import {EventBase} from "../../signals";
import {Vector2I} from "../../geometries";
import type {Element} from "../Element";

export class ElementChangeEvent extends EventBase {
    public static readonly event_name = "element.change";

    constructor(
        public readonly element: Element,
    ) {
        super(ElementChangeEvent.event_name);
    }
}

export class ElementClickEvent extends EventBase {
    public static readonly event_name = "element.click";

    constructor(
        public readonly element: Element,
        public readonly coords: Vector2I,
    ) {
        super(ElementClickEvent.event_name);
    }
}
