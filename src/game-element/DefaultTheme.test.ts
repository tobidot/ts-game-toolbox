import { afterEach, describe, expect, it } from "vitest";
import { RgbColor } from "../data/RgbColor";
import { Element } from "../ui/Element";
import { set_theme_clock } from "../ui/theme/ThemeClock";
import { Button } from "../ui/widgets/Button";
import { CheckBox } from "../ui/widgets/CheckBox";
import { Label } from "../ui/widgets/Label";
import { Panel } from "../ui/widgets/Panel";
import { ScrollGroup } from "../ui/widgets/ScrollGroup";
import { Slider } from "../ui/widgets/Slider";
import { ValueLabel } from "../ui/widgets/ValueLabel";
import { default_theme, hex_color, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameSettings, HOUSE_COLORS } from "./CanvasGameSettings";

const settings = new CanvasGameSettings();
const rules = default_theme(settings);

/** `widget` under the house rules, as on a page. */
function themed<W extends Element>(widget: W): W {
    widget.theme_rules = rules;
    widget.update_theme_instance();
    return widget;
}

function button(class_name: string | null = null): Button {
    const widget = themed(new Button("b", UNPLACED));
    widget.class = class_name;
    return widget;
}

function expect_color(color: RgbColor, hex: string): void {
    expect(color.equals(hex_color(hex))).toBe(true);
}

describe("default_theme", () => {
    it("leaves the buttons exactly as they were", () => {
        const c = HOUSE_COLORS;
        const table: Array<[string | null, string, string, string]> = [
            [null, c.panel, c.white, c.turquoise],
            ["primary", c.turquoise, c.white, c.orange],
            ["accent", c.orange, c.white, c.turquoise],
            ["secondary", c.line, c.gray, c.white],
            ["off", c.gray, c.panel, c.turquoise],
        ];
        for (const [class_name, normal, hover, active] of table) {
            const widget = button(class_name);
            expect_color(widget.theme.background_color, normal);
            widget.is_hovered = true;
            widget.update_theme_instance();
            expect_color(widget.theme.background_color, hover);
            widget.is_down = true;
            widget.update_theme_instance();
            expect_color(widget.theme.background_color, active);
        }
        const plain = button();
        expect(plain.theme.font_size).toBe(settings.button_font_size);
        expect(plain.theme.font_family).toBe(settings.font_family);
        expect(plain.theme.border_radius).toBe(settings.radius);
        expect(plain.theme.border_width).toBe(0);
        expect_color(plain.theme.text_color, c.black);
        expect_color(button("secondary").theme.text_color, c.white);
    });

    it("gives a label and a value label white text and no background", () => {
        for (const widget of [
            new Label("l", UNPLACED),
            new ValueLabel("l", 1, UNPLACED),
        ]) {
            themed(widget);
            expect(widget.theme.background_color.a).toBe(0);
            expect_color(widget.theme.text_color, HOUSE_COLORS.white);
            expect(widget.theme.font_size).toBe(settings.label_font_size);
        }
    });

    it("makes a panel a card with a line around it", () => {
        const panel = themed(new Panel([], UNPLACED));
        expect_color(panel.theme.background_color, HOUSE_COLORS.card);
        expect_color(panel.theme.border_color, HOUSE_COLORS.line);
        expect(panel.theme.border_width).toBeGreaterThan(0);
    });

    it("lets what's behind a scroll group show", () => {
        const list = themed(new ScrollGroup([], UNPLACED));
        expect(list.theme.background_color.a).toBe(0);
    });

    it("keeps a bare checkbox looking as it did, with a readable label", () => {
        const checkbox = themed(new CheckBox(false, UNPLACED));
        expect_color(checkbox.theme.background_color, HOUSE_COLORS.panel);
        expect_color(checkbox.theme.accent_color, HOUSE_COLORS.black);
        expect_color(checkbox.theme.text_color, HOUSE_COLORS.white);
        expect(checkbox.theme.border_radius).toBe(settings.radius);
    });

    it("gives a slider a track, a filled part and readable text", () => {
        const slider = themed(new Slider("s", 0, 1, 0, UNPLACED));
        expect_color(slider.theme.background_color, HOUSE_COLORS.line);
        expect_color(slider.theme.accent_color, HOUSE_COLORS.turquoise);
        expect_color(slider.theme.text_color, HOUSE_COLORS.white);
    });

    it("shows :selected and :disabled on everything that can have them", () => {
        const plain = button();
        plain.is_selected = true;
        expect_color(plain.theme.background_color, HOUSE_COLORS.orange);
        const primary = button("primary");
        primary.is_selected = true;
        expect_color(primary.theme.background_color, HOUSE_COLORS.orange);
        const accent = button("accent");
        accent.is_selected = true;
        expect_color(accent.theme.background_color, HOUSE_COLORS.white);
        for (const class_name of [null, "primary", "accent", "secondary"]) {
            const disabled = button(class_name);
            disabled.is_disabled = true;
            expect_color(disabled.theme.background_color, HOUSE_COLORS.line);
            expect_color(disabled.theme.text_color, HOUSE_COLORS.muted);
        }
        const widgets = [
            new Label("l", UNPLACED),
            new ValueLabel("l", 1, UNPLACED),
            new CheckBox(false, UNPLACED),
            new Slider("s", 0, 1, 0, UNPLACED),
        ];
        for (const widget of widgets) {
            themed(widget);
            widget.is_disabled = true;
            expect_color(widget.theme.text_color, HOUSE_COLORS.muted);
        }
        const label = themed(new Label("l", UNPLACED));
        label.is_disabled = true;
        expect(label.theme.background_color.a).toBe(0);
    });
});

describe("the house look moves", () => {
    afterEach(() => {
        set_theme_clock(null);
    });

    it("gives what you can press a short transition, and leaves the rest alone", () => {
        const seconds_of = (element: Element): number => {
            element.theme_rules = rules;
            element.update_theme_instance();
            return element.theme.transition_seconds;
        };
        const rect = { left: 0, top: 0, width: 10, height: 10 };
        const pressable = [
            new Button("b", rect),
            new CheckBox(false, rect),
            new Slider("s", 0, 1, 0, rect),
        ];
        for (const widget of pressable) {
            expect(seconds_of(widget)).toBe(settings.press_transition_seconds);
        }
        expect(seconds_of(new Label("l", rect))).toBe(0);
        expect(seconds_of(new Panel([], rect))).toBe(0);
    });

    it("rests on exactly the color it had without the transition", () => {
        let time = 1;
        set_theme_clock(() => time);
        const button = new Button(
            "b",
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            rules,
        );
        const rest = button.theme.background_color;
        button.theme_instance.is_shown = true;
        button.update_mouse_hover_status(true);
        time += 0.05;
        button.update_mouse_hover_status(false);
        time += 1;
        expect(button.theme.background_color.equals(rest)).toBe(true);
    });
});
