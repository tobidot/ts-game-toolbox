/* eslint-disable @typescript-eslint/naming-convention -- pack keys ("far#map") and file names ("parts/eye.png") are data */
import { describe, expect, it } from "vitest";
import { PartKitData } from "./PartKit";
import { MarkSheetData, RigData, WardrobeData } from "./RigData";
import {
    blank_pixels,
    copy_pixels,
    pack_boxes,
    rig_from_picture,
} from "./RigPicture";
import {
    build_rig_source,
    DrawnSourceData,
    drawn_layer_files,
    kit_from_pictures,
    KitSourceData,
    pixel_difference,
    RIG_SOURCE_FORMAT,
    rig_source_kind,
    split_rig_atlas,
} from "./RigSource";
import { joints_of_fit, SKELETON_TEMPLATES } from "./SkeletonTemplate";
import { RgbaPixels } from "./SoftMesh";
import { draw_figure } from "./test-data/figure";

/** A block of one colour with a darker edge, `width` x `height`. */
function block(width: number, height: number, seed: number): RgbaPixels {
    const pixels = blank_pixels(width, height);
    const data = pixels.data as Uint8Array;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            const edge =
                x === 0 || y === 0 || x === width - 1 || y === height - 1;
            data[at] = edge ? 20 : (seed * 53 + x * 3) % 256;
            data[at + 1] = edge ? 20 : (seed * 97 + y * 5) % 256;
            data[at + 2] = edge ? 20 : (seed * 31) % 256;
            data[at + 3] = (x + y) % 7 === 0 ? 128 : 255;
        }
    }
    return pixels;
}

/** Packs named blocks as a Blender script would: the atlas and each one's rectangle. */
function atlas_of(sizes: Record<string, [number, number]>, width: number) {
    const { places, height } = pack_boxes(sizes, width);
    const atlas = blank_pixels(width, height);
    const rects: Record<string, [number, number, number, number]> = {};
    for (const [index, [name, [w, h]]] of Object.entries(sizes).entries()) {
        const [x, y] = places[name];
        copy_pixels(block(w, h, index + 1), [0, 0, w, h], atlas, x, y);
        rects[name] = [x, y, w, h];
    }
    return { atlas, rects };
}

