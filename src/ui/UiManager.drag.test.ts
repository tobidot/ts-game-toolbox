import { describe, expect, it } from "vitest";
import { UiManager } from "./UiManager";
import { UiPage } from "./UiPage";
import { Slider } from "./widgets/Slider";

describe("UiManager drag", () => {
    it("drags in the page's reference coordinates, the ones hit() tests", () => {
        // a 960x640 page shown at half size, centred on a 1280x320 canvas
        const page = new UiPage(
            { x: 1280, y: 320 },
            { left: 0.3125, top: 0, width: 0.375, height: 1 },
            { left: 0, top: 0, width: 960, height: 640 },
        );
        const slider = new Slider("s", 0, 100, 0, {
            left: 100,
            top: 100,
            width: 200,
            height: 40,
        });
        page.add(slider);
        const ui = new UiManager();
        ui.active_menu = page;
        // canvas x 400 + 200/2 = 500 is reference x 200: the slider's middle
        ui.pointer_down({ x: 400 + 100, y: 60 });
        expect(slider.value).toBeCloseTo(50);
        ui.pointer_move({ x: 400 + 150, y: 60 });
        expect(slider.value).toBeCloseTo(100);
    });
});
