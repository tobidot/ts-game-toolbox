import { RectI } from "../../geometries/Rect";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class ValueLabel extends Element {
    public label: string;
    public value: string | number;

    public constructor(
        label: string,
        value: string | number,
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.label = label;
        this.value = value;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = this.theme.textColor;
        ctx.font = this.theme.labelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(
            `${this.label}: ${this.value}`,
            this.rect.left,
            this.rect.top,
        );
    }
}
