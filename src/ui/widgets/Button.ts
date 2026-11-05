import { RectI } from "../../geometries";
import { Element } from "../Element";
import { ellipsize_text } from "../text";
import { theme_font, ThemeRule, ThemeTextAlign } from "../theme/Theme";

/** One cell of a button's text, see `Button.columns`. */
export interface ButtonColumn {
    text: string;
    /** How much of the width inside the padding it gets, 0 to 1. */
    share: number;
    /** Default: the theme's `text_align`. */
    align?: ThemeTextAlign;
}

/**
 * Something to press, with a text. The theme's `text_align` places it; a button is centered unless
 * a rule says otherwise. A row with several things to say sets `columns` instead of `label`.
 */
export class Button extends Element {
    public label: string;
    /** Instead of `label`: cells side by side, each aligned in its own share of the width. */
    public columns: readonly ButtonColumn[] | null = null;
    /** Between the edge and a text that isn't centered. */
    public text_padding: number = 10;
    /** A text too wide for its place is squeezed, or ends in `…`, which keeps the letters' shape. */
    public text_overflow: "squeeze" | "ellipsis" = "squeeze";

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
        if (!this.is_visible) {
            return;
        }

        const theme = this.theme_instance.get_all();
        const { text_color, text_align, text_baseline } = theme;

        ctx.save();

        this.apply_transforms(ctx);
        this.draw_background(ctx);

        const content_rect = this.get_local_content_box_size();
        ctx.fillStyle = text_color.toString();
        ctx.font = theme_font(theme);
        ctx.textBaseline = text_baseline;
        const y =
            text_baseline === "middle"
                ? content_rect.top + content_rect.height / 2
                : text_baseline === "top"
                  ? content_rect.top
                  : content_rect.top + content_rect.height;
        if (this.columns !== null) {
            this.draw_columns(ctx, this.columns, content_rect, y, text_align);
        } else if (text_align === "center") {
            ctx.textAlign = "center";
            ctx.fillText(
                this.label,
                content_rect.left + content_rect.width / 2,
                y,
            );
        } else {
            const inner_width = content_rect.width - 2 * this.text_padding;
            this.draw_cell(
                ctx,
                this.label,
                content_rect.left + this.text_padding,
                inner_width,
                y,
                text_align,
            );
        }

        ctx.restore(); // transform
    }

    private draw_columns(
        ctx: CanvasRenderingContext2D,
        columns: readonly ButtonColumn[],
        content_rect: RectI,
        y: number,
        text_align: ThemeTextAlign,
    ): void {
        const inner_width = content_rect.width - 2 * this.text_padding;
        let left = content_rect.left + this.text_padding;
        for (const column of columns) {
            const width = inner_width * column.share;
            this.draw_cell(
                ctx,
                column.text,
                left,
                width,
                y,
                column.align ?? text_align,
            );
            left += width;
        }
    }

    /** One text aligned in its cell, squeezed rather than running over what is next to it. */
    private draw_cell(
        ctx: CanvasRenderingContext2D,
        text: string,
        left: number,
        width: number,
        y: number,
        align: ThemeTextAlign,
    ): void {
        ctx.textAlign = align;
        const x =
            align === "center"
                ? left + width / 2
                : align === "right"
                  ? left + width
                  : left;
        if (this.text_overflow === "ellipsis") {
            ctx.fillText(ellipsize_text(ctx, text, width), x, y);
        } else {
            ctx.fillText(text, x, y, width);
        }
    }
}
