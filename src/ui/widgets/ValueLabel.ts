import { RectI } from "../../geometries/Rect";
import { Element } from "../Element";

export class ValueLabel extends Element {
    public label: string;
    public value: string | number;

    public constructor(
        label: string,
        value: string | number,
        rect: RectI,
        is_visible: boolean = true,
    ) {
        super(rect, is_visible);
        this.label = label;
        this.value = value;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = "#000";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(
            `${this.label}: ${this.value}`,
            this.rect.left,
            this.rect.top,
        );
    }
}
