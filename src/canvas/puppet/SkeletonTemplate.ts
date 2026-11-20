import {
    creature_template,
    CreatureChain,
    CreatureKind,
    CreatureRole,
    CreatureSkeleton,
} from "./CreatureTemplate";
import { AnchorData, BoneData, SlotData } from "./RigData";

/**
 * A point of a skeleton template (since step 43): a joint by name, or a point on the line between
 * two joints (`share` 0 at `from`, 1 at `toward`), for a bone that has no handle of its own.
 */
export type TemplatePoint =
    | string
    | {
          readonly from: string;
          readonly toward: string;
          readonly share: number;
      };

/** A handle someone drags onto a picture: a joint, with where it sits on the template. */
export interface TemplateJointData {
    readonly name: string;
    /** What an editor shows ("Knie hinten"). */
    readonly title: string;
    /** Where it sits in the template's own drawing: units, the root on the ground at 0, 0, y down. */
    readonly at: readonly [number, number];
}

/** A bone from one point to another; parents come first. */
export interface TemplateBoneData {
    readonly name: string;
    /** None for the bones on the root. */
    readonly parent?: string;
    /** Where it turns (its joint). */
    readonly from: TemplatePoint;
    /** Where it ends (its tip). */
    readonly to: TemplatePoint;
}

/**
 * A named point on a bone, placed from the fitted bone: `along` and `across` in shares of the
 * bone's length (`across` positive to the bone's right, as y in its frame); `ground` puts it on the
 * ground line under that point (a heel, a toe); `forward` turns it to point forward at rest (an
 * anchor for clothes, step 39).
 */
export interface TemplateAnchorData {
    readonly bone: string;
    readonly along?: number;
    readonly across?: number;
    readonly ground?: boolean;
    readonly forward?: boolean;
}

/** A chain of bones for step 42's gaits and attacks. */
export interface SkeletonChainData {
    readonly name: string;
    readonly role: CreatureRole;
    readonly bones: readonly string[];
    readonly side?: "far" | "near";
    /** Its tip stands on the ground at rest (a leg). */
    readonly stands?: boolean;
    /** A front leg of a four-legged creature. */
    readonly front?: boolean;
    /** The anchor at its tip (`leg_l_sole`, `tail_tip`). */
    readonly tip_anchor: string;
    /**
     * Which way its middle joint bends when it is drawn straight: `forward` (a knee), `back` (an
     * elbow, a dog's front leg). A drawn bend is kept.
     */
    readonly bend?: "forward" | "back";
}

/** A suggested layer of a drawing and the bones its pixels may follow. */
export interface TemplateLayerData {
    /** The file's name without its number (`back` for `1-back.png`). */
    readonly name: string;
    readonly title: string;
    /** None: every bone. */
    readonly bones?: readonly string[];
}

/**
 * A skeleton template as plain data (since step 43, Knochenwerkstatt): the joints someone drags
 * onto a hand-drawn picture, the bones between them, the anchors, the chains step 42's gaits and
 * attacks move, and the layers a drawing is split into. `fit_template()` makes a rig skeleton
 * from placed joints.
 */
export interface SkeletonTemplate {
    /** `"zweibeiner"`. */
    readonly name: string;
    /** What a game shows ("Zweibeiner"). */
    readonly title: string;
    /** The kind for step 42's gaits and attacks. */
    readonly kind: CreatureKind;
    /** The rig's skeleton name: rigs of one name share bones and clips. */
    readonly skeleton: string;
    /** Where the root sits: its x on the ground line under this point. */
    readonly root: TemplatePoint;
    readonly joints: readonly TemplateJointData[];
    /** Parents first, without the root (every fitted skeleton starts with `root`). */
    readonly bones: readonly TemplateBoneData[];
    readonly anchors: Readonly<Record<string, TemplateAnchorData>>;
    readonly chains: readonly SkeletonChainData[];
    /** Anchors that stand on the ground at rest (heels, toes, paws). */
    readonly soles: readonly string[];
    /**
     * The parts a drawing is split into, one layer each, back to front (since step 43's 0.1.4: an
     * arm, a leg, the head can each be drawn and swapped on its own). Every bone is in one part.
     */
    readonly layers: readonly TemplateLayerData[];
    /**
     * Groups of whole parts by name (`back`, `body`, `front`: the layers before the split), so a
     * folder drawn with them still follows the same bones, and an editor offers them as presets.
     */
    readonly groups?: readonly TemplateLayerData[];
    /** The drawing order of cut-out slots, one per bone (a soft skin draws its pictures instead). */
    readonly slots: readonly string[];
    /** The bone a bite opens (its pixels follow it). */
    readonly jaw?: string;
    /** The template's height in its units (the sheet's size; a picture this tall is size 1). */
    readonly height: number;
}

/** Template units per metre of step 38's puppets (210 atlas pixels, about 400 for a person). */
const M = 210;
const B = (metres: number) => -metres * M;

const BIPED_SIDES = ["l", "r"] as const;

