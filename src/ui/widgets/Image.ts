import { Rect, RectI } from "../../geometries";
import { Element } from "../Element";
import { Asset } from "../../assets";
import { ThemeRule } from "../theme/Theme";

export class Image extends Element {
    /** The picture; null draws nothing, for a widget built before its assets exist. */
    public image: Asset<HTMLImageElement> | null;
    public pixel_size: number;
    /** Keep the picture's shape, centered in the box, instead of stretching it. */
    public is_contained: boolean = false;
    /** False keeps pixel art sharp when it is drawn larger. */
    public is_smooth: boolean = true;
    private offscreen_canvas: HTMLCanvasElement | null = null;
    private offscreen_ctx: CanvasRenderingContext2D | null = null;

    public constructor(
        image: Asset<HTMLImageElement> | null,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
        pixel_size: number = 1,
    ) {
        super(rect, is_visible, theme_rules);
        this.image = image;
        this.type = "image";
        this.pixel_size = pixel_size;
    }

    private get_offscreen(
        width: number,
        height: number,
    ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
        if (typeof document === "undefined") {
            return null;
        }
        if (!this.offscreen_canvas) {
            this.offscreen_canvas = document.createElement("canvas");
            this.offscreen_ctx = this.offscreen_canvas.getContext("2d");
        }
        if (
            this.offscreen_canvas.width !== width ||
            this.offscreen_canvas.height !== height
        ) {
            this.offscreen_canvas.width = width;
            this.offscreen_canvas.height = height;
        }
        if (!this.offscreen_ctx) {
            return null;
        }
        return { canvas: this.offscreen_canvas, ctx: this.offscreen_ctx };
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        const { border_color, border_width, border_radius } =
            this.theme_instance.get_all();

        ctx.save();

        this.apply_transforms(ctx);

        const img = this.image;
        const border_box = this.get_local_border_box_size();
        const content_box = this.get_local_content_box_size();
        // draw the image
        if (img !== null && img.ready) {
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

            const pixel_size = Math.max(1, Math.round(this.pixel_size));
            if (pixel_size > 1) {
                const low_width = Math.max(
                    1,
                    Math.floor(target.width / pixel_size),
                );
                const low_height = Math.max(
                    1,
                    Math.floor(target.height / pixel_size),
                );

                const offscreen = this.get_offscreen(low_width, low_height);
                if (offscreen) {
                    offscreen.ctx.clearRect(0, 0, low_width, low_height);
                    offscreen.ctx.drawImage(
                        img.element,
                        0,
                        0,
                        low_width,
                        low_height,
                    );

                    const old_smoothing = ctx.imageSmoothingEnabled;
                    ctx.imageSmoothingEnabled = false;
                    // Vendor-prefixed flags of older engines, absent from the standard lib types.
                    const prefixed = ctx as unknown as Record<string, unknown>;
                    for (const key of [
                        "mozImageSmoothingEnabled",
                        "webkitImageSmoothingEnabled",
                        "msImageSmoothingEnabled",
                    ]) {
                        if (prefixed[key] !== undefined) {
                            prefixed[key] = false;
                        }
                    }

                    ctx.drawImage(
                        offscreen.canvas,
                        target.left,
                        target.top,
                        target.width,
                        target.height,
                    );

                    ctx.imageSmoothingEnabled = old_smoothing;
                }
            } else {
                const old_smoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = this.is_smooth;
                ctx.drawImage(
                    img.element,
                    target.left,
                    target.top,
                    target.width,
                    target.height,
                );
                ctx.imageSmoothingEnabled = old_smoothing;
            }
            ctx.restore();
        }

        // make the border
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

        ctx.restore(); // transform
    }
}
