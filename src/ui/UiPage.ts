import { RectI, Rect, Vector2I, Vector2 } from "../geometries";
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

    public override transform_parent_to_local_coordinates(window_coords: Vector2I): Vector2I {
        const parent_coords = super.transform_parent_to_local_coordinates(window_coords);
        const uniform_coords = this.transform_window_to_unit_coordinates(parent_coords);
        return this.transform_unit_to_reference_coordinates(uniform_coords);
    }

    private transform_window_to_unit_coordinates(window_coords: Vector2I): Vector2I {
        return {
            x: window_coords.x / this.window_resolution.x,
            y: window_coords.y / this.window_resolution.y,
        };
    }

    private transform_unit_to_reference_coordinates(unit_coords: Vector2I): Vector2I {
        // Uniform to reference space
        // rel_x/rel_y is 0-1 within this page's uniform rect
        const rel_x = (unit_coords.x - this.rect.left) / this.rect.width;
        const rel_y = (unit_coords.y - this.rect.top) / this.rect.height;

        return {
            x: rel_x * this.reference_rect.width + this.reference_rect.left,
            y: rel_y * this.reference_rect.height + this.reference_rect.top,
        };
    }

    public override hit(window_coords: Vector2I): Array<Element> {
        if (!this.is_visible) {
            return [];
        }

        // Check if page itself is hit (in uniform space)
        const uniform_coords = this.transform_window_to_unit_coordinates(window_coords);
        if (!this.rect.contains(uniform_coords)) {
            return [];
        }

        const inner_coords = this.transform_unit_to_reference_coordinates(uniform_coords);
        const hits: Array<Element> = [this];
        for (let i = this.children.length - 1; i >= 0; i--) {
            hits.unshift(...this.children[i].hit(inner_coords));
        }
        return hits;
    }

    public override hover(window_coords: Vector2I, mouse_locked_element: Element | null): boolean {
        if (!this.is_visible) {
            this.set_mouse_hover(false);
            for (const child of this.children) {
                child.hover(window_coords, mouse_locked_element);
            }
            return false;
        }

        const uniform_coords = this.transform_window_to_unit_coordinates(window_coords);
        const is_hit = this.rect.contains(uniform_coords);
        const should_hover = is_hit && (mouse_locked_element === null || mouse_locked_element === this);
        this.set_mouse_hover(should_hover);

        const inner_coords = this.transform_unit_to_reference_coordinates(uniform_coords);
        let child_hit = false;
        for (const child of this.children) {
            const child_is_hit = child.hover(is_hit ? inner_coords : window_coords, mouse_locked_element);
            if (child_is_hit) {
                child_hit = true;
            }
        }
        return is_hit || child_hit;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

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
