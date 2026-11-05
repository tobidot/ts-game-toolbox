import { describe, expect, it } from "vitest";
import { RgbColor } from "../data/RgbColor";
import { IntroGate } from "../stage/IntroGate";
import { theme_rules_from } from "../ui/theme/ThemeRuleBuilder";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameSettings, HOUSE_COLORS } from "./CanvasGameSettings";
import { HouseSlider } from "./HouseSlider";

/** Draws the slider and returns the fill color each arc, roundRect and text got, in order. */
function painted(slider: HouseSlider) {
    const steps: Array<[string, string]> = [];
    const state: Record<string | symbol, unknown> = {};
    const context = new Proxy(state, {
        get: (target, name) => {
            if (name in target) {
                return target[name];
            }
            return (...args: unknown[]) => {
                if (name === "fill" || name === "fillText") {
                    steps.push([
                        name === "fill" ? "fill" : String(args[0]),
                        String(target.fillStyle),
                    ]);
                }
                if (name === "stroke") {
                    steps.push([
                        `stroke ${String(target.lineWidth)}`,
                        String(target.strokeStyle),
                    ]);
                }
            };
        },
        set: (target, name, value) => {
            target[name] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    slider.draw(context);
    return { steps, font: String(state.font) };
}

function css(hex: string): string {
    const channel = (start: number) =>
        Number(`0x${hex.slice(start, start + 2)}`);
    return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, 1)`;
}

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

    describe("on a page with the house rules", () => {
        function placed(): HouseSlider {
            const game = new CanvasGameProperties<object>(
                new CanvasGameSettings(),
                {} as IntroGate,
            );
            return game.place(
                new HouseSlider("S", 0, 100, 50, UNPLACED),
                () => ({ left: 0, top: 0, width: 220, height: 40 }),
            );
        }

        it("paints what it always painted, in that order", () => {
            const { steps } = painted(placed());
            expect(steps).toEqual([
                ["fill", css(HOUSE_COLORS.line)],
                ["fill", css(HOUSE_COLORS.turquoise)],
                ["fill", css(HOUSE_COLORS.white)],
                ["stroke 2", css(HOUSE_COLORS.black)],
                ["S", css(HOUSE_COLORS.muted)],
                ["50", css(HOUSE_COLORS.white)],
            ]);
        });

        it("turns its thumb turquoise while held, and not its value", () => {
            const slider = placed();
            slider.update_mouse_down_status(true);
            const { steps } = painted(slider);
            expect(steps[2]).toEqual(["fill", css(HOUSE_COLORS.turquoise)]);
            expect(steps[5]).toEqual(["50", css(HOUSE_COLORS.white)]);
        });

        it("has its text at 15 like before, the name in bold", () => {
            const slider = placed();
            expect(slider.theme.font_size).toBe(15);
            const left = new HouseSlider("H", 0, 1, 0, slider.rect, {
                label: "left",
            });
            slider.parent?.add(left);
            expect(painted(left).font).toBe("700 15px monospace");
            expect(painted(slider).font).toBe("15px monospace");
        });

        it("follows a rule of the game", () => {
            const slider = placed();
            const pink = new RgbColor(255, 0, 255);
            slider.theme_rules = theme_rules_from([
                ["slider", { thumb_color: pink }],
            ]);
            slider.update_theme_instance();
            expect(painted(slider).steps[2][1]).toBe(pink.toString());
        });
    });
});
