import { SeededRandom } from "../../random/SeededRandom";
import { AnchorData, BoneData } from "./RigData";

/** The four kinds of creature skeleton (since step 42). */
export type CreatureKind = "quadruped" | "biped" | "worm" | "flyer";

export const CREATURE_KINDS: readonly CreatureKind[] = [
    "quadruped",
    "biped",
    "worm",
    "flyer",
];

/** What a chain of bones is for: the gaits, the attacks and the part places go by it. */
export type CreatureRole =
    | "spine"
    | "neck"
    | "head"
    | "tail"
    | "leg"
    | "arm"
    | "wing"
    | "body";

/** `[min, max]`: the generator picks a number in between. */
export type CreatureRange = readonly [number, number];

/** A value a game may set (a slider), or the generator picks in its range. */
export interface CreatureParamData {
    /** What a game shows ("Größe"). */
    readonly title: string;
    readonly min: number;
    readonly max: number;
    /** Whole numbers only (a count of bones). */
    readonly whole?: boolean;
}

/**
 * A chain of bones in a template: a spine, a neck, a tail, a leg. Its bones lie one after the other
 * (each starts at the tip of the one before) and are named by `bone` (`"tail_{i}"`, 1 on) or `bones`
 * (`["thigh_h{s}", "shin_h{s}", "paw_h{s}"]`, `{s}` the side's letter: `l` far, `r` near).
 */
export interface TemplateChainData {
    /** The chain's name; with `sides` each side's is `name_l` and `name_r`. */
    readonly name: string;
    readonly role: CreatureRole;
    /** A name for each bone, `{i}` its number (1 on); for chains of any count. */
    readonly bone?: string;
    /** A name for each bone, `{s}` the side; the count is their number. */
    readonly bones?: readonly string[];
    /** The chain it hangs on (default the root); at its `end` (the last bone's tip, default) or `start` (the first bone's joint). */
    readonly parent?: string;
    readonly at?: "start" | "end";
    /** `[along, across]` the bone it hangs on, in units at size 1: where it starts from the place above. */
    readonly offset?: readonly [CreatureRange, CreatureRange];
    /** How many bones (whole numbers); `count_param` names a whole value that sets it instead. */
    readonly count?: CreatureRange;
    readonly count_param?: string;
    /** The whole chain's length at size 1; `per_bone` makes it each bone's. */
    readonly length: CreatureRange;
    readonly per_bone?: boolean;
    /** A value multiplying the length (the legs' or the wings' slider). */
    readonly length_param?: string;
    /** The first bone's angle at rest, in degrees on the screen (0 forward, 90 down, -90 up). */
    readonly angle: CreatureRange;
    /** Degrees each later bone turns from the one before: one range per bone, the last repeating. */
    readonly turns?: readonly CreatureRange[];
    /** Each bone's share of the length (default alike). */
    readonly shares?: readonly number[];
    /** One chain per side: `_l` the far one (drawn behind the body), `_r` the near one. */
    readonly sides?: boolean;
    /** Its tip stands on the ground at rest (a leg). */
    readonly stands?: boolean;
    /** A front leg (a quadruped's). */
    readonly front?: boolean;
    /** The chain starts half its length behind its place (a worm's body around the root). */
    readonly centred?: boolean;
    /** The picture it is painted into; with `sides` the side's `far_` or `near_` goes before it. */
    readonly picture: string;
    /**
     * The kit roles of its parts: `part` one part over the whole chain (a torso over the spine),
     * `parts` one per bone (the last repeating: a leg's upper, lower and foot), `tip_part` one more
     * on the last bone's tip (a tail's end), `base_part` one at the first joint pointing back (a worm's tail).
     */
    readonly part?: string;
    readonly parts?: readonly string[];
    readonly tip_part?: string;
    readonly base_part?: string;
}

/**
 * A skeleton template as plain data: values a game may set, the chains with ranges, the pictures
 * back to front. `make_skeleton_from_template()` picks the numbers.
 */
