import { PuppetPlayer, PuppetPlayOptions } from "./PuppetPlayer";
import { PuppetRig } from "./PuppetRig";
import { PuppetPart, PuppetSkin } from "./PuppetSkin";
import { PuppetPoint, Skeleton } from "./Skeleton";

/** How `Puppet.draw()` draws. */
export interface PuppetDrawOptions {
    /** Default 1: one unit of the rig is one unit of the context. */
    readonly scale?: number;
    /** Mirrored around its feet: a puppet that faces right faces left. */
    readonly flip_x?: boolean;
    /** Draws the bones (and joints) over the parts. */
    readonly debug?: boolean;
    /** The bones' colour with `debug`. Default a light turquoise. */
    readonly debug_color?: string;
    /** A bone drawn thicker with `debug` (the one an editor picked); -1 for none. */
    readonly highlight?: number;
}

/**
 * One puppet: a skeleton of its rig, the skin it wears and a player of the rig's clips.
 *
 * ```ts
 * const hero = rig.puppet("idle");      // or this.load_puppet("hero") in a game
 * hero.play("run");
 * hero.update(dt);
 * hero.draw(context, x, y, { flip_x });  // its feet at x, y
 * ```
 *
 * `set_skin()` puts on another skin of the same skeleton (one of the rig's by name, or another
 * rig's default skin): the bones and clips stay, only the parts change.
 */
export class Puppet {
    public readonly player: PuppetPlayer;
    /** The bones and the pose; a game may change the pose after `update()` and call `skeleton.update()`. */
    public skeleton: Skeleton;
    private version = -1;
    private skin_source: PuppetSkin | PuppetRig | string | null = null;
    private worn: PuppetSkin | null = null;
    private parts: (PuppetPart | null)[] = [];
    private parts_of: PuppetSkin | null = null;
    private parts_version = -1;
    private readonly tip: PuppetPoint = { x: 0, y: 0 };

    public constructor(
        public readonly rig: PuppetRig,
        clip?: string,
    ) {
        this.player = new PuppetPlayer(rig, clip);
        this.skeleton = rig.make_skeleton();
        this.refresh();
    }

    /** The skin it wears now; null until the rig's data comes. */
    public get skin(): PuppetSkin | null {
        this.refresh();
        return this.worn;
    }

    /** Plays a clip of the rig (see `PuppetPlayer.play`). */
    public play(name: string, options?: PuppetPlayOptions): boolean {
        return this.player.play(name, options);
    }

    /** Plays a clip after the current one (see `PuppetPlayer.queue`). */
    public queue(name: string): boolean {
        return this.player.queue(name);
    }

    /** Moves the clip on by `delta_seconds` and poses the skeleton. */
    public update(delta_seconds: number): void {
        this.refresh();
        this.player.update(delta_seconds);
        this.player.apply(this.skeleton);
    }

    /**
     * Puts on another skin: a skin of this rig by name, a `PuppetSkin`, or another rig (its default
     * skin; one still loading is worn when it comes, this puppet's own until then). False, and
     * nothing changes, for a skin of another skeleton or a name the rig doesn't have.
     */
    public set_skin(skin: PuppetSkin | PuppetRig | Puppet | string): boolean {
        const source = skin instanceof Puppet ? skin.rig : skin;
        const own = this.rig.skeleton_name;
        if (typeof source === "string") {
            if (this.rig.has_data && this.rig.skin(source) === null) {
                return false;
            }
        } else if (source instanceof PuppetRig) {
            const theirs = source.skeleton_name;
            if (own !== null && theirs !== null && own !== theirs) {
                return false;
            }
        } else if (own !== null && source.skeleton !== own) {
            return false;
        }
        this.skin_source = source;
        this.worn = null;
        this.refresh();
        return true;
    }

