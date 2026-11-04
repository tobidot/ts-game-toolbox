import { LayoutRect, StageLayout } from "./StageLayout";

export interface StartScreenOptions {
    title: string;
    /** One line under the title, e.g. the rule of the game. */
    subtitle?: string;
    /** The button text. Default "▶ Starten". */
    button?: string;
    /** The line under the button. Default "Klicken oder eine Taste drücken (mit Ton)". */
    hint?: string;
    colors?: {
        title?: string;
        subtitle?: string;
        button?: string;
        button_text?: string;
        hint?: string;
    };
    font_family?: string;
    /** Title size in pixels. Default 52. */
    title_size?: number;
    /** A picture above the title, `height` tall and as wide as the layout allows. */
    picture?: {
        height: number;
        paint: (context: CanvasRenderingContext2D, rect: LayoutRect) => void;
    };
    /** A card in this color behind the picture and the text, so they read over a busy backdrop. */
    card?: string;
}

/** Space between the picture and the title. */
const PICTURE_GAP = 24;

/** The card's padding around the picture and the text. */
const CARD_PADDING = 32;

/**
 * Where the start screen's picture and text go, from the picture's top (or the title's) to the
 * hint's bottom. A backdrop uses it to keep its scene clear of the text.
 */
export function start_screen_block(
    layout: StageLayout,
    picture_height: number = 0,
): LayoutRect {
    const picture = picture_height > 0 ? picture_height + PICTURE_GAP : 0;
    const center_y = layout.height / 2 + picture / 2;
    const top = center_y - 136 - picture;
    return {
        left: 24,
        top,
        width: layout.width - 48,
        height: center_y + 142 - top,
    };
}

/**
 * The default start screen an `IntroGate` waits on: the title, one line under it, a big start
 * button and a hint that the intro has sound, centred in the layout. Draw it in layout
 * coordinates (after `CanvasStage.begin()`). The whole screen is the button: any click or key
 * leaves it, so there is nothing to hit-test.
 */
export function draw_start_screen(
    context: CanvasRenderingContext2D,
    layout: StageLayout,
    options: StartScreenOptions,
): void {
    const colors = options.colors ?? {};
    const font = options.font_family ?? "monospace";
    const center_x = layout.width / 2;
    // The text block spans center_y - 136 .. center_y + 142; a picture pushes it down by half
    // its height, so picture and text stay centred together.
    const picture = options.picture;
    const block = start_screen_block(layout, picture?.height ?? 0);
    const center_y = block.top + block.height - 142;
    const button_width = Math.min(300, layout.width * 0.6);
    if (options.card !== undefined) {
        context.save();
        context.font = `bold ${options.title_size ?? 52}px ${font}`;
        const title_width = context.measureText(options.title).width;
        context.font = `20px ${font}`;
        const subtitle_width = context.measureText(
            options.subtitle ?? "",
        ).width;
        const width = Math.min(
            layout.width - 48,
            Math.max(button_width, title_width, subtitle_width, 440) +
                2 * CARD_PADDING,
        );
        context.fillStyle = options.card;
        context.beginPath();
        context.roundRect(
            center_x - width / 2,
            block.top - CARD_PADDING,
            width,
            block.height + 2 * CARD_PADDING,
            14,
        );
        context.fill();
        context.restore();
    }
    if (picture) {
        const rect = { ...block, height: picture.height };
        context.save();
        picture.paint(context, rect);
        context.restore();
    }
    const button = {
        left: center_x - button_width / 2,
        top: center_y + 10,
        width: button_width,
        height: 84,
    };

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = colors.title ?? "#ffffff";
    context.font = `bold ${options.title_size ?? 52}px ${font}`;
    context.fillText(
        options.title,
        center_x,
        center_y - 110,
        layout.width - 48,
    );
    if (options.subtitle) {
        context.fillStyle = colors.subtitle ?? "#6cdad9";
        context.font = `20px ${font}`;
        context.fillText(
            options.subtitle,
            center_x,
            center_y - 56,
            layout.width - 48,
        );
    }

    context.fillStyle = colors.button ?? "#6cdad9";
    context.beginPath();
    context.roundRect(button.left, button.top, button.width, button.height, 14);
    context.fill();
    context.fillStyle = colors.button_text ?? "#111111";
    context.font = `bold 30px ${font}`;
    context.fillText(
        options.button ?? "▶ Starten",
        center_x,
        button.top + button.height / 2 + 2,
    );

    context.fillStyle = colors.hint ?? "#9aa3d6";
    context.font = `16px ${font}`;
    context.fillText(
        options.hint ?? "Klicken oder eine Taste drücken (mit Ton)",
        center_x,
        button.top + button.height + 40,
        layout.width - 48,
    );
    context.restore();
}
