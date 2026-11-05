import { RectI } from "../../geometries";
import { Element } from "../Element";
import { ThemeRule } from "../theme/Theme";

export class ValueLabel extends Element {
    public label: string;
    public value: string | number;

    public constructor(
        label: string,
        value: string | number,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.label = label;
        this.value = value;
        this.type = "value_label";
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        const {
            text_color,
            font_size,
            font_family,
            text_align,
            text_baseline,
        } = this.theme_instance.get_all();

        ctx.save();

        this.apply_transforms(ctx);
        this.draw_background(ctx);

        const content_box = this.get_local_content_box_size();

        ctx.fillStyle = text_color.toString();
        ctx.font = `${font_size}px ${font_family}`;
        ctx.textAlign = text_align;
        ctx.textBaseline = text_baseline;

        let x = content_box.left;
        if (text_align === "center") {
            x = content_box.left + content_box.width / 2;
        } else if (text_align === "right") {
            x = content_box.left + content_box.width;
        }

        let y = content_box.top;
        if (text_baseline === "middle") {
            y = content_box.top + content_box.height / 2;
        } else if (text_baseline === "bottom") {
            y = content_box.top + content_box.height;
        }

        ctx.fillText(`${this.label}: ${this.value}`, x, y, content_box.width);

        ctx.restore(); // transform
    }
}
