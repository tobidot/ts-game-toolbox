import { RectI } from "../../geometries";
import { Vector2I } from "../../geometries";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class CheckBox extends Element {
    public title: string;
    public checked: boolean;

    public constructor(
        title: string,
        checked: boolean,
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.title = title;
        this.checked = checked;
    }

    public override on_click(_coords: Vector2I): void {
        this.checked = !this.checked;
        this.dispatch_change_event();
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        const box_size = Math.min(this.rect.width, this.rect.height, 20);
        const box_x = this.rect.left;
        const box_y = this.rect.top + (this.rect.height - box_size) / 2;

        ctx.fillStyle = this.is_down
            ? this.theme.activeColor
            : this.is_hovered
              ? this.theme.hoverColor
              : this.theme.backgroundColor;
        ctx.fillRect(box_x, box_y, box_size, box_size);

        ctx.strokeStyle = this.theme.borderColor;
        ctx.strokeRect(box_x, box_y, box_size, box_size);

        if (this.checked) {
            ctx.fillStyle = this.theme.textColor;
            ctx.fillRect(box_x + 4, box_y + 4, box_size - 8, box_size - 8);
        }

        ctx.fillStyle = this.theme.textColor;
        ctx.font = this.theme.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
            this.title,
            box_x + box_size + 10,
            this.rect.top + this.rect.height / 2,
        );
    }
}
