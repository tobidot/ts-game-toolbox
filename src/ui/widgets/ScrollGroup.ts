import { RectI, Vector2I } from "../../geometries";
import { Element } from "../Element";
import { Group } from "../Group";
import { ThemeRule, ThemeTransition } from "../theme/Theme";

/** How wide the line is that says there is more, inside the right edge. */
const SCROLL_BAR_WIDTH = 4;
const SCROLL_BAR_MIN_HEIGHT = 24;
/** What stacked rows leave free on the right, so the line doesn't lie on them. */
const SCROLL_BAR_GUTTER = 10;
/** Between a grabbable bar and the stacked rows. */
const BAR_GAP = 4;

/** `"indicator"`: a thin line that only shows where the view is; `"bar"`: a scroll bar to grab. */
export type ScrollBarKind = "indicator" | "bar";

/** What the press in progress moves: the content, the thumb, or nothing (a press on the track paged). */
type DragMode = "content" | "thumb" | "track";

/**
 * A `Group` whose children scroll up and down inside its rect: it draws only what lies inside, and
 * a press only reaches what it can see. Drag with `UiManager`'s help (a press on a row stays a
 * click until it moved), the wheel with `bind_stage_input`, and `scroll_to()` follows a keyboard
 * cursor.
 *
 * With `row_height` set it stacks its visible children in their order, as wide as it is, leaving
 * `row_gap` between them and `padding` around them; they close up when one goes. Without it the
 * children keep their own rects, relative to the top of the content, as in any `Group`. A child's
 * border stays whole at the edge: the clip leaves room for it.
 *
 * `scroll_bar = "bar"` makes the line a scroll bar for a mouse: a track `scroll_bar_width` wide
 * with a thumb as tall as the share in view. Dragging the thumb scrolls, a press on the track
 * pages towards it, and the bar takes a press before the rows under it. Dragging the content and
 * the wheel work as before.
 *
 * Theme type `scroll_group`: `background_color` behind the rows, `text_color` for the indicator.
 * Theme type `scroll_bar` (the `bar` element, states `hover` and `active`): `background_color`
 * for the track, `text_color` for the thumb.
 */
export class ScrollGroup extends Group {
    /** The height of a stacked row; null leaves the children's rects alone. */
    public row_height: number | null = null;
    /** Between two stacked rows. */
    public row_gap: number = 0;
    /** Around the stacked rows. */
    public padding: number = 0;
    /**
     * Whether stacked rows always leave room for the scroll bar. False gives them the whole width
     * until there's something to scroll, so a list that fits has the same margin on both sides.
     */
    public reserves_gutter: boolean = true;
    /** The thin line of before (default), or a bar to grab. */
    public scroll_bar: ScrollBarKind = "indicator";
    /** How wide the grabbable bar is, inside the right edge. */
    public scroll_bar_width: number = 12;
    /**
     * The bar's look: theme type `scroll_bar`, hovered while the pointer is over the bar, active
     * while it is held. It isn't a child; it never scrolls.
     */
    public readonly bar: Element;
    private _scroll: number = 0;
    /** Where the drag in progress began, and what it moves. */
    private drag_anchor: { y: number; scroll: number; mode: DragMode } | null =
        null;

    public constructor(
        children: Array<Element>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(children, rect, is_visible, theme_rules);
        this.bar = new Element({ left: 0, top: 0, width: 0, height: 0 });
        this.bar.parent = this;
        this.bar.type = "scroll_bar";
        this.type = "scroll_group";
    }

    /** What stacked rows leave free on the right for the bar. */
    public get gutter(): number {
        return this.scroll_bar === "bar"
            ? this.scroll_bar_width + BAR_GAP
            : SCROLL_BAR_GUTTER;
    }

