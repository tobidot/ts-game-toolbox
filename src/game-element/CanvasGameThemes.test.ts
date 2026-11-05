import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RgbColor } from "../data/RgbColor";
import { set_theme_clock } from "../ui/theme/ThemeClock";
import { theme_rules_from } from "../ui/theme/ThemeRuleBuilder";
import { Button } from "../ui/widgets/Button";
import { IntroGate } from "../stage/IntroGate";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

const DAY = new RgbColor(255, 255, 255);
const NIGHT = new RgbColor(0, 0, 40);

class Game {
    public time = "day";
}

const WIDE = { width: 960, height: 640 };
const TALL = {
    width: 600,
    height: 960,
    theme_rules: theme_rules_from([["button", { font_size: 40 }]]),
};

class Settings extends CanvasGameSettings {
    public override readonly layouts = [WIDE, TALL];
    public override readonly theme_fade_seconds = 2;
    public override readonly themes = {
        day: theme_rules_from([["button", { background_color: DAY }]]),
        night: theme_rules_from([["button", { background_color: NIGHT }]]),
    };
}

class Properties extends CanvasGameProperties<Game, Settings> {
    public readonly button: Button;
    public constructor(settings: Settings, intro: IntroGate) {
        super(settings, intro);
        this.button = this.place(new Button("b", UNPLACED), () => UNPLACED);
    }
}

class Renderer extends CanvasGameRenderer<Game, Settings> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<Game, Settings, Properties> {
    protected create_game(): Game {
        return new Game();
    }
    protected override theme_name(game: Game): string {
        return game.time;
    }
}

class ThemeElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-themes", ThemeElement);

describe("settings.themes and theme_name()", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;
    let logic: Logic;
    let theme_time = 0;

    function run_frames(count: number = 1): void {
        for (let frame = 0; frame < count; frame++) {
            time_ms += 100;
            const due = frames;
            frames = [];
            for (const callback of due) {
                callback(time_ms);
            }
        }
    }

    beforeEach(() => {
        frames = [];
        theme_time = 0;
        set_theme_clock(() => theme_time);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D,
        );
        vi.stubGlobal(
            "requestAnimationFrame",
            (callback: FrameRequestCallback) => {
                frames.push(callback);
                return frames.length;
            },
        );
        vi.stubGlobal("cancelAnimationFrame", () => {
            frames = [];
        });
        const $element = document.createElement("test-themes") as ThemeElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        logic = $element.logic;
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        set_theme_clock(null);
    });

    it("shows the named theme from the first game on", () => {
        const button = logic.properties.button;
        expect(logic.properties.shown_theme).toBe("day");
        expect(button.theme.background_color.equals(DAY)).toBe(true);
    });

    it("swaps when the name changes, and only then", () => {
        const properties = logic.properties;
        run_frames(2);
        const set_theme = vi.spyOn(properties, "set_theme");
        run_frames(3);
        expect(set_theme).not.toHaveBeenCalled();
        (properties.game as Game).time = "night";
        run_frames(3);
        expect(set_theme).toHaveBeenCalledTimes(1);
    });

    describe("fading", () => {
        const PAINT = {
            day: { board: "#ffffff", glow: 0, name: "Tag" },
            night: { board: "#000000", glow: 1, name: "Nacht" },
        };

        function to_night(): void {
            run_frames(2);
            const properties = logic.properties;
            (properties.game as Game).time = "night";
            run_frames(1);
        }

        it("fades the widgets over theme_fade_seconds, from what shows now", () => {
            to_night();
            const button = logic.properties.button;
            const color = () => button.theme.background_color;
            expect(color().equals(DAY)).toBe(true);
            theme_time += 1;
            expect(color().r).toBeGreaterThan(NIGHT.r);
            expect(color().r).toBeLessThan(DAY.r);
            theme_time += 1;
            expect(color().equals(NIGHT)).toBe(true);
        });

        it("blends what the game paints in step with the widgets", () => {
            to_night();
            const properties = logic.properties;
            expect(properties.blended(PAINT).board).toBe("#ffffff");
            theme_time += 1;
            const middle = properties.blended(PAINT);
            expect(middle.board).toBe("#808080");
            expect(middle.glow).toBeCloseTo(0.5);
            expect(properties.button.theme.background_color.r).toBeCloseTo(
                (DAY.r + NIGHT.r) / 2,
                -1,
            );
            theme_time += 1;
            expect(properties.blended(PAINT).board).toBe("#000000");
            expect(properties.blended(PAINT).name).toBe("Nacht");
        });

        it("is the plain table entry without a fade", () => {
            run_frames(2);
            expect(logic.properties.blended(PAINT)).toBe(PAINT.day);
        });

        it("keeps painting until the fade is over, then forgets it", () => {
            to_night();
            const properties = logic.properties;
            expect(properties.poll_animation()).toBe(true);
            theme_time += 2;
            expect(properties.poll_animation()).toBe(true);
            expect(properties.poll_animation()).toBe(false);
            expect(properties.blended(PAINT)).toBe(PAINT.night);
        });

        it("snaps into a new game's theme, whatever the last one ended on", () => {
            const properties = logic.properties;
            to_night();
            theme_time += 2;
            run_frames(1);
            logic.restart();
            expect(properties.shown_theme).toBe("day");
            expect(properties.button.theme.background_color.equals(DAY)).toBe(
                true,
            );
            expect(properties.blended(PAINT)).toBe(PAINT.day);
        });
    });

    it("keeps a layout's rules over the theme, and drops them with the layout", () => {
        const properties = logic.properties;
        const button = properties.button;
        const house_size = button.theme.font_size;
        properties.place_widgets(TALL as never);
        expect(button.theme.font_size).toBe(40);
        expect(button.theme.background_color.equals(DAY)).toBe(true);
        properties.show_theme("night", 0);
        expect(button.theme.font_size).toBe(40);
        expect(button.theme.background_color.equals(NIGHT)).toBe(true);
        properties.place_widgets(WIDE as never);
        expect(button.theme.font_size).toBe(house_size);
        expect(button.theme.background_color.equals(NIGHT)).toBe(true);
    });
});
