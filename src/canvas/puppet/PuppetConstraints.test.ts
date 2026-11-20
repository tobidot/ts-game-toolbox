import { describe, expect, it } from "vitest";
import { Puppet } from "./Puppet";
import { PuppetRig } from "./PuppetRig";
import { RigData } from "./RigData";
import { WANDERER } from "./test-data/figure";

/** Step 38's wanderer with its hands' anchors (as the catalogue has them) and an idle. */
function wanderer(extra: Partial<RigData> = {}): PuppetRig {
    return PuppetRig.from_data({
        ...WANDERER,
        anchors: {
            ...WANDERER.anchors,
            hand_r: { bone: "hand_r", x: 11.55, y: -4.2, rotation: -90 },
            hand_l: { bone: "hand_l", x: 11.55, y: -4.2, rotation: -90 },
        },
        clips: {
            ...WANDERER.clips,
            idle: {
                length: 1,
                loop: true,
                tracks: { torso: [{ t: 0, rotation: 0 }] },
            },
        },
        ...extra,
    });
}

/** Degrees between where the line of `hand_r` (from `from` in its frame) points and the target, as drawn. */
function aim_error(
    hero: Puppet,
    target_x: number,
    target_y: number,
    from: readonly [number, number] = [0, 0],
): number {
    const placement = hero.placement;
    const anchor = hero.anchor_world("hand_r", placement.x, placement.y, {
        scale: placement.scale,
        flip_x: placement.flip_x,
    })!;
    const radians = (anchor.rotation * Math.PI) / 180;
    // The offset turns with the anchor; mirrored drawing mirrors its y across the line too.
    const side = placement.flip_x ? -1 : 1;
    const x =
        anchor.x +
        placement.scale *
            (Math.cos(radians) * from[0] - side * Math.sin(radians) * from[1]);
    const y =
        anchor.y +
        placement.scale *
            (Math.sin(radians) * from[0] + side * Math.cos(radians) * from[1]);
    const wanted = (Math.atan2(target_y - y, target_x - x) * 180) / Math.PI;
    const turned = (((wanted - anchor.rotation + 180) % 360) + 360) % 360;
    return Math.abs(turned - 180);
}

