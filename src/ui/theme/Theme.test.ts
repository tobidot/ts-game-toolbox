import { describe, it, expect } from "vitest";
import { Element } from "../Element";
import { Button } from "../widgets/Button";
import { CheckBox } from "../widgets/CheckBox";
import { Label } from "../widgets/Label";
import { Slider } from "../widgets/Slider";
import { ValueLabel } from "../widgets/ValueLabel";
import { theme_font, ThemeRule } from "./Theme";
import { theme_rules_from } from "./ThemeRuleBuilder";

describe("Theme Selectors", () => {
    it("should resolve basic properties", () => {
        const theme_rule: ThemeRule = {
            properties: {
                font_size: 20,
            },
        };
        const element = new Element(
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            [theme_rule],
        );
        expect(element.theme.font_size).toBe(20);
    });

    it("should resolve type-based selectors", () => {
        const theme_rule_1: ThemeRule = {
            properties: { font_size: 20 },
        };
        const theme_rule_2: ThemeRule = {
            selectors: [{ type: "label" }],
            properties: { font_size: 25 },
        };
        const element = new Element(
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            [theme_rule_1, theme_rule_2],
        );
        element.type = "label";
        expect(element.theme.font_size).toBe(25);
    });

    it("should resolve class-based selectors with higher priority than type", () => {
        const rule_1 = {
            properties: {
                font_size: 20,
            },
        };
        const rule_2 = {
            selectors: [{ class: "big" }],
            properties: {
                font_size: 30,
            },
        };
        const rule_3 = {
            selectors: [{ type: "label" }],
            properties: {
                font_size: 25,
            },
        };
        const element = new Element(
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            [rule_1, rule_2, rule_3],
        );
        element.type = "label";
        element.class = "big";
        expect(element.theme.font_size).toBe(30);
    });

    it("should resolve type.class selectors with highest priority", () => {
        const theme_rules = theme_rules_from([
            ["", { font_size: 25 }],
            ["label", { font_size: 25 }],
            [".big", { font_size: 30 }],
            ["label.big", { font_size: 35 }],
        ]);
        const element = new Element(
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            theme_rules,
        );
        element.type = "label";
        element.class = "big";
        expect(element.theme.font_size).toBe(35);
    });

    // it("should collapse/merge theme overrides", () => {
    //     const parent_theme = new Theme({
    //         selectors: [["button", { font_size: 10 }]],
    //     });
    //     const child_theme = new Theme({
    //         selectors: [["button", { font_family: "monospace" }]],
    //     });
    //
    //     const parent = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         parent_theme,
    //     );
    //     const child = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         child_theme,
    //     );
    //     child.parent = parent as any;
    //     child.type = "button";
    //
    //     expect(child.theme.font_size).toBe(10);
    //     expect(child.theme.font_family).toBe("monospace");
    // });
    //
    // it("should respect inheritance from DEFAULT_THEME", () => {
    //     const element = new Element({ left: 0, top: 0, width: 10, height: 10 });
    //     // DEFAULT_THEME has font_size 16
    //     expect(element.theme.font_size).toBe(16);
    // });
    //
    // it("should resolve text alignment", () => {
    //     const theme = new Theme({
    //         text_align: "center",
    //     });
    //     const element = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         theme,
    //     );
    //     expect(element.theme.text_align).toBe("center");
    // });
    //
    // it("should resolve text baseline", () => {
    //     const theme = new Theme({
    //         text_baseline: "top",
    //     });
    //     const element = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         theme,
    //     );
    //     expect(element.theme.text_baseline).toBe("top");
    //
    //     const default_element = new Element({
    //         left: 0,
    //         top: 0,
    //         width: 10,
    //         height: 10,
    //     });
    //     expect(default_element.theme.text_baseline).toBe("middle");
    // });
    //
    // it("should resolve state-based selectors", () => {
    //     const theme = new Theme({
    //         background_color: new RgbColor(255, 255, 255),
    //         selectors: [
    //             [":hover", { background_color: new RgbColor(200, 200, 200) }],
    //             [":active", { background_color: new RgbColor(100, 100, 100) }],
    //         ],
    //     });
    //     const element = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         theme,
    //     );
    //
    //     expect(element.theme.background_color.r).toBe(255);
    //
    //     element.is_hovered = true;
    //     expect(element.theme.background_color.r).toBe(200);
    //
    //     element.is_down = true;
    //     expect(element.theme.background_color.r).toBe(100);
    // });
    //
    // it("should resolve complex state selectors with correct priority", () => {
    //     const theme = new Theme({
    //         selectors: [
    //             ["button", { font_size: 10 }],
    //             [".main", { font_size: 11 }],
    //             [":hover", { font_size: 12 }],
    //             [".main:hover", { font_size: 13 }],
    //             ["button:hover", { font_size: 14 }],
    //             ["button.main:hover", { font_size: 15 }],
    //         ],
    //     });
    //     const element = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         theme,
    //     );
    //     element.type = "button";
    //     element.class_name = "main";
    //     element.is_hovered = true;
    //
    //     expect(element.theme.font_size).toBe(15);
    // });
    //
    // it("should fallback correctly when higher priority selector is missing", () => {
    //     const theme = new Theme({
    //         selectors: [
    //             ["button", { font_size: 10 }],
    //             [":hover", { font_size: 12 }],
    //         ],
    //     });
    //     const element = new Element(
    //         { left: 0, top: 0, width: 10, height: 10 },
    //         true,
    //         theme,
    //     );
    //     element.type = "button";
    //     element.is_hovered = true;
    //
    //     // type:hover is missing, so it should use :hover (priority 5) over type (priority 2)
    //     expect(element.theme.font_size).toBe(12);
    // });
});

describe("theme_font", () => {
    const base = {
        font_style: "normal",
        font_weight: 400,
        font_size: 20,
        font_family: "monospace",
    } as const;

    it("is the plain font for a normal weight, as it always was", () => {
        expect(theme_font(base)).toBe("20px monospace");
    });

    it("says the weight and the style", () => {
        expect(theme_font({ ...base, font_weight: 700 })).toBe(
            "700 20px monospace",
        );
        expect(theme_font({ ...base, font_style: "italic" })).toBe(
            "italic 20px monospace",
        );
        expect(theme_font({ ...base, font_style: "bold" })).toBe(
            "700 20px monospace",
        );
    });
});

describe("the widgets read font_weight and font_style", () => {
    const rect = { left: 0, top: 0, width: 200, height: 40 };
    const rules = [
        { properties: { font_weight: 700, font_style: "italic" as const } },
    ];
    const widgets: Array<[string, Element]> = [
        ["Button", new Button("x", rect, true, rules)],
        ["Label", new Label("x", rect, true, rules)],
        ["ValueLabel", new ValueLabel("x", 1, rect, true, rules)],
        ["Slider", new Slider("x", 0, 1, 0, rect, true, rules)],
    ];
    const box = new CheckBox(false, rect, true, rules);
    box.label = "x";
    widgets.push(["CheckBox", box]);

    for (const [name, widget] of widgets) {
        it(name, () => {
            let font = "";
            const context = new Proxy(
                {},
                {
                    get: () => () => undefined,
                    set: (_, key, value) => {
                        if (key === "font") {
                            font = value;
                        }
                        return true;
                    },
                },
            ) as unknown as CanvasRenderingContext2D;
            widget.draw(context);
            expect(font).toContain("italic 700");
        });
    }
});