function biped_template(): SkeletonTemplate {
    const joints: TemplateJointData[] = [
        { name: "pelvis", title: "Becken", at: [0, B(0.8)] },
        { name: "neck", title: "Hals", at: [0, B(1.3)] },
        { name: "head_top", title: "Scheitel", at: [6, B(1.84)] },
        { name: "jaw", title: "Kiefer", at: [6, B(1.4)] },
        { name: "chin", title: "Kinn", at: [24, B(1.37)] },
    ];
    for (const side of BIPED_SIDES) {
        const far = side === "l";
        const dx = far ? -10 : 0;
        const where = far ? "hinten" : "vorne";
        joints.push(
            {
                name: `shoulder_${side}`,
                title: `Schulter ${where}`,
                at: [dx, B(1.2)],
            },
            {
                name: `elbow_${side}`,
                title: `Ellbogen ${where}`,
                at: [dx - 5, B(0.95)],
            },
            {
                name: `wrist_${side}`,
                title: `Handgelenk ${where}`,
                at: [dx + 2, B(0.71)],
            },
            {
                name: `fingers_${side}`,
                title: `Finger ${where}`,
                at: [dx + 4, B(0.6)],
            },
            { name: `hip_${side}`, title: `Hüfte ${where}`, at: [dx, B(0.74)] },
            {
                name: `knee_${side}`,
                title: `Knie ${where}`,
                at: [dx + 4, B(0.43)],
            },
            {
                name: `ankle_${side}`,
                title: `Knöchel ${where}`,
                at: [dx, B(0.13)],
            },
            {
                name: `toe_${side}`,
                title: `Zehen ${where}`,
                at: [dx + 0.15 * M, B(0.13)],
            },
        );
    }
    const bones: TemplateBoneData[] = [
        {
            name: "hip",
            from: "pelvis",
            to: { from: "pelvis", toward: "neck", share: 0.16 },
        },
        { name: "torso", parent: "hip", from: "pelvis", to: "neck" },
        { name: "head", parent: "torso", from: "neck", to: "head_top" },
        { name: "jaw", parent: "head", from: "jaw", to: "chin" },
    ];
    for (const side of BIPED_SIDES) {
        bones.push(
            {
                name: `upper_arm_${side}`,
                parent: "torso",
                from: `shoulder_${side}`,
                to: `elbow_${side}`,
            },
            {
                name: `lower_arm_${side}`,
                parent: `upper_arm_${side}`,
                from: `elbow_${side}`,
                to: `wrist_${side}`,
            },
            {
                name: `hand_${side}`,
                parent: `lower_arm_${side}`,
                from: `wrist_${side}`,
                to: `fingers_${side}`,
            },
            {
                name: `thigh_${side}`,
                parent: "hip",
                from: `hip_${side}`,
                to: `knee_${side}`,
            },
            {
                name: `shin_${side}`,
                parent: `thigh_${side}`,
                from: `knee_${side}`,
                to: `ankle_${side}`,
            },
            {
                name: `foot_${side}`,
                parent: `shin_${side}`,
                from: `ankle_${side}`,
                to: `toe_${side}`,
            },
        );
    }
    const anchors: Record<string, TemplateAnchorData> = {
        head_top: { bone: "head", along: 0.98, across: 0.055, forward: true },
        belt: { bone: "torso", along: 0, forward: true },
        back: { bone: "torso", along: 0.56, across: -0.34, forward: true },
        mouth: { bone: "jaw", along: 1, forward: true },
    };
    for (const side of BIPED_SIDES) {
        anchors[`heel_${side}`] = {
            bone: `foot_${side}`,
            along: -0.4,
            ground: true,
        };
        anchors[`toe_${side}`] = {
            bone: `foot_${side}`,
            along: 1.27,
            ground: true,
        };
        anchors[`hand_${side}`] = {
            bone: `hand_${side}`,
            along: 0.5,
            across: -0.18,
            forward: true,
        };
        anchors[`foot_${side}`] = {
            bone: `foot_${side}`,
            along: 0.43,
            ground: true,
            forward: true,
        };
        anchors[`leg_${side}_sole`] = {
            bone: `foot_${side}`,
            along: 0.43,
            ground: true,
        };
        anchors[`arm_${side}_tip`] = { bone: `hand_${side}`, along: 1 };
    }
    const limb = (side: "l" | "r") => [
        `upper_arm_${side}`,
        `lower_arm_${side}`,
        `hand_${side}`,
    ];
    const leg = (side: "l" | "r") => [
        `thigh_${side}`,
        `shin_${side}`,
        `foot_${side}`,
    ];
    return {
        name: "zweibeiner",
        title: "Zweibeiner",
        kind: "biped",
        skeleton: "biped-side",
        root: "pelvis",
        joints,
        bones,
        anchors,
        chains: [
            {
                name: "spine",
                role: "spine",
                bones: ["hip", "torso"],
                tip_anchor: "back",
            },
            {
                name: "head",
                role: "head",
                bones: ["head"],
                tip_anchor: "head_top",
            },
            {
                name: "arm_l",
                role: "arm",
                bones: limb("l"),
                side: "far",
                tip_anchor: "arm_l_tip",
                bend: "back",
            },
            {
                name: "arm_r",
                role: "arm",
                bones: limb("r"),
                side: "near",
                tip_anchor: "arm_r_tip",
                bend: "back",
            },
            {
                name: "leg_l",
                role: "leg",
                bones: leg("l"),
                side: "far",
                stands: true,
                tip_anchor: "leg_l_sole",
                bend: "forward",
            },
            {
                name: "leg_r",
                role: "leg",
                bones: leg("r"),
                side: "near",
                stands: true,
                tip_anchor: "leg_r_sole",
                bend: "forward",
            },
        ],
        soles: ["heel_l", "toe_l", "heel_r", "toe_r"],
        // One per part, as step 41's soft wanderer: an arm hanging over a leg must be a picture of
        // its own, or the cells between them tear when the arm swings forward and the leg back.
        layers: [
            { name: "far_arm", title: "Arm hinten", bones: limb("l") },
            { name: "far_leg", title: "Bein hinten", bones: leg("l") },
            { name: "near_leg", title: "Bein vorne", bones: leg("r") },
            { name: "torso", title: "Rumpf", bones: ["hip", "torso"] },
            { name: "head", title: "Kopf", bones: ["head", "jaw"] },
            { name: "near_arm", title: "Arm vorne", bones: limb("r") },
        ],
        groups: [
            {
                name: "back",
                title: "Hinten",
                bones: [...limb("l"), ...leg("l")],
            },
            {
                name: "body",
                title: "Körper",
                bones: ["hip", "torso", "head", "jaw"],
            },
            {
                name: "front",
                title: "Vorne",
                bones: [...leg("r"), ...limb("r")],
            },
        ],
        slots: [
            ...limb("l"),
            ...leg("l"),
            ...leg("r"),
            "hip",
            "torso",
            "head",
            "jaw",
            ...limb("r"),
        ],
        jaw: "jaw",
        height: 0.84 * M + 1.0 * M,
    };
}

