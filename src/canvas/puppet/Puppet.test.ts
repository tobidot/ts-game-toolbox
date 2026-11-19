/* eslint-disable @typescript-eslint/naming-convention -- times as keys, as a catalogue entry writes them */
import { describe, expect, it } from "vitest";
import { Puppet } from "./Puppet";
import { PuppetClip } from "./PuppetClip";
import {
    PuppetEndEvent,
    PuppetMomentEvent,
    PuppetPlayer,
} from "./PuppetPlayer";
import { PuppetRig } from "./PuppetRig";
import { RigData } from "./RigData";
import { Skeleton } from "./Skeleton";

/**
 * A small puppet: a hip 100 above the root pointing up, a torso of 50 on it, an arm hanging from
 * the top of the torso (upper and lower arm, 30 each).
 */
const BONES: RigData["bones"] = [
    { name: "root" },
    { name: "hip", parent: "root", y: -100, rotation: -90, length: 10 },
    { name: "torso", parent: "hip", rotation: 0, length: 50 },
    { name: "upper", parent: "torso", x: 50, rotation: 180, length: 30 },
    { name: "lower", parent: "upper", x: 30, length: 30 },
];

function rig_data(overrides: Partial<RigData> = {}): RigData {
    return {
        skeleton: "stick",
        bones: BONES,
        slots: [
            { name: "torso", bone: "torso" },
            { name: "upper", bone: "upper" },
            { name: "lower", bone: "lower" },
        ],
        skins: {
            plain: {
                attachments: {
                    torso: {
                        rect: [0, 0, 20, 60],
                        pivot: [10, 55],
                        rotation: 90,
                    },
                    upper: {
                        rect: [20, 0, 10, 36],
                        pivot: [5, 3],
                        rotation: -90,
                    },
                    lower: {
                        rect: [30, 0, 10, 36],
                        pivot: [5, 3],
                        rotation: -90,
                    },
                },
            },
        },
        anchors: { hand: { bone: "lower", x: 30, y: 0 } },
        clips: {
            idle: {
                length: 1,
                loop: true,
                tracks: { torso: [{ t: 0, rotation: 0 }] },
            },
        },
        default_clip: "idle",
        ...overrides,
    };
}

const near = (value: number, expected: number, digits = 6) =>
    expect(value).toBeCloseTo(expected, digits);

/** A context that keeps its transform and writes down what it is asked to draw. */
function recording_context() {
    let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const images: {
        image: unknown;
        source: number[];
        transform: typeof transform;
    }[] = [];
    let lines = 0;
    const context = {
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
        drawImage: (image: unknown, ...numbers: number[]) => {
            images.push({
                image,
                source: numbers.slice(0, 4),
                transform: { ...transform },
            });
        },
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {
            lines += 1;
        },
        arc: () => {},
        stroke: () => {},
        fill: () => {},
        lineWidth: 1,
        strokeStyle: "",
        fillStyle: "",
    };
    return {
        context: context as unknown as CanvasRenderingContext2D,
        images,
        transform: () => transform,
        lines: () => lines,
    };
}

/** Where a part's pivot lands on the screen under a recorded transform. */
function pivot_on_screen(
    entry: {
        transform: {
            a: number;
            b: number;
            c: number;
            d: number;
            e: number;
            f: number;
        };
    },
    pivot: readonly [number, number],
) {
    const m = entry.transform;
    return {
        x: m.a * pivot[0] + m.c * pivot[1] + m.e,
        y: m.b * pivot[0] + m.d * pivot[1] + m.f,
    };
}

