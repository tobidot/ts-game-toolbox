import { describe, expect, it } from "vitest";
import { mask_from, named_masks } from "./PuppetLayers";
import { PuppetRig } from "./PuppetRig";
import { RigData } from "./RigData";
import { Skeleton } from "./Skeleton";
import { WANDERER } from "./test-data/figure";

/** Step 38's wanderer (bones and clips) with a held aim, a recoil and a wave of its own. */
function wanderer(): PuppetRig {
    const data: RigData = {
        ...WANDERER,
        clips: {
            ...WANDERER.clips,
            idle: {
                length: 1,
                loop: true,
                tracks: { torso: [{ t: 0, rotation: 0 }] },
            },
            hold: {
                length: 1,
                loop: true,
                tracks: {
                    torso: [{ t: 0, rotation: 6 }],
                    upper_arm_r: [{ t: 0, rotation: -75 }],
                    lower_arm_r: [{ t: 0, rotation: -20 }],
                    upper_arm_l: [{ t: 0, rotation: -60 }],
                    head: [{ t: 0, rotation: -4 }],
                },
            },
            kick: {
                length: 0.2,
                tracks: {
                    upper_arm_r: [
                        { t: 0, rotation: 0 },
                        { t: 0.05, rotation: -18, ease: "smooth" },
                        { t: 0.2, rotation: 0 },
                    ],
                    lower_arm_r: [
                        { t: 0, rotation: 0 },
                        { t: 0.05, rotation: 9 },
                        { t: 0.2, rotation: 0 },
                    ],
                },
            },
        },
    };
    return PuppetRig.from_data(data);
}

/** A clip's pose at a time, in five fresh arrays. */
function pose_of(rig: PuppetRig, clip: string, time: number): Float64Array[] {
    const count = rig.bone_count;
    const pose = [
        new Float64Array(count),
        new Float64Array(count),
        new Float64Array(count),
        new Float64Array(count),
        new Float64Array(count),
    ];
    rig.clip(clip)!.sample_into(
        time,
        pose[0],
        pose[1],
        pose[2],
        pose[3],
        pose[4],
    );
    return pose;
}

