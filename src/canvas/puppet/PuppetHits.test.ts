import { describe, expect, it } from "vitest";
import { Puppet } from "./Puppet";
import { FLINCH_STEP } from "./PuppetHits";
import { PuppetRig } from "./PuppetRig";
import { RigData } from "./RigData";
import { rig_from_picture } from "./RigPicture";
import { SKELETON_TEMPLATES } from "./SkeletonTemplate";
import { RgbaPixels } from "./SoftMesh";
import { draw_figure, WANDERER } from "./test-data/figure";

/** A drawn Zweibeiner (step 43's way): five layers of capsules, rigged as a soft skin, with its atlas's pixels. */
function drawn_figure(): { rig: PuppetRig; pixels: RgbaPixels } {
    const figure = draw_figure(SKELETON_TEMPLATES.zweibeiner);
    const made = rig_from_picture({
        layers: figure.layers,
        joints: figure.joints,
        template: SKELETON_TEMPLATES.zweibeiner,
        keyed_clips: WANDERER,
    });
    const rig = PuppetRig.from_data(made.rig);
    rig.soft_skin!.pixels = made.pixels;
    return { rig, pixels: made.pixels };
}

/** The puppet at its rest pose. */
function at_rest(rig: PuppetRig): Puppet {
    const puppet = rig.puppet();
    puppet.skeleton.reset_pose();
    puppet.skeleton.update();
    return puppet;
}

/** Every opaque pixel of a soft skin at rest, in the puppet's space, and a mask of where any is. */
function drawn_points(rig: PuppetRig, pixels: RgbaPixels) {
    const soft = rig.soft_skin!;
    const points: [number, number][] = [];
    for (const picture of soft.data.pictures) {
        const [left, top, width, height] = picture.rect;
        for (let v = 0; v < height; v += 3) {
            for (let u = 0; u < width; u += 3) {
                if (
                    pixels.data[
                        ((top + v) * pixels.width + left + u) * 4 + 3
                    ] >= 128
                ) {
                    points.push([
                        (u + 0.5 - picture.origin[0]) / soft.resolution,
                        (v + 0.5 - picture.origin[1]) / soft.resolution,
                    ]);
                }
            }
        }
    }
    const is_drawn = (x: number, y: number) =>
        soft.data.pictures.some((picture) => {
            const u = Math.floor(x * soft.resolution + picture.origin[0]);
            const v = Math.floor(y * soft.resolution + picture.origin[1]);
            const [left, top, width, height] = picture.rect;
            return (
                u >= 0 &&
                v >= 0 &&
                u < width &&
                v < height &&
                pixels.data[((top + v) * pixels.width + left + u) * 4 + 3] >=
                    128
            );
        });
    return { points, is_drawn };
}

/** The small stick puppet of Puppet.test: a torso and an arm of two parts (rectangles, no pixels). */
const STICK: RigData = {
    skeleton: "stick",
    bones: [
        { name: "root" },
        { name: "hip", parent: "root", y: -100, rotation: -90, length: 10 },
        { name: "torso", parent: "hip", rotation: 0, length: 50 },
        { name: "upper", parent: "torso", x: 50, rotation: 180, length: 30 },
        { name: "lower", parent: "upper", x: 30, length: 30 },
    ],
    slots: [
        { name: "torso", bone: "torso" },
        { name: "upper", bone: "upper" },
        { name: "lower", bone: "lower" },
    ],
    skins: {
        plain: {
            attachments: {
                torso: { rect: [0, 0, 20, 60], pivot: [10, 55], rotation: 90 },
                upper: { rect: [20, 0, 10, 36], pivot: [5, 3], rotation: -90 },
                lower: { rect: [30, 0, 10, 36], pivot: [5, 3], rotation: -90 },
            },
        },
    },
    clips: {
        idle: {
            length: 1,
            loop: true,
            tracks: { torso: [{ t: 0, rotation: 0 }] },
        },
    },
};

