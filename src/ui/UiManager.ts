import { Vector2, Vector2I } from "../geometries";
import { Element } from "./Element";
import { UiPage } from "./UiPage";

export class UiManager {
    public active_menu: UiPage | null = null;
    public mouse_locked_element: Element | null = null;
    public is_mouse_down: boolean = false;
    public mouse_position: Vector2 | null = null;
    public mouse_down_position: Vector2 | null = null;

    /** Elements that were hovered on the last pointer_move call. */
    private _hovered_elements: Set<Element> = new Set();

    public pointer_down(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        this.mouse_down_position = new Vector2(unit_coords);
        this.is_mouse_down = true;
        const elements = this.active_menu?.hit(unit_coords) ?? [];
        const element = elements.length > 0 ? elements[0] : null;
        this.mouse_locked_element = element;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.update_mouse_down_status(true);
            // Trigger drag immediately on pointer-down (e.g. sliders), in the widget's own
            // (reference) coordinates, the same ones hit() tested. A disabled element never drags.
            if (!this.mouse_locked_element.is_disabled) {
                this.mouse_locked_element.drag(
                    null,
                    this.to_reference(unit_coords),
                );
            }
        }
        return !!element;
    }

    public pointer_up(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        let is_hit = false;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.update_mouse_down_status(false);
            // A press that ended elsewhere was a drag, not a click.
            const elements = this.active_menu?.hit(unit_coords) ?? [];
            if (elements.includes(this.mouse_locked_element)) {
                this.mouse_locked_element.click();
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

        // Forward drag to the locked element
        if (
            this.mouse_locked_element &&
            !this.mouse_locked_element.is_disabled
        ) {
            const start = this.mouse_down_position;
            this.mouse_locked_element.drag(
                start === null ? null : new Vector2(this.to_reference(start)),
                this.to_reference(unit_coords),
            );
        }

        return hit_elements.length > 0;
    }

    public pointer_exit(): void {
        this.is_mouse_down = false;
        this.mouse_down_position = null;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.update_mouse_down_status(false);
        }
        for (const el of this._hovered_elements) {
            el.update_mouse_hover_status(false);
        }
        this._hovered_elements.clear();
        this.mouse_locked_element = null;
    }

    /** Pointer coordinates as the active page's widgets see them; unchanged without a page. */
    private to_reference(coords: Vector2I): Vector2I {
        return this.active_menu?.to_reference(coords) ?? coords;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        this.active_menu?.draw(ctx);
    }
}
