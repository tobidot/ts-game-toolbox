import { RectI } from "../geometries";
import { LayoutRect, StageLayout } from "../stage/StageLayout";
import { draw_start_screen, start_screen_block } from "../stage/StartScreen";
import { UiManager } from "../ui/UiManager";
import { CanvasGameReferences } from "./CanvasGameReferences";
import {
    CanvasGameSettings,
    HeaderLayout,
    LayoutOf,
} from "./CanvasGameSettings";

/** What one repaint shows. Logic assembles it, the renderer paints it; a game extends it. */
export interface GameFrame<G> {
    readonly game: G;
    readonly ui: UiManager;
}

/** What a game's frame has beyond `game` and `ui`: the return type of `CanvasGameLogic.frame()`. */
export type FrameExtras<F> = Omit<F, keyof GameFrame<unknown>>;

/** How `CanvasGameRenderer.text()` sets a line. Size 18, regular, white, left, top by default. */
export interface TextStyle {
    size?: number;
    is_bold?: boolean;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    /** Squeezes the line into this width instead of letting it run over. */
    max_width?: number;
}

/** Centred on the point both ways: `this.text(s, x, y, { ...CENTRED, size: 24 })`. */
export const CENTRED = {
    align: "center",
    baseline: "middle",
} as const satisfies TextStyle;

/** The card that ends a round: what `CanvasGameRenderer.result_panel()` shows. */
export interface ResultPanel {
    /** "Game Over", "Runde vorbei". */
    title: string;
    title_color?: string;
    /** The big line: the score. */
    value: string;
    /** The session record under it, orange when this round set it (see `SessionBest`). */
    best?: { text: string; is_new: boolean };
    /** Smaller muted lines: the round's numbers. */
    lines?: readonly string[];
    /** The pill at the bottom: what to press next. The panel is 270 + 24 per line tall, 36 less without `best`. */
    action: string;
    /** False while the next round cannot start yet: the pill is grey. Default true. */
    is_action_ready?: boolean;
    /** Default 560. */
    width?: number;
}

/**
 * Pure painting. The shell clears the canvas, sets layout coordinates, calls `paint()` and
 * draws the toolbox UI on top; a game only implements `paint()`. The start screen comes for
 * free: the title, `settings.rule` under it, and optionally a picture above it
 * (`start_picture_height` + `paint_start_picture()`) or a scene behind it
 * (`paint_start_backdrop()`).
 */
export abstract class CanvasGameRenderer<
    G,
    S extends CanvasGameSettings<StageLayout> = CanvasGameSettings,
    F extends GameFrame<G> = GameFrame<G>,
