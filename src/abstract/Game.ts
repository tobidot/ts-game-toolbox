import p5 from "p5";
import { View, Model, Controller, ViewManager } from "./ModelViewComposer";

export class Game<MODEL extends Model, VIEW_MANAGER extends ViewManager, CONTROLLER extends Controller<MODEL, VIEW_MANAGER>>{
    public model?: MODEL;
    public view_manager?: VIEW_MANAGER;
    public controller?: CONTROLLER;

    constructor() {

    }

    public preload() {

    }

    public init(p: p5) {

    }

    public update(dt: number) {
        if (this.controller) this.controller.update(dt);
    }

    public draw() {
        if (this.controller) this.controller?.draw();
    }

}