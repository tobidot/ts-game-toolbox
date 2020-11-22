import { ControllerRouteResponse } from "./ControllerRouteResponse";
import { MvcGame } from "./MvcGame";

export abstract class MvcCanvasGame<MODELS, VIEWS, CONTROLLERS> extends MvcGame {
    protected canvas: HTMLCanvasElement;
    protected models: MODELS;
    protected views: VIEWS;
    protected controllers: CONTROLLERS;

    constructor() {
        super();
        const canvas = document.getElementById('canvas');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas not found");
        this.canvas = canvas;
        const models = this.create_models();
        const views = this.create_views(canvas);
        const controllers = this.create_controllers(models, views);
        this.models = models;
        this.views = views;
        this.controllers = controllers;
        this.attach_event_listeners();
        this.apply_controller_response(this.start());
    }

    protected attach_event_listeners(): void {
        this.canvas.addEventListener("keydown", (event) => {
            if (!this.active_controller) return;
            if (this.active_controller.key_pressed) {
                this.apply_controller_response(this.active_controller.key_pressed(event));
            }
        });
        this.canvas.addEventListener("click", (event) => {
            if (!this.active_controller) return;
            if (this.active_controller.mouse_pressed) {
                const x = (event.x - this.canvas.offsetLeft) * this.canvas.width / this.canvas.clientWidth;
                const y = (event.y - this.canvas.offsetTop) * this.canvas.height / this.canvas.clientHeight;
                const response = this.active_controller.mouse_pressed(event, x, y);
                this.apply_controller_response(response);
            }
        });
    }

    protected abstract start(): ControllerRouteResponse;
    protected abstract create_models(): MODELS;
    protected abstract create_views(canvas: HTMLCanvasElement): VIEWS;
    protected abstract create_controllers(models: MODELS, views: VIEWS): CONTROLLERS;
}
