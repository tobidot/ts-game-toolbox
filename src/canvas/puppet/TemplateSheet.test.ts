import { describe, expect, it } from "vitest";
import { SKELETON_TEMPLATES } from "./SkeletonTemplate";
import { draw_template_sheet, template_sheet_layout } from "./TemplateSheet";

describe("template_sheet", () => {
    it("draws the ground line, every joint as a dot and the title", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const calls: string[] = [];
        const arcs: Array<[number, number]> = [];
        const texts: string[] = [];
        const context = new Proxy(
            {},
            {
                get(_target, name: string) {
                    if (name === "arc") {
                        return (x: number, y: number) => {
                            arcs.push([x, y]);
                        };
                    }
                    if (name === "fillText") {
                        return (text: string) => {
                            texts.push(text);
                        };
                    }
                    return (...args: unknown[]) => {
                        calls.push(`${name}(${args.length})`);
                    };
                },
                set() {
                    return true;
                },
            },
        ) as unknown as CanvasRenderingContext2D;
        const layout = draw_template_sheet(context, template);
        expect(arcs.length).toBe(template.joints.length);
        expect(texts.some((text) => text.includes("Zweibeiner"))).toBe(true);
        expect(texts).toContain("Boden");
        expect(layout.height).toBeGreaterThan(template.height);
        // Every joint inside the sheet, the feet on the ground line.
        for (const [x, y] of arcs) {
            expect(x).toBeGreaterThan(0);
            expect(x).toBeLessThan(layout.width);
            expect(y).toBeGreaterThan(0);
            expect(y).toBeLessThanOrEqual(layout.origin[1]);
        }
        const same = template_sheet_layout(template);
        expect(same.joints.toe_r[1]).toBeCloseTo(
            layout.origin[1] - 0.13 * 210,
            1,
        );
    });
});
