/* eslint-disable @typescript-eslint/naming-convention -- DOM names in the software canvas */
import { describe, expect, it } from "vitest";
import { memory_store } from "../../storage/saves/SaveStore";
import { SaveSlots } from "../../storage/saves/SaveSlots";
import { MarkSheet } from "./MarkSheet";
import { PartMesh, push_weight } from "./PartMesh";
import { PuppetRig } from "./PuppetRig";
import { CharacterData, PuppetClipData, RigData } from "./RigData";
import { Skeleton } from "./Skeleton";

// ---- a small software canvas: enough of the 2D context to look at baked pixels ----

type Rgba = [number, number, number, number];
type Polygon = [number, number][];

/** A canvas in memory: straight RGBA from 0 to 1, drawn by pixel middles, nearest sampling. */
class SoftCanvas {
    public data: Float64Array;
    private soft_context: SoftContext | null = null;

    public constructor(
        private canvas_width: number,
        private canvas_height: number,
    ) {
        this.data = new Float64Array(canvas_width * canvas_height * 4);
    }

    public get width(): number {
        return this.canvas_width;
    }

    public set width(value: number) {
        this.canvas_width = value;
        this.data = new Float64Array(value * this.canvas_height * 4);
    }

    public get height(): number {
        return this.canvas_height;
    }

    public set height(value: number) {
        this.canvas_height = value;
        this.data = new Float64Array(this.canvas_width * value * 4);
    }

    public getContext(): SoftContext {
        this.soft_context = this.soft_context ?? new SoftContext(this);
        return this.soft_context;
    }

    public pixel(x: number, y: number): Rgba {
        const at = (y * this.width + x) * 4;
        return [
            this.data[at],
            this.data[at + 1],
            this.data[at + 2],
            this.data[at + 3],
        ];
    }

    public set(x: number, y: number, colour: Rgba): void {
        this.data.set(colour, (y * this.width + x) * 4);
    }

    /** Fills a rectangle of whole pixels with one colour. */
    public paint(
        left: number,
        top: number,
        width: number,
        height: number,
        colour: Rgba,
    ): void {
        for (let y = top; y < top + height; y++) {
            for (let x = left; x < left + width; x++) {
                this.set(x, y, colour);
            }
        }
    }
}

function parse_colour(text: string): Rgba {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
    if (match === null) {
        throw new Error(`the software canvas reads #rrggbb, not ${text}`);
    }
    return [
        parseInt(match[1], 16) / 255,
        parseInt(match[2], 16) / 255,
        parseInt(match[3], 16) / 255,
        1,
    ];
}

function inside(polygon: Polygon, x: number, y: number): boolean {
    let is_inside = false;
    for (
        let index = 0, before = polygon.length - 1;
        index < polygon.length;
        before = index++
    ) {
        const [xi, yi] = polygon[index];
        const [xj, yj] = polygon[before];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            is_inside = !is_inside;
        }
    }
    return is_inside;
}

class SoftContext {
    public globalAlpha = 1;
    public globalCompositeOperation = "source-over";
    public fillStyle = "#000000";
    public imageSmoothingEnabled = true;
    private matrix = [1, 0, 0, 1, 0, 0];
    private path: Polygon[] = [];
    private clips: Polygon[][] = [];
    private stack: {
        matrix: number[];
        alpha: number;
        operation: string;
        clips: Polygon[][];
    }[] = [];

    public constructor(public readonly canvas: SoftCanvas) {}

    public setTransform(
        a: number,
        b: number,
        c: number,
        d: number,
        e: number,
        f: number,
    ): void {
        this.matrix = [a, b, c, d, e, f];
    }

    public getTransform() {
        const [a, b, c, d, e, f] = this.matrix;
        return { a, b, c, d, e, f };
    }

    public save(): void {
        this.stack.push({
            matrix: [...this.matrix],
            alpha: this.globalAlpha,
            operation: this.globalCompositeOperation,
            clips: [...this.clips],
        });
    }

    public restore(): void {
        const top = this.stack.pop();
        if (top !== undefined) {
            this.matrix = top.matrix;
            this.globalAlpha = top.alpha;
            this.globalCompositeOperation = top.operation;
            this.clips = top.clips;
        }
    }

    public beginPath(): void {
        this.path = [];
    }

    public moveTo(x: number, y: number): void {
        this.path.push([this.apply(x, y)]);
    }

    public lineTo(x: number, y: number): void {
        this.path[this.path.length - 1].push(this.apply(x, y));
    }

    public closePath(): void {}

    public clip(): void {
        this.clips = [...this.clips, this.path];
    }

    public clearRect(): void {
        this.canvas.data.fill(0);
    }

