import { RectI, Rect, Vector2I } from "../geometries";
import { Group } from "./Group";
import { Theme } from "./Theme";
import { Element } from "./Element";

export class UiPage extends Group {
    public referenceRect: Rect;
    public containerRes: Vector2I = { x: 800, y: 600 };

    public constructor(
        rect: RectI,
        referenceRect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super([], rect, is_visible, theme);
        this.referenceRect = new Rect(referenceRect);
    }

    public override transform_to_local(coords: Vector2I): Vector2I {
        const parentCoords = super.transform_to_local(coords);
        return this.transformToReference(parentCoords);
    }

    private transformToReference(coords: Vector2I): Vector2I {
        // Pixel coords to uniform (relative to containerRes)
        const uniformX = coords.x / this.containerRes.x;
        const uniformY = coords.y / this.containerRes.y;

        // Uniform to reference space
        // relX/relY is 0-1 within this page's uniform rect
        const relX = (uniformX - this.rect.left) / this.rect.width;
        const relY = (uniformY - this.rect.top) / this.rect.height;

        return {
            x: relX * this.referenceRect.width + this.referenceRect.left,
            y: relY * this.referenceRect.height + this.referenceRect.top,
        };
    }

    public override hit(coords: Vector2I): Element | null {
        if (!this.is_visible) return null;

        // Check if page itself is hit (in uniform space)
        const uniformX = coords.x / this.containerRes.x;
        const uniformY = coords.y / this.containerRes.y;

        if (!this.rect.contains(uniformX, uniformY)) {
            return null;
        }

        const refCoords = this.transformToReference(coords);
        for (let i = this.children.length - 1; i >= 0; i--) {
            const hit = this.children[i].hit(refCoords);
            if (hit) return hit;
        }
        return this;
    }

    public override hover(
        coords: Vector2I,
        locked_element: Element | null,
    ): boolean {
        if (!this.is_visible) {
            this.is_hovered = false;
            const refCoords = this.transformToReference(coords);
            for (const child of this.children) {
                child.hover(refCoords, locked_element);
            }
            return false;
        }

        const uniformX = coords.x / this.containerRes.x;
        const uniformY = coords.y / this.containerRes.y;
        this.is_hovered = this.rect.contains(uniformX, uniformY);

        const refCoords = this.transformToReference(coords);
        let is_hit = this.is_hovered;
        for (const child of this.children) {
            is_hit = child.hover(refCoords, locked_element) || is_hit;
        }
        return is_hit;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        // Update containerRes from context
        this.containerRes = { x: ctx.canvas.width, y: ctx.canvas.height };

        const actualLeft = this.rect.left * this.containerRes.x;
        const actualTop = this.rect.top * this.containerRes.y;
        const actualWidth = this.rect.width * this.containerRes.x;
        const actualHeight = this.rect.height * this.containerRes.y;

        ctx.save();
        ctx.translate(actualLeft, actualTop);
        ctx.scale(
            actualWidth / this.referenceRect.width,
            actualHeight / this.referenceRect.height,
        );
        ctx.translate(-this.referenceRect.left, -this.referenceRect.top);

        for (const child of this.children) {
            child.draw(ctx);
        }
        ctx.restore();
    }
}
