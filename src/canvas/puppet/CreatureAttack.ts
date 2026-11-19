import { ClipKeys, chains_of, moments, root_chain } from "./CreatureGait";
import type { CreatureChain, CreatureSkeleton } from "./CreatureTemplate";
import { PuppetClipData } from "./RigData";

/** The attacks a creature may have (since step 42). */
export type CreatureAttackName = "bite" | "fire" | "claw";

export const CREATURE_ATTACKS: readonly CreatureAttackName[] = [
    "bite",
    "fire",
    "claw",
];

/**
 * Where an attack hits, at a moment named `hit`: a circle round an anchor (a bite at the mouth, a
 * claw at the paw), or a cone from it along the anchor's angle (fire).
 */
export interface CreatureHitArea {
    readonly anchor: string;
    readonly shape: "circle" | "cone";
    /** The circle's radius, or the cone's length, in rig units. */
    readonly radius: number;
    /** The cone's half angle in degrees. */
    readonly spread?: number;
}

/** An attack as plain data: its clip (with `hit` moments), where it hits, and a stream's seconds. */
export interface CreatureAttackData {
    readonly name: string;
    readonly clip: PuppetClipData;
    readonly area: CreatureHitArea;
    /** Seconds of the clip something pours from the anchor (fire), between its `start` and `end` moments. */
    readonly stream?: readonly [number, number];
}

/** The bones that strike with the head: the neck and the head, or a worm's front segments and its head. */
function striking_bones(body: CreatureSkeleton): string[] {
    const necks = chains_of(body, "neck").flatMap((chain) => chain.bones);
    const heads = chains_of(body, "head").flatMap((chain) => chain.bones);
    if (necks.length > 0) {
        return [...necks, ...heads];
    }
    const spine = root_chain(body);
    return [...spine.bones.slice(-3), ...heads];
}

interface AttackKey {
    readonly t: number;
    /** Degrees for each striking bone (spread over them). */
    readonly strike?: number;
    readonly jaw?: number;
    /** Degrees on the root chain's first bone (rearing up is negative). */
    readonly rear?: number;
    /** Along the root chain's first bone: a lunge's push. */
    readonly push?: number;
    /** Degrees for each bone of the limb. */
    readonly limb?: readonly number[];
}

function attack_clip(
    body: CreatureSkeleton,
    length: number,
    plan: readonly AttackKey[],
    events: Record<string, string>,
    limb: CreatureChain | null,
    jaw: string | null,
): PuppetClipData {
    const keys = new ClipKeys(body);
    const legs = keys.legs();
    const strike = striking_bones(body);
    const spine = root_chain(body);
    for (const step of plan) {
        const skeleton = keys.begin();
        const first = keys.index(spine.bones[0]);
        skeleton.rotation[first] += step.rear ?? 0;
        const angle =
            ((skeleton.rest_rotation[first] + skeleton.rotation[first]) *
                Math.PI) /
            180;
        skeleton.x[first] += Math.cos(angle) * (step.push ?? 0) * body.size;
        skeleton.y[first] += Math.sin(angle) * (step.push ?? 0) * body.size;
        keys.turn(
            strike,
            () => (step.strike ?? 0) / Math.max(1, strike.length - 1),
        );
        if (jaw !== null) {
            skeleton.rotation[keys.index(jaw)] += step.jaw ?? 0;
        }
        if (limb !== null && step.limb !== undefined) {
            keys.turn(limb.bones, (index) => step.limb![index] ?? 0);
        }
        skeleton.update();
        keys.plant(legs, limb?.name ?? null);
        keys.keep(step.t);
    }
    return keys.clip(length, { events });
}

/** The head's length (for the size of a bite or a flame). */
function head_length(body: CreatureSkeleton): number {
    const head = chains_of(body, "head")[0];
    return head === undefined ? 40 * body.size : head.lengths[0];
}

/**
 * A bite: the head draws back with the jaw open, lunges and snaps it shut; one `hit` moment at the
 * snap, the area a circle round the `mouth` anchor. Null for a creature without a jaw.
 */
