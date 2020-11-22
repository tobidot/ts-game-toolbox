import { EventControllerInterface, is_controller_interface, is_event_controller_interface } from "./Controller";
import { ControllerEvent, is_controller_event } from "./ControllerEvent";
import { ControllerRouteResponse } from "./ControllerRouteResponse";
import { is_view_interface, ViewInterface } from "./View";


/**
 * <
    // MODEL_COLLECTION extends ModelCollection,
    // VIEW_COLLECTION extends ViewCollection,
    // CONTROLLER_COLLECTION extends ControllerCollection,
    // MODEL extends Model<MODEL_COLLECTION> = Model<MODEL_COLLECTION>,
    // VIEW extends View<VIEW_COLLECTION> = View<VIEW_COLLECTION>,
    // CONTROLLER extends Controller<MODEL_COLLECTION, VIEW_COLLECTION, CONTROLLER_COLLECTION> = Controller<MODEL_COLLECTION, VIEW_COLLECTION, CONTROLLER_COLLECTION>,
    >
 */
export class MvcGame {
    protected active_view: ViewInterface | null = null;
    protected active_controller: EventControllerInterface | null = null;
    protected event_queue: Array<ControllerEvent> = [];
    public ingame_time_in_seconds = 0;

    constructor() {
    }

    public update(delta_seconds: number) {
        this.ingame_time_in_seconds += delta_seconds;
        if (!this.active_controller) return;
        if (!this.active_controller.update) return;
        this.apply_controller_response(this.active_controller.update(delta_seconds));
        this.handle_events();
    }

    public handle_events() {
        let event_queue_buffer = [...this.event_queue];
        this.event_queue = [];
        event_queue_buffer = event_queue_buffer.filter((event) => {
            if (event.fire_at && event.fire_at >= this.ingame_time_in_seconds) return true;
            if (!this.active_controller) return false;
            if (!this.active_controller.dispatch_event) return false;
            this.apply_controller_response(this.active_controller.dispatch_event(event));
            return false;
        });
        this.event_queue = [...event_queue_buffer, ...this.event_queue];
    }

    public apply_controller_response(response: ControllerRouteResponse) {
        if (response === null) return;
        if (is_view_interface(response)) return this.set_active_view(response);
        if (is_event_controller_interface(response)) return this.set_active_controller(response);
        if (is_controller_event(response)) return this.event_queue.push(response);
        if (response.view !== undefined) {
            this.set_active_view(response.view);
        }
        if (response.controller !== undefined) {
            this.set_active_controller(response.controller);
        }
        if (response.events !== undefined) {
            this.event_queue.push(...response.events);
        }
    }

    public draw() {
        if (!this.active_view) return;
        if (this.active_view.update) {
            this.active_view.update();
        }
        this.active_view.draw();
    }

    protected set_active_controller(controller: EventControllerInterface | null) {
        this.active_controller = controller;
    }

    protected set_active_view(view: ViewInterface | null) {
        this.active_view = view;
    }
}