import type { CreatureChain, CreatureSkeleton } from "./CreatureTemplate";
import { bend_of, two_bone_ik } from "./PuppetIk";
import { PuppetClipData, PuppetKeyData } from "./RigData";
import { Skeleton } from "./Skeleton";

const TAU = Math.PI * 2;

/** A standing leg as the gaits move it: its bones by number and where its sole is at rest. */
export interface GaitLeg {
    readonly chain: CreatureChain;
    readonly upper: number;
    readonly lower: number;
    /** The foot (the sole's bone); the lower bone itself on a two-bone leg. */
    readonly foot: number;
    /** The sole in the foot's frame. */
    readonly sole_x: number;
    readonly sole_y: number;
    /** Where the sole is at rest, and the foot's angle there. */
    readonly rest_x: number;
    readonly rest_y: number;
    readonly rest_angle: number;
    readonly bend: number;
    /** From the hip to the sole along the bones. */
    readonly length: number;
}

/**
 * Builds a clip key by key: each key the skeleton starts at rest, the gait poses it (`pose`), and
 * every bone's rotation, shift and stretch is written down. Bones that never move get no track.
 */
export class ClipKeys {
    public readonly skeleton: Skeleton;
    private readonly times: number[] = [];
    private readonly poses: Float64Array[] = [];

    public constructor(public readonly body: CreatureSkeleton) {
        this.skeleton = Skeleton.from_data(body.bones);
        this.skeleton.update();
    }

    public index(name: string): number {
        const index = this.skeleton.index_of(name);
        if (index < 0) {
            throw new Error(`creature clip: no bone "${name}"`);
        }
        return index;
    }

    /** Forgets the keys written so far (to pose a clip again). */
    public clear(): void {
        this.times.length = 0;
        this.poses.length = 0;
    }

    /** Starts a key at rest. */
    public begin(): Skeleton {
        this.skeleton.reset_pose();
        this.skeleton.update();
        return this.skeleton;
    }

    /** Writes down the pose now as the key at `t`. */
    public keep(t: number): void {
        const skeleton = this.skeleton;
        const count = skeleton.count;
        const pose = new Float64Array(count * 5);
        for (let index = 0; index < count; index++) {
            pose[index * 5] = skeleton.rotation[index];
            pose[index * 5 + 1] = skeleton.x[index];
            pose[index * 5 + 2] = skeleton.y[index];
            pose[index * 5 + 3] = skeleton.stretch_x[index];
            pose[index * 5 + 4] = skeleton.stretch_y[index];
        }
        this.times.push(t);
        this.poses.push(pose);
    }

    /** The keys as clip data. */
    public clip(
        length: number,
        extra: Partial<Omit<PuppetClipData, "tracks" | "length">> = {},
    ): PuppetClipData {
        const skeleton = this.skeleton;
        const tracks: Record<string, PuppetKeyData[]> = {};
        for (let index = 0; index < skeleton.count; index++) {
            const moves = [false, false, false, false];
            for (const pose of this.poses) {
                moves[0] ||= Math.abs(pose[index * 5]) > 1e-6;
                moves[1] ||=
                    Math.abs(pose[index * 5 + 1]) > 1e-6 ||
                    Math.abs(pose[index * 5 + 2]) > 1e-6;
                moves[2] ||=
                    Math.abs(pose[index * 5 + 3] - 1) > 1e-6 ||
                    Math.abs(pose[index * 5 + 4] - 1) > 1e-6;
            }
            if (!moves[0] && !moves[1] && !moves[2]) {
                continue;
            }
            const keys: PuppetKeyData[] = [];
            let last_rotation = 0;
            for (const [at, pose] of this.poses.entries()) {
                const key: {
                    t: number;
                    rotation?: number;
                    x?: number;
                    y?: number;
                    scale_x?: number;
                    scale_y?: number;
                } = { t: this.times[at] };
                if (moves[0]) {
                    // The short way from the key before, so a turn never spins round.
                    let rotation = pose[index * 5];
                    if (at > 0) {
                        rotation =
                            last_rotation +
                            ((((rotation - last_rotation + 180) % 360) + 360) %
                                360) -
                            180;
                    }
                    last_rotation = rotation;
                    key.rotation = rotation;
                }
                if (moves[1]) {
                    key.x = pose[index * 5 + 1];
                    key.y = pose[index * 5 + 2];
                }
                if (moves[2]) {
                    key.scale_x = pose[index * 5 + 3];
                    key.scale_y = pose[index * 5 + 4];
                }
                keys.push(key);
            }
            tracks[skeleton.names[index]] = keys;
        }
        return { ...extra, length, tracks };
    }

