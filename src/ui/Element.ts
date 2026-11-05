import { EventSocket } from "../signals";
import { Rect, RectI, Vector2 } from "../geometries";
import { Vector2I } from "../geometries";
import {
    ElementChangeEvent,
    ElementClickEvent,
    ElementRefusedEvent,
} from "./events";
import type { Group } from "./Group";
import {
    theme_evaluate,
    ThemeInstance,
    ThemeProperties,
    ThemeRule,
} from "./theme/Theme";

export type ElementEvents =
    | ElementChangeEvent
    | ElementClickEvent
    | ElementRefusedEvent;

export class Element {
    public readonly events: EventSocket<ElementEvents> = new EventSocket();
    public readonly rect: Rect;
    //
    public parent: Group | null = null;
    // status
    public is_visible: boolean;
    public is_hovered: boolean = false;
    public is_down: boolean = false;
    private _is_selected: boolean = false;
    private _is_disabled: boolean = false;
    private _type: string = "element";
    private _class: string | null = null;
    // properties
    public theme_instance: ThemeInstance;
    public theme_rules: Array<ThemeRule>;

    public constructor(
        rect: RectI,
        is_visible: boolean = true,
        theme_rules: Array<ThemeRule> = [],
    ) {
        this.rect = new Rect(rect);
        this.is_visible = is_visible;
        this.theme_rules = theme_rules;
        this.theme_instance = new ThemeInstance();
        this.update_theme_instance();
    }

    /*
     * -------------------------
     * Accessors
     * -------------------------
     */

    public get theme(): ThemeProperties {
        return this.theme_instance.get_all();
    }

    /** The one state theme selectors match. Priority: disabled, active, selected, hover. */
    public get state(): string | null {
        if (this.is_disabled) {
            return "disabled";
        }
        if (this.is_down) {
            return "active";
        }
        if (this.is_selected) {
            return "selected";
        }
        return this.is_hovered ? "hover" : null;
    }

    /** The chosen one among its kind, a timetable row or a tab. Only changes the look. */
    public get is_selected(): boolean {
        return this._is_selected;
    }

    public set is_selected(val: boolean) {
        if (val !== this._is_selected) {
            this._is_selected = val;
            this.update_theme_instance();
        }
    }

    /**
     * Can't be used right now. It is still hit, so a press can't fall through to the game, and it
     * still gets hover, so it can show a reason. It never clicks and never drags: a press released
     * on it dispatches an `ElementRefusedEvent` instead, which is how touch gets the reason.
     */
    public get is_disabled(): boolean {
        return this._is_disabled;
    }

    public set is_disabled(val: boolean) {
        if (val !== this._is_disabled) {
            this._is_disabled = val;
            this.update_theme_instance();
        }
    }

    public get type(): string {
        return this._type;
    }

    public set type(val: string) {
        this._type = val;
        this.update_theme_instance();
    }

    public get class(): string | null {
        return this._class;
    }

    public set class(val: string | null) {
        this._class = val;
        this.update_theme_instance();
    }

    /*
     * -------------------------
     * Theme
     * -------------------------
     */

    public collect_theme_rules(): Array<ThemeRule> {
        // Traverse up the tree to get all rules applied to this element
        const elements: Element[] = [this];
        for (
            let current: Element | null = this.parent;
            current;
            current = current.parent
        ) {
            // add new rules at the beginning of the array, as they are weaker.
            elements.unshift(current);
        }
        return elements.flatMap((element) => element.theme_rules);
    }

    /*
     * -------------------------
     * Transforms
     * -------------------------
     */

    /**
     * Update theme instance based on rules.
     */
    public update_theme_instance(): void {
        const rules = this.collect_theme_rules();

        this.theme_instance.set_all(theme_evaluate(this, rules));
    }

    /**
     * Get the local_coordinates, given the world_coordinates
     * @param world_coords
     */
    public get_local_coordinates_at(world_coords: Vector2I): Vector2 {
        return new Vector2(world_coords).sub({
            x: this.rect.left,
            y: this.rect.top,
        });
    }

    /**
     * A point in the page's reference coordinates, as this element's `rect` sees it: through every
     * parent's position and scroll. What `drag()` gets.
     */
    public to_parent_coordinates(reference_coords: Vector2I): Vector2I {
        const parent = this.parent;
        return parent === null
            ? reference_coords
            : parent.to_child_coordinates(
                  parent.to_parent_coordinates(reference_coords),
              );
    }

    public get_local_content_box_size(): RectI {
        return {
            left: -this.rect.width / 2,
            top: -this.rect.height / 2,
            width: this.rect.width,
            height: this.rect.height,
        };
    }