export interface CreatureTemplateData {
    readonly kind: CreatureKind;
    /** The skeleton's name in the rig (the clips of one creature fit no other). */
    readonly skeleton: string;
    /** What a game shows ("Vierbeiner"). */
    readonly title: string;
    readonly params: Readonly<Record<string, CreatureParamData>>;
    /** Parents first; the first hangs on the root. */
    readonly chains: readonly TemplateChainData[];
    /** The soft skin's pictures, back to front. */
    readonly pictures: readonly string[];
    /** How far the spine may tilt so front and hind legs both stand, in degrees. Default 16. */
    readonly tilt?: number;
    /** For creatures that never touch the ground: how high the lowest tip hangs over it at size 1. */
    readonly hover?: CreatureRange;
    /** For creatures lying on the ground (a worm): how high the body's bones are at size 1. */
    readonly lift?: CreatureRange;
    /** A head may carry a jaw. Default true. */
    readonly jaws?: boolean;
}

/** One chain of a made skeleton. */
export interface CreatureChain {
    /** `"hind_l"`, `"tail"`. */
    readonly name: string;
    /** The template's chain. */
    readonly template: string;
    readonly role: CreatureRole;
    readonly bones: readonly string[];
    /** Each bone's length. */
    readonly lengths: readonly number[];
    readonly side: "far" | "near" | null;
    readonly stands: boolean;
    readonly front: boolean;
    /** The picture it is painted into (`"far_hind"`). */
    readonly picture: string;
    /** The bone it hangs on. */
    readonly parent: string;
    /** Its anchor at the last bone's tip: `"hind_l_sole"` for a leg, `"arm_r_tip"`, `"tail_tip"`. */
    readonly tip_anchor: string;
}

/** A skeleton made from a template: rig bones and anchors, and what each chain is for. */
export interface CreatureSkeleton {
    readonly kind: CreatureKind;
    readonly skeleton: string;
    readonly template: CreatureTemplateData;
    /** The values used (given or picked), each within its range. */
    readonly params: Readonly<Record<string, number>>;
    /** Parents first, the root first: ready for `RigData.bones`. */
    readonly bones: readonly BoneData[];
    readonly chains: readonly CreatureChain[];
    /** The chains' tips (the soles of the legs at rest on the ground). */
    readonly anchors: Readonly<Record<string, AnchorData>>;
    readonly pictures: readonly string[];
    /** The creature's size (1 as drawn in the template). */
    readonly size: number;
}

const SIZE: CreatureParamData = { title: "Größe", min: 0.8, max: 1.25 };

/**
 * The four skeleton templates (Spielwerk 42, Bestiarium). Units are pixels of the composed
 * picture at size 1: a dog-like Vierbeiner is about 400 long and 260 high.
 */
export const CREATURE_TEMPLATES: Readonly<
    Record<CreatureKind, CreatureTemplateData>
