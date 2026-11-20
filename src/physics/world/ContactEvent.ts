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

/**
 * A world's bodies moved in a step, before the contacts are pushed apart: a game's own constraints
 * on the bodies (a puppet's ragdoll joints, since step 44) go here, once per even step. `seconds` is
 * the step's.
 */
export class WorldStepEvent extends EventBase {
    public static readonly EVENT_NAME = "physics.step";

    public constructor(public readonly seconds: number) {
        super(WorldStepEvent.EVENT_NAME);
    }
}