> {
    /** Height of the picture above the start screen's title; 0 for none. */
    protected readonly start_picture_height: number = 0;
    /** A card behind the start screen's picture and text, for a busy backdrop. */
    protected readonly start_card: boolean = false;

    public constructor(
        protected readonly references: CanvasGameReferences<LayoutOf<S>>,
        protected readonly settings: S,
    ) {}

    protected get context(): CanvasRenderingContext2D {
        return this.references.stage.context;
    }

    /** The scene in layout coordinates; the UI page is drawn afterwards by the shell. */
    protected abstract paint(
        context: CanvasRenderingContext2D,
        layout: LayoutOf<S>,
        frame: F,
    ): void;

    // ---- start screen hooks ----

    /** The line under the title on the start screen. Default: `settings.rule`. */
    protected start_subtitle(game: G | null): string | undefined {
        void game;
        return this.settings.rule || undefined;
    }

    /**
     * Behind the start screen's text, e.g. the game's scene under `dim()`. `block` is where the
     * picture and the text go, to keep the scene clear of them. Default: nothing.
     */
    protected paint_start_backdrop(
        context: CanvasRenderingContext2D,
        layout: LayoutOf<S>,
        game: G | null,
        block: LayoutRect,
    ): void {
        void context;
        void layout;
        void game;
        void block;
    }

    /** The picture above the title, in `rect` (`start_picture_height` tall, centred with the text). */
    protected paint_start_picture(
        context: CanvasRenderingContext2D,
        rect: LayoutRect,
        game: G | null,
    ): void {
        void context;
        void rect;
        void game;
    }

    // ---- what the shell calls ----

    public render(frame: F): void {
        const stage = this.references.stage;
        const context = stage.begin(this.settings.background);
        this.paint(context, stage.layout, frame);
        frame.ui.draw(stage.end());
    }

    public render_start(game: G | null): void {
        const stage = this.references.stage;
        const layout = stage.layout;
        const colors = this.settings.colors;
        const context = stage.begin(this.settings.background);
        const picture_height = this.start_picture_height;
        context.save();
        this.paint_start_backdrop(
            context,
            layout,
            game,
            start_screen_block(layout, picture_height),
        );
        context.restore();
        draw_start_screen(context, layout, {
            title: this.settings.title,
            subtitle: this.start_subtitle(game),
            button: this.settings.start_button,
            hint: this.settings.start_hint,
            font_family: this.settings.font_family,
            colors: {
                title: colors.white,
                subtitle: colors.turquoise,
                button: colors.turquoise,
                button_text: colors.black,
                hint: colors.muted,
            },
            card: this.start_card ? colors.card : undefined,
            picture:
                picture_height > 0
                    ? {
                          height: picture_height,
                          paint: (picture_context, rect) =>
                              this.paint_start_picture(
                                  picture_context,
                                  rect,
                                  game,
                              ),
                      }
                    : undefined,
        });
    }

    // ---- helpers for paint() ----

    /**
     * The title, and under it `subtitle` (default: the layout's `subtitle.text`, else the rule),
     * at the layout's header positions and sizes.
     */
    protected paint_header(
        layout: HeaderLayout,
        subtitle: string = layout.subtitle.text ?? this.settings.rule,
    ): void {
        const { title } = layout;
        this.text(this.settings.title, title.left, title.top, {
            size: title.size,
            is_bold: true,
        });
        this.text(subtitle, layout.subtitle.left, layout.subtitle.top, {
            size: layout.subtitle.size ?? 18,
            color: this.settings.colors.turquoise,
        });
    }

    /** The CSS font for `size` in the game's font family, e.g. for `measureText()`. */
    protected font(size: number, is_bold: boolean = false): string {
        return `${is_bold ? "bold " : ""}${size}px ${this.settings.font_family}`;
    }

    /** One line of text in the game's font: size, weight, color and alignment in one call. */
    protected text(
        content: string,
        x: number,
        y: number,
        style: TextStyle = {},
    ): void {
        const context = this.context;
        context.font = this.font(style.size ?? 18, style.is_bold);
        context.fillStyle = style.color ?? this.settings.colors.white;
        context.textAlign = style.align ?? "left";
        context.textBaseline = style.baseline ?? "top";
        context.fillText(content, x, y, style.max_width);
    }

    /** A small muted label above a card's value ("LEVEL", "PALETTE"), 14px unless `style` says. */
    protected caption(
        content: string,
        x: number,
        y: number,
        style: TextStyle = {},
    ): void {
        this.text(content, x, y, {
            size: 14,
            color: this.settings.colors.muted,
            ...style,
        });
    }

    /** `lines` one under the other from `top`, in the context's current font and color. */
    protected fill_lines(
        lines: readonly string[],
        left: number,
        top: number,
        line_height: number,
    ): void {
        lines.forEach((line, index) =>
            this.context.fillText(line, left, top + index * line_height),
        );
    }

    /**
     * `text` word-wrapped into `max_width` and filled from `top` down in the context's current
     * font and color. Returns the number of lines.
     */
    protected fill_wrapped(
        text: string,
        left: number,
        top: number,
        max_width: number,
        line_height: number,
    ): number {
        const lines = this.wrap(text, max_width);
        this.fill_lines(lines, left, top, line_height);
        return lines.length;
    }

    /** A rounded, filled rectangle: the house's cards and keys. */
    protected card(
        rect: RectI,
        color: string,
        radius: number = this.settings.radius,
    ): void {
        const context = this.context;
        context.fillStyle = color;
        context.beginPath();
        context.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
        context.fill();
    }

    /** A rounded outline, e.g. around a panel or a highlighted card. */
    protected outline(
        rect: RectI,
        color: string = this.settings.colors.line,
        line_width: number = 2,
        radius: number = this.settings.radius,
    ): void {
        const context = this.context;
        context.strokeStyle = color;
        context.lineWidth = line_width;
        context.beginPath();
        context.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
        context.stroke();
    }

    /**
     * `text` word-wrapped into `rect` less `inset` on each side, the lines centred vertically and
     * left-aligned, in the context's current font and color: a message card. Returns the lines.
     */
    protected fill_wrapped_in(
        text: string,
        rect: RectI,
        line_height: number,
        inset: number = 20,
    ): number {
        const context = this.context;
        const lines = this.wrap(text, rect.width - 2 * inset);
        context.textAlign = "left";
        context.textBaseline = "middle";
        const top =
            rect.top + rect.height / 2 - ((lines.length - 1) * line_height) / 2;
        this.fill_lines(lines, rect.left + inset, top, line_height);
        return lines.length;
    }

    /** A filled circle: a peg, a ball, a dot. */
    protected disc(x: number, y: number, radius: number, color: string): void {
        this.ellipse(x, y, radius, radius, color);
    }

    /** A filled ellipse: a hole, a shadow. */
    protected ellipse(
        x: number,
        y: number,
        radius_x: number,
        radius_y: number,
        color: string,
    ): void {
        const context = this.context;
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(x, y, radius_x, radius_y, 0, 0, Math.PI * 2);
        context.fill();
    }

    /** A HUD card: a muted label at the top, the value large and bold at the bottom. */
    protected stat(
        rect: RectI,
        label: string,
        value: string,
        style: {
            color?: string;
            label_size?: number;
            value_size?: number;
            is_outlined?: boolean;
        } = {},
    ): void {
        this.card(rect, this.settings.colors.card);
        if (style.is_outlined) this.outline(rect);
        this.caption(label, rect.left + 16, rect.top + 12, {
            size: style.label_size ?? 14,
        });
        this.text(value, rect.left + 16, rect.top + rect.height - 10, {
            size: style.value_size ?? 26,
            is_bold: true,
            color: style.color,
            baseline: "bottom",
            max_width: rect.width - 32,
        });
    }

    /**
     * The end of a round over the dimmed scene: title, the big value, the session best, the
     * round's numbers and the pill with what to press next. Returns the panel's rect.
     */
    protected result_panel(result: ResultPanel): RectI {
        const colors = this.settings.colors;
        const layout = this.references.stage.layout;
        const lines = result.lines ?? [];
        // Without a best line the numbers move up into its place.
        const lines_top = result.best === undefined ? 150 : 186;
        const height = lines_top + 84 + lines.length * 24;
        this.dim(0.6);
        const rect = this.panel(
            Math.min(result.width ?? 560, layout.width - 64),
            height,
        );
        const x = layout.width / 2;
        this.text(result.title, x, rect.top + 40, {
            ...CENTRED,
            size: 24,
            is_bold: true,
            color: result.title_color ?? colors.turquoise,
        });
        this.text(result.value, x, rect.top + 98, {
            ...CENTRED,
            size: 56,
            is_bold: true,
        });
        if (result.best !== undefined) {
            this.text(result.best.text, x, rect.top + 150, {
                ...CENTRED,
                color: result.best.is_new ? colors.orange : colors.muted,
            });
        }
        lines.forEach((line, index) =>
            this.text(line, x, rect.top + lines_top + index * 24, {
                ...CENTRED,
                size: 15,
                color: colors.muted,
            }),
        );
        const is_ready = result.is_action_ready ?? true;
        const pill_width = Math.min(420, rect.width - 48);
        this.pill(
            {
                left: x - pill_width / 2,
                top: rect.top + height - 74,
                width: pill_width,
                height: 50,
            },
            result.action,
            is_ready ? colors.turquoise : colors.line,
            is_ready ? colors.black : colors.muted,
        );
        return rect;
    }

    /** An outline drawn inside `rect`, so it does not grow it: a highlighted card or swatch. */
    protected inner_outline(
        rect: RectI,
        color: string = this.settings.colors.turquoise,
        line_width: number = 3,
        radius: number = this.settings.radius,
    ): void {
        const half = line_width / 2;
        this.outline(
            {
                left: rect.left + half,
                top: rect.top + half,
                width: rect.width - line_width,
                height: rect.height - line_width,
            },
            color,
            line_width,
            Math.max(0, radius - half),
        );
    }

    /** A fully rounded button-like card with bold text in its middle: "Leertaste: neue Runde". */
    protected pill(
        rect: RectI,
        content: string,
        fill: string = this.settings.colors.turquoise,
        color: string = this.settings.colors.black,
        size: number = 18,
    ): void {
        this.card(rect, fill, rect.height / 2);
        this.text(
            content,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2 + 1,
            { size, is_bold: true, color, align: "center", baseline: "middle" },
        );
    }

    /** Runs `paint` clipped to the rounded `rect`: a map or a picture inside a card. */
    protected clip_round(
        rect: RectI,
        paint: () => void,
        radius: number = this.settings.radius,
    ): void {
        const context = this.context;
        context.save();
        context.beginPath();
        context.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
        context.clip();
        paint();
        context.restore();
    }

    /**
     * A progress bar: a rounded track, filled to `fraction` (0..1). The fill is never thinner
     * than it is tall, so an almost empty bar is still a visible dot.
     */
    protected bar(
        rect: RectI,
        fraction: number,
        fill: string,
        track: string = this.settings.colors.line,
    ): void {
        const radius = rect.height / 2;
        this.card(rect, track, radius);
        if (fraction <= 0) return;
        const width = Math.max(rect.height, rect.width * Math.min(1, fraction));
        this.card({ ...rect, width }, fill, radius);
    }

    /** `text` broken into lines no wider than `max_width` in the context's current font. */
    protected wrap(text: string, max_width: number): string[] {
        const context = this.context;
        const lines: string[] = [];
        let line = "";
        for (const word of text.split(/\s+/).filter(Boolean)) {
            const candidate = line === "" ? word : `${line} ${word}`;
            if (
                line !== "" &&
                context.measureText(candidate).width > max_width
            ) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if (line !== "") lines.push(line);
        return lines;
    }

    /** Darkens the whole canvas, not only the layout, so the margins stay one with the scene. */
    protected dim(
        alpha: number = 0.5,
        color: string = this.settings.colors.black,
    ): void {
        const context = this.context;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.fillRect(0, 0, context.canvas.width, context.canvas.height);
        context.restore();
    }

    /**
     * An outlined card centred horizontally in the layout, `top` from the layout's top (default:
     * centred vertically too): the panel for "Game Over", "Bereit?" and results. Returns its rect.
     */
    protected panel(width: number, height: number, top?: number): RectI {
        const layout = this.references.stage.layout;
        const panel_width = Math.min(width, layout.width - 48);
        const rect = {
            left: (layout.width - panel_width) / 2,
            top: top ?? (layout.height - height) / 2,
            width: panel_width,
            height,
        };
        this.card(rect, this.settings.colors.card);
        this.outline(rect);
        return rect;
    }

    /** All the canvas shows in layout coordinates: the layout and the margins around it. */
    protected get visible(): LayoutRect {
        return this.references.stage.visible;
    }

    /** The line assistive technology reads; the canvas is the picture. */
    public set_status(text: string): void {
        if (this.references.$status.textContent !== text) {
            this.references.$status.textContent = text;
        }
    }
}