> = {
    quadruped: {
        kind: "quadruped",
        skeleton: "creature-quadruped",
        title: "Vierbeiner",
        params: {
            size: SIZE,
            legs: { title: "Beine", min: 0.75, max: 1.3 },
            tail: { title: "Schwanz", min: 2, max: 6, whole: true },
        },
        chains: [
            {
                name: "spine",
                role: "spine",
                bone: "spine_{i}",
                count: [3, 5],
                length: [150, 210],
                angle: [-3, 3],
                turns: [[-2, 2]],
                picture: "body",
                part: "torso",
            },
            {
                name: "tail",
                role: "tail",
                bone: "tail_{i}",
                parent: "spine",
                at: "start",
                offset: [
                    [-6, 0],
                    [-10, -4],
                ],
                count_param: "tail",
                length: [24, 36],
                per_bone: true,
                angle: [175, 215],
                turns: [[-14, 14]],
                picture: "body",
                parts: ["tail"],
                tip_part: "tail_tip",
            },
            {
                name: "neck",
                role: "neck",
                bone: "neck_{i}",
                parent: "spine",
                offset: [
                    [-12, -4],
                    [-14, -6],
                ],
                count: [1, 2],
                length: [45, 75],
                angle: [-60, -35],
                turns: [[2, 8]],
                picture: "body",
                parts: ["neck"],
            },
            {
                name: "head",
                role: "head",
                bones: ["head"],
                parent: "neck",
                length: [72, 96],
                angle: [4, 24],
                picture: "body",
                part: "head",
            },
            {
                name: "hind",
                role: "leg",
                bones: ["thigh_h{s}", "shin_h{s}", "paw_h{s}"],
                parent: "spine",
                at: "start",
                offset: [
                    [8, 18],
                    [2, 8],
                ],
                length: [120, 160],
                length_param: "legs",
                angle: [64, 78],
                turns: [
                    [32, 46],
                    [-42, -30],
                ],
                shares: [0.4, 0.36, 0.24],
                sides: true,
                stands: true,
                picture: "hind",
                parts: ["leg_upper", "leg_lower", "foot"],
            },
            {
                name: "front",
                role: "leg",
                bones: ["thigh_f{s}", "shin_f{s}", "paw_f{s}"],
                parent: "spine",
                offset: [
                    [-18, -8],
                    [2, 8],
                ],
                length: [110, 150],
                length_param: "legs",
                angle: [90, 100],
                turns: [
                    [-10, -2],
                    [-36, -24],
                ],
                shares: [0.43, 0.39, 0.18],
                sides: true,
                stands: true,
                front: true,
                picture: "front",
                parts: ["leg_upper", "leg_lower", "foot"],
            },
        ],
        pictures: [
            "far_hind",
            "far_front",
            "jaw",
            "body",
            "near_hind",
            "near_front",
        ],
    },
    biped: {
        kind: "biped",
        skeleton: "creature-biped",
        title: "Zweibeiner",
        params: {
            size: SIZE,
            legs: { title: "Beine", min: 0.8, max: 1.25 },
            arms: { title: "Arme", min: 0.75, max: 1.3 },
            tail: { title: "Schwanz", min: 0, max: 5, whole: true },
        },
        chains: [
            {
                name: "spine",
                role: "spine",
                bone: "spine_{i}",
                count: [1, 2],
                length: [95, 130],
                angle: [-96, -86],
                turns: [[-3, 3]],
                picture: "body",
                part: "torso",
            },
            {
                name: "tail",
                role: "tail",
                bone: "tail_{i}",
                parent: "spine",
                at: "start",
                offset: [
                    [0, 6],
                    [6, 12],
                ],
                count_param: "tail",
                length: [24, 34],
                per_bone: true,
                angle: [150, 172],
                turns: [[-6, 12]],
                picture: "body",
                parts: ["tail"],
                tip_part: "tail_tip",
            },
            {
                name: "neck",
                role: "neck",
                bone: "neck_{i}",
                parent: "spine",
                count: [1, 1],
                length: [18, 32],
                angle: [-80, -62],
                picture: "body",
                parts: ["neck"],
            },
            {
                name: "head",
                role: "head",
                bones: ["head"],
                parent: "neck",
                length: [66, 90],
                angle: [-6, 14],
                picture: "body",
                part: "head",
            },
            {
                name: "leg",
                role: "leg",
                bones: ["thigh_{s}", "shin_{s}", "foot_{s}"],
                parent: "spine",
                at: "start",
                offset: [
                    [0, 6],
                    [-4, 4],
                ],
                length: [130, 168],
                length_param: "legs",
                angle: [86, 94],
                turns: [
                    [4, 10],
                    [-72, -58],
                ],
                shares: [0.44, 0.4, 0.16],
                sides: true,
                stands: true,
                picture: "leg",
                parts: ["leg_upper", "leg_lower", "foot"],
            },
            {
                name: "arm",
                role: "arm",
                bones: ["upper_arm_{s}", "forearm_{s}", "hand_{s}"],
                parent: "spine",
                offset: [
                    [-16, -8],
                    [-4, 4],
                ],
                length: [96, 132],
                length_param: "arms",
                angle: [96, 110],
                turns: [
                    [-34, -18],
                    [-4, 8],
                ],
                shares: [0.42, 0.38, 0.2],
                sides: true,
                picture: "arm",
                parts: ["arm_upper", "arm_lower", "hand"],
            },
        ],
        pictures: ["far_arm", "far_leg", "jaw", "body", "near_leg", "near_arm"],
    },
    worm: {
        kind: "worm",
        skeleton: "creature-worm",
        title: "Wurm",
        params: {
            size: SIZE,
            segments: { title: "Glieder", min: 8, max: 20, whole: true },
        },
        chains: [
            {
                name: "body",
                role: "body",
                bone: "body_{i}",
                count_param: "segments",
                length: [20, 26],
                per_bone: true,
                angle: [0, 0],
                centred: true,
                picture: "body",
                parts: ["segment"],
                base_part: "tail_tip",
            },
            {
                name: "head",
                role: "head",
                bones: ["head"],
                parent: "body",
                offset: [
                    [-8, -4],
                    [0, 0],
                ],
                length: [56, 76],
                angle: [-6, 6],
                picture: "body",
                part: "head",
            },
        ],
        pictures: ["jaw", "body"],
        lift: [20, 26],
    },
    flyer: {
        kind: "flyer",
        skeleton: "creature-flyer",
        title: "Flieger",
        params: {
            size: { title: "Größe", min: 0.8, max: 1.2 },
            wings: { title: "Flügel", min: 0.8, max: 1.3 },
            legs: { title: "Beine", min: 0.75, max: 1.25 },
            tail: { title: "Schwanz", min: 1, max: 3, whole: true },
        },
        chains: [
            {
                name: "spine",
                role: "spine",
                bone: "spine_{i}",
                count: [1, 2],
                length: [84, 120],
                angle: [-14, -4],
                turns: [[-3, 3]],
                picture: "body",
                part: "torso",
            },
            {
                name: "tail",
                role: "tail",
                bone: "tail_{i}",
                parent: "spine",
                at: "start",
                offset: [
                    [-4, 2],
                    [-4, 2],
                ],
                count_param: "tail",
                length: [22, 32],
                per_bone: true,
                angle: [168, 192],
                turns: [[-10, 10]],
                picture: "body",
                parts: ["tail"],
                tip_part: "tail_tip",
            },
            {
                name: "neck",
                role: "neck",
                bone: "neck_{i}",
                parent: "spine",
                offset: [
                    [-8, -2],
                    [-6, -2],
                ],
                count: [1, 2],
                length: [30, 56],
                angle: [-58, -36],
                turns: [[4, 10]],
                picture: "body",
                parts: ["neck"],
            },
            {
                name: "head",
                role: "head",
                bones: ["head"],
                parent: "neck",
                length: [56, 80],
                angle: [0, 18],
                picture: "body",
                part: "head",
            },
            {
                name: "wing",
                role: "wing",
                bones: ["wing_a_{s}", "wing_b_{s}", "wing_c_{s}"],
                parent: "spine",
                offset: [
                    [-34, -18],
                    [-16, -8],
                ],
                length: [190, 250],
                length_param: "wings",
                angle: [-132, -114],
                turns: [[0, 0]],
                shares: [0.3, 0.34, 0.36],
                sides: true,
                picture: "wing",
                part: "wing",
            },
            {
                name: "leg",
                role: "leg",
                bones: ["thigh_{s}", "shin_{s}", "foot_{s}"],
                parent: "spine",
                at: "start",
                offset: [
                    [12, 22],
                    [4, 10],
                ],
                length: [70, 96],
                length_param: "legs",
                angle: [98, 110],
                turns: [
                    [-26, -14],
                    [30, 44],
                ],
                shares: [0.38, 0.4, 0.22],
                sides: true,
                picture: "leg",
                parts: ["leg_upper", "leg_lower", "foot"],
            },
        ],
        pictures: [
            "far_wing",
            "far_leg",
            "jaw",
            "body",
            "near_leg",
            "near_wing",
        ],
        hover: [26, 44],
    },
};

