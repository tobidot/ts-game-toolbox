import {RectI} from "../geometries";
import {Vector2, Vector2I} from "../geometries";
import {Element} from "./Element";
import {ThemeRule} from "./theme/Theme";

export class Group extends Element {
    public readonly children: Array<Element>;

    public constructor(
        children: Array<Element>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.children = children;
        for (const child of this.children) {
            child.parent = this;
        }
        this.update_theme_instance();
    }

    public add(child: Element): void {
        child.parent = this;
        this.children.push(child);
        child.update_theme_instance();
    }

    /**
     *
     * @param coords
     */
    public override hit(coords: Vector2I): Array<Element> {
        if (!this.is_hit(coords)) {
            // if this element is not hit, children are neither
            return [];
        }

        const hits: Array<Element> = [this];
        const local_coords = this.get_local_coordinates_at(coords);
        // accumulate all hits of the children,
        // first child has highest prio
        for (let i = this.children.length - 1; i >= 0; i--) {
            const child = this.children[i];
            const child_hits = child.hit(local_coords);
            // push child hits to the front (higher prio)
            hits.unshift(...child_hits);
        }
        return hits;
    }

    public override hover(coords: Vector2I, mouse_locked_element: Element | null): boolean {
        if (!this.is_visible) {
            this.set_mouse_hover(false);
            for (const child of this.children) {
                child.hover(coords, mouse_locked_element);
            }
            return false;
        }

        const is_hit = this.rect.contains(coords.x, coords.y);
        const should_hover = is_hit && (mouse_locked_element === null || mouse_locked_element === this);
        this.set_mouse_hover(should_hover);

        const inner_coords = new Vector2(coords).sub({ x: this.rect.left, y: this.rect.top });
        let child_hit = false;
        for (const child of this.children) {
            const child_is_hit = child.hover(is_hit ? inner_coords : coords, mouse_locked_element);
            if (child_is_hit) {
                child_hit = true;
            }
        }
        return is_hit || child_hit;
    }

    public override drag(
        _start_coords: Vector2 | null,
        _current_coords: Vector2I,
    ): boolean {
        return false;
    }

    public override update_theme_instance() {
        super.update_theme_instance();
        if (this.children) {
            for (const child of this.children) {
                child.update_theme_instance();
            }
        }
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        ctx.save();
        ctx.translate(
            -this.rect.left,
            -this.rect.top,
        );

        for (const child of this.children) {
            child.draw(ctx);
        }
        ctx.restore();
    }
}
