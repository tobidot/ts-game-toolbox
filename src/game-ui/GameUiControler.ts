import { GameUiElement } from "./GameUiElement";
import p5 from "p5";
import { Rect } from "../geometries/Rect";

export class GameUiControler extends GameUiElement {
    public on_drag: null | { (global: p5.Vector, drag: p5.Vector): void } = null;
    public readonly handle: Rect;
    public relative_value_x: number = 0;
    public relative_value_y: number = 0;

    public constructor(size: Rect, range: Rect) {
        super(range);
        this.handle = size;
    }

    public draw(p: p5) {
        const cx = this.handle.x + this.handle.w / 2;
        const cy = this.handle.y + this.handle.h / 2;
        p.fill(20);
        p.rect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        p.fill(200);
        p.ellipse(cx, cy, this.handle.w, this.handle.h);
    }

    public set_on_drag(cb: (global: p5.Vector, drag: p5.Vector) => void): this {
        this.on_drag = cb;
        return this;
    }

    public handle_drag(global: p5.Vector, drag: p5.Vector): boolean {
        if (this.rect.contains(global) || this.handle.contains(global)) {
            this.handle.x = Math.max(this.rect.x, Math.min(this.rect.x + this.rect.w, global.x)) - this.handle.w / 2;
            this.handle.y = Math.max(this.rect.y, Math.min(this.rect.y + this.rect.h, global.y)) - this.handle.h / 2;
            this.relative_value_x = ((this.handle.x - this.rect.x) + this.handle.w / 2) / this.rect.w;
            this.relative_value_y = ((this.handle.y - this.rect.y) + this.handle.h / 2) / this.rect.h;
            if (this.on_drag) {
                this.on_drag(global, drag);
            }
            return true;
        }
        return false;
    }
}