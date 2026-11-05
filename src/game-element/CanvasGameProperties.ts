import { AudioPlayer } from "../audio/AudioPlayer";
import { RectI, Vector2I } from "../geometries";
import { KeyboardState } from "../input/KeyboardState";
import { IntroGate } from "../stage/IntroGate";
import { StageLayout } from "../stage/StageLayout";
import { RgbColor } from "../data/RgbColor";
import { ease_in_out } from "../flow/tween/Tween";
import { ThemeEasing, ThemeRule } from "../ui/theme/Theme";
import { blend_table } from "../ui/theme/ThemeBlend";
import { ThemeValueTweenNumber } from "../ui/theme/ThemeValueTween";
import { UiManager } from "../ui/UiManager";
import { Element } from "../ui/Element";
import { Group } from "../ui/Group";
import { UiPage } from "../ui/UiPage";
import {
    CanvasGameSettings,
    HouseColors,
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

/** The curve of a whole theme fading into another. `blended()` goes along with it. */
const THEME_FADE_EASING: ThemeEasing = "ease_in_out";

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
        ...slider_house_rules(colors),
        {
            selectors: [{ type: "slider" }],
            properties: { font_size: settings.slider_font_size },
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

/** A slider's house look in `colors`: the part of `default_theme()` a `HouseSlider` can also own. */
export function slider_house_rules(colors: HouseColors): ThemeRule[] {
    return [
        {
            selectors: [{ type: "slider" }],
            properties: {
                background_color: hex_color(colors.line),
                accent_color: hex_color(colors.turquoise),
                thumb_color: hex_color(colors.white),
                caption_color: hex_color(colors.muted),
                text_color: hex_color(colors.white),
                border_color: hex_color(colors.black),
                border_width: 2,
            },
        },
        {
            selectors: [{ type: "slider", state: "active" }],
            properties: { thumb_color: hex_color(colors.turquoise) },
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
    /** How long the current round has been finished; see `settings.round_end_hold_seconds`. */
    public round_over_seconds = 0;
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
    /** The game's rules, between the house rules and the layout's. */
    private game_theme_rules: readonly ThemeRule[];
    private _shown_theme: string | null = null;
    /** The fade from one of `settings.themes` to the shown one. */
    private theme_fade: {
        from: string;
        progress: ThemeValueTweenNumber;
    } | null = null;
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
        this.game_theme_rules = theme_rules;
        this.page = new UiPage(
            { x: layout.width, y: layout.height },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: layout.width, height: layout.height },
            true,
            this.all_theme_rules(),
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
     * Swaps the game's theme rules: the house rules stay underneath and the current layout's on top,
     * and no widget needs to know. Rules a widget has for itself stay too. Everything on the page
     * follows at once, or over `fade_seconds`, from what shows at that moment. This is the same
     * mechanism as `transition_seconds`, with one duration for this one change.
     */
    public set_theme(
        rules: readonly ThemeRule[],
        fade_seconds: number = 0,
    ): void {
        this.game_theme_rules = rules;
        this.page.theme_rules = this.all_theme_rules();
        this.page.update_theme_instance({
            seconds: fade_seconds,
            easing: THEME_FADE_EASING,
        });
        this.is_dirty = true;
    }

    /** The name in `settings.themes` that shows; null before one was asked for. */
    public get shown_theme(): string | null {
        return this._shown_theme;
    }

    /**
     * Shows the theme `name` from `settings.themes`, fading from the one before over `fade_seconds`.
     * Asking for the one that shows does nothing.
     */
    public show_theme(
        name: string,
        fade_seconds: number = this.settings.theme_fade_seconds,
    ): void {
        if (name === this._shown_theme) {
            return;
        }
        const from = this._shown_theme;
        this._shown_theme = name;
        this.theme_fade =
            from !== null && fade_seconds > 0
                ? {
                      from,
                      progress: new ThemeValueTweenNumber(
                          0,
                          1,
                          fade_seconds,
                          ease_in_out,
                      ),
                  }
                : null;
        this.set_theme(this.settings.themes[name] ?? [], fade_seconds);
    }

    /**
     * A game's own table per theme (what it paints), as it stands right now: the shown theme's
     * entry, or during a fade the blend that goes in step with the widgets. See `blend_table()`.
     */
    public blended<T extends object>(table: Readonly<Record<string, T>>): T {
        const shown = this._shown_theme ?? Object.keys(table)[0];
        const fade = this.theme_fade;
        return fade === null
            ? table[shown]
            : blend_table(table[fade.from], table[shown], fade.progress.get());
    }

    /**
     * Whether something of the theme moved, or just arrived: then one more paint is due. The shell
     * calls it once per frame.
     */
    public poll_animation(): boolean {
        const is_page_moving = this.page.poll_animation();
        const fade = this.theme_fade;
        if (fade === null) {
            return is_page_moving;
        }
        if (fade.progress.is_finished) {
            this.theme_fade = null;
        }
        return true;
    }

    private all_theme_rules(): ThemeRule[] {
        return [
            ...this.house_theme_rules,
            ...this.game_theme_rules,
            ...(this.layout.theme_rules ?? []),
        ];
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
        const is_other_theme = layout.theme_rules !== this.layout.theme_rules;
        this.layout = layout;
        if (is_other_theme) {
            this.theme_fade = null;
            this.set_theme(this.game_theme_rules);
        }
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