function quadruped_template(): SkeletonTemplate {
    const joints: TemplateJointData[] = [
        { name: "tail_tip", title: "Schwanzspitze", at: [-150, -205] },
        { name: "tail_mid", title: "Schwanz", at: [-95, -192] },
        { name: "hip", title: "Hüfte", at: [-40, -172] },
        { name: "back", title: "Rücken", at: [40, -180] },
        { name: "shoulders", title: "Schultern", at: [115, -176] },
        { name: "head_base", title: "Hinterkopf", at: [160, -236] },
        { name: "snout", title: "Schnauze", at: [240, -214] },
        { name: "jaw", title: "Kiefer", at: [178, -216] },
        { name: "chin", title: "Kinn", at: [228, -200] },
    ];
    const legs: Array<[string, string, number, string]> = [
        ["h", "hinten", -40, "Hinterbein"],
        ["f", "vorne", 115, "Vorderbein"],
    ];
    for (const [end, , x, title] of legs) {
        for (const side of BIPED_SIDES) {
            const dx = x + (side === "l" ? -12 : 0);
            const where = side === "l" ? "fern" : "nah";
            const hind = end === "h";
            joints.push(
                {
                    name: `top_${end}${side}`,
                    title: `${title} ${where} oben`,
                    at: [dx, -160],
                },
                {
                    name: `knee_${end}${side}`,
                    title: `${title} ${where} Knie`,
                    at: [dx + (hind ? 18 : 2), -100],
                },
                {
                    name: `ankle_${end}${side}`,
                    title: `${title} ${where} Gelenk`,
                    at: [dx + (hind ? -6 : -2), -40],
                },
                {
                    name: `toe_${end}${side}`,
                    title: `${title} ${where} Pfote`,
                    at: [dx + 16, 0],
                },
            );
        }
    }
    const bones: TemplateBoneData[] = [
        { name: "spine_1", from: "hip", to: "back" },
        { name: "spine_2", parent: "spine_1", from: "back", to: "shoulders" },
        { name: "tail_1", parent: "spine_1", from: "hip", to: "tail_mid" },
        { name: "tail_2", parent: "tail_1", from: "tail_mid", to: "tail_tip" },
        {
            name: "neck_1",
            parent: "spine_2",
            from: "shoulders",
            to: "head_base",
        },
        { name: "head", parent: "neck_1", from: "head_base", to: "snout" },
        { name: "jaw", parent: "head", from: "jaw", to: "chin" },
    ];
    const chains: SkeletonChainData[] = [
        {
            name: "spine",
            role: "spine",
            bones: ["spine_1", "spine_2"],
            tip_anchor: "spine_tip",
        },
        {
            name: "tail",
            role: "tail",
            bones: ["tail_1", "tail_2"],
            tip_anchor: "tail_tip",
        },
        {
            name: "neck",
            role: "neck",
            bones: ["neck_1"],
            tip_anchor: "neck_tip",
        },
        { name: "head", role: "head", bones: ["head"], tip_anchor: "head_tip" },
    ];
    const anchors: Record<string, TemplateAnchorData> = {
        spine_tip: { bone: "spine_2", along: 1 },
        tail_tip: { bone: "tail_2", along: 1 },
        neck_tip: { bone: "neck_1", along: 1 },
        head_tip: { bone: "head", along: 1 },
        head_top: { bone: "head", along: 0.2, across: -0.3, forward: true },
        mouth: { bone: "jaw", along: 1, forward: true },
    };
    const soles: string[] = [];
    const layer_bones: Record<"l" | "r", string[]> = { l: [], r: [] };
    const leg_bones: Record<string, string[]> = {};
    for (const [end] of legs) {
        for (const side of BIPED_SIDES) {
            const names = [
                `thigh_${end}${side}`,
                `shin_${end}${side}`,
                `paw_${end}${side}`,
            ];
            const parent = end === "h" ? "spine_1" : "spine_2";
            bones.push(
                {
                    name: names[0],
                    parent,
                    from: `top_${end}${side}`,
                    to: `knee_${end}${side}`,
                },
                {
                    name: names[1],
                    parent: names[0],
                    from: `knee_${end}${side}`,
                    to: `ankle_${end}${side}`,
                },
                {
                    name: names[2],
                    parent: names[1],
                    from: `ankle_${end}${side}`,
                    to: `toe_${end}${side}`,
                },
            );
            const chain = `${end === "h" ? "hind" : "front"}_${side}`;
            anchors[`${chain}_sole`] = {
                bone: names[2],
                along: 1,
                ground: true,
            };
            soles.push(`${chain}_sole`);
            chains.push({
                name: chain,
                role: "leg",
                bones: names,
                side: side === "l" ? "far" : "near",
                stands: true,
                front: end === "f",
                tip_anchor: `${chain}_sole`,
                bend: end === "h" ? "forward" : "back",
            });
            layer_bones[side].push(...names);
            leg_bones[`${end}${side}`] = names;
        }
    }
    const body = [
        "spine_1",
        "spine_2",
        "tail_1",
        "tail_2",
        "neck_1",
        "head",
        "jaw",
    ];
    return {
        name: "vierbeiner",
        title: "Vierbeiner",
        kind: "quadruped",
        skeleton: "drawn-quadruped",
        root: { from: "hip", toward: "shoulders", share: 0.5 },
        joints,
        bones,
        anchors,
        chains,
        soles,
        layers: [
            {
                name: "far_hind_leg",
                title: "Hinterbein fern",
                bones: leg_bones.hl,
            },
            {
                name: "far_front_leg",
                title: "Vorderbein fern",
                bones: leg_bones.fl,
            },
            { name: "tail", title: "Schwanz", bones: ["tail_1", "tail_2"] },
            { name: "torso", title: "Rumpf", bones: ["spine_1", "spine_2"] },
            { name: "head", title: "Kopf", bones: ["neck_1", "head", "jaw"] },
            {
                name: "near_hind_leg",
                title: "Hinterbein nah",
                bones: leg_bones.hr,
            },
            {
                name: "near_front_leg",
                title: "Vorderbein nah",
                bones: leg_bones.fr,
            },
        ],
        groups: [
            { name: "back", title: "Hinten", bones: layer_bones.l },
            { name: "body", title: "Körper", bones: body },
            { name: "front", title: "Vorne", bones: layer_bones.r },
        ],
        slots: [...layer_bones.l, ...body, ...layer_bones.r],
        jaw: "jaw",
        height: 240,
    };
}