    public fillRect(x: number, y: number, width: number, height: number): void {
        const colour = parse_colour(this.fillStyle);
        this.cover((u, v) =>
            u >= x && u < x + width && v >= y && v < y + height ? colour : null,
        );
    }

    public drawImage(image: SoftCanvas, ...numbers: number[]): void {
        let [sx, sy, sw, sh, dx, dy, dw, dh] = numbers;
        if (numbers.length === 2) {
            [dx, dy] = numbers;
            [sx, sy, sw, sh, dw, dh] = [
                0,
                0,
                image.width,
                image.height,
                image.width,
                image.height,
            ];
        }
        this.cover((u, v) => {
            if (u < dx || u >= dx + dw || v < dy || v >= dy + dh) {
                return null;
            }
            const px = Math.floor(sx + ((u - dx) * sw) / dw);
            const py = Math.floor(sy + ((v - dy) * sh) / dh);
            if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
                return null;
            }
            return image.pixel(px, py);
        });
    }

    private apply(x: number, y: number): [number, number] {
        const [a, b, c, d, e, f] = this.matrix;
        return [a * x + c * y + e, b * x + d * y + f];
    }

    /** Every pixel whose middle the source covers (`colour_at` in the current transform's frame), composited. */
    private cover(colour_at: (u: number, v: number) => Rgba | null): void {
        const [a, b, c, d, e, f] = this.matrix;
        const determinant = a * d - b * c;
        const canvas = this.canvas;
        const operation = this.globalCompositeOperation;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const px = x + 0.5;
                const py = y + 0.5;
                if (
                    !this.clips.every((region) =>
                        region.some((polygon) => inside(polygon, px, py)),
                    )
                ) {
                    continue;
                }
                const u = (d * (px - e) - c * (py - f)) / determinant;
                const v = (a * (py - f) - b * (px - e)) / determinant;
                const source = colour_at(u, v);
                if (source === null && operation !== "destination-in") {
                    continue;
                }
                const destination = canvas.pixel(x, y);
                const source_alpha =
                    source === null ? 0 : source[3] * this.globalAlpha;
                const destination_alpha = destination[3];
                if (operation === "destination-in") {
                    canvas.set(x, y, [
                        destination[0],
                        destination[1],
                        destination[2],
                        destination_alpha * source_alpha,
                    ]);
                    continue;
                }
                const out_alpha =
                    source_alpha + destination_alpha * (1 - source_alpha);
                if (out_alpha === 0 || source === null) {
                    continue;
                }
                const out: Rgba = [0, 0, 0, out_alpha];
                for (let channel = 0; channel < 3; channel++) {
                    const cs = source[channel];
                    const cd = destination[channel];
                    const blended = operation === "multiply" ? cs * cd : cs;
                    const mixed =
                        cs * source_alpha * (1 - destination_alpha) +
                        cd * destination_alpha * (1 - source_alpha) +
                        source_alpha * destination_alpha * blended;
                    out[channel] = mixed / out_alpha;
                }
                canvas.set(x, y, out);
            }
        }
    }
}

const make_soft_canvas = (width: number, height: number) =>
    new SoftCanvas(width, height) as unknown as HTMLCanvasElement;

// ---- the puppets ----

const near = (value: number, expected: number, digits = 6) =>
    expect(value).toBeCloseTo(expected, digits);

/**
 * Step 38's small test puppet (a hip 100 above the root, a torso of 50, an arm of two 30s from
 * its top) with shapes: `arms` swells both arm bones, `belly` pushes the torso's front out, `long`
 * makes the arm longer.
 */
function arm_rig(overrides: Partial<RigData> = {}): RigData {
    return {
        skeleton: "stick",
        bones: [
            { name: "root" },
            { name: "hip", parent: "root", y: -100, rotation: -90, length: 10 },
            { name: "torso", parent: "hip", rotation: 0, length: 50 },
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
                        layers: { skin: [40, 0, 10, 36] },
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
            swing: {
                length: 1,
                loop: true,
                tracks: {
                    torso: [
                        { t: 0, rotation: -10 },
                        { t: 0.5, rotation: 12 },
                        { t: 1, rotation: -10 },
                    ],
                    upper: [
                        { t: 0, rotation: -40 },
                        { t: 0.5, rotation: 35 },
                        { t: 1, rotation: -40 },
                    ],
                    lower: [
                        { t: 0, rotation: 10 },
                        { t: 0.5, rotation: 70 },
                        { t: 1, rotation: 10 },
                    ],
                },
            },
        },
        default_clip: "idle",
        shapes: {
            arms: {
                title: "Arme",
                pushes: [
                    { bone: "upper", along: [-10, 5, 25, 40], swell: 0.5 },
                    { bone: "lower", along: [-10, 5, 25, 40], swell: 0.5 },
                ],
            },
            belly: {
                pushes: [
                    {
                        bone: "torso",
                        along: [0, 15, 30, 45],
                        across: [0, 8],
                        push: [0, 6],
                    },
                ],
            },
            long: {
                min: 0,
                max: 1,
                bones: { upper: [0.5, 0], lower: [0.5, 0] },
            },
        },
        ...overrides,
    };
}

