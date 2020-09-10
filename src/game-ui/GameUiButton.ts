import p5 from "p5";
import { GameUiRect } from "./GameUiRect";
import { GameUiLabel } from "./GameUiLabel";
import { Rect } from "../geometries/Rect";

export class GameUiButton extends GameUiLabel {
    public on_click?: (rel_pos: p5.Vector) => void;

    public constructor(rect: Rect, text: string = '') {
        super(rect, text);
    }

    public draw(p: p5) {
        super.draw(p);
    }

    public handle_click(global: p5.Vector): boolean {
        if (this.rect.contains(global.x, global.y)) {
            if (this.on_click) {
                this.on_click(global.copy().sub(this.rect.x, this.rect.y));
            }
            return true;
        }
        return false;
    }

    public set_on_click(handler: () => void): this {
        this.on_click = handler;
        return this;
    }
}