function worm_template(): SkeletonTemplate {
    const count = 8;
    const joints: TemplateJointData[] = [];
    for (let index = 0; index <= count; index++) {
        const x = -200 + index * 45;
        const name =
            index === 0
                ? "tail_end"
                : index === count
                  ? "neck"
                  : `ring_${index}`;
        const title =
            index === 0
                ? "Schwanzende"
                : index === count
                  ? "Hals"
                  : `Glied ${index}`;
        joints.push({ name, title, at: [x, -26] });
    }
    joints.push(
        { name: "snout", title: "Schnauze", at: [228, -34] },
        { name: "jaw", title: "Kiefer", at: [176, -26] },
        { name: "chin", title: "Kinn", at: [218, -16] },
    );
    const point = (index: number) => joints[index].name;
    const bones: TemplateBoneData[] = [];
    const body: string[] = [];
    for (let index = 1; index <= count; index++) {
        const name = `body_${index}`;
        bones.push({
            name,
            ...(index > 1 ? { parent: `body_${index - 1}` } : {}),
            from: point(index - 1),
            to: point(index),
        });
        body.push(name);
    }
    bones.push(
        { name: "head", parent: `body_${count}`, from: "neck", to: "snout" },
        { name: "jaw", parent: "head", from: "jaw", to: "chin" },
    );
    return {
        name: "wurm",
        title: "Wurm",
        kind: "worm",
        skeleton: "drawn-worm",
        root: { from: "tail_end", toward: "neck", share: 0.5 },
        joints,
        bones,
        anchors: {
            body_tip: { bone: `body_${count}`, along: 1 },
            head_tip: { bone: "head", along: 1 },
            head_top: { bone: "head", along: 0.3, across: -0.3, forward: true },
            mouth: { bone: "jaw", along: 1, forward: true },
        },
        chains: [
            { name: "body", role: "body", bones: body, tip_anchor: "body_tip" },
            {
                name: "head",
                role: "head",
                bones: ["head"],
                tip_anchor: "head_tip",
            },
        ],
        soles: [],
        layers: [
            { name: "torso", title: "Rumpf", bones: body },
            { name: "head", title: "Kopf", bones: ["head", "jaw"] },
        ],
        groups: [
            { name: "body", title: "Körper", bones: [...body, "head", "jaw"] },
        ],
        slots: [...body, "head", "jaw"],
        jaw: "jaw",
        height: 34,
    };
}