/**
 * The atlas of `arm_rig`: the torso a brown block, both arm parts skin coloured only in their
 * middle six columns (two clear columns each side: the outline is narrower than the rectangle),
 * the lower arm's skin layer in grey (0.8) on the same pixels.
 */
function arm_atlas(): SoftCanvas {
    const atlas = new SoftCanvas(64, 64);
    atlas.paint(0, 0, 20, 60, [0.6, 0.4, 0.3, 1]);
    atlas.paint(22, 0, 6, 36, [0.9, 0.7, 0.6, 1]);
    atlas.paint(32, 0, 6, 36, [0.9, 0.7, 0.6, 1]);
    atlas.paint(42, 0, 6, 36, [0.8, 0.8, 0.8, 1]);
    return atlas;
}

/** A mark sheet: `dot`, a black square of 8 pixels; `star`, a white one to tint; at one pixel per unit. */
function marks(): MarkSheet {
    const image = new SoftCanvas(16, 8);
    image.paint(0, 0, 8, 8, [0, 0, 0, 1]);
    image.paint(8, 0, 8, 8, [1, 1, 1, 1]);
    return MarkSheet.from_data(
        {
            marks: {
                dot: { rect: [0, 0, 8, 8], title: "Punkt", kind: "tattoo" },
                star: { rect: [8, 0, 8, 8], kind: "paint", blend: "normal" },
            },
        },
        image as unknown as HTMLCanvasElement,
    );
}

/** A context that writes down what it draws, and with what. */
function recording_context() {
    let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const calls: {
        kind: string;
        image?: unknown;
        numbers: number[];
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
            calls.push({
                kind: "setTransform",
                numbers: [a, b, c, d, e, f],
                transform: { ...transform },
            });
        },
        drawImage: (image: unknown, ...numbers: number[]) => {
            calls.push({
                kind: "drawImage",
                image,
                numbers,
                transform: { ...transform },
            });
        },
        save: () =>
            calls.push({
                kind: "save",
                numbers: [],
                transform: { ...transform },
            }),
        restore: () =>
            calls.push({
                kind: "restore",
                numbers: [],
                transform: { ...transform },
            }),
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        clip: () =>
            calls.push({
                kind: "clip",
                numbers: [],
                transform: { ...transform },
            }),
        arc: () => {},
        stroke: () => {},
        fill: () => {},
    };
    return { context: context as unknown as CanvasRenderingContext2D, calls };
}

function puppet_of(data: RigData = arm_rig(), clip = "idle") {
    const atlas = arm_atlas();
    const rig = PuppetRig.from_data(
        data,
        atlas as unknown as HTMLCanvasElement,
    );
    const puppet = rig.puppet(clip);
    puppet.make_canvas = make_soft_canvas;
    puppet.update(0);
    return { rig, puppet, atlas };
}

/** The canvas a part was drawn from in the last draw: the baked look of the part with this source size. */
function drawn_from(
    calls: ReturnType<typeof recording_context>["calls"],
    atlas: SoftCanvas,
) {
    return calls.filter(
        (call) => call.kind === "drawImage" && call.image !== atlas,
    );
}

/** The look a drawImage call drew: its source rectangle of the puppet's packed canvas, as a canvas of its own. */
function look_drawn(
    call: ReturnType<typeof recording_context>["calls"][number],
): SoftCanvas {
    const image = call.image as SoftCanvas;
    const [sx, sy, width, height] = call.numbers;
    const look = new SoftCanvas(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const from = ((sy + y) * image.width + sx + x) * 4;
            const to = (y * width + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
                look.data[to + channel] = image.data[from + channel];
            }
        }
    }
    return look;
}

// ---- legs that get longer ----

