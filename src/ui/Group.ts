import { RectI } from "../geometries/Rect";
import { Vector2, Vector2I } from "../geometries/Vector2";
import { Element } from "./Element";

export class Group extends Element {
    public readonly children: Array<Element>;

    public constructor(
        children: Array<Element>,
        rect: RectI,
        is_visible: boolean = true,
    ) {
        super(rect, is_visible);
        this.children = children;
    }

    public add(child: Element): void {
        this.children.push(child);
    }

    public override hit(coords: Vector2I): Element | null {
        if (!this.is_visible) return null;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const hit = this.children[i].hit(coords);
            if (hit) return hit;
        }
        return super.hit(coords);
    }

    public override hover(
        coords: Vector2I,
        locked_element: Element | null,
    ): boolean {
        if (!this.is_visible) {
            super.hover(coords, locked_element);
            for (const child of this.children) {
                child.hover(coords, locked_element);
            }
            return false;
        }

        let is_hit = super.hover(coords, locked_element);
        for (const child of this.children) {
            is_hit = child.hover(coords, locked_element) || is_hit;
        }
        return is_hit;
    }

    public override drag(
        _start_coords: Vector2 | null,
        _current_coords: Vector2I,
    ): boolean {
        return false;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;
        for (const child of this.children) {
            child.draw(ctx);
        }
    }
}