describe("Skeleton", () => {
    it("puts a bone where its parent says, and moves it when the parent turns", () => {
        const skeleton = Skeleton.from_data(BONES);
        skeleton.update();
        const upper = skeleton.index_of("upper");
        near(skeleton.world_x(upper), 0);
        near(skeleton.world_y(upper), -150);
        near(skeleton.world_rotation(upper), 90);
        // The torso turns a quarter clockwise: it points right, the shoulder is 50 to the right.
        skeleton.rotation[skeleton.index_of("torso")] = 90;
        skeleton.update();
        near(skeleton.world_x(upper), 50);
        near(skeleton.world_y(upper), -100);
        near(skeleton.world_rotation(upper), 180);
    });

    it("reaches a known point with a two-bone arm", () => {
        const skeleton = Skeleton.from_data(BONES);
        // The upper arm straight forward (world 0°), the forearm straight down (world 90°).
        skeleton.rotation[skeleton.index_of("upper")] = -90;
        skeleton.rotation[skeleton.index_of("lower")] = 90;
        skeleton.update();
        const hand = skeleton.world_point(skeleton.index_of("lower"), 30, 0);
        near(hand.x, 30);
        near(hand.y, -120);
        // A shift of the hip moves everything above it.
        skeleton.y[skeleton.index_of("hip")] = 10;
        skeleton.update();
        near(skeleton.world_point(skeleton.index_of("lower"), 30, 0).y, -110);
        skeleton.reset_pose();
        skeleton.update();
        near(skeleton.world_point(skeleton.index_of("lower"), 30, 0).y, -90);
    });

    it("finds the bone nearest to a point", () => {
        const skeleton = Skeleton.from_data(BONES);
        // The arm straight forward: the upper arm from 0, -150 to 30, -150, the forearm on to 60, -150.
        skeleton.rotation[skeleton.index_of("upper")] = -90;
        skeleton.update();
        expect(skeleton.nearest_bone(15, -147, 10)).toBe(
            skeleton.index_of("upper"),
        );
        expect(skeleton.nearest_bone(2, -125, 10)).toBe(
            skeleton.index_of("torso"),
        );
        expect(skeleton.nearest_bone(45, -146, 10)).toBe(
            skeleton.index_of("lower"),
        );
        expect(skeleton.nearest_bone(80, 0, 10)).toBe(-1);
    });

    it("refuses bones out of order and twice the same name", () => {
        expect(() =>
            Skeleton.from_data([
                { name: "arm", parent: "body" },
                { name: "body" },
            ]),
        ).toThrow(/bone "arm": its parent "body" must come before it/);
        expect(() =>
            Skeleton.from_data([{ name: "a" }, { name: "a" }]),
        ).toThrow(/bone "a" twice/);
    });
});

describe("PuppetClip", () => {
    const index_of = (name: string) => ["root", "hip", "torso"].indexOf(name);

    it("finds a value between two keys by each easing", () => {
        const sample = (ease: "linear" | "smooth" | "step") => {
            const clip = PuppetClip.from_data(
                "turn",
                {
                    length: 1,
                    tracks: {
                        torso: [
                            { t: 0, rotation: 0, ease },
                            { t: 1, rotation: 100 },
                        ],
                    },
                },
                index_of,
                3,
            );
            const skeleton = Skeleton.from_data(BONES.slice(0, 3));
            clip.sample(0.25, skeleton);
            return skeleton.rotation[2];
        };
        near(sample("linear"), 25);
        near(sample("smooth"), 15.625);
        near(sample("step"), 0);
    });

    it("wraps a loop from its last key to its first", () => {
        const clip = PuppetClip.from_data(
            "sway",
            {
                length: 1,
                loop: true,
                tracks: {
                    torso: [
                        { t: 0.25, rotation: 0 },
                        { t: 0.5, rotation: 100 },
                    ],
                },
            },
            index_of,
            3,
        );
        const skeleton = Skeleton.from_data(BONES.slice(0, 3));
        clip.sample(0.875, skeleton);
        // From 100 at 0.5 to 0 at 1.25 (the first key, one round on): 0.375 of 0.75 is half.
        near(skeleton.rotation[2], 50);
        clip.sample(0.125, skeleton);
        // From 100 at -0.5 to 0 at 0.25.
        near(skeleton.rotation[2], 100 / 6);
    });

    it("leaves bones without keys at rest and takes each channel from the keys that have it", () => {
        const clip = PuppetClip.from_data(
            "bob",
            {
                length: 2,
                tracks: {
                    hip: [
                        { t: 0, y: 0 },
                        { t: 1, rotation: 10 },
                        { t: 2, y: 20 },
                    ],
                },
            },
            index_of,
            3,
        );
        const skeleton = Skeleton.from_data(BONES.slice(0, 3));
        skeleton.rotation[2] = 33;
        clip.sample(0.5, skeleton);
        near(skeleton.y[1], 5);
        near(skeleton.rotation[1], 10);
        near(skeleton.rotation[2], 0);
        expect(clip.to_data()).toEqual({
            length: 2,
            tracks: {
                hip: [
                    { t: 0, y: 0 },
                    { t: 1, rotation: 10 },
                    { t: 2, y: 20 },
                ],
            },
        });
    });

    it("refuses a clip on an unknown bone, keys out of order and events past its end", () => {
        expect(() =>
            PuppetClip.from_data(
                "wave",
                { length: 1, tracks: { tail: [{ t: 0, rotation: 1 }] } },
                index_of,
                3,
            ),
        ).toThrow(/clip "wave": no bone "tail"/);
        expect(() =>
            PuppetClip.from_data(
                "wave",
                {
                    length: 1,
                    tracks: {
                        torso: [
                            { t: 0.5, rotation: 1 },
                            { t: 0.2, rotation: 2 },
                        ],
                    },
                },
                index_of,
                3,
            ),
        ).toThrow(/clip "wave", bone "torso": key times must rise/);
        expect(() =>
            PuppetClip.from_data(
                "wave",
                { length: 1, events: { "1.5": "late" }, tracks: {} },
                index_of,
                3,
            ),
        ).toThrow(/clip "wave": an event at 1.5 s, past its end/);
        expect(() =>
            PuppetClip.from_data(
                "wave",
                { length: 0, tracks: {} },
                index_of,
                3,
            ),
        ).toThrow(/clip "wave": its length must be above 0/);
    });
});

