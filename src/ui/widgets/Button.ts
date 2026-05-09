import {RectI} from "../../geometries";
import {Vector2I} from "../../geometries";
import {Element} from "../Element";

export class Button extends Element {
    public label: string;

    public constructor(
        label: string,
        rect: RectI,
        is_visible: boolean = true,
    ) {
        super(rect, is_visible);
        this.label = label;
    }

    public override on_click(coords: Vector2I): void {
        this.dispatch_click_event(coords);
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = this.is_down ? '#666' : (this.is_hovered ? '#999' : '#ccc');
        ctx.fillRect(this.rect.left, this.rect.top, this.rect.width, this.rect.height);

        ctx.strokeStyle = '#333';
        ctx.strokeRect(this.rect.left, this.rect.top, this.rect.width, this.rect.height);

        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.label, this.rect.left + this.rect.width / 2, this.rect.top + this.rect.height / 2);
    }

}
