import { describe, expect, it } from "vitest";
import { theme_rules_from } from "../theme/ThemeRuleBuilder";
import { Button } from "./Button";

/** Draws `button` and returns what it wrote, in the button's own coordinates around its center. */
function texts_of(button: Button) {
    const texts: Array<{ text: string; x: number; align: string }> = [];
    const state: Record<string | symbol, unknown> = {};
    const context = new Proxy(state, {
        get: (target, name) => {
            if (name in target) {
                return target[name];
            }
            return (...args: unknown[]) => {
                if (name === "fillText") {
                    texts.push({
                        text: args[0] as string,
                        x: args[1] as number,
                        align: target.textAlign as string,
                    });
                }
            };
        },
        set: (target, name, value) => {
            target[name] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    button.draw(context);
    return texts;
}

const RECT = { left: 0, top: 0, width: 200, height: 40 };

describe("a button's text_align", () => {
    it("is centered with no rule at all", () => {
        expect(texts_of(new Button("x", RECT))).toEqual([
            { text: "x", x: 0, align: "center" },
        ]);
    });

    it("goes left and right inside the padding when a rule says so", () => {
        const left = new Button(
            "x",
            RECT,
            true,
            theme_rules_from([["button", { text_align: "left" }]]),
        );
        expect(texts_of(left)).toEqual([{ text: "x", x: -90, align: "left" }]);
        const right = new Button(
            "x",
            RECT,
            true,
            theme_rules_from([["button", { text_align: "right" }]]),
        );
        expect(texts_of(right)).toEqual([{ text: "x", x: 90, align: "right" }]);
    });

    it("takes its padding from the button", () => {
        const left = new Button(
            "x",
            RECT,
            true,
            theme_rules_from([["button", { text_align: "left" }]]),
        );
        left.text_padding = 20;
        expect(texts_of(left)[0].x).toBe(-80);
    });
});

describe("a button's columns", () => {
    it("aligns each cell in its own share of the width inside the padding", () => {
        const row = new Button("ignored", RECT);
        row.columns = [
            { text: "ICE 542", share: 0.5, align: "left" },
            { text: "17:52", share: 0.25, align: "center" },
            { text: "lang", share: 0.25, align: "right" },
        ];
        expect(texts_of(row)).toEqual([
            { text: "ICE 542", x: -90, align: "left" },
            { text: "17:52", x: 22.5, align: "center" },
            { text: "lang", x: 90, align: "right" },
        ]);
    });

    it("uses the theme's alignment for a cell that doesn't say", () => {
        const row = new Button(
            "",
            RECT,
            true,
            theme_rules_from([["button", { text_align: "left" }]]),
        );
        row.columns = [{ text: "a", share: 1 }];
        expect(texts_of(row)[0].align).toBe("left");
    });
});