function flyer_template(): SkeletonTemplate {
    const joints: TemplateJointData[] = [
        { name: "tail_tip", title: "Schwanzspitze", at: [-130, -150] },
        { name: "tail_mid", title: "Schwanz", at: [-70, -142] },
        { name: "hip", title: "Hüfte", at: [-10, -150] },
        { name: "chest", title: "Brust", at: [80, -168] },
        { name: "head_base", title: "Hinterkopf", at: [128, -212] },
        { name: "snout", title: "Schnabel", at: [196, -206] },
        { name: "jaw", title: "Kiefer", at: [146, -204] },
        { name: "chin", title: "Kinn", at: [184, -192] },
    ];
    const bones: TemplateBoneData[] = [
        { name: "spine_1", from: "hip", to: "chest" },
        { name: "tail_1", parent: "spine_1", from: "hip", to: "tail_mid" },
        { name: "tail_2", parent: "tail_1", from: "tail_mid", to: "tail_tip" },
        { name: "neck_1", parent: "spine_1", from: "chest", to: "head_base" },
        { name: "head", parent: "neck_1", from: "head_base", to: "snout" },
        { name: "jaw", parent: "head", from: "jaw", to: "chin" },
    ];
    const anchors: Record<string, TemplateAnchorData> = {
        tail_tip: { bone: "tail_2", along: 1 },
        neck_tip: { bone: "neck_1", along: 1 },
        head_tip: { bone: "head", along: 1 },
        head_top: { bone: "head", along: 0.2, across: -0.3, forward: true },
        mouth: { bone: "jaw", along: 1, forward: true },
    };
    const chains: SkeletonChainData[] = [
        {
            name: "spine",
            role: "spine",
            bones: ["spine_1"],
            tip_anchor: "spine_tip",
        },
        {
            name: "tail",
            role: "tail",
            bones: ["tail_1", "tail_2"],
            tip_anchor: "tail_tip",
        },
        {
            name: "neck",
            role: "neck",
            bones: ["neck_1"],
            tip_anchor: "neck_tip",
        },
        { name: "head", role: "head", bones: ["head"], tip_anchor: "head_tip" },
    ];
    anchors.spine_tip = { bone: "spine_1", along: 1 };
    const sides: Record<"l" | "r", string[]> = { l: [], r: [] };
    const parts: Record<string, string[]> = {};
    for (const side of BIPED_SIDES) {
        const far = side === "l";
        const dx = far ? -16 : 0;
        const where = far ? "fern" : "nah";
        joints.push(
            {
                name: `wing_root_${side}`,
                title: `Flügel ${where} Ansatz`,
                at: [60 + dx, -172],
            },
            {
                name: `wing_elbow_${side}`,
                title: `Flügel ${where} Bug`,
                at: [30 + dx, -246],
            },
            {
                name: `wing_wrist_${side}`,
                title: `Flügel ${where} Hand`,
                at: [-10 + dx, -312],
            },
            {
                name: `wing_tip_${side}`,
                title: `Flügel ${where} Spitze`,
                at: [-56 + dx, -366],
            },
            {
                name: `hip_${side}`,
                title: `Bein ${where} oben`,
                at: [0 + dx, -140],
            },
            {
                name: `knee_${side}`,
                title: `Bein ${where} Knie`,
                at: [22 + dx, -102],
            },
            {
                name: `ankle_${side}`,
                title: `Bein ${where} Gelenk`,
                at: [8 + dx, -64],
            },
            {
                name: `toe_${side}`,
                title: `Bein ${where} Krallen`,
                at: [30 + dx, -50],
            },
        );
        const wing = [`wing_a_${side}`, `wing_b_${side}`, `wing_c_${side}`];
        const leg = [`thigh_${side}`, `shin_${side}`, `foot_${side}`];
        bones.push(
            {
                name: wing[0],
                parent: "spine_1",
                from: `wing_root_${side}`,
                to: `wing_elbow_${side}`,
            },
            {
                name: wing[1],
                parent: wing[0],
                from: `wing_elbow_${side}`,
                to: `wing_wrist_${side}`,
            },
            {
                name: wing[2],
                parent: wing[1],
                from: `wing_wrist_${side}`,
                to: `wing_tip_${side}`,
            },
            {
                name: leg[0],
                parent: "spine_1",
                from: `hip_${side}`,
                to: `knee_${side}`,
            },
            {
                name: leg[1],
                parent: leg[0],
                from: `knee_${side}`,
                to: `ankle_${side}`,
            },
            {
                name: leg[2],
                parent: leg[1],
                from: `ankle_${side}`,
                to: `toe_${side}`,
            },
        );
        anchors[`wing_${side}_tip`] = { bone: wing[2], along: 1 };
        anchors[`leg_${side}_tip`] = { bone: leg[2], along: 1 };
        chains.push(
            {
                name: `wing_${side}`,
                role: "wing",
                bones: wing,
                side: far ? "far" : "near",
                tip_anchor: `wing_${side}_tip`,
            },
            {
                name: `leg_${side}`,
                role: "leg",
                bones: leg,
                side: far ? "far" : "near",
                tip_anchor: `leg_${side}_tip`,
                bend: "forward",
            },
        );
        sides[side].push(...wing, ...leg);
        parts[`wing_${side}`] = wing;
        parts[`leg_${side}`] = leg;
    }
    const body = ["spine_1", "tail_1", "tail_2", "neck_1", "head", "jaw"];
    return {
        name: "flieger",
        title: "Flieger",
        kind: "flyer",
        skeleton: "drawn-flyer",
        root: { from: "hip", toward: "chest", share: 0.5 },
        joints,
        bones,
        anchors,
        chains,
        soles: [],
        layers: [
            { name: "far_wing", title: "Flügel fern", bones: parts.wing_l },
            { name: "far_leg", title: "Bein fern", bones: parts.leg_l },
            { name: "tail", title: "Schwanz", bones: ["tail_1", "tail_2"] },
            { name: "torso", title: "Rumpf", bones: ["spine_1"] },
            { name: "head", title: "Kopf", bones: ["neck_1", "head", "jaw"] },
            { name: "near_leg", title: "Bein nah", bones: parts.leg_r },
            { name: "near_wing", title: "Flügel nah", bones: parts.wing_r },
        ],
        groups: [
            { name: "back", title: "Hinten", bones: sides.l },
            { name: "body", title: "Körper", bones: body },
            { name: "front", title: "Vorne", bones: sides.r },
        ],
        slots: [...sides.l, ...body, ...sides.r],
        jaw: "jaw",
        height: 366,
    };
}

