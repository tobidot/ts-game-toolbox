import { describe, it, expect } from "vitest";
import { Theme, DEFAULT_THEME } from "./Theme";
import { Button } from "./widgets/Button";

describe("Theme", () => {
    it("should use default theme by default", () => {
        const button = new Button("Test", {
            left: 0,
            top: 0,
            width: 100,
            height: 50,
        });
        expect(button.theme.background_color).toBe(
            DEFAULT_THEME.background_color,
        );
    });

    it("should use custom theme if provided", () => {
        const custom_theme = new Theme({
            background_color: "#f00",
            text_color: "#fff",
        });
        const button = new Button(
            "Test",
            { left: 0, top: 0, width: 100, height: 50 },
            true,
            custom_theme,
        );
        expect(button.theme.background_color).toBe("#f00");
        expect(button.theme.text_color).toBe("#fff");
        // Other properties should still be default
        expect(button.theme.border_color).toBe(DEFAULT_THEME.border_color);
    });
});
