import { Vector2I } from "../geometries";
import { UiPage } from "../ui/UiPage";
import {
    LayoutRect,
    StageFit,
    StageLayout,
    fit_layout,
    pick_layout,
} from "./StageLayout";

export interface CanvasStageOptions {
    /** The class of the canvas this stage creates. Default "stage__canvas". */
    canvas_class?: string;
}

/** Anything with client coordinates: a PointerEvent, a MouseEvent, a Touch. */
export type ClientPoint = Pick<MouseEvent, "clientX" | "clientY">;

/**
 * A canvas that fills `$stage` and shows a game drawn in a fixed reference resolution at any
 * window size. On every resize it picks the layout that shows the game largest, fits it
 * (scaled, centred) and places every attached toolbox `UiPage` in exactly the same rectangle,
 * so the scene and its buttons never drift apart. Pointer events map to canvas pixels (what a
 * `UiManager` expects) or to layout coordinates (what game code expects).
 *
 * The stage knows nothing about the game: a renderer calls `begin()` and paints in layout
 * coordinates, the logic calls `observe()` once per connection.
 */
export class CanvasStage<L extends StageLayout = StageLayout> {
    public readonly $canvas: HTMLCanvasElement;
    public readonly context: CanvasRenderingContext2D;
    /** The layout in use and where it sits on the canvas; both change on resize. */
    public layout: L;
    public fit: StageFit = { scale: 1, offset_x: 0, offset_y: 0 };
    private readonly pages: UiPage[] = [];

    public constructor(
        public readonly $stage: HTMLElement,
        public readonly layouts: readonly L[],
        options: CanvasStageOptions = {},
    ) {
        if (layouts.length === 0) {
            throw new Error("CanvasStage: at least one layout is required");
        }
        this.layout = layouts[0];
        this.$canvas = document.createElement("canvas");
        this.$canvas.className = options.canvas_class ?? "stage__canvas";
        this.$canvas.width = 1;
        this.$canvas.height = 1;
        const context = this.$canvas.getContext("2d");
        if (context === null) {
            throw new Error("CanvasStage: 2D canvas is not available");
        }
        this.context = context;
        $stage.append(this.$canvas);
    }

    /** Places `page` in the layout's rectangle from now on, on every resize. */
    public attach(page: UiPage): void {
        if (!this.pages.includes(page)) {
            this.pages.push(page);
        }
        this.place(page);
    }

    /**
     * Resizes now and whenever the stage changes size, until `signal` aborts. `on_resize`
     * learns whether the layout changed, so the caller can move its widgets.
     */
    public observe(
        signal: AbortSignal,
        on_resize: (is_layout_changed: boolean) => void,
    ): void {
        const update = () => on_resize(this.resize());
        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(update);
            observer.observe(this.$stage);
            signal.addEventListener("abort", () => observer.disconnect(), {
                once: true,
            });
        }
        update();
    }

    /** Measures the stage, sizes the canvas in device pixels, picks and fits the layout. Returns whether the layout changed. */
    public resize(): boolean {
        const rect = this.$stage.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const pixel_ratio = window.devicePixelRatio || 1;
        const device_width = Math.max(1, Math.round(width * pixel_ratio));
        const device_height = Math.max(1, Math.round(height * pixel_ratio));
        if (this.$canvas.width !== device_width) {
            this.$canvas.width = device_width;
        }
        if (this.$canvas.height !== device_height) {
            this.$canvas.height = device_height;
        }
        const layout = pick_layout(this.layouts, width, height);
        const is_layout_changed = layout !== this.layout;
        this.layout = layout;
        this.fit = fit_layout(layout, device_width, device_height);
        for (const page of this.pages) {
            this.place(page);
        }
        return is_layout_changed;
    }

    /**
     * Fills the whole canvas with `background` and leaves the context in layout coordinates.
     * Call it first in every paint.
     */
    public begin(background: string): CanvasRenderingContext2D {
        const context = this.context;
        const fit = this.fit;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = background;
        context.fillRect(0, 0, this.$canvas.width, this.$canvas.height);
        context.setTransform(
            fit.scale,
            0,
            0,
            fit.scale,
            fit.offset_x,
            fit.offset_y,
        );
        return context;
    }

    /** Back to canvas pixels, which is how a `UiManager` draws its pages (each places itself). */
    public end(): CanvasRenderingContext2D {
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        return this.context;
    }

    /**
     * All the canvas shows, in layout coordinates: the layout plus the margins the fit leaves
     * around it. A scene that runs to the screen's edge (sky, ground) paints this, not the layout.
     */
    public get visible(): LayoutRect {
        const { scale, offset_x, offset_y } = this.fit;
        return {
            left: -offset_x / scale,
            top: -offset_y / scale,
            width: this.$canvas.width / scale,
            height: this.$canvas.height / scale,
        };
    }

    /** A pointer position in canvas pixels: what `UiManager.pointer_down()` and friends expect. */
    public to_canvas(point: ClientPoint): Vector2I {
        const rect = this.$canvas.getBoundingClientRect();
        return {
            x:
                (point.clientX - rect.left) *
                (this.$canvas.width / Math.max(1, rect.width)),
            y:
                (point.clientY - rect.top) *
                (this.$canvas.height / Math.max(1, rect.height)),
        };
    }

    /** A pointer position in layout coordinates: what game code compares with its own rectangles. */
    public to_layout(point: ClientPoint): Vector2I {
        const canvas = this.to_canvas(point);
        return {
            x: (canvas.x - this.fit.offset_x) / this.fit.scale,
            y: (canvas.y - this.fit.offset_y) / this.fit.scale,
        };
    }

    /** A `UiPage` maps its reference rectangle onto a unit rectangle of the canvas: make that the fitted layout. */
    private place(page: UiPage): void {
        const width = this.$canvas.width;
        const height = this.$canvas.height;
        const layout = this.layout;
        page.reference_rect.width = layout.width;
        page.reference_rect.height = layout.height;
        page.rect.left = this.fit.offset_x / width;
        page.rect.top = this.fit.offset_y / height;
        page.rect.width = (layout.width * this.fit.scale) / width;
        page.rect.height = (layout.height * this.fit.scale) / height;
        page.window_resolution = { x: width, y: height };
    }
}