describe("PuppetConstraints", () => {
    it("aims the hand's anchor at the target within a degree, all round, mirrored too", () => {
        for (const flip_x of [false, true]) {
            const hero = wanderer().puppet("idle");
            hero.place(400, 500, { scale: 0.5, flip_x });
            let worst = 0;
            for (let step = 0; step < 36; step++) {
                const angle = (step * 10 * Math.PI) / 180;
                const target_x = 400 + Math.cos(angle) * 320;
                const target_y = 380 + Math.sin(angle) * 320;
                expect(
                    hero.constraints.aim("arm_r", target_x, target_y, {
                        fade: 0,
                    }),
                ).toBe(true);
                hero.update(1 / 60);
                worst = Math.max(worst, aim_error(hero, target_x, target_y));
            }
            expect(worst).toBeLessThan(1);
        }
    });

    it("aims a muzzle held off the hand's line, and keeps the spine within its limits", () => {
        const hero = wanderer().puppet("idle");
        hero.place(0, 0, { scale: 1 });
        const muzzle: [number, number] = [90, -22];
        const torso = hero.rig.bone_index("torso");
        for (const [x, y] of [
            [600, -150],
            [500, -700],
            [700, 200],
            [-50, -900],
        ]) {
            hero.constraints.aim("arm_r", x, y, { from: muzzle, fade: 0 });
            hero.update(1 / 60);
            expect(aim_error(hero, x, y, muzzle)).toBeLessThan(1);
            // The idle clip keeps the torso at 0; the default aim lets it lean at most 35 degrees.
            expect(Math.abs(hero.skeleton.rotation[torso])).toBeLessThanOrEqual(
                35 + 1e-9,
            );
        }
    });

    it("leaves the running legs to the run", () => {
        const plain = wanderer().puppet("run");
        const hero = wanderer().puppet("run");
        for (let frame = 0; frame < 40; frame++) {
            hero.constraints.aim("arm_r", 300, -250 + frame * 10, { fade: 0 });
            hero.update(1 / 60);
            plain.update(1 / 60);
            for (const leg of ["thigh_r", "shin_r", "foot_l", "hip"]) {
                const bone = hero.rig.bone_index(leg);
                expect(hero.skeleton.rotation[bone]).toBe(
                    plain.skeleton.rotation[bone],
                );
            }
        }
    });

    it("looks with the head within its limits", () => {
        const hero = wanderer().puppet("idle");
        const head = hero.rig.bone_index("head");
        hero.update(0);
        const ahead = hero.skeleton.world_rotation(head) + 90;
        expect(Math.abs(ahead)).toBeLessThan(5);
        // A target a little up and ahead: the head's forward points at it.
        const joint_x = hero.skeleton.world_x(head);
        const joint_y = hero.skeleton.world_y(head);
        hero.constraints.look_at("head", joint_x + 300, joint_y - 100, {
            fade: 0,
        });
        hero.update(1 / 60);
        const looking = hero.skeleton.world_rotation(head) + 90;
        expect(looking).toBeCloseTo((Math.atan2(-100, 300) * 180) / Math.PI, 6);
        // Straight up is past the limit of 40 degrees: it stops there.
        hero.constraints.look_at("head", joint_x, joint_y - 500, { fade: 0 });
        hero.update(1 / 60);
        expect(hero.skeleton.rotation[head]).toBeCloseTo(-40, 6);
    });

    it("reaches a foot down a slope and the far hand to a grip", () => {
        const hero = wanderer().puppet("idle");
        hero.update(0);
        const foot = hero.rig.bone_index("foot_r");
        const ankle_x = hero.skeleton.world_x(foot);
        const ankle_y = hero.skeleton.world_y(foot);
        hero.constraints.reach("foot_r", ankle_x + 10, ankle_y - 30, {
            fade: 0,
        });
        hero.update(1 / 60);
        expect(hero.skeleton.world_x(foot)).toBeCloseTo(ankle_x + 10, 6);
        expect(hero.skeleton.world_y(foot)).toBeCloseTo(ankle_y - 30, 6);
        const hand = hero.rig.bone_index("hand_l");
        hero.constraints.reach("hand_l", 70, -260, { fade: 0 });
        hero.update(1 / 60);
        expect(hero.skeleton.world_x(hand)).toBeCloseTo(70, 6);
        expect(hero.skeleton.world_y(hand)).toBeCloseTo(-260, 6);
    });

    it("fades in and out, and takes constraints from the rig's data", () => {
        const rig = wanderer({
            constraints: {
                gaze: {
                    kind: "look_at",
                    bone: "head",
                    limits: [-30, 30],
                    weight: 0.5,
                },
            },
        });
        const hero = rig.puppet("idle");
        const head = rig.bone_index("head");
        expect(
            hero.constraints.constraints.map((constraint) => constraint.name),
        ).toEqual(["gaze"]);
        hero.constraints.look_at("gaze", 0, -2000);
        hero.update(1 / 60);
        // Half the weight of a turn clamped at -30.
        expect(hero.skeleton.rotation[head]).toBeCloseTo(-15, 6);
        hero.constraints.release("gaze", 0.2);
        hero.update(0.1);
        expect(hero.skeleton.rotation[head]).toBeCloseTo(-7.5, 6);
        hero.update(0.2);
        expect(hero.skeleton.rotation[head]).toBe(0);
        // Unknown names and the wrong kind are refused.
        expect(hero.constraints.aim("tail", 0, 0)).toBe(false);
        expect(hero.constraints.aim("gaze", 0, 0)).toBe(false);
        expect(hero.constraints.set_enabled("arm_r", false)).toBe(true);
    });
});
