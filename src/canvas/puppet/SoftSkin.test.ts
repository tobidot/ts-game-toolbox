/* eslint-disable @typescript-eslint/naming-convention -- the fake context and canvases speak the DOM's names */
import { describe, expect, it } from "vitest";
import { PuppetJiggle } from "./PuppetJiggle";
import { PuppetRig } from "./PuppetRig";
import { RigData, SoftSkinData } from "./RigData";
import { Skeleton } from "./Skeleton";
import {
    skin_point_as_shader,
    soft_row_texels,
    write_soft_row,
} from "./SoftGpu";
import { SoftLayer } from "./SoftLayer";
import {
    rest_inverse_of,
    RgbaPixels,
    skin_points,
    soft_matrices,
    SoftMesh,
} from "./SoftMesh";

/**
 * A little two-legged creature in an 80 x 80 atlas: the picture (40 x 80) on the left, its bone
 * map beside it. The root is at the picture's pixel (20, 80), the feet; the body is a block on
 * top, the legs hang from it with a gap of 4 pixels between them.
 */
const HIP_COLOR: [number, number, number] = [220, 40, 40];
const LEFT_COLOR: [number, number, number] = [40, 200, 40];
const RIGHT_COLOR: [number, number, number] = [40, 40, 220];

function make_pixels(): RgbaPixels {
    const width = 80;
    const height = 80;
    const data = new Uint8ClampedArray(width * height * 4);
    const paint = (
        left: number,
        top: number,
        right: number,
        bottom: number,
        color: readonly number[],
    ) => {
        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                // The picture: a shade by place, so a wrong pixel shows.
                const at = (y * width + x) * 4;
                data[at] = 100 + x;
                data[at + 1] = 60 + y;
                data[at + 2] = 90;
                data[at + 3] = 255;
                // The map, 40 pixels to the right.
                const map = (y * width + x + 40) * 4;
                data[map] = color[0];
                data[map + 1] = color[1];
                data[map + 2] = color[2];
                data[map + 3] = 255;
            }
        }
    };
    paint(8, 0, 32, 24, HIP_COLOR);
    paint(10, 24, 18, 80, LEFT_COLOR);
    paint(22, 24, 30, 80, RIGHT_COLOR);
    return { width, height, data };
}

const SOFT: SoftSkinData = {
    pictures: [
        {
            name: "whole",
            rect: [0, 0, 40, 80],
            map: [40, 0, 40, 80],
            origin: [20, 80],
        },
    ],
    colors: { hip: "#dc2828", leg_l: "#28c828", leg_r: "#2828dc" },
    cell_size: 4,
    cpu_cell_size: 8,
    blur: 2,
};