/** The four skeleton templates of the Knochenwerkstatt (step 43), by name. */
export const SKELETON_TEMPLATES: Readonly<Record<string, SkeletonTemplate>> = {
    zweibeiner: biped_template(),
    vierbeiner: quadruped_template(),
    wurm: worm_template(),
    flieger: flyer_template(),
};

/** The templates' names in the order an editor offers them. */
export const SKELETON_TEMPLATE_NAMES: readonly string[] = [
    "zweibeiner",
    "vierbeiner",
    "wurm",
    "flieger",
];

/**
 * The bones a layer of this name follows: a part's (`far_arm`, `head`), else a group's (`back`,
 * `body`, `front`: older folders' layers); a layer or group without bones of its own follows every
 * bone. Null for a name the template doesn't know.
 */
export function template_layer_bones(
    template: SkeletonTemplate,
    name: string,
): readonly string[] | null {
    const found =
        template.layers.find((layer) => layer.name === name) ??
        template.groups?.find((group) => group.name === name);
    if (found === undefined) {
        return null;
    }
    return found.bones ?? template.bones.map((bone) => bone.name);
}

/** A template by name; throws with the names there are. */
export function skeleton_template(name: string): SkeletonTemplate {
    const template = SKELETON_TEMPLATES[name];
    if (template === undefined) {
        throw new Error(
            `no skeleton template "${name}"; there are ${SKELETON_TEMPLATE_NAMES.join(", ")}`,
        );
    }
    return template;
}

/** Placed joints: picture pixels (x right, y down) by joint name. */
export type JointPoints = Readonly<Record<string, readonly [number, number]>>;

/** A template fitted to a picture: the rig's bones, anchors and slots, and the body the gaits move. */
export interface FittedSkeleton {
    readonly template: SkeletonTemplate;
    /** Where the root sits in the picture's pixels (on the ground line). */
    readonly origin: readonly [number, number];
    /** The ground line's y in the picture's pixels. */
    readonly ground: number;
    /** Rig units: picture pixels from the root; `root` first, parents before children. */
    readonly bones: readonly BoneData[];
    readonly anchors: Readonly<Record<string, AnchorData>>;
    readonly slots: readonly SlotData[];
    /** For step 42's gaits and attacks (`make_gaits`, `make_bite`, ...). */
    readonly body: CreatureSkeleton;
    /** How large it is against the template (1: as tall as the template's `height`). */
    readonly size: number;
    /** Each bone's joint and tip at rest, in rig units. */
    readonly lines: Readonly<Record<string, BoneLine>>;
}

