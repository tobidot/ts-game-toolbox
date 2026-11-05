import { AudioPlayer } from "../audio/AudioPlayer";
import { RectI, Vector2I } from "../geometries";
import { KeyboardState } from "../input/KeyboardState";
import { IntroGate } from "../stage/IntroGate";
import { StageLayout } from "../stage/StageLayout";
import { RgbColor } from "../data/RgbColor";
import { ThemeRule } from "../ui/theme/Theme";
import { UiManager } from "../ui/UiManager";
import { Element } from "../ui/Element";
import { Group } from "../ui/Group";
import { UiPage } from "../ui/UiPage";
import {
    CanvasGameSettings,
    LayoutOf,
    MuteButtonsLayout,
} from "./CanvasGameSettings";
import { MuteButton } from "./MuteButton";
import { SessionBest } from "./SessionBest";

/** The rect a widget is built with when `CanvasGameProperties.place()` positions it anyway. */
export const UNPLACED: Readonly<RectI> = {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
};

/** `#rrggbb` as the toolbox UI's color. */
export function hex_color(hex: string): RgbColor {
    return new RgbColor(
        Number(`0x${hex.slice(1, 3)}`),
        Number(`0x${hex.slice(3, 5)}`),
        Number(`0x${hex.slice(5, 7)}`),
    );
}

/**
 * The house look of the toolbox UI. Plain buttons: monospace on panel grey, hover white, active
 * turquoise. Class `primary`: turquoise, hover white, active orange (the "Neues Spiel" button).
 * Class `accent`: orange, hover white, active turquoise (the one action that counts: "Raten").
 * Class `secondary`: quiet, white on the line color, hover grey, active white. Class `off`: grey,
 * hover panel grey (a mute button that is off). `:selected` is orange and `:disabled` quiet.
 *
 * The other widgets look finished with no rules at all: a `panel` is a card with a line around
 * it, a `label` and a `value_label` are white text with no background, a `scroll_group` shows what
 * is behind it, a `checkbox` and a `slider` follow the same colors. A game adds only what differs.
 */