    /** The standing legs (or all legs with `all`), measured at rest. */
    public legs(all = false): GaitLeg[] {
        const skeleton = this.begin();
        return this.body.chains
            .filter(
                (chain) =>
                    (chain.role === "leg" || (all && chain.role === "arm")) &&
                    (all || chain.stands) &&
                    chain.bones.length >= 2,
            )
            .map((chain) => {
                const upper = this.index(chain.bones[0]);
                const lower = this.index(chain.bones[1]);
                const foot = this.index(
                    chain.bones[Math.min(2, chain.bones.length - 1)],
                );
                const anchor = this.body.anchors[chain.tip_anchor];
                const sole_x = anchor?.x ?? skeleton.lengths[foot];
                const sole_y = anchor?.y ?? 0;
                const rest = skeleton.world_point(foot, sole_x, sole_y);
                const end_x = foot === lower ? sole_x : skeleton.rest_x[foot];
                const end_y = foot === lower ? sole_y : skeleton.rest_y[foot];
                return {
                    chain,
                    upper,
                    lower,
                    foot,
                    sole_x,
                    sole_y,
                    rest_x: rest.x,
                    rest_y: rest.y,
                    rest_angle: skeleton.world_rotation(foot),
                    bend: bend_of(skeleton, upper, lower, end_x, end_y),
                    length: chain.lengths.reduce((sum, bone) => sum + bone, 0),
                };
            });
    }

    /**
     * Puts a leg's sole at `x`, `y` (the puppet's space) with the foot at `angle` (its world angle
     * in degrees): two-bone IK for the upper and lower bone, the foot turned to the angle. False
     * when it can't reach.
     */
    public place_foot(
        leg: GaitLeg,
        x: number,
        y: number,
        angle: number,
    ): boolean {
        const skeleton = this.skeleton;
        let target_x = x;
        let target_y = y;
        let end_x = leg.sole_x;
        let end_y = leg.sole_y;
        if (leg.foot !== leg.lower) {
            const radians = (angle * Math.PI) / 180;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const along = leg.sole_x * skeleton.length_scale(leg.foot);
            const across = leg.sole_y * skeleton.width_scale(leg.foot);
            target_x = x - (cos * along - sin * across);
            target_y = y - (sin * along + cos * across);
            end_x = skeleton.rest_x[leg.foot] + skeleton.x[leg.foot];
            end_y = skeleton.rest_y[leg.foot] + skeleton.y[leg.foot];
        }
        const reached = two_bone_ik(
            skeleton,
            leg.upper,
            leg.lower,
            end_x,
            end_y,
            target_x,
            target_y,
            leg.bend,
        );
        if (leg.foot !== leg.lower) {
            skeleton.rotation[leg.foot] =
                angle -
                skeleton.world_rotation(leg.lower) -
                skeleton.rest_rotation[leg.foot];
            skeleton.update();
        }
        return reached;
    }

    /** Every standing leg's sole where it is at rest (attacks and idle keep their feet). */
    public plant(
        legs: readonly GaitLeg[],
        except: string | null = null,
    ): boolean {
        let reached = true;
        for (const leg of legs) {
            if (leg.chain.name === except) {
                continue;
            }
            reached =
                this.place_foot(leg, leg.rest_x, leg.rest_y, leg.rest_angle) &&
                reached;
        }
        return reached;
    }

    /** Turns each bone of a chain by `degrees(i)` (i its place, 0 first). */
    public turn(
        bones: readonly string[],
        degrees: (index: number) => number,
    ): void {
        for (const [at, bone] of bones.entries()) {
            this.skeleton.rotation[this.index(bone)] += degrees(at);
        }
    }
}