/** A bone at rest: from its joint to its tip, in rig units, and its world angle in degrees. */
export interface BoneLine {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
    readonly angle: number;
    readonly length: number;
}

const DEGREES = 180 / Math.PI;

/** Degrees in (-180, 180]. */
function wrap(degrees: number): number {
    let turned = degrees % 360;
    if (turned > 180) {
        turned -= 360;
    }
    if (turned <= -180) {
        turned += 360;
    }
    return turned;
}

/** Two decimals, never a negative zero (plain data stays short and stable). */
function r2(value: number): number {
    return Math.round(value * 100) / 100 + 0;
}

/** A point of the template on the placed joints (picture pixels); throws on a joint that isn't placed. */
export function template_point(
    point: TemplatePoint,
    joints: JointPoints,
): [number, number] {
    const joint = (name: string): readonly [number, number] => {
        const at = joints[name];
        if (
            at === undefined ||
            !Number.isFinite(at[0]) ||
            !Number.isFinite(at[1])
        ) {
            throw new Error(`joint "${name}" is not placed`);
        }
        return at;
    };
    if (typeof point === "string") {
        const at = joint(point);
        return [at[0], at[1]];
    }
    const from = joint(point.from);
    const toward = joint(point.toward);
    return [
        from[0] + (toward[0] - from[0]) * point.share,
        from[1] + (toward[1] - from[1]) * point.share,
    ];
}

/**
 * The template's joints laid onto a picture: scaled so the template is `height` pixels tall
 * (default its own height), its root at `origin` (default the middle of a `width` x `height`
 * picture, on a ground line near its bottom).
 */
export function template_joints(
    template: SkeletonTemplate,
    options: {
        readonly origin?: readonly [number, number];
        readonly scale?: number;
    } = {},
): Record<string, [number, number]> {
    const scale = options.scale ?? 1;
    const raw: Record<string, [number, number]> = {};
    for (const joint of template.joints) {
        raw[joint.name] = [joint.at[0], joint.at[1]];
    }
    const root_x = template_point(template.root, raw)[0];
    const origin = options.origin ?? [root_x, 0];
    const out: Record<string, [number, number]> = {};
    for (const joint of template.joints) {
        out[joint.name] = [
            r2(origin[0] + (joint.at[0] - root_x) * scale),
            r2(origin[1] + joint.at[1] * scale),
        ];
    }
    return out;
}

/**
 * Fits a template to joints placed on a picture: every bone's place, angle and length from its two
 * points, the anchors from the fitted bones, the chains for step 42's gaits. The root sits on
 * `ground` (a y in the picture's pixels) under the template's root point. A limb drawn straight
 * gets a slight bend the way the template says (`bend`), so a gait knows which way it folds.
 * Throws when a joint is missing.
 */
export function fit_template(
    template: SkeletonTemplate,
    joints: JointPoints,
    ground: number,
): FittedSkeleton {
    if (!Number.isFinite(ground)) {
        throw new Error("fit_template: the ground must be a number");
    }
    const placed: Record<string, [number, number]> = {};
    for (const joint of template.joints) {
        placed[joint.name] = template_point(joint.name, joints);
    }
    unbend_straight_limbs(template, placed);
    const root_x = template_point(template.root, placed)[0];
    const origin: [number, number] = [root_x, ground];
    const lines: Record<string, BoneLine> = {};
    let top = 0;
    for (const bone of template.bones) {
        const from = template_point(bone.from, placed);
        const to = template_point(bone.to, placed);
        const x0 = from[0] - origin[0];
        const y0 = from[1] - origin[1];
        const x1 = to[0] - origin[0];
        const y1 = to[1] - origin[1];
        const length = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
        lines[bone.name] = {
            x0,
            y0,
            x1,
            y1,
            angle: Math.atan2(y1 - y0, x1 - x0) * DEGREES,
            length,
        };
        top = Math.min(top, y0, y1);
    }
    const size = Math.max(0.05, -top / template.height);
    const bones: BoneData[] = [{ name: "root", length: r2(20 * size) }];
    for (const bone of template.bones) {
        const line = lines[bone.name];
        const parent =
            bone.parent === undefined
                ? { x0: 0, y0: 0, angle: 0 }
                : lines[bone.parent];
        if (parent === undefined) {
            throw new Error(
                `template ${template.name}: bone "${bone.name}" hangs on "${bone.parent}", which must come before it`,
            );
        }
        const radians = -parent.angle / DEGREES;
        const dx = line.x0 - parent.x0;
        const dy = line.y0 - parent.y0;
        bones.push({
            name: bone.name,
            parent: bone.parent ?? "root",
            x: r2(dx * Math.cos(radians) - dy * Math.sin(radians)),
            y: r2(dx * Math.sin(radians) + dy * Math.cos(radians)),
            rotation: r2(wrap(line.angle - parent.angle)),
            length: r2(line.length),
        });
    }
    const anchors: Record<string, AnchorData> = {};
    for (const [name, anchor] of Object.entries(template.anchors)) {
        const line = lines[anchor.bone];
        if (line === undefined) {
            throw new Error(
                `template ${template.name}: anchor "${name}" on no bone "${anchor.bone}"`,
            );
        }
        const radians = line.angle / DEGREES;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const along = (anchor.along ?? 0) * line.length;
        const across = (anchor.across ?? 0) * line.length;
        let x = line.x0 + cos * along - sin * across;
        let y = line.y0 + sin * along + cos * across;
        if (anchor.ground === true) {
            y = 0;
        }
        // Back into the bone's frame.
        const dx = x - line.x0;
        const dy = y - line.y0;
        x = dx * cos + dy * sin;
        y = -dx * sin + dy * cos;
        anchors[name] = {
            bone: anchor.bone,
            x: r2(x),
            y: r2(y),
            ...(anchor.forward === true
                ? { rotation: r2(wrap(-line.angle)) }
                : {}),
        };
    }
    const chains: CreatureChain[] = template.chains.map((chain) => {
        const first = template.bones.find(
            (bone) => bone.name === chain.bones[0],
        );
        return {
            name: chain.name,
            template: chain.name,
            role: chain.role,
            bones: chain.bones,
            lengths: chain.bones.map((bone) => lines[bone].length),
            side: chain.side ?? null,
            stands: chain.stands === true,
            front: chain.front === true,
            picture: layer_of(template, chain.bones[0]),
            parent: first?.parent ?? "root",
            tip_anchor: chain.tip_anchor,
        };
    });
    const body: CreatureSkeleton = {
        kind: template.kind,
        skeleton: template.skeleton,
        template: creature_template(template.kind),
        params: { size },
        bones,
        chains,
        anchors,
        pictures: template.layers.map((layer) => layer.name),
        size,
    };
    const bone_names = new Set(bones.map((bone) => bone.name));
    const slots = template.slots
        .filter((slot) => bone_names.has(slot))
        .map((slot) => ({ name: slot, bone: slot }));
    return {
        template,
        origin,
        ground,
        bones,
        anchors,
        slots,
        body,
        size,
        lines,
    };
}

