import { describe, expect, it } from "vitest";
import { RgbColor } from "../../data/RgbColor";
import { bevel_colors, Element } from "../Element";
import { ThemePropertyDefinitions } from "../theme/Theme";
import { theme_rules_from } from "../theme/ThemeRuleBuilder";
import { Button } from "./Button";
import { Panel } from "./Panel";

const RECT = { left: 0, top: 0, width: 100, height: 40 };
const GRAY = new RgbColor(100, 100, 100);

/** Every fill and stroke of `element`, with the color it used, the first point of each path. */
function paint_of(element: Element) {
    const paints: Array<{ kind: string; color: string; x?: number }> = [];
    let first_x: number | undefined;
    const state: Record<string | symbol, unknown> = {};
    const context = new Proxy(state, {
        get: (target, name) => {
            if (name in target) {
                return target[name];
            }
            return (...args: unknown[]) => {
                if (name === "beginPath") {
                    first_x = undefined;
                }
                if (name === "moveTo") {
                    first_x = args[0] as number;
                }
                if (name === "fill") {
                    paints.push({
                        kind: "fill",
                        color: target.fillStyle as string,
                        x: first_x,
                    });
                }
                if (name === "stroke") {
                    paints.push({
                        kind: "stroke",
                        color: target.strokeStyle as string,
                    });
                }
            };
        },
        set: (target, name, value) => {
            target[name] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    element.draw(context);
    return paints;
}

function rules(properties: Partial<ThemePropertyDefinitions>) {
    return theme_rules_from([
        ["button", properties],
        ["panel", properties],
    ]);
}

describe("border_style", () => {
    const { light, dark } = bevel_colors(GRAY);

    it("works its two edges out from the border color", () => {
        expect(light.r).toBeGreaterThan(GRAY.r);
        expect(dark.r).toBeLessThan(GRAY.r);
    });

    it("strokes a solid border in the border color, as before", () => {
        const button = new Button(
            "",
            RECT,
            true,
            rules({ border_color: GRAY, border_width: 2 }),
        );
        const strokes = paint_of(button).filter((p) => p.kind === "stroke");
        expect(strokes).toEqual([{ kind: "stroke", color: GRAY.toString() }]);
    });

    it("lights the top left of a raised border and darkens the bottom right", () => {
        const button = new Button(
            "",
            RECT,
            true,
            rules({
                border_color: GRAY,
                border_width: 2,
                border_style: "raised",
            }),
        );
        const paints = paint_of(button);
        expect(paints.filter((p) => p.kind === "stroke")).toEqual([]);
        const edges = paints.filter((p) => p.x !== undefined);
        expect(edges.map((p) => p.color)).toEqual([
            light.toString(),
            dark.toString(),
        ]);
    });

    it("turns the two around on a sunken border", () => {
        const button = new Button(
            "",
            RECT,
            true,
            rules({
                border_color: GRAY,
                border_width: 2,
                border_style: "sunken",
            }),
        );
        const edges = paint_of(button).filter((p) => p.x !== undefined);
        expect(edges.map((p) => p.color)).toEqual([
            dark.toString(),
            light.toString(),
        ]);
    });

    it("reaches a Panel too, which draws its background the same way", () => {
        const panel = new Panel(
            [],
            RECT,
            true,
            rules({
                border_color: GRAY,
                border_width: 2,
                border_style: "raised",
            }),
        );
        const edges = paint_of(panel).filter((p) => p.x !== undefined);
        expect(edges.map((p) => p.color)).toEqual([
            light.toString(),
            dark.toString(),
        ]);
    });

    it("draws nothing extra with no width", () => {
        const button = new Button(
            "",
            RECT,
            true,
            rules({ border_style: "raised" }),
        );
        expect(paint_of(button).filter((p) => p.x !== undefined)).toEqual([]);
    });
});
