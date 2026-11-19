import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/SeededRandom";
import { memory_store } from "../../storage/saves/SaveStore";
import { SaveSlots } from "../../storage/saves/SaveSlots";
import {
    build_creature,
    creature_from_data,
    CreatureData,
    CreatureHitEvent,
    generate_creature,
    in_area,
    make_creature_data,
} from "./Creature";
import { make_wave } from "./CreatureGait";
import {
    CREATURE_KINDS,
    CREATURE_TEMPLATES,
    CreatureKind,
    make_skeleton_from_template,
} from "./CreatureTemplate";
import { KitPartData, PartKit, PartKitData } from "./PartKit";
import { two_bone_ik } from "./PuppetIk";
import { PuppetRig } from "./PuppetRig";
import { Skeleton } from "./Skeleton";
import { compose_soft_skin, map_color } from "./SoftCompose";
import { parse_hex_color, RgbaPixels } from "./SoftMesh";

// ---- a small kit drawn here: capsules in grey with a dark outline, a mask beside each ----

interface Shape {
    readonly role: string;
    readonly width: number;
    readonly height: number;
    readonly pivot: [number, number];
    readonly tip: [number, number];
    /** The mask's colour inside: red (main), blue (accent) or black (as drawn). */
    readonly channel?: "main" | "accent" | "none";
    readonly points?: Record<string, [number, number]>;
    readonly jaw?: string;
    readonly claws?: boolean;
}

const SHAPES: Record<string, Shape> = {
    torso: {
        role: "torso",
        width: 120,
        height: 60,
        pivot: [10, 30],
        tip: [110, 30],
        points: { back_0: [20, 8], back_1: [60, 4], back_2: [100, 8] },
    },
    neck: {
        role: "neck",
        width: 40,
        height: 26,
        pivot: [4, 13],
        tip: [36, 13],
    },
    head_snout: {
        role: "head",
        width: 80,
        height: 44,
        pivot: [8, 22],
        tip: [76, 22],
        jaw: "jaw_snout",
        points: {
            jaw: [24, 32],
            chin: [70, 36],
            mouth: [74, 30],
            eye: [50, 14],
            horn: [30, 6],
            ear: [18, 8],
        },
    },
    head_round: {
        role: "head",
        width: 60,
        height: 50,
        pivot: [6, 25],
        tip: [54, 25],
        points: {
            mouth: [52, 32],
            eye: [36, 18],
            horn: [24, 6],
            ear: [14, 10],
        },
    },
    jaw_snout: {
        role: "jaw",
        width: 50,
        height: 16,
        pivot: [4, 8],
        tip: [46, 8],
    },
    tail: {
        role: "tail",
        width: 40,
        height: 20,
        pivot: [4, 10],
        tip: [36, 10],
    },
    tail_tip: {
        role: "tail_tip",
        width: 30,
        height: 20,
        pivot: [3, 10],
        tip: [27, 10],
    },
    leg_upper: {
        role: "leg_upper",
        width: 50,
        height: 26,
        pivot: [6, 13],
        tip: [44, 13],
    },
    leg_lower: {
        role: "leg_lower",
        width: 46,
        height: 20,
        pivot: [5, 10],
        tip: [41, 10],
    },
    foot_paw: {
        role: "foot",
        width: 30,
        height: 20,
        pivot: [4, 10],
        tip: [26, 10],
    },
    foot_claw: {
        role: "foot",
        width: 30,
        height: 20,
        pivot: [4, 10],
        tip: [26, 10],
        claws: true,
        channel: "accent",
    },
    arm_upper: {
        role: "arm_upper",
        width: 44,
        height: 22,
        pivot: [5, 11],
        tip: [39, 11],
    },
    arm_lower: {
        role: "arm_lower",
        width: 40,
        height: 18,
        pivot: [5, 9],
        tip: [35, 9],
    },
    hand_claw: {
        role: "hand",
        width: 26,
        height: 18,
        pivot: [4, 9],
        tip: [22, 9],
        claws: true,
    },
    wing: {
        role: "wing",
        width: 120,
        height: 50,
        pivot: [6, 25],
        tip: [114, 25],
    },
    segment: {
        role: "segment",
        width: 34,
        height: 34,
        pivot: [5, 17],
        tip: [29, 17],
        points: { top: [17, 3] },
    },
    eye: {
        role: "eye",
        width: 12,
        height: 12,
        pivot: [6, 6],
        tip: [11, 6],
        channel: "none",
    },
    horn: {
        role: "horn",
        width: 16,
        height: 30,
        pivot: [8, 27],
        tip: [8, 3],
        channel: "accent",
    },
    ear: { role: "ear", width: 16, height: 24, pivot: [8, 21], tip: [8, 3] },
    spike: {
        role: "spike",
        width: 12,
        height: 20,
        pivot: [6, 18],
        tip: [6, 3],
        channel: "accent",
    },
};