    /**
     * Draws the parts in slot order, each on its bone, with the puppet's feet (the root) at `x`,
     * `y`. False while the data or the picture isn't there yet. The context's transform is the
     * same afterwards.
     */
    public draw(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        options: PuppetDrawOptions = {},
    ): boolean {
        this.refresh();
        const skin = this.worn;
        const image = skin?.image ?? null;
        if (skin === null || image === null) {
            if (options.debug === true && this.rig.has_data) {
                this.draw_bones(context, x, y, options);
            }
            return false;
        }
        const parts = this.parts_for(skin);
        const base = context.getTransform();
        const scale = options.scale ?? 1;
        const scale_x = options.flip_x === true ? -scale : scale;
        // The puppet's frame on the context: base x translate(x, y) x scale(scale_x, scale).
        const pa = base.a * scale_x;
        const pb = base.b * scale_x;
        const pc = base.c * scale;
        const pd = base.d * scale;
        const pe = base.a * x + base.c * y + base.e;
        const pf = base.b * x + base.d * y + base.f;
        const world = this.skeleton.world;
        const slots = this.rig.slots;
        for (let index = 0; index < slots.length; index++) {
            const part = parts[index];
            if (part === null) {
                continue;
            }
            const at = slots[index].bone * 6;
            // The bone in the context's frame.
            const wa = world[at];
            const wb = world[at + 1];
            const wc = world[at + 2];
            const wd = world[at + 3];
            const we = world[at + 4];
            const wf = world[at + 5];
            const ba = pa * wa + pc * wb;
            const bb = pb * wa + pd * wb;
            const bc = pa * wc + pc * wd;
            const bd = pb * wc + pd * wd;
            const be = pa * we + pc * wf + pe;
            const bf = pb * we + pd * wf + pf;
            // The part on its bone.
            const m = part.transform;
            context.setTransform(
                ba * m[0] + bc * m[1],
                bb * m[0] + bd * m[1],
                ba * m[2] + bc * m[3],
                bb * m[2] + bd * m[3],
                ba * m[4] + bc * m[5] + be,
                bb * m[4] + bd * m[5] + bf,
            );
            context.drawImage(
                image,
                part.source_x,
                part.source_y,
                part.width,
                part.height,
                0,
                0,
                part.width,
                part.height,
            );
        }
        context.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
        if (options.debug === true) {
            this.draw_bones(context, x, y, options);
        }
        return true;
    }

    /**
     * A point of the context (where `draw()` drew the puppet at `x`, `y` with `options`) in the
     * puppet's own space, for picking a bone: `skeleton.nearest_bone(local.x, local.y, 12)`.
     */
    public to_local(
        point_x: number,
        point_y: number,
        x: number,
        y: number,
        options: PuppetDrawOptions = {},
    ): PuppetPoint {
        const scale = options.scale ?? 1;
        const scale_x = options.flip_x === true ? -scale : scale;
        return { x: (point_x - x) / scale_x, y: (point_y - y) / scale };
    }

    /**
     * The slot whose part is drawn on top at a point of the puppet's own space (`to_local()`), or
     * -1: what a pointer touches, also where bone lines lie on each other (an arm hanging over the
     * torso). The parts' rectangles count, not their pixels. `rig.slots[slot].bone` is its bone.
     */
    public slot_at(x: number, y: number): number {
        return this.slot_from(this.rig.slots.length, x, y);
    }

    /**
     * The bone a pointer at a point of the puppet's own space means, for an editor: of the parts
     * covering the point, the one whose bone line passes nearest (the one drawn on top when lines
     * lie on each other, an arm over the torso; the upper arm, not the forearm's rounded end over
     * the elbow); off the parts the bone line nearest within `within`; -1 for none.
     */
    public pick_bone(x: number, y: number, within: number): number {
        const skeleton = this.skeleton;
        let best = -1;
        let best_distance = Infinity;
        for (
            let slot = this.slot_from(this.rig.slots.length, x, y);
            slot >= 0;
            slot = this.slot_from(slot, x, y)
        ) {
            const bone = this.rig.slots[slot].bone;
            const distance = skeleton.distance_to_bone(bone, x, y);
            // Lower slots only win by more than a unit: on a tie the part on top stays.
            if (distance < best_distance - 1) {
                best = bone;
                best_distance = distance;
            }
        }
        if (best >= 0) {
            return best;
        }
        return skeleton.nearest_bone(x, y, within);
    }

