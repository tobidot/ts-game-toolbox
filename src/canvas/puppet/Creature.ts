import { SeededRandom } from "../../random/SeededRandom";
import { EventBase, EventSocket } from "../../signals/EventSocket";
import {
    CREATURE_ATTACKS,
    CreatureAttackData,
    CreatureHitArea,
    make_bite,
    make_claw,
    make_fire,
} from "./CreatureAttack";
import { chains_of, make_gaits } from "./CreatureGait";
import {
    creature_params,
    creature_template,
    CreatureChain,
    CreatureKind,
    CreatureSkeleton,
    make_skeleton_from_template,
    seed_for,
} from "./CreatureTemplate";
import type { KitPart, PartKit } from "./PartKit";
import { Puppet, PuppetDrawOptions } from "./Puppet";
import { PuppetMomentEvent, PuppetPlayOptions } from "./PuppetPlayer";
import { PuppetRig } from "./PuppetRig";
import { AnchorData, BoneData, JiggleData, RigData } from "./RigData";
import { Skeleton } from "./Skeleton";
import {
    canvas_of_pixels,
    compose_soft_skin,
    ComposedSoftSkin,
    placement_point,
    SoftPlacement,
    SoftTints,
} from "./SoftCompose";
import type { RgbaPixels } from "./SoftMesh";

/**
 * A creature as plain data (since step 42): the seed and kind it was made from, its values (the
 * sliders), the kit parts it wears by role, its three colours and its attacks. The same data
 * always makes the same creature with the same kit: save it, share it, load it.
 */
export interface CreatureData {
    readonly kind: CreatureKind;
    readonly seed: number;
    /** The template's values (`size`, `legs`, `tail`, ...). */
    readonly params: Readonly<Record<string, number>>;
    /** A kit part's id by role (`head`, `torso`, `foot`, `horn`, ...); a role left out has none. */
    readonly parts: Readonly<Record<string, string>>;
    readonly tints: SoftTints;
    /** Its attacks (`bite`, `fire`, `claw`): only those its body allows are made. */
    readonly attacks: readonly string[];
    /** What a game calls it. */
    readonly name?: string;
}

/** Colours a creature is tinted with; `make_creature_data()` picks one of each. */
export const CREATURE_COLORS = {
    main: [
        "#7d9a4c",
        "#9c5b3b",
        "#4f6e9c",
        "#8a4f8c",
        "#c08b3c",
        "#5a8c7b",
        "#a33d3d",
        "#6e5c4a",
        "#3f6040",
        "#a9a99a",
        "#c26c8c",
        "#4c4c5e",
    ],
    second: [
        "#ecdcb4",
        "#dcc274",
        "#b4d4c4",
        "#e4b4a4",
        "#c4cce4",
        "#f4e4d4",
        "#d4a464",
        "#e8e0a0",
    ],
    accent: [
        "#f2e8cc",
        "#3c3232",
        "#d4a434",
        "#a42424",
        "#6444a4",
        "#44a4a4",
        "#e47424",
        "#f4f4f4",
    ],
} as const;

/** How likely a creature of each kind breathes fire. */
const FIRE_CHANCE: Readonly<Record<CreatureKind, number>> = {
    quadruped: 0.3,
    biped: 0.3,
    worm: 0.55,
    flyer: 0.55,
};

/** The roles a creature of a kind wears, besides those its template's chains name. */
const DECOR_CHANCE: Readonly<Record<string, number>> = {
    horn: 0.5,
    ear: 0.5,
    spike: 0.4,
};

/** Every kit role a kind's template names. */
function roles_of(kind: CreatureKind): string[] {
    const template = creature_template(kind);
    const roles = new Set<string>();
    for (const chain of template.chains) {
        for (const role of [
            chain.part,
            ...(chain.parts ?? []),
            chain.tip_part,
            chain.base_part,
        ]) {
            if (role !== undefined) {
                roles.add(role);
            }
        }
    }
    return [...roles];
}

function pick_part(
    kit: PartKit,
    role: string,
    kind: CreatureKind,
    seed: number,
): KitPart | null {
    const parts = kit.parts_of(role, kind);
    if (parts.length === 0) {
        return null;
    }
    const random = new SeededRandom(seed_for(seed, `part:${role}`));
    const total = parts.reduce((sum, part) => sum + (part.weight ?? 1), 0);
    let at = random.next() * total;
    for (const part of parts) {
        at -= part.weight ?? 1;
        if (at < 0) {
            return part;
        }
    }
    return parts[parts.length - 1];
}

