import { RectI } from "../../geometries";
import { Element } from "../Element";
import { ThemeRule } from "../theme/Theme";

export class CheckBox extends Element {
    public checked: boolean;

    public constructor(
        checked: boolean,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.checked = checked;
        this.type = "checkbox";
    }

    public override dispatch_click_event() {
        this.checked = !this.checked;
        super.dispatch_click_event();
        this.dispatch_change_event();
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
        } = this.theme_instance.get_all();

        ctx.save();

        this.apply_transforms(ctx);

        const content_box = this.get_local_content_box_size();
        const box_size = Math.min(content_box.width, content_box.height, 20);
        const box_x = content_box.left;
        const box_y = content_box.top + (content_box.height - box_size) / 2;

        const color = background_color;

        ctx.beginPath();
        if (border_radius > 0) {
            ctx.roundRect(
                box_x,
                box_y,
                box_size,
                box_size,
                Math.min(border_radius, box_size / 2),
            );
        } else {
            ctx.rect(box_x, box_y, box_size, box_size);
        }

        ctx.fillStyle = color.toString();
        ctx.fill();

        if (border_width > 0) {
            ctx.lineWidth = border_width;
            ctx.strokeStyle = border_color.toString();
            ctx.stroke();
        }

        if (this.checked) {
            ctx.fillStyle = text_color.toString();
            ctx.fillRect(box_x + 4, box_y + 4, box_size - 8, box_size - 8);
        }

        ctx.restore(); // transform
    }
}