/** A leg: hip 100 above the root, thigh 50 down, shin 50, a foot of 15 forward; heel and toe on the ground at rest. */
function leg_rig(clips: Record<string, PuppetClipData> = {}): RigData {
    return {
        skeleton: "leg",
        bones: [
            { name: "root" },
            { name: "hip", parent: "root", y: -100, rotation: -90, length: 10 },
            { name: "thigh", parent: "hip", rotation: 180, length: 50 },
            { name: "shin", parent: "thigh", x: 50, length: 50 },
            { name: "foot", parent: "shin", x: 50, rotation: -90, length: 15 },
        ],
        slots: [
            { name: "thigh", bone: "thigh" },
            { name: "shin", bone: "shin" },
            { name: "foot", bone: "foot" },
        ],
        skins: {
            plain: {
                attachments: {
                    thigh: {
                        rect: [0, 0, 10, 56],
                        pivot: [5, 3],
                        rotation: -90,
                    },
                    shin: {
                        rect: [10, 0, 10, 56],
                        pivot: [5, 3],
                        rotation: -90,
                    },
                    foot: { rect: [20, 0, 24, 10], pivot: [5, 5] },
                },
            },
        },
        anchors: {
            heel: { bone: "foot", x: -5, y: 0 },
            toe: { bone: "foot", x: 15, y: 0 },
        },
        soles: ["heel", "toe"],
        clips,
        shapes: {
            legs: {
                min: -0.5,
                max: 1,
                bones: { thigh: [0.3, 0], shin: [0.3, 0] },
            },
        },
    };
}

/** The lowest sole's height on the screen (y down) for a skeleton after `update()`. */
function lowest_sole(skeleton: Skeleton, foot: number): number {
    return Math.max(
        skeleton.world_point(foot, -5, 0).y,
        skeleton.world_point(foot, 15, 0).y,
    );
}

/** A run of the leg: thigh and shin angles per key, the hip set so the lowest sole is on the ground at every key. */
function run_clip(): PuppetClipData {
    const thighs = [-30, -5, 25, 35, -30];
    const shins = [10, 40, 15, 70, 10];
    const times = [0, 0.25, 0.5, 0.75, 1];
    const plain = PuppetRig.from_data(leg_rig()).make_skeleton();
    const hip_y: number[] = [];
    for (let key = 0; key < times.length; key++) {
        plain.reset_pose();
        plain.rotation[2] = thighs[key];
        plain.rotation[3] = shins[key];
        plain.rotation[4] = -thighs[key] - shins[key];
        plain.update();
        hip_y.push(-lowest_sole(plain, 4));
    }
    return {
        length: 1,
        loop: true,
        tracks: {
            hip: times.map((t, key) => ({ t, y: hip_y[key] })),
            thigh: times.map((t, key) => ({ t, rotation: thighs[key] })),
            shin: times.map((t, key) => ({ t, rotation: shins[key] })),
            foot: times.map((t, key) => ({
                t,
                rotation: -thighs[key] - shins[key],
            })),
        },
    };
}

