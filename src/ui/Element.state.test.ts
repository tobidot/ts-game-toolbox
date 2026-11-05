import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RgbColor } from "../data";
import { Element } from "./Element";
import { ElementClickEvent, ElementRefusedEvent } from "./events";
import { set_theme_clock } from "./theme/ThemeClock";
import { theme_rules_from } from "./theme/ThemeRuleBuilder";
import {
    ENTERING_SECONDS,
    REFUSED_SECONDS,
    theme_shake,
    theme_slide,
} from "./theme/ThemeValueAnimator";
import { UiManager } from "./UiManager";
import { UiPage } from "./UiPage";
import { Button } from "./widgets/Button";
import { Slider } from "./widgets/Slider";

const RECT = { left: 10, top: 10, width: 100, height: 40 };

/** `widget` on a 200x200 page, with the manager that presses it. */
function on_page(widget: Element): UiManager {
    const page = new UiPage(
        { x: 200, y: 200 },
        { left: 0, top: 0, width: 1, height: 1 },
        { left: 0, top: 0, width: 200, height: 200 },
    );
    page.add(widget);
    const ui = new UiManager();
    ui.active_menu = page;
    return ui;
}

describe("Element states", () => {
    it("ranks disabled, active, selected, hover", () => {
        const button = new Button("b", RECT);
        expect(button.state).toBe(null);
        button.is_hovered = true;
        expect(button.state).toBe("hover");
        button.is_selected = true;
        expect(button.state).toBe("selected");
        button.is_down = true;
        expect(button.state).toBe("active");
        button.is_disabled = true;
        expect(button.state).toBe("disabled");
    });

    it("is neither selected nor disabled by default", () => {
        const button = new Button("b", RECT);
        expect(button.is_selected).toBe(false);
        expect(button.is_disabled).toBe(false);
    });

    it("updates the theme when a state changes", () => {
        const white = new RgbColor(255, 255, 255);
        const red = new RgbColor(255, 0, 0);
        const button = new Button(
            "b",
            RECT,
            true,
            theme_rules_from([
                ["button:selected", { background_color: white }],
                ["button:disabled", { background_color: red }],
            ]),
        );
        button.is_selected = true;
        expect(button.theme.background_color.equals(white)).toBe(true);
        button.is_disabled = true;
        expect(button.theme.background_color.equals(red)).toBe(true);
        button.is_disabled = false;
        expect(button.theme.background_color.equals(white)).toBe(true);
    });

    it("lets a disabled element take the press, hover, and refuse instead of clicking", () => {
        const button = new Button("b", RECT);
        const clicked = vi.fn();
        const refused = vi.fn();
        button.events.attach(ElementClickEvent, clicked);
        button.events.attach(ElementRefusedEvent, refused);
        button.is_disabled = true;
        const ui = on_page(button);
        ui.pointer_move({ x: 20, y: 20 });
        expect(button.is_hovered).toBe(true);
        ui.pointer_down({ x: 20, y: 20 });
        // the press is held by the element, so it can't fall through to the game
        expect(ui.mouse_locked_element).toBe(button);
        ui.pointer_up({ x: 20, y: 20 });
        expect(clicked).not.toHaveBeenCalled();
        expect(refused).toHaveBeenCalledTimes(1);
    });

    it("doesn't refuse when the press ends outside, and clicks once enabled", () => {
        const button = new Button("b", RECT);
        const clicked = vi.fn();
        const refused = vi.fn();
        button.events.attach(ElementClickEvent, clicked);
        button.events.attach(ElementRefusedEvent, refused);
        button.is_disabled = true;
        const ui = on_page(button);
        ui.pointer_down({ x: 20, y: 20 });
        ui.pointer_up({ x: 190, y: 190 });
        expect(refused).not.toHaveBeenCalled();
        button.is_disabled = false;
        ui.pointer_down({ x: 20, y: 20 });
        ui.pointer_up({ x: 20, y: 20 });
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(refused).not.toHaveBeenCalled();
    });

    it("refuses a click from code too, so a key gets the same answer as a press", () => {
        const button = new Button("b", RECT);
        const refused = vi.fn();
        button.events.attach(ElementRefusedEvent, refused);
        button.is_disabled = true;
        button.click();
        expect(refused).toHaveBeenCalledTimes(1);
    });

    it("never drags a disabled slider, not on the press and not after it", () => {
        const slider = new Slider("s", 0, 100, 25, RECT);
        slider.is_disabled = true;
        const ui = on_page(slider);
        ui.pointer_down({ x: 60, y: 20 });
        expect(slider.value).toBe(25);
        ui.pointer_move({ x: 90, y: 20 });
        expect(slider.value).toBe(25);
        ui.pointer_up({ x: 90, y: 20 });
        slider.is_disabled = false;
        ui.pointer_down({ x: 60, y: 20 });
        expect(slider.value).toBeCloseTo(50);
    });
});