    public get_local_border_box_size(): RectI {
        const border_width = this.theme_instance.get("border_width");
        return {
            left: -this.rect.width / 2 - border_width / 2,
            top: -this.rect.height / 2 - border_width / 2,
            width: this.rect.width + border_width,
            height: this.rect.height + border_width,
        };
    }

    /**
     * Moves the context to the center of the element.
     *
     * Also applies the theme transform to the context.
     * @param ctx
     */
    public context_transform_to_local(ctx: CanvasRenderingContext2D): void {
        ctx.translate(
            this.rect.left + this.rect.width / 2,
            this.rect.top + this.rect.height / 2,
        );
        const transform = this.theme_instance.get("transform");
        transform?.apply(ctx);
    }

    /*
     * -------------------------
     * Even and Detection
     * -------------------------
     */

    /**
     * Returns all elements hit at the given coordinate of this element.
     * The first element in this list should be the one that is visually closest to the user.
     * The one, the user expects to have hit.
     * @param {Vector2I} coords
     */
    public hit(coords: Vector2I): Array<Element> {
        return this.is_hit(coords) ? [this] : [];
    }

    /**
     * Is this element hit at the given coordinates
     * @param {Vector2I} coords
     */
    public is_hit(coords: Vector2I): boolean {
        return this.is_visible && this.rect.contains(coords.x, coords.y);
    }

    /**
     * The press on this element moved. Both points are in the coordinates of this element's
     * `rect`, whatever its parents; `_start_coords` is null on the press itself. Returns whether
     * it drags: if not, a `UiManager` offers the move to its parents once it has gone far enough.
     */
    public drag(
        _start_coords: Vector2I | null,
        _current_coords: Vector2I,
    ): boolean {
        return false;
    }

    /**
     * The wheel turned over this element, `delta_y` as in a wheel event. Returns whether it took
     * it; if not, `UiManager` offers it to the elements under it.
     */
    public wheel(_delta_y: number): boolean {
        return false;
    }

    /** Clicks this element; a disabled one refuses instead. */
    public click(): void {
        if (this.is_disabled) {
            this.dispatch_refused_event();
            return;
        }
        this.dispatch_click_event();
    }

    public update_mouse_down_status(is_down: boolean): boolean {
        const previous = this.is_down;
        this.is_down = is_down;
        if (this.is_down !== previous) {
            this.update_theme_instance();
        }
        return is_down;
    }

    /**
     * This element left the page: it holds no press and no hover anymore. A `UiManager` lets go of
     * an element that isn't down, so a dead widget can't keep its press.
     */
    public release_pointer(): void {
        this.update_mouse_down_status(false);
        this.update_mouse_hover_status(false);
    }

    public update_mouse_hover_status(is_hovering: boolean): boolean {
        const previous = this.is_hovered;
        this.is_hovered = is_hovering;
        if (this.is_hovered !== previous) {
            this.update_theme_instance();
        }
        return is_hovering;
    }

    /*
     * Event Dispatcher
     */

    public dispatch_click_event(): void {
        this.events.dispatch(new ElementClickEvent(this));
    }

    public dispatch_change_event(): void {
        this.events.dispatch(new ElementChangeEvent(this));
    }

    public dispatch_refused_event(): void {
        this.events.dispatch(new ElementRefusedEvent(this));
    }

    /*
     * Drawing
     */

    /**
     * Apply canvas transforms so subsequent drawing is in local element space.
     * Widgets call this at the start of their draw() method.
     */
    public apply_transforms(ctx: CanvasRenderingContext2D): void {
        this.context_transform_to_local(ctx);
    }

    /**
     * Draw this element to the render context
     * @param _ctx
     */
    public draw(_ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }
        // Default implementation just draws a box if needed or nothing
    }

    /**
     * Draw Default Background to this element.
     * Assumes, the context is already in local space.
     *
     * @param ctx
     * @protected
     */
    protected draw_background(ctx: CanvasRenderingContext2D): void {
        const { background_color, border_color, border_width, border_radius } =
            this.theme_instance.get_all();

        const color = background_color;

        ctx.beginPath();
        const border_box = this.get_local_border_box_size();
        if (border_radius > 0) {
            ctx.roundRect(
                border_box.left,
                border_box.top,
                border_box.width,
                border_box.height,
                border_radius,
            );
        } else {
            ctx.rect(
                border_box.left,
                border_box.top,
                border_box.width,
                border_box.height,
            );
        }

        ctx.fillStyle = color.toString();
        ctx.fill();

        if (border_width > 0) {
            ctx.lineWidth = border_width;
            ctx.strokeStyle = border_color.toString();
            ctx.stroke();
        }
    }
}
