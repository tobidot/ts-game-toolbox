import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../physics/world/PhysicsWorld";
import { PuppetRagdoll, ragdoll_limits, RAGDOLL_LAYER } from "./PuppetRagdoll";
import { PuppetRig } from "./PuppetRig";
import { rig_from_picture } from "./RigPicture";
import { SKELETON_TEMPLATES } from "./SkeletonTemplate";
import { draw_figure, WANDERER } from "./test-data/figure";

/** A drawn Zweibeiner rigged as a soft skin (step 43), with its atlas's pixels. */
function soft_figure(): PuppetRig {
    const figure = draw_figure(SKELETON_TEMPLATES.zweibeiner);
    const made = rig_from_picture({
        layers: figure.layers,
        joints: figure.joints,
        template: SKELETON_TEMPLATES.zweibeiner,
        keyed_clips: WANDERER,
    });
    const rig = PuppetRig.from_data(made.rig);
    rig.soft_skin!.pixels = made.pixels;
    return rig;
}

/** Step 38's wanderer's bones and clips with an empty cut-out skin (it scatters). */
function cut_out(): PuppetRig {
    return PuppetRig.from_data({
        ...WANDERER,
        clips: {
            ...WANDERER.clips,
            idle: {
                length: 1,
                loop: true,
                tracks: { torso: [{ t: 0, rotation: 0 }] },
            },
        },
    });
}

const GROUND = 500;

/** A world with a floor at `GROUND`, as a game sets one up. */
function world_with_floor(): PhysicsWorld<unknown> {
    const world = new PhysicsWorld<unknown>({
        gravity: { x: 0, y: 900 },
        friction: 0.4,
    });
    world.add({
        shape: {
            points: [
                { x: -2000, y: 0 },
                { x: 2000, y: 0 },
                { x: 2000, y: 200 },
                { x: -2000, y: 200 },
            ],
        },
        position: { x: 0, y: GROUND },
        is_static: true,
    });
    return world;
}

/** Each bone's joint and angle now. */
function pose_of(skeleton: {
    count: number;
    world_x(i: number): number;
    world_y(i: number): number;
    world_rotation(i: number): number;
}) {
    return Array.from({ length: skeleton.count }, (_, bone) => [
        skeleton.world_x(bone),
        skeleton.world_y(bone),
        skeleton.world_rotation(bone),
    ]);
}