function rig_data(soft: SoftSkinData = SOFT): RigData {
    return {
        skeleton: "two-legs",
        bones: [
            { name: "root", length: 10 },
            { name: "hip", parent: "root", y: -56, rotation: -90, length: 24 },
            { name: "leg_l", parent: "hip", y: -6, rotation: 180, length: 56 },
            { name: "leg_r", parent: "hip", y: 6, rotation: 180, length: 56 },
        ],
        slots: [
            { name: "leg_l", bone: "leg_l" },
            { name: "hip", bone: "hip" },
            { name: "leg_r", bone: "leg_r" },
        ],
        skins: {
            // The same picture as cut-out parts: each part's rectangle with its joint as pivot.
            cut: {
                attachments: {
                    hip: {
                        rect: [8, 0, 24, 24],
                        pivot: [12, 24],
                        rotation: 90,
                    },
                    leg_l: {
                        rect: [10, 24, 8, 56],
                        pivot: [4, 0],
                        rotation: -90,
                    },
                    leg_r: {
                        rect: [22, 24, 8, 56],
                        pivot: [4, 0],
                        rotation: -90,
                    },
                },
            },
            soft: { attachments: {}, soft },
        },
        default_skin: "soft",
        jiggle: { leg_r: { half_life: 0.15, strength: 1, max: 40 } },
        clips: {
            idle: { length: 1, loop: true, tracks: {} },
            run: {
                length: 0.8,
                loop: true,
                tracks: {
                    root: [
                        { t: 0, x: 0 },
                        { t: 0.8, x: 40 },
                    ],
                    hip: [
                        { t: 0, rotation: -8 },
                        { t: 0.4, rotation: 6 },
                        { t: 0.8, rotation: -8 },
                    ],
                    leg_l: [
                        { t: 0, rotation: -30 },
                        { t: 0.4, rotation: 28 },
                        { t: 0.8, rotation: -30 },
                    ],
                    leg_r: [
                        { t: 0, rotation: 28 },
                        { t: 0.4, rotation: -30 },
                        { t: 0.8, rotation: 28 },
                    ],
                },
            },
            jump: {
                length: 1,
                tracks: {
                    hip: [
                        { t: 0, scale_x: 1 },
                        { t: 0.5, scale_x: 1.3 },
                        { t: 1, scale_x: 0.8 },
                    ],
                    leg_l: [
                        { t: 0, scale_x: 1, scale_y: 1 },
                        { t: 1, scale_x: 1.2, scale_y: 1.5 },
                    ],
                },
            },
            shake: {
                length: 0.6,
                loop: true,
                tracks: {
                    hip: [
                        { t: 0, rotation: 0, ease: "smooth" },
                        { t: 0.15, rotation: 18, ease: "smooth" },
                        { t: 0.45, rotation: -18, ease: "smooth" },
                        { t: 0.6, rotation: 0 },
                    ],
                },
            },
        },
        default_clip: "idle",
    };
}

/** A picture stand-in: drawing needs one, the pixels come from `make_pixels()`. */
const picture = {
    name: "atlas",
    width: 80,
    height: 80,
} as unknown as CanvasImageSource;

function make_rig(soft: SoftSkinData = SOFT): PuppetRig {
    const rig = PuppetRig.from_data(rig_data(soft), picture);
    rig.soft_skin!.pixels = make_pixels();
    return rig;
}

function mesh_of(rig: PuppetRig, cell = 4): SoftMesh {
    return rig.soft_skin!.mesh(cell)!;
}

/** A context that writes down its transforms and pictures (no pixels in Node). */
function recording_context(width = 400, height = 300) {
    let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const images: { source: number[]; transform: typeof transform }[] = [];
    const ignore = () => {};
    const context = {
        canvas: { width, height },
        getTransform: () => ({ ...transform }),
        setTransform: (
            a: number,
            b: number,
            c: number,
            d: number,
            e: number,
            f: number,
        ) => {
            transform = { a, b, c, d, e, f };
        },
        drawImage: (_image: unknown, ...numbers: number[]) => {
            images.push({
                source: numbers.slice(0, 4),
                transform: { ...transform },
            });
        },
        save: ignore,
        restore: ignore,
        beginPath: ignore,
        moveTo: ignore,
        lineTo: ignore,
        closePath: ignore,
        clip: ignore,
        fill: ignore,
        stroke: ignore,
        arc: ignore,
    };
    return { context: context as unknown as CanvasRenderingContext2D, images };
}

/** Weight of `bone` at point `index` of the mesh. */
function weight_on(mesh: SoftMesh, index: number, bone: number): number {
    let sum = 0;
    for (let slot = 0; slot < 4; slot++) {
        if (mesh.bones[index * 4 + slot] === bone) {
            sum += mesh.weights[index * 4 + slot];
        }
    }
    return sum;
}

function total_area(mesh: SoftMesh, points: Float64Array): number {
    let area = 0;
    for (let index = 0; index < mesh.triangles.length; index += 3) {
        const a = mesh.triangles[index] * 2;
        const b = mesh.triangles[index + 1] * 2;
        const c = mesh.triangles[index + 2] * 2;
        area +=
            Math.abs(
                (points[b] - points[a]) * (points[c + 1] - points[a + 1]) -
                    (points[c] - points[a]) * (points[b + 1] - points[a + 1]),
            ) / 2;
    }
    return area;
}