describe("Body shape", () => {
    it("puts the feet on the ground through the run with longer legs, and lifts the hip", () => {
        const data = leg_rig({ run: run_clip() });
        const rig = PuppetRig.from_data(data);
        const plain = rig.puppet("run");
        const long = rig.puppet("run");
        expect(long.set_shape({ legs: 1 })).toBe(true);
        const foot = rig.bone_index("foot");
        const hip = rig.bone_index("hip");
        plain.update(0);
        long.update(0);
        for (let step = 0; step <= 40; step++) {
            if (step > 0) {
                plain.update(0.025);
                long.update(0.025);
            }
            // The scaled soles stand exactly where the plain ones do: on the ground at the keys.
            near(
                lowest_sole(long.skeleton, foot),
                lowest_sole(plain.skeleton, foot),
            );
            if (step % 10 === 0) {
                near(lowest_sole(long.skeleton, foot), 0);
            }
            // The legs are 30 % longer, so the hip stands higher (less than 30 higher while they bend).
            expect(long.skeleton.world_y(hip)).toBeLessThan(
                plain.skeleton.world_y(hip) - 1,
            );
            near(
                long.skeleton.lift,
                plain.skeleton.world_y(hip) - long.skeleton.world_y(hip),
            );
        }
        // At rest, 30 % of the 100 of leg: exactly 30 higher.
        long.player.paused = true;
        long.skeleton.reset_pose();
        long.skeleton.update();
        near(long.skeleton.lift, 30);
        near(long.skeleton.world_y(hip), -130);
        // Shorter legs lower it, within the shape's range.
        expect(long.set_shape({ legs: -2 })).toBe(true);
        expect(long.shape.legs).toBe(-0.5);
        long.skeleton.reset_pose();
        long.skeleton.update();
        near(long.skeleton.world_y(hip), -85);
        near(lowest_sole(long.skeleton, foot), 0);
    });

    it("scales a bone's parts and moves its children's joints, never shearing them", () => {
        const { puppet, rig } = puppet_of();
        const lower = rig.bone_index("lower");
        const upper = rig.bone_index("upper");
        const before = {
            x: puppet.skeleton.world_x(lower),
            y: puppet.skeleton.world_y(lower),
        };
        expect(puppet.set_shape({ long: 1 })).toBe(true);
        // The upper arm hangs from (0, -150) down: its 30 grow to 45, so the elbow drops 15.
        near(puppet.skeleton.world_x(lower), before.x);
        near(puppet.skeleton.world_y(lower), before.y + 15);
        // The hand (30 along the lower arm) moves with the lower arm's scale too.
        near(puppet.anchor_world("hand")?.y ?? NaN, -150 + 45 + 45);
        // The frames stay turns: their columns are unit long and at right angles.
        const world = puppet.skeleton.world;
        near(Math.hypot(world[upper * 6], world[upper * 6 + 1]), 1);
        near(
            world[upper * 6] * world[upper * 6 + 2] +
                world[upper * 6 + 1] * world[upper * 6 + 3],
            0,
        );
        // The part is drawn stretched along its bone: 45 long instead of 30.
        const { context, calls } = recording_context();
        puppet.draw(context, 0, 0);
        const part = calls.filter((call) => call.kind === "drawImage")[1];
        near(Math.hypot(part.transform.c, part.transform.d), 1.5);
        near(Math.hypot(part.transform.a, part.transform.b), 1);
    });

    it("refuses shapes it doesn't have and keeps values within their range", () => {
        const { puppet } = puppet_of();
        expect(puppet.set_shape({ belly: 0.5, wings: 1 })).toBe(false);
        expect(puppet.shape).toEqual({ arms: 0, belly: 0.5, long: 0 });
        expect(puppet.set_shape({ long: 5, arms: -3 })).toBe(true);
        expect(puppet.shape).toEqual({ arms: -1, belly: 0.5, long: 1 });
        puppet.reset_shape();
        expect(puppet.shape).toEqual({ arms: 0, belly: 0, long: 0 });
        expect(() =>
            PuppetRig.from_data(
                arm_rig({ shapes: { belly: { pushes: [{ bone: "tail" }] } } }),
            ),
        ).toThrow('shape "belly": a push on no bone "tail"');
        expect(() =>
            PuppetRig.from_data(
                arm_rig({ shapes: { long: { bones: { wing: [1, 0] } } } }),
            ),
        ).toThrow('shape "long": no bone "wing"');
        expect(() =>
            PuppetRig.from_data(
                arm_rig({
                    shapes: {
                        belly: {
                            pushes: [{ bone: "torso", along: [10, 0, 5, 20] }],
                        },
                    },
                }),
            ),
        ).toThrow("along must be four rising numbers");
        expect(() =>
            PuppetRig.from_data(
                leg_rig({}) && { ...leg_rig(), soles: ["knee"] },
            ),
        ).toThrow('soles: no anchor "knee"');
    });

    it("draws exactly step 38's puppet at shape 0, also after a shape went and came back", () => {
        const plain_data: RigData = { ...arm_rig(), shapes: undefined };
        const plain = puppet_of(plain_data, "swing");
        const shaped = puppet_of(arm_rig(), "swing");
        shaped.puppet.set_shape({ belly: 0.8, arms: 0.5, long: 1 });
        shaped.puppet.set_shape({ belly: 0, arms: 0, long: 0 });
        for (const delta of [0, 0.13, 0.31]) {
            plain.puppet.update(delta);
            shaped.puppet.update(delta);
            const a = recording_context();
            const b = recording_context();
            plain.puppet.draw(a.context, 120, 300, {
                scale: 0.7,
                flip_x: true,
            });
            shaped.puppet.draw(b.context, 120, 300, {
                scale: 0.7,
                flip_x: true,
            });
            expect(b.calls.map((call) => [call.kind, call.numbers])).toEqual(
                a.calls.map((call) => [call.kind, call.numbers]),
            );
            expect(
                b.calls
                    .filter((call) => call.kind === "drawImage")
                    .every((call) => call.image === shaped.atlas),
            ).toBe(true);
        }
    });
});

