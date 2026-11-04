import { RectI, Vector2I } from "../geometries";
import { Slider } from "../ui/widgets/Slider";
import { HOUSE_COLORS, HouseColors } from "./CanvasGameSettings";

export interface HouseSliderOptions {
    /**
     * Where the name and value go. `"above"`: the name left and the value right over the track,
     * for wide panels. `"left"`: "H 179" in a column left of the track, for compact rows.
     * Default `"above"`.
     */
    label?: "above" | "left";
    /** Width of the `"left"` label column. Default 64. */
    label_width?: number;
    colors?: HouseColors;
}

const TRACK_HEIGHT = 8;
const THUMB_RADIUS = 10;

/**
 * The toolbox `Slider` in the house look: a rounded track filled up to a round white thumb, with
 * its name and whole-number value. It takes layout coordinates like every placed widget, and
 * with the label on the left the value follows the track, not the whole rect.
 */
export class HouseSlider extends Slider {
    private readonly label: "above" | "left";
    private readonly label_width: number;
    private readonly colors: HouseColors;

    public constructor(
        title: string,
        min: number,
        max: number,
        value: number,
        rect: RectI,
        options: HouseSliderOptions = {},
    ) {
        super(title, min, max, value, rect);
        this.label = options.label ?? "above";
        this.label_width = options.label_width ?? 64;
        this.colors = options.colors ?? HOUSE_COLORS;
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

    public override draw(context: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }
        const colors = this.colors;
        const font = this.theme.font_family;
        context.save();
        this.apply_transforms(context);
        const box = this.get_local_content_box_size();
        const track = this.track(box.left, box.width);
        const center_y =
            this.label === "left"
                ? box.top + box.height / 2
                : box.top + box.height * 0.7;
        const progress = Math.max(
            0,
            Math.min(1, (this.value - this.min) / (this.max - this.min)),
        );
        const track_top = center_y - TRACK_HEIGHT / 2;
        const round = TRACK_HEIGHT / 2;

        context.fillStyle = colors.line;
        context.beginPath();
        context.roundRect(
            track.left,
            track_top,
            track.width,
            TRACK_HEIGHT,
            round,
        );
        context.fill();
        context.fillStyle = colors.turquoise;
        context.beginPath();
        context.roundRect(
            track.left,
            track_top,
            Math.max(TRACK_HEIGHT, track.width * progress),
            TRACK_HEIGHT,
            round,
        );
        context.fill();

        context.fillStyle = this.is_down ? colors.turquoise : colors.white;
        context.beginPath();
        context.arc(
            track.left + progress * track.width,
            center_y,
            THUMB_RADIUS,
            0,
            Math.PI * 2,
        );
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = colors.black;
        context.stroke();

        const value = String(Math.round(this.value));
        context.textAlign = "left";
        if (this.label === "left") {
            context.font = `bold 15px ${font}`;
            context.fillStyle = colors.white;
            context.textBaseline = "middle";
            context.fillText(`${this.title} ${value}`, box.left, center_y + 1);
        } else {
            context.textBaseline = "top";
            context.font = `bold 15px ${font}`;
            context.fillStyle = colors.muted;
            context.fillText(this.title, box.left, box.top);
            context.textAlign = "right";
            context.font = `15px ${font}`;
            context.fillStyle = colors.white;
            context.fillText(value, box.left + box.width, box.top);
        }
        context.restore();
    }
}