describe("PuppetRig", () => {
    it("refuses a slot on an unknown bone, a part for an unknown slot and a clip on an unknown bone", () => {
        expect(() =>
            PuppetRig.from_data(
                rig_data({ slots: [{ name: "hand", bone: "wrist" }] }),
            ),
        ).toThrow(/slot "hand": no bone "wrist"/);
        expect(() =>
            PuppetRig.from_data(
                rig_data({
                    skins: {
                        plain: {
                            attachments: {
                                tail: { rect: [0, 0, 1, 1], pivot: [0, 0] },
                            },
                        },
                    },
                }),
            ),
        ).toThrow(/skin "plain": no slot "tail"/);
        expect(() =>
            PuppetRig.from_data(
                rig_data({
                    clips: {
                        wave: {
                            length: 1,
                            tracks: { tail: [{ t: 0, rotation: 1 }] },
                        },
                    },
                }),
            ),
        ).toThrow(/clip "wave": no bone "tail"/);
        expect(() =>
            PuppetRig.from_data(rig_data({ default_clip: "dance" })),
        ).toThrow(/default_clip "dance" is not a clip/);
        expect(() =>
            PuppetRig.from_data(
                rig_data({ anchors: { belt: { bone: "waist", x: 0, y: 0 } } }),
            ),
        ).toThrow(/anchor "belt": no bone "waist"/);
    });
});

/** Two clips that hold one angle each, a jump that goes on with idle, and a loop with moments. */
function player_rig(): PuppetRig {
    return PuppetRig.from_data(
        rig_data({
            clips: {
                idle: {
                    length: 1,
                    loop: true,
                    tracks: { torso: [{ t: 0, rotation: 0 }] },
                },
                left: {
                    length: 1,
                    loop: true,
                    tracks: { upper: [{ t: 0, rotation: 170 }] },
                },
                right: {
                    length: 1,
                    loop: true,
                    tracks: { upper: [{ t: 0, rotation: -170 }] },
                },
                jump: {
                    length: 0.5,
                    then: "idle",
                    tracks: {
                        hip: [
                            { t: 0, y: 0 },
                            { t: 0.5, y: -50 },
                        ],
                    },
                },
                walk: {
                    length: 1,
                    loop: true,
                    events: { "0": "step", "0.5": "step", "0.75": "swing" },
                    tracks: {
                        torso: [
                            { t: 0, rotation: 0 },
                            { t: 1, rotation: 100 },
                        ],
                    },
                },
            },
            default_clip: "idle",
        }),
    );
}

