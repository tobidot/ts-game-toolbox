import { RectI } from "../../geometries";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class Panel extends Element {
    public color: string | null;

    public constructor(
        rect: RectI,
        color: string | null = null,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.color = color;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.fillStyle = this.color ?? this.theme.panel_color;
        ctx.fillRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );
        ctx.strokeStyle = this.theme.border_color;
        ctx.strokeRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );
    }
}
