import { describe, it, expect } from "vitest";
import { UiPage } from "./UiPage";
import { Button } from "./widgets/Button";
import { UiManager } from "./UiManager";
import { Theme } from "./Theme";
import { Group } from "./Group";

describe("ResolutionAgnostic UI", () => {
    it("should transform coordinates correctly in UiPage", () => {
        // Page covers whole screen (0,0 to 1,1)
        // Reference resolution is 800x600
        const page = new UiPage(
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 800, height: 600 },
        );
        page.container_res = { x: 1600, y: 1200 }; // Screen is 2x reference

        // Button at 200, 100 in 800x600 space
        const button = new Button("Test", {
            left: 200,
            top: 100,
            width: 400,
            height: 50,
        });
        page.add(button);

        // Click at 400, 200 in 1600x1200 space should hit the button
        const hit = page.hit({ x: 400, y: 200 });
        expect(hit).toBe(button);

        // Click at 100, 50 in 1600x1200 space should NOT hit the button (it would be 50, 25 in 800x600)
        const hit2 = page.hit({ x: 100, y: 50 });
        expect(hit2).toBe(page); // Hits the page but not the button
    });

    it("should handle nested coordinate transformations", () => {
        const manager = new UiManager();
        const page = new UiPage(
            { left: 0.5, top: 0.5, width: 0.5, height: 0.5 },
            { left: 0, top: 0, width: 100, height: 100 },
        );
        page.container_res = { x: 1000, y: 1000 };
        // Page is at 500, 500 with size 500, 500
        // Reference is 100x100. So 1 reference unit = 5 pixels.

        const button = new Button("Test", {
            left: 10,
            top: 10,
            width: 10,
            height: 10,
        });
        page.add(button);
        manager.active_menu = page;

        // Click at 500 + 10*5, 500 + 10*5 = 550, 550
        const hit = manager.pointer_down({ x: 555, y: 555 });
        expect(hit).toBe(true);
        expect(manager.mouse_locked_element).toBe(button);
    });

    it("should inherit themes correctly", () => {
        const group_theme = new Theme({ text_color: "red" });
        const group = new Group(
            [],
            { left: 0, top: 0, width: 100, height: 100 },
            true,
            group_theme,
        );

        const button_theme = new Theme({ background_color: "blue" });
        const button = new Button(
            "Test",
            { left: 0, top: 0, width: 10, height: 10 },
            true,
            button_theme,
        );
        group.add(button);

        expect(button.theme.background_color).toBe("blue");
        expect(button.theme.text_color).toBe("red"); // Inherited from group
        expect(button.theme.border_color).toBe("#333"); // From DEFAULT_THEME
    });

    it("should support deep theme inheritance", () => {
        const root_theme = new Theme({ font: "bold 20px Arial" });
        const root = new Group(
            [],
            { left: 0, top: 0, width: 100, height: 100 },
            true,
            root_theme,
        );

        const mid = new Group([], { left: 0, top: 0, width: 50, height: 50 });
        root.add(mid);

        const leaf = new Button("Leaf", {
            left: 0,
            top: 0,
            width: 10,
            height: 10,
        });
        mid.add(leaf);

        expect(leaf.theme.font).toBe("bold 20px Arial");
    });

    it("should allow overriding inherited theme properties", () => {
        const root_theme = new Theme({ text_color: "red" });
        const root = new Group(
            [],
            { left: 0, top: 0, width: 100, height: 100 },
            true,
            root_theme,
        );

        const mid_theme = new Theme({ text_color: "green" });
        const mid = new Group(
            [],
            { left: 0, top: 0, width: 50, height: 50 },
            true,
            mid_theme,
        );
        root.add(mid);

        const leaf = new Button("Leaf", {
            left: 0,
            top: 0,
            width: 10,
            height: 10,
        });
        mid.add(leaf);

        expect(leaf.theme.text_color).toBe("green");
    });
});
