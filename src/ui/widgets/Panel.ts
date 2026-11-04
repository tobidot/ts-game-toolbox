import { RectI } from "../../geometries";
import { ThemeRule } from "../theme/Theme";
import { Group } from "../Group";
import { Element } from "../Element";

export class Panel extends Group {
    public constructor(
        children: Array<Element>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(children, rect, is_visible, theme_rules);
        this.type = "panel";
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        const { border_color, border_width, border_radius, background_color } =
            this.theme_instance.get_all();

        ctx.save();

        this.context_transform_to_local(ctx);

        const border_box = this.get_local_border_box_size();
        ctx.beginPath();
        if (border_radius > 0) {
            ctx.roundRect(
                border_box.left,
                border_box.top,
                border_box.width,
                border_box.height,
                border_radius,
            );
        } else {
            ctx.rect(
                border_box.left,
                border_box.top,
                border_box.width,
                border_box.height,
            );
        }

        ctx.fillStyle = background_color.toString();
        ctx.fill();

        if (border_width > 0) {
            ctx.lineWidth = border_width;
            ctx.strokeStyle = border_color.toString();
            ctx.stroke();
        }

        ctx.restore(); // transform

        super.draw(ctx);
    }
}
