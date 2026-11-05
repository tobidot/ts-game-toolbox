import { RectI, Vector2I } from "../geometries";
import { theme_font, ThemeProperties } from "../ui/theme/Theme";
import { Slider } from "../ui/widgets/Slider";
import { slider_house_rules } from "./CanvasGameProperties";
import { HouseColors } from "./CanvasGameSettings";

export interface HouseSliderOptions {
    /**
     * Where the name and value go. `"above"`: the name left and the value right over the track,
     * for wide panels. `"left"`: "H 179" in a column left of the track, for compact rows.
     * Default `"above"`.
     */
    label?: "above" | "left";
    /** Width of the `"left"` label column. Default 64. */
    label_width?: number;
    /** Own colors, whatever the page's theme says. Default: the page's slider rules. */
    colors?: HouseColors;
}

const THUMB_RADIUS = 10;

/**
 * The toolbox `Slider` with its name and whole-number value, and half a thumb of room at both ends
 * of the track, or the label in a column on the left. It draws through `Slider`, and the theme
 * carries the look as for any slider. With the label on the left the value follows the track, not
 * the whole rect.
 */
export class HouseSlider extends Slider {
    private readonly label: "above" | "left";
    private readonly label_width: number;

    public constructor(
        title: string,
        min: number,
        max: number,
        value: number,
        rect: RectI,
        options: HouseSliderOptions = {},
    ) {
        super(
            title,
            min,
            max,
            value,
            rect,
            true,
            options.colors && slider_house_rules(options.colors),
        );
        this.label = options.label ?? "above";
        this.label_width = options.label_width ?? 64;
        this.format = (shown) => String(Math.round(shown));
    }

    /** Where the track runs, relative to `left` and `width` of the slider. */
    private track(
        left: number,
        width: number,
    ): { left: number; width: number } {
        const offset =
            this.label === "left" ? this.label_width + 6 : THUMB_RADIUS;
        return {
            left: left + offset,
            width: Math.max(1, width - offset - THUMB_RADIUS),
        };
    }

    public override drag(
        _start_coords: Vector2I | null,
        current_coords: Vector2I,
    ): boolean {
        const track = this.track(this.rect.left, this.rect.width);
        const relative = Math.max(
            0,
            Math.min(1, (current_coords.x - track.left) / track.width),
        );
        this.set_value(this.rect.left + relative * this.rect.width);
        return true;
    }

    protected override track_in(box: RectI): { left: number; width: number } {
        return this.track(box.left, box.width);
    }

    protected override track_center_y(box: RectI): number {
        return this.label === "left"
            ? box.top + box.height / 2
            : super.track_center_y(box);
    }

    /** The name is bold. Beside the track it reads "H 179" in `text_color`, as one text. */
    protected override draw_text(
        context: CanvasRenderingContext2D,
        box: RectI,
        center_y: number,
        theme: ThemeProperties,
    ): void {
        const value = this.format(this.value);
        context.textAlign = "left";
        context.font = theme_font({ ...theme, font_weight: 700 });
        if (this.label === "left") {
            context.fillStyle = theme.text_color.toString();
            context.textBaseline = "middle";
            context.fillText(`${this.title} ${value}`, box.left, center_y + 1);
        } else {
            context.textBaseline = "top";
            context.fillStyle = theme.caption_color.toString();
            context.fillText(this.title, box.left, box.top);
            context.textAlign = "right";
            context.font = theme_font(theme);
            context.fillStyle = theme.text_color.toString();
            context.fillText(value, box.left + box.width, box.top);
        }
    }
}
