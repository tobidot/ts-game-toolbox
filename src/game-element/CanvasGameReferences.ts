import { AssetManager } from "../assets/manager/AssetManager";
import { SpriteSheet } from "../canvas/animation/SpriteSheet";
import { CanvasStage } from "../stage/CanvasStage";
import { StageLayout } from "../stage/StageLayout";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** The shell's styles: the host fills its box, the stage fills the host, the canvas the stage. */
export function canvas_game_css(settings: CanvasGameSettings): string {
    return `
:host {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 240px;
    min-height: 160px;
    box-sizing: border-box;
    overflow: hidden;
    font-family: ${settings.font_family};
    font-size: 12px;
    line-height: 1.35;
    color: ${settings.colors.black};
    background: ${settings.background};
    outline: none;
}
:host(:focus-visible) .game__stage {
    box-shadow: inset 0 0 0 2px ${settings.colors.turquoise};
}
.game {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: ${settings.background};
}
.game__stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    background: ${settings.background};
}
.game__canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: default;
}
.game__status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
`;
}

/** Adopts `css` into the shadow root, with a `<style>` fallback for browsers without adopted sheets. */
export function adopt_css(shadow: ShadowRoot, css: string): void {
    if ("adoptedStyleSheets" in Document.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
        return;
    }
    const $style = document.createElement("style");
    $style.textContent = css;
    shadow.append($style);
}

/**
 * Every DOM node a canvas game touches, built once: the shadow root, the stage (where an intro
 * video plays on top of the canvas), the `CanvasStage` that fits the canvas into it, a status
 * line for assistive technology, and the loaded images and sounds. A game that needs more DOM subclasses
 * this; most don't.
 */
export class CanvasGameReferences<L extends StageLayout = StageLayout> {
    public readonly shadow: ShadowRoot;
    public readonly $root: HTMLDivElement;
    public readonly $stage: HTMLDivElement;
    public readonly stage: CanvasStage<L>;
    public readonly $status: HTMLDivElement;
    /** Holds `settings.images` and `settings.sounds` as they load; `paint_image()` and `properties.audio` read them. */
    public readonly assets = new AssetManager();
    /**
     * Sprite sheets by the game's name: a picture of `settings.catalogue_images` whose catalogue
     * entry has `sheet` data gets its frames and clips here. `sheet(name)` makes one.
     */
    public readonly sheets = new Map<string, SpriteSheet>();

    public constructor(
        host: HTMLElement,
        settings: CanvasGameSettings<L>,
        extra_css: string = "",
    ) {
        this.shadow = host.attachShadow({ mode: "open" });
        adopt_css(this.shadow, canvas_game_css(settings) + extra_css);

        this.$root = document.createElement("div");
        this.$root.className = "game";
        this.$stage = document.createElement("div");
        this.$stage.className = "game__stage";
        this.stage = new CanvasStage(this.$stage, settings.layouts, {
            canvas_class: "game__canvas",
            layout_for: settings.layout_for,
        });
        this.stage.$canvas.setAttribute("role", "img");
        this.stage.$canvas.setAttribute("aria-label", settings.title);

        this.$status = document.createElement("div");
        this.$status.className = "game__status";
        this.$status.setAttribute("role", "status");
        this.$status.setAttribute("aria-live", "polite");

        this.$root.append(this.$stage, this.$status);
        this.shadow.append(this.$root);
    }

    /**
     * The sprite sheet named `name`, empty until its data comes (from the catalogue, or a game's
     * own `set_data()`). It takes the picture `assets.images` has under the same name, now or
     * when it arrives, so a player made from it at once starts moving as soon as it can.
     */
    public sheet(name: string): SpriteSheet {
        let sheet = this.sheets.get(name);
        if (sheet === undefined) {
            sheet = new SpriteSheet();
            this.sheets.set(name, sheet);
        }
        this.take_picture(name, sheet);
        return sheet;
    }

    /** Gives every sheet still without a picture the one that came under its name. */
    public update_sheet_images(): void {
        for (const [name, sheet] of this.sheets) {
            this.take_picture(name, sheet);
        }
    }

    private take_picture(name: string, sheet: SpriteSheet): void {
        if (sheet.image !== null) {
            return;
        }
        const asset = this.assets.images.get(name);
        if (asset !== undefined && asset.ready) {
            sheet.image = asset.element;
        }
    }
}
