import { describe, expect, it } from "vitest";
import {
    fit_template,
    joints_of_fit,
    SKELETON_TEMPLATE_NAMES,
    SKELETON_TEMPLATES,
    template_joints,
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