    /**
     * Where the bar's thumb is, in the coordinates of `rect`: as tall as the share in view, at
     * least 24. Zero high when there is nothing to scroll.
     */
    public get thumb_rect(): RectI {
        const { left, top, width, height } = this.rect;
        const bar_width =
            this.scroll_bar === "bar"
                ? this.scroll_bar_width
                : SCROLL_BAR_WIDTH;
        const max_scroll = this.max_scroll;
        if (max_scroll <= 0) {
            return {
                left: left + width - bar_width,
                top,
                width: bar_width,
                height: 0,
            };
        }
        const thumb = Math.min(
            height,
            Math.max(
                SCROLL_BAR_MIN_HEIGHT,
                (height * height) / this.content_height,
            ),
        );
        return {
            left: left + width - bar_width,
            top: top + (height - thumb) * (this.scroll / max_scroll),
            width: bar_width,
            height: thumb,
        };
    }

    public override update_theme_instance(transition?: ThemeTransition): void {
        super.update_theme_instance(transition);
        // The bar is made after the first update; from then on it follows.
        this.bar?.update_theme_instance(transition);
    }

    /** How far the content is scrolled up; always within 0 and `max_scroll`. */
    public get scroll(): number {
        return Math.max(0, Math.min(this._scroll, this.max_scroll));
    }

    public set scroll(val: number) {
        this._scroll = Math.max(0, Math.min(val, this.max_scroll));
    }

    /** How far down the lowest visible child reaches, with `padding` under stacked rows. */
    public get content_height(): number {
        this.stack_rows();
        let bottom = this.row_height === null ? 0 : this.padding;
        for (const child of this.children) {
            if (child.is_visible) {
                bottom = Math.max(bottom, child.rect.top + child.rect.height);
            }
        }
        return this.row_height === null ? bottom : bottom + this.padding;
    }

    public get max_scroll(): number {
        return Math.max(0, this.content_height - this.rect.height);
    }

    /** Scrolls as little as it takes to show all of `child`. */
    public scroll_to(child: Element): void {
        this.stack_rows();
        const margin = this.row_height === null ? 0 : this.padding;
        const top = child.rect.top - margin;
        const bottom = child.rect.top + child.rect.height + margin;
        if (top < this.scroll) {
            this.scroll = top;
        } else if (bottom > this.scroll + this.rect.height) {
            this.scroll = bottom - this.rect.height;
        }
    }

    /** The bar, where there is one to grab, comes before the rows under it. */
    public override hit(coords: Vector2I): Array<Element> {
        this.stack_rows();
        const is_on_bar = this.is_on_bar(coords);
        this.bar.update_mouse_hover_status(is_on_bar);
        if (is_on_bar) {
            return [this];
        }
        return super.hit(coords);
    }

    public override update_mouse_hover_status(is_hovering: boolean): boolean {
        if (!is_hovering) {
            this.bar.update_mouse_hover_status(false);
        }
        return super.update_mouse_hover_status(is_hovering);
    }

    public override to_child_coordinates(coords: Vector2I): Vector2I {
        const local = super.to_child_coordinates(coords);
        return { x: local.x, y: local.y + this.scroll };
    }

    /**
     * Follows the finger one to one from where the drag was taken; refuses with nothing to scroll.
     * A press on the bar's thumb moves the thumb instead, one on its track pages once.
     */
    public override drag(
        start_coords: Vector2I | null,
        current_coords: Vector2I,
    ): boolean {
        const max_scroll = this.max_scroll;
        if (max_scroll <= 0) {
            return false;
        }
        if (this.drag_anchor === null) {
            this.drag_anchor = this.take_press(
                start_coords ?? current_coords,
                current_coords,
            );
        }
        const anchor = this.drag_anchor;
        if (anchor.mode === "content") {
            this.scroll = anchor.scroll + anchor.y - current_coords.y;
        } else if (anchor.mode === "thumb") {
            const travel = this.rect.height - this.thumb_rect.height;
            if (travel > 0) {
                this.scroll =
                    anchor.scroll +
                    ((current_coords.y - anchor.y) * max_scroll) / travel;
            }
        }
        return true;
    }