/** The template of a kind; throws for one there is none of. */
export function creature_template(kind: string): CreatureTemplateData {
    const template = (
        CREATURE_TEMPLATES as Readonly<Record<string, CreatureTemplateData>>
    )[kind];
    if (template === undefined) {
        throw new Error(
            `no creature kind "${kind}"; there are ${CREATURE_KINDS.join(", ")}`,
        );
    }
    return template;
}

/**
 * A whole number from a seed and a name: the same pair always gives the same number, so every
 * chain, value and part of a creature draws from a stream of its own and changing one (a longer
 * tail) leaves the others as they were.
 */
export function seed_for(seed: number, name: string): number {
    let hash = (Math.floor(Math.abs(seed)) >>> 0) ^ 0x9e3779b9;
    for (let index = 0; index < name.length; index++) {
        hash = Math.imul(hash ^ name.charCodeAt(index), 0x01000193) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
    return hash >>> 0;
}

/**
 * The template's values: those given (kept in range, whole where they must be) and the others
 * picked from `seed`, each from its own stream.
 */
export function creature_params(
    template: CreatureTemplateData,
    seed: number,
    given: Readonly<Record<string, number>> = {},
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, param] of Object.entries(template.params)) {
        const wanted = given[name];
        let value: number;
        if (typeof wanted === "number" && Number.isFinite(wanted)) {
            value = wanted;
        } else {
            const random = new SeededRandom(seed_for(seed, `param:${name}`));
            value = param.whole
                ? random.int(param.min, param.max)
                : param.min + random.next() * (param.max - param.min);
        }
        value = Math.min(param.max, Math.max(param.min, value));
        out[name] = param.whole ? Math.round(value) : value;
    }
    return out;
}

