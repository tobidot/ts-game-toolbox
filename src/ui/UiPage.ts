import { RectI, Rect, Vector2I } from "../geometries";
import { Group } from "./Group";
import { Theme } from "./Theme";
import { Element } from "./Element";

export class UiPage extends Group {
    public reference_rect: Rect;
    public container_res: Vector2I = { x: 800, y: 600 };

    public constructor(
        rect: RectI,
        reference_rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super([], rect, is_visible, theme);
        this.reference_rect = new Rect(reference_rect);
    }

    public override transform_to_local(coords: Vector2I): Vector2I {
        const parent_coords = super.transform_to_local(coords);
        return this.transform_to_reference(parent_coords);
    }

    private transform_to_reference(coords: Vector2I): Vector2I {
        // Pixel coords to uniform (relative to container_res)
        const uniform_x = coords.x / this.container_res.x;
        const uniform_y = coords.y / this.container_res.y;

        // Uniform to reference space
        // rel_x/rel_y is 0-1 within this page's uniform rect
        const rel_x = (uniform_x - this.rect.left) / this.rect.width;
        const rel_y = (uniform_y - this.rect.top) / this.rect.height;

        return {
            x: rel_x * this.reference_rect.width + this.reference_rect.left,
            y: rel_y * this.reference_rect.height + this.reference_rect.top,
        };
    }

    public override hit(coords: Vector2I): Element | null {
        if (!this.is_visible) return null;

        // Check if page itself is hit (in uniform space)
        const uniform_x = coords.x / this.container_res.x;
        const uniform_y = coords.y / this.container_res.y;

        if (!this.rect.contains(uniform_x, uniform_y)) {
            return null;
        }

        const ref_coords = this.transform_to_reference(coords);
        for (let i = this.children.length - 1; i >= 0; i--) {
            const hit = this.children[i].hit(ref_coords);
            if (hit) return hit;
        }
        return this;
    }

    public override hover(
        coords: Vector2I,
        locked_element: Element | null,
    ): boolean {
        if (!this.is_visible) {
            this.is_hovered = false;
            const ref_coords = this.transform_to_reference(coords);
            for (const child of this.children) {
                child.hover(ref_coords, locked_element);
            }
            return false;
        }

        const uniform_x = coords.x / this.container_res.x;
        const uniform_y = coords.y / this.container_res.y;
        this.is_hovered = this.rect.contains(uniform_x, uniform_y);

        const ref_coords = this.transform_to_reference(coords);
        let is_hit = this.is_hovered;
        for (const child of this.children) {
            is_hit = child.hover(ref_coords, locked_element) || is_hit;
        }
        return is_hit;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        // Update container_res from context
        this.container_res = { x: ctx.canvas.width, y: ctx.canvas.height };

        const actual_left = this.rect.left * this.container_res.x;
        const actual_top = this.rect.top * this.container_res.y;
        const actual_width = this.rect.width * this.container_res.x;
        const actual_height = this.rect.height * this.container_res.y;

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
