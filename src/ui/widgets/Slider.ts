import { RectI } from "../../geometries/Rect";
import { Vector2, Vector2I } from "../../geometries/Vector2";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class Slider extends Element {
    public title: string;
    public min: number;
    public max: number;
    public value: number;

    public constructor(
        title: string,
        min: number,
        max: number,
        value: number,
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.title = title;
        this.min = min;
        this.max = max;
        this.value = value;
    }

    public override drag(
        _start_coords: Vector2 | null,
        current_coords: Vector2I,
    ): boolean {
        this.set_value(current_coords.x);
        return true;
    }

    public set_value(x: number) {
        const relative_x = (x - this.rect.left) / this.rect.width;
        const new_value =
            this.min +
            (this.max - this.min) * Math.max(0, Math.min(1, relative_x));
        if (new_value !== this.value) {
            this.value = new_value;
            this.dispatch_change_event();
        }
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        // Draw track
        const track_height = 4;
        const track_y = this.rect.top + this.rect.height / 2 - track_height / 2;
        ctx.fillStyle = this.theme.backgroundColor;
        ctx.fillRect(this.rect.left, track_y, this.rect.width, track_height);

        // Draw thumb
        const progress = (this.value - this.min) / (this.max - this.min);
        const thumb_width = 10;
        const thumb_height = 20;
        const thumb_x =
            this.rect.left + progress * this.rect.width - thumb_width / 2;
        const thumb_y = this.rect.top + this.rect.height / 2 - thumb_height / 2;

        ctx.fillStyle = this.is_down
            ? this.theme.activeColor
            : this.is_hovered
              ? this.theme.hoverColor
              : this.theme.backgroundColor;
        ctx.fillRect(thumb_x, thumb_y, thumb_width, thumb_height);
        ctx.strokeStyle = this.theme.borderColor;
        ctx.strokeRect(thumb_x, thumb_y, thumb_width, thumb_height);

        // Draw title and value
        ctx.fillStyle = this.theme.textColor;
        ctx.font = this.theme.secondaryFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            `${this.title}: ${this.value.toFixed(2)}`,
            this.rect.left,
            track_y - 5,
        );
    }
}
