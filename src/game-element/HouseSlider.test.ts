import { describe, expect, it } from "vitest";
import { HouseSlider } from "./HouseSlider";

describe("HouseSlider", () => {
    it("maps a drag onto the track, not the label column", () => {
        const rect = { left: 100, top: 0, width: 300, height: 40 };
        const slider = new HouseSlider("H", 0, 360, 0, rect, {
            label: "left",
        });
        // the track starts after the 64px column and a 6px gap, and ends 10px before the edge
        slider.drag(null, { x: 100 + 70, y: 20 });
        expect(slider.value).toBe(0);
        slider.drag(null, { x: 400 - 10, y: 20 });
        expect(slider.value).toBe(360);
        slider.drag(null, { x: 100 + 70 + 110, y: 20 });
        expect(slider.value).toBeCloseTo(180);
    });

    it("keeps half a thumb free at both ends with the label above", () => {
        const rect = { left: 0, top: 0, width: 220, height: 40 };
        const slider = new HouseSlider("S", 0, 100, 50, rect);
        slider.drag(null, { x: 10, y: 30 });
        expect(slider.value).toBe(0);
        slider.drag(null, { x: 110, y: 30 });
        expect(slider.value).toBeCloseTo(50);
    });
});
