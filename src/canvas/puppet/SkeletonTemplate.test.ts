import { describe, expect, it } from "vitest";
import {
    fit_template,
    joints_of_fit,
    SKELETON_TEMPLATE_NAMES,
    SKELETON_TEMPLATES,
    template_joints,
    template_layer_bones,
    template_point,
} from "./SkeletonTemplate";
import { Skeleton } from "./Skeleton";
import { RigData } from "./RigData";
import wanderer_data from "./test-data/wanderer-clips.json";

const WANDERER = wanderer_data as unknown as RigData;

describe("skeleton templates", () => {
    it("every template fits its own joints into bones that end where the joints are", () => {
        for (const name of SKELETON_TEMPLATE_NAMES) {
            const template = SKELETON_TEMPLATES[name];
            const joints = template_joints(template, { origin: [300, 400] });
            const fitted = fit_template(template, joints, 400);
            const skeleton = Skeleton.from_data(fitted.bones);
            skeleton.update();
            // The template's own limbs are drawn bent, so nothing is straightened.
            expect(joints_of_fit(fitted)).toEqual(
                expect.objectContaining(joints),
            );
            for (const bone of template.bones) {
                const index = skeleton.index_of(bone.name);
                const to = template_point(bone.to, joints);
                const tip = skeleton.world_point(
                    index,
                    skeleton.lengths[index],
                    0,
                );
                expect(tip.x + fitted.origin[0]).toBeCloseTo(to[0], 0);
                expect(tip.y + fitted.origin[1]).toBeCloseTo(to[1], 0);
            }
            expect(fitted.size).toBeGreaterThan(0.8);
            expect(fitted.size).toBeLessThan(1.25);
        }
    });

    it("the Zweibeiner is step 38's skeleton: the same bones, so its clips and clothes fit", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const fitted = fit_template(
            template,
            template_joints(template, { origin: [0, 0] }),
            0,
        );
        expect(fitted.body.skeleton).toBe("biped-side");
        for (const bone of WANDERER.bones) {
            expect(fitted.bones.some((each) => each.name === bone.name)).toBe(
                true,
            );
        }
        for (const anchor of [
            "head_top",
            "belt",
            "back",
            "hand_l",
            "hand_r",
            "foot_l",
            "foot_r",
            "heel_l",
            "toe_r",
        ]) {
            expect(fitted.anchors[anchor]).toBeDefined();
        }
    });

    it("joints moved in the editor change only the bones next to them", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const joints = template_joints(template, { origin: [260, 480] });
        const before = fit_template(template, joints, 480);
        const moved = {
            ...joints,
            elbow_r: [joints.elbow_r[0] + 30, joints.elbow_r[1] - 12] as [
                number,
                number,
            ],
        };
        const after = fit_template(template, moved, 480);
        const changed = Object.keys(before.lines).filter((name) => {
            const a = before.lines[name];
            const b = after.lines[name];
            return (
                Math.abs(a.x0 - b.x0) +
                    Math.abs(a.y0 - b.y0) +
                    Math.abs(a.x1 - b.x1) +
                    Math.abs(a.y1 - b.y1) >
                1e-6
            );
        });
        expect(changed.sort()).toEqual(["lower_arm_r", "upper_arm_r"]);
        // The hand keeps its place and its angle in the picture, though its parent turned.
        expect(after.lines.hand_r.angle).toBeCloseTo(
            before.lines.hand_r.angle,
            6,
        );
    });

    it("a limb drawn straight bends the way the template says", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const joints = template_joints(template, { origin: [260, 480] });
        joints.knee_r = [
            joints.hip_r[0],
            (joints.hip_r[1] + joints.ankle_r[1]) / 2,
        ];
        joints.ankle_r = [joints.hip_r[0], joints.ankle_r[1]];
        const fitted = fit_template(template, joints, 480);
        // The knee is a little forward of the straight line from hip to ankle.
        expect(fitted.lines.shin_r.x0).toBeGreaterThan(
            fitted.lines.thigh_r.x0 + 1,
        );
        // joints_of_fit gives the joints back (the knee as bent).
        const again = joints_of_fit(fitted);
        expect(again.hip_r).toEqual([joints.hip_r[0], joints.hip_r[1]]);
        expect(again.knee_r[0]).toBeGreaterThan(joints.knee_r[0]);
    });

    it("a joint left out is named", () => {
        const template = SKELETON_TEMPLATES.vierbeiner;
        const joints: Record<string, [number, number]> = template_joints(
            template,
            { origin: [300, 300] },
        );
        delete joints.snout;
        expect(() => fit_template(template, joints, 300)).toThrow(
            /joint "snout"/,
        );
    });
});

