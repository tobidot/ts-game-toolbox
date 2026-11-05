import { RectI, Rect, Vector2I } from "../geometries";
import { Group } from "./Group";
import { Element } from "./Element";
import { ThemeRule } from "./theme/Theme";

export class UiPage extends Group {
    public reference_rect: Rect;
    public window_resolution: Vector2I = { x: 800, y: 600 };

    public constructor(
        window_resolution: Vector2I,
        rect: RectI,
        reference_rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super([], rect, is_visible, theme_rules);
        this.reference_rect = new Rect(reference_rect);
        this.window_resolution = window_resolution;
        this.type = "page";
    }

    public enter() {}

    public leave() {}

    private transform_window_to_unit_coordinates(
        window_coords: Vector2I,
    ): Vector2I {
        return {
            x: window_coords.x / this.window_resolution.x,
            y: window_coords.y / this.window_resolution.y,
        };
    }

    private transform_unit_to_reference_coordinates(
        unit_coords: Vector2I,
    ): Vector2I {
        // Uniform to reference space
        // rel_x/rel_y is 0-1 within this page's uniform rect
        const rel_x = (unit_coords.x - this.rect.left) / this.rect.width;
        const rel_y = (unit_coords.y - this.rect.top) / this.rect.height;

        return {
            x: rel_x * this.reference_rect.width + this.reference_rect.left,
            y: rel_y * this.reference_rect.height + this.reference_rect.top,
        };
    }

    /** Window (canvas pixel) coordinates in this page's reference coordinates, where its widgets live. */
    public to_reference(window_coords: Vector2I): Vector2I {
        return this.transform_unit_to_reference_coordinates(
            this.transform_window_to_unit_coordinates(window_coords),
        );
    }

    public override hit(window_coords: Vector2I): Array<Element> {
        if (!this.is_visible) {
            return [];
        }
        const unit_coords =
            this.transform_window_to_unit_coordinates(window_coords);
        const reference_coords =
            this.transform_unit_to_reference_coordinates(unit_coords);

        return super.hit(reference_coords);
    }

    /** The children's rects are in reference coordinates; `rect` is in units of the canvas. */
    public override to_child_coordinates(reference_coords: Vector2I): Vector2I {
        return reference_coords;
    }

    /**
     * The page is always hit in its own reference space
     * @param _reference_coords
     */
    public override is_hit(_reference_coords: Vector2I): boolean {
        return true;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        // Update container_res from context
        this.window_resolution = { x: ctx.canvas.width, y: ctx.canvas.height };

        const actual_left = this.rect.left * this.window_resolution.x;
        const actual_top = this.rect.top * this.window_resolution.y;
        const actual_width = this.rect.width * this.window_resolution.x;
        const actual_height = this.rect.height * this.window_resolution.y;

        ctx.save();
        ctx.translate(actual_left, actual_top);
        ctx.scale(
            actual_width / this.reference_rect.width,
            actual_height / this.reference_rect.height,
        );
        ctx.translate(-this.reference_rect.left, -this.reference_rect.top);

        for (const child of this.children) {
            child.draw(ctx);
        }
        ctx.restore();
    }
}