/** Moments as a clip's `events` takes them: `[[0.42, "hit"]]` is `{ "0.42": "hit" }`. */
export function moments(
    list: readonly (readonly [number, string])[],
): Record<string, string> {
    return Object.fromEntries(list.map(([time, name]) => [String(time), name]));
}

/** Chains of one role. */
export function chains_of(
    body: CreatureSkeleton,
    role: string,
): CreatureChain[] {
    return body.chains.filter((chain) => chain.role === role);
}

/** The chain hanging on the root (the spine, or a worm's body). */
export function root_chain(body: CreatureSkeleton): CreatureChain {
    const chain = body.chains.find((item) => item.parent === "root");
    if (chain === undefined) {
        throw new Error("creature: no chain on the root");
    }
    return chain;
}

/** How a walk or run is made; everything has a default from the body's measurements. */
export interface WalkOptions {
    /** A run: faster, longer steps, the feet longer in the air, the back flexing. */
    readonly run?: boolean;
    /** Seconds for one cycle of every leg. */
    readonly period?: number;
    /** How far a foot travels on the ground in one step. */
    readonly stride?: number;
    /** The share of a cycle a foot is on the ground. */
    readonly duty?: number;
    /** Each standing leg's phase by chain name (0..1). */
    readonly phases?: Readonly<Record<string, number>>;
    /** Keys per cycle. */
    readonly keys?: number;
}

/** The mean length of the standing legs. */
function leg_length(legs: readonly GaitLeg[]): number {
    return (
        legs.reduce((sum, leg) => sum + leg.length, 0) /
        Math.max(1, legs.length)
    );
}

/** Each leg's phase by its chain: a lateral walk or a gallop for four legs, alternating for two. */
function default_phases(
    legs: readonly GaitLeg[],
    run: boolean,
): Record<string, number> {
    const phases: Record<string, number> = {};
    const four = legs.length >= 4;
    for (const leg of legs) {
        const near = leg.chain.side === "near";
        if (!four) {
            phases[leg.chain.name] = near ? 0.5 : 0;
        } else if (run) {
            phases[leg.chain.name] =
                (leg.chain.front ? 0.5 : 0) + (near ? 0.12 : 0);
        } else {
            phases[leg.chain.name] =
                (leg.chain.front ? 0.25 : 0) + (near ? 0.5 : 0);
        }
    }
    return phases;
}

/**
 * A walk (or with `run`, a run) for the standing legs: each leg's sole stays on the ground for
 * `duty` of the cycle, sliding back at the clip's `travel` (so a creature moved that fast doesn't
 * skate), then swings forward in an arc; two-bone IK finds the hip and knee for every key. The
 * body bobs, the spine flexes on a run, the tail and the arms swing, the head stays level. Its
 * `step` moments come when a foot comes down.
 */
