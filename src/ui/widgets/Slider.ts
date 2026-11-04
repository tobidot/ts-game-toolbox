import { RectI } from "../../geometries/Rect";
import { Vector2, Vector2I } from "../../geometries/Vector2";
import { Element } from "../Element";
import { ThemeRule } from "../theme/Theme";

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
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.title = title;
        this.min = min;
        this.max = max;
        this.value = value;
        this.type = "slider";
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
        if (!this.is_visible) {
            return;
        }

        const {
            background_color,
            border_color,
            border_width,
            border_radius,
            text_color,
            font_size,
            font_family,
            text_baseline,
        } = this.theme_instance.get_all();

        ctx.save();
        this.apply_transforms(ctx);

        const content_box = this.get_local_content_box_size();
        const border_box = this.get_local_border_box_size();

        // Draw track
        const track_height = 4;
        const track_y =
            content_box.top + content_box.height / 2 - track_height / 2;
        ctx.fillStyle = background_color.toString();
        ctx.fillRect(content_box.left, track_y, border_box.width, track_height);

        // Draw thumb
        const progress = (this.value - this.min) / (this.max - this.min);
        const thumb_width = 10;
        const thumb_height = 20;
        const thumb_x =
            content_box.left + progress * border_box.width - thumb_width / 2;
        const thumb_y =
            content_box.top + content_box.height / 2 - thumb_height / 2;

        const color = background_color;

        ctx.beginPath();
        if (border_radius > 0) {
            ctx.roundRect(
                thumb_x,
                thumb_y,
                thumb_width,
                thumb_height,
                Math.min(border_radius, thumb_width / 2),
            );
        } else {
            ctx.rect(thumb_x, thumb_y, thumb_width, thumb_height);
        }

        ctx.fillStyle = color.toString();
        ctx.fill();

        if (border_width > 0) {
            ctx.lineWidth = border_width;
            ctx.strokeStyle = border_color.toString();
            ctx.stroke();
        }

        // Draw title and value
        ctx.fillStyle = text_color.toString();
        ctx.font = `${font_size}px ${font_family}`;
        ctx.textAlign = "left";
        ctx.textBaseline = text_baseline;
        ctx.fillText(
            `${this.title}: ${this.value.toFixed(2)}`,
            this.rect.left,
            text_baseline === "middle"
                ? track_y - 10
                : text_baseline === "top"
                  ? this.rect.top
                  : track_y - 5,
        );

        ctx.restore(); // transform
    }
}
