import { Vector2I } from "../../geometries/Vector2";
import { EventBase } from "../../signals/EventSocket";
import { PhysicsBody } from "./PhysicsBody";

/**
 * Two bodies met in a step: `a` always moves, `b` moves or is still. A `PhysicsWorld` sends these
 * after the step, never during it, so a listener may remove either body.
 */
export class ContactEvent<D = unknown> extends EventBase {
    public static readonly EVENT_NAME = "physics.contact";

    public constructor(
        public readonly a: PhysicsBody<D>,
        public readonly b: PhysicsBody<D>,
        /** A unit vector from `b` towards `a`. */
        public readonly normal: Vector2I,
        /** How fast they closed along `normal`, in units per second, before the contact took it. */
        public readonly speed: number,
    ) {
        super(ContactEvent.EVENT_NAME);
    }
}