/** Inside a capsule round the line from pivot to tip (its radius the shorter side's half). */
function inside(shape: Shape, x: number, y: number, grow: number): boolean {
    const [ax, ay] = shape.pivot;
    const [bx, by] = shape.tip;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
    );
    const radius = Math.min(shape.width, shape.height) / 2 - 1;
    return (
        Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= radius - 2 + grow
    );
}

function make_kit(): { data: PartKitData; pixels: RgbaPixels } {
    const width = 512;
    let x = 2;
    let y = 2;
    let row = 0;
    const places: Record<string, [number, number]> = {};
    for (const [id, shape] of Object.entries(SHAPES)) {
        if (x + shape.width * 2 + 4 > width) {
            x = 2;
            y += row + 2;
            row = 0;
        }
        places[id] = [x, y];
        x += shape.width * 2 + 4;
        row = Math.max(row, shape.height);
    }
    const height = y + row + 2;
    const data = new Uint8ClampedArray(width * height * 4);
    const parts: Record<string, KitPartData> = {};
    for (const [id, shape] of Object.entries(SHAPES)) {
        const [px, py] = places[id];
        const mx = px + shape.width + 2;
        for (let v = 0; v < shape.height; v++) {
            for (let u = 0; u < shape.width; u++) {
                const cx = u + 0.5;
                const cy = v + 0.5;
                const at = ((py + v) * width + px + u) * 4;
                const mask = ((py + v) * width + mx + u) * 4;
                if (inside(shape, cx, cy, 0)) {
                    // Lit from above: 255 at the top to 200 at the bottom.
                    const grey = Math.round(255 - (55 * v) / shape.height);
                    data.set([grey, grey, grey, 255], at);
                    const channel = shape.channel ?? "main";
                    data.set(
                        channel === "main"
                            ? [255, 0, 0, 255]
                            : channel === "accent"
                              ? [0, 0, 255, 255]
                              : [0, 0, 0, 255],
                        mask,
                    );
                } else if (inside(shape, cx, cy, 2)) {
                    data.set([60, 60, 60, 255], at);
                    data.set([255, 0, 0, 0], mask);
                }
            }
        }
        parts[id] = {
            role: shape.role,
            rect: [px, py, shape.width, shape.height],
            mask: [mx, py, shape.width, shape.height],
            pivot: shape.pivot,
            tip: shape.tip,
            ...(shape.points === undefined ? {} : { points: shape.points }),
            ...(shape.jaw === undefined ? {} : { jaw: shape.jaw }),
            ...(shape.claws === undefined ? {} : { claws: shape.claws }),
        };
    }
    return { data: { parts }, pixels: { width, height, data } };
}

const KIT_SOURCE = make_kit();

function kit(): PartKit {
    const made = PartKit.from_data(KIT_SOURCE.data);
    made.pixels = KIT_SOURCE.pixels;
    return made;
}

const near = (value: number, expected: number, within = 1e-6) =>
    expect(Math.abs(value - expected)).toBeLessThanOrEqual(within);

// ---- the IK ----

