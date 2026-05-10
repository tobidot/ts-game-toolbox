import { RectI } from "../../geometries/Rect";
import { Vector2I } from "../../geometries/Vector2";
import { Element } from "../Element";
import { Theme } from "../Theme";

export class Gallery extends Element {
    public readonly images: Array<HTMLImageElement> = [];
    public title: string;
    public current_image_index: number = 0;

    public constructor(
        title: string,
        images: Array<HTMLImageElement>,
        rect: RectI,
        is_visible: boolean = true,
        theme?: Theme,
    ) {
        super(rect, is_visible, theme);
        this.images = images;
        this.title = title;
    }

    public override on_click(_coords: Vector2I): void {
        this.next();
    }

    public next(): void {
        this.current_image_index =
            (this.current_image_index + 1) % this.images.length;
        this.dispatch_change_event();
    }

    public previous(): void {
        this.current_image_index =
            (this.current_image_index + this.images.length - 1) %
            this.images.length;
        this.dispatch_change_event();
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        const img = this.images[this.current_image_index];
        if (img) {
            ctx.drawImage(
                img,
                this.rect.left,
                this.rect.top,
                this.rect.width,
                this.rect.height,
            );
        } else {
            ctx.fillStyle = this.theme.background_color;
            ctx.fillRect(
                this.rect.left,
                this.rect.top,
                this.rect.width,
                this.rect.height,
            );
            ctx.fillStyle = this.theme.text_color;
            ctx.font = this.theme.secondary_font;
            ctx.textAlign = "center";
            ctx.fillText(
                "No Image",
                this.rect.left + this.rect.width / 2,
                this.rect.top + this.rect.height / 2,
            );
        }

        ctx.strokeStyle = this.theme.border_color;
        ctx.strokeRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );

        ctx.fillStyle = this.theme.text_color;
        ctx.font = this.theme.label_font;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(this.title, this.rect.left, this.rect.top - 20);
    }
}