describe("PuppetLayers", () => {
    it("keeps the legs' bones to the run and the arms' bones to the aim", () => {
        const rig = wanderer();
        const hero = rig.puppet("run");
        hero.layers.play("aim", "hold", { mask: "upper_body", fade: 0 });
        const upper = hero.layers.mask("upper_body")!;
        const lower = hero.layers.mask("lower_body")!;
        let time = 0;
        for (let frame = 0; frame < 90; frame++) {
            hero.update(1 / 60);
            time += 1 / 60;
            const run = pose_of(rig, "run", hero.player.time);
            const hold = pose_of(rig, "hold", 0);
            for (let bone = 0; bone < rig.bone_count; bone++) {
                const want = upper[bone] === 1 ? hold : run;
                expect(lower[bone] + upper[bone]).toBe(1);
                expect(hero.skeleton.rotation[bone]).toBe(want[0][bone]);
                expect(hero.skeleton.x[bone]).toBe(want[1][bone]);
                expect(hero.skeleton.y[bone]).toBe(want[2][bone]);
            }
        }
        expect(time).toBeGreaterThan(1);
        // The arm is where the aim put it while the hip bobs with the run.
        const arm = rig.bone_index("upper_arm_r");
        expect(hero.skeleton.rotation[arm]).toBe(-75);
    });

    it("adds a recoil on top and returns to the pose exactly", () => {
        const rig = wanderer();
        const plain = rig.puppet("run");
        const hero = rig.puppet("run");
        hero.layers.play("aim", "hold", { mask: "upper_body", fade: 0 });
        plain.layers.play("aim", "hold", { mask: "upper_body", fade: 0 });
        const arm = rig.bone_index("upper_arm_r");
        let most = 0;
        for (let frame = 0; frame < 60; frame++) {
            if (frame === 10) {
                hero.layers.play("recoil", "kick", {
                    mode: "add",
                    mask: "arm_r",
                    fade: 0,
                });
            }
            hero.update(1 / 60);
            plain.update(1 / 60);
            most = Math.max(
                most,
                Math.abs(
                    hero.skeleton.rotation[arm] - plain.skeleton.rotation[arm],
                ),
            );
            if (frame > 30) {
                for (let bone = 0; bone < rig.bone_count; bone++) {
                    expect(hero.skeleton.rotation[bone]).toBe(
                        plain.skeleton.rotation[bone],
                    );
                }
            }
        }
        expect(most).toBeGreaterThan(10);
        // An added layer that played once fades out and goes by itself.
        expect(hero.layers.layer("recoil")).toBeNull();
        expect(hero.layers.layers.map((layer) => layer.name)).toEqual(["aim"]);
        // Leg bones never felt the recoil.
        const shin = rig.bone_index("shin_r");
        expect(hero.skeleton.rotation[shin]).toBe(
            plain.skeleton.rotation[shin],
        );
    });

    it("fades a layer in and out by its weight, the short way round", () => {
        const rig = wanderer();
        const hero = rig.puppet("walk");
        hero.player.paused = true;
        const arm = rig.bone_index("upper_arm_r");
        hero.update(0);
        const walk_angle = hero.skeleton.rotation[arm];
        hero.layers.play("aim", "hold", { mask: "arm_r", fade: 0.2 });
        hero.update(0.1);
        const halfway = hero.skeleton.rotation[arm];
        expect(halfway).toBeCloseTo(walk_angle + (-75 - walk_angle) * 0.5, 6);
        hero.update(0.2);
        expect(hero.skeleton.rotation[arm]).toBe(-75);
        hero.layers.set_weight("aim", 0.25);
        hero.update(0);
        expect(hero.skeleton.rotation[arm]).toBeCloseTo(
            walk_angle + (-75 - walk_angle) * 0.25,
            9,
        );
        hero.layers.stop("aim", 0.1);
        hero.update(0.05);
        expect(hero.layers.layer("aim")).not.toBeNull();
        hero.update(0.1);
        expect(hero.layers.layer("aim")).toBeNull();
        expect(hero.skeleton.rotation[arm]).toBe(walk_angle);
    });

    it("makes named masks from the bone tree, and from bone names", () => {
        const skeleton = Skeleton.from_data(WANDERER.bones);
        const masks = named_masks(skeleton, { gun_arm: ["lower_arm_r"] });
        const names = (mask: Float64Array) =>
            skeleton.names.filter((_, bone) => mask[bone] === 1);
        expect(names(masks.get("lower_body")!)).toEqual([
            "root",
            "hip",
            "thigh_l",
            "shin_l",
            "foot_l",
            "thigh_r",
            "shin_r",
            "foot_r",
        ]);
        expect(names(masks.get("arm_r")!)).toEqual([
            "upper_arm_r",
            "lower_arm_r",
            "hand_r",
        ]);
        expect(names(masks.get("leg_l")!)).toEqual([
            "thigh_l",
            "shin_l",
            "foot_l",
        ]);
        expect(names(masks.get("head")!)).toEqual(["head"]);
        expect(names(masks.get("gun_arm")!)).toEqual(["lower_arm_r", "hand_r"]);
        expect(names(masks.get("upper_body")!)).toContain("torso");
        expect(names(masks.get("upper_body")!)).not.toContain("hip");
        expect(
            names(mask_from(skeleton, "torso", { children: false })),
        ).toEqual(["torso"]);
        // A generated four-legged creature: legs hang off the spine, so the spine is upper body.
        const beast = Skeleton.from_data([
            { name: "root" },
            { name: "spine_1", parent: "root", length: 60 },
            { name: "thigh_hl", parent: "spine_1", length: 40 },
            { name: "shin_hl", parent: "thigh_hl", length: 40 },
            { name: "neck_1", parent: "spine_1", length: 20 },
            { name: "head", parent: "neck_1", length: 30 },
            { name: "jaw", parent: "head", length: 10 },
        ]);
        const beast_masks = named_masks(beast);
        expect(
            beast.names.filter(
                (_, bone) => beast_masks.get("lower_body")![bone] === 1,
            ),
        ).toEqual(["root", "thigh_hl", "shin_hl"]);
        expect(
            beast.names.filter(
                (_, bone) => beast_masks.get("head")![bone] === 1,
            ),
        ).toEqual(["head", "jaw"]);
    });

    it("refuses a clip the rig doesn't have, and waits for a rig still on its way", () => {
        const rig = wanderer();
        const hero = rig.puppet("run");
        expect(hero.layers.play("aim", "nothing")).toBeNull();
        expect(hero.layers.layers).toHaveLength(0);
        const later = new PuppetRig();
        const waiting = later.puppet("run");
        expect(
            waiting.layers.play("aim", "hold", { mask: "upper_body", fade: 0 }),
        ).not.toBeNull();
        waiting.update(0.1);
        later.set_data(rig.data!);
        waiting.update(0.1);
        expect(waiting.skeleton.rotation[later.bone_index("upper_arm_r")]).toBe(
            -75,
        );
    });
});