describe("two_bone_ik", () => {
    const leg = () =>
        Skeleton.from_data([
            { name: "root" },
            { name: "hip", parent: "root", y: -100 },
            { name: "thigh", parent: "hip", rotation: 80, length: 50 },
            { name: "shin", parent: "thigh", x: 50, rotation: 20, length: 50 },
        ]);

    it("puts the end of the lower bone on the target, the knee on the side asked", () => {
        const skeleton = leg();
        skeleton.update();
        const thigh = skeleton.index_of("thigh");
        const shin = skeleton.index_of("shin");
        for (const [x, y] of [
            [20, -20],
            [-30, -30],
            [0, -10],
        ]) {
            expect(two_bone_ik(skeleton, thigh, shin, 50, 0, x, y, -1)).toBe(
                true,
            );
            const end = skeleton.world_point(shin, 50, 0);
            near(end.x, x, 1e-6);
            near(end.y, y, 1e-6);
            // Bent -1: the knee lies counter-clockwise of the line from the hip, here in front.
            const knee_x = skeleton.world_x(shin);
            const cross =
                (x - 0) * (skeleton.world_y(shin) + 100) -
                (y + 100) * (knee_x - 0);
            expect(cross).toBeLessThan(0);
        }
    });

    it("says false and stretches towards a target out of reach", () => {
        const skeleton = leg();
        skeleton.update();
        const thigh = skeleton.index_of("thigh");
        const shin = skeleton.index_of("shin");
        expect(two_bone_ik(skeleton, thigh, shin, 50, 0, 0, 50, 1)).toBe(false);
        const end = skeleton.world_point(shin, 50, 0);
        near(end.x, 0, 1e-6);
        near(end.y, 0, 1e-6);
    });
});

// ---- skeletons from templates ----

describe("make_skeleton_from_template", () => {
    it("makes the same skeleton from the same seed, another from another", () => {
        for (const kind of CREATURE_KINDS) {
            const template = CREATURE_TEMPLATES[kind];
            const a = make_skeleton_from_template(template, 4711);
            const b = make_skeleton_from_template(
                template,
                new SeededRandom(1).fork() && 4711,
            );
            expect(b.bones).toEqual(a.bones);
            const c = make_skeleton_from_template(template, 4712);
            expect(c.bones).not.toEqual(a.bones);
        }
    });

    it("keeps counts in their ranges and stands its legs on the ground", () => {
        for (const kind of CREATURE_KINDS) {
            const template = CREATURE_TEMPLATES[kind];
            for (let seed = 1; seed <= 60; seed++) {
                const made = make_skeleton_from_template(template, seed);
                const skeleton = Skeleton.from_data(made.bones);
                skeleton.update();
                const count = (role: string) =>
                    made.chains
                        .filter((chain) => chain.role === role)
                        .reduce((sum, chain) => sum + chain.bones.length, 0);
                if (kind === "quadruped") {
                    expect(count("spine")).toBeGreaterThanOrEqual(3);
                    expect(count("spine")).toBeLessThanOrEqual(5);
                    expect(count("leg")).toBe(12);
                    expect(count("tail")).toBe(made.params.tail);
                    expect(made.params.tail).toBeGreaterThanOrEqual(2);
                    expect(made.params.tail).toBeLessThanOrEqual(6);
                } else if (kind === "worm") {
                    expect(count("body")).toBe(made.params.segments);
                    expect(made.params.segments).toBeGreaterThanOrEqual(8);
                    expect(made.params.segments).toBeLessThanOrEqual(20);
                    expect(count("leg")).toBe(0);
                } else if (kind === "flyer") {
                    expect(count("wing")).toBe(6);
                    expect(count("leg")).toBe(6);
                } else {
                    expect(count("leg")).toBe(6);
                    expect(count("arm")).toBe(6);
                }
                for (const chain of made.chains) {
                    const anchor = made.anchors[chain.tip_anchor];
                    const tip = skeleton.world_point(
                        skeleton.index_of(anchor.bone),
                        anchor.x,
                        anchor.y,
                    );
                    if (chain.stands) {
                        near(tip.y, 0, 1e-6);
                    }
                    if (kind === "flyer" && chain.role === "leg") {
                        // Dangling: off the ground.
                        expect(tip.y).toBeLessThan(-20);
                    }
                }
            }
        }
    });

    it("lets a value set one thing: a longer tail leaves the legs as they were", () => {
        const template = CREATURE_TEMPLATES.quadruped;
        const short = make_skeleton_from_template(template, 99, { tail: 2 });
        const long = make_skeleton_from_template(template, 99, { tail: 6 });
        const legs = (made: typeof short) =>
            made.bones.filter((bone) => /^(thigh|shin|paw)/.test(bone.name));
        expect(legs(long)).toEqual(legs(short));
        expect(
            long.bones.filter((bone) => bone.name.startsWith("tail_")).length,
        ).toBe(6);
        // Kept in range, whole.
        expect(
            make_skeleton_from_template(template, 99, { tail: 40 }).params.tail,
        ).toBe(6);
        expect(
            make_skeleton_from_template(template, 99, { tail: 3.4 }).params
                .tail,
        ).toBe(3);
    });
});