describe("PuppetPlayer", () => {
    it("loops, carrying the time over the end", () => {
        const rig = player_rig();
        const player = new PuppetPlayer(rig, "walk");
        player.update(2.25);
        expect(player.clip_name).toBe("walk");
        near(player.time, 0.25);
        const skeleton = rig.make_skeleton();
        player.apply(skeleton);
        near(skeleton.rotation[skeleton.index_of("torso")], 25);
    });

    it("goes on with `then` at the end of a clip played once, the time carried", () => {
        const player = new PuppetPlayer(player_rig(), "jump");
        player.default_fade = 0;
        const ends: string[] = [];
        player.events.attach(PuppetEndEvent, (event) => {
            ends.push(`${event.clip}>${event.next}`);
        });
        player.update(0.4);
        expect(player.clip_name).toBe("jump");
        player.update(0.2);
        expect(player.clip_name).toBe("idle");
        near(player.time, 0.1);
        expect(ends).toEqual(["jump>idle"]);
    });

    it("stops at the end of a clip played once that names nothing, and holds its last pose", () => {
        const rig = player_rig();
        rig.add_clip("bow", {
            length: 0.5,
            tracks: {
                torso: [
                    { t: 0, rotation: 0 },
                    { t: 0.5, rotation: 40 },
                ],
            },
        });
        const player = new PuppetPlayer(rig, "bow");
        player.update(3);
        expect(player.finished).toBe(true);
        near(player.time, 0.5);
        const skeleton = rig.make_skeleton();
        player.apply(skeleton);
        near(skeleton.rotation[skeleton.index_of("torso")], 40);
    });

    it("plays a queued clip at the exact end of a loop's round", () => {
        const player = new PuppetPlayer(player_rig(), "walk");
        player.default_fade = 0;
        player.update(0.7);
        expect(player.queue("jump")).toBe(true);
        player.update(0.4);
        expect(player.clip_name).toBe("jump");
        near(player.time, 0.1);
    });

    it("sends each moment once, also when one update passes several, at every speed", () => {
        for (const speed of [0.1, 0.5, 1, 3, 17]) {
            for (const step of [1 / 240, 1 / 60, 0.3, 2.7, 100]) {
                const player = new PuppetPlayer(player_rig(), "walk");
                player.speed = speed;
                const moments: string[] = [];
                player.events.attach(PuppetMomentEvent, (event) => {
                    moments.push(event.name);
                });
                // 3.6 seconds of the clip in steps of `step` seconds on the clock.
                let left = 3.6 / speed;
                while (left > 1e-9) {
                    const delta = Math.min(step, left);
                    player.update(delta);
                    left -= delta;
                }
                const count = (name: string) =>
                    moments.filter((moment) => moment === name).length;
                // Steps at 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5; swings at 0.75, 1.75, 2.75.
                expect([speed, step, count("step")]).toEqual([speed, step, 8]);
                expect([speed, step, count("swing")]).toEqual([speed, step, 3]);
            }
        }
    });

    it("sends no moments while paused or with sends_events off", () => {
        const player = new PuppetPlayer(player_rig(), "walk");
        const moments: string[] = [];
        player.events.attach(PuppetMomentEvent, (event) => {
            moments.push(event.name);
        });
        player.paused = true;
        player.update(2);
        expect(moments).toEqual([]);
        near(player.time, 0);
        player.paused = false;
        player.sends_events = false;
        player.update(2);
        expect(moments).toEqual([]);
    });

    it("blends the angles of a fade the short way round", () => {
        const rig = player_rig();
        const player = new PuppetPlayer(rig, "left");
        player.update(0.1);
        player.play("right", { fade: 0.2 });
        player.update(0.1);
        expect(player.fading).toBe(true);
        const skeleton = rig.make_skeleton();
        player.apply(skeleton);
        // From +170 to -170 the short way passes 180, not 0.
        near(skeleton.rotation[skeleton.index_of("upper")], 180);
        player.update(0.15);
        expect(player.fading).toBe(false);
        player.apply(skeleton);
        near(skeleton.rotation[skeleton.index_of("upper")], -170);
    });

    it("refuses clips the rig doesn't have and waits for a rig whose data comes later", () => {
        const rig = new PuppetRig();
        const player = new PuppetPlayer(rig, "walk");
        expect(player.clip).toBeNull();
        expect(player.clip_name).toBe("walk");
        player.update(0.5);
        rig.set_data(player_rig_data());
        player.update(0.25);
        expect(player.clip_name).toBe("walk");
        near(player.time, 0.25);
        expect(player.play("dance")).toBe(false);
        expect(player.clip_name).toBe("walk");
    });
});

