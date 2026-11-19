/* eslint-disable @typescript-eslint/naming-convention -- times as keys, as a catalogue entry writes them */
import { describe, expect, it } from "vitest";
import { memory_store } from "../../storage/saves/SaveStore";
import { SaveSlots } from "../../storage/saves/SaveSlots";
import { OutfitEvent } from "./Puppet";
import { PuppetRig } from "./PuppetRig";
import { is_wardrobe_data, OutfitData, RigData, WardrobeData } from "./RigData";
import { Wardrobe } from "./Wardrobe";

/**
 * A small puppet: a hip 100 above the root pointing up, a torso of 50 on it, a head of 20 on the
 * torso, an arm hanging from the top of the torso (upper and lower arm, 30 each). Anchors: the top
 * of the head and the hand, both turned to point forward (+x) at rest.
 */
function rig_data(overrides: Partial<RigData> = {}): RigData {
    return {
        skeleton: "stick",
        bones: [
            { name: "root" },
            { name: "hip", parent: "root", y: -100, rotation: -90, length: 10 },
            { name: "torso", parent: "hip", length: 50 },
            { name: "head", parent: "torso", x: 50, length: 20 },
            {
                name: "upper",
                parent: "torso",
                x: 50,
                rotation: 180,
                length: 30,
            },
            { name: "lower", parent: "upper", x: 30, length: 30 },
        ],
        slots: [
            { name: "torso", bone: "torso" },
            { name: "head", bone: "head" },
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
                    head: {
                        rect: [20, 0, 20, 24],
                        pivot: [10, 22],
                        rotation: 90,
                    },
                    upper: {
                        rect: [40, 0, 10, 36],
                        pivot: [5, 3],
                        rotation: -90,
                    },
                    lower: {
                        rect: [50, 0, 10, 36],
                        pivot: [5, 3],
                        rotation: -90,
                    },
                },
            },
        },
        anchors: {
            head_top: { bone: "head", x: 20, y: 0, rotation: 90 },
            hand: { bone: "lower", x: 30, y: 0, rotation: -90 },
        },
        clips: {
            idle: {
                length: 1,
                loop: true,
                tracks: { torso: [{ t: 0, rotation: 0 }] },
            },
            run: {
                length: 0.8,
                loop: true,
                tracks: {
                    hip: [
                        { t: 0, y: 0 },
                        { t: 0.4, y: -6 },
                        { t: 0.8, y: 0 },
                    ],
                    torso: [
                        { t: 0, rotation: 12 },
                        { t: 0.4, rotation: 4 },
                        { t: 0.8, rotation: 12 },
                    ],
                    head: [
                        { t: 0, rotation: -8 },
                        { t: 0.2, rotation: 6, ease: "smooth" },
                        { t: 0.8, rotation: -8 },
                    ],
                    upper: [
                        { t: 0, rotation: -40 },
                        { t: 0.4, rotation: 35 },
                        { t: 0.8, rotation: -40 },
                    ],
                    lower: [
                        { t: 0, rotation: -60 },
                        { t: 0.4, rotation: -10 },
                        { t: 0.8, rotation: -60 },
                    ],
                },
            },
        },
        default_clip: "idle",
        ...overrides,
    };
}

