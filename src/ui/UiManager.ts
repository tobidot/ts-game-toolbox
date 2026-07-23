import { Vector2, Vector2I } from "../geometries";
import { Element } from "./Element";
import { Group } from "./Group";
import { UiPage } from "./UiPage";

export class UiManager {
    public active_menu: UiPage | null = null;
    public mouse_locked_element: Element | null = null;
    public is_mouse_down: boolean = false;
    public mouse_position: Vector2 | null = null;
    public mouse_down_position: Vector2 | null = null;

    public pointer_down(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        this.mouse_down_position = new Vector2(unit_coords);
        this.is_mouse_down = true;
        const elements = this.active_menu?.hit(unit_coords);
        const element = elements && elements.length > 0 ? elements[0] : null;
        this.mouse_locked_element = element;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.set_mouse_down(true);
            // Also trigger drag immediately on down for elements like sliders
            const local_coords =
                this.mouse_locked_element.transform_parent_to_local_coordinates(unit_coords);
            const local_start = this.mouse_down_position
                ? this.mouse_locked_element.transform_parent_to_local_coordinates(
                      this.mouse_down_position,
                  )
                : null;
            this.mouse_locked_element.drag(local_start, local_coords);
        }
        return !!element;
    }

    public pointer_up(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        let is_hit = false;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.set_mouse_down(false);
            const local_coords =
                this.mouse_locked_element.transform_parent_to_local_coordinates(unit_coords);
            this.mouse_locked_element.click(local_coords);
            is_hit = true;
        }
        this.is_mouse_down = false;
        this.mouse_locked_element = null;
        this.mouse_down_position = null;
        return is_hit;
    }

    public pointer_move(unit_coords: Vector2I): boolean {
        this.mouse_position = new Vector2(unit_coords);
        let is_hit =
            this.active_menu?.hover(unit_coords, this.mouse_locked_element) ??
            false;
        if (this.mouse_locked_element) {
            const local_coords =
                this.mouse_locked_element.transform_parent_to_local_coordinates(unit_coords);
            const local_start = this.mouse_down_position
                ? this.mouse_locked_element.transform_parent_to_local_coordinates(
                      this.mouse_down_position,
                  )
                : null;
            is_hit =
                this.mouse_locked_element.drag(local_start, local_coords) ||
                is_hit;
        }
        return is_hit;
    }

    public pointer_exit(): void {
        this.is_mouse_down = false;
        this.mouse_down_position = null;
        if (this.mouse_locked_element) {
            this.mouse_locked_element.set_mouse_down(false);
        }
        this.mouse_locked_element = null;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        this.active_menu?.draw(ctx);
    }
}
