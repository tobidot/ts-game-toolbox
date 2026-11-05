import { describe, expect, it, vi } from "vitest";
import { ElementClickEvent } from "./events";
import { Group } from "./Group";
import { UiManager } from "./UiManager";
import { UiPage } from "./UiPage";
import { Button } from "./widgets/Button";

const FULL = { left: 0, top: 0, width: 200, height: 200 };

function setup() {
    const button = new Button("b", {
        left: 10,
        top: 10,
        width: 50,
        height: 50,
    });
    const group = new Group([button], FULL);
    const page = new UiPage(
        { x: 200, y: 200 },
        { left: 0, top: 0, width: 1, height: 1 },
        FULL,
    );
    page.add(group);
    const ui = new UiManager();
    ui.active_menu = page;
    return { button, group, page, ui };
}

describe("Group.remove", () => {
    it("takes the child out and says whether it was there", () => {
        const { button, group } = setup();
        expect(group.remove(button)).toBe(true);
        expect(group.children).toEqual([]);
        expect(button.parent).toBe(null);
        expect(group.remove(button)).toBe(false);
    });

    it("lets a removed child no longer be hit", () => {
        const { button, group, page } = setup();
        expect(page.hit({ x: 20, y: 20 })[0]).toBe(button);
        group.remove(button);
        expect(page.hit({ x: 20, y: 20 })[0]).toBe(group);
    });

    it("drops the press: a dead widget neither keeps the lock nor clicks", () => {
        const { button, group, ui } = setup();
        const clicked = vi.fn();
        button.events.attach(ElementClickEvent, clicked);
        ui.pointer_down({ x: 20, y: 20 });
        expect(ui.mouse_locked_element).toBe(button);
        expect(button.is_down).toBe(true);

        group.remove(button);
        expect(button.is_down).toBe(false);
        expect(ui.mouse_locked_element).toBe(null);

        ui.pointer_move({ x: 21, y: 21 });
        ui.pointer_up({ x: 21, y: 21 });
        expect(clicked).not.toHaveBeenCalled();
    });

    it("doesn't press the row that moved under the finger when the pressed one went", () => {
        const { button, group, ui } = setup();
        const next = new Button("next", button.rect);
        const clicked = vi.fn();
        next.events.attach(ElementClickEvent, clicked);
        group.add(next);
        ui.pointer_down({ x: 20, y: 20 });
        expect(ui.mouse_locked_element).toBe(next);
        group.remove(next);
        ui.pointer_up({ x: 20, y: 20 });
        expect(clicked).not.toHaveBeenCalled();
    });

    it("drops the hover, also when it comes back later", () => {
        const { button, group, ui } = setup();
        ui.pointer_move({ x: 20, y: 20 });
        expect(button.is_hovered).toBe(true);
        group.remove(button);
        expect(button.is_hovered).toBe(false);
        // the manager forgets it: re-adding it elsewhere doesn't bring a stale hover back
        ui.pointer_move({ x: 190, y: 190 });
        group.add(button);
        expect(button.is_hovered).toBe(false);
    });

    it("releases everything inside a removed group", () => {
        const { button, group, page, ui } = setup();
        ui.pointer_move({ x: 20, y: 20 });
        ui.pointer_down({ x: 20, y: 20 });
        page.remove(group);
        expect(button.is_down).toBe(false);
        expect(button.is_hovered).toBe(false);
        expect(ui.mouse_locked_element).toBe(null);
    });

    it("gives a removed child its own theme again", () => {
        const { button, group } = setup();
        group.theme_rules = [{ properties: { font_size: 50 } }];
        group.update_theme_instance();
        expect(button.theme.font_size).toBe(50);
        group.remove(button);
        expect(button.theme.font_size).not.toBe(50);
    });
});
