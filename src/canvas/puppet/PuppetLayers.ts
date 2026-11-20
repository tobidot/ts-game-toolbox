import { PuppetPlayer } from "./PuppetPlayer";
import type { PuppetRig } from "./PuppetRig";
import type { Skeleton } from "./Skeleton";

/**
 * A bone mask: one weight per bone, 0 to 1 (bones numbered as the skeleton's). A layer moves a
 * bone by its weight times the mask's: 1 takes the layer's pose, 0 leaves the bone to the layers
 * below.
 */
export type PuppetMask = Float64Array;

/** How a layer mixes over the ones below it. */
export type PuppetLayerMode = "replace" | "add";

/** What `mask_from()` takes. */
export interface MaskOptions {
    /** The bones' children (and theirs) too. Default true. */
    readonly children?: boolean;
    /** The mask's weight on those bones. Default 1. */
    readonly weight?: number;
}

/** How `PuppetLayers.play()` starts a layer. */
export interface PuppetLayerOptions {
    /**
     * The bones the layer moves: a named mask (`"upper_body"`, `"lower_body"`, `"arm_r"`; see
     * `PuppetLayers.mask()`), bone names (each with its children), or a mask of weights. Default:
     * every bone.
     */
    readonly mask?: string | readonly string[] | PuppetMask;
    /** How much of the layer shows, 0 to 1. Default 1. */
    readonly weight?: number;
    /**
     * `"replace"` (default) blends the layer's pose over the pose below; `"add"` adds its keys on
     * top (they are offsets on the rest pose, so a recoil keyed from 0 to -12 and back to 0 kicks
     * the arm and leaves it where it was).
     */
    readonly mode?: PuppetLayerMode;
    /** Seconds the layer's weight fades in (and its clip fades from the one it played). Default 0.15. */
    readonly fade?: number;
    /** From the clip's start even when the layer plays it already. */
    readonly restart?: boolean;
    /** The layer's clip runs this many times as fast. Default 1. */
    readonly speed?: number;
    /**
     * When a clip played once ends, the layer fades out over `fade` and goes. Default: true for
     * `"add"` layers (a recoil, a flinch), false for `"replace"` (a held pose stays).
     */
    readonly until_done?: boolean;
}

/** The default fade of a layer, in seconds. */
export const LAYER_FADE = 0.15;

/**
 * One clip layer: its own player of the rig's clips, a bone mask, a weight that fades, and how it
 * mixes. Made by `PuppetLayers.play()`.
 */
export class PuppetLayer {
    public readonly player: PuppetPlayer;
    public mode: PuppetLayerMode = "replace";
    /** The weight now, 0 to 1 (fading towards `target`). */
    public weight = 0;
    /** The weight it fades to. */
    public target = 1;
    /** Fades out and goes when its clip, played once, ends. */
    public until_done = false;
    /** Weight per second while fading; Infinity jumps. */
    private rate = Infinity;
    private mask_spec: string | readonly string[] | PuppetMask | null = null;
    private mask_cache: PuppetMask | null = null;
    private mask_version = -1;
    private is_going = false;
    private fade_out = LAYER_FADE;

    public constructor(
        public readonly name: string,
        rig: PuppetRig,
        clip: string,
    ) {
        this.player = new PuppetPlayer(rig, clip);
        this.player.sends_events = false;
    }

    /** The clip it plays; null for none yet. */
    public get clip_name(): string | null {
        return this.player.clip_name;
    }

    /** It is fading out to go. */
    public get going(): boolean {
        return this.is_going;
    }

    /** Fades the weight to `weight` over `fade` seconds (0 at once). */
    public fade_to(weight: number, fade: number): void {
        this.target = Math.min(1, Math.max(0, weight));
        this.rate =
            fade > 0 ? Math.abs(this.target - this.weight) / fade : Infinity;
        if (this.rate === 0) {
            this.rate = Infinity;
        }
    }

    /** The layer's mask for the rig as it is now. */
    public mask(layers: PuppetLayers): PuppetMask {
        const version = layers.rig.version;
        if (this.mask_cache === null || this.mask_version !== version) {
            this.mask_cache = layers.resolve_mask(this.mask_spec);
            this.mask_version = version;
        }
        return this.mask_cache;
    }

