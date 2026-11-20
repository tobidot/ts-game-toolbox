/**
 * Test helpers for the Knochenwerkstatt's toolbox parts (step 43): a hand-drawn-looking figure
 * painted from a skeleton template, and step 38's wanderer clips (made by Claude in Blender).
 * Only the tests import this.
 */
import { RigData } from "../RigData";
import { blank_pixels, PictureLayer } from "../RigPicture";
import {
    SkeletonTemplate,
    TemplateLayerData,
    template_joints,
    template_point,
} from "../SkeletonTemplate";
import { Skeleton } from "../Skeleton";
import { RgbaPixels } from "../SoftMesh";
import wanderer_data from "./wanderer-clips.json";

export const WANDERER = wanderer_data as unknown as RigData;

// ---- a hand-drawn-looking figure, painted here: a capsule round every bone, an outline, a layer per side ----

export const LAYER_COLOURS: Record<string, [number, number, number]> = {
    back: [150, 96, 60],
    body: [200, 140, 70],
    front: [226, 168, 96],
};

/** Paints a capsule (a thick line with round ends) with a dark outline into a layer. */
export function capsule(
    pixels: RgbaPixels,
    a: readonly [number, number],
    b: readonly [number, number],
    radius: number,
    colour: readonly [number, number, number],
): void {
    const data = pixels.data as Uint8Array;
    const left = Math.max(0, Math.floor(Math.min(a[0], b[0]) - radius - 2));
    const right = Math.min(
        pixels.width - 1,
        Math.ceil(Math.max(a[0], b[0]) + radius + 2),
    );
    const top = Math.max(0, Math.floor(Math.min(a[1], b[1]) - radius - 2));
    const bottom = Math.min(
        pixels.height - 1,
        Math.ceil(Math.max(a[1], b[1]) + radius + 2),
    );
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const squared = dx * dx + dy * dy || 1;
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const t = Math.max(
                0,
                Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / squared),
            );
            const distance = Math.hypot(
                x - (a[0] + dx * t),
                y - (a[1] + dy * t),
            );
            if (distance > radius) {
                continue;
            }
            const at = (y * pixels.width + x) * 4;
            const edge = distance > radius - 2;
            // A little wobble, as a hand draws.
            const shade = 1 - 0.08 * Math.sin(x * 0.31 + y * 0.17);
            data[at] = edge ? 40 : Math.round(colour[0] * shade);
            data[at + 1] = edge ? 30 : Math.round(colour[1] * shade);
            data[at + 2] = edge ? 26 : Math.round(colour[2] * shade);
            data[at + 3] = 255;
        }
    }
}

/**
 * A Zweibeiner's five layers before the template split its body from its head (step 43's 0.1.3):
 * the figure the ragdoll's tests were tuned on.
 */
export const ZWEIBEINER_FIVE_LAYERS: readonly TemplateLayerData[] = [
    {
        name: "far_arm",
        title: "Arm hinten",
        bones: ["upper_arm_l", "lower_arm_l", "hand_l"],
    },
    {
        name: "far_leg",
        title: "Bein hinten",
        bones: ["thigh_l", "shin_l", "foot_l"],
    },
    {
        name: "near_leg",
        title: "Bein vorne",
        bones: ["thigh_r", "shin_r", "foot_r"],
    },
    { name: "body", title: "Körper", bones: ["hip", "torso", "head", "jaw"] },
    {
        name: "near_arm",
        title: "Arm vorne",
        bones: ["upper_arm_r", "lower_arm_r", "hand_r"],
    },
];

/**
 * A figure for a template: its joints at `scale` round `origin`, each bone a capsule on its layer
 * (the template's parts, or `layers` given).
 */
export function draw_figure(
    template: SkeletonTemplate,
    options: {
        scale?: number;
        size?: [number, number];
        stretch?: Record<string, [number, number]>;
        layers?: readonly TemplateLayerData[];
    } = {},
) {
    const [width, height] = options.size ?? [520, 520];
    const scale = options.scale ?? 1;
    const joints = template_joints(template, {
        origin: [width / 2, height - 30],
        scale,
    });
    for (const [name, [dx, dy]] of Object.entries(options.stretch ?? {})) {
        joints[name] = [joints[name][0] + dx, joints[name][1] + dy];
    }
    const layers: PictureLayer[] = (options.layers ?? template.layers).map(
        (layer) => {
            const pixels = blank_pixels(width, height);
            for (const bone of template.bones) {
                const on =
                    layer.bones === undefined ||
                    layer.bones.includes(bone.name);
                if (!on) {
                    continue;
                }
                const from = template_point(bone.from, joints);
                const to = template_point(bone.to, joints);
                const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
                const radius =
                    bone.name.startsWith("torso") ||
                    bone.name.startsWith("spine") ||
                    bone.name.startsWith("body")
                        ? 22 * scale
                        : bone.name === "head"
                          ? 30 * scale
                          : Math.max(5, Math.min(14 * scale, length * 0.3));
                capsule(
                    pixels,
                    from,
                    to,
                    radius,
                    LAYER_COLOURS[layer.name] ?? LAYER_COLOURS.body,
                );
            }
            return { name: layer.name, pixels, bones: layer.bones ?? null };
        },
    );
    return { joints, layers, ground: height - 30 };
}

/** The lowest sole (largest y) of a puppet's skeleton now. */
export function lowest_sole(
    skeleton: Skeleton,
    rig: RigData,
    soles: readonly string[],
): number {
    let lowest = -Infinity;
    for (const name of soles) {
        const anchor = rig.anchors![name];
        const point = skeleton.world_point(
            skeleton.index_of(anchor.bone),
            anchor.x,
            anchor.y,
        );
        lowest = Math.max(lowest, point.y);
    }
    return lowest;
}