export function make_walk(
    body: CreatureSkeleton,
    options: WalkOptions = {},
): PuppetClipData {
    const keys = new ClipKeys(body);
    const legs = keys.legs();
    if (legs.length === 0) {
        throw new Error(`make_walk: the ${body.kind} has no standing legs`);
    }
    const run = options.run === true;
    const length = leg_length(legs);
    const period =
        options.period ?? (run ? 0.36 + length / 650 : 0.6 + length / 420);
    const duty = options.duty ?? (run ? 0.4 : legs.length >= 4 ? 0.64 : 0.6);
    const phases = { ...default_phases(legs, run), ...(options.phases ?? {}) };
    const count = options.keys ?? (run ? 32 : 24);
    const spine = root_chain(body);
    const necks = chains_of(body, "neck");
    const heads = chains_of(body, "head");
    const tails = chains_of(body, "tail");
    const arms = chains_of(body, "arm");
    const four = legs.length >= 4;
    let stride = options.stride ?? (run ? 0.95 : 0.55) * length;
    let bob = (run ? 0.06 : 0.025) * length;
    for (let attempt = 0; attempt < 10; attempt++) {
        if (pose_walk()) {
            break;
        }
        stride *= 0.85;
        bob *= 0.8;
    }
    const events: Record<string, string> = {};
    for (const leg of legs) {
        const phase = phases[leg.chain.name] ?? 0;
        const down = (((1 - phase) % 1) + 1) % 1;
        events[(down * period).toFixed(3)] = "step";
    }
    return keys.clip(period, {
        loop: true,
        travel: stride / (duty * period),
        events,
    });

    function pose_walk(): boolean {
        keys.clear();
        let reached = true;
        for (let key = 0; key <= count; key++) {
            const t = (key / count) * period;
            const cycle = t / period;
            const skeleton = keys.begin();
            const first = keys.index(spine.bones[0]);
            // Two bobs a cycle on a walk (each foot pushes once), one on a run.
            skeleton.y[first] += run
                ? -bob * Math.sin(TAU * cycle)
                : -bob * Math.cos(TAU * 2 * cycle);
            let lean = 0;
            if (run && four) {
                // The back flexes and stretches with the gallop.
                keys.turn(spine.bones, (index) => {
                    const turn =
                        5 *
                        Math.sin(TAU * cycle + index) *
                        (index % 2 === 0 ? 1 : -1);
                    lean += turn;
                    return turn;
                });
            }
            for (const neck of necks) {
                keys.turn(neck.bones, () => {
                    const turn = (run ? 4 : 2.5) * Math.cos(TAU * 2 * cycle);
                    lean += turn;
                    return turn;
                });
            }
            for (const head of heads) {
                keys.turn(head.bones, () => -lean * 0.8);
            }
            for (const tail of tails) {
                keys.turn(
                    tail.bones,
                    (index) =>
                        (run ? 10 : 6) * Math.sin(TAU * cycle - 0.7 * index),
                );
            }
            for (const arm of arms) {
                const side = arm.side === "near" ? 0 : 0.5;
                keys.turn(arm.bones, (index) =>
                    index === 0
                        ? (run ? 34 : 22) * Math.sin(TAU * (cycle + side))
                        : index === 1
                          ? -(run ? 30 : 12) -
                            8 * Math.sin(TAU * (cycle + side))
                          : 0,
                );
            }
            skeleton.update();
            for (const leg of legs) {
                const phase = phases[leg.chain.name] ?? 0;
                const u = (((cycle + phase) % 1) + 1) % 1;
                let x: number;
                let y: number;
                let angle = leg.rest_angle;
                if (u < duty) {
                    x = leg.rest_x + stride / 2 - (stride * u) / duty;
                    y = leg.rest_y;
                } else {
                    const v = (u - duty) / (1 - duty);
                    x =
                        leg.rest_x -
                        stride / 2 +
                        (stride * (1 - Math.cos(Math.PI * v))) / 2;
                    y =
                        leg.rest_y -
                        (run ? 0.22 : 0.16) *
                            leg.length *
                            Math.sin(Math.PI * v);
                    // A paw folds back under on the swing, a flat foot lifts its toe.
                    const tilt = leg.rest_angle > 50 ? 28 : -14;
                    angle += tilt * Math.sin(Math.PI * v);
                }
                reached = keys.place_foot(leg, x, y, angle) && reached;
            }
            keys.keep(t);
        }
        return reached;
    }
}

/** How a worm's wave is made. */
export interface WaveOptions {
    /** Faster, higher humps. */
    readonly fast?: boolean;
    readonly period?: number;
    /** Waves along the body at once. */
    readonly waves?: number;
    /** The humps' height as a share of the wavelength. */
    readonly amplitude?: number;
    readonly keys?: number;
}

/**
 * A worm's crawl: humps travel backwards along its body (from the head to the tail end), the
 * wavelength and the height from its length, the body lying on the ground between them; the head
 * stays nearly level. `travel` is how fast the body moves forward by it.
 */