describe("PuppetRagdoll", () => {
    it("starts with the bones exactly where the pose had them, moving as they moved", () => {
        for (const flip_x of [false, true]) {
            const hero = soft_figure().puppet("run");
            hero.place(300, GROUND, { scale: 0.5, flip_x });
            for (let frame = 0; frame < 9; frame++) {
                hero.update(1 / 60);
            }
            const before = pose_of(hero.skeleton);
            const world = world_with_floor();
            const ragdoll = hero.ragdoll(world, { velocity: { x: 120, y: 0 } });
            hero.update(0);
            const after = pose_of(hero.skeleton);
            for (let bone = 0; bone < before.length; bone++) {
                expect(after[bone][0]).toBeCloseTo(before[bone][0], 6);
                expect(after[bone][1]).toBeCloseTo(before[bone][1], 6);
                const turned =
                    ((((after[bone][2] - before[bone][2]) % 360) + 540) % 360) -
                    180;
                expect(turned).toBeCloseTo(0, 6);
            }
            // Each body moves as its point did in the last frame, plus the puppet's own speed.
            const thigh = hero.rig.bone_index("thigh_r");
            const stick = ragdoll.sticks.find((known) => known.bone === thigh)!;
            const body = ragdoll.particles[stick.tip].body;
            expect(
                Math.hypot(body.velocity.x - 120, body.velocity.y),
            ).toBeGreaterThan(20);
            expect(body.layer).toBe(RAGDOLL_LAYER);
            expect(world.bodies.length).toBe(1 + ragdoll.particles.length);
        }
    });

    it("falls, settles on the floor and never stretches a joint", () => {
        const hero = soft_figure().puppet("run");
        hero.place(300, GROUND, { scale: 0.5 });
        for (let frame = 0; frame < 5; frame++) {
            hero.update(1 / 60);
        }
        const world = world_with_floor();
        const ragdoll = hero.ragdoll(world, {
            push: { bone: "head", x: 500, y: -200 },
        });
        let bent_frames = 0;
        for (let frame = 0; frame < 60 * 5; frame++) {
            world.update(1 / 60);
            hero.update(1 / 60);
            const stretch = ragdoll.stretch();
            if (Math.max(stretch.length, stretch.joint) > 2) {
                bent_frames += 1;
            }
        }
        expect(ragdoll.is_settled).toBe(true);
        // World units at scale 0.5 (a unit is two pixels of the figure). The ground has the last
        // word: a hard landing bends a bone for a few frames (the drawing reads only the angles).
        expect(bent_frames).toBeLessThan(20);
        const resting = ragdoll.stretch();
        expect(resting.length).toBeLessThan(0.5);
        expect(resting.joint).toBeLessThan(0.5);
        // On the floor, nothing under it.
        const box = ragdoll.bounds();
        expect(box.bottom).toBeLessThan(GROUND + 0.5);
        expect(box.bottom).toBeGreaterThan(GROUND - 2);
        // The drawn skeleton keeps every bone within its limits, with some give: a short bone (the
        // jaw) the ground pushes on bends past its limit by a few degrees.
        const limits = ragdoll_limits(hero.rig);
        for (let bone = 0; bone < hero.skeleton.count; bone++) {
            const parent = hero.skeleton.parents[bone];
            if (parent < 0 || hero.skeleton.parents[parent] < 0) {
                continue;
            }
            const [low, high] = limits.get(bone)!;
            expect(hero.skeleton.rotation[bone]).toBeGreaterThanOrEqual(
                low - 12,
            );
            expect(hero.skeleton.rotation[bone]).toBeLessThanOrEqual(high + 12);
        }
    });

    it("scatters a cut-out puppet's parts, never a soft skin's", () => {
        const hero = cut_out().puppet("run");
        hero.place(300, GROUND, { scale: 0.5 });
        hero.update(1 / 60);
        const world = world_with_floor();
        const ragdoll = hero.ragdoll(world, { scatter: true, seed: 7 });
        expect(ragdoll.is_scattered).toBe(true);
        for (let frame = 0; frame < 30; frame++) {
            world.update(1 / 60);
            hero.update(1 / 60);
        }
        const shin = hero.rig.bone_index("shin_r");
        const thigh = hero.rig.bone_index("thigh_r");
        const knee = hero.skeleton.world_point(
            thigh,
            hero.skeleton.lengths[thigh],
            0,
        );
        const apart = Math.hypot(
            hero.skeleton.world_x(shin) - knee.x,
            hero.skeleton.world_y(shin) - knee.y,
        );
        expect(apart).toBeGreaterThan(10);
        // Each part keeps its length.
        expect(ragdoll.stretch().length).toBeLessThan(1);
        const soft = soft_figure().puppet("run");
        soft.update(1 / 60);
        expect(
            soft.ragdoll(world_with_floor(), { scatter: true }).is_scattered,
        ).toBe(false);
    });

    it("gets up: the bodies go, the pose blends back into the clip", () => {
        const rig = soft_figure();
        const hero = rig.puppet("idle");
        hero.place(300, GROUND, { scale: 0.5 });
        hero.update(1 / 60);
        const world = world_with_floor();
        hero.ragdoll(world, { push: { bone: "torso", x: -300, y: 0 } });
        for (let frame = 0; frame < 120; frame++) {
            world.update(1 / 60);
            hero.update(1 / 60);
        }
        const stand = hero.get_up("idle", { fade: 0.5, y: GROUND })!;
        expect(stand.y).toBe(GROUND);
        expect(hero.placement.x).toBe(stand.x);
        expect(world.bodies.length).toBe(1);
        expect(hero.ragdolled).toBeNull();
        hero.update(0.25);
        const halfway = hero.skeleton.rotation[rig.bone_index("torso")];
        hero.update(0.3);
        // Done: the pose is the clip's own.
        const plain = rig.puppet("idle");
        plain.update(0.55);
        for (let bone = 0; bone < rig.bone_count; bone++) {
            expect(hero.skeleton.rotation[bone]).toBeCloseTo(
                plain.skeleton.rotation[bone],
                9,
            );
        }
        expect(Number.isFinite(halfway)).toBe(true);
        expect(hero.get_up("idle")).toBeNull();
    });

    it("takes its limits from the clips, the rig's own where it names them", () => {
        const rig = cut_out();
        const limits = ragdoll_limits(rig);
        const shin = rig.bone_index("shin_r");
        // The run bends the knee by more than 100 degrees: its range with 25 to spare.
        const [low, high] = limits.get(shin)!;
        expect(low).toBeLessThanOrEqual(-25);
        expect(high).toBeGreaterThanOrEqual(100 + 25);
        const named = PuppetRig.from_data({
            ...rig.data!,
            limits: { shin_r: [0, 140] },
        });
        expect(ragdoll_limits(named).get(shin)).toEqual([0, 140]);
        expect(PuppetRagdoll).toBeDefined();
    });
});
