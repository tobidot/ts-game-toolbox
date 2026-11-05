import { RectI, Vector2I } from "../../geometries";
import { Element } from "../Element";
import { Group } from "../Group";
import { ThemeRule } from "../theme/Theme";

/** How wide the bar is that says there is more, inside the right edge. */
const SCROLL_BAR_WIDTH = 4;
const SCROLL_BAR_MIN_HEIGHT = 24;

/**
 * A `Group` whose children scroll up and down inside its rect: it draws only what lies inside, and
 * a press only reaches what it can see. Drag with `UiManager`'s help (a press on a row stays a
 * click until it moved), the wheel with `bind_stage_input`, and `scroll_to()` follows a keyboard
 * cursor. Children have rects relative to the top of the content, as in any `Group`.
 *
 * Theme type `scroll_group`: `background_color` behind the rows, `text_color` for the scroll bar.
 */
export class ScrollGroup extends Group {
    private _scroll: number = 0;
    /** Where the drag in progress began. */
    private drag_anchor: { y: number; scroll: number } | null = null;

    public constructor(
        children: Array<Element>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(children, rect, is_visible, theme_rules);
        this.type = "scroll_group";
    }

    /** How far the content is scrolled up; always within 0 and `max_scroll`. */
    public get scroll(): number {
        return Math.max(0, Math.min(this._scroll, this.max_scroll));
    }

    public set scroll(val: number) {
        this._scroll = Math.max(0, Math.min(val, this.max_scroll));
    }

    /** How far down the lowest visible child reaches. */
    public get content_height(): number {
        let bottom = 0;
        for (const child of this.children) {
            if (child.is_visible) {
                bottom = Math.max(bottom, child.rect.top + child.rect.height);
            }
        }
        return bottom;
    }

    public get max_scroll(): number {
        return Math.max(0, this.content_height - this.rect.height);
    }

    /** Scrolls as little as it takes to show all of `child`. */
    public scroll_to(child: Element): void {
        const top = child.rect.top;
        const bottom = top + child.rect.height;
        if (top < this.scroll) {
            this.scroll = top;
        } else if (bottom > this.scroll + this.rect.height) {
            this.scroll = bottom - this.rect.height;
        }
    }

    public override to_child_coordinates(coords: Vector2I): Vector2I {
        const local = super.to_child_coordinates(coords);
        return { x: local.x, y: local.y + this.scroll };
    }

    /** Follows the finger one to one from where the drag was taken; refuses with nothing to scroll. */
    public override drag(
        _start_coords: Vector2I | null,
        current_coords: Vector2I,
    ): boolean {
        if (this.max_scroll <= 0) {
            return false;
        }
        this.drag_anchor ??= { y: current_coords.y, scroll: this.scroll };
        this.scroll =
            this.drag_anchor.scroll + this.drag_anchor.y - current_coords.y;
        return true;
    }

    public override update_mouse_down_status(is_down: boolean): boolean {
        if (!is_down) {
            this.drag_anchor = null;
        }
        return super.update_mouse_down_status(is_down);
    }

    /** Takes the wheel whenever there is something to scroll, also at the ends. */
    public override wheel(delta_y: number): boolean {
        if (this.max_scroll <= 0) {
            return false;
        }
        this.scroll += delta_y;
        return true;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }
        const { left, top, width, height } = this.rect;
        const scroll = this.scroll;

        ctx.save();
        this.context_transform_to_local(ctx);
        this.draw_background(ctx);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, width, height);
        ctx.clip();
        ctx.translate(left, top - scroll);
        for (const child of this.children) {
            const is_inside =
                child.rect.top < scroll + height &&
                child.rect.top + child.rect.height > scroll;
            if (is_inside) {
                child.draw(ctx);
            }
        }
        ctx.restore();

        this.draw_scroll_bar(ctx, scroll);
    }

    private draw_scroll_bar(
        ctx: CanvasRenderingContext2D,
        scroll: number,
    ): void {
        const max_scroll = this.max_scroll;
        if (max_scroll <= 0) {
            return;
        }
        const { left, top, width, height } = this.rect;
        const bar_height = Math.max(
            SCROLL_BAR_MIN_HEIGHT,
            (height * height) / this.content_height,
        );
        ctx.save();
        ctx.fillStyle = this.theme.text_color.toString();
        ctx.beginPath();
        ctx.roundRect(
            left + width - SCROLL_BAR_WIDTH,
            top + (height - bar_height) * (scroll / max_scroll),
            SCROLL_BAR_WIDTH,
            bar_height,
            SCROLL_BAR_WIDTH / 2,
        );
        ctx.fill();
        ctx.restore();
    }
}