export function make_bite(
    body: CreatureSkeleton,
    jaw: string | null,
    mouth = "mouth",
): CreatureAttackData | null {
    if (jaw === null || !body.bones.some((bone) => bone.name === jaw)) {
        return null;
    }
    const clip = attack_clip(
        body,
        0.7,
        [
            { t: 0 },
            { t: 0.22, strike: -22, jaw: 30, rear: -3, push: -4 },
            { t: 0.36, strike: 26, jaw: 38, rear: 2, push: 10 },
            { t: 0.42, strike: 30, jaw: 0, rear: 2, push: 12 },
            { t: 0.7 },
        ],
        moments([[0.42, "hit"]]),
        null,
        jaw,
    );
    return {
        name: "bite",
        clip,
        area: {
            anchor: mouth,
            shape: "circle",
            radius: head_length(body) * 0.6,
        },
    };
}

/**
 * Fire: the creature rears back, opens its mouth and breathes for about a second: `start` and
 * `end` moments for the stream (particles from the `mouth` anchor along its angle), `hit` moments
 * every quarter second, the area a cone from the mouth.
 */
export function make_fire(
    body: CreatureSkeleton,
    jaw: string | null,
    mouth = "mouth",
): CreatureAttackData {
    const clip = attack_clip(
        body,
        1.9,
        [
            { t: 0 },
            { t: 0.35, strike: -26, jaw: 12, rear: -6, push: -6 },
            { t: 0.5, strike: 6, jaw: 34, rear: -2, push: 2 },
            { t: 0.95, strike: 10, jaw: 40, rear: -1, push: 4 },
            { t: 1.45, strike: 4, jaw: 34, rear: -2, push: 2 },
            { t: 1.6, strike: 0, jaw: 8 },
            { t: 1.9 },
        ],
        moments([
            [0.5, "start"],
            [0.62, "hit"],
            [0.86, "hit"],
            [1.1, "hit"],
            [1.34, "hit"],
            [1.45, "end"],
        ]),
        null,
        jaw,
    );
    return {
        name: "fire",
        clip,
        area: {
            anchor: mouth,
            shape: "cone",
            radius: head_length(body) * 2.8,
            spread: 18,
        },
        stream: [0.5, 1.45],
    };
}

/** The limb a creature claws with: a near arm, a near front leg, or a flyer's near leg. */
export function claw_limb(body: CreatureSkeleton): CreatureChain | null {
    const near = (chains: CreatureChain[]) =>
        chains.find((chain) => chain.side === "near") ?? chains[0] ?? null;
    const arms = chains_of(body, "arm");
    if (arms.length > 0) {
        return near(arms);
    }
    const legs = chains_of(body, "leg");
    const front = legs.filter((chain) => chain.front);
    if (front.length > 0) {
        return near(front);
    }
    return legs.length > 0 ? near(legs) : null;
}

/**
 * A claw: a front limb draws back and swipes down and forward (a flyer dives with its talons);
 * one `hit` moment at the end of the swipe, the area a circle round the limb's tip anchor. Null
 * for a creature without such a limb.
 */
export function make_claw(body: CreatureSkeleton): CreatureAttackData | null {
    const limb = claw_limb(body);
    if (limb === null) {
        return null;
    }
    const is_arm = limb.role === "arm";
    const is_flyer = chains_of(body, "wing").length > 0;
    let plan: AttackKey[];
    if (is_arm) {
        plan = [
            { t: 0 },
            { t: 0.3, limb: [-150, -30, -10], rear: -4 },
            { t: 0.44, limb: [-10, 18, 12], rear: 6, push: 6 },
            { t: 0.8 },
        ];
    } else if (is_flyer) {
        plan = [
            { t: 0 },
            { t: 0.3, limb: [-40, 22, 12], rear: -10, push: -6 },
            { t: 0.5, limb: [-100, 6, -34], rear: 18, push: 10 },
            { t: 0.85 },
        ];
    } else {
        plan = [
            { t: 0 },
            { t: 0.3, limb: [-82, -52, -34], rear: -5, push: -4 },
            { t: 0.44, limb: [6, 22, 14], rear: 3, push: 8 },
            { t: 0.8 },
        ];
    }
    const hit_at = plan[2].t;
    const clip = attack_clip(
        body,
        plan[plan.length - 1].t,
        plan,
        moments([[hit_at, "hit"]]),
        limb,
        null,
    );
    const reach = limb.lengths.reduce((sum, bone) => sum + bone, 0);
    return {
        name: "claw",
        clip,
        area: {
            anchor: limb.tip_anchor,
            shape: "circle",
            radius: reach * 0.35,
        },
    };
}