describe("hit capsules", () => {
    it("give a soft skin's bones capsules that cover the picture and little air", () => {
        const { rig, pixels } = drawn_figure();
        const puppet = at_rest(rig);
        const names = puppet.hit_shapes.map((capsule) => capsule.name);
        expect(names).toEqual(
            expect.arrayContaining([
                "head",
                "torso",
                "thigh_r",
                "shin_l",
                "upper_arm_r",
            ]),
        );
        const { points, is_drawn } = drawn_points(rig, pixels);
        const missed = points.filter(
            ([x, y]) => puppet.hit_at(x, y) === null,
        ).length;
        expect(missed / points.length).toBeLessThan(0.08);
        // A grid over the figure's box: of the points inside some capsule, few are on no picture.
        let inside = 0;
        let air = 0;
        for (let y = -500; y < 10; y += 4) {
            for (let x = -260; x < 260; x += 4) {
                if (puppet.hit_at(x, y) === null) {
                    continue;
                }
                inside += 1;
                if (!is_drawn(x, y)) {
                    air += 1;
                }
            }
        }
        expect(inside).toBeGreaterThan(500);
        expect(air / inside).toBeLessThan(0.08);
    });

    it("a bolt through the head hits the head, not the torso behind it", () => {
        const { rig } = drawn_figure();
        const puppet = at_rest(rig);
        puppet.place(300, 600, { scale: 0.5, flip_x: true });
        const head = puppet.hit_shapes.find(
            (capsule) => capsule.name === "head",
        )!;
        const middle = puppet.skeleton.world_point(
            head.bone,
            (head.from + head.to) / 2,
            head.across,
        );
        const at = puppet.local_to_world(middle.x, middle.y);
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0.8, 0.6],
            [-0.6, 0.8],
        ]) {
            const hit = puppet.ray_hit(
                { x: at.x - dx * 400, y: at.y - dy * 400 },
                { x: at.x + dx * 400, y: at.y + dy * 400 },
            );
            expect(hit?.name).toBe("head");
            // The hit lies on the near side, with the normal facing the bolt.
            expect(hit!.t).toBeGreaterThan(0);
            expect(hit!.t).toBeLessThan(0.5);
            expect(hit!.normal.x * dx + hit!.normal.y * dy).toBeLessThan(0);
        }
        // Over the head: nothing.
        expect(
            puppet.ray_hit(
                { x: at.x - 400, y: at.y - 200 },
                { x: at.x + 400, y: at.y - 200 },
            ),
        ).toBeNull();
        // Into the belly: the torso.
        const torso = puppet.hit_shapes.find(
            (capsule) => capsule.name === "torso",
        )!;
        const belly = puppet.skeleton.world_point(
            torso.bone,
            torso.from + 4,
            torso.across,
        );
        const belly_at = puppet.local_to_world(belly.x, belly.y);
        expect(
            puppet.ray_hit(
                { x: belly_at.x - 300, y: belly_at.y },
                { x: belly_at.x + 300, y: belly_at.y },
            )?.name,
        ).toBe("torso");
        expect(puppet.hit_at(at.x, at.y)?.name).toBe("head");
        expect(
            puppet.overlaps({ x: at.x, y: at.y - 40, radius: 30 })?.name,
        ).toBe("head");
        expect(
            puppet.overlaps({ x: at.x, y: at.y - 200, radius: 30 }),
        ).toBeNull();
    });

    it("count a cut-out part's rectangle without pixels, the part on top first", () => {
        const puppet = at_rest(PuppetRig.from_data(STICK));
        expect(puppet.hit_shapes.map((capsule) => capsule.name)).toEqual([
            "torso",
            "upper",
            "lower",
        ]);
        // The arm hangs over the torso from its top: the arm is drawn on top.
        expect(puppet.hit_at(0, -140)?.name).toBe("upper");
        expect(puppet.hit_at(8, -112)?.name).toBe("torso");
        expect(puppet.hit_at(40, -112)).toBeNull();
        // With the atlas's pixels: transparent pixels don't count.
        const rig = PuppetRig.from_data(STICK);
        const data = new Uint8Array(40 * 60 * 4);
        for (let y = 0; y < 60; y++) {
            for (let x = 0; x < 40; x++) {
                // Each part's left half drawn.
                const inside = x < 20 ? x < 10 : x < 30 ? x < 25 : x < 35;
                data[(y * 40 + x) * 4 + 3] = inside ? 255 : 0;
            }
        }
        rig.skin()!.pixels = { width: 40, height: 60, data };
        const halves = at_rest(rig);
        const torso = halves.hit_shapes.find(
            (capsule) => capsule.name === "torso",
        )!;
        expect(torso.radius).toBeLessThan(6);
        expect(torso.across).toBeLessThan(0);
    });
});