export function default_theme(settings: CanvasGameSettings): ThemeRule[] {
    const colors = settings.colors;
    const background = (color: string) => ({
        background_color: hex_color(color),
    });
    const white_text = {
        font_size: settings.label_font_size,
        text_color: hex_color(colors.white),
    };
    const quiet_text = { text_color: hex_color(colors.muted) };
    const no_background = { background_color: new RgbColor(0, 0, 0, 0) };
    return [
        {
            properties: {
                font_family: settings.font_family,
                font_size: settings.button_font_size,
                border_radius: settings.radius,
                text_color: hex_color(colors.black),
                background_color: hex_color(colors.panel),
            },
        },
        {
            selectors: [{ type: "button", state: "hover" }],
            properties: background(colors.white),
        },
        {
            selectors: [{ type: "button", state: "active" }],
            properties: background(colors.turquoise),
        },
        {
            selectors: [{ class: "primary" }],
            properties: background(colors.turquoise),
        },
        {
            selectors: [{ class: "primary", state: "hover" }],
            properties: background(colors.white),
        },
        {
            selectors: [{ class: "primary", state: "active" }],
            properties: background(colors.orange),
        },
        {
            selectors: [{ class: "accent" }],
            properties: background(colors.orange),
        },
        {
            selectors: [{ class: "accent", state: "hover" }],
            properties: background(colors.white),
        },
        {
            selectors: [{ class: "accent", state: "active" }],
            properties: background(colors.turquoise),
        },
        {
            selectors: [{ class: "secondary" }],
            properties: {
                ...background(colors.line),
                text_color: hex_color(colors.white),
            },
        },
        {
            selectors: [{ class: "secondary", state: "hover" }],
            properties: background(colors.gray),
        },
        {
            selectors: [{ class: "secondary", state: "active" }],
            properties: {
                ...background(colors.white),
                text_color: hex_color(colors.black),
            },
        },
        {
            selectors: [{ class: "off" }],
            properties: background(colors.gray),
        },
        {
            selectors: [{ class: "off", state: "hover" }],
            properties: background(colors.panel),
        },
        {
            selectors: [{ type: "button", state: "selected" }],
            properties: background(colors.orange),
        },
        {
            selectors: [{ class: "accent", state: "selected" }],
            properties: background(colors.white),
        },
        {
            selectors: [{ type: "button", state: "disabled" }],
            properties: { ...background(colors.line), ...quiet_text },
        },
        {
            selectors: [{ type: "panel" }],
            properties: {
                ...background(colors.card),
                border_color: hex_color(colors.line),
                border_width: 2,
            },
        },
        {
            selectors: [{ type: "panel", state: "selected" }],
            properties: { border_color: hex_color(colors.orange) },
        },
        {
            selectors: [{ type: "scroll_group" }],
            properties: { ...no_background, ...quiet_text },
        },
        ...["label", "value_label"].flatMap((type) => [
            {
                selectors: [{ type }],
                properties: { ...no_background, ...white_text },
            },
            {
                selectors: [{ type, state: "selected" }],
                properties: { text_color: hex_color(colors.orange) },
            },
            {
                selectors: [{ type, state: "disabled" }],
                properties: quiet_text,
            },
        ]),
        {
            selectors: [{ type: "checkbox" }],
            properties: {
                ...white_text,
                accent_color: hex_color(colors.black),
            },
        },
        {
            selectors: [{ type: "checkbox", state: "selected" }],
            properties: { text_color: hex_color(colors.orange) },
        },
        {
            selectors: [{ type: "checkbox", state: "disabled" }],
            properties: {
                ...background(colors.line),
                ...quiet_text,
                accent_color: hex_color(colors.muted),
            },
        },
        {
            selectors: [{ type: "slider" }],
            properties: {
                ...background(colors.line),
                ...white_text,
                accent_color: hex_color(colors.turquoise),
                border_color: hex_color(colors.black),
                border_width: 2,
            },
        },
        {
            selectors: [{ type: "slider", state: "active" }],
            properties: { text_color: hex_color(colors.turquoise) },
        },
        {
            selectors: [{ type: "slider", state: "selected" }],
            properties: { accent_color: hex_color(colors.orange) },
        },
        {
            selectors: [{ type: "slider", state: "disabled" }],
            properties: {
                ...quiet_text,
                accent_color: hex_color(colors.muted),
            },
        },
    ];
}

/**
 * The mutable state every canvas game has. It survives a disconnect and reconnect (a window
 * being moved): only listeners and the frame loop are torn down. The toolbox UI objects live
 * here too, as state, not DOM. A game subclasses it for its own state and widgets.
 */
export class CanvasGameProperties<
    G,
    S extends CanvasGameSettings<StageLayout> = CanvasGameSettings,