function player_rig_data(): RigData {
    return {
        ...rig_data(),
        clips: {
            idle: { length: 1, loop: true, tracks: {} },
            walk: { length: 1, loop: true, tracks: {} },
        },
    };
}

describe("Puppet", () => {
    const image = { width: 64, height: 64 } as unknown as CanvasImageSource;
    const other_image = {
        width: 32,
        height: 32,
    } as unknown as CanvasImageSource;

    function other_skin_rig(skeleton = "stick"): PuppetRig {
        return PuppetRig.from_data(
            rig_data({
                skeleton,
                skins: {
                    fancy: {
                        attachments: {
                            torso: {
                                rect: [1, 1, 24, 64],
                                pivot: [12, 60],
                                rotation: 90,
                            },
                            upper: {
                                rect: [2, 2, 12, 40],
                                pivot: [6, 4],
                                rotation: -90,
                            },
                            lower: {
                                rect: [3, 3, 12, 40],
                                pivot: [6, 4],
                                rotation: -90,
                            },
                        },
                    },
                },
                clips: {},
                default_clip: undefined,
            }),
            other_image,
        );
    }

    it("draws its parts in slot order, each part's pivot on its bone's joint", () => {
        const rig = PuppetRig.from_data(rig_data(), image);
        const puppet = rig.puppet();
        puppet.update(0);
        const drawn = recording_context();
        expect(puppet.draw(drawn.context, 200, 300)).toBe(true);
        expect(drawn.images.map((entry) => entry.source)).toEqual([
            [0, 0, 20, 60],
            [20, 0, 10, 36],
            [30, 0, 10, 36],
        ]);
        const torso = pivot_on_screen(drawn.images[0], [10, 55]);
        near(torso.x, 200);
        near(torso.y, 200);
        const upper = pivot_on_screen(drawn.images[1], [5, 3]);
        near(upper.x, 200);
        near(upper.y, 150);
        const lower = pivot_on_screen(drawn.images[2], [5, 3]);
        near(lower.x, 200);
        near(lower.y, 180);
        // At rest every part is drawn upright, as it lies in the atlas.
        near(drawn.images[1].transform.a, 1);
        near(drawn.images[1].transform.b, 0);
        // The context's transform is given back.
        expect(drawn.transform()).toEqual({
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: 0,
            f: 0,
        });
    });

    it("mirrors and scales around its feet, and draws its bones on demand", () => {
        const rig = PuppetRig.from_data(rig_data(), image);
        const puppet = rig.puppet();
        puppet.skeleton.rotation[puppet.skeleton.index_of("upper")] = -90;
        puppet.skeleton.update();
        const drawn = recording_context();
        puppet.draw(drawn.context, 100, 100, {
            flip_x: true,
            scale: 0.5,
            debug: true,
        });
        // The forward-pointing arm (pivot of the forearm 30 ahead of the shoulder) points left.
        const lower = pivot_on_screen(drawn.images[2], [5, 3]);
        near(lower.x, 100 - 15);
        near(lower.y, 100 - 75);
        expect(drawn.lines()).toBeGreaterThanOrEqual(4);
    });

    it("finds the part drawn on top at a point, where bone lines lie on each other", () => {
        const rig = PuppetRig.from_data(rig_data(), image);
        const puppet = rig.puppet();
        puppet.update(0);
        // The arm hangs over the torso: both bone lines run down x = 0.
        const upper = rig.slot_index("upper");
        const torso = rig.slot_index("torso");
        expect(puppet.slot_at(1, -135)).toBe(upper);
        expect(puppet.slot_at(1, -100)).toBe(rig.slot_index("lower"));
        // Beside the arm the torso shows.
        expect(puppet.slot_at(8, -135)).toBe(torso);
        expect(puppet.slot_at(30, -135)).toBe(-1);
        // The arm turned forward leaves the torso bare where it hung.
        puppet.skeleton.rotation[puppet.skeleton.index_of("upper")] = -90;
        puppet.skeleton.update();
        expect(puppet.slot_at(1, -135)).toBe(torso);
        expect(puppet.slot_at(20, -150)).toBe(upper);
        // Nothing to hit without a skin.
        expect(new PuppetRig().puppet().slot_at(0, 0)).toBe(-1);
    });

    it("picks the bone a pointer means: the part on top on one line, else the nearest line of the parts there", () => {
        const rig = PuppetRig.from_data(rig_data(), image);
        const puppet = rig.puppet();
        puppet.update(0);
        const skeleton = puppet.skeleton;
        // On the arm hanging over the torso: the arm, drawn on top.
        expect(puppet.pick_bone(0.5, -135, 5)).toBe(skeleton.index_of("upper"));
        // Where the forearm's part reaches over the elbow's joint, the upper arm's line is nearer.
        expect(puppet.slot_at(0, -122)).toBe(rig.slot_index("lower"));
        expect(puppet.pick_bone(0, -122, 5)).toBe(skeleton.index_of("upper"));
        // Off every part: the nearest line within reach, or none.
        expect(puppet.slot_at(0, -86)).toBe(-1);
        expect(puppet.pick_bone(0, -86, 6)).toBe(skeleton.index_of("lower"));
        expect(puppet.pick_bone(0, -60, 6)).toBe(-1);
        near(skeleton.distance_to_bone(skeleton.index_of("torso"), 7, -120), 7);
    });

    it("wears a second skin on the same bones with other parts, and refuses another skeleton's", () => {
        const rig = PuppetRig.from_data(rig_data(), image);
        const puppet = rig.puppet();
        puppet.skeleton.rotation[puppet.skeleton.index_of("torso")] = 30;
        puppet.skeleton.update();
        const before = recording_context();
        puppet.draw(before.context, 0, 0);
        const fancy = other_skin_rig();
        expect(puppet.set_skin(fancy)).toBe(true);
        const after = recording_context();
        puppet.draw(after.context, 0, 0);
        expect(after.images.map((entry) => entry.image)).toEqual([
            other_image,
            other_image,
            other_image,
        ]);
        expect(after.images.map((entry) => entry.source)).toEqual([
            [1, 1, 24, 64],
            [2, 2, 12, 40],
            [3, 3, 12, 40],
        ]);
        // Each part's pivot lands on the same joint as the first skin's.
        for (const [slot, first, second] of [
            [0, [10, 55], [12, 60]],
            [1, [5, 3], [6, 4]],
            [2, [5, 3], [6, 4]],
        ] as const) {
            const a = pivot_on_screen(before.images[slot], first);
            const b = pivot_on_screen(after.images[slot], second);
            near(a.x, b.x);
            near(a.y, b.y);
        }
        expect(puppet.skin?.name).toBe("fancy");
        expect(puppet.set_skin(other_skin_rig("spider"))).toBe(false);
        expect(puppet.skin?.name).toBe("fancy");
        expect(puppet.set_skin("plain")).toBe(true);
        expect(puppet.skin?.name).toBe("plain");
    });

    it("waits for its data and picture, then plays its clip", () => {
        const rig = new PuppetRig();
        const puppet = new Puppet(rig, "walk");
        puppet.update(0.1);
        expect(puppet.draw(recording_context().context, 0, 0)).toBe(false);
        rig.set_data(player_rig().data!);
        puppet.update(0.25);
        expect(puppet.player.clip_name).toBe("walk");
        expect(puppet.draw(recording_context().context, 0, 0)).toBe(false);
        rig.image = image;
        const drawn = recording_context();
        expect(puppet.draw(drawn.context, 0, 0)).toBe(true);
        expect(drawn.images).toHaveLength(3);
        near(puppet.skeleton.rotation[puppet.skeleton.index_of("torso")], 25);
    });
});
