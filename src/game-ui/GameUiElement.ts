import p5 from "p5";
import { Rect } from "../geometries/Rect";

export abstract class GameUiElement {
    public rect: Rect;
    public on_draw?: (self: GameUiElement) => void;
    public active: boolean = true;

    constructor(rect: Rect) {
        this.rect = rect;
    }

    public draw(p: p5): void {
        if (!this.active) return;
        if (this.on_draw) this.on_draw(this);
    };

    protected draw_base_rect(p: p5) {
        p.rect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    }

    public set_on_draw(handler: (self: GameUiElement) => void) {
        this.on_draw = handler;
        return this;
    }

    public handle_click(global: p5.Vector): boolean {
        if (this.rect.contains(global.x, global.y)) {
            return true;
        }
        return false;
    }

    public handle_drag(global: p5.Vector, drag: p5.Vector): boolean {
        if (this.rect.contains(global.x, global.y)) {
            return true;
        }
        return false;
    }
}