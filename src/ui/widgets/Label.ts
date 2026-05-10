import { RectI } from "../../geometries/Rect";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class Label extends Element {
    public text: string;

    public constructor(
        text: string,
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.text = text;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = this.theme.text_color;
        ctx.font = this.theme.label_font;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(this.text, this.rect.left, this.rect.top);
    }
}