> {
    public abort_controller: AbortController | null = null;
    public game: G | null = null;
    /** The `init-*` attributes are read once, at the first connection. */
    public is_attributes_read = false;
    /** `init-seed`; game n of this element is seeded with `seed + n`. */
    public seed = 0;
    public intro_enabled = true;
    /** How many games came after the first: the n in `seed + n`. */
    public restarts = 0;
    /**
     * The best result of this session; the shell settles it on every new game. A game offers its
     * result in `on_round_finished()`, and overrides this field where lower wins.
     */
    public readonly best: SessionBest = new SessionBest();
    /** Whether `on_round_finished()` already ran for the current game. */
    public is_round_reported = false;
    public last_tick_ms: number | null = null;
    public is_dirty = true;

    /** The toolbox UI: one page in the layout's size, placed on the canvas by the stage. */
    public readonly ui = new UiManager();
    public readonly page: UiPage;
    /** Every key, collected on the host; read it in `update()`. Empty until the intro is done. */
    public readonly keyboard = new KeyboardState();
    /**
     * Plays `settings.sounds` by name. The shell builds it over the loaded assets and stops it on
     * a disconnect; its volumes and mutes stay, like all properties.
     */
    public audio!: AudioPlayer;
    /**
     * Mutes the sounds. Null unless the game has sounds and a layout has a `sound_button` rect;
     * the shell places it, wires it and keeps it showing what `audio` says.
     */
    public readonly sound_button: MuteButton | null;
    /** Mutes the music. Null unless the game has `settings.music` and a layout places it. */
    public readonly music_button: MuteButton | null;
    /** The last pointer position over the canvas in layout coordinates; null when it left. */
    public pointer: Vector2I | null = null;
    /** The layout widgets are placed in; the stage's choice. */
    public layout: LayoutOf<S>;
    /** The house rules; a theme swap keeps them underneath. */
    private readonly house_theme_rules: ThemeRule[];
    private readonly placements: Array<{
        widget: Element;
        rect_of: (layout: LayoutOf<S>) => RectI;
    }> = [];

    public constructor(
        protected readonly settings: S,
        public readonly intro: IntroGate,
        theme_rules: ThemeRule[] = [],
    ) {
        const layout = settings.layouts[0] as LayoutOf<S>;
        this.layout = layout;
        this.house_theme_rules = default_theme(settings);
        this.page = new UiPage(
            { x: layout.width, y: layout.height },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: layout.width, height: layout.height },
            true,
            [...this.house_theme_rules, ...theme_rules],
        );
        this.ui.active_menu = this.page;
        const has_sounds = Object.keys(settings.sounds).some(
            (name) => name !== settings.music,
        );
        this.sound_button = has_sounds
            ? this.place_mute_button((rects) => rects.sound_button)
            : null;
        this.music_button =
            settings.music !== null
                ? this.place_mute_button((rects) => rects.music_button)
                : null;
    }

    /**
     * Swaps the game's theme rules: the house rules stay underneath, everything on the page follows
     * at once, and no widget needs to know. Rules a widget has for itself stay too.
     */
    public set_theme(rules: readonly ThemeRule[]): void {
        this.page.theme_rules = [...this.house_theme_rules, ...rules];
        this.page.update_theme_instance();
        this.is_dirty = true;
    }

    /**
     * Adds `widget` to `parent` (default: the page) and keeps it at `rect_of(layout)` in whichever
     * layout the stage picks. A widget placed here never needs to be moved by hand. Inside a
     * parent, the rect is relative to that parent, as it always is in a `Group`.
     */
    public place<W extends Element>(
        widget: W,
        rect_of: (layout: LayoutOf<S>) => RectI,
        parent: Group = this.page,
    ): W {
        parent.add(widget);
        this.placements.push({ widget, rect_of });
        this.move(widget, rect_of(this.layout));
        return widget;
    }

    /**
     * Moves every placed widget into `layout` (default: the current one). The shell calls it
     * when the stage switches; a game calls it when a rule depends on game state that changed.
     */
    public place_widgets(layout: LayoutOf<S> = this.layout): void {
        this.layout = layout;
        for (const { widget, rect_of } of this.placements) {
            this.move(widget, rect_of(layout));
        }
    }

    /** A mute button when some layout has a rect for it; hidden in a layout that has none. */
    private place_mute_button(
        rect_in: (layout: MuteButtonsLayout) => RectI | undefined,
    ): MuteButton | null {
        if (!this.settings.layouts.some((layout) => rect_in(layout))) {
            return null;
        }
        const button = new MuteButton();
        return this.place(button, (layout) => {
            const rect = rect_in(layout);
            button.is_visible = rect !== undefined;
            return rect ?? UNPLACED;
        });
    }

    private move(widget: Element, rect: RectI): void {
        widget.rect.left = rect.left;
        widget.rect.top = rect.top;
        widget.rect.width = rect.width;
        widget.rect.height = rect.height;
    }
}
