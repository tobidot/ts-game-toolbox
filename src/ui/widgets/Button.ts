import { RectI } from "../../geometries";
import { Vector2I } from "../../geometries";
import { Element } from "../Element";
import { ThemeRule } from "../theme/Theme";

export class Button extends Element {
    public label: string;

    public constructor(
        label: string,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.label = label;
        this.type = "button";
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        const {
            text_color,
            font_size,
            font_family,
            text_baseline,
        } = this.theme_instance.get_all()

        ctx.save();

        this.apply_transforms(ctx);
        this.draw_background(ctx);

        const content_rect = this.get_local_content_box_size();
        ctx.fillStyle = text_color.toString();
        ctx.font = `${font_size}px ${font_family}`;
        ctx.textAlign = "center";
        ctx.textBaseline = text_baseline;
        ctx.fillText(
            this.label,
            content_rect.left + content_rect.width / 2,
            text_baseline === "middle"
                ? content_rect.top + content_rect.height / 2
                : text_baseline === "top"
                  ? content_rect.top
                  : content_rect.top + content_rect.height,
        );

        ctx.restore(); // transform
    }
}