describe("PartMesh", () => {
    it("never moves a point with weight 0, and moves the others by value times weight", () => {
        const mesh = new PartMesh({
            points: [0, 0, 10, 0, 0, 10, 10, 10],
            triangles: [0, 1, 2, 1, 3, 2],
            weights: {
                belly: [0, 0, 2, 0, 0, 0, 3, 1],
                arms: [0, 0, 0, 0, 0, 0, 0, -1],
            },
        });
        const deformed = mesh.deform(
            new Map([
                ["belly", 0.5],
                ["arms", 2],
            ]),
        );
        expect([...deformed]).toEqual([0, 0, 11, 0, 0, 10, 11.5, 8.5]);
        expect([...mesh.deform(new Map([["belly", -1]]))].slice(0, 2)).toEqual([
            0, 0,
        ]);
        expect([...mesh.deform(new Map([["belly", -1]]))].slice(4, 6)).toEqual([
            0, 10,
        ]);
        expect(mesh.moves_for(new Map([["legs", 1]]))).toBe(false);
        expect(mesh.still.length).toBe(0);
        expect(mesh.moving.length).toBe(6);
        // Inside the moving triangle the move is mixed from its corners.
        near(mesh.offset_at(new Map([["belly", 1]]), 10, 5).u, 2.5);
        expect(
            () =>
                new PartMesh({
                    points: [0, 0],
                    triangles: [0, 0, 1],
                    weights: {},
                }),
        ).toThrow("threes of its point numbers");
    });

    it("grows a grid over a part whose points move by the pushes on its bone, none where no push reaches", () => {
        const rig = PuppetRig.from_data(arm_rig());
        const torso = rig.skin()?.parts.get("torso");
        const torso_bone = rig.bone_index("torso");
        expect(torso).toBeDefined();
        if (torso === undefined) {
            return;
        }
        const mesh = PartMesh.for_part(
            torso.width,
            torso.height,
            torso.transform,
            torso_bone,
            rig.shapes.values(),
            5,
        );
        expect(mesh).not.toBeNull();
        if (mesh === null) {
            return;
        }
        expect(mesh.point_count).toBe(5 * 13);
        const push = rig.shapes.get("belly")?.pushes[0];
        const m = torso.transform;
        const weights = mesh.weights.get("belly") as Float64Array;
        let unmoved = 0;
        for (let point = 0; point < mesh.point_count; point++) {
            const u = mesh.points[point * 2];
            const v = mesh.points[point * 2 + 1];
            const x = m[0] * u + m[2] * v + m[4];
            const y = m[1] * u + m[3] * v + m[5];
            const weight = push === undefined ? 0 : push_weight(push, x, y);
            if (weight === 0) {
                // No weight: it stays where it is for every value.
                expect([weights[point * 2], weights[point * 2 + 1]]).toEqual([
                    0, 0,
                ]);
                unmoved += 1;
            } else {
                // Full weight in front moves it 6 forward (+y of the torso, which is -u of the part turned by 90).
                near(
                    Math.hypot(weights[point * 2], weights[point * 2 + 1]),
                    6 * weight,
                );
            }
        }
        expect(unmoved).toBeGreaterThan(20);
        expect(mesh.still.length).toBeGreaterThan(0);
        expect(
            PartMesh.for_part(
                10,
                36,
                torso.transform,
                rig.bone_index("hip"),
                rig.shapes.values(),
            ),
        ).toBeNull();
    });

    it("draws the still triangles as one piece and each moving one alone, clipped", () => {
        const { puppet, atlas } = puppet_of();
        puppet.make_canvas = () => null;
        puppet.set_shape({ belly: 1 });
        const { context, calls } = recording_context();
        puppet.draw(context, 0, 0);
        const clips = calls.filter((call) => call.kind === "clip").length;
        const draws = calls.filter(
            (call) => call.kind === "drawImage" && call.image === atlas,
        );
        // The torso: one still piece and its moving triangles; both arms plain.
        expect(clips).toBeGreaterThan(4);
        expect(draws.length).toBe(clips + 2);
        // With a canvas it is laid out once and then drawn as one picture.
        puppet.make_canvas = make_soft_canvas;
        const again = recording_context();
        puppet.draw(again.context, 0, 0);
        expect(again.calls.filter((call) => call.kind === "clip").length).toBe(
            0,
        );
        expect(
            again.calls.filter((call) => call.kind === "drawImage").length,
        ).toBe(3);
    });
});