describe("soft skin: the mesh", () => {
    it("lays the grid only where the picture has pixels", () => {
        const mesh = mesh_of(make_rig());
        // 10 x 20 cells of 4 px; the body is 6 x 6 cells, each leg 2 x 14, plus the cells touching them.
        expect(mesh.triangles.length / 6).toBeGreaterThan(
            6 * 6 + 2 * 2 * 14 - 1,
        );
        expect(mesh.triangles.length / 6).toBeLessThan(10 * 20);
        // No cell in the gap between the legs below the body (u 18..22 is empty, cells there only touch).
        for (let index = 0; index < mesh.count; index++) {
            expect(mesh.rest[index * 2 + 1]).toBeLessThanOrEqual(0);
        }
        expect(mesh.bound_by.every((by) => by === "map")).toBe(true);
    });

    it("a point with weight 1 on one bone moves exactly with it", () => {
        const rig = make_rig();
        const mesh = mesh_of(rig);
        const leg = rig.bone_index("leg_l");
        const deep = [...Array(mesh.count).keys()].filter(
            (index) => weight_on(mesh, index, leg) === 1,
        );
        expect(deep.length).toBeGreaterThan(10);
        const rest = rig.make_skeleton();
        rest.update();
        const skeleton = rig.make_skeleton();
        skeleton.rotation[rig.bone_index("root")] = 7;
        skeleton.x[rig.bone_index("root")] = 31;
        skeleton.rotation[rig.bone_index("hip")] = 12;
        skeleton.rotation[leg] = -40;
        skeleton.update();
        const matrices = soft_matrices(
            skeleton,
            rest_inverse_of(rest),
            [1, 0, 0, 1, 0, 0],
            new Float64Array(skeleton.count * 6),
        );
        const points = skin_points(
            mesh,
            matrices,
            new Float64Array(mesh.count * 2),
        );
        for (const index of deep) {
            const local = rest.local_point(
                leg,
                mesh.rest[index * 2],
                mesh.rest[index * 2 + 1],
            );
            const moved = skeleton.world_point(leg, local.x, local.y);
            expect(points[index * 2]).toBeCloseTo(moved.x, 9);
            expect(points[index * 2 + 1]).toBeCloseTo(moved.y, 9);
        }
    });

    it("weights sum to 1, at most four bones, none below 0", () => {
        for (const cell of [4, 8, 16]) {
            const mesh = mesh_of(make_rig(), cell);
            for (let index = 0; index < mesh.count; index++) {
                let sum = 0;
                for (let slot = 0; slot < 4; slot++) {
                    const weight = mesh.weights[index * 4 + slot];
                    expect(weight).toBeGreaterThanOrEqual(0);
                    sum += weight;
                }
                expect(sum).toBeCloseTo(1, 6);
            }
        }
    });

    it("a point on the left leg has no weight on the right leg when the map says so", () => {
        const rig = make_rig();
        const mesh = mesh_of(rig);
        const left = rig.bone_index("leg_l");
        const right = rig.bone_index("leg_r");
        let checked = 0;
        for (let index = 0; index < mesh.count; index++) {
            const u = mesh.uv[index * 2];
            const v = mesh.uv[index * 2 + 1];
            if (u <= 16 && v >= 32) {
                expect(weight_on(mesh, index, right)).toBe(0);
                expect(weight_on(mesh, index, left)).toBe(1);
                checked += 1;
            }
        }
        expect(checked).toBeGreaterThan(20);
        // Where the legs meet the body the weights cross over softly.
        const hip = rig.bone_index("hip");
        const joint = [...Array(mesh.count).keys()].find(
            (index) =>
                mesh.uv[index * 2] === 12 && mesh.uv[index * 2 + 1] === 24,
        )!;
        expect(weight_on(mesh, joint, hip)).toBeGreaterThan(0.2);
        expect(weight_on(mesh, joint, left)).toBeGreaterThan(0.2);
    });

    it("binds by distance where there is no map", () => {
        const rig = make_rig({
            ...SOFT,
            pictures: [{ rect: [0, 0, 40, 80], origin: [20, 80] }],
        });
        const mesh = mesh_of(rig);
        expect(mesh.bound_by.every((by) => by === "distance")).toBe(true);
        const right = rig.bone_index("leg_r");
        // The bottom of the right leg goes with the right leg.
        const foot = [...Array(mesh.count).keys()].find(
            (index) =>
                mesh.uv[index * 2] === 28 && mesh.uv[index * 2 + 1] === 80,
        )!;
        expect(weight_on(mesh, foot, right)).toBeGreaterThan(0.9);
    });

    it("refuses soft skins that don't hold together", () => {
        expect(() =>
            PuppetRig.from_data(rig_data({ ...SOFT, pictures: [] })),
        ).toThrow(/no pictures/);
        expect(() =>
            PuppetRig.from_data(
                rig_data({
                    ...SOFT,
                    pictures: [
                        {
                            rect: [0, 0, 40, 80],
                            map: [40, 0, 40, 60],
                            origin: [20, 80],
                        },
                    ],
                }),
            ),
        ).toThrow(/as large as the picture/);
        expect(() =>
            PuppetRig.from_data(
                rig_data({ ...SOFT, colors: { tail: "#ff0000" } }),
            ),
        ).toThrow(/no bone "tail"/);
        expect(() =>
            PuppetRig.from_data(rig_data({ ...SOFT, colors: { hip: "red" } })),
        ).toThrow(/#rrggbb/);
    });
});

describe("soft skin: drawing", () => {
    it("the CPU path and the shader's maths agree on the same pose", () => {
        const rig = make_rig();
        const puppet = rig.puppet("run");
        puppet.update(0.23);
        const mesh = mesh_of(rig);
        const placement: [number, number, number, number, number, number] = [
            -0.7, 0.05, 0.02, 0.7, 210.5, 180.25,
        ];
        const inverse = rig.soft_skin!.rest_inverse!;
        const matrices = soft_matrices(
            puppet.skeleton,
            inverse,
            placement,
            new Float64Array(puppet.skeleton.count * 6),
        );
        const cpu = skin_points(
            mesh,
            matrices,
            new Float64Array(mesh.count * 2),
        );
        const texels = soft_row_texels(puppet.skeleton.count);
        const rows = new Float32Array(texels * 4 * 3);
        write_soft_row(rows, 2, texels, matrices, puppet.skeleton.count, 0, 1);
        for (let index = 0; index < mesh.count; index++) {
            const [x, y] = skin_point_as_shader(rows, texels, 2, mesh, index);
            expect(Math.abs(x - cpu[index * 2])).toBeLessThan(1e-3);
            expect(Math.abs(y - cpu[index * 2 + 1])).toBeLessThan(1e-3);
        }
    });

    it("the CPU draws each triangle of the atlas onto its moved points", () => {
        const rig = make_rig();
        const puppet = rig.puppet("run");
        puppet.update(0.5);
        const layer = new SoftLayer({ prefer: "cpu" });
        const { context, images } = recording_context();
        expect(
            puppet.draw(context, 200, 250, { layer, scale: 0.8, flip_x: true }),
        ).toBe(true);
        expect(images.length).toBe(0);
        layer.draw(context);
        const mesh = mesh_of(rig, 8);
        expect(images.length).toBe(mesh.triangles.length / 3);
        expect(layer.stats).toEqual({
            puppets: 1,
            triangles: mesh.triangles.length / 3,
            calls: mesh.triangles.length / 3,
            mode: "cpu",
        });
        const matrices = soft_matrices(
            puppet.skeleton,
            rig.soft_skin!.rest_inverse!,
            [-0.8, 0, 0, 0.8, 200, 250],
            new Float64Array(puppet.skeleton.count * 6),
        );
        const points = skin_points(
            mesh,
            matrices,
            new Float64Array(mesh.count * 2),
        );
        for (const [at, drawn] of images.entries()) {
            const { a, b, c, d, e, f } = drawn.transform;
            for (let corner = 0; corner < 3; corner++) {
                const point = mesh.triangles[at * 3 + corner];
                const u = mesh.uv[point * 2];
                const v = mesh.uv[point * 2 + 1];
                expect(a * u + c * v + e).toBeCloseTo(points[point * 2], 6);
                expect(b * u + d * v + f).toBeCloseTo(points[point * 2 + 1], 6);
            }
        }
    });

    it("draws at once without a layer, and says when the GPU isn't there", () => {
        const rig = make_rig();
        const puppet = rig.puppet();
        const { context, images } = recording_context();
        expect(puppet.draw(context, 100, 100)).toBe(true);
        // The shared layer finds no WebGL here: the CPU's grid.
        expect(images.length).toBe(mesh_of(rig, 8).triangles.length / 3);
        expect(images.length).toBeGreaterThan(0);
        const layer = new SoftLayer();
        expect(layer.prefer).toBe("gpu");
        expect(layer.mode).toBe("cpu");
        expect(layer.fallback_reason).toBe("no canvas to draw on here");
        const without_webgl = new SoftLayer({
            make_canvas: () =>
                ({
                    getContext: () => null,
                    addEventListener: () => {},
                }) as unknown as HTMLCanvasElement,
        });
        expect(without_webgl.mode).toBe("cpu");
        expect(without_webgl.fallback_reason).toBe("WebGL 2 is missing");
        layer.prefer = "cpu";
        expect(layer.fallback_reason).toBeNull();
    });

    it("the grid size is the skin's, for every puppet wearing it", () => {
        const rig = make_rig();
        const puppet = rig.puppet();
        const before = puppet.soft_points()!.length;
        rig.soft_skin!.cell_size = 8;
        expect(puppet.soft_points()!.length).toBeLessThan(before);
        expect(rig.soft_skin!.mesh(8)).toBe(rig.soft_skin!.mesh(8));
    });

    it("set_skin switches between the cut-out parts and the soft skin", () => {
        const rig = make_rig();
        const puppet = rig.puppet("run");
        expect(puppet.is_soft).toBe(true);
        expect(puppet.set_skin("cut")).toBe(true);
        expect(puppet.is_soft).toBe(false);
        const { context, images } = recording_context();
        puppet.update(0.1);
        puppet.draw(context, 0, 0);
        expect(images.length).toBe(3);
        expect(puppet.set_skin("soft")).toBe(true);
        expect(puppet.is_soft).toBe(true);
    });

    it("a soft skin and the cut-out skin put the feet at the same place through the run", () => {
        const rig = make_rig();
        const soft = rig.puppet("run");
        const cut = rig.puppet("run");
        cut.set_skin("cut");
        const mesh = mesh_of(rig);
        const right = rig.bone_index("leg_r");
        // The sole of the right leg: the bottom row of its picture.
        const soles = [...Array(mesh.count).keys()].filter(
            (index) =>
                mesh.uv[index * 2 + 1] === 80 && mesh.uv[index * 2] >= 22,
        );
        expect(soles.length).toBeGreaterThan(1);
        const part = rig.skin("cut")!.parts.get("leg_r")!;
        const m = part.transform;
        for (let step = 0; step <= 40; step++) {
            soft.update(step === 0 ? 0 : 0.02);
            cut.update(step === 0 ? 0 : 0.02);
            const points = soft.soft_points()!;
            for (const index of soles) {
                // The same pixel as a cut-out part: through the part's transform onto its bone.
                const u = mesh.uv[index * 2] - part.source_x;
                const v = mesh.uv[index * 2 + 1] - part.source_y;
                const on_bone = cut.skeleton.world_point(
                    right,
                    m[0] * u + m[2] * v + m[4],
                    m[1] * u + m[3] * v + m[5],
                );
                expect(weight_on(mesh, index, right)).toBe(1);
                expect(points[index * 2]).toBeCloseTo(on_bone.x, 6);
                expect(points[index * 2 + 1]).toBeCloseTo(on_bone.y, 6);
            }
        }
    });
});

describe("stretch and squash: scale keys", () => {
    it("a key with only scale_x keeps the area; both keyed are as given", () => {
        const rig = make_rig();
        const skeleton = rig.make_skeleton();
        const jump = rig.clip("jump")!;
        jump.sample(0.5, skeleton);
        const hip = rig.bone_index("hip");
        expect(skeleton.stretch_x[hip]).toBeCloseTo(1.3, 9);
        expect(skeleton.stretch_y[hip]).toBeCloseTo(1 / 1.3, 9);
        const leg = rig.bone_index("leg_l");
        expect(skeleton.stretch_x[leg]).toBeCloseTo(1.1, 9);
        expect(skeleton.stretch_y[leg]).toBeCloseTo(1.25, 9);
        expect(skeleton.stretch_x[rig.bone_index("leg_r")]).toBe(1);
        expect(jump.stretches).toBe(true);
        expect(rig.clip("run")!.stretches).toBe(false);
        expect(() =>
            PuppetRig.from_data({
                ...rig_data(),
                clips: {
                    bad: { length: 1, tracks: { hip: [{ t: 0, scale_x: 0 }] } },
                },
            }),
        ).toThrow(/above 0/);
    });

    it("scale keys keep the area within a set share", () => {
        const rig = make_rig();
        const puppet = rig.puppet("idle");
        puppet.update(0);
        const mesh = mesh_of(rig);
        const area_at_rest = total_area(mesh, puppet.soft_points()!);
        puppet.play("jump", { fade: 0 });
        let smallest = Infinity;
        let largest = 0;
        let hip_stretch = 1;
        for (let step = 0; step < 10; step++) {
            puppet.update(0.1);
            hip_stretch = Math.max(
                hip_stretch,
                puppet.skeleton.stretch_x[rig.bone_index("hip")],
            );
            // Only the body is keyed to keep its area here: measure without the left leg's free stretch.
            puppet.skeleton.stretch_x[rig.bone_index("leg_l")] = 1;
            puppet.skeleton.stretch_y[rig.bone_index("leg_l")] = 1;
            puppet.skeleton.update();
            const area = total_area(mesh, puppet.soft_points()!);
            smallest = Math.min(smallest, area / area_at_rest);
            largest = Math.max(largest, area / area_at_rest);
        }
        expect(hip_stretch).toBeGreaterThan(1.25);
        expect(smallest).toBeGreaterThan(0.9);
        expect(largest).toBeLessThan(1.1);
    });

    it("stretches the cut-out parts too, and stretch off keeps the lengths", () => {
        const rig = make_rig();
        const puppet = rig.puppet("jump");
        puppet.update(0.5);
        const hip = rig.bone_index("hip");
        expect(puppet.skeleton.length_scale(hip)).toBeCloseTo(1.3, 6);
        puppet.stretch = false;
        puppet.update(0);
        expect(puppet.skeleton.length_scale(hip)).toBe(1);
        expect(puppet.skeleton.width_scale(hip)).toBe(1);
    });

    it("a fade blends the stretch in a straight line", () => {
        const rig = make_rig();
        const puppet = rig.puppet("jump");
        puppet.update(0.5);
        puppet.play("idle", { fade: 0.2 });
        puppet.update(0.1);
        const hip = rig.bone_index("hip");
        // Half way through the fade (eased: 0.5): the jump, playing on to 0.6 s (1.2), half way to idle's 1.
        expect(puppet.skeleton.stretch_x[hip]).toBeCloseTo(1.1, 6);
        puppet.update(0.2);
        expect(puppet.skeleton.stretch_x[hip]).toBe(1);
    });
});

describe("jiggle", () => {
    it("settles to the rest pose", () => {
        const rig = make_rig();
        const puppet = rig.puppet("idle");
        puppet.update(0);
        puppet.jiggle.carry(30, 0);
        puppet.update(1 / 60);
        puppet.update(1 / 60);
        const swing = Math.abs(puppet.jiggle.offset("leg_r"));
        expect(swing).toBeGreaterThan(5);
        for (let step = 0; step < 60 * 3; step++) {
            puppet.update(1 / 60);
        }
        expect(Math.abs(puppet.jiggle.offset("leg_r"))).toBeLessThan(0.05);
        const rest = rig.make_skeleton();
        rest.update();
        const right = rig.bone_index("leg_r");
        expect(puppet.skeleton.world_rotation(right)).toBeCloseTo(
            rest.world_rotation(right),
            1,
        );
    });

    it("gives the same result at 30 and 144 updates per second", () => {
        const run = (rate: number, impulse: boolean): number[] => {
            const puppet = make_rig().puppet(impulse ? "idle" : "shake");
            puppet.update(0);
            if (impulse) {
                puppet.jiggle.carry(25, -5);
            }
            const out: number[] = [];
            for (let sixth = 1; sixth <= 12; sixth++) {
                for (let step = 0; step < rate / 6; step++) {
                    puppet.update(1 / rate);
                }
                out.push(puppet.jiggle.offset("leg_r"));
            }
            return out;
        };
        const slow = run(30, true);
        const fast = run(144, true);
        expect(Math.abs(slow[0])).toBeGreaterThan(1);
        for (const [at, value] of slow.entries()) {
            expect(Math.abs(value - fast[at])).toBeLessThan(0.05);
        }
        // Driven by a clip the targets are sampled at each update: close, not exact.
        const shaken_slow = run(30, false);
        const shaken_fast = run(144, false);
        expect(Math.max(...shaken_fast.map(Math.abs))).toBeGreaterThan(2);
        for (const [at, value] of shaken_slow.entries()) {
            expect(Math.abs(value - shaken_fast[at])).toBeLessThan(1.5);
        }
    });

    it("stays within max, switches off, and refuses bad data", () => {
        const rig = make_rig();
        const puppet = rig.puppet("idle");
        puppet.update(0);
        puppet.jiggle.carry(5000, 0);
        puppet.update(1 / 60);
        puppet.update(1 / 60);
        expect(Math.abs(puppet.jiggle.offset("leg_r"))).toBeLessThanOrEqual(40);
        puppet.jiggle.enabled = false;
        puppet.update(1 / 60);
        expect(puppet.jiggle.offset("leg_r")).toBe(0);
        expect(puppet.jiggle.bone_names).toEqual(["leg_r"]);
        expect(() =>
            PuppetRig.from_data({ ...rig_data(), jiggle: { tail: {} } }),
        ).toThrow(/no bone "tail"/);
        expect(() =>
            PuppetRig.from_data({
                ...rig_data(),
                jiggle: { hip: { half_life: 0 } },
            }),
        ).toThrow(/half_life/);
        expect(new PuppetJiggle().offset("x")).toBe(0);
    });

    it("works on any skeleton, not only soft skins", () => {
        const skeleton = Skeleton.from_data([
            { name: "root" },
            { name: "ear", parent: "root", rotation: -90, length: 30 },
        ]);
        const jiggle = new PuppetJiggle();
        jiggle.set_bones([
            { name: "ear", bone: 1, half_life: 0.2, strength: 1, max: 30 },
        ]);
        skeleton.update();
        jiggle.step(1 / 60, skeleton);
        jiggle.carry(10, 0);
        skeleton.reset_pose();
        skeleton.update();
        jiggle.step(1 / 60, skeleton);
        // Moved right, the ear's tip stays behind (left): it leans back, turning anticlockwise.
        expect(jiggle.offset("ear")).toBeLessThan(0);
    });
});
