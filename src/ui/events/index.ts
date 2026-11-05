import { EventBase } from "../../signals";
import { Vector2I } from "../../geometries";
import type { Element } from "../Element";

export class ElementChangeEvent extends EventBase {
    public static readonly EVENT_NAME = "element.change";

    constructor(public readonly element: Element) {
        super(ElementChangeEvent.EVENT_NAME);
    }
}

export class ElementClickEvent extends EventBase {
    public static readonly EVENT_NAME = "element.click";

    constructor(
        public readonly element: Element,
        public readonly coords: Vector2I | null = null,
    ) {
        super(ElementClickEvent.EVENT_NAME);
    }
}

/** A press was released on a disabled element, or `click()` was called on one: nothing happened. */
export class ElementRefusedEvent extends EventBase {
    public static readonly EVENT_NAME = "element.refused";

    constructor(public readonly element: Element) {
        super(ElementRefusedEvent.EVENT_NAME);
    }
}