/** Clothes for the stick: a hat, a coat (torso, two sleeves, layered over a shirt), a cape, a sword. */
function wardrobe_data(overrides: Partial<WardrobeData> = {}): WardrobeData {
    return {
        skeleton: "stick",
        places: { shirt: 10, top: 20, back: 30, hat: 40, hand: 50 },
        pieces: {
            "straw-hat": {
                place: "hat",
                title: "Strohhut",
                parts: [
                    {
                        name: "hat",
                        anchor: "head_top",
                        rect: [0, 0, 40, 16],
                        pivot: [20, 12],
                    },
                ],
            },
            shirt: {
                place: "shirt",
                parts: [
                    {
                        name: "torso",
                        bone: "torso",
                        rect: [0, 20, 22, 58],
                        pivot: [11, 54],
                        rotation: 90,
                    },
                    {
                        name: "sleeve",
                        bone: "upper",
                        rect: [24, 20, 12, 20],
                        pivot: [6, 4],
                        rotation: -90,
                    },
                ],
            },
            "blue-coat": {
                place: "top",
                title: "Blauer Mantel",
                parts: [
                    {
                        name: "torso",
                        bone: "torso",
                        rect: [40, 20, 26, 64],
                        pivot: [13, 58],
                        rotation: 90,
                    },
                    {
                        name: "sleeve_upper",
                        bone: "upper",
                        rect: [70, 20, 14, 36],
                        pivot: [7, 4],
                        rotation: -90,
                    },
                    {
                        name: "sleeve_lower",
                        bone: "lower",
                        rect: [86, 20, 14, 30],
                        pivot: [7, 4],
                        rotation: -90,
                    },
                ],
            },
            cape: {
                place: "back",
                parts: [
                    {
                        name: "cape",
                        bone: "torso",
                        behind: "torso",
                        rect: [0, 90, 30, 70],
                        pivot: [15, 66],
                        rotation: 90,
                    },
                ],
            },
            sword: {
                place: "hand",
                parts: [
                    {
                        name: "blade",
                        anchor: "hand",
                        behind: "lower",
                        rect: [40, 90, 60, 8],
                        pivot: [6, 4],
                    },
                ],
            },
            glove: {
                place: "hand",
                parts: [
                    {
                        name: "glove",
                        bone: "lower",
                        slot: "lower",
                        rect: [100, 90, 12, 36],
                        pivot: [6, 3],
                        rotation: -90,
                    },
                ],
            },
            "tail-hat": {
                place: "hat",
                parts: [
                    {
                        name: "hat",
                        anchor: "tail_tip",
                        rect: [0, 0, 10, 10],
                        pivot: [5, 5],
                    },
                ],
            },
        },
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
        lineTo: () => {},
        arc: () => {},
        stroke: () => {},
        fill: () => {},
    };
    return {
        context: context as unknown as CanvasRenderingContext2D,
        images,
    };
}

type Recorded = ReturnType<typeof recording_context>["images"][number];

/** Where a point of a part lands on the screen under a recorded transform. */
function on_screen(entry: Recorded, point: readonly [number, number]) {
    const m = entry.transform;
    return {
        x: m.a * point[0] + m.c * point[1] + m.e,
        y: m.b * point[0] + m.d * point[1] + m.f,
    };
}

/** A recorded part's angle on the screen, in degrees. */
function angle_of(entry: Recorded): number {
    return (Math.atan2(entry.transform.b, entry.transform.a) * 180) / Math.PI;
}

const same_angle = (a: number, b: number) => {
    const turned = ((((a - b + 180) % 360) + 360) % 360) - 180;
    near(turned, 0, 6);
};

const BODY_PICTURE = { name: "body atlas" } as unknown as CanvasImageSource;
const CLOTHES_PICTURE = {
    name: "clothes atlas",
} as unknown as CanvasImageSource;

function dressed(clip = "idle") {
    const rig = PuppetRig.from_data(rig_data(), BODY_PICTURE);
    const wardrobe = Wardrobe.from_data(wardrobe_data(), CLOTHES_PICTURE);
    const puppet = rig.puppet(clip);
    puppet.use_wardrobe(wardrobe);
    return { rig, wardrobe, puppet };
}

/** The key times of the run, and the times halfway between them. */
const RUN_TIMES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