export function make_wave(
    body: CreatureSkeleton,
    options: WaveOptions = {},
): PuppetClipData {
    const chain = chains_of(body, "body")[0] ?? root_chain(body);
    const keys = new ClipKeys(body);
    const fast = options.fast === true;
    const total = chain.lengths.reduce((sum, bone) => sum + bone, 0);
    const waves = options.waves ?? (fast ? 1.25 : 1.6);
    const wavelength = total / waves;
    const height = (options.amplitude ?? (fast ? 0.13 : 0.1)) * wavelength;
    const period = options.period ?? (fast ? 0.75 : 1.35);
    const count = options.keys ?? 24;
    const heads = chains_of(body, "head");
    const starts: number[] = [];
    let along = 0;
    for (const bone of chain.lengths) {
        starts.push(along);
        along += bone;
    }
    starts.push(along);
    const lift = (s: number, cycle: number) =>
        (height / 2) * (1 - Math.cos(TAU * (s / wavelength + cycle)));
    let contraction = 0;
    for (let key = 0; key <= count; key++) {
        const t = (key / count) * period;
        const cycle = t / period;
        const skeleton = keys.begin();
        let before = 0;
        let chord = 0;
        for (const [index, name] of chain.bones.entries()) {
            const rise =
                lift(starts[index + 1], cycle) - lift(starts[index], cycle);
            const angle =
                (Math.atan2(-rise, chain.lengths[index]) * 180) / Math.PI;
            skeleton.rotation[keys.index(name)] = angle - before;
            before = angle;
            chord += chain.lengths[index] * Math.cos((angle * Math.PI) / 180);
        }
        const first = keys.index(chain.bones[0]);
        skeleton.y[first] = -lift(0, cycle);
        skeleton.x[first] = (total - chord) / 2;
        contraction += (total - chord) / total;
        for (const head of heads) {
            keys.turn(
                head.bones,
                () => -before * 0.8 + 2 * Math.sin(TAU * cycle),
            );
        }
        skeleton.update();
        keys.keep(t);
    }
    contraction /= count + 1;
    return keys.clip(period, {
        loop: true,
        travel: (wavelength / period) * Math.max(0.08, contraction * 2),
    });
}

/** How a flyer's flap or glide is made. */
export interface FlapOptions {
    /** Wings held out, swaying a little, the legs trailing. */
    readonly glide?: boolean;
    /** Slower, smaller beats with a breath (hovering). */
    readonly hover?: boolean;
    readonly period?: number;
    readonly keys?: number;
}

/**
 * A flyer's flap: the wings beat down and up, the outer bones lagging (folding on the way up),
 * the body rising on the downstroke, the legs, the neck and the tail swinging after. `glide` holds
 * the wings out and lets the body sway; `hover` beats slowly on the spot. `travel` is how fast it
 * flies.
 */
export function make_flap(
    body: CreatureSkeleton,
    options: FlapOptions = {},
): PuppetClipData {
    const keys = new ClipKeys(body);
    const wings = chains_of(body, "wing");
    if (wings.length === 0) {
        throw new Error(`make_flap: the ${body.kind} has no wings`);
    }
    const glide = options.glide === true;
    const hover = options.hover === true;
    const span = wings[0].lengths.reduce((sum, bone) => sum + bone, 0);
    const period =
        options.period ??
        (glide ? 2.4 : hover ? 1.1 + span / 900 : 0.5 + span / 900);
    const count = options.keys ?? (glide ? 16 : 24);
    const spine = root_chain(body);
    const spine_length = spine.lengths.reduce((sum, bone) => sum + bone, 0);
    const size = body.size;
    for (let key = 0; key <= count; key++) {
        const t = (key / count) * period;
        const w = TAU * (t / period);
        const skeleton = keys.begin();
        const first = keys.index(spine.bones[0]);
        const beat = hover ? 0.6 : 1;
        if (glide) {
            skeleton.y[first] += 5 * size * Math.sin(w);
            skeleton.rotation[first] += 2 * Math.sin(w + 0.6);
        } else {
            skeleton.y[first] += 7 * size * beat * Math.cos(w);
        }
        for (const wing of wings) {
            const lag = wing.side === "far" ? 0.12 : 0;
            keys.turn(wing.bones, (index) => {
                if (glide) {
                    return index === 0
                        ? -46 + 4 * Math.sin(w)
                        : index === 1
                          ? 6 + 3 * Math.sin(w - 0.5)
                          : 5 + 4 * Math.sin(w - 1);
                }
                const phase = w - lag - 0.7 * index;
                return index === 0
                    ? (-20 + 48 * Math.cos(w - lag)) * beat
                    : index === 1
                      ? (-4 + 18 * Math.cos(phase)) * beat
                      : 22 * Math.cos(phase) * beat;
            });
        }
        for (const leg of chains_of(body, "leg")) {
            keys.turn(leg.bones, (index) =>
                glide
                    ? ([22, 12, 10][index] ?? 0)
                    : (index + 1) * 4 * Math.cos(w - 1 - 0.5 * index) * beat,
            );
        }
        for (const tail of chains_of(body, "tail")) {
            keys.turn(
                tail.bones,
                (index) => (glide ? 3 : 6) * Math.cos(w - 0.8 - 0.5 * index),
            );
        }
        let lean = 0;
        for (const neck of chains_of(body, "neck")) {
            keys.turn(neck.bones, () => {
                const turn = (glide ? 2 : -4 * beat) * Math.cos(w);
                lean += turn;
                return turn;
            });
        }
        for (const head of chains_of(body, "head")) {
            keys.turn(head.bones, () => -lean * 0.8);
        }
        if (hover) {
            breathe(keys, spine, w);
        }
        skeleton.update();
        keys.keep(t);
    }
    return keys.clip(period, {
        loop: true,
        travel: hover ? undefined : spine_length * (glide ? 3.2 : 2.4),
        events: glide || hover ? undefined : moments([[0, "flap"]]),
    });
}

