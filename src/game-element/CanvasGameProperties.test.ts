import { describe, expect, it } from "vitest";
import { RgbColor } from "../data/RgbColor";
import { IntroGate } from "../stage/IntroGate";
import { theme_rules_from } from "../ui/theme/ThemeRuleBuilder";
import { Button } from "../ui/widgets/Button";
import { Panel } from "../ui/widgets/Panel";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameSettings, MuteButtonsLayout } from "./CanvasGameSettings";

type MuteLayout = MuteButtonsLayout & { width: number; height: number };

const WIDE = { width: 960, height: 640 };
const TALL = { width: 600, height: 960 };

class Settings extends CanvasGameSettings {
    public override readonly layouts = [WIDE, TALL];
}

function properties(): CanvasGameProperties<object> {
    return new CanvasGameProperties<object>(new Settings(), {} as IntroGate);
}

describe("set_theme", () => {
    const WHITE = new RgbColor(255, 255, 255);
    const RED = new RgbColor(255, 0, 0);
    const GREEN = new RgbColor(0, 255, 0);

    it("reaches everything on the page, inside a parent too, and keeps the house rules", () => {
        const game = properties();
        const panel = game.place(new Panel([], UNPLACED), () => UNPLACED);
        const button = game.place(
            new Button("b", UNPLACED),
            () => UNPLACED,
            panel,
        );
        const house_font = button.theme.font_family;
        game.is_dirty = false;
        game.set_theme(
            theme_rules_from([
                ["button", { background_color: RED }],
                ["panel", { background_color: GREEN }],
            ]),
        );
        expect(button.theme.background_color.equals(RED)).toBe(true);
        expect(panel.theme.background_color.equals(GREEN)).toBe(true);
        expect(button.theme.font_family).toBe(house_font);
        expect(game.is_dirty).toBe(true);
    });

    it("replaces the game's earlier rules, those from the constructor too", () => {
        const game = new CanvasGameProperties<object>(
            new Settings(),
            {} as IntroGate,
            theme_rules_from([["button", { font_size: 99 }]]),
        );
        const button = game.place(new Button("b", UNPLACED), () => UNPLACED);
        expect(button.theme.font_size).toBe(99);
        game.set_theme(theme_rules_from([["button", { font_size: 50 }]]));
        expect(button.theme.font_size).toBe(50);
        game.set_theme([]);
        expect(button.theme.font_size).toBe(new Settings().button_font_size);
    });

    it("keeps the state of a widget, and rules it has for itself", () => {
        const game = properties();
        const own = theme_rules_from([["button", { font_size: 77 }]]);
        const button = game.place(
            new Button("b", UNPLACED, true, own),
            () => UNPLACED,
        );
        button.is_selected = true;
        game.set_theme(
            theme_rules_from([
                ["button:selected", { background_color: WHITE }],
            ]),
        );
        expect(button.theme.background_color.equals(WHITE)).toBe(true);
        expect(button.theme.font_size).toBe(77);
    });
});

describe("place", () => {
    it("adds to the page by default and follows the layout", () => {
        const game = properties();
        const button = game.place(new Button("b", UNPLACED), (layout) => ({
            left: 0,
            top: 0,
            width: layout.width,
            height: 10,
        }));
        expect(game.page.children).toContain(button);
        expect(button.rect.width).toBe(960);
        game.place_widgets(TALL);
        expect(button.rect.width).toBe(600);
    });

    it("adds to a parent when told, and only there", () => {
        const game = properties();
        const panel = game.place(new Panel([], UNPLACED), () => UNPLACED);
        const button = game.place(
            new Button("b", UNPLACED),
            (layout) => ({
                left: 5,
                top: 0,
                width: layout.width / 2,
                height: 10,
            }),
            panel,
        );
        expect(panel.children).toEqual([button]);
        expect(game.page.children).not.toContain(button);
        expect(button.parent).toBe(panel);
        expect(button.rect.width).toBe(480);
        game.place_widgets(TALL);
        expect(button.rect.width).toBe(300);
    });
});

describe("the mute button", () => {
    class SoundSettings extends CanvasGameSettings<MuteLayout> {
        public override readonly layouts = [
            {
                width: 960,
                height: 640,
                sound_button: { left: 900, top: 10, width: 50, height: 50 },
            },
        ];
        public override readonly sounds = { select: "select.wav" };
    }

    it("stays on top of a panel placed later, for painting and for hits", () => {
        const game = new CanvasGameProperties<object, SoundSettings>(
            new SoundSettings(),
            {} as IntroGate,
        );
        const panel = game.place(new Panel([], UNPLACED), () => ({
            left: 0,
            top: 0,
            width: 960,
            height: 100,
        }));
        const later = game.place(new Button("b", UNPLACED), () => ({
            left: 880,
            top: 0,
            width: 80,
            height: 80,
        }));
        const button = game.sound_button;
        expect(game.page.children).toEqual([panel, later, button]);
        expect(game.page.hit({ x: 920, y: 30 })[0]).toBe(button);
    });
});