// ---- painting parts into a soft skin ----

describe("compose_soft_skin", () => {
    const bones = [
        { name: "root" },
        { name: "body", parent: "root", x: -60, y: -60, length: 120 },
        { name: "leg", parent: "body", x: 100, rotation: 90, length: 60 },
    ];

    it("paints tinted parts and a bone map beside them, the limb's root in its parent's colour", () => {
        const parts = kit();
        const composed = compose_soft_skin(
            parts,
            [
                {
                    part: "torso",
                    picture: "body",
                    bone: "body",
                    at: [-60, -60],
                    to: [60, -60],
                },
                {
                    part: "leg_upper",
                    picture: "leg",
                    bone: "leg",
                    at: [40, -60],
                    to: [40, 0],
                    zone: { bone: "body", radius: 15 },
                },
                {
                    part: "eye",
                    picture: "body",
                    bone: "body",
                    at: [30, -70],
                    over: true,
                },
            ],
            { main: "#ff8000", second: "#00ff00", accent: "#0000ff" },
            { bones, pictures: ["leg", "body"] },
        );
        const { soft, pixels } = composed;
        expect(soft.pictures.map((picture) => picture.name)).toEqual([
            "leg",
            "body",
        ]);
        expect(soft.cell_size).toBe(12);
        expect(soft.cpu_cell_size).toBe(32);
        expect(soft.blur).toBe(20);
        const pixel = (
            rect: readonly number[],
            origin: readonly number[],
            x: number,
            y: number,
        ) => {
            const u = Math.floor(x + origin[0]);
            const v = Math.floor(y + origin[1]);
            const at = ((rect[1] + v) * pixels.width + rect[0] + u) * 4;
            return [...pixels.data.slice(at, at + 4)];
        };
        const body = soft.pictures[1];
        // The torso's middle: grey times orange (blue none).
        const middle = pixel(body.rect, body.origin, 0, -60);
        expect(middle[3]).toBe(255);
        expect(middle[0]).toBeGreaterThan(150);
        expect(middle[1]).toBeGreaterThan(60);
        expect(middle[1]).toBeLessThan(middle[0]);
        expect(middle[2]).toBe(0);
        // The eye keeps its grey (its mask is black).
        const eye = pixel(body.rect, body.origin, 30, -70);
        expect(eye[0]).toBe(eye[2]);
        // The map: the torso in the body's colour, the leg's foot in the leg's, its root in the body's.
        const body_color = parse_hex_color(soft.colors!.body)!;
        const leg_color = parse_hex_color(soft.colors!.leg)!;
        expect(pixel(body.map!, body.origin, 0, -60).slice(0, 3)).toEqual(
            body_color,
        );
        const leg = soft.pictures[0];
        expect(pixel(leg.map!, leg.origin, 40, -10).slice(0, 3)).toEqual(
            leg_color,
        );
        expect(pixel(leg.map!, leg.origin, 40, -52).slice(0, 3)).toEqual(
            body_color,
        );
        expect(leg.bones).toEqual(["body", "leg"]);
        expect(soft.colors!.leg).toBe(map_color(2));
    });

    it("leaves no seam where two parts overlap: their outlines are painted over", () => {
        const parts = kit();
        const composed = compose_soft_skin(
            parts,
            [
                {
                    part: "tail",
                    picture: "body",
                    bone: "body",
                    at: [0, 0],
                    to: [32, 0],
                },
                {
                    part: "tail",
                    picture: "body",
                    bone: "body",
                    at: [24, 0],
                    to: [56, 0],
                },
            ],
            { main: "#ffffff", second: "#ffffff", accent: "#ffffff" },
            { bones },
        );
        const picture = composed.soft.pictures[0];
        // Along the middle line from one part into the next: never the outline's dark grey.
        for (let x = 4; x <= 52; x++) {
            const u = x + picture.origin[0];
            const v = picture.origin[1];
            const at =
                ((picture.rect[1] + v) * composed.pixels.width +
                    picture.rect[0] +
                    u) *
                4;
            expect(composed.pixels.data[at]).toBeGreaterThan(150);
        }
    });

    it("is a skin step 41's soft mesh takes, each point weighted by the map", () => {
        const parts = kit();
        const composed = compose_soft_skin(
            parts,
            [
                {
                    part: "torso",
                    picture: "body",
                    bone: "body",
                    at: [-60, -60],
                    to: [60, -60],
                },
                {
                    part: "leg_upper",
                    picture: "leg",
                    bone: "leg",
                    at: [40, -60],
                    to: [40, 0],
                },
            ],
            { main: "#808080", second: "#808080", accent: "#808080" },
            { bones },
        );
        const rig = PuppetRig.from_data(
            {
                skeleton: "test",
                bones,
                slots: [],
                skins: { soft: { attachments: {}, soft: composed.soft } },
            },
            {
                width: composed.pixels.width,
                height: composed.pixels.height,
            } as unknown as CanvasImageSource,
        );
        rig.soft_skin!.pixels = composed.pixels;
        const mesh = rig.soft_skin!.mesh(12)!;
        expect(mesh.count).toBeGreaterThan(20);
        expect(mesh.bound_by.every((by) => by === "map")).toBe(true);
    });
});