/** A breath on the root chain: wider across, as long. */
function breathe(keys: ClipKeys, spine: CreatureChain, w: number): void {
    const breath = 0.045 * (1 - Math.cos(w)) * 0.5;
    for (const bone of spine.bones) {
        const index = keys.index(bone);
        keys.skeleton.stretch_x[index] = 1;
        keys.skeleton.stretch_y[index] = 1 + breath;
    }
}

/**
 * Standing still and breathing: the body's bones wider on the breath in (`scale_y` keys, as long),
 * the head nodding, the tail swaying, the feet where they are. A flyer hovers with slow beats.
 */
export function make_idle(
    body: CreatureSkeleton,
    options: { readonly period?: number; readonly keys?: number } = {},
): PuppetClipData {
    if (chains_of(body, "wing").length > 0) {
        return make_flap(body, { hover: true, period: options.period });
    }
    const keys = new ClipKeys(body);
    const legs = keys.legs();
    const period = options.period ?? 2.4;
    const count = options.keys ?? 16;
    const spine = root_chain(body);
    for (let key = 0; key <= count; key++) {
        const t = (key / count) * period;
        const w = TAU * (t / period);
        const skeleton = keys.begin();
        breathe(keys, spine, w);
        if (spine.role === "body") {
            // A worm: a slow swell running along it.
            keys.turn(spine.bones, (index) => 1.2 * Math.sin(w - 0.5 * index));
        }
        for (const neck of chains_of(body, "neck")) {
            keys.turn(neck.bones, () => 1.5 * Math.sin(w));
        }
        for (const head of chains_of(body, "head")) {
            keys.turn(head.bones, () => 2.5 * Math.sin(w + 1));
        }
        for (const tail of chains_of(body, "tail")) {
            keys.turn(tail.bones, (index) => 5 * Math.sin(w - 0.6 * index));
        }
        for (const arm of chains_of(body, "arm")) {
            keys.turn(
                arm.bones,
                (index) => (index === 1 ? -3 : 2) * Math.sin(w),
            );
        }
        skeleton.update();
        keys.plant(legs);
        keys.keep(t);
    }
    return keys.clip(period, { loop: true });
}

/**
 * The movement clips a creature of its kind has: `idle`, and `walk` and `run` (a walk and a run
 * for legs, a crawl and a fast crawl for a worm, a flap and a glide for a flyer).
 */
export function make_gaits(
    body: CreatureSkeleton,
): Record<string, PuppetClipData> {
    const clips: Record<string, PuppetClipData> = { idle: make_idle(body) };
    if (chains_of(body, "wing").length > 0) {
        clips.walk = make_flap(body);
        clips.run = make_flap(body, { glide: true });
    } else if (body.chains.some((chain) => chain.stands)) {
        clips.walk = make_walk(body);
        clips.run = make_walk(body, { run: true });
    } else {
        clips.walk = make_wave(body);
        clips.run = make_wave(body, { fast: true });
    }
    return clips;
}