describe("Wardrobe", () => {
    it("reads pieces by place, and tells a wardrobe's rig from a puppet's", () => {
        const wardrobe = Wardrobe.from_data(wardrobe_data());
        expect(wardrobe.skeleton_name).toBe("stick");
        expect(wardrobe.piece("straw-hat")?.title).toBe("Strohhut");
        expect(wardrobe.piece("shirt")?.title).toBe("shirt");
        expect(wardrobe.pieces_in("hand").map((piece) => piece.id)).toEqual([
            "sword",
            "glove",
        ]);
        expect(wardrobe.piece("blue-coat")?.parts[1].layer).toBe(20);
        expect(is_wardrobe_data(wardrobe_data())).toBe(true);
        expect(is_wardrobe_data(rig_data())).toBe(false);
    });

    it("refuses data that doesn't hold together, and keeps what it had", () => {
        const wardrobe = Wardrobe.from_data(wardrobe_data());
        const broken = (pieces: WardrobeData["pieces"]) => () =>
            wardrobe.set_data(wardrobe_data({ pieces }));
        const part = { rect: [0, 0, 1, 1], pivot: [0, 0] } as const;
        expect(
            broken({
                a: { place: "socks", parts: [{ ...part, bone: "torso" }] },
            }),
        ).toThrow('piece "a": the wardrobe has no place "socks"');
        expect(broken({ a: { place: "hat", parts: [] } })).toThrow(
            'piece "a" has no parts',
        );
        expect(broken({ a: { place: "hat", parts: [{ ...part }] } })).toThrow(
            'piece "a", part "0": name either a bone or an anchor',
        );
        expect(
            broken({
                a: {
                    place: "hat",
                    parts: [{ ...part, bone: "head", anchor: "head_top" }],
                },
            }),
        ).toThrow("name either a bone or an anchor");
        expect(
            broken({
                a: {
                    place: "hat",
                    parts: [
                        {
                            ...part,
                            name: "top",
                            bone: "head",
                            behind: "head",
                            in_front_of: "head",
                        },
                    ],
                },
            }),
        ).toThrow(
            'piece "a", part "top": one of in_front_of, behind or slot, not in_front_of and behind',
        );
        expect(
            broken({
                a: {
                    place: "hat",
                    parts: [
                        {
                            rect: [0, 0, "wide"],
                            pivot: [0, 0],
                            bone: "head",
                        } as never,
                    ],
                },
            }),
        ).toThrow(
            "rect [x, y, width, height] and pivot [x, y] must be numbers",
        );
        expect(() =>
            wardrobe.set_data({ ...wardrobe_data(), skeleton: "" }),
        ).toThrow("a wardrobe names its skeleton");
        expect(wardrobe.piece("straw-hat")).not.toBeNull();
        expect(wardrobe.version).toBe(1);
    });

    it("refuses a piece for a missing anchor, bone or slot, and one of another skeleton", () => {
        const { puppet, wardrobe, rig } = dressed();
        expect(puppet.wear("tail-hat")).toBe(false);
        expect(puppet.fit_problems("tail-hat")).toEqual([
            'piece "tail-hat", part "hat": no anchor "tail_tip"',
        ]);
        expect(puppet.outfit).toEqual({});
        expect(wardrobe.problems_on(rig, "straw-hat")).toEqual([]);

        const odd = Wardrobe.from_data(
            wardrobe_data({
                pieces: {
                    tail: {
                        place: "back",
                        parts: [
                            {
                                name: "tail",
                                bone: "tail",
                                rect: [0, 0, 1, 1],
                                pivot: [0, 0],
                            },
                        ],
                    },
                    bow: {
                        place: "hat",
                        parts: [
                            {
                                name: "bow",
                                anchor: "head_top",
                                in_front_of: "ear",
                                rect: [0, 0, 1, 1],
                                pivot: [0, 0],
                            },
                        ],
                    },
                },
            }),
        );
        expect(odd.problems_on(rig, "tail")).toEqual([
            'piece "tail", part "tail": no bone "tail"',
        ]);
        expect(odd.problems_on(rig, "bow")).toEqual([
            'piece "bow", part "bow": no slot "ear"',
        ]);
        expect(odd.problems_on(rig, "scarf")).toEqual(['no piece "scarf"']);

        const crab_rig = PuppetRig.from_data(rig_data({ skeleton: "crab" }));
        expect(wardrobe.problems_on(crab_rig, "straw-hat")).toEqual([
            'piece "straw-hat" is made for the skeleton "stick", not "crab"',
        ]);
        const crab = crab_rig.puppet();
        crab.use_wardrobe(wardrobe);
        expect(crab.wear("straw-hat")).toBe(false);
        expect(puppet.wear("socks")).toBe(false);
    });

    it("keeps a hat on top of the head through the run", () => {
        const { puppet } = dressed("run");
        expect(puppet.wear("straw-hat")).toBe(true);
        const { context, images } = recording_context();
        for (const t of RUN_TIMES) {
            puppet.player.seek(t);
            puppet.update(0);
            images.length = 0;
            puppet.draw(context, 300, 400, { scale: 0.5 });
            const hat = images.find((entry) => entry.image === CLOTHES_PICTURE);
            expect(hat).toBeDefined();
            const anchor = puppet.anchor_world("head_top", 300, 400, {
                scale: 0.5,
            });
            expect(anchor).not.toBeNull();
            const pivot = on_screen(hat as Recorded, [20, 12]);
            near(pivot.x, (anchor as { x: number }).x);
            near(pivot.y, (anchor as { y: number }).y);
            same_angle(
                angle_of(hat as Recorded),
                (anchor as { rotation: number }).rotation,
            );
            // The top of the head: 20 along the head bone from its joint.
            const head = puppet.skeleton;
            const index = head.index_of("head");
            const top = head.world_point(index, 20, 0);
            near(pivot.x, 300 + top.x * 0.5);
            near(pivot.y, 400 + top.y * 0.5);
            same_angle(
                (anchor as { rotation: number }).rotation,
                head.world_rotation(index) + 90,
            );
        }
    });

    it("keeps a sleeve on its arm at every key, turned as the arm is", () => {
        const { puppet } = dressed("run");
        puppet.wear("blue-coat");
        const { context, images } = recording_context();
        for (const t of RUN_TIMES) {
            puppet.player.seek(t);
            puppet.update(0);
            images.length = 0;
            puppet.draw(context, 0, 0);
            const order = puppet.drawing_order;
            const arm = images[order.indexOf("upper")];
            const sleeve = images[order.indexOf("blue-coat:sleeve_upper")];
            const lower_sleeve =
                images[order.indexOf("blue-coat:sleeve_lower")];
            const skeleton = puppet.skeleton;
            const upper = skeleton.index_of("upper");
            const lower = skeleton.index_of("lower");
            // Both pivots on the shoulder, both parts turned alike.
            const arm_pivot = on_screen(arm, [5, 3]);
            const sleeve_pivot = on_screen(sleeve, [7, 4]);
            near(sleeve_pivot.x, skeleton.world_x(upper));
            near(sleeve_pivot.y, skeleton.world_y(upper));
            near(arm_pivot.x, sleeve_pivot.x);
            near(arm_pivot.y, sleeve_pivot.y);
            same_angle(angle_of(sleeve), angle_of(arm));
            same_angle(angle_of(sleeve), skeleton.world_rotation(upper) - 90);
            const elbow = on_screen(lower_sleeve, [7, 4]);
            near(elbow.x, skeleton.world_x(lower));
            near(elbow.y, skeleton.world_y(lower));
            same_angle(
                angle_of(lower_sleeve),
                skeleton.world_rotation(lower) - 90,
            );
        }
    });

    it("puts clothes in front of and behind slots as the data says, layer by layer (pinned)", () => {
        const { puppet } = dressed();
        expect(puppet.drawing_order).toEqual([
            "torso",
            "head",
            "upper",
            "lower",
        ]);
        puppet.wear("blue-coat");
        puppet.wear("straw-hat");
        puppet.wear("shirt");
        puppet.wear("cape");
        puppet.wear("sword");
        expect(puppet.drawing_order).toEqual([
            "cape:cape",
            "torso",
            "shirt:torso",
            "blue-coat:torso",
            "head",
            "straw-hat:hat",
            "upper",
            "shirt:sleeve",
            "blue-coat:sleeve_upper",
            "sword:blade",
            "lower",
            "blue-coat:sleeve_lower",
        ]);
        // The coat off, the glove on in the hand's place (it takes the lower arm's slot itself).
        puppet.take_off("top");
        puppet.wear("glove");
        expect(puppet.outfit).toEqual({
            hat: "straw-hat",
            shirt: "shirt",
            back: "cape",
            hand: "glove",
        });
        expect(puppet.drawing_order).toEqual([
            "cape:cape",
            "torso",
            "shirt:torso",
            "head",
            "straw-hat:hat",
            "upper",
            "shirt:sleeve",
            "glove:glove",
        ]);
    });

    it("sorts once per outfit change, never per frame", () => {
        const { puppet } = dressed("run");
        puppet.wear("blue-coat");
        const { context } = recording_context();
        const order = puppet.drawing_order;
        for (let frame = 0; frame < 30; frame++) {
            puppet.update(1 / 60);
            puppet.draw(context, 0, 0);
        }
        expect(puppet.drawing_order).toBe(order);
        puppet.wear("straw-hat");
        expect(puppet.drawing_order).not.toBe(order);
        const after = puppet.drawing_order;
        puppet.wear("straw-hat");
        expect(puppet.drawing_order).toBe(after);
    });

    it("tells of every change with one event, and takes off by place or by id", () => {
        const { puppet } = dressed();
        const events: OutfitEvent[] = [];
        puppet.events.attach(OutfitEvent, (event) => events.push(event));
        puppet.wear("straw-hat");
        puppet.wear("sword");
        puppet.wear("glove");
        expect(puppet.take_off("glove")).toBe(true);
        expect(puppet.take_off("hand")).toBe(false);
        expect(puppet.take_off("hat")).toBe(true);
        expect(events.map((event) => [event.put_on, event.taken_off])).toEqual([
            [["straw-hat"], []],
            [["sword"], []],
            [["glove"], ["sword"]],
            [[], ["glove"]],
            [[], ["straw-hat"]],
        ]);
        expect(puppet.set_outfit({ hat: "straw-hat", top: "blue-coat" })).toBe(
            true,
        );
        expect(events.at(-1)?.put_on).toEqual(["straw-hat", "blue-coat"]);
        expect(events.at(-1)?.outfit).toEqual({
            hat: "straw-hat",
            top: "blue-coat",
        });
        // A piece in the wrong place, one that doesn't fit and one nobody has: left out.
        expect(
            puppet.set_outfit({
                hat: "blue-coat",
                back: "tail-hat",
                top: "blue-coat",
                feet: "boots",
            }),
        ).toBe(false);
        expect(puppet.outfit).toEqual({ top: "blue-coat" });
        expect(events.at(-1)?.taken_off).toEqual(["straw-hat"]);
        const count = events.length;
        puppet.set_outfit({ top: "blue-coat" });
        expect(events.length).toBe(count);
        puppet.undress();
        expect(puppet.outfit).toEqual({});
    });

    it("wears an outfit whose wardrobe comes later, and drops what turns out not to fit", () => {
        const rig = PuppetRig.from_data(rig_data(), BODY_PICTURE);
        const wardrobe = new Wardrobe();
        const puppet = rig.puppet();
        puppet.use_wardrobe(wardrobe);
        const events: OutfitEvent[] = [];
        puppet.events.attach(OutfitEvent, (event) => events.push(event));
        expect(puppet.wear("straw-hat")).toBe(false);
        expect(puppet.set_outfit({ hat: "straw-hat", back: "tail-hat" })).toBe(
            true,
        );
        const { context, images } = recording_context();
        puppet.draw(context, 0, 0);
        expect(images.length).toBe(4);
        wardrobe.set_data(wardrobe_data());
        puppet.draw(context, 0, 0);
        expect(puppet.outfit).toEqual({ hat: "straw-hat" });
        expect(events.at(-1)?.taken_off).toEqual(["tail-hat"]);
        // The clothes' picture is not there yet: the body draws, the hat waits.
        images.length = 0;
        puppet.draw(context, 0, 0);
        expect(images.length).toBe(4);
        wardrobe.image = CLOTHES_PICTURE;
        images.length = 0;
        puppet.draw(context, 0, 0);
        expect(images.map((entry) => entry.image)).toEqual([
            BODY_PICTURE,
            BODY_PICTURE,
            CLOTHES_PICTURE,
            BODY_PICTURE,
            BODY_PICTURE,
        ]);
    });

    it("finds pieces in several wardrobes, each part drawn from its own atlas", () => {
        const rig = PuppetRig.from_data(rig_data(), BODY_PICTURE);
        const hats = Wardrobe.from_data(
            wardrobe_data({
                pieces: { "straw-hat": wardrobe_data().pieces["straw-hat"] },
            }),
            CLOTHES_PICTURE,
        );
        const other = {
            name: "accessories atlas",
        } as unknown as CanvasImageSource;
        const accessories = Wardrobe.from_data(
            wardrobe_data({ pieces: { sword: wardrobe_data().pieces.sword } }),
            other,
        );
        const puppet = rig.puppet();
        puppet.use_wardrobe(hats);
        puppet.use_wardrobe(accessories);
        puppet.use_wardrobe(hats);
        expect(puppet.wardrobes.length).toBe(2);
        expect(puppet.set_outfit({ hat: "straw-hat", hand: "sword" })).toBe(
            true,
        );
        const { context, images } = recording_context();
        puppet.draw(context, 0, 0);
        expect(images.filter((entry) => entry.image === other).length).toBe(1);
        expect(
            images.filter((entry) => entry.image === CLOTHES_PICTURE).length,
        ).toBe(1);
        expect(puppet.worn_pieces.map((piece) => piece.id)).toEqual([
            "straw-hat",
            "sword",
        ]);
    });

    it("says where an anchor is, in the puppet's space and mirrored on the stage", () => {
        const { puppet } = dressed();
        puppet.update(0);
        const own = puppet.anchor_world("hand");
        // At rest the arm hangs from the top of the torso (150 above the feet), 60 long.
        near(own?.x ?? NaN, 0);
        near(own?.y ?? NaN, -90);
        same_angle(own?.rotation ?? NaN, 0);
        const flipped = puppet.anchor_world("head_top", 200, 300, {
            scale: 2,
            flip_x: true,
        });
        near(flipped?.x ?? NaN, 200);
        near(flipped?.y ?? NaN, 300 - 170 * 2);
        same_angle(flipped?.rotation ?? NaN, 180);
        expect(puppet.anchor_world("tail_tip")).toBeNull();
    });

    it("keeps an outfit through a save slot: the same pieces, the same drawing order", async () => {
        const { puppet, rig, wardrobe } = dressed();
        puppet.set_outfit({
            hat: "straw-hat",
            top: "blue-coat",
            back: "cape",
            hand: "sword",
        });
        const order = [...puppet.drawing_order];
        const saves = new SaveSlots<{ outfit: OutfitData }>({
            version: 1,
            fresh: () => ({ outfit: {} }),
            store: memory_store(),
            page: null,
        });
        expect(await saves.save("slot-1", { outfit: puppet.outfit })).toBe(
            true,
        );
        const loaded = await saves.load("slot-1");
        const again = rig.puppet();
        again.use_wardrobe(wardrobe);
        expect(again.set_outfit(loaded.outfit)).toBe(true);
        expect(again.outfit).toEqual(puppet.outfit);
        expect(again.drawing_order).toEqual(order);
    });
});