    /** Sets what it masks (see `PuppetLayerOptions.mask`); null for every bone. */
    public set_mask(
        mask: string | readonly string[] | PuppetMask | null,
    ): void {
        this.mask_spec = mask;
        this.mask_cache = null;
    }

    /** Fades out over `fade` seconds and goes. */
    public stop(fade: number): void {
        this.is_going = true;
        this.fade_out = fade;
        this.fade_to(0, fade);
    }

    /** Takes back a `stop()`: the layer stays. */
    public keep(): void {
        this.is_going = false;
    }

    /** Moves the clip and the weight on; true when the layer is gone (faded out after a stop). */
    public update(delta_seconds: number): boolean {
        this.player.update(delta_seconds);
        if (this.until_done && !this.is_going && this.player.finished) {
            this.stop(this.fade_out);
        }
        if (this.weight !== this.target) {
            const step = this.rate * Math.max(0, delta_seconds);
            if (
                !Number.isFinite(step) ||
                step >= Math.abs(this.target - this.weight)
            ) {
                this.weight = this.target;
            } else {
                this.weight += Math.sign(this.target - this.weight) * step;
            }
        }
        return this.is_going && this.weight <= 0;
    }

    /** Remembers the fade a stop at the clip's end will take. */
    public set_fade_out(fade: number): void {
        this.fade_out = fade;
    }
}

/**
 * Clip layers over a puppet's own clip (since step 44, Knopper Klopper): the legs run while the
 * torso aims and the arm recoils. Each layer plays a clip of the rig on the bones of its mask,
 * mixed over the layers below in the order they were first played: `"replace"` blends its pose in
 * by its weight, `"add"` adds its keys on top. The puppet's own player (`puppet.player`, what
 * `puppet.play()` plays) is the bottom.
 *
 * ```ts
 * hero.play("run");                                          // the bottom: the whole body runs
 * hero.layers.play("aim", "hold", { mask: "upper_body" });  // the torso and arms hold the gun
 * hero.layers.play("recoil", "kick", { mode: "add", mask: "arm_r" }); // fades out when done
 * ```
 *
 * Masks: `mask(name)` gives a named one, from the rig's `masks` data or made from the bone tree:
 * `lower_body` (the root, a `hip` bone and every leg), `upper_body` (every other bone), `legs`
 * (the same as `lower_body`), `arm_r`, `arm_l`, `leg_r`, `leg_l` (a limb's first bone and its
 * children), `head` and `all`. `mask_from(bones, { children })` makes one from bone names.
 */
export class PuppetLayers {
    private list: PuppetLayer[] = [];
    private pose: Float64Array[] = [];
    private named = new Map<string, PuppetMask>();
    private named_version = -1;

    public constructor(public readonly rig: PuppetRig) {}

    /** The layers, bottom first. */
    public get layers(): readonly PuppetLayer[] {
        return this.list;
    }

    /** The layer of that name; null for none. */
    public layer(name: string): PuppetLayer | null {
        return this.list.find((layer) => layer.name === name) ?? null;
    }

    /**
     * Plays `clip` on the layer `name` (made on first use, on top of the others): the weight fades
     * in, the clip fades from the one the layer played. Null, and nothing changes, when the rig's
     * clips are there and none has that name.
     */
    public play(
        name: string,
        clip: string,
        options: PuppetLayerOptions = {},
    ): PuppetLayer | null {
        if (this.rig.has_data && this.rig.clip(clip) === null) {
            return null;
        }
        const fade = options.fade ?? LAYER_FADE;
        let layer = this.layer(name);
        const is_new = layer === null;
        if (layer === null) {
            layer = new PuppetLayer(name, this.rig, clip);
            this.list.push(layer);
        }
        layer.keep();
        layer.mode = options.mode ?? "replace";
        layer.until_done = options.until_done ?? layer.mode === "add";
        layer.set_fade_out(fade);
        if (options.mask !== undefined || is_new) {
            layer.set_mask(options.mask ?? null);
        }
        layer.player.speed = options.speed ?? 1;
        if (!is_new) {
            layer.player.play(clip, { fade, restart: options.restart });
        }
        layer.fade_to(options.weight ?? 1, fade);
        return layer;
    }