interface WorldBone {
    readonly name: string;
    readonly parent: string;
    x: number;
    y: number;
    angle: number;
    length: number;
}

interface Laid {
    readonly chain: TemplateChainData;
    readonly side: "l" | "r" | null;
    readonly names: string[];
    lengths: number[];
    readonly angles: number[];
    readonly offset: readonly [number, number];
}

/**
 * Makes a skeleton from a template: lengths, counts and angles picked in their ranges from `seed`
 * (each chain from a stream of its own), the values (`params`) given or picked. The legs that
 * stand reach the ground at rest: the spine tilts so front and hind legs both stand (within the
 * template's `tilt`), and legs still too short or too long are scaled to fit. A creature that
 * hovers hangs `hover` over the ground; one that lies (a worm) has its bones `lift` high.
 */
export function make_skeleton_from_template(
    template: CreatureTemplateData,
    random: SeededRandom | number,
    params: Readonly<Record<string, number>> = {},
): CreatureSkeleton {
    const seed =
        typeof random === "number"
            ? random
            : Math.floor(random.next() * 4294967296);
    const values = creature_params(template, seed, params);
    const size = values.size ?? 1;
    const laid: Laid[] = [];
    const chain_names = new Set<string>();
    for (const chain of template.chains) {
        if (chain_names.has(chain.name)) {
            throw new Error(
                `template ${template.kind}: chain "${chain.name}" twice`,
            );
        }
        if (chain.parent !== undefined && !chain_names.has(chain.parent)) {
            throw new Error(
                `template ${template.kind}: chain "${chain.name}" hangs on "${chain.parent}", which must come before it`,
            );
        }
        chain_names.add(chain.name);
        const draw = new SeededRandom(seed_for(seed, `chain:${chain.name}`));
        const pick = (range: CreatureRange) =>
            range[0] + draw.next() * (range[1] - range[0]);
        let count: number;
        if (chain.count_param !== undefined) {
            count = Math.round(values[chain.count_param] ?? 0);
        } else if (chain.bones !== undefined) {
            count = chain.bones.length;
        } else {
            const range = chain.count ?? [1, 1];
            count = draw.int(range[0], range[1]);
        }
        const length_factor =
            size *
            (chain.length_param === undefined
                ? 1
                : (values[chain.length_param] ?? 1));
        const length = pick(chain.length) * length_factor;
        const shares =
            chain.shares !== undefined && chain.shares.length >= count
                ? chain.shares.slice(0, count)
                : new Array<number>(count).fill(1);
        const share_sum = shares.reduce((sum, share) => sum + share, 0);
        const lengths = shares.map((share) =>
            chain.per_bone ? length : (length * share) / share_sum,
        );
        // Each bone of a per-bone chain a little different, tapering towards its end.
        if (chain.per_bone) {
            for (let index = 0; index < count; index++) {
                lengths[index] =
                    pick(chain.length) * length_factor * (1 - 0.04 * index);
            }
        }
        const angles: number[] = [];
        let angle = pick(chain.angle);
        for (let index = 0; index < count; index++) {
            if (index > 0) {
                const turns = chain.turns ?? [[0, 0]];
                angle += pick(turns[Math.min(index - 1, turns.length - 1)]);
            }
            angles.push(angle);
        }
        const offset: [number, number] = [
            chain.offset === undefined ? 0 : pick(chain.offset[0]) * size,
            chain.offset === undefined ? 0 : pick(chain.offset[1]) * size,
        ];
        const sides: ("l" | "r" | null)[] = chain.sides ? ["l", "r"] : [null];
        for (const side of sides) {
            const names: string[] = [];
            for (let index = 0; index < count; index++) {
                const pattern =
                    chain.bones !== undefined
                        ? chain.bones[index]
                        : (chain.bone ?? `${chain.name}_{i}`);
                names.push(
                    pattern
                        .replace("{i}", String(index + 1))
                        .replace("{s}", side ?? ""),
                );
            }
            laid.push({
                chain,
                side,
                names,
                lengths: [...lengths],
                angles: [...angles],
                offset,
            });
        }
    }
    const root_chain = laid[0];
    let tilt = 0;
    const lay = () => lay_out(laid, tilt);
    let world = lay();
    const standing = laid.filter(
        (item) => item.chain.stands === true && item.names.length > 0,
    );
    const tip_of = (item: Laid, bones: Map<string, WorldBone>) => {
        const last = bones.get(item.names[item.names.length - 1])!;
        return {
            x: last.x + Math.cos(last.angle * RAD) * last.length,
            y: last.y + Math.sin(last.angle * RAD) * last.length,
        };
    };
    const root_length = root_chain.lengths.reduce((sum, bone) => sum + bone, 0);
    if (standing.length > 0) {
        const back = standing.filter((item) => item.chain.at === "start");
        const front = standing.filter((item) => item.chain.at !== "start");
        if (back.length > 0 && front.length > 0 && root_length > 0) {
            // Tilt the spine so both pairs reach the same ground: twice, the second fixing the first.
            const limit = (template.tilt ?? 16) * RAD;
            for (let round = 0; round < 2; round++) {
                const lowest = (items: Laid[]) =>
                    Math.max(...items.map((item) => tip_of(item, world).y));
                const difference = lowest(back) - lowest(front);
                const now = Math.sin(tilt * RAD);
                const wanted = Math.min(
                    Math.sin(limit),
                    Math.max(-Math.sin(limit), now + difference / root_length),
                );
                tilt = Math.asin(wanted) / RAD;
                world = lay();
            }
        }
        // Every standing leg reaches the ground of the lowest one: scaled to fit what the tilt left.
        const ground = Math.max(
            ...standing.map((item) => tip_of(item, world).y),
        );
        for (const item of standing) {
            const start = world.get(item.names[0])!;
            const reach = tip_of(item, world).y - start.y;
            if (reach > 0) {
                const scale = (ground - start.y) / reach;
                item.lengths = item.lengths.map((bone) => bone * scale);
            }
        }
        world = lay();
        shift(world, -ground);
    } else if (template.hover !== undefined) {
        const draw = new SeededRandom(seed_for(seed, "hover"));
        const hover =
            (template.hover[0] +
                draw.next() * (template.hover[1] - template.hover[0])) *
            size;
        let lowest = 0;
        for (const item of laid) {
            lowest = Math.max(lowest, tip_of(item, world).y);
            for (const name of item.names) {
                lowest = Math.max(lowest, world.get(name)!.y);
            }
        }
        shift(world, -lowest - hover);
    } else {
        const range = template.lift ?? [0, 0];
        const draw = new SeededRandom(seed_for(seed, "lift"));
        shift(world, -(range[0] + draw.next() * (range[1] - range[0])) * size);
    }
    const bones: BoneData[] = [{ name: "root", length: 20 * size }];
    for (const bone of world.values()) {
        const parent =
            bone.parent === "root"
                ? { x: 0, y: 0, angle: 0 }
                : world.get(bone.parent)!;
        const dx = bone.x - parent.x;
        const dy = bone.y - parent.y;
        const cos = Math.cos(-parent.angle * RAD);
        const sin = Math.sin(-parent.angle * RAD);
        bones.push({
            name: bone.name,
            parent: bone.parent,
            x: dx * cos - dy * sin,
            y: dx * sin + dy * cos,
            rotation: bone.angle - parent.angle,
            length: bone.length,
        });
    }
    const chains: CreatureChain[] = [];
    const anchors: Record<string, AnchorData> = {};
    for (const item of laid) {
        if (item.names.length === 0) {
            continue;
        }
        const name =
            item.side === null
                ? item.chain.name
                : `${item.chain.name}_${item.side}`;
        const is_foot = item.chain.role === "leg";
        const tip_anchor = `${name}_${is_foot ? "sole" : "tip"}`;
        const last = item.names[item.names.length - 1];
        anchors[tip_anchor] = {
            bone: last,
            x: item.lengths[item.lengths.length - 1],
            y: 0,
        };
        chains.push({
            name,
            template: item.chain.name,
            role: item.chain.role,
            bones: item.names,
            lengths: item.lengths,
            side:
                item.side === null ? null : item.side === "l" ? "far" : "near",
            stands: item.chain.stands === true,
            front: item.chain.front === true,
            picture:
                item.side === null
                    ? item.chain.picture
                    : `${item.side === "l" ? "far" : "near"}_${item.chain.picture}`,
            parent: world.get(item.names[0])!.parent,
            tip_anchor,
        });
    }
    return {
        kind: template.kind,
        skeleton: template.skeleton,
        template,
        params: values,
        bones,
        chains,
        anchors,
        pictures: template.pictures,
        size,
    };
}

