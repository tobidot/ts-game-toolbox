import { describe, expect, it } from "vitest";
import { SKELETON_TEMPLATES, template_joints } from "./SkeletonTemplate";
import {
    draw_template_sheet,
    template_bone_joints,
    template_sheet_layout,
} from "./TemplateSheet";

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
                    if (name === "measureText") {
                        return (text: string) => ({ width: text.length * 6 });
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
        // Every joint of the near side gets its word (a far one's may make way).
        for (const joint of template.joints.filter(
            (each) => !/_l$/.test(each.name),
        )) {
            expect(texts).toContain(joint.title);
        }
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

/** A context that only records: dots (with the fill or stroke they got), words and bone lines. */
function recording_context() {
    const arcs: Array<[number, number]> = [];
    const texts: string[] = [];
    const strokes: string[] = [];
    let stroke_style = "";
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
                if (name === "measureText") {
                    return (text: string) => ({ width: text.length * 6 });
                }
                if (name === "stroke") {
                    return () => {
                        strokes.push(stroke_style);
                    };
                }
                return () => undefined;
            },
            set(_target, name: string, value: unknown) {
                if (name === "strokeStyle") {
                    stroke_style = String(value);
                }
                return true;
            },
        },
    ) as unknown as CanvasRenderingContext2D;
    return { context, arcs, texts, strokes };
}

describe("template_sheet_layout", () => {
    it("follows the skeleton's own shape: upright for the Zweibeiner and the Flieger, wide for the Vierbeiner and the Wurm, every joint well inside", () => {
        const shapes: Record<string, "tall" | "wide"> = {
            zweibeiner: "tall",
            flieger: "tall",
            vierbeiner: "wide",
            wurm: "wide",
        };
        for (const [name, shape] of Object.entries(shapes)) {
            const layout = template_sheet_layout(SKELETON_TEMPLATES[name]);
            if (shape === "tall") {
                expect(layout.height, name).toBeGreaterThan(
                    layout.width * 1.08,
                );
            } else {
                expect(layout.width, name).toBeGreaterThan(
                    layout.height * 1.25,
                );
            }
            for (const [joint, [x, y]] of Object.entries(layout.joints)) {
                expect(x, `${name} ${joint}`).toBeGreaterThanOrEqual(
                    layout.margin,
                );
                expect(x, `${name} ${joint}`).toBeLessThanOrEqual(
                    layout.width - layout.margin + 1,
                );
                expect(y, `${name} ${joint}`).toBeGreaterThanOrEqual(
                    layout.top + layout.margin - 1,
                );
                expect(y, `${name} ${joint}`).toBeLessThanOrEqual(
                    layout.origin[1],
                );
            }
            // The margin is a sensible share of the figure, never a sliver.
            expect(layout.margin, name).toBeGreaterThanOrEqual(40);
        }
    });

    it("a character faint under it makes the sheet large enough for its whole picture", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const image = {
            width: 700,
            height: 900,
        } as unknown as CanvasImageSource;
        const joints = template_joints(template, {
            origin: [350, 880],
            scale: 2,
        });
        const layout = template_sheet_layout(template, {
            picture: { image, origin: [350, 880], joints },
        });
        const left = layout.origin[0] - 350;
        const top = layout.origin[1] - 880;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(layout.top);
        expect(left + 700).toBeLessThanOrEqual(layout.width);
        expect(top + 900).toBeLessThanOrEqual(layout.origin[1] + 40);
        expect(layout.joints.knee_r[0] - layout.origin[0]).toBeCloseTo(
            joints.knee_r[0] - 350,
            5,
        );
    });

    it("sheets of one size put the joints in the same places, whatever their titles", () => {
        const template = SKELETON_TEMPLATES.vierbeiner;
        const size = template_sheet_layout(template);
        const short = template_sheet_layout(template, {
            width: size.width,
            height: size.height,
            title: "Hinten",
        });
        const long = template_sheet_layout(template, {
            width: size.width,
            height: size.height,
            title: "Vierbeiner, Ebene 2 von 3: Körper. Nur die kräftigen Knochen gehören auf diese Ebene, die blassen auf die anderen.",
        });
        expect(short.joints).toEqual(size.joints);
        expect(long.joints).toEqual(size.joints);
    });
});

describe("template_sheet with bones", () => {
    it("draws every joint but names only the chosen bones' joints, the rest of the skeleton faint", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const leg = template.layers.find(
            (layer) => layer.name === "near_leg",
        )!.bones!;
        const all = recording_context();
        draw_template_sheet(all.context, template);
        const some = recording_context();
        draw_template_sheet(some.context, template, { bones: leg });
        expect(some.arcs.length).toBe(template.joints.length);
        expect(some.texts).toContain("Knie vorne");
        expect(some.texts).toContain("Hüfte vorne");
        expect(some.texts).not.toContain("Ellbogen vorne");
        expect(all.texts).toContain("Ellbogen vorne");
        // Two strengths of bone lines: the chosen ones and the faint rest.
        expect(
            new Set(some.strokes.filter((style) => /218, 217/.test(style)))
                .size,
        ).toBe(2);
        expect(
            new Set(all.strokes.filter((style) => /218, 217/.test(style))).size,
        ).toBe(1);
    });

    it("joints of the chosen bones, points between joints included", () => {
        const worm = SKELETON_TEMPLATES.wurm;
        const head = worm.bones.find((bone) => bone.name === "head")!;
        const joints = template_bone_joints(worm, ["head"]);
        for (const point of [head.from, head.to]) {
            const names =
                typeof point === "string"
                    ? [point]
                    : [point.from, point.toward];
            for (const name of names) {
                expect(joints.has(name)).toBe(true);
            }
        }
        expect(template_bone_joints(worm, []).size).toBe(0);
    });
});
