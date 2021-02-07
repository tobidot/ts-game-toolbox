import { ChainProperty } from "../../../signals/ChainProperty";
import { ModelCollectionBase, ViewCollectionBase, ControllerCollectionBase } from "../Collections";
import { Controller, EventControllerInterface } from "./Controller";
import { ControllerRouteResponseType } from "./ControllerRouteResponse";
import { PromisableController } from "./PromiseController";

export class DelayController<
    MODEL_COLLECTION extends ModelCollectionBase,
    VIEW_COLLECTION extends ViewCollectionBase,
    CONTROLLER_COLLECTION extends ControllerCollectionBase>
    extends
    Controller<MODEL_COLLECTION, VIEW_COLLECTION, CONTROLLER_COLLECTION>
    implements
    PromisableController, EventControllerInterface {

    public next: (() => ControllerRouteResponseType) | null = null;

    public trigger_at = new ChainProperty<this, number>(this, 0);

    public update() {
        if (performance.now() > this.trigger_at.get()) {
            if (this.next) return this.next();
        }
        return null;
    }

    public mouse_pressed(_: MouseEvent) {
        if (this.next) return this.next();
        return null;
    }
}