const RAD = Math.PI / 180;

/** Lays the chains out at rest in the world: joints and angles, the root chain tilted by `tilt`. */
function lay_out(laid: readonly Laid[], tilt: number): Map<string, WorldBone> {
    const world = new Map<string, WorldBone>();
    const firsts = new Map<string, string>();
    const lasts = new Map<string, string>();
    for (const [order, item] of laid.entries()) {
        if (item.names.length === 0) {
            continue;
        }
        const chain = item.chain;
        let parent = "root";
        let start_x = 0;
        let start_y = 0;
        let frame = 0;
        if (chain.parent !== undefined) {
            const at_start = chain.at === "start";
            const bone_name = at_start
                ? firsts.get(chain.parent)
                : lasts.get(chain.parent);
            if (bone_name === undefined) {
                throw new Error(
                    `chain "${chain.name}": its parent "${chain.parent}" has no bones`,
                );
            }
            const bone = world.get(bone_name)!;
            parent = bone_name;
            frame = bone.angle;
            start_x = bone.x;
            start_y = bone.y;
            if (!at_start) {
                start_x += Math.cos(bone.angle * RAD) * bone.length;
                start_y += Math.sin(bone.angle * RAD) * bone.length;
            }
        }
        let along = item.offset[0];
        if (chain.centred) {
            along -= item.lengths.reduce((sum, bone) => sum + bone, 0) / 2;
        }
        const across = item.offset[1];
        start_x +=
            Math.cos(frame * RAD) * along - Math.sin(frame * RAD) * across;
        start_y +=
            Math.sin(frame * RAD) * along + Math.cos(frame * RAD) * across;
        const turn = order === 0 ? tilt : 0;
        let x = start_x;
        let y = start_y;
        for (const [index, name] of item.names.entries()) {
            const angle = item.angles[index] + turn;
            world.set(name, {
                name,
                parent: index === 0 ? parent : item.names[index - 1],
                x,
                y,
                angle,
                length: item.lengths[index],
            });
            x += Math.cos(angle * RAD) * item.lengths[index];
            y += Math.sin(angle * RAD) * item.lengths[index];
        }
        if (!firsts.has(chain.name)) {
            firsts.set(chain.name, item.names[0]);
            lasts.set(chain.name, item.names[item.names.length - 1]);
        }
    }
    return world;
}

function shift(world: Map<string, WorldBone>, dy: number): void {
    for (const bone of world.values()) {
        bone.y += dy;
    }
}