describe("Marks and tints", () => {
    it("clips a mark past the part's edge to the part's outline, and multiplies its ink in", () => {
        const { puppet, atlas } = puppet_of();
        puppet.use_marks(marks());
        // A 16 x 16 dot (size 2) on the lower arm, 15 down it: wider than the arm's six pixels and its rectangle.
        expect(
            puppet.add_mark("dot", "lower", { x: 15, y: 0, angle: 0, size: 2 }),
        ).toBe(0);
        const { context, calls } = recording_context();
        puppet.draw(context, 0, 0);
        const baked = drawn_from(calls, atlas);
        expect(baked.length).toBe(1);
        const canvas = look_drawn(baked[0]);
        expect([canvas.width, canvas.height]).toEqual([10, 36]);
        // The part's pixels: u across the arm (2 to 7 opaque), v along it (the mark at v 10 to 26).
        expect(canvas.pixel(0, 18)[3]).toBe(0);
        expect(canvas.pixel(9, 18)[3]).toBe(0);
        expect(canvas.pixel(4, 18)).toEqual([0, 0, 0, 1]);
        expect(canvas.pixel(4, 4)).toEqual([0.9, 0.7, 0.6, 1]);
        expect(canvas.pixel(4, 30)).toEqual([0.9, 0.7, 0.6, 1]);
    });

    it("tints a layer with its shading kept, and a mark in its own colour", () => {
        const { puppet, atlas } = puppet_of();
        puppet.use_marks(marks());
        puppet.set_tint("skin", "#ff0000");
        expect(
            puppet.add_mark("star", "lower", {
                x: 15,
                y: 0,
                angle: 0,
                size: 0.5,
                tint: "#0000ff",
            }),
        ).toBe(0);
        const { context, calls } = recording_context();
        puppet.draw(context, 0, 0);
        const canvas = look_drawn(drawn_from(calls, atlas)[0]);
        // Red times the layer's grey 0.8.
        const tinted = canvas.pixel(3, 4);
        near(tinted[0], 0.8);
        near(tinted[1], 0);
        expect(tinted[3]).toBe(1);
        // The star (normal, white tinted blue) over it.
        expect(canvas.pixel(4, 18)).toEqual([0, 0, 1, 1]);
        expect(puppet.tints).toEqual({ skin: "#ff0000" });
        puppet.set_tint("skin", null);
        puppet.remove_mark(0);
        const plain = recording_context();
        puppet.draw(plain.context, 0, 0);
        expect(drawn_from(plain.calls, atlas).length).toBe(0);
    });

    it("draws all its baked looks from one canvas, each from its own place", () => {
        const { puppet, atlas } = puppet_of();
        puppet.use_marks(marks());
        puppet.add_mark("dot", "lower", { x: 15, y: 0 });
        puppet.add_mark("dot", "upper", { x: 15, y: 0 });
        puppet.add_mark("dot", "torso", { x: 25, y: 0 });
        const { context, calls } = recording_context();
        puppet.draw(context, 0, 0);
        const baked = drawn_from(calls, atlas);
        expect(baked.length).toBe(3);
        expect(new Set(baked.map((call) => call.image)).size).toBe(1);
        // Side by side, never on each other.
        const places = baked.map((call) => call.numbers.slice(0, 4));
        for (const [index, [x, y, width, height]] of places.entries()) {
            for (const [other, [ox, oy, ow, oh]] of places.entries()) {
                if (other !== index) {
                    expect(
                        x + width <= ox ||
                            ox + ow <= x ||
                            y + height <= oy ||
                            oy + oh <= y,
                    ).toBe(true);
                }
            }
        }
        // A change lays them again into the same canvas.
        puppet.remove_mark(2);
        const again = recording_context();
        puppet.draw(again.context, 0, 0);
        const after = drawn_from(again.calls, atlas);
        expect(after.length).toBe(2);
        expect(after[0].image).toBe(baked[0].image);
    });

    it("keeps a mark at the same spot of its part at every key, moving with it", () => {
        const { puppet, rig, atlas } = puppet_of(arm_rig(), "swing");
        puppet.use_marks(marks());
        puppet.add_mark("dot", "lower", { x: 15, y: 1, angle: 0 });
        let canvas: unknown = null;
        let bakes = 0;
        const make = puppet.make_canvas;
        puppet.make_canvas = (width, height) => {
            bakes += 1;
            return make(width, height);
        };
        const lower = rig.bone_index("lower");
        for (let key = 0; key <= 8; key++) {
            puppet.update(key === 0 ? 0 : 0.125);
            const { context, calls } = recording_context();
            puppet.draw(context, 0, 0);
            const drawn = drawn_from(calls, atlas)[0];
            // The same picture every frame: laid out once, so the mark is on the same pixel of the part.
            canvas = canvas ?? drawn.image;
            expect(drawn.image).toBe(canvas);
            // Its middle (part pixel u 4, v 18) lands where the bone's frame puts (15, 1) now.
            const spot = puppet.mark_point(0) as { x: number; y: number };
            const expected = puppet.skeleton.world_point(lower, 15, 1);
            near(spot.x, expected.x);
            near(spot.y, expected.y);
            const m = drawn.transform;
            near(m.a * 4 + m.c * 18 + m.e, expected.x);
            near(m.b * 4 + m.d * 18 + m.f, expected.y);
            // A pointer there finds it, and finds where on the part it is.
            expect(puppet.mark_at(expected.x + 1, expected.y, 4)).toBe(0);
            const back = puppet.to_part("lower", expected.x, expected.y) as {
                x: number;
                y: number;
            };
            near(back.x, 15);
            near(back.y, 1);
        }
        // The look, two scratch canvases and the canvas the looks are packed into: made once.
        expect(bakes).toBeLessThanOrEqual(4);
    });

    it("refuses a mark for a slot or a picture it doesn't have; one of a sheet on its way waits", () => {
        const { puppet } = puppet_of();
        puppet.use_marks(marks());
        expect(puppet.add_mark("dot", "tail")).toBe(-1);
        expect(puppet.add_mark("skull", "lower")).toBe(-1);
        const later = new MarkSheet();
        puppet.use_marks(later);
        expect(puppet.add_mark("skull", "lower", { x: 3, y: 0 })).toBe(0);
        // Upright on the screen at rest: the lower arm points down (90°), so -90.
        expect(puppet.marks[0].angle).toBe(-90);
        expect(puppet.upright_angle("lower")).toBe(-90);
        expect(puppet.move_mark(0, { x: 9, size: 1.5 })).toBe(true);
        expect(puppet.marks[0]).toMatchObject({
            id: "skull",
            slot: "lower",
            x: 9,
            y: 0,
            size: 1.5,
        });
        expect(puppet.move_mark(4, { x: 1 })).toBe(false);
        expect(puppet.remove_mark(0)).toBe(true);
        expect(puppet.remove_mark(0)).toBe(false);
        expect(() =>
            MarkSheet.from_data({ marks: { bad: { rect: [0, 0, 0, 4] } } }),
        ).toThrow('mark "bad": rect');
        expect(() =>
            MarkSheet.from_data({
                marks: {
                    bad: { rect: [0, 0, 4, 4], blend: "screen" as "normal" },
                },
            }),
        ).toThrow("is not multiply or normal");
    });
});

