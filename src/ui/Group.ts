import { RectI } from "../geometries";
import { Vector2, Vector2I } from "../geometries";
import { Element } from "./Element";
import { ThemeRule, ThemeTransition } from "./theme/Theme";

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

    /** Adds `child` on top of its siblings, but under those that stay on top. */
    public add(child: Element): void {
        child.parent = this;
        const first_on_top = this.children.findIndex(
            (sibling) => sibling.stays_on_top,
        );
        if (child.stays_on_top || first_on_top < 0) {
            this.children.push(child);
        } else {
            this.children.splice(first_on_top, 0, child);
        }
        child.update_theme_instance();
    }

    /**
     * Takes `child` out of this group. It and everything inside it lose their press and hover, so
     * a `UiManager` holding it lets go. Returns false when `child` wasn't in this group.
     */
    public remove(child: Element): boolean {
        const index = this.children.indexOf(child);
        if (index < 0) {
            return false;
        }
        this.children.splice(index, 1);
        child.parent = null;
        child.release_pointer();
        child.update_theme_instance();
        return true;
    }

    public override release_pointer(): void {
        super.release_pointer();
        for (const child of this.children) {
            child.release_pointer();
        }
    }

    /**
     *
     * @param coords
     */
    public override hit(coords: Vector2I): Array<Element> {
        if (!this.is_hit(coords)) {
            // console.log("not hit", coords, this.type, this.is_visible, this.rect);
            // if this element is not hit, children are neither
            return [];
        }

        const hits: Array<Array<Element>> = [[this]];
        const local_coords = this.to_child_coordinates(coords);
        // collect the hits of all child elements
        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i];
            const child_hits = child.hit(local_coords);
            if (child_hits.length > 0) {
                hits.push(child_hits);
            }
        }
        // reverse the order so the last child is the first in the list
        // the sub children list should already be sorted correctly
        return hits.reverse().flat();
    }

    /** A point in this group's parent's coordinates, as its children's rects see it. */
    public to_child_coordinates(coords: Vector2I): Vector2I {
        return this.get_local_coordinates_at(coords);
    }

    public override drag(
        _start_coords: Vector2 | null,
        _current_coords: Vector2I,
    ): boolean {
        return false;
    }

    public override update_theme_instance(transition?: ThemeTransition) {
        super.update_theme_instance(transition);
        if (this.children) {
            for (const child of this.children) {
                child.update_theme_instance(transition);
            }
        }
    }

    public override mark_shown(): void {
        if (!this.is_visible) {
            return;
        }
        super.mark_shown();
        for (const child of this.children) {
            child.mark_shown();
        }
    }

    public override poll_animation(): boolean {
        if (!this.is_visible) {
            return false;
        }
        let is_moving = super.poll_animation();
        for (const child of this.children) {
            is_moving = child.poll_animation() || is_moving;
        }
        return is_moving;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        ctx.save();
        ctx.translate(this.rect.left, this.rect.top);

        for (const child of this.children) {
            child.draw(ctx);
        }
        ctx.restore();
    }
}
