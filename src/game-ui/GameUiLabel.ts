import p5 from "p5";
import { GameUiRect } from "./GameUiRect";
import { Rect } from "../geometries/Rect";

export class GameUiLabel extends GameUiRect {
    public text: string;
    public horizontal_align: p5.HORIZ_ALIGN = "center";
    public vertical_align: p5.VERT_ALIGN = "center";
    public text_color: string = "#fff";
    public text_size: number = 32;

    constructor(rect: Rect, text: string = '') {
        super(rect);
        this.text = text;
    }

    public draw(p: p5) {
        super.draw(p);
        p.textAlign(this.horizontal_align, this.vertical_align);
        p.fill(this.text_color);
        p.textSize(this.text_size);
        let x = this.rect.x;
        let y = this.rect.y;
        switch (this.horizontal_align) {
            case "left": break;
            case "center": x += this.rect.w / 2; break;
            case "right": x += this.rect.w; break;
        }
        p.text(this.text, x, this.rect.y + this.rect.h / 2);
    }

    public set_text_size(size: number): this {
        this.text_size = size;
        return this;
    }

    public set_text(text: string): this {
        this.text = text;
        return this;
    }

    public set_text_color(color: string): this {
        this.text_color = color;
        return this;
    }

    public set_alignment(horizontal: p5.HORIZ_ALIGN, vertical: p5.VERT_ALIGN): this {
        this.vertical_align = vertical;
        this.horizontal_align = horizontal;
        return this;
    }
}