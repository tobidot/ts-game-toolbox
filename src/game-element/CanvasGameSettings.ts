import type { ThemeRule } from "../ui/theme/Theme";
import { LayoutRect, StageLayout } from "../stage/StageLayout";

/** The house palette; a game may reference it but rarely needs to change it. */
export const HOUSE_COLORS = {
    turquoise: "#6cdad9",
    gray: "#6c6c6c",
    blue: "#26306a",
    orange: "#d48c17",
    black: "#111111",
    white: "#ffffff",
    panel: "#d9d9d9",
    /** Darker than the blue background: cards. */
    card: "#1b2353",
    /** Lighter than the cards: empty bars, chips, outlines. */
    line: "#3b4687",
    /** Secondary text on cards. */
    muted: "#9aa3d6",
} as const;

export type HouseColors = typeof HOUSE_COLORS;

/** The layout type a settings class declares, e.g. `Layout` for `CanvasGameSettings<Layout>`. */
export type LayoutOf<S> = S extends { readonly layouts: readonly (infer L)[] }
    ? L
    : StageLayout;

/** Layouts that show the title and the rule at the top, painted by the renderer's `paint_header()`. */
export interface HeaderLayout extends StageLayout {
    readonly title: {
        readonly left: number;
        readonly top: number;
        readonly size: number;
    };
    readonly subtitle: {
        readonly left: number;
        readonly top: number;
        /** Default 18. */
        readonly size?: number;
        /** Default `settings.rule`; a narrow layout may say it shorter. */
        readonly text?: string;
    };
}

/**
 * Layouts that show the shell's mute buttons: a rect here is all a game does for them. A layout
 * without a rect hides that button while it is the stage's choice.
 */
export interface MuteButtonsLayout extends StageLayout {
    /** Where `properties.sound_button` goes; ignored when the game has no sounds. */
    readonly sound_button?: LayoutRect;
    /** Where `properties.music_button` goes; ignored when the game has no `settings.music`. */
    readonly music_button?: LayoutRect;
}

/**
 * Everything constant about a canvas game's shell. A game subclasses it and overrides what
 * differs: at least `title`, usually `layouts`. Game balance does not belong here but in the
 * DOM-free game itself.
 */
export class CanvasGameSettings<L extends StageLayout = StageLayout> {
    public readonly title: string = "Game";
    /** The rule in one line: under the title on the start screen and in the header. */
    public readonly rule: string = "";
    /** Where `CanvasStage` may pick from; add a tall one (about 600x960) for phones. */
    public readonly layouts: readonly L[] = [{ width: 960, height: 640 } as L];
    /** Low frame rates are the house style; a still game only repaints when something changed. */
    public readonly frames_per_second: number = 30;
    public readonly colors: HouseColors = HOUSE_COLORS;
    /** Fills the canvas before every paint, and the shell around it. */
    public readonly background: string = HOUSE_COLORS.blue;
    public readonly font_family: string = "monospace";
    /** Text size of the toolbox buttons, in layout pixels. */
    public readonly button_font_size: number = 24;
    /** Text size of labels and checkboxes. */
    public readonly label_font_size: number = 18;
    /** Text size of sliders. */
    public readonly slider_font_size: number = 15;
    /** Corner radius of cards and keys, in layout pixels. */
    public readonly radius: number = 14;
    /** The intro gives up after this long, so a slow network never blocks the game. */
    public readonly intro_timeout_ms: number = 6000;
    /** The intro's last frame stays this long before the game appears. */
    public readonly intro_hold_ms: number = 1500;
    /** Keys whose browser default (scrolling, navigating) the game blocks once it runs. */
    public readonly game_keys: readonly string[] = [];
    /** The keys that start the next round on a finished one, see `is_round_finished()`. */
    public readonly next_round_keys: readonly string[] = [" ", "Enter"];
    /**
     * How long an end card stays before a press or a key starts the next round, so one meant for
     * the game doesn't skip it. A press in that time does nothing. Default: no wait.
     */
    public readonly round_end_hold_seconds: number = 0;
    /**
     * The game's looks, name to theme rules. `CanvasGameLogic.theme_name()` says which one shows,
     * and the shell swaps when that changes. Empty: the game has one look.
     */
    public readonly themes: Readonly<Record<string, readonly ThemeRule[]>> = {};
    /**
     * The game's images, name to imported file. The shell loads them when the element starts;
     * the renderer's `paint_image()` paints them by name.
     */
    public readonly images: Readonly<Record<string, string>> = {};
    /**
     * The game's sounds and music tracks, name to imported file. The shell loads them when the
     * element starts; `properties.audio` plays them by name.
     */
    public readonly sounds: Readonly<Record<string, string>> = {};
    /**
     * The track from `sounds` that loops while the game can be played: the shell starts it when
     * the intro is over, holds it while the tab is hidden and stops it when the element
     * disconnects. Null for none.
     */
    public readonly music: string | null = null;
    /**
     * The key that does what the sound button does, while that button shows; it never reaches
     * the game's key hooks then. Null for none, or another letter, when the game needs this one.
     */
    public readonly sound_mute_key: string | null = "s";
    /** The same for the music button. */
    public readonly music_mute_key: string | null = "m";
    /** The sound a mute button answers with; none when `sounds` doesn't list it. */
    public readonly mute_answer_sound: string = "select";
    /** The start screen's texts. */
    public readonly start_button: string = "▶ Starten";
    public readonly start_hint: string =
        "Klicken oder eine Taste drücken (mit Ton)";
}
