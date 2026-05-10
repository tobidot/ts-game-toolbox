import { describe, it, expect } from "vitest";
import { Theme, DefaultTheme } from "./Theme";
import { Button } from "./widgets/Button";

describe("Theme", () => {
    it("should use default theme by default", () => {
        const button = new Button("Test", { left: 0, top: 0, width: 100, height: 50 });
        expect(button.theme.backgroundColor).toBe(DefaultTheme.backgroundColor);
    });

    it("should use custom theme if provided", () => {
        const customTheme = new Theme({ backgroundColor: "#f00", textColor: "#fff" });
        const button = new Button(
            "Test",
            { left: 0, top: 0, width: 100, height: 50 },
            true,
            customTheme,
        );
        expect(button.theme.backgroundColor).toBe("#f00");
        expect(button.theme.textColor).toBe("#fff");
        // Other properties should still be default
        expect(button.theme.borderColor).toBe(DefaultTheme.borderColor);
    });
});
