import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RgbColor } from "../../data/RgbColor";
import { Group } from "../Group";
import { UiPage } from "../UiPage";
import { Button } from "../widgets/Button";
import { ThemeTransformValue } from "./Theme";
import { set_theme_clock } from "./ThemeClock";
import { theme_rules_from } from "./ThemeRuleBuilder";
import { theme_pulse } from "./ThemeValueAnimator";

const RED = new RgbColor(200, 0, 0);
const BLUE = new RgbColor(0, 0, 200);
const GREEN = new RgbColor(0, 200, 0);
const RECT = { left: 0, top: 0, width: 100, height: 40 };

let time = 0;

const CONTEXT = new Proxy(
    { canvas: { width: 400, height: 400 } },
    {
        get: (target, name) => {
            if (name in target) {
                return (target as Record<string | symbol, unknown>)[name];
            }
            return () => undefined;
        },
        set: () => true,
    },
) as unknown as CanvasRenderingContext2D;

/** A button on a painted page, so it has been on the screen. */
function shown_button(rules: ReturnType<typeof theme_rules_from>) {
    const page = new UiPage(
        { x: 400, y: 400 },
        { left: 0, top: 0, width: 1, height: 1 },
        { left: 0, top: 0, width: 400, height: 400 },
        true,
        rules,
    );
    const button = new Button("b", RECT);
    page.add(button);
    page.draw(CONTEXT);
    return { page, button };
}

const HOVER_RULES = theme_rules_from([
    [
        "button",
        {
            background_color: RED,
            transition_seconds: 1,
            transition_easing: "linear",
        },
    ],
    ["button:hover", { background_color: BLUE }],
]);

beforeEach(() => {
    time = 50;
    set_theme_clock(() => time);
});

afterEach(() => {
    set_theme_clock(null);
});

describe("transition_seconds", () => {
    it("goes from the old value to the new one over its seconds", () => {
        const { button } = shown_button(HOVER_RULES);
        button.update_mouse_hover_status(true);
        expect(button.theme.background_color.equals(RED)).toBe(true);
        time += 0.5;
        expect(button.theme.background_color.r).toBe(100);
        expect(button.theme.background_color.b).toBe(100);
        time += 0.5;
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
    });

    it("continues from what shows when interrupted, with no jump", () => {
        const { button } = shown_button(HOVER_RULES);
        button.update_mouse_hover_status(true);
        time += 0.25;
        const shown = button.theme.background_color;
        expect(shown.b).toBe(50);
        button.update_mouse_hover_status(false);
        expect(button.theme.background_color.equals(shown)).toBe(true);
        time += 0.5;
        expect(button.theme.background_color.b).toBe(25);
        time += 0.5;
        expect(button.theme.background_color.equals(RED)).toBe(true);
    });

    it("doesn't restart when the rules are evaluated again with the same result", () => {
        const { button } = shown_button(HOVER_RULES);
        button.update_mouse_hover_status(true);
        time += 0.5;
        button.update_theme_instance();
        expect(button.theme.background_color.b).toBe(100);
        button.is_selected = false;
        button.class = "still-the-same-look";
        expect(button.theme.background_color.b).toBe(100);
    });

    it("snaps a button that wasn't on the screen yet, however often it changes", () => {
        const page = new UiPage(
            { x: 400, y: 400 },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 400, height: 400 },
            true,
            HOVER_RULES,
        );
        const button = new Button("b", RECT);
        page.add(button);
        expect(button.theme.background_color.equals(RED)).toBe(true);
        button.update_mouse_hover_status(true);
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
    });

    it("snaps without a transition, as it always did", () => {
        const { button } = shown_button(
            theme_rules_from([
                ["button", { background_color: RED }],
                ["button:hover", { background_color: BLUE }],
            ]),
        );
        button.update_mouse_hover_status(true);
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
    });

    it("uses the transition of the state it goes to", () => {
        const { button } = shown_button(
            theme_rules_from([
                ["button", { background_color: RED, transition_seconds: 1 }],
                [
                    "button:hover",
                    { background_color: BLUE, transition_seconds: 0 },
                ],
            ]),
        );
        button.update_mouse_hover_status(true);
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
        button.update_mouse_hover_status(false);
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
        time += 1;
        expect(button.theme.background_color.equals(RED)).toBe(true);
    });

    it("eases when a rule says so", () => {
        const { button } = shown_button(
            theme_rules_from([
                [
                    "button",
                    {
                        background_color: RED,
                        transition_seconds: 1,
                        transition_easing: "ease_in",
                    },
                ],
                ["button:hover", { background_color: BLUE }],
            ]),
        );
        button.update_mouse_hover_status(true);
        time += 0.5;
        expect(button.theme.background_color.b).toBeLessThan(100);
    });

    it("moves a transform and a number too, and snaps what can't blend", () => {
        const press = new ThemeTransformValue([
            { type: "scale", x: 0.5, y: 0.5 },
        ]);
        const { button } = shown_button(
            theme_rules_from([
                [
                    "button",
                    {
                        border_width: 0,
                        transition_seconds: 1,
                        transition_easing: "linear",
                    },
                ],
                [
                    "button:active",
                    { transform: press, border_width: 4, text_align: "right" },
                ],
            ]),
        );
        button.update_mouse_down_status(true);
        time += 0.5;
        expect(button.theme.transform?.statements).toEqual([
            { type: "scale", x: 0.75, y: 0.75 },
        ]);
        expect(button.theme.border_width).toBe(2);
        expect(button.theme.text_align).toBe("right");
    });

    it("fades into an animator, which then keeps running", () => {
        const { button } = shown_button(
            theme_rules_from([
                [
                    "button",
                    {
                        background_color: RED,
                        transition_seconds: 1,
                        transition_easing: "linear",
                    },
                ],
                [
                    "button.late",
                    { background_color: theme_pulse(BLUE, GREEN, 4) },
                ],
            ]),
        );
        button.class = "late";
        time += 1;
        // a quarter of the pulse: half way from blue to green
        expect(button.theme.background_color.g).toBeCloseTo(100, 0);
        expect(button.poll_animation()).toBe(true);
        time += 1;
        expect(button.theme.background_color.g).toBeCloseTo(200, 0);
        expect(button.poll_animation()).toBe(true);
        expect(button.poll_animation()).toBe(true);
    });

    it("doesn't restart an animator when the state around it changes", () => {
        const pulse = theme_pulse(BLUE, GREEN, 4);
        const { button } = shown_button(
            theme_rules_from([["button", { background_color: pulse }]]),
        );
        time += 1;
        const shown = button.theme.background_color;
        button.update_mouse_hover_status(true);
        expect(button.theme.background_color.equals(shown)).toBe(true);
    });
});

describe("poll_animation", () => {
    it("says moving until the frame that shows the end, then stops", () => {
        const { page, button } = shown_button(HOVER_RULES);
        expect(page.poll_animation()).toBe(false);
        button.update_mouse_hover_status(true);
        expect(page.poll_animation()).toBe(true);
        time += 0.5;
        expect(page.poll_animation()).toBe(true);
        time += 0.5;
        expect(page.poll_animation()).toBe(true);
        expect(page.poll_animation()).toBe(false);
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
    });

    it("finds a button deep in the tree, and ignores a hidden one", () => {
        const { page } = shown_button(HOVER_RULES);
        const group = new Group([], RECT);
        const deep = new Button("d", RECT);
        group.add(deep);
        page.add(group);
        page.draw(CONTEXT);
        deep.update_mouse_hover_status(true);
        group.is_visible = false;
        expect(page.poll_animation()).toBe(false);
        group.is_visible = true;
        expect(page.poll_animation()).toBe(true);
    });
});

describe("a one-off transition on update_theme_instance", () => {
    it("fades the whole tree, and a hover afterwards goes by its own time", () => {
        const { page, button } = shown_button(HOVER_RULES);
        page.theme_rules = theme_rules_from([
            [
                "button",
                {
                    background_color: GREEN,
                    transition_seconds: 1,
                    transition_easing: "linear",
                },
            ],
            ["button:hover", { background_color: BLUE }],
        ]);
        page.update_theme_instance({ seconds: 4, easing: "linear" });
        time += 1;
        expect(button.theme.background_color.g).toBe(50);
        button.update_mouse_hover_status(true);
        time += 1;
        expect(button.theme.background_color.equals(BLUE)).toBe(true);
    });

    it("snaps a shown element with 0 seconds", () => {
        const { page, button } = shown_button(HOVER_RULES);
        page.theme_rules = theme_rules_from([
            ["button", { background_color: GREEN, transition_seconds: 1 }],
        ]);
        page.update_theme_instance({ seconds: 0 });
        expect(button.theme.background_color.equals(GREEN)).toBe(true);
    });
});