    public override update_mouse_down_status(is_down: boolean): boolean {
        if (!is_down) {
            this.drag_anchor = null;
            this.bar.update_mouse_down_status(false);
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
        this.stack_rows();
        const { left, top, width, height } = this.rect;
        const scroll = this.scroll;

        ctx.save();
        this.context_transform_to_local(ctx);
        this.draw_background(ctx);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        const border = this.widest_child_border();
        ctx.rect(
            left - border,
            top - border,
            width + 2 * border,
            height + 2 * border,
        );
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

    /** What a new press moves: the thumb or the track when it is on the bar, else the content. */
    private take_press(
        press: Vector2I,
        current: Vector2I,
    ): { y: number; scroll: number; mode: DragMode } {
        if (!this.is_on_bar(press)) {
            return { y: current.y, scroll: this.scroll, mode: "content" };
        }
        this.bar.update_mouse_down_status(true);
        const thumb = this.thumb_rect;
        if (press.y >= thumb.top && press.y <= thumb.top + thumb.height) {
            return { y: press.y, scroll: this.scroll, mode: "thumb" };
        }
        this.scroll +=
            press.y < thumb.top ? -this.rect.height : this.rect.height;
        return { y: press.y, scroll: this.scroll, mode: "track" };
    }

    /** On a grabbable bar, while there is something to scroll; `coords` as `rect` sees them. */
    private is_on_bar(coords: Vector2I): boolean {
        if (
            this.scroll_bar !== "bar" ||
            !this.is_visible ||
            this.max_scroll <= 0
        ) {
            return false;
        }
        const { left, top, width, height } = this.rect;
        return (
            coords.x >= left + width - this.scroll_bar_width &&
            coords.x <= left + width &&
            coords.y >= top &&
            coords.y <= top + height
        );
    }

    /** Gives the visible children their places, in order, when this group stacks them. */
    private stack_rows(): void {
        const row_height = this.row_height;
        if (row_height === null) {
            return;
        }
        const visible = this.children.filter((child) => child.is_visible);
        const height =
            2 * this.padding +
            visible.length * (row_height + this.row_gap) -
            this.row_gap;
        const gutter =
            this.reserves_gutter || height > this.rect.height ? this.gutter : 0;
        let top = this.padding;
        for (const child of this.children) {
            if (child.is_visible) {
                child.rect.left = this.padding;
                child.rect.top = top;
                child.rect.width = this.rect.width - 2 * this.padding - gutter;
                child.rect.height = row_height;
                top += row_height + this.row_gap;
            }
        }
    }

    /** A border draws outward from its rect, so a child at the edge needs this much room. */
    private widest_child_border(): number {
        let widest = 0;
        for (const child of this.children) {
            widest = Math.max(widest, child.theme_instance.get("border_width"));
        }
        return widest;
    }

    private draw_scroll_bar(
        ctx: CanvasRenderingContext2D,
        scroll: number,
    ): void {
        const max_scroll = this.max_scroll;
        if (max_scroll <= 0) {
            return;
        }
        if (this.scroll_bar === "bar") {
            this.draw_bar(ctx);
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

    /** The track the height of the group, and the thumb on it, in the `scroll_bar` theme. */
    private draw_bar(ctx: CanvasRenderingContext2D): void {
        const { top, height } = this.rect;
        const thumb = this.thumb_rect;
        const theme = this.bar.theme;
        const inset = 2;
        ctx.save();
        ctx.fillStyle = theme.background_color.toString();
        ctx.beginPath();
        ctx.roundRect(thumb.left, top, thumb.width, height, thumb.width / 2);
        ctx.fill();
        ctx.fillStyle = theme.text_color.toString();
        ctx.beginPath();
        ctx.roundRect(
            thumb.left + inset,
            thumb.top + inset,
            thumb.width - 2 * inset,
            thumb.height - 2 * inset,
            (thumb.width - 2 * inset) / 2,
        );
        ctx.fill();
        ctx.restore();
    }
}
