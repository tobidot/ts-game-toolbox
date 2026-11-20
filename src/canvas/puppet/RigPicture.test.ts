import { describe, expect, it } from "vitest";
import { PuppetClip } from "./PuppetClip";
import { PuppetRig } from "./PuppetRig";
import {
    blank_pixels,
    carry_clips,
    drawing_from_rig,
    drawn_box,
    pack_boxes,
    rig_from_picture,
} from "./RigPicture";
import {
    fit_template,
    SKELETON_TEMPLATE_NAMES,
    SKELETON_TEMPLATES,
    template_joints,
    template_point,
} from "./SkeletonTemplate";
import { Skeleton } from "./Skeleton";
import { parse_hex_color } from "./SoftMesh";
import {
    capsule,
    draw_figure,
    LAYER_COLOURS,
    lowest_sole,
    WANDERER,
} from "./test-data/figure";

describe("rig_from_picture", () => {
    it("a picture rigged on the biped template plays step 38's run with its feet on the ground", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        // Longer legs and a shorter body than the wanderer, drawn a little larger.
        const figure = draw_figure(template, {
            scale: 1.1,
            stretch: {
                knee_l: [4, 6],
                knee_r: [6, 8],
                ankle_l: [0, 10],
                ankle_r: [0, 10],
                toe_l: [0, 10],
                toe_r: [0, 10],
            },
            size: [560, 560],
        });
        const made = rig_from_picture({
            layers: figure.layers,
            joints: figure.joints,
            template,
            ground: figure.ground + 10,
            keyed_clips: WANDERER,
        });
        const rig = made.rig;
        expect(Object.keys(rig.clips!)).toEqual(
            expect.arrayContaining([
                "idle",
                "walk",
                "run",
                "jump",
                "bite",
                "fire",
                "claw",
            ]),
        );
        const skeleton = Skeleton.from_data(rig.bones);
        const run = PuppetClip.from_data(
            "run",
            rig.clips!.run,
            (bone) => skeleton.index_of(bone),
            skeleton.count,
        );
        const source = Skeleton.from_data(WANDERER.bones);
        const source_run = PuppetClip.from_data(
            "run",
            WANDERER.clips!.run,
            (bone) => source.index_of(bone),
            source.count,
        );
        const soles = template.soles;
        for (const key of WANDERER.clips!.run.tracks.hip) {
            skeleton.reset_pose();
            run.sample(key.t, skeleton);
            skeleton.update();
            source.reset_pose();
            source_run.sample(key.t, source);
            source.update();
            const source_lowest = lowest_sole(source, WANDERER, soles);
            const lowest = lowest_sole(skeleton, rig, soles);
            if (Math.abs(source_lowest) < 0.5) {
                // A foot stood on the ground there: it stands on it here, within a pixel.
                expect(Math.abs(lowest)).toBeLessThan(1);
            } else {
                // In the air there, in the air here (a run's flight).
                expect(lowest).toBeLessThan(0);
            }
        }
        // Both steps of the run (0 and 0.32 s) have a foot down.
        for (const t of [0, 0.32]) {
            skeleton.reset_pose();
            run.sample(t, skeleton);
            skeleton.update();
            expect(Math.abs(lowest_sole(skeleton, rig, soles))).toBeLessThan(1);
        }
        expect(rig.clips!.run.travel).toBeGreaterThan(
            WANDERER.clips!.run.travel!,
        );
    });

    it("a layer limited to the far leg never binds to the near leg", () => {
        const template = SKELETON_TEMPLATES.zweibeiner;
        const figure = draw_figure(template);
        // The far leg's layer drawn right over the near leg: the same place.
        const back = blank_pixels(520, 520);
        const joints = { ...figure.joints };
        for (const side of ["hip", "knee", "ankle", "toe"]) {
            joints[`${side}_l`] = [...joints[`${side}_r`]];
        }
        for (const bone of ["thigh_l", "shin_l", "foot_l"]) {
            const data = template.bones.find((each) => each.name === bone)!;
            capsule(
                back,
                template_point(data.from, joints),
                template_point(data.to, joints),
                12,
                LAYER_COLOURS.back,
            );
        }
        const far_leg = ["thigh_l", "shin_l", "foot_l"];
        const made = rig_from_picture({
            layers: [
                { name: "back", pixels: back, bones: far_leg },
                ...figure.layers.filter((layer) => layer.name !== "far_leg"),
            ],
            joints,
            template,
        });
        const soft = made.rig.skins.drawn.soft!;
        const map = made.maps[0];
        const allowed = far_leg.map((bone) =>
            parse_hex_color(soft.colors![bone])!.join(","),
        );
        let counted = 0;
        for (let at = 0; at < map.data.length; at += 4) {
            if (map.data[at + 3] === 0) {
                continue;
            }
            counted += 1;
            expect(allowed).toContain(
                `${map.data[at]},${map.data[at + 1]},${map.data[at + 2]}`,
            );
        }
        expect(counted).toBeGreaterThan(500);
        expect(soft.pictures[0].bones).toEqual(far_leg);
        // And the soft mesh binds its points to those bones only.
        const puppet_rig = PuppetRig.from_data(made.rig);
        puppet_rig.image = {
            width: made.pixels.width,
            height: made.pixels.height,
        } as unknown as CanvasImageSource;
        const skin = puppet_rig.soft_skin!;
        skin.pixels = made.pixels;
        const mesh = skin.mesh(skin.cell_size)!;
        const near = ["thigh_r", "shin_r", "foot_r"].map((bone) =>
            puppet_rig.bone_index(bone),
        );
        const [rx, ry, rw, rh] = soft.pictures[0].rect;
        let checked = 0;
        for (let point = 0; point < mesh.count; point++) {
            const u = mesh.uv[point * 2];
            const v = mesh.uv[point * 2 + 1];
            if (u < rx || u > rx + rw || v < ry || v > ry + rh) {
                continue;
            }
            checked += 1;
            for (let k = 0; k < 4; k++) {
                if (mesh.weights[point * 4 + k] > 0) {
                    expect(near).not.toContain(mesh.bones[point * 4 + k]);
                }
            }
        }
        expect(checked).toBeGreaterThan(10);
    });

    it("every kind gets its gaits and attacks, and pictures packed with their maps", () => {
        for (const name of SKELETON_TEMPLATE_NAMES) {
            const template = SKELETON_TEMPLATES[name];
            const figure = draw_figure(template, { size: [600, 520] });
            const made = rig_from_picture({
                layers: figure.layers,
                joints: figure.joints,
                template,
            });
            const clips = Object.keys(made.rig.clips!);
            expect(clips).toEqual(
                expect.arrayContaining(["idle", "walk", "run", "bite", "fire"]),
            );
            if (name !== "wurm") {
                expect(clips).toContain("claw");
            }
            const soft = made.rig.skins.drawn.soft!;
            expect(soft.pictures.length).toBe(template.layers.length);
            for (const picture of soft.pictures) {
                expect(picture.map![2]).toBe(picture.rect[2]);
                expect(picture.rect[0] + picture.rect[2]).toBeLessThanOrEqual(
                    made.pixels.width,
                );
            }
            expect(made.rig.skeleton).toBe(template.skeleton);
            // It plays: a puppet from the rig runs every clip.
            const rig = PuppetRig.from_data(made.rig);
            const puppet = rig.puppet("idle");
            for (const clip of clips) {
                puppet.player.play(clip, { fade: 0 });
                puppet.update(0.3);
            }
        }
    });

    it("the ground defaults to the lowest drawn row, and a layer of another size is refused", () => {
        const template = SKELETON_TEMPLATES.wurm;
        const figure = draw_figure(template, { size: [600, 200] });
        const made = rig_from_picture({
            layers: figure.layers,
            joints: figure.joints,
            template,
        });
        const box = drawn_box(figure.layers[0].pixels, 0)!;
        expect(made.fitted.ground).toBe(box[1] + box[3]);
        expect(() =>
            rig_from_picture({
                layers: [
                    figure.layers[0],
                    { name: "more", pixels: blank_pixels(10, 10) },
                ],
                joints: figure.joints,
                template,
            }),
        ).toThrow(/all layers must be as large/);
    });

    it("a built character opens again from its rig and atlas and rigs the same", () => {
        const template = SKELETON_TEMPLATES.flieger;
        const figure = draw_figure(template, { size: [640, 560] });
        const layers = figure.layers.map((layer, index) =>
            index === 0 ? { ...layer, map: null } : layer,
        );
        const made = rig_from_picture({
            layers,
            joints: figure.joints,
            template,
            name: "drache",
        });
        expect(made.rig.drawing!.template).toBe("flieger");
        expect(made.rig.drawing!.size).toEqual([640, 560]);
        const opened = drawing_from_rig(made.rig, made.pixels)!;
        expect(opened.name).toBe("drache");
        expect(opened.layers.map((layer) => layer.name)).toEqual(
            figure.layers.map((layer) => layer.name),
        );
        for (const [index, layer] of opened.layers.entries()) {
            expect(Array.from(layer.pixels.data)).toEqual(
                Array.from(figure.layers[index].pixels.data),
            );
        }
        const again = rig_from_picture({
            ...opened,
            template: opened.template,
        });
        expect(again.rig).toEqual(made.rig);
        // A rig that was not drawn has nothing to open.
        expect(
            drawing_from_rig({ ...made.rig, drawing: undefined }, made.pixels),
        ).toBeNull();
    });

    it("carry_clips leaves out clips on bones the skeleton lacks", () => {
        const fitted = fit_template(
            SKELETON_TEMPLATES.vierbeiner,
            template_joints(SKELETON_TEMPLATES.vierbeiner, { origin: [0, 0] }),
            0,
        );
        expect(carry_clips(WANDERER, fitted)).toEqual({});
    });

    it("packs as the Blender scripts do: tallest first, ties by name, rows of 4", () => {
        const { places, height } = pack_boxes(
            { b: [10, 20], a: [10, 20], c: [100, 30], d: [500, 8] },
            128,
        );
        expect(places).toEqual({
            c: [4, 4],
            a: [108, 4],
            b: [4, 38],
            d: [4, 62],
        });
        expect(height).toBe(76);
    });
});