// ---- creatures ----

const pixels_of = (data: CreatureData) => [
    ...build_creature(data, kit()).composed.pixels.data,
];

describe("generated creatures", () => {
    it("the same seed gives the same monster (data and drawn picture)", () => {
        for (const kind of CREATURE_KINDS) {
            const a = generate_creature(kind, 4711, kit());
            const b = generate_creature(kind, 4711, kit());
            expect(b.data).toEqual(a.data);
            expect(b.build.rig).toEqual(a.build.rig);
            expect([...b.pixels.data]).toEqual([...a.pixels.data]);
            // Posed the same, the points are where they were.
            a.play("walk");
            b.play("walk");
            for (let frame = 0; frame < 20; frame++) {
                a.update(1 / 30);
                b.update(1 / 30);
            }
            expect([...b.puppet.soft_points()!]).toEqual([
                ...a.puppet.soft_points()!,
            ]);
            const other = generate_creature(kind, 4712, kit());
            expect([...other.pixels.data]).not.toEqual([...a.pixels.data]);
        }
    }, 30000);

    it("each kind's walk keeps a planted foot within a pixel while it touches the ground", () => {
        for (const kind of ["quadruped", "biped"] as CreatureKind[]) {
            for (const seed of [1, 2, 3, 77, 4711]) {
                const creature = generate_creature(kind, seed, kit());
                for (const name of ["walk", "run"]) {
                    const clip = creature.rig.clip(name)!;
                    const data = creature.build.rig.clips![name];
                    const travel = data.travel!;
                    const keys = Object.values(data.tracks)[0].map(
                        (key) => key.t,
                    );
                    const skeleton = creature.rig.make_skeleton();
                    let planted = 0;
                    for (const chain of creature.build.body.chains.filter(
                        (item) => item.stands,
                    )) {
                        const anchor =
                            creature.build.body.anchors[chain.tip_anchor];
                        const bone = skeleton.index_of(anchor.bone);
                        const sole = (t: number) => {
                            clip.sample(t, skeleton);
                            skeleton.update();
                            return skeleton.world_point(
                                bone,
                                anchor.x,
                                anchor.y,
                            );
                        };
                        const rest = sole(0);
                        skeleton.reset_pose();
                        skeleton.update();
                        const ground = skeleton.world_point(
                            bone,
                            anchor.x,
                            anchor.y,
                        ).y;
                        void rest;
                        for (let at = 0; at + 1 < keys.length; at++) {
                            const a = sole(keys[at]);
                            const b = sole(keys[at + 1]);
                            if (
                                Math.abs(a.y - ground) > 1e-3 ||
                                Math.abs(b.y - ground) > 1e-3
                            ) {
                                continue;
                            }
                            // Between two keys on the ground: the sole stays put while the creature moves at travel.
                            const start = a.x + travel * keys[at];
                            for (let step = 0; step <= 10; step++) {
                                const t =
                                    keys[at] +
                                    ((keys[at + 1] - keys[at]) * step) / 10;
                                const now = sole(t);
                                expect(
                                    Math.abs(now.y - ground),
                                ).toBeLessThanOrEqual(1);
                                expect(
                                    Math.abs(now.x + travel * t - start),
                                ).toBeLessThanOrEqual(1);
                                planted += 1;
                            }
                        }
                    }
                    expect(planted).toBeGreaterThan(50);
                }
            }
        }
    });

    it("a worm's wave travels backwards along the body", () => {
        const creature = generate_creature("worm", 4711, kit());
        const body = creature.build.body;
        const chain = body.chains.find((item) => item.role === "body")!;
        const data = make_wave(body);
        const rig = PuppetRig.from_data({
            ...creature.build.rig,
            clips: { crawl: data },
            default_clip: "crawl",
        });
        const clip = rig.clip("crawl")!;
        const skeleton = rig.make_skeleton();
        const crest_time = (bone: string) => {
            let best = 0;
            let highest = Infinity;
            for (let step = 0; step < 400; step++) {
                const t = (data.length * step) / 400;
                clip.sample(t, skeleton);
                skeleton.update();
                const y = skeleton.world_y(skeleton.index_of(bone));
                if (y < highest) {
                    highest = y;
                    best = t;
                }
            }
            return best;
        };
        const middle = Math.floor(chain.bones.length / 2);
        const at_middle = crest_time(chain.bones[middle]);
        const nearer_tail = crest_time(chain.bones[middle - 2]);
        const nearer_head = crest_time(chain.bones[middle + 2]);
        const later = (a: number, b: number) =>
            (((b - a) % data.length) + data.length) % data.length;
        // The crest reaches the head's side first, then the middle, then the tail's side.
        expect(later(at_middle, nearer_tail)).toBeGreaterThan(0);
        expect(later(at_middle, nearer_tail)).toBeLessThan(data.length / 2);
        expect(later(nearer_head, at_middle)).toBeGreaterThan(0);
        expect(later(nearer_head, at_middle)).toBeLessThan(data.length / 2);
        expect(data.travel!).toBeGreaterThan(0);
        // It lies on the ground: no joint below it.
        for (let step = 0; step < 24; step++) {
            clip.sample((data.length * step) / 24, skeleton);
            skeleton.update();
            for (const bone of chain.bones) {
                expect(skeleton.world_y(skeleton.index_of(bone))).toBeLessThan(
                    0.5,
                );
            }
        }
    });

    it("a flyer beats its wings and rises on the downstroke; it glides with them held out", () => {
        const creature = generate_creature("flyer", 4711, kit());
        const rig = creature.rig;
        const skeleton = rig.make_skeleton();
        const wing = skeleton.index_of("wing_a_r");
        const spine = skeleton.index_of("spine_1");
        const flap = rig.clip("walk")!;
        const at = (t: number) => {
            flap.sample(t, skeleton);
            skeleton.update();
            return {
                wing: skeleton.world_rotation(wing),
                y: skeleton.world_y(spine),
            };
        };
        const up = at(0);
        const down = at(flap.length / 2);
        // Up at the start, down (turned back and under) halfway; the body highest after the downstroke.
        expect(up.wing - down.wing).toBeGreaterThan(60);
        expect(down.y).toBeLessThan(up.y);
        const glide = rig.clip("run")!;
        glide.sample(0, skeleton);
        skeleton.update();
        expect(skeleton.world_rotation(wing)).toBeLessThan(-150);
    });

    it("idle breathes with scale keys and keeps the feet where they stand", () => {
        const creature = generate_creature("quadruped", 12, kit());
        const idle = creature.build.rig.clips!.idle;
        const spine = idle.tracks.spine_1;
        expect(spine.some((key) => (key.scale_y ?? 1) > 1.03)).toBe(true);
        expect(spine.every((key) => key.scale_x === 1)).toBe(true);
        const skeleton = creature.rig.make_skeleton();
        skeleton.update();
        const anchor = creature.build.body.anchors.hind_r_sole;
        const bone = skeleton.index_of(anchor.bone);
        const rest = { ...skeleton.world_point(bone, anchor.x, anchor.y) };
        const clip = creature.rig.clip("idle")!;
        for (let t = 0; t < clip.length; t += 0.1) {
            clip.sample(t, skeleton);
            skeleton.update();
            const now = skeleton.world_point(bone, anchor.x, anchor.y);
            near(now.x, rest.x, 0.6);
            near(now.y, rest.y, 0.6);
        }
    });

    it("a bite's hit moment fires once per bite at any speed", () => {
        const data = make_creature_data("quadruped", 5, kit(), {
            parts: { head: "head_snout" },
            attacks: ["bite"],
        });
        for (const speed of [0.25, 1, 2.5, 7]) {
            for (const step of [1 / 144, 1 / 30, 0.13]) {
                const creature = creature_from_data(data, kit());
                creature.puppet.player.speed = speed;
                let hits = 0;
                creature.events.attach(CreatureHitEvent, (hit) => {
                    expect(hit.attack).toBe("bite");
                    hits += 1;
                });
                creature.play("walk");
                expect(creature.attack("bite")).toBe(true);
                for (let time = 0; time < 2 / speed; time += step) {
                    creature.update(step);
                }
                expect(hits).toBe(1);
                expect(creature.attacking).toBeNull();
                expect(creature.puppet.player.clip_name).toBe("walk");
                creature.attack("bite");
                for (let time = 0; time < 2 / speed; time += step) {
                    creature.update(step);
                }
                expect(hits).toBe(2);
            }
        }
    });

    it("a monster without a jaw gets no bite", () => {
        const parts = kit();
        for (const kind of CREATURE_KINDS) {
            const data = make_creature_data(kind, 33, parts, {
                parts: { head: "head_round" },
            });
            expect(data.parts.jaw).toBeUndefined();
            expect(data.attacks).not.toContain("bite");
            const forced = creature_from_data(
                { ...data, attacks: ["bite", "fire"] },
                parts,
            );
            expect(forced.attacks.has("bite")).toBe(false);
            expect(forced.attack("bite")).toBe(false);
            expect(forced.rig.bone_index("jaw")).toBe(-1);
            const with_jaw = make_creature_data(kind, 33, parts, {
                parts: { head: "head_snout" },
            });
            expect(with_jaw.parts.jaw).toBe("jaw_snout");
            expect(with_jaw.attacks).toContain("bite");
        }
    });

    it("chooses attacks by the body: claws claw, and every monster has at least one", () => {
        const parts = kit();
        let fire = 0;
        for (let seed = 1; seed <= 40; seed++) {
            for (const kind of CREATURE_KINDS) {
                const data = make_creature_data(kind, seed, parts);
                expect(data.attacks.length).toBeGreaterThan(0);
                const limb = parts.part(
                    data.parts[kind === "biped" ? "hand" : "foot"] ?? "",
                );
                expect(data.attacks.includes("claw")).toBe(
                    limb?.claws === true,
                );
                fire += data.attacks.includes("fire") ? 1 : 0;
                const creature = creature_from_data(data, parts);
                for (const name of data.attacks) {
                    expect(creature.attacks.has(name)).toBe(true);
                    expect(
                        Object.values(
                            creature.build.rig.clips![name].events ?? {},
                        ),
                    ).toContain("hit");
                }
            }
        }
        expect(fire).toBeGreaterThan(20);
        expect(fire).toBeLessThan(150);
    }, 30000);

    it("hits where the attack reaches: the bite at the mouth, the claw at the paw, fire as a cone", () => {
        const parts = kit();
        const data = make_creature_data("quadruped", 8, parts, {
            parts: { head: "head_snout", foot: "foot_claw" },
            attacks: ["bite", "fire", "claw"],
        });
        const creature = creature_from_data(data, parts);
        const hits: CreatureHitEvent[] = [];
        creature.events.attach(CreatureHitEvent, (hit) => hits.push(hit));
        for (const name of ["bite", "claw", "fire"]) {
            hits.length = 0;
            creature.attack(name);
            let streamed = false;
            for (let frame = 0; frame < 150; frame++) {
                creature.update(1 / 60);
                streamed ||= creature.streaming;
            }
            expect(hits.length).toBe(name === "fire" ? 4 : 1);
            expect(streamed).toBe(name === "fire");
            const hit = hits[0];
            const anchor = name === "claw" ? "front_r_sole" : "mouth";
            expect(hit.area.anchor).toBe(anchor);
            expect(hit.area.shape).toBe(name === "fire" ? "cone" : "circle");
            // In front of the creature, at its head or its front paw.
            expect(hit.x).toBeGreaterThan(0);
            const area = {
                x: hit.x,
                y: hit.y,
                angle: hit.angle,
                radius: hit.area.radius,
                shape: hit.area.shape,
                spread: hit.area.spread ?? 0,
            };
            expect(
                in_area(
                    area,
                    hit.x + Math.cos((hit.angle * Math.PI) / 180) * 5,
                    hit.y + Math.sin((hit.angle * Math.PI) / 180) * 5,
                ),
            ).toBe(true);
            expect(in_area(area, hit.x - 1000, hit.y)).toBe(false);
        }
    });

    it("a monster round-trips through SaveSlots", async () => {
        const saves = new SaveSlots<CreatureData | null>({
            version: 1,
            fresh: () => null,
            store: memory_store(),
            page: null,
        });
        for (const kind of CREATURE_KINDS) {
            const first = generate_creature(kind, 2026, kit(), {
                name: "Gustav",
            });
            expect(await saves.save(`slot-${kind}`, first.data)).toBe(true);
            const loaded = await saves.load(`slot-${kind}`);
            expect(loaded).toEqual(first.data);
            const second = creature_from_data(loaded!, kit());
            expect(second.build.rig).toEqual(first.build.rig);
            expect(pixels_of(loaded!)).toEqual([...first.pixels.data]);
        }
    }, 30000);

    it("a copy shares the rig and plays on its own", () => {
        const first = generate_creature("quadruped", 77, kit());
        const second = first.copy();
        expect(second.rig).toBe(first.rig);
        expect(second.data).toBe(first.data);
        expect(second.puppet).not.toBe(first.puppet);
        first.play("walk");
        first.update(0.3);
        second.update(0.3);
        expect(first.moving).toBe("walk");
        expect(second.moving).toBe("idle");
        expect(second.puppet.player.clip_name).toBe("idle");
    });

    it("refuses data that doesn't fit", () => {
        const parts = kit();
        const data = make_creature_data("quadruped", 1, parts);
        expect(() =>
            creature_from_data(
                { ...data, parts: { ...data.parts, torso: "nothing" } },
                parts,
            ),
        ).toThrow(/no part "nothing"/);
        expect(() =>
            creature_from_data(
                { ...data, kind: "dragon" as CreatureKind },
                parts,
            ),
        ).toThrow(/no creature kind "dragon"/);
        const empty = PartKit.from_data({ parts: {} });
        empty.pixels = KIT_SOURCE.pixels;
        expect(() => generate_creature("quadruped", 1, empty)).toThrow(
            /no (head|torso)/,
        );
        expect(() =>
            PartKit.from_data({
                parts: { a: { ...KIT_SOURCE.data.parts.torso, jaw: "b" } },
            }),
        ).toThrow(/jaw "b" is not a part/);
    });
});