    /** Fades the layer out over `fade` seconds and takes it away. False for no such layer. */
    public stop(name: string, fade: number = LAYER_FADE): boolean {
        const layer = this.layer(name);
        if (layer === null) {
            return false;
        }
        layer.stop(fade);
        return true;
    }

    /** Takes every layer away at once. */
    public clear(): void {
        this.list = [];
    }

    /** Fades a layer's weight to `weight` over `fade` seconds. False for no such layer. */
    public set_weight(name: string, weight: number, fade = 0): boolean {
        const layer = this.layer(name);
        if (layer === null) {
            return false;
        }
        layer.fade_to(weight, fade);
        return true;
    }

    /** Moves every layer's clip and weight on; layers faded out after a stop go. */
    public update(delta_seconds: number): void {
        if (this.list.length === 0) {
            return;
        }
        this.list = this.list.filter((layer) => !layer.update(delta_seconds));
    }

    /**
     * Mixes the layers over the pose in the skeleton (written by the puppet's own clip), bottom
     * first. Leaves `skeleton.update()` to the caller.
     */
    public apply(skeleton: Skeleton): void {
        if (this.list.length === 0) {
            return;
        }
        const count = skeleton.count;
        if (this.pose.length === 0 || this.pose[0].length !== count) {
            this.pose = [
                new Float64Array(count),
                new Float64Array(count),
                new Float64Array(count),
                new Float64Array(count),
                new Float64Array(count),
            ];
        }
        const pose = this.pose;
        for (const layer of this.list) {
            if (layer.weight <= 0 || !layer.player.pose_into(pose)) {
                continue;
            }
            const mask = layer.mask(this);
            const is_added = layer.mode === "add";
            for (let bone = 0; bone < count; bone++) {
                const weight = layer.weight * (mask[bone] ?? 0);
                if (weight <= 0) {
                    continue;
                }
                if (is_added) {
                    skeleton.rotation[bone] += pose[0][bone] * weight;
                    skeleton.x[bone] += pose[1][bone] * weight;
                    skeleton.y[bone] += pose[2][bone] * weight;
                    skeleton.stretch_x[bone] *=
                        1 + (pose[3][bone] - 1) * weight;
                    skeleton.stretch_y[bone] *=
                        1 + (pose[4][bone] - 1) * weight;
                    continue;
                }
                if (weight >= 1) {
                    skeleton.rotation[bone] = pose[0][bone];
                    skeleton.x[bone] = pose[1][bone];
                    skeleton.y[bone] = pose[2][bone];
                    skeleton.stretch_x[bone] = pose[3][bone];
                    skeleton.stretch_y[bone] = pose[4][bone];
                    continue;
                }
                skeleton.rotation[bone] +=
                    wrap_degrees(pose[0][bone] - skeleton.rotation[bone]) *
                    weight;
                skeleton.x[bone] += (pose[1][bone] - skeleton.x[bone]) * weight;
                skeleton.y[bone] += (pose[2][bone] - skeleton.y[bone]) * weight;
                skeleton.stretch_x[bone] +=
                    (pose[3][bone] - skeleton.stretch_x[bone]) * weight;
                skeleton.stretch_y[bone] +=
                    (pose[4][bone] - skeleton.stretch_y[bone]) * weight;
            }
        }
    }

    /**
     * A named mask: the rig's own (`masks` in its data: bone names, each with its children), else
     * one made from the bone tree (see the class). Null for a name neither knows.
     */
    public mask(name: string): PuppetMask | null {
        if (this.named_version !== this.rig.version) {
            this.named = this.rig.has_data
                ? named_masks(this.rig.make_skeleton(), this.rig.data?.masks)
                : new Map();
            this.named_version = this.rig.version;
        }
        return this.named.get(name) ?? null;
    }

    /** A mask of these bones (each with its children unless `children: false`). */
    public mask_from(
        bones: string | readonly string[],
        options: MaskOptions = {},
    ): PuppetMask {
        return mask_from(this.rig.make_skeleton(), bones, options);
    }