describe("a template's layers: one per part", () => {
    const parts: Record<string, string[]> = {
        zweibeiner: [
            "far_arm",
            "far_leg",
            "near_leg",
            "torso",
            "head",
            "near_arm",
        ],
        vierbeiner: [
            "far_hind_leg",
            "far_front_leg",
            "tail",
            "torso",
            "head",
            "near_hind_leg",
            "near_front_leg",
        ],
        flieger: [
            "far_wing",
            "far_leg",
            "tail",
            "torso",
            "head",
            "near_leg",
            "near_wing",
        ],
        wurm: ["torso", "head"],
    };

    it("every bone is in exactly one part, back to front, each with a German title", () => {
        for (const name of SKELETON_TEMPLATE_NAMES) {
            const template = SKELETON_TEMPLATES[name];
            expect(
                template.layers.map((layer) => layer.name),
                name,
            ).toEqual(parts[name]);
            for (const bone of template.bones) {
                const holding = template.layers.filter(
                    (layer) => layer.bones?.includes(bone.name) === true,
                );
                expect(holding.length, `${name} ${bone.name}`).toBe(1);
            }
            for (const layer of template.layers) {
                expect(layer.title, `${name} ${layer.name}`).toMatch(
                    /^[A-ZÄÖÜ][a-zäöüß]+/,
                );
            }
            // The far side's parts lie behind the near side's, the far arm or wing behind
            // everything (a Zweibeiner's near leg stays behind its hips, as drawn before).
            const at = (part: string) =>
                template.layers.findIndex((layer) => layer.name === part);
            for (const layer of template.layers) {
                if (layer.name.startsWith("near_")) {
                    const far = layer.name.replace("near_", "far_");
                    expect(at(far), layer.name).toBeGreaterThanOrEqual(0);
                    expect(at(layer.name), layer.name).toBeGreaterThan(at(far));
                }
            }
            expect(at("torso"), name).toBeGreaterThanOrEqual(0);
        }
    });

    it("the older layers stay as groups by their names: back, body and front mean what they meant", () => {
        const four = SKELETON_TEMPLATES.vierbeiner;
        expect(template_layer_bones(four, "body")).toEqual([
            "spine_1",
            "spine_2",
            "tail_1",
            "tail_2",
            "neck_1",
            "head",
            "jaw",
        ]);
        expect(template_layer_bones(four, "back")).toEqual([
            "thigh_hl",
            "shin_hl",
            "paw_hl",
            "thigh_fl",
            "shin_fl",
            "paw_fl",
        ]);
        expect(template_layer_bones(four, "head")).toEqual([
            "neck_1",
            "head",
            "jaw",
        ]);
        const two = SKELETON_TEMPLATES.zweibeiner;
        expect(template_layer_bones(two, "body")).toEqual([
            "hip",
            "torso",
            "head",
            "jaw",
        ]);
        expect(template_layer_bones(two, "far_arm")).toEqual(
            two.layers[0].bones,
        );
        expect(template_layer_bones(SKELETON_TEMPLATES.wurm, "body")).toEqual(
            SKELETON_TEMPLATES.wurm.bones.map((bone) => bone.name),
        );
        expect(template_layer_bones(two, "flosse")).toBeNull();
        for (const name of SKELETON_TEMPLATE_NAMES) {
            const template = SKELETON_TEMPLATES[name];
            for (const group of template.groups ?? []) {
                // A group is whole parts.
                for (const layer of template.layers) {
                    const inside = layer.bones!.filter((bone) =>
                        group.bones!.includes(bone),
                    );
                    expect(
                        inside.length === 0 ||
                            inside.length === layer.bones!.length,
                        `${name} ${group.name} ${layer.name}`,
                    ).toBe(true);
                }
            }
        }
    });
});
