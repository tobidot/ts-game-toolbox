import { describe, expect, it, vi } from "vitest";
import { RgbColor } from "../data";
import { Element } from "./Element";
import { ElementClickEvent, ElementRefusedEvent } from "./events";
import { theme_rules_from } from "./theme/ThemeRuleBuilder";
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
