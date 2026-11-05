import { RectI } from "../../geometries";
import { Element } from "../Element";
import { theme_font, ThemeRule } from "../theme/Theme";

/** The largest box of a checkbox without a label; games paint their own text next to it. */
const UNLABELLED_BOX_SIZE = 20;
/** Between the box and the label. */
const LABEL_GAP = 10;

/**
 * A box that toggles on a press anywhere in its rect. With a `label` the rect decides the box's
 * size, so it can be large enough for a finger, and the label stands next to it in `text_color`.
 * Without one the box stays small. `accent_color` paints the mark.
 */
export class CheckBox extends Element {
    public checked: boolean;
    /** The text next to the box; empty for none. */
    public label: string = "";

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

        const theme = this.theme_instance.get_all();
        const {
            background_color,
            border_color,
            border_width,
            border_radius,
            text_color,
            accent_color,
            text_baseline,
        } = theme;

        ctx.save();

        this.apply_transforms(ctx);

        const content_box = this.get_local_content_box_size();
        const box_size = Math.min(
            content_box.width,
            content_box.height,
            this.label === "" ? UNLABELLED_BOX_SIZE : Number.POSITIVE_INFINITY,
        );
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
            ctx.fillStyle = accent_color.toString();
            const inset = box_size / 5;
            ctx.fillRect(
                box_x + inset,
                box_y + inset,
                box_size - 2 * inset,
                box_size - 2 * inset,
            );
        }

        if (this.label !== "") {
            ctx.fillStyle = text_color.toString();
            ctx.font = theme_font(theme);
            ctx.textAlign = "left";
            ctx.textBaseline = text_baseline;
            ctx.fillText(
                this.label,
                box_x + box_size + LABEL_GAP,
                content_box.top + content_box.height / 2,
                content_box.width - box_size - LABEL_GAP,
            );
        }

        ctx.restore(); // transform
    }
}
