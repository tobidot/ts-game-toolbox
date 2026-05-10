import { RectI } from "../../geometries";
import { Vector2I } from "../../geometries";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class Button extends Element {
    public label: string;

    public constructor(
        label: string,
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.label = label;
    }

    public override on_click(coords: Vector2I): void {
        this.dispatch_click_event(coords);
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = this.is_down
            ? this.theme.activeColor
            : this.is_hovered
              ? this.theme.hoverColor
              : this.theme.backgroundColor;
        ctx.fillRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );

        ctx.strokeStyle = this.theme.borderColor;
        ctx.strokeRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );

        ctx.fillStyle = this.theme.textColor;
        ctx.font = this.theme.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
            this.label,
            this.rect.left + this.rect.width / 2,
            this.rect.top + this.rect.height / 2,
        );
    }
}
