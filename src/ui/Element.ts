import {EventSocket} from "../signals";
import {Rect, RectI} from "../geometries";
import {Vector2, Vector2I} from "../geometries";
import {ElementChangeEvent, ElementClickEvent} from "./events";

export type ElementEvents = ElementChangeEvent | ElementClickEvent;

export class Element {
    public readonly events: EventSocket<ElementEvents> = new EventSocket();
    public readonly rect: Rect;
    public is_visible: boolean;
    public is_hovered: boolean = false;
    public is_down: boolean = false;

    public constructor(
        rect: RectI,
        is_visible: boolean = true,
    ) {
        this.rect = new Rect(rect);
        this.is_visible = is_visible;
    }

    public hit(coords: Vector2I): Element | null {
        if (!this.is_visible) return null;
        return this.rect.contains(coords.x, coords.y) ? this : null;
    }

    public hover(coords: Vector2I, _locked_element: Element | null): boolean {
        if (!this.is_visible) {
            this.is_hovered = false;
            return false;
        }
        this.is_hovered = this.rect.contains(coords.x, coords.y);
        return this.is_hovered;
    }

    public drag(_start_coords: Vector2 | null, _current_coords: Vector2I): boolean {
        return false;
    }

    public on_click(coords: Vector2I): void {
        this.dispatch_click_event(coords);
    }

    public dispatch_click_event(coords: Vector2I): void {
        this.events.dispatch(new ElementClickEvent(this, coords));
    }

    public dispatch_change_event(): void {
        this.events.dispatch(new ElementChangeEvent(this));
    }

    public draw(_ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;
        // Default implementation just draws a box if needed or nothing
    }

}
