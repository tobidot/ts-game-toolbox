import { describe, expect, it } from "vitest";
import { HouseSlider } from "../../game-element/HouseSlider";
import { theme_rules_from } from "../theme/ThemeRuleBuilder";
import { UiManager } from "../UiManager";
import { UiPage } from "../UiPage";
import { CheckBox } from "./CheckBox";
import { Label } from "./Label";
import { Panel } from "./Panel";
import { ScrollGroup } from "./ScrollGroup";
import { Slider } from "./Slider";
import { ValueLabel } from "./ValueLabel";

/** A context that remembers what was filled where. */
function recording_context() {
    const texts: Array<{ text: string; x: number; y: number }> = [];
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const context = new Proxy(
        { canvas: { width: 960, height: 640 } },
        {
            get: (target, name) => {
                if (name in target) {
                    return (target as Record<string | symbol, unknown>)[name];
                }
                return (...args: unknown[]) => {
                    calls.push({ name: String(name), args });
                    if (name === "fillText") {
                        texts.push({
                            text: args[0] as string,
                            x: args[1] as number,
                            y: args[2] as number,
                        });
                    }
                };
            },
            set: () => true,
        },
    ) as unknown as CanvasRenderingContext2D;
    return { context, texts, calls };
}

function page_of(...children: Array<Panel | Slider>): {
    page: UiPage;
    ui: UiManager;
} {
    const page = new UiPage(
        { x: 960, y: 640 },
        { left: 0, top: 0, width: 1, height: 1 },
        { left: 0, top: 0, width: 960, height: 640 },
    );
    children.forEach((child) => page.add(child));
    const ui = new UiManager();
    ui.active_menu = page;
    return { page, ui };
}

const SLIDER_RECT = { left: 20, top: 10, width: 200, height: 40 };
const PANEL_RECT = { left: 300, top: 100, width: 300, height: 100 };

describe("a slider inside a panel", () => {
    it("reads the value at the pointer, on the press and on the drag", () => {
        const slider = new Slider("s", 0, 100, 0, SLIDER_RECT);
        const { ui } = page_of(new Panel([slider], PANEL_RECT));
        // the panel starts at 300, the slider 20 further: its middle is at 420
        ui.pointer_down({ x: 420, y: 130 });
        expect(slider.value).toBeCloseTo(50);
        ui.pointer_move({ x: 370, y: 130 });
        expect(slider.value).toBeCloseTo(25);
        ui.pointer_move({ x: 900, y: 130 });
        expect(slider.value).toBe(100);
        ui.pointer_move({ x: 0, y: 130 });
        expect(slider.value).toBe(0);
    });

    it("goes through panels within panels", () => {
        const slider = new Slider("s", 0, 100, 0, SLIDER_RECT);
        const inner = new Panel([slider], {
            left: 10,
            top: 10,
            width: 280,
            height: 80,
        });
        const { ui } = page_of(new Panel([inner], PANEL_RECT));
        ui.pointer_down({ x: 430, y: 140 });
        expect(slider.value).toBeCloseTo(50);
    });

    it("counts a scrolled parent in", () => {
        const slider = new Slider("s", 0, 100, 0, SLIDER_RECT);
        const list = new ScrollGroup([slider], {
            left: 0,
            top: 0,
            width: 300,
            height: 30,
        });
        const { ui } = page_of(new Panel([list], PANEL_RECT));
        list.scroll = 15;
        ui.pointer_down({ x: 420, y: 110 });
        expect(slider.value).toBeCloseTo(50);
    });

    it("works for the HouseSlider too, on its track", () => {
        const slider = new HouseSlider("s", 0, 100, 0, SLIDER_RECT);
        const { ui } = page_of(new Panel([slider], PANEL_RECT));
        ui.pointer_down({ x: 420, y: 130 });
        expect(slider.value).toBeCloseTo(50);
    });

    it("reads the same on the page as before", () => {
        const slider = new Slider("s", 0, 100, 0, SLIDER_RECT);
        const { ui } = page_of(slider);
        ui.pointer_down({ x: 120, y: 30 });
        expect(slider.value).toBeCloseTo(50);
    });
});

describe("text in its box", () => {
    const TOP = theme_rules_from({
        text_baseline: "top",
        text_align: "left",
    });
    const RECT = { left: 300, top: 200, width: 100, height: 40 };

    it("sets a Label's top baseline at the top of its box, wherever it is", () => {
        const { context, texts } = recording_context();
        new Label("t", RECT, true, TOP).draw(context);
        // the canvas origin is at the element's center
        expect(texts[0]).toEqual({ text: "t", x: -50, y: -20 });
    });

    it("sets a ValueLabel's top baseline at the top of its box", () => {
        const { context, texts } = recording_context();
        new ValueLabel("a", 1, RECT, true, TOP).draw(context);
        expect(texts[0]).toEqual({ text: "a: 1", x: -50, y: -20 });
    });

    it("starts a Slider's title at the left of its box, wherever it is", () => {
        const { context, texts } = recording_context();
        new Slider("s", 0, 1, 0.5, RECT).draw(context);
        expect(texts.every((text) => Math.abs(text.x) <= 50)).toBe(true);
    });
});

describe("Slider.format", () => {
    const RECT = { left: 0, top: 0, width: 100, height: 40 };

    function shown(slider: Slider): string {
        const { context, texts } = recording_context();
        slider.draw(context);
        return texts.map((text) => text.text).join(" ");
    }

    it("shows two decimals by default", () => {
        expect(shown(new Slider("s", 0, 1, 0.5, RECT))).toContain("0.50");
    });

    it("shows what the game asks for", () => {
        const slider = new Slider("Heizung", 0, 100, 42.4, RECT);
        slider.format = (value) => `${Math.round(value)} %`;
        expect(shown(slider)).toContain("42 %");
        expect(shown(slider)).not.toContain("42.40");
    });
});

describe("CheckBox", () => {
    const RECT = { left: 100, top: 100, width: 200, height: 40 };

    function box_of(calls: Array<{ name: string; args: unknown[] }>): number {
        const box = calls.find(
            (call) => call.name === "rect" || call.name === "roundRect",
        );
        return box?.args[2] as number;
    }

    it("keeps its small box without a label, as games paint text next to it", () => {
        const { context, calls, texts } = recording_context();
        new CheckBox(false, RECT).draw(context);
        expect(box_of(calls)).toBe(20);
        expect(texts).toEqual([]);
    });

    it("sizes the box by the rect with a label, and writes the label next to it", () => {
        const { context, calls, texts } = recording_context();
        const checkbox = new CheckBox(false, RECT);
        checkbox.label = "Automatik";
        checkbox.draw(context);
        expect(box_of(calls)).toBe(40);
        expect(texts[0].text).toBe("Automatik");
        expect(texts[0].x).toBeGreaterThan(-100 + 40);
    });

    it("toggles on a press anywhere in its rect", () => {
        const checkbox = new CheckBox(false, RECT);
        checkbox.label = "Automatik";
        const page = new UiPage(
            { x: 960, y: 640 },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 960, height: 640 },
        );
        page.add(checkbox);
        const ui = new UiManager();
        ui.active_menu = page;
        ui.pointer_down({ x: 280, y: 120 });
        ui.pointer_up({ x: 280, y: 120 });
        expect(checkbox.checked).toBe(true);
    });
});
