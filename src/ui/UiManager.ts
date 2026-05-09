import {Vector2, Vector2I} from "../geometries";
import {Element} from "./Element";
import {Group} from "./Group";

export class UiManager {
    public active_menu: Group | null = null;
    public mouse_locked_element: Element | null = null;
    public is_mouse_down: boolean = false;
    public mouse_position: Vector2 | null = null;
    public mouse_down_position: Vector2 | null = null;

    public pointer_down(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        this.mouse_down_position = new Vector2(unit_coords);
        this.is_mouse_down = true;
        const element = this.active_menu?.hit(unit_coords) ?? null;
        this.mouse_locked_element = element;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.is_down = true;
            // Also trigger drag immediately on down for elements like sliders
            this.mouse_locked_element.drag(this.mouse_down_position, unit_coords);
        }
        return !!element;
    }

    public pointer_up(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        let is_hit = false;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.is_down = false;
            this.mouse_locked_element.on_click(unit_coords);
            is_hit = true;
        }
        this.is_mouse_down = false;
        this.mouse_locked_element = null;
        this.mouse_down_position = null;
        return is_hit;
    }

    public pointer_move(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        let is_hit = this.active_menu?.hover(unit_coords, this.mouse_locked_element) ?? false;
        if (this.mouse_locked_element) {
            is_hit = this.mouse_locked_element.drag(this.mouse_down_position, unit_coords) || is_hit;
        }
        return is_hit;
    }

    public pointer_exit(): void {
        this.is_mouse_down = false;
        this.mouse_down_position = null;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.is_down = false;
        }
        this.mouse_locked_element = null;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        this.active_menu?.draw(ctx);
    }
}