/** A colour a little lighter or darker, by `amount` (-1..1). */
function brighten(hex: string, amount: number): string {
    const value = parseInt(hex.slice(1), 16);
    const channel = (shift: number) => {
        const c = (value >> shift) & 255;
        const out = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
        return Math.round(Math.min(255, Math.max(0, out)))
            .toString(16)
            .padStart(2, "0");
    };
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * A creature's data from a kind and a seed: its values, parts, colours and attacks picked from the
 * seed (each from a stream of its own), `overrides` kept as given. The kit says which parts there
 * are; the attacks follow from the body: a bite with a jaw, a claw with claws, fire by chance (and
 * fire when nothing else is left).
 */
export function make_creature_data(
    kind: CreatureKind,
    seed: number,
    kit: PartKit,
    overrides: Partial<Omit<CreatureData, "kind" | "seed">> = {},
): CreatureData {
    const template = creature_template(kind);
    const params = creature_params(template, seed, overrides.params ?? {});
    const parts: Record<string, string> = {};
    for (const role of roles_of(kind)) {
        const part = pick_part(kit, role, kind, seed);
        if (part !== null) {
            parts[role] = part.id;
        }
    }
    for (const [role, chance] of Object.entries({ eye: 1, ...DECOR_CHANCE })) {
        const random = new SeededRandom(seed_for(seed, `wears:${role}`));
        if (random.next() < chance) {
            const part = pick_part(kit, role, kind, seed);
            if (part !== null) {
                parts[role] = part.id;
            }
        }
    }
    Object.assign(parts, overrides.parts ?? {});
    // The jaw goes with the head (unless the overrides name one).
    if (overrides.parts?.jaw === undefined) {
        const head = kit.part(parts.head ?? "");
        if (head?.jaw !== undefined && template.jaws !== false) {
            parts.jaw = head.jaw;
        } else {
            delete parts.jaw;
        }
    }
    for (const [role, id] of Object.entries(parts)) {
        if (id === "") {
            delete parts[role];
        }
    }
    const colors = new SeededRandom(seed_for(seed, "tints"));
    const tints: SoftTints = overrides.tints ?? {
        main: brighten(
            colors.pick(CREATURE_COLORS.main),
            colors.float(-0.12, 0.12),
        ),
        second: brighten(
            colors.pick(CREATURE_COLORS.second),
            colors.float(-0.1, 0.06),
        ),
        accent: colors.pick(CREATURE_COLORS.accent),
    };
    let attacks = overrides.attacks;
    if (attacks === undefined) {
        attacks = possible_attacks(kind, parts, kit).filter(
            (attack) => attack !== "fire",
        );
        const fire = new SeededRandom(seed_for(seed, "fire"));
        if (fire.next() < FIRE_CHANCE[kind] || attacks.length === 0) {
            attacks = [...attacks, "fire"];
        }
        attacks = CREATURE_ATTACKS.filter((attack) =>
            attacks!.includes(attack),
        );
    }
    return {
        kind,
        seed,
        params,
        parts,
        tints,
        attacks: [...attacks],
        ...(overrides.name === undefined ? {} : { name: overrides.name }),
    };
}

/** The attacks a body allows: `bite` with a jaw, `claw` with claws on its striking limb, `fire` always. */
export function possible_attacks(
    kind: CreatureKind,
    parts: Readonly<Record<string, string>>,
    kit: PartKit,
): string[] {
    const out: string[] = [];
    if (parts.jaw !== undefined && kit.part(parts.jaw) !== null) {
        out.push("bite");
    }
    out.push("fire");
    const limb_role = kind === "biped" ? "hand" : "foot";
    if (kit.part(parts[limb_role] ?? "")?.claws === true) {
        out.push("claw");
    }
    return out;
}

/** Everything made from a creature's data: its skeleton, its soft skin, its rig and its attacks. */
export interface CreatureBuild {
    readonly data: CreatureData;
    readonly body: CreatureSkeleton;
    readonly placements: readonly SoftPlacement[];
    readonly composed: ComposedSoftSkin;
    readonly rig: RigData;
    readonly attacks: Readonly<Record<string, CreatureAttackData>>;
}

const DEGREES = 180 / Math.PI;

/** The angle of a part's line as drawn, in degrees. */
function axis_of(part: KitPart): number {
    return (
        Math.atan2(part.tip[1] - part.pivot[1], part.tip[0] - part.pivot[0]) *
        DEGREES
    );
}

/** Where every bone is at rest (joint, tip, angle) for placing parts. */
function rest_of(bones: readonly BoneData[]) {
    const skeleton = Skeleton.from_data(bones);
    skeleton.update();
    return {
        skeleton,
        joint: (name: string): [number, number] => {
            const index = skeleton.index_of(name);
            return [skeleton.world_x(index), skeleton.world_y(index)];
        },
        tip: (name: string): [number, number] => {
            const index = skeleton.index_of(name);
            const point = skeleton.world_point(
                index,
                skeleton.lengths[index],
                0,
            );
            return [point.x, point.y];
        },
        angle: (name: string): number =>
            skeleton.world_rotation(skeleton.index_of(name)),
        local: (name: string, x: number, y: number): [number, number] => {
            const point = skeleton.local_point(skeleton.index_of(name), x, y);
            return [point.x, point.y];
        },
    };
}

/**
 * Makes a creature's skeleton, soft skin, clips and attacks from its data and a kit (with its
 * pixels). Pure: the same data and kit give the same rig and the same pixels.
 */
export function build_creature(
    data: CreatureData,
    kit: PartKit,
): CreatureBuild {
    const template = creature_template(data.kind);
    const made = make_skeleton_from_template(template, data.seed, data.params);
    const part_of = (role: string, required: boolean): KitPart | null => {
        const id = data.parts[role];
        const part = id === undefined ? null : kit.part(id);
        if (id !== undefined && part === null) {
            throw new Error(`creature: the kit has no part "${id}" (${role})`);
        }
        if (part === null && required) {
            throw new Error(
                `creature: no ${role} (the kit has none for a ${data.kind})`,
            );
        }
        return part;
    };
    const random = (name: string) =>
        new SeededRandom(seed_for(data.seed, `place:${name}`));
    let bones: BoneData[] = [...made.bones];
    const anchors: Record<string, AnchorData> = { ...made.anchors };
    let rest = rest_of(bones);
    const placements: SoftPlacement[] = [];
    const shade_of = (chain: CreatureChain) =>
        chain.side === "far" ? 0.76 : 1;
    const girth = (name: string, low: number, high: number) =>
        random(`girth:${name}`).float(low, high);

    // The head first: its jaw is a bone the head part says where.
    const head_chain = chains_of(made, "head")[0] ?? null;
    const head_part = head_chain === null ? null : part_of("head", true);
    let head_placement: SoftPlacement | null = null;
    let jaw: string | null = null;
    const jaw_part = part_of("jaw", false);
    if (head_chain !== null && head_part !== null) {
        const bone = head_chain.bones[0];
        head_placement = {
            part: head_part.id,
            picture: head_chain.picture,
            bone,
            at: rest.joint(bone),
            to: rest.tip(bone),
            girth: girth("head", 0.92, 1.1),
        };
        const hinge = head_part.points?.jaw;
        const chin = head_part.points?.chin;
        if (jaw_part !== null && hinge !== undefined && chin !== undefined) {
            const from = placement_point(head_part, head_placement, hinge);
            const to = placement_point(head_part, head_placement, chin);
            const local = rest.local(bone, from[0], from[1]);
            const angle =
                Math.atan2(to[1] - from[1], to[0] - from[0]) * DEGREES;
            const at = bones.findIndex((item) => item.name === bone);
            jaw = "jaw";
            bones = [
                ...bones.slice(0, at + 1),
                {
                    name: jaw,
                    parent: bone,
                    x: local[0],
                    y: local[1],
                    rotation: angle - rest.angle(bone),
                    length: Math.hypot(to[0] - from[0], to[1] - from[1]),
                },
                ...bones.slice(at + 1),
            ];
            rest = rest_of(bones);
        }
        const mouth = head_part.points?.mouth ?? head_part.tip;
        const mouth_at = placement_point(head_part, head_placement, mouth);
        const mouth_local = rest.local(bone, mouth_at[0], mouth_at[1]);
        anchors.mouth = {
            bone,
            x: mouth_local[0],
            y: mouth_local[1],
            rotation: 0,
        };
        const top =
            head_part.points?.horn ?? head_part.points?.ear ?? head_part.pivot;
        const top_at = placement_point(head_part, head_placement, top);
        const top_local = rest.local(bone, top_at[0], top_at[1]);
        anchors.head_top = { bone, x: top_local[0], y: top_local[1] };
    }

    // Each chain's parts.
    const by_picture: SoftPlacement[][] = [];
    const body_under: SoftPlacement[] = [];
    const body_main: SoftPlacement[] = [];
    const body_over: SoftPlacement[] = [];
    const scale_of = (placement: SoftPlacement, part: KitPart) => {
        if (placement.to === undefined) {
            return placement.scale ?? 1;
        }
        return (
            Math.hypot(
                placement.to[0] - placement.at[0],
                placement.to[1] - placement.at[1],
            ) /
            Math.hypot(part.tip[0] - part.pivot[0], part.tip[1] - part.pivot[1])
        );
    };
    const turn_of = (placement: SoftPlacement, part: KitPart) =>
        placement.to === undefined
            ? (placement.rotation ?? 0)
            : Math.atan2(
                  placement.to[1] - placement.at[1],
                  placement.to[0] - placement.at[0],
              ) *
                  DEGREES -
              axis_of(part);
    let torso: { placement: SoftPlacement; part: KitPart } | null = null;
    const segments: { placement: SoftPlacement; part: KitPart }[] = [];
    for (const chain of made.chains) {
        const spec = template.chains.find(
            (item) => item.name === chain.template,
        )!;
        const into = chain.picture === "body" ? body_main : [];
        if (chain.picture !== "body") {
            by_picture.push(into);
        }
        if (chain.role === "head") {
            if (head_placement !== null) {
                into.push(head_placement);
            }
            continue;
        }
        const shade = shade_of(chain);
        const zone_bone = chain.parent === "root" ? null : chain.parent;
        if (spec.part !== undefined) {
            const part = part_of(spec.part, true)!;
            const placement: SoftPlacement = {
                part: part.id,
                picture: chain.picture,
                bone: chain.bones[0],
                bones: chain.bones,
                at: rest.joint(chain.bones[0]),
                to: rest.tip(chain.bones[chain.bones.length - 1]),
                girth: girth(
                    chain.template,
                    chain.role === "spine" ? 0.88 : 0.95,
                    chain.role === "spine" ? 1.18 : 1.08,
                ),
                shade,
                ...(zone_bone === null
                    ? {}
                    : {
                          zone: {
                              bone: zone_bone,
                              radius:
                                  chain.lengths.reduce(
                                      (sum, bone) => sum + bone,
                                      0,
                                  ) * 0.1,
                          },
                      }),
            };
            into.push(placement);
            if (chain.role === "spine") {
                torso = { placement, part };
            }
        }
        if (spec.parts !== undefined) {
            const limb = chain.role === "leg" || chain.role === "arm";
            const list: SoftPlacement[] = [];
            const chain_girth = girth(chain.template, 0.9, 1.12);
            for (const [index, bone] of chain.bones.entries()) {
                const role = spec.parts[Math.min(index, spec.parts.length - 1)];
                const part = part_of(
                    chain.role === "arm" && role === "hand" ? "hand" : role,
                    true,
                )!;
                const taper =
                    chain.role === "tail"
                        ? 1 - (0.5 * index) / Math.max(1, chain.bones.length)
                        : 1;
                const placement: SoftPlacement = {
                    part: part.id,
                    picture: chain.picture,
                    bone,
                    at: rest.joint(bone),
                    to: rest.tip(bone),
                    girth: chain_girth * taper,
                    shade,
                    ...(index === 0 && zone_bone !== null
                        ? {
                              zone: {
                                  bone: zone_bone,
                                  radius: chain.lengths[0] * (limb ? 0.3 : 0.4),
                              },
                          }
                        : {}),
                };
                list.push(placement);
                if (chain.role === "body") {
                    segments.push({ placement, part });
                }
            }
            // Limbs: the upper bone over the lower, the lower over the foot.
            into.push(...(limb ? list.reverse() : list));
            const last = list[limb ? 0 : list.length - 1];
            if (spec.tip_part !== undefined && chain.bones.length > 0) {
                const tip_part = part_of(spec.tip_part, false);
                if (tip_part !== null && last !== undefined) {
                    const bone = chain.bones[chain.bones.length - 1];
                    const scale =
                        scale_of(last, kit.part(last.part)!) *
                        (last.girth ?? 1) *
                        1.15;
                    into.push({
                        part: tip_part.id,
                        picture: chain.picture,
                        bone,
                        at: rest.tip(bone),
                        rotation: rest.angle(bone) - axis_of(tip_part),
                        scale,
                        shade,
                    });
                }
            }
            if (spec.base_part !== undefined && list.length > 0) {
                const base_part = part_of(spec.base_part, false);
                if (base_part !== null) {
                    const bone = chain.bones[0];
                    const scale =
                        scale_of(list[0], kit.part(list[0].part)!) *
                        (list[0].girth ?? 1) *
                        1.1;
                    into.unshift({
                        part: base_part.id,
                        picture: chain.picture,
                        bone,
                        at: rest.joint(bone),
                        rotation: rest.angle(bone) + 180 - axis_of(base_part),
                        scale,
                        shade,
                    });
                }
            }
        }
    }

    // The head's decorations: eyes and the near horn and ear on top, the far ones behind.
    if (head_placement !== null && head_part !== null) {
        const head_scale = scale_of(head_placement, head_part);
        const head_turn = turn_of(head_placement, head_part);
        const bone = head_placement.bone;
        for (const role of ["horn", "ear"]) {
            const part = part_of(role, false);
            const point = head_part.points?.[role];
            if (part === null || point === undefined) {
                continue;
            }
            const draw = random(`decor:${role}`);
            const at = placement_point(head_part, head_placement, point);
            const scale = head_scale * draw.float(0.85, 1.2);
            const tilt = draw.float(-10, 10);
            const back =
                0.07 *
                Math.hypot(
                    head_placement.to![0] - head_placement.at[0],
                    head_placement.to![1] - head_placement.at[1],
                );
            const radians = (rest.angle(bone) * Math.PI) / 180;
            body_under.push({
                part: part.id,
                picture: head_placement.picture,
                bone,
                at: [
                    at[0] - Math.cos(radians) * back,
                    at[1] - Math.sin(radians) * back,
                ],
                rotation: head_turn + tilt - 6,
                scale,
                shade: 0.76,
            });
            body_over.push({
                part: part.id,
                picture: head_placement.picture,
                bone,
                at,
                rotation: head_turn + tilt,
                scale,
                over: true,
            });
        }
        const eye = part_of("eye", false);
        const eye_point = head_part.points?.eye;
        if (eye !== null && eye_point !== undefined) {
            body_over.unshift({
                part: eye.id,
                picture: head_placement.picture,
                bone,
                at: placement_point(head_part, head_placement, eye_point),
                rotation: head_turn,
                scale: head_scale * random("decor:eye").float(0.85, 1.25),
                over: true,
            });
        }
    }
    // Spikes along the back (a torso's `back_*` points) or on every other segment of a worm.
    const spike = part_of("spike", false);
    if (spike !== null) {
        const draw = random("decor:spike");
        if (torso !== null) {
            const { placement, part } = torso;
            const points = ["back_0", "back_1", "back_2"].map(
                (name) => part.points?.[name],
            );
            if (points.every((point) => point !== undefined)) {
                const [p0, p1, p2] = points.map((point) =>
                    placement_point(part, placement, point!),
                );
                const count = draw.int(3, 6);
                const scale = scale_of(placement, part) * draw.float(0.8, 1.1);
                for (let index = 0; index < count; index++) {
                    const f = (index + 0.5) / count;
                    // A curve through the three points.
                    const x =
                        (1 - f) * (1 - f) * p0[0] +
                        2 * (1 - f) * f * (2 * p1[0] - (p0[0] + p2[0]) / 2) +
                        f * f * p2[0];
                    const y =
                        (1 - f) * (1 - f) * p0[1] +
                        2 * (1 - f) * f * (2 * p1[1] - (p0[1] + p2[1]) / 2) +
                        f * f * p2[1];
                    body_under.push({
                        part: spike.id,
                        picture: placement.picture,
                        bone: placement.bone,
                        bones: placement.bones,
                        at: [x, y],
                        rotation: turn_of(placement, part) + draw.float(-8, 8),
                        scale: scale * (1 - 0.35 * Math.abs(2 * f - 1)),
                    });
                }
            }
        }
        for (const [index, { placement, part }] of segments.entries()) {
            const top = part.points?.top;
            if (top === undefined || index % 2 === 0) {
                continue;
            }
            body_under.push({
                part: spike.id,
                picture: placement.picture,
                bone: placement.bone,
                at: placement_point(part, placement, top),
                rotation: turn_of(placement, part),
                scale: scale_of(placement, part) * (placement.girth ?? 1) * 0.8,
            });
        }
    }
    // The jaw, in a picture of its own behind the head, so opening it never pulls on the head.
    if (jaw !== null && jaw_part !== null) {
        by_picture.push([
            {
                part: jaw_part.id,
                picture: "jaw",
                bone: jaw,
                at: rest.joint(jaw),
                to: rest.tip(jaw),
                girth: head_placement?.girth ?? 1,
            },
        ]);
    }
    placements.push(
        ...by_picture.flat(),
        ...body_under,
        ...body_main,
        ...body_over,
    );
    let composed = compose_soft_skin(kit, placements, data.tints, {
        bones,
        pictures: template.pictures,
    });
    // A creature lying on the ground (a worm) is settled onto it: its lowest pixel on y = 0.
    if (
        !made.chains.some((chain) => chain.stands) &&
        template.hover === undefined
    ) {
        const lowest = lowest_pixel(composed);
        if (Number.isFinite(lowest) && Math.abs(lowest) > 0.01) {
            bones = bones.map((bone) =>
                bone.parent === "root"
                    ? { ...bone, y: (bone.y ?? 0) - lowest }
                    : bone,
            );
            composed = {
                ...composed,
                soft: {
                    ...composed.soft,
                    pictures: composed.soft.pictures.map((picture) => ({
                        ...picture,
                        origin: [
                            picture.origin[0],
                            picture.origin[1] + lowest,
                        ] as const,
                    })),
                },
                bounds: [
                    composed.bounds[0],
                    composed.bounds[1] - lowest,
                    composed.bounds[2],
                    composed.bounds[3],
                ],
            };
        }
    }
    const body: CreatureSkeleton = { ...made, bones, anchors };
    const clips = make_gaits(body);
    const attacks: Record<string, CreatureAttackData> = {};
    for (const name of data.attacks) {
        let attack: CreatureAttackData | null = null;
        if (name === "bite") {
            attack = make_bite(body, jaw);
        } else if (name === "fire") {
            attack = make_fire(body, jaw);
        } else if (name === "claw") {
            const limb_role = data.kind === "biped" ? "hand" : "foot";
            if (part_of(limb_role, false)?.claws === true) {
                attack = make_claw(body);
            }
        }
        if (attack !== null) {
            attacks[name] = attack;
            clips[name] = attack.clip;
        }
    }
    const jiggle: Record<string, JiggleData> = {};
    for (const tail of chains_of(body, "tail")) {
        for (const [index, bone] of tail.bones.entries()) {
            if (index > 0) {
                jiggle[bone] = {
                    half_life: 0.3,
                    strength: 0.5 + 0.1 * index,
                    max: 22,
                };
            }
        }
    }
    const skin = `creature-${data.seed}`;
    const rig: RigData = {
        skeleton: `${template.skeleton}#${data.seed}`,
        facing: "right",
        bounds: composed.bounds,
        bones,
        slots: [],
        skins: { [skin]: { attachments: {}, soft: composed.soft } },
        default_skin: skin,
        anchors,
        clips,
        default_clip: "idle",
        ...(Object.keys(jiggle).length > 0 ? { jiggle } : {}),
    };
    return { data, body, placements, composed, rig, attacks };
}

/** The lowest painted pixel (alpha at least half) of a composed skin, in rig units. */
function lowest_pixel(composed: ComposedSoftSkin): number {
    const { pixels } = composed;
    let lowest = -Infinity;
    for (const picture of composed.soft.pictures) {
        const [x, y, width, height] = picture.rect;
        for (let v = height - 1; v >= 0; v--) {
            let found = false;
            for (let u = 0; u < width; u++) {
                if (
                    pixels.data[((y + v) * pixels.width + x + u) * 4 + 3] >= 128
                ) {
                    found = true;
                    break;
                }
            }
            if (found) {
                lowest = Math.max(lowest, v + 1 - picture.origin[1]);
                break;
            }
        }
    }
    return lowest;
}

/** An attack hit: where (in the puppet's own space, as `anchor_world()` gives it) and how large. */
export class CreatureHitEvent extends EventBase {
    public static readonly EVENT_NAME = "creature.hit";

    public constructor(
        public readonly creature: Creature,
        /** The attack's name (`bite`). */
        public readonly attack: string,
        public readonly area: CreatureHitArea,
        /** The anchor now. */
        public readonly x: number,
        public readonly y: number,
        /** The anchor's angle in degrees (a cone points this way). */
        public readonly angle: number,
    ) {
        super(CreatureHitEvent.EVENT_NAME);
    }
}

/** Where an attack's area is now: its anchor, angle and size, in the puppet's own space or as drawn. */
export interface CreatureAreaNow {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly radius: number;
    readonly shape: "circle" | "cone";
    readonly spread: number;
}

/**
 * A creature on stage: its data, its rig (a soft skin painted from the kit), one `Puppet` and its
 * attacks. `play("walk")` moves it, `attack("bite")` plays an attack once and goes back to what it
 * did, sending a `CreatureHitEvent` at each `hit` moment.
 *
 * ```ts
 * const monster = generate_creature("quadruped", 4711, kit);
 * monster.play("walk");
 * monster.events.attach(CreatureHitEvent, (hit) => dummy.take(hit));
 * monster.attack("bite");
 * save(monster.data);
 * ```
 */
export class Creature {
    public readonly rig: PuppetRig;
    public readonly puppet: Puppet;
    public readonly attacks: ReadonlyMap<string, CreatureAttackData>;
    public readonly events = new EventSocket<CreatureHitEvent>();
    private movement = "idle";
    private pending: string[] = [];

    public constructor(
        public readonly build: CreatureBuild,
        /** The picture to draw from; default a canvas of the composed pixels (a stand-in in Node). */
        image: CanvasImageSource | null = null,
        /** A rig made from the same build already (`copy()`): shared, with its picture and its grid. */
        rig: PuppetRig | null = null,
    ) {
        if (rig !== null) {
            this.rig = rig;
        } else {
            this.rig = PuppetRig.from_data(build.rig);
            this.rig.image =
                image ??
                canvas_of_pixels(build.composed.pixels) ??
                ({
                    width: build.composed.pixels.width,
                    height: build.composed.pixels.height,
                } as unknown as CanvasImageSource);
            const soft = this.rig.soft_skin;
            if (soft !== null) {
                soft.pixels = build.composed.pixels;
            }
        }
        this.puppet = this.rig.puppet("idle");
        this.attacks = new Map(Object.entries(build.attacks));
        this.puppet.player.events.attach(PuppetMomentEvent, (event) => {
            if (event.name === "hit" && this.attacks.has(event.clip)) {
                this.pending.push(event.clip);
            }
        });
    }

    /**
     * Another of the same creature, sharing this one's rig: its picture, its grid and, on the
     * graphics card, its mesh and texture (a herd of copies is one upload). It plays on its own.
     */
    public copy(): Creature {
        return new Creature(this.build, null, this.rig);
    }

    /** The creature as plain data (save it as it is). */
    public get data(): CreatureData {
        return this.build.data;
    }

    public get kind(): CreatureKind {
        return this.build.data.kind;
    }

    /** The composed atlas: the pictures and their bone maps. */
    public get pixels(): RgbaPixels {
        return this.build.composed.pixels;
    }

    /** The movement it does when no attack plays: `idle`, `walk`, `run`. */
    public get moving(): string {
        return this.movement;
    }

    /** Plays a movement clip (`idle`, `walk`, `run`); an attack playing finishes first. */
    public play(name: string, options?: PuppetPlayOptions): boolean {
        if (!this.rig.clips.has(name) || this.attacks.has(name)) {
            return false;
        }
        this.movement = name;
        if (this.attacking !== null) {
            return this.puppet.queue(name);
        }
        return this.puppet.play(name, options);
    }

    /** Plays an attack once (from its start), then goes back to the movement. False for one it doesn't have. */
    public attack(name: string): boolean {
        if (!this.attacks.has(name)) {
            return false;
        }
        this.puppet.play(name, { restart: true, fade: 0.08 });
        this.puppet.queue(this.movement);
        return true;
    }

    /** The attack playing now; null for none. */
    public get attacking(): string | null {
        const name = this.puppet.player.clip_name;
        if (
            name === null ||
            !this.attacks.has(name) ||
            this.puppet.player.finished
        ) {
            return null;
        }
        return name;
    }

    /** Something pours from the mouth now (fire): between the attack's `stream` seconds. */
    public get streaming(): boolean {
        const name = this.attacking;
        const stream =
            name === null ? undefined : this.attacks.get(name)?.stream;
        if (stream === undefined) {
            return false;
        }
        const time = this.puppet.player.time;
        return time >= stream[0] && time < stream[1];
    }

    /** Moves the clips on; the `hit` moments passed come as events with the pose after the update. */
    public update(delta_seconds: number): void {
        this.pending.length = 0;
        this.puppet.update(delta_seconds);
        for (const name of this.pending) {
            const area = this.attacks.get(name)!.area;
            const now = this.area_now(name);
            if (now !== null) {
                this.events.dispatch(
                    new CreatureHitEvent(
                        this,
                        name,
                        area,
                        now.x,
                        now.y,
                        now.angle,
                    ),
                );
            }
        }
        this.pending.length = 0;
    }

    /**
     * Where an attack's area is now: in the puppet's own space, or, given where and how `draw()`
     * draws it, in the context's (the radius scaled, the angle mirrored with `flip_x`).
     */
    public area_now(
        name: string,
        x = 0,
        y = 0,
        options: PuppetDrawOptions = {},
    ): CreatureAreaNow | null {
        const attack = this.attacks.get(name);
        if (attack === undefined) {
            return null;
        }
        const point = this.puppet.anchor_world(
            attack.area.anchor,
            x,
            y,
            options,
        );
        if (point === null) {
            return null;
        }
        return {
            x: point.x,
            y: point.y,
            angle: point.rotation,
            radius: attack.area.radius * (options.scale ?? 1),
            shape: attack.area.shape,
            spread: attack.area.spread ?? 0,
        };
    }

    /** Draws it as `Puppet.draw()` does (a soft skin: through a `SoftLayer`). */
    public draw(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        options: PuppetDrawOptions = {},
    ): boolean {
        return this.puppet.draw(context, x, y, options);
    }
}

/** Is a point inside an attack's area now (as `area_now()` gives it, in the same space)? */
export function in_area(
    area: CreatureAreaNow,
    x: number,
    y: number,
    slack = 0,
): boolean {
    const dx = x - area.x;
    const dy = y - area.y;
    const distance = Math.hypot(dx, dy);
    if (area.shape === "circle") {
        return distance <= area.radius + slack;
    }
    if (distance > area.radius + slack) {
        return false;
    }
    const angle = Math.atan2(dy, dx) * DEGREES;
    const off = Math.abs(((angle - area.angle + 540) % 360) - 180);
    return (
        off <=
        area.spread +
            (slack > 0 ? Math.atan2(slack, Math.max(1, distance)) * DEGREES : 0)
    );
}

/** A creature from its data and a kit (with its pixels): the same data always makes the same one. */
export function creature_from_data(
    data: CreatureData,
    kit: PartKit,
    image: CanvasImageSource | null = null,
): Creature {
    return new Creature(build_creature(data, kit), image);
}

/**
 * A creature of a kind from a seed and a kit: `make_creature_data()` then `creature_from_data()`.
 * `overrides` keeps values, parts, colours or attacks a game set (a slider).
 */
export function generate_creature(
    kind: CreatureKind,
    seed: number,
    kit: PartKit,
    overrides: Partial<Omit<CreatureData, "kind" | "seed">> = {},
): Creature {
    return creature_from_data(
        make_creature_data(kind, seed, kit, overrides),
        kit,
    );
}
