import { RectI } from "../../geometries";
import { Element } from "../Element";
import { wrap_text } from "../text";
import { theme_font, ThemeRule, ThemeTextBaseline } from "../theme/Theme";

export class Label extends Element {
    public text: string;
    /** Breaks the text into lines inside its box instead of squeezing it into one. */
    public is_wrapped: boolean = false;
    /** From one line of a wrapped text to the next, as a share of the font size. */
    public line_spacing: number = 1.25;

    public constructor(
        text: string,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.text = text;
        this.type = "label";
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        const theme = this.theme_instance.get_all();
        const { text_color, text_align, text_baseline } = theme;

        ctx.save();
        this.apply_transforms(ctx);
        this.draw_background(ctx);

        ctx.fillStyle = text_color.toString();
        ctx.font = theme_font(theme);
        ctx.textAlign = text_align;
        ctx.textBaseline = text_baseline;

        const content_box = this.get_local_content_box_size();
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

        if (this.is_wrapped) {
            this.draw_lines(ctx, x, y, theme.font_size, text_baseline);
        } else {
            // Squeezed rather than running out of the box and over whatever is next to it.
            ctx.fillText(this.text, x, y, content_box.width);
        }
        ctx.restore(); // transform
    }

    /** The lines around `y` as the baseline says: from it, centred on it or up to it. */
    private draw_lines(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        font_size: number,
        text_baseline: ThemeTextBaseline,
    ): void {
        const width = this.rect.width;
        const lines = wrap_text(ctx, this.text, width);
        const step = font_size * this.line_spacing;
        const height = (lines.length - 1) * step;
        const shift =
            text_baseline === "middle"
                ? -height / 2
                : text_baseline === "bottom"
                  ? -height
                  : 0;
        lines.forEach((line, index) => {
            ctx.fillText(line, x, y + shift + index * step, width);
        });
    }
}
