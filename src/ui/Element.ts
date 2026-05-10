import { EventSocket } from "../signals";
import { Rect, RectI } from "../geometries";
import { Vector2, Vector2I } from "../geometries";
import { ElementChangeEvent, ElementClickEvent } from "./events";
import { DefaultTheme, Theme } from "./Theme";

export type ElementEvents = ElementChangeEvent | ElementClickEvent;

export class Element {
    public readonly events: EventSocket<ElementEvents> = new EventSocket();
    public readonly rect: Rect;
    public is_visible: boolean;
    public is_hovered: boolean = false;
    public is_down: boolean = false;
    public parent: Group | null = null;
    protected _theme: Theme | null = null;

    public constructor(
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        this.rect = new Rect(rect);
        this.is_visible = is_visible;
        this._theme = theme ?? null;
    }

    public get theme(): Theme {
        if (!this._theme && !this.parent) return DefaultTheme;

        const self = this;
        return new Proxy(this._theme ?? {}, {
            get(target, prop) {
                if (typeof prop === "string") {
                    // 1. Check local theme
                    if ((target as any)[prop] !== undefined) {
                        return (target as any)[prop];
                    }
                    // 2. Check parent theme
                    if (self.parent) {
                        return (self.parent.theme as any)[prop];
                    }
                    // 3. Fallback to default
                    return (DefaultTheme as any)[prop];
                }
                return Reflect.get(target, prop);
            },
        }) as unknown as Theme;
    }

    public set theme(value: Theme | null) {
        this._theme = value;
    }

    public transform_to_local(coords: Vector2I): Vector2I {
        if (this.parent) {
            return this.parent.transform_to_local(coords);
        }
        return coords;
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

    public drag(
        _start_coords: Vector2 | null,
        _current_coords: Vector2I,
    ): boolean {
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