/** The template layer whose bones hold this bone (else the first layer). */
function layer_of(template: SkeletonTemplate, bone: string): string {
    const layer =
        template.layers.find((each) => each.bones?.includes(bone) === true) ??
        template.layers.find((each) => each.bones === undefined) ??
        template.layers[0];
    return layer?.name ?? "body";
}

/**
 * A limb drawn quite straight (its middle joint within 2 % of its length off the line) gets its
 * middle joint moved that far to the side the template bends it, so two-bone IK keeps the bend.
 */
function unbend_straight_limbs(
    template: SkeletonTemplate,
    placed: Record<string, [number, number]>,
): void {
    for (const chain of template.chains) {
        if (chain.bend === undefined || chain.bones.length < 2) {
            continue;
        }
        const upper = template.bones.find(
            (bone) => bone.name === chain.bones[0],
        );
        const lower = template.bones.find(
            (bone) => bone.name === chain.bones[1],
        );
        if (
            upper === undefined ||
            lower === undefined ||
            typeof lower.from !== "string"
        ) {
            continue;
        }
        const start = template_point(upper.from, placed);
        const middle = template_point(lower.from, placed);
        const end = template_point(lower.to, placed);
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const length = Math.hypot(dx, dy);
        if (length < 1) {
            continue;
        }
        const ux = dx / length;
        const uy = dy / length;
        const along = (middle[0] - start[0]) * ux + (middle[1] - start[1]) * uy;
        const off = (middle[0] - start[0]) * -uy + (middle[1] - start[1]) * ux;
        if (Math.abs(off) >= 0.02 * length) {
            continue;
        }
        // The side that points forward (+x); for a limb lying flat, the one pointing down.
        let normal_x = -uy;
        let normal_y = ux;
        if (normal_x < -1e-9 || (Math.abs(normal_x) <= 1e-9 && normal_y < 0)) {
            normal_x = -normal_x;
            normal_y = -normal_y;
        }
        const side = chain.bend === "forward" ? 1 : -1;
        placed[lower.from] = [
            start[0] + ux * along + normal_x * side * 0.02 * length,
            start[1] + uy * along + normal_y * side * 0.02 * length,
        ];
    }
}

/**
 * The joints of a fitted skeleton again, in picture pixels: what `fit_template()` was given
 * (straightened limbs as bent), so a rig's joints can be edited and fitted anew.
 */
export function joints_of_fit(
    fitted: FittedSkeleton,
): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    const [ox, oy] = fitted.origin;
    for (const bone of fitted.template.bones) {
        const line = fitted.lines[bone.name];
        if (typeof bone.from === "string") {
            out[bone.from] = [r2(line.x0 + ox), r2(line.y0 + oy)];
        }
        if (typeof bone.to === "string") {
            out[bone.to] = [r2(line.x1 + ox), r2(line.y1 + oy)];
        }
    }
    return out;
}