describe("flinch", () => {
    /** The head's flinch after `seconds` of updates at `fps`. */
    function flinched(
        fps: number,
        seconds: number,
    ): { offset: number; most: number } {
        const { rig } = drawn_figure();
        const puppet = rig.puppet("idle");
        puppet.player.paused = true;
        puppet.update(0);
        expect(puppet.flinch("head", { x: 1, y: 0 }, 1)).toBe(true);
        const head = rig.bone_index("head");
        let most = 0;
        const frames = Math.round(seconds * fps);
        for (let frame = 0; frame < frames; frame++) {
            puppet.update(1 / fps);
            most = Math.max(most, Math.abs(puppet.flinches.offset(head)));
        }
        return { offset: puppet.flinches.offset(head), most };
    }

    it("springs back to zero at any frame rate", () => {
        const slow = flinched(30, 1.5);
        const fast = flinched(144, 1.5);
        expect(slow.most).toBeGreaterThan(5);
        expect(slow.offset).toBe(0);
        expect(fast.offset).toBe(0);
        // Half a second in, both have stepped the same fixed steps.
        const steps = Math.floor(0.5 / FLINCH_STEP + 1e-9);
        expect(steps).toBe(120);
        const at_30 = flinched(30, 0.5).offset;
        expect(Math.abs(at_30)).toBeGreaterThan(0.01);
        expect(flinched(120, 0.5).offset).toBeCloseTo(at_30, 9);
        expect(flinched(144, 0.5).offset).toBeCloseTo(at_30, 9);
    });

    it("turns the bone with the push, the parent half as much, and leaves the root", () => {
        const { rig } = drawn_figure();
        const puppet = rig.puppet("idle");
        puppet.player.paused = true;
        puppet.update(0);
        const head = rig.bone_index("head");
        const torso = rig.bone_index("torso");
        const before = puppet.skeleton.world_rotation(head);
        // The head points up; pushed forward (+x) at its tip it turns clockwise.
        puppet.flinch("head", { x: 1, y: 0 }, 1);
        puppet.update(1 / 30);
        expect(puppet.skeleton.world_rotation(head)).toBeGreaterThan(
            before + 1,
        );
        expect(puppet.flinches.offset(torso)).toBeCloseTo(
            puppet.flinches.offset(head) / 2,
            6,
        );
        expect(puppet.flinches.offset(0)).toBe(0);
        // Mirrored, a push forward on the screen (-x) is the same turn.
        const mirrored = rig.puppet("idle");
        mirrored.place(0, 0, { flip_x: true });
        mirrored.player.paused = true;
        mirrored.update(0);
        mirrored.flinch("head", { x: -1, y: 0 }, 1);
        mirrored.update(1 / 30);
        expect(mirrored.flinches.offset(head)).toBeCloseTo(
            puppet.flinches.offset(head),
            9,
        );
        expect(puppet.flinch("tail", { x: 1, y: 0 })).toBe(false);
    });
});