describe("A character as data", () => {
    it("round-trips through a save slot into the same look", async () => {
        const first = puppet_of(arm_rig(), "swing");
        const sheet = marks();
        first.puppet.use_marks(sheet);
        first.puppet.set_shape({ belly: 0.4, arms: -0.5, long: 0.25 });
        first.puppet.set_tint("skin", "#8d5524");
        first.puppet.add_mark("dot", "lower", {
            x: 12,
            y: 1,
            size: 0.75,
            angle: 20,
        });
        first.puppet.add_mark("star", "upper", {
            x: 8,
            y: -1,
            tint: "#cc2200",
            opacity: 0.5,
            flip: true,
        });
        const character = first.puppet.character;
        expect(character).toEqual({
            skin: "plain",
            shape: { belly: 0.4, arms: -0.5, long: 0.25 },
            tints: { skin: "#8d5524" },
            marks: [
                {
                    id: "dot",
                    slot: "lower",
                    x: 12,
                    y: 1,
                    angle: 20,
                    size: 0.75,
                },
                {
                    id: "star",
                    slot: "upper",
                    x: 8,
                    y: -1,
                    angle: -90,
                    size: 1,
                    tint: "#cc2200",
                    opacity: 0.5,
                    flip: true,
                },
            ],
            outfit: {},
        });
        const saves = new SaveSlots<CharacterData>({
            version: 1,
            fresh: () => ({}),
            store: memory_store(),
            page: null,
        });
        expect(await saves.save("slot-1", character)).toBe(true);
        const loaded = await saves.load("slot-1");
        const second = puppet_of(arm_rig(), "swing");
        second.puppet.use_marks(sheet);
        expect(second.puppet.set_character(loaded)).toBe(true);
        expect(second.puppet.character).toEqual(character);
        first.puppet.update(0.2);
        second.puppet.update(0.2);
        const a = recording_context();
        const b = recording_context();
        first.puppet.draw(a.context, 50, 200);
        second.puppet.draw(b.context, 50, 200);
        expect(b.calls.map((call) => [call.kind, call.numbers])).toEqual(
            a.calls.map((call) => [call.kind, call.numbers]),
        );
        const pictures = (calls: typeof a.calls) =>
            drawn_from(calls, first.atlas).map((call) => [
                ...look_drawn(call).data,
            ]);
        expect(
            pictures(
                b.calls.map((call) =>
                    call.image === second.atlas
                        ? { ...call, image: first.atlas }
                        : call,
                ),
            ),
        ).toEqual(pictures(a.calls));
        // Plain again: set_character with nothing in it.
        expect(second.puppet.set_character({})).toBe(true);
        expect(second.puppet.character).toEqual({
            skin: "plain",
            shape: {},
            tints: {},
            marks: [],
            outfit: {},
        });
        expect(
            second.puppet.set_character({
                shape: { wings: 1 },
                marks: [{ id: "dot", slot: "tail", x: 0, y: 0 }],
            }),
        ).toBe(false);
    });
});
