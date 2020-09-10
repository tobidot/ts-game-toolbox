import { GameUiElement } from "./GameUiElement";
import p5 from "p5";

export class GameUiRect extends GameUiElement {
    public background_color: string = "#000";

    public draw(p: p5): void {
        super.draw(p);
        p.noStroke();
        p.fill(this.background_color);
        this.draw_base_rect(p);
    }

    public set_background_color(color: string) {
        this.background_color = color;
        return this;
    }
}