    /** A layer's mask setting as weights: every bone for null, a name, bone names or the weights as given. */
    public resolve_mask(
        spec: string | readonly string[] | PuppetMask | null,
    ): PuppetMask {
        const count = this.rig.bone_count;
        if (spec === null) {
            return new Float64Array(count).fill(1);
        }
        if (spec instanceof Float64Array) {
            return spec;
        }
        if (typeof spec === "string") {
            const named = this.mask(spec);
            if (named !== null) {
                return named;
            }
        }
        return this.mask_from(spec);
    }
}

/**
 * A mask of the named bones of a skeleton (each with its children unless `children: false`); an
 * unknown name adds nothing.
 */
export function mask_from(
    skeleton: Skeleton,
    bones: string | readonly string[],
    options: MaskOptions = {},
): PuppetMask {
    const count = skeleton.count;
    const mask = new Float64Array(count);
    const weight = options.weight ?? 1;
    const with_children = options.children ?? true;
    const names = typeof bones === "string" ? [bones] : bones;
    for (const name of names) {
        const first = skeleton.index_of(name);
        if (first < 0) {
            continue;
        }
        mask[first] = weight;
        if (!with_children) {
            continue;
        }
        // Children come after their parents: the subtree lies further down the list.
        for (let bone = first + 1; bone < count; bone++) {
            if (is_below(skeleton, bone, first)) {
                mask[bone] = weight;
            }
        }
    }
    return mask;
}

/** Bone `bone` hangs (somewhere) below `above`. */
function is_below(skeleton: Skeleton, bone: number, above: number): boolean {
    for (let at = skeleton.parents[bone]; at >= 0; at = skeleton.parents[at]) {
        if (at === above) {
            return true;
        }
    }
    return false;
}

/** The first bone of a leg (`thigh_*`, a four-legged rig's `upper_h*`, `upper_f*`, `leg_*`). */
const LEG_ROOT = /^(thigh|upper_h|upper_f|leg)(_|$)/;
/** The first bone of an arm. */
const ARM_ROOT = /^upper_arm(_|$)/;

/**
 * The named masks of a skeleton: its rig's `masks` data first, then `lower_body` (the roots, a
 * `hip` and every leg with its children), `legs` (the same), `upper_body` (every other bone),
 * `arm_r`, `arm_l`, `leg_r`, `leg_l`, `head` and `all`.
 */
export function named_masks(
    skeleton: Skeleton,
    data?: Readonly<Record<string, readonly string[]>>,
): Map<string, PuppetMask> {
    const count = skeleton.count;
    const masks = new Map<string, PuppetMask>();
    const legs = skeleton.names.filter((name) => LEG_ROOT.test(name));
    const lower = mask_from(skeleton, legs);
    for (let bone = 0; bone < count; bone++) {
        if (skeleton.parents[bone] < 0 || skeleton.names[bone] === "hip") {
            lower[bone] = 1;
        }
    }
    const upper = new Float64Array(count);
    for (let bone = 0; bone < count; bone++) {
        upper[bone] = lower[bone] > 0 ? 0 : 1;
    }
    masks.set("all", new Float64Array(count).fill(1));
    masks.set("lower_body", lower);
    masks.set("legs", lower);
    masks.set("upper_body", upper);
    for (const name of skeleton.names) {
        const side = /_(l|r)$/.exec(name)?.[1];
        if (side === undefined) {
            continue;
        }
        if (ARM_ROOT.test(name)) {
            masks.set(`arm_${side}`, mask_from(skeleton, name));
        } else if (LEG_ROOT.test(name) && !masks.has(`leg_${side}`)) {
            masks.set(`leg_${side}`, mask_from(skeleton, name));
        }
    }
    if (skeleton.index_of("head") >= 0) {
        masks.set("head", mask_from(skeleton, "head"));
    }
    for (const [name, bones] of Object.entries(data ?? {})) {
        masks.set(name, mask_from(skeleton, bones));
    }
    return masks;
}

/** Degrees in [-180, 180). */
function wrap_degrees(degrees: number): number {
    const turned = (((degrees + 180) % 360) + 360) % 360;
    return turned - 180;
}
