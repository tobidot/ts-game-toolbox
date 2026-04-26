import { throw_expression } from "../flow/expressions/ThrowExpression";

/**
 * Wrap a canvas object to provide some helper methods or usefull drawing calls
 */
export class CanvasHelper {
    protected _context: CanvasRenderingContext2D | null = null;

    constructor(
        public readonly element: HTMLCanvasElement
    ) {
    }

    /**
     * Definetly returns a render Context and throws an expresssion if unable.
     * @returns CanvasRenderingContext2D
     */
    public get context(): CanvasRenderingContext2D {
        if (this._context && !this._context.isContextLost()) {
            return this._context;
        }
        return this._context = this.element.getContext("2d") ?? throw_expression("Could not create Context");
    }
}
