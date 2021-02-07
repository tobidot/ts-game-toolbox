import { ViewCollectionBase } from "../Collections";
import { View } from "./View";

export class CanvasView<COLLECTION extends ViewCollectionBase> extends View<COLLECTION> {
    protected context: CanvasRenderingContext2D;
    public constructor(public canvas: HTMLCanvasElement, collection: COLLECTION) {
        super(collection);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("could not create context");
        this.context = ctx;
    }
    protected reset_canvas_state() {
        this.context.font = "32px monospace";
        this.context.textAlign = "left";
        this.context.fillStyle = "black";
        this.context.strokeStyle = "white";
    }
}