describe("a refusal", () => {
    let time = 0;
    const RED = new RgbColor(200, 0, 0);
    const QUIET = new RgbColor(40, 40, 40);

    beforeEach(() => {
        time = 5;
        set_theme_clock(() => time);
    });

    afterEach(() => {
        set_theme_clock(null);
    });

    function refusing_button(): Button {
        const button = new Button(
            "b",
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            theme_rules_from([
                ["button:disabled", { background_color: QUIET }],
                ["button:refused", { text_color: RED }],
            ]),
        );
        button.is_disabled = true;
        return button;
    }

    it("comes with a press on a disabled element, and goes by itself", () => {
        const button = refusing_button();
        expect(button.is_refused).toBe(false);
        button.click();
        expect(button.state).toBe("refused");
        expect(button.poll_animation()).toBe(false);
        time += REFUSED_SECONDS;
        button.poll_animation();
        expect(button.is_refused).toBe(false);
        expect(button.state).toBe("disabled");
    });

    it("keeps the :disabled look and adds :refused on it", () => {
        const button = refusing_button();
        const before = button.theme.text_color;
        button.click();
        expect(button.theme.background_color.equals(QUIET)).toBe(true);
        expect(button.theme.text_color.equals(RED)).toBe(true);
        time += REFUSED_SECONDS;
        button.poll_animation();
        expect(button.theme.background_color.equals(QUIET)).toBe(true);
        expect(button.theme.text_color.equals(before)).toBe(true);
    });

    it("can be shown by a key that means this element, disabled or not", () => {
        const button = refusing_button();
        button.is_disabled = false;
        button.show_refused();
        expect(button.state).toBe("refused");
    });

    it("shakes away to nothing", () => {
        const shake = theme_shake(3, 1);
        const at = (seconds: number) => {
            const start = time;
            const copy = shake.cpy();
            time = start + seconds;
            const value = copy.get();
            time = start;
            return value?.statements[0];
        };
        expect(at(0)).toEqual({ type: "translate", x: 0, y: 0 });
        const early = at(0.125) as { x: number };
        const late = at(0.625) as { x: number };
        expect(early.x).toBeGreaterThan(1.5);
        expect(Math.abs(late.x)).toBeLessThan(Math.abs(early.x));
    });

    describe("entering", () => {
        let now = 0;

        beforeEach(() => {
            now = 0;
            set_theme_clock(() => now);
        });

        afterEach(() => {
            set_theme_clock(null);
        });

        const slide_x = (button: Button): number => {
            const statement = button.theme.transform?.statements[0];
            return statement?.type === "translate" ? statement.x : 0;
        };

        it("lasts a moment, and slides by a rule from where it starts to where it belongs", () => {
            const button = new Button(
                "b",
                RECT,
                true,
                theme_rules_from([
                    ["button:entering", { transform: theme_slide(-8, 0) }],
                ]),
            );
            expect(button.state).toBe(null);
            button.show_entering();
            expect(button.state).toBe("entering");
            expect(slide_x(button)).toBeCloseTo(-8);
            now = ENTERING_SECONDS / 2;
            button.poll_animation();
            expect(slide_x(button)).toBeLessThan(0);
            expect(slide_x(button)).toBeGreaterThan(-8);
            now = ENTERING_SECONDS;
            expect(slide_x(button)).toBeCloseTo(0);
            button.poll_animation();
            expect(button.state).toBe(null);
            expect(button.theme.transform).toBeNull();
        });

        it("doesn't start over when the state lasts a little longer", () => {
            const button = new Button(
                "b",
                RECT,
                true,
                theme_rules_from([
                    ["button:entering", { transform: theme_slide(-8, 0) }],
                ]),
            );
            button.show_entering();
            now = ENTERING_SECONDS * 1.5;
            expect(slide_x(button)).toBeCloseTo(0);
        });

        it("beats a hover, and gives way to a press", () => {
            const button = new Button("b", RECT);
            button.is_hovered = true;
            button.show_entering();
            expect(button.state).toBe("entering");
            button.is_down = true;
            expect(button.state).toBe("active");
        });
    });
});
