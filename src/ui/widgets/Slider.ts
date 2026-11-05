import { RectI } from "../../geometries/Rect";
import { Vector2, Vector2I } from "../../geometries/Vector2";
import { Element } from "../Element";
import { theme_font, ThemeRule } from "../theme/Theme";

const TRACK_HEIGHT = 8;
const THUMB_RADIUS = 10;
/** Where the track runs, down the rect: the text stands above it. */
const TRACK_SHARE = 0.7;

/**
 * A value between `min` and `max`, set by a drag. Its title stands above the track on the left, the
 * value on the right. The theme carries the look: `background_color` is the track, `accent_color`
 * the part up to the thumb, `text_color` the text and the thumb, `border_color` and `border_width`
 * the thumb's outline.
 */
export class Slider extends Element {
    public title: string;
    public min: number;
    public max: number;
    public value: number;
    /** How the value reads next to the title. Default: two decimals. */
    public format: (value: number) => string = (value) => value.toFixed(2);

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

        const theme = this.theme_instance.get_all();
        const {
            background_color,
            accent_color,
            border_color,
            border_width,
            text_color,
        } = theme;

        ctx.save();
        this.apply_transforms(ctx);

        const box = this.get_local_content_box_size();
        const center_y = box.top + box.height * TRACK_SHARE;
        const track_top = center_y - TRACK_HEIGHT / 2;
        const round = TRACK_HEIGHT / 2;
        const progress = Math.max(
            0,
            Math.min(1, (this.value - this.min) / (this.max - this.min)),
        );
        const thumb_x = box.left + progress * box.width;

        ctx.fillStyle = background_color.toString();
        ctx.beginPath();
        ctx.roundRect(box.left, track_top, box.width, TRACK_HEIGHT, round);
        ctx.fill();

        ctx.fillStyle = accent_color.toString();
        ctx.beginPath();
        ctx.roundRect(
            box.left,
            track_top,
            Math.max(TRACK_HEIGHT, progress * box.width),
            TRACK_HEIGHT,
            round,
        );
        ctx.fill();

        ctx.fillStyle = text_color.toString();
        ctx.beginPath();
        ctx.arc(thumb_x, center_y, THUMB_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        if (border_width > 0) {
            ctx.lineWidth = border_width;
            ctx.strokeStyle = border_color.toString();
            ctx.stroke();
        }

        ctx.font = theme_font(theme);
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(this.title, box.left, box.top);
        ctx.textAlign = "right";
        ctx.fillText(this.format(this.value), box.left + box.width, box.top);

        ctx.restore(); // transform
    }
}
