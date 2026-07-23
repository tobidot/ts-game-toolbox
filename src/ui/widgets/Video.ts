import { RectI } from "../../geometries";
import { Element } from "../Element";
import { Asset } from "../../assets";
import { ThemeRule } from "../theme/Theme";

export class Video extends Element {
    public readonly video: Asset<HTMLVideoElement>;
    public pixel_size: number;
    private offscreen_canvas: HTMLCanvasElement | null = null;
    private offscreen_ctx: CanvasRenderingContext2D | null = null;

    public constructor(
        video: Asset<HTMLVideoElement>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
        pixel_size: number = 1,
    ) {
        super(rect, is_visible, theme_rules);
        this.video = video;
        this.type = "video";
        this.pixel_size = pixel_size;
        
        const element = this.video.element;
        if (element) {
            element.loop = true;
            element.muted = true;
            element.autoplay = true;
            element.playsInline = true;
        }
    }

    public play(): void {
        const element = this.video.element;
        if (element && element.paused) {
            const play_promise = element.play();
            if (play_promise !== undefined && typeof play_promise.catch === "function") {
                play_promise.catch(() => {});
            }
        }
    }

    public pause(): void {
        const element = this.video.element;
        if (element && !element.paused) {
            element.pause();
        }
    }

    private get_offscreen(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
        if (typeof document === "undefined") return null;
        if (!this.offscreen_canvas) {
            this.offscreen_canvas = document.createElement("canvas");
            this.offscreen_ctx = this.offscreen_canvas.getContext("2d");
        }
        if (this.offscreen_canvas.width !== width || this.offscreen_canvas.height !== height) {
            this.offscreen_canvas.width = width;
            this.offscreen_canvas.height = height;
        }
        if (!this.offscreen_ctx) return null;
        return { canvas: this.offscreen_canvas, ctx: this.offscreen_ctx };
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) return;

        const { border_color, border_width, border_radius } =
            this.theme_instance.get_all();

        ctx.save();

        this.apply_transforms(ctx);

        const video_asset = this.video;
        const border_box = this.get_local_border_box_size();
        const content_box = this.get_local_content_box_size();
        
        if (video_asset.ready && video_asset.element) {
            const el = video_asset.element;
            if (el.paused && !el.ended) {
                const play_promise = el.play();
                if (play_promise !== undefined && typeof play_promise.catch === "function") {
                    play_promise.catch(() => {});
                }
            }
            
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
                const low_width = Math.max(1, Math.floor(content_box.width / pixel_size));
                const low_height = Math.max(1, Math.floor(content_box.height / pixel_size));

                const offscreen = this.get_offscreen(low_width, low_height);
                if (offscreen) {
                    offscreen.ctx.clearRect(0, 0, low_width, low_height);
                    offscreen.ctx.drawImage(el, 0, 0, low_width, low_height);

                    const old_smoothing = ctx.imageSmoothingEnabled;
                    ctx.imageSmoothingEnabled = false;
                    // @ts-ignore
                    if (ctx.mozImageSmoothingEnabled !== undefined) ctx.mozImageSmoothingEnabled = false;
                    // @ts-ignore
                    if (ctx.webkitImageSmoothingEnabled !== undefined) ctx.webkitImageSmoothingEnabled = false;
                    // @ts-ignore
                    if (ctx.msImageSmoothingEnabled !== undefined) ctx.msImageSmoothingEnabled = false;

                    ctx.drawImage(
                        offscreen.canvas,
                        content_box.left,
                        content_box.top,
                        content_box.width,
                        content_box.height,
                    );

                    ctx.imageSmoothingEnabled = old_smoothing;
                }
            } else {
                ctx.drawImage(
                    el,
                    content_box.left,
                    content_box.top,
                    content_box.width,
                    content_box.height,
                );
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
