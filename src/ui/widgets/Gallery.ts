import { Asset } from "../../assets";
import { Rect, RectI } from "../../geometries";
import { Element } from "../Element";
import { theme_font, ThemeRule } from "../theme/Theme";

/** How far above the box the title stands. */
const TITLE_GAP = 6;

export class Gallery extends Element {
    public images: Array<Asset<HTMLImageElement>> = [];
    /** Written above the box. */
    public title: string;
    public current_image_index: number = 0;
    /** Keep a picture's shape, centered in the box, instead of stretching it. */
    public is_contained: boolean = false;
    /** False keeps pixel art sharp when it is drawn larger. */
    public is_smooth: boolean = true;

    public constructor(
        title: string,
        images: Array<Asset<HTMLImageElement>>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(rect, is_visible, theme_rules);
        this.images = images;
        this.title = title;
        this.type = "gallery";
    }

    public override dispatch_click_event() {
        this.next();
        super.dispatch_click_event();
    }

    public next(): void {
        if (this.images.length === 0) {
            return;
        }
        this.current_image_index =
            (this.current_image_index + 1) % this.images.length;
        this.dispatch_change_event();
    }

    public previous(): void {
        if (this.images.length === 0) {
            return;
        }
        this.current_image_index =
            (this.current_image_index + this.images.length - 1) %
            this.images.length;
        this.dispatch_change_event();
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        const {
            background_color,
            border_color,
            border_width,
            border_radius,
            text_color,
        } = this.theme_instance.get_all();

        ctx.save();

        this.apply_transforms(ctx);

        const img = this.images[this.current_image_index];
        const content_box = this.get_local_content_box_size();
        const border_box = this.get_local_border_box_size();
        // draw the active image
        if (img === undefined) {
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
            ctx.fillStyle = background_color.toString();
            ctx.fill();

            ctx.fillStyle = text_color.toString();
            ctx.font = theme_font(this.theme_instance.get_all());
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                "No Image",
                border_box.left + border_box.width / 2,
                border_box.top + border_box.height / 2,
            );
        } else if (img.ready) {
            const target = this.is_contained
                ? Rect.contained(
                      content_box,
                      img.element.naturalWidth,
                      img.element.naturalHeight,
                  )
                : content_box;
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
            ctx.imageSmoothingEnabled = this.is_smooth;
            ctx.drawImage(
                img.element,
                target.left,
                target.top,
                target.width,
                target.height,
            );
            ctx.restore();
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
        ctx.font = theme_font(this.theme_instance.get_all());
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(this.title, border_box.left, border_box.top - TITLE_GAP);

        ctx.restore(); // transform
    }
}
