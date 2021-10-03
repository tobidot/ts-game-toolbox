import { throw_expression } from "..";

/**
 * Wrap a canvas object to provide some helper methods or usefull drawing calls
 */
export class CanvasHelper {
    public context: CanvasRenderingContext2D;

    constructor(
        public readonly canvas: HTMLCanvasElement
    ) {
        this.context = this.getContext();
    }

    /**
     * Definetly returns a render Context and throws an expresssion if unable.
     * @returns CanvasRenderingContext2D
     */
    public getContext(): CanvasRenderingContext2D {
        if (this.context) return this.context;
        return this.context = this.canvas.getContext("2d") ?? throw_expression("Could not create Context");
    }
}
