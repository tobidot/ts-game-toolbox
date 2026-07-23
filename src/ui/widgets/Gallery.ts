import { RectI } from "../../geometries";
import { Vector2I } from "../../geometries";
import { Element } from "../Element";
import { ThemeRule } from "../theme/Theme";

export class Gallery extends Element {
    public readonly images: Array<HTMLImageElement> = [];
    public title: string;
    public current_image_index: number = 0;

    public constructor(
        title: string,
        images: Array<HTMLImageElement>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.images = images;
        this.title = title;
        this.type = "gallery";
    }

    public override dispatch_click_event(coords: Vector2I) {
        this.next();
        super.dispatch_click_event(coords);
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

        const {
            background_color,
            border_color,
            border_width,
            border_radius,
            text_color,
            font_size,
            font_family,
            text_baseline,
        } = this.theme_instance.get_all();

        ctx.save();

        this.apply_transforms(ctx);

        const img = this.images[this.current_image_index];
        const content_box = this.get_local_content_box_size();
        const border_box = this.get_local_border_box_size();
        // draw the active image
        if (img) {
            ctx.save();
            ctx.beginPath();
            if (border_radius > 0) {
                ctx.roundRect(
                    border_box.left,
                    border_box.top,
                    border_box.width,
                    border_box.height,
                    border_radius,
                );
            } else {
                ctx.rect(
                    border_box.left,
                    border_box.top,
                    border_box.width,
                    border_box.height,
                );
            }
            ctx.clip();
            ctx.drawImage(
                img,
                content_box.left,
                content_box.top,
                content_box.width,
                content_box.height,
            );
            ctx.restore();
        } else {
            ctx.beginPath();
            if (border_radius > 0) {
                ctx.roundRect(
                    this.rect.left,
                    this.rect.top,
                    this.rect.width,
                    this.rect.height,
                    border_radius,
                );
            } else {
                ctx.rect(
                    this.rect.left,
                    this.rect.top,
                    this.rect.width,
                    this.rect.height,
                );
            }
            ctx.fillStyle = background_color.toString();
            ctx.fill();

            ctx.fillStyle = text_color.toString();
            ctx.font = `${font_size}px ${font_family}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("No Image", this.rect.width / 2, this.rect.height / 2);
        }

        // draw the border
        if (border_width > 0) {
            ctx.beginPath();
            if (border_radius > 0) {
                ctx.roundRect(
                    border_box.left,
                    border_box.top,
                    border_box.width,
                    border_box.height,
                    border_radius,
                );
            } else {
                ctx.rect(
                    border_box.left,
                    border_box.top,
                    border_box.width,
                    border_box.height,
                );
            }
            ctx.lineWidth = border_width;
            ctx.strokeStyle = border_color.toString();
            ctx.stroke();
        }

        ctx.fillStyle = text_color.toString();
        ctx.font = `${font_size}px ${font_family}`;
        ctx.textAlign = "left";
        ctx.textBaseline = text_baseline;
        ctx.fillText(
            this.title,
            0,
            text_baseline === "middle"
                ? -font_size / 2
                : text_baseline === "top"
                  ? -font_size
                  : 0,
        );

        ctx.restore(); // transform
    }
}