    /** The topmost slot below `below` whose part covers the point; -1 for none. */
    private slot_from(below: number, x: number, y: number): number {
        this.refresh();
        const skin = this.worn;
        if (skin === null) {
            return -1;
        }
        const parts = this.parts_for(skin);
        const world = this.skeleton.world;
        const slots = this.rig.slots;
        for (let index = below - 1; index >= 0; index--) {
            const part = parts[index];
            if (part === null) {
                continue;
            }
            const at = slots[index].bone * 6;
            const m = part.transform;
            // The part's pixels in the puppet's space: the bone's frame times the part's.
            const a = world[at] * m[0] + world[at + 2] * m[1];
            const b = world[at + 1] * m[0] + world[at + 3] * m[1];
            const c = world[at] * m[2] + world[at + 2] * m[3];
            const d = world[at + 1] * m[2] + world[at + 3] * m[3];
            const e = world[at] * m[4] + world[at + 2] * m[5] + world[at + 4];
            const f =
                world[at + 1] * m[4] + world[at + 3] * m[5] + world[at + 5];
            const determinant = a * d - b * c;
            if (determinant === 0) {
                continue;
            }
            const u = (d * (x - e) - c * (y - f)) / determinant;
            const v = (a * (y - f) - b * (x - e)) / determinant;
            if (u >= 0 && u <= part.width && v >= 0 && v <= part.height) {
                return index;
            }
        }
        return -1;
    }

    /** The bones as lines from joint to tip, joints as rings; on top of whatever is drawn. */
    private draw_bones(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        options: PuppetDrawOptions,
    ): void {
        const scale = options.scale ?? 1;
        const scale_x = options.flip_x === true ? -scale : scale;
        const skeleton = this.skeleton;
        const tip = this.tip;
        context.save();
        context.strokeStyle = options.debug_color ?? "#6cdad9";
        context.fillStyle = options.debug_color ?? "#6cdad9";
        for (let index = 0; index < skeleton.count; index++) {
            const length = skeleton.lengths[index];
            const from_x = x + skeleton.world_x(index) * scale_x;
            const from_y = y + skeleton.world_y(index) * scale;
            skeleton.world_point(index, length, 0, tip);
            const highlighted = index === options.highlight;
            context.lineWidth = highlighted ? 5 : 2.5;
            if (length > 0) {
                context.beginPath();
                context.moveTo(from_x, from_y);
                context.lineTo(x + tip.x * scale_x, y + tip.y * scale);
                context.stroke();
            }
            context.beginPath();
            context.arc(from_x, from_y, highlighted ? 6 : 4, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    /** Reads the rig again when its data changed, and finds the skin to wear. */
    private refresh(): void {
        if (this.version !== this.rig.version) {
            this.version = this.rig.version;
            this.skeleton = this.rig.make_skeleton();
            this.worn = null;
        }
        if (this.worn !== null && !(this.skin_source instanceof PuppetRig)) {
            return;
        }
        let skin: PuppetSkin | null = null;
        const source = this.skin_source;
        if (source instanceof PuppetSkin) {
            skin = source;
        } else if (
            source instanceof PuppetRig &&
            (source.skeleton_name === null ||
                source.skeleton_name === this.rig.skeleton_name)
        ) {
            skin = source.skin();
        } else if (typeof source === "string") {
            skin = this.rig.skin(source);
        }
        this.worn = skin ?? this.rig.skin();
    }

    /** The skin's part for each slot of the rig, in slot order; kept until either changes. */
    private parts_for(skin: PuppetSkin): (PuppetPart | null)[] {
        if (this.parts_of !== skin || this.parts_version !== this.rig.version) {
            this.parts_of = skin;
            this.parts_version = this.rig.version;
            this.parts = this.rig.slots.map(
                (slot) => skin.parts.get(slot.name) ?? null,
            );
        }
        return this.parts;
    }
}