describe("source folders", () => {
    it("a cut-out puppet's atlas splits into one picture per part and builds back into the same rig and pixels", () => {
        const { atlas, rects } = atlas_of(
            {
                torso: [40, 90],
                head: [44, 50],
                torso_skin: [40, 90],
                leg: [20, 70],
            },
            128,
        );
        const rig: RigData = {
            skeleton: "test",
            facing: "right",
            bones: [
                { name: "root" },
                { name: "torso", parent: "root", rotation: -90, length: 80 },
                { name: "head", parent: "torso", x: 80, length: 40 },
            ],
            slots: [
                { name: "torso", bone: "torso" },
                { name: "head", bone: "head" },
                { name: "leg", bone: "root" },
            ],
            skins: {
                test: {
                    attachments: {
                        torso: {
                            rect: rects.torso,
                            pivot: [20, 85],
                            rotation: 90,
                            layers: { skin: rects.torso_skin },
                        },
                        head: {
                            rect: rects.head,
                            pivot: [22, 48],
                            rotation: 90,
                        },
                        leg: { rect: rects.leg, pivot: [10, 2] },
                    },
                },
            },
            default_skin: "test",
            clips: {
                idle: {
                    length: 1,
                    loop: true,
                    tracks: {
                        head: [
                            { t: 0, rotation: 0 },
                            { t: 1, rotation: 5 },
                        ],
                    },
                },
            },
        };
        const { source, files } = split_rig_atlas(rig, atlas);
        expect(source.kind).toBe("parts");
        expect(Object.keys(files).sort()).toEqual([
            "parts/head.png",
            "parts/leg.png",
            "parts/torso.png",
            "parts/torso.skin.png",
        ]);
        const json = JSON.parse(JSON.stringify(source));
        expect(JSON.stringify(json)).not.toContain('"rect"');
        const built = build_rig_source(json, (file) => files[file] ?? null);
        expect(JSON.stringify(built.rig)).toBe(JSON.stringify(rig));
        expect(pixel_difference(built.pixels, atlas)).toBe(0);
    });

    it("a soft skin, a wardrobe, a mark sheet and a part kit round-trip the same way", () => {
        const soft = atlas_of(
            {
                far: [30, 60],
                "far#map": [30, 60],
                body: [60, 80],
                "body#map": [60, 80],
            },
            256,
        );
        const soft_rig: RigData = {
            skeleton: "beastly",
            bones: [
                { name: "root" },
                { name: "spine", parent: "root", length: 50 },
            ],
            slots: [{ name: "spine", bone: "spine" }],
            skins: {
                beast: {
                    attachments: {},
                    soft: {
                        pictures: [
                            {
                                name: "far",
                                rect: soft.rects.far,
                                map: soft.rects["far#map"],
                                origin: [10, 58],
                            },
                            {
                                name: "body",
                                rect: soft.rects.body,
                                map: soft.rects["body#map"],
                                origin: [30, 78],
                            },
                        ],
                        colors: { spine: "#ff0000" },
                        cell_size: 12,
                        blur: 20,
                    },
                },
            },
        };
        const wardrobe = atlas_of(
            {
                "hat:crown": [30, 20],
                "coat:body": [40, 60],
                "coat:sleeve": [16, 40],
            },
            128,
        );
        const wardrobe_rig: WardrobeData = {
            skeleton: "test",
            places: { hat: 0, top: 1 },
            pieces: {
                hat: {
                    place: "hat",
                    title: "Hut",
                    parts: [
                        {
                            name: "crown",
                            anchor: "head_top",
                            rect: wardrobe.rects["hat:crown"],
                            pivot: [15, 18],
                        },
                    ],
                },
                coat: {
                    place: "top",
                    parts: [
                        {
                            name: "body",
                            bone: "torso",
                            rect: wardrobe.rects["coat:body"],
                            pivot: [20, 58],
                            rotation: 90,
                        },
                        {
                            name: "sleeve",
                            bone: "arm",
                            rect: wardrobe.rects["coat:sleeve"],
                            pivot: [8, 2],
                            behind: "torso",
                        },
                    ],
                },
            },
        };
        const marks = atlas_of({ star: [20, 20], scar: [30, 10] }, 64);
        const marks_rig: MarkSheetData = {
            marks: {
                star: {
                    rect: marks.rects.star,
                    pivot: [10, 10],
                    title: "Stern",
                    kind: "tattoo",
                },
                scar: {
                    rect: marks.rects.scar,
                    pivot: [15, 5],
                    title: "Narbe",
                    kind: "scar",
                    blend: "normal",
                },
            },
            resolution: 2,
        };
        const kit = atlas_of(
            {
                head: [50, 40],
                "head#mask": [50, 40],
                jaw: [30, 14],
                "jaw#mask": [30, 14],
            },
            256,
        );
        const kit_rig: PartKitData = {
            kinds: ["quadruped"],
            parts: {
                head: {
                    role: "head",
                    title: "Kopf",
                    rect: kit.rects.head,
                    mask: kit.rects["head#mask"],
                    pivot: [4, 20],
                    tip: [46, 20],
                    points: { jaw: [20, 30] },
                    jaw: "jaw",
                },
                jaw: {
                    role: "jaw",
                    rect: kit.rects.jaw,
                    mask: kit.rects["jaw#mask"],
                    pivot: [2, 7],
                    tip: [28, 7],
                },
            },
        };
        for (const [rig, atlas, kind] of [
            [soft_rig, soft.atlas, "picture"],
            [wardrobe_rig, wardrobe.atlas, "wardrobe"],
            [marks_rig, marks.atlas, "marks"],
            [kit_rig, kit.atlas, "kit"],
        ] as const) {
            expect(rig_source_kind(rig)).toBe(kind);
            const { source, files } = split_rig_atlas(rig, atlas);
            const built = build_rig_source(
                JSON.parse(JSON.stringify(source)),
                (file) => files[file] ?? null,
            );
            expect(JSON.stringify(built.rig)).toBe(JSON.stringify(rig));
            expect(pixel_difference(built.pixels, atlas)).toBe(0);
        }
    });

    it("kit parts from single pictures make a PartKit with its pixels", () => {
        const source: KitSourceData = {
            format: RIG_SOURCE_FORMAT,
            version: 1,
            kind: "kit",
            kinds: ["worm"],
            parts: {
                segment: {
                    role: "segment",
                    title: "Glied",
                    pivot: [2, 10],
                    tip: [38, 10],
                },
                eye: { role: "eye", pivot: [5, 5], tip: [9, 5] },
            },
        };
        const files: Record<string, RgbaPixels> = {
            "parts/segment.png": block(40, 20, 1),
            "parts/segment.tint.png": block(40, 20, 2),
            "parts/eye.png": block(10, 10, 3),
            "parts/eye.tint.png": block(10, 10, 4),
        };
        const { kit, data, pixels } = kit_from_pictures(
            source,
            (file) => files[file] ?? null,
        );
        expect(kit.is_ready).toBe(true);
        expect(kit.parts_of("segment", "worm").map((part) => part.id)).toEqual([
            "segment",
        ]);
        const segment = data.parts.segment;
        expect(segment.rect[2]).toBe(40);
        expect(segment.mask[3]).toBe(20);
        expect(Object.keys(segment)).toEqual([
            "role",
            "title",
            "rect",
            "mask",
            "pivot",
            "tip",
        ]);
        // The part's pixels are in the atlas at its rectangle.
        const [x, y] = segment.rect;
        expect(pixels.data[(y * pixels.width + x + 5) * 4 + 3]).toBe(
            files["parts/segment.png"].data[5 * 4 + 3],
        );
        // A mask of another size is refused.
        files["parts/eye.tint.png"] = block(12, 10, 4);
        expect(() =>
            kit_from_pictures(source, (file) => files[file] ?? null),
        ).toThrow(/as large as parts\/eye\.png/);
        delete files["parts/eye.png"];
        expect(() =>
            kit_from_pictures(source, (file) => files[file] ?? null),
        ).toThrow(/no parts\/eye\.png/);
    });

    it("a drawing's layers come from the file names: rest.png alone, or numbered back to front", () => {
        expect(
            drawn_layer_files(["rig.json", "rest.png", "bones.png"]),
        ).toEqual([
            { name: "body", file: "rest.png", map: "bones.png", tint: null },
        ]);
        expect(
            drawn_layer_files([
                "rig.json",
                "3-front.png",
                "1-back.png",
                "2-body.png",
                "2-body.tint.png",
                "1-back.bones.png",
                "10-cape.png",
            ]).map((layer) => [layer.name, layer.map, layer.tint]),
        ).toEqual([
            ["back", "1-back.bones.png", null],
            ["body", null, "2-body.tint.png"],
            ["front", null, null],
            ["cape", null, null],
        ]);
    });
    it("a rig round-trips through rig.json", () => {
        const template = SKELETON_TEMPLATES.vierbeiner;
        const figure = draw_figure(template, { size: [600, 400] });
        const made = rig_from_picture({
            layers: figure.layers,
            joints: figure.joints,
            template,
            name: "hund",
        });
        const source: DrawnSourceData = JSON.parse(
            JSON.stringify({
                format: RIG_SOURCE_FORMAT,
                version: 1,
                kind: "picture",
                template: "vierbeiner",
                name: "hund",
                joints: joints_of_fit(made.fitted),
                ground: made.fitted.ground,
                layers: Object.fromEntries(
                    figure.layers
                        .filter((layer) => layer.bones !== null)
                        .map((layer) => [layer.name, layer.bones]),
                ),
            }),
        );
        const files: Record<string, RgbaPixels> = {};
        figure.layers.forEach((layer, index) => {
            files[`${index + 1}-${layer.name}.png`] = layer.pixels;
        });
        const built = build_rig_source(source, (file) => files[file] ?? null, {
            files: Object.keys(files),
        });
        expect(built.rig).toEqual(made.rig);
        expect(pixel_difference(built.pixels, made.pixels)).toBe(0);
        // A layer moved in the folder (`offsets`) builds as rig_from_picture with that offset.
        const first = figure.layers[0].name;
        const moved_source: DrawnSourceData = {
            ...source,
            offsets: { [first]: [3, -2] },
        };
        const moved = build_rig_source(
            moved_source,
            (file) => files[file] ?? null,
            { files: Object.keys(files) },
        );
        const expected = rig_from_picture({
            layers: figure.layers.map((layer, index) =>
                index === 0 ? { ...layer, offset: [3, -2] as const } : layer,
            ),
            joints: source.joints,
            template: "vierbeiner",
            ground: source.ground,
            name: "hund",
        });
        expect(moved.rig).toEqual(expected.rig);
        expect(pixel_difference(moved.pixels, expected.pixels)).toBe(0);
        expect(pixel_difference(moved.pixels, made.pixels)).toBeGreaterThan(0);
    });
});
