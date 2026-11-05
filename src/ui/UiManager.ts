import { Vector2, Vector2I } from "../geometries";
import { Element } from "./Element";
import { UiPage } from "./UiPage";

export class UiManager {
    public active_menu: UiPage | null = null;
    public is_mouse_down: boolean = false;
    public mouse_position: Vector2 | null = null;
    public mouse_down_position: Vector2 | null = null;
    /**
     * How far a press has to move, in reference units, before a parent may take it as a drag. A
     * shaky tap on a phone stays a tap.
     */
    public drag_threshold: number = 10;

    /** Elements that were hovered on the last pointer_move call. */
    private _hovered_elements: Set<Element> = new Set();
    private _mouse_locked_element: Element | null = null;
    /** A parent took the press as a drag, so it isn't a click anymore. */
    private is_press_taken_by_parent: boolean = false;

    /**
     * The element holding the current press. It lets go of one that was taken off the page in the
     * meantime (`Group.remove()`), so a dead widget keeps nothing and clicks nothing.
     */
    public get mouse_locked_element(): Element | null {
        if (this._mouse_locked_element?.is_down === false) {
            this._mouse_locked_element = null;
        }
        return this._mouse_locked_element;
    }

    public set mouse_locked_element(element: Element | null) {
        this._mouse_locked_element = element;
    }

    public pointer_down(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        this.mouse_down_position = new Vector2(unit_coords);
        this.is_mouse_down = true;
        const elements = this.active_menu?.hit(unit_coords) ?? [];
        const element = elements.length > 0 ? elements[0] : null;
        if (element) {
            element.update_mouse_down_status(true);
            // Trigger drag immediately on pointer-down (e.g. sliders), in the widget's own
            // (reference) coordinates, the same ones hit() tested. A disabled element never drags.
            if (!element.is_disabled) {
                element.drag(null, this.to_reference(unit_coords));
            }
        }
        this.mouse_locked_element = element;
        this.is_press_taken_by_parent = false;
        return !!element;
    }

    public pointer_up(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        let is_hit = false;
        const locked = this.mouse_locked_element;
        if (locked) {
            locked.update_mouse_down_status(false);
            // A press that ended elsewhere was a drag, not a click.
            const elements = this.active_menu?.hit(unit_coords) ?? [];
            if (!this.is_press_taken_by_parent && elements.includes(locked)) {
                locked.click();
                is_hit = true;
            }
        }
        this.is_mouse_down = false;
        this.mouse_locked_element = null;
        this.mouse_down_position = null;
        return is_hit;
    }

    public pointer_move(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);

        this.forget_released_hovers();

        // Determine newly hit elements
        const hit_elements = this.active_menu?.hit(unit_coords) ?? [];
        const hit_set = new Set<Element>(hit_elements);

        // Un-hover elements that are no longer hit
        for (const element of this._hovered_elements) {
            if (!hit_set.has(element)) {
                element.update_mouse_hover_status(false);
            }
        }
        // Hover elements that are newly hit (respecting mouse lock)
        for (const el of hit_elements) {
            const can_hover =
                this.mouse_locked_element === null ||
                this.mouse_locked_element === el;
            el.update_mouse_hover_status(can_hover);
        }
        this._hovered_elements = hit_set;

        const locked = this.mouse_locked_element;
        if (locked) {
            this.forward_drag(locked, unit_coords);
        }

        return hit_elements.length > 0;
    }

    public pointer_exit(): void {
        this.is_mouse_down = false;
        this.mouse_down_position = null;
        this.mouse_locked_element?.update_mouse_down_status(false);
        for (const el of this._hovered_elements) {
            el.update_mouse_hover_status(false);
        }
        this._hovered_elements.clear();
        this.mouse_locked_element = null;
    }

    /**
     * The turning wheel over `unit_coords`: offered to what's under the pointer, the top element
     * first. Returns whether one took it.
     */
    public wheel(unit_coords: Vector2I, delta_y: number): boolean {
        const elements = this.active_menu?.hit(unit_coords) ?? [];
        return elements.some((element) => element.wheel(delta_y));
    }

    /**
     * The move goes to the locked element. If it doesn't drag (a button, a row), and the press has
     * moved far enough, it is offered to its parents; the one that takes it holds the press from
     * now on, and the release is no click.
     */
    private forward_drag(locked: Element, unit_coords: Vector2I): void {
        const down = this.mouse_down_position;
        const start =
            down === null ? null : new Vector2(this.to_reference(down));
        const current = this.to_reference(unit_coords);
        if (!locked.is_disabled && locked.drag(start, current)) {
            return;
        }
        if (
            start === null ||
            Math.hypot(current.x - start.x, current.y - start.y) <
                this.drag_threshold
        ) {
            return;
        }
        for (let parent = locked.parent; parent; parent = parent.parent) {
            if (!parent.is_disabled && parent.drag(start, current)) {
                locked.release_pointer();
                parent.update_mouse_down_status(true);
                this.mouse_locked_element = parent;
                this.is_press_taken_by_parent = true;
                return;
            }
        }
    }

    /** A removed element has no hover anymore, and must not stay in the set. */
    private forget_released_hovers(): void {
        for (const element of this._hovered_elements) {
            if (!element.is_hovered) {
                this._hovered_elements.delete(element);
            }
        }
    }

    /** Pointer coordinates as the active page's widgets see them; unchanged without a page. */
    private to_reference(coords: Vector2I): Vector2I {
        return this.active_menu?.to_reference(coords) ?? coords;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        this.active_menu?.draw(ctx);
    }
}
