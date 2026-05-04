import {RectI} from "../../geometries/Rect";
import {Element} from "../Element";

export class Label extends Element {

    public text: string;

    public constructor(
        text: string,
        rect: RectI,
        is_visible: boolean = true,
    ) {
        super(rect, is_visible);
        this.text = text;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = '#000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(this.text, this.rect.left, this.rect.top);
    }

}
