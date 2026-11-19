import { EventBase, EventSocket } from "../../signals/EventSocket";
import { PuppetPlayer, PuppetPlayOptions } from "./PuppetPlayer";
import { PuppetRig } from "./PuppetRig";
import { PuppetPart, PuppetSkin } from "./PuppetSkin";
import { OutfitData } from "./RigData";
import { PuppetPoint, Skeleton } from "./Skeleton";
import {
    first_slot_on,
    part_bone,
    PiecePart,
    piece_problems,
    Wardrobe,
    WardrobePiece,
} from "./Wardrobe";

const DEGREES = Math.PI / 180;

/** What a puppet wears changed: pieces put on, taken off, or both. */
export class OutfitEvent extends EventBase {
    public static readonly EVENT_NAME = "puppet.outfit";

    public constructor(
        /** The outfit now, a piece id per place. */
        public readonly outfit: OutfitData,
        /** The ids put on. */
        public readonly put_on: readonly string[],
        /** The ids taken off (also those dropped for not fitting). */
        public readonly taken_off: readonly string[],
    ) {
        super(OutfitEvent.EVENT_NAME);
    }
}

/** A point of the puppet with an angle: where an anchor is now. */
export interface PuppetAnchorPoint {
    x: number;
    y: number;
    /** Degrees, turning clockwise on the screen; 0 points the way the puppet faces at rest. */
    rotation: number;
}

/** One picture part in the drawing order: a part of the skin or of a worn piece. */
interface DrawEntry {
    /** The slot's name, or `piece:part` for clothes. */
    readonly name: string;
    readonly bone: number;
    readonly source_x: number;
    readonly source_y: number;
    readonly width: number;
    readonly height: number;
    /** From the part's pixels to its bone's frame (an anchor's offset and angle included). */
    readonly transform: Float64Array;
    /** Whose picture it is: the skin's or a wardrobe's, read when drawing (it may come later). */
    readonly picture: { readonly image: CanvasImageSource | null };
}

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
    /** Outfit changes: `OutfitEvent`. */
    public readonly events = new EventSocket<OutfitEvent>();
    private readonly wardrobe_list: Wardrobe[] = [];
    /** A piece id per place; one whose wardrobe is still loading waits here. */
    private readonly outfit_map = new Map<string, string>();
    private outfit_version = 0;
    private order: DrawEntry[] = [];
    private order_names: readonly string[] = [];
    private order_key: readonly unknown[] = [];

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

    // ---- clothes ----

    /** The wardrobes this puppet takes pieces from, in the order `use_wardrobe()` gave them. */
    public get wardrobes(): readonly Wardrobe[] {
        return this.wardrobe_list;
    }

    /**
     * Takes pieces from a wardrobe (a clothes atlas) from now on: `wear(id)` finds them by id. A
     * wardrobe still loading is fine; an outfit naming its pieces waits for it.
     */
    public use_wardrobe(wardrobe: Wardrobe): void {
        if (!this.wardrobe_list.includes(wardrobe)) {
            this.wardrobe_list.push(wardrobe);
            this.outfit_version += 1;
        }
    }

    /** A piece of the puppet's wardrobes by id (the first wardrobe that has it); null for none. */
    public find_piece(id: string): WardrobePiece | null {
        for (const wardrobe of this.wardrobe_list) {
            const piece = wardrobe.piece(id);
            if (piece !== null) {
                return piece;
            }
        }
        return null;
    }

    /** Why a piece can't be worn, in words; empty when it can (or the rig is still on its way). */
    public fit_problems(id: string): string[] {
        const piece = this.find_piece(id);
        if (piece === null) {
            return [`no piece "${id}" in the puppet's wardrobes`];
        }
        return piece_problems(piece, this.rig);
    }

    /**
     * Puts a piece on, in its place: what was there comes off. False, and nothing changes, for a
     * piece none of its wardrobes has (yet) or one that doesn't fit the rig (a missing anchor,
     * another skeleton; `fit_problems(id)` says what).
     */
    public wear(id: string): boolean {
        const piece = this.find_piece(id);
        if (piece === null || piece_problems(piece, this.rig).length > 0) {
            return false;
        }
        const before = this.outfit_map.get(piece.place);
        if (before === id) {
            return true;
        }
        this.outfit_map.set(piece.place, id);
        this.outfit_changed([id], before === undefined ? [] : [before]);
        return true;
    }

    /** Takes off what is worn in a place (`"hat"`), or the piece of that id. False when nothing came off. */
    public take_off(place_or_id: string): boolean {
        let place: string | null = null;
        if (this.outfit_map.has(place_or_id)) {
            place = place_or_id;
        } else {
            for (const [worn_place, id] of this.outfit_map) {
                if (id === place_or_id) {
                    place = worn_place;
                }
            }
        }
        if (place === null) {
            return false;
        }
        const id = this.outfit_map.get(place) as string;
        this.outfit_map.delete(place);
        this.outfit_changed([], [id]);
        return true;
    }

    /** Takes everything off. */
    public undress(): void {
        this.set_outfit({});
    }

    /** What it wears, as plain data: a piece id per place (`{ hat: "straw-hat" }`). Save it as it is. */
    public get outfit(): OutfitData {
        return Object.fromEntries(this.outfit_map);
    }

    /**
     * Wears an outfit (`{ hat: "straw-hat", top: "blue-coat" }`) in place of the one before, as
     * one change (one `OutfitEvent`). A piece in the wrong place or one that doesn't fit is left
     * out and the answer is false; a piece of a wardrobe still loading waits for it.
     */
    public set_outfit(outfit: OutfitData): boolean {
        let is_whole = true;
        const next = new Map<string, string>();
        const is_loading = this.wardrobe_list.some(
            (wardrobe) => !wardrobe.has_data,
        );
        for (const [place, id] of Object.entries(outfit)) {
            if (typeof id !== "string") {
                is_whole = false;
                continue;
            }
            const piece = this.find_piece(id);
            if (piece === null) {
                if (is_loading) {
                    next.set(place, id);
                } else {
                    is_whole = false;
                }
                continue;
            }
            if (
                piece.place !== place ||
                piece_problems(piece, this.rig).length > 0
            ) {
                is_whole = false;
                continue;
            }
            next.set(place, id);
        }
        const put_on = [...next]
            .filter(([place, id]) => this.outfit_map.get(place) !== id)
            .map(([, id]) => id);
        const taken_off = [...this.outfit_map]
            .filter(([place, id]) => next.get(place) !== id)
            .map(([, id]) => id);
        if (put_on.length > 0 || taken_off.length > 0) {
            this.outfit_map.clear();
            for (const [place, id] of next) {
                this.outfit_map.set(place, id);
            }
            this.outfit_changed(put_on, taken_off);
        }
        return is_whole;
    }

    /** The pieces worn, as found in the wardrobes (a piece still loading is not among them). */
    public get worn_pieces(): WardrobePiece[] {
        const pieces: WardrobePiece[] = [];
        for (const id of this.outfit_map.values()) {
            const piece = this.find_piece(id);
            if (piece !== null) {
                pieces.push(piece);
            }
        }
        return pieces;
    }

    /**
     * The drawing order by name, back to front: the skin's slots and the clothes' parts
     * (`"blue-coat:sleeve_upper_r"`). Sorted once when the outfit (or the skin, the rig or a
     * wardrobe's data) changes, never per frame: the same array until then.
     */
    public get drawing_order(): readonly string[] {
        this.refresh();
        const skin = this.worn;
        if (skin !== null) {
            this.order_for(skin);
        }
        return this.order_names;
    }

    /**
     * Where an anchor (`"hand_r"`, `"head_top"`) is now, with its angle: in the puppet's own space,
     * or, given where and how `draw()` draws the puppet, in the context's (mirrored with `flip_x`:
     * the angle too). Null for an anchor the rig doesn't have. For a game that spawns something at
     * a hand. After `update()`.
     */
    public anchor_world(
        name: string,
        x = 0,
        y = 0,
        options: PuppetDrawOptions = {},
        out: PuppetAnchorPoint = { x: 0, y: 0, rotation: 0 },
    ): PuppetAnchorPoint | null {
        this.refresh();
        const anchor = this.rig.anchors.get(name);
        if (anchor === undefined || anchor.bone >= this.skeleton.count) {
            return null;
        }
        const point = this.skeleton.world_point(
            anchor.bone,
            anchor.x,
            anchor.y,
            this.tip,
        );
        const scale = options.scale ?? 1;
        const is_flipped = options.flip_x === true;
        const rotation =
            this.skeleton.world_rotation(anchor.bone) + anchor.rotation;
        out.x = x + point.x * (is_flipped ? -scale : scale);
        out.y = y + point.y * scale;
        out.rotation = is_flipped ? 180 - rotation : rotation;
        return out;
    }

    /**
     * Draws the parts in their drawing order (the skin's slots, the clothes in front of or behind
     * them), each on its bone, with the puppet's feet (the root) at `x`, `y`. False while the data
     * or the skin's picture isn't there yet; a wardrobe's picture still on its way leaves its
     * clothes out. The context's transform is the same afterwards.
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
        const order = this.order_for(skin);
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
        for (let index = 0; index < order.length; index++) {
            const part = order[index];
            const picture = part.picture.image;
            if (picture === null) {
                continue;
            }
            const at = part.bone * 6;
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
                picture,
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

    private outfit_changed(
        put_on: readonly string[],
        taken_off: readonly string[],
    ): void {
        this.outfit_version += 1;
        this.events.dispatch(new OutfitEvent(this.outfit, put_on, taken_off));
    }

    /**
     * The drawing order for a skin: rebuilt only when the rig, the skin, the outfit or a
     * wardrobe's data changed. Pieces that turn out not to fit (their wardrobe came after the
     * outfit) come off here, with an `OutfitEvent`.
     */
    private order_for(skin: PuppetSkin): DrawEntry[] {
        const key = [
            this.rig.version,
            skin,
            this.outfit_version,
            ...this.wardrobe_list.map((wardrobe) => wardrobe.version),
        ];
        const order_key = this.order_key;
        if (
            key.length === order_key.length &&
            key.every((value, index) => value === order_key[index])
        ) {
            return this.order;
        }
        const dropped: string[] = [];
        const worn: WardrobePiece[] = [];
        for (const [place, id] of [...this.outfit_map]) {
            const piece = this.find_piece(id);
            if (piece === null) {
                const is_loading = this.wardrobe_list.some(
                    (wardrobe) => !wardrobe.has_data,
                );
                if (!is_loading) {
                    this.outfit_map.delete(place);
                    dropped.push(id);
                }
                continue;
            }
            if (
                piece.place !== place ||
                piece_problems(piece, this.rig).length > 0
            ) {
                this.outfit_map.delete(place);
                dropped.push(id);
                continue;
            }
            worn.push(piece);
        }
        if (dropped.length > 0) {
            this.outfit_changed([], dropped);
        }
        this.order = this.sort_parts(skin, worn);
        this.order_names = this.order.map((entry) => entry.name);
        this.order_key = [
            this.rig.version,
            skin,
            this.outfit_version,
            ...this.wardrobe_list.map((wardrobe) => wardrobe.version),
        ];
        return this.order;
    }

    /**
     * The skin's parts in slot order with the clothes' parts put in: behind a slot (the outer
     * layer furthest back), in front of it (the inner layer first) or in it, instead of the skin's
     * part.
     */
    private sort_parts(
        skin: PuppetSkin,
        worn: readonly WardrobePiece[],
    ): DrawEntry[] {
        const slots = this.rig.slots;
        const behind: { part: PiecePart; entry: DrawEntry }[][] = slots.map(
            () => [],
        );
        const in_front: { part: PiecePart; entry: DrawEntry }[][] = slots.map(
            () => [],
        );
        const instead: { part: PiecePart; entry: DrawEntry }[][] = slots.map(
            () => [],
        );
        for (const piece of worn) {
            for (const part of piece.parts) {
                const bone = part_bone(part, this.rig);
                const slot =
                    part.order_slot === null
                        ? first_slot_on(this.rig, bone)
                        : this.rig.slot_index(part.order_slot);
                const entry = this.piece_entry(piece, part, bone);
                if (part.order === "behind") {
                    behind[slot].push({ part, entry });
                } else if (part.order === "slot") {
                    instead[slot].push({ part, entry });
                } else {
                    in_front[slot].push({ part, entry });
                }
            }
        }
        const inner_first = (a: { part: PiecePart }, b: { part: PiecePart }) =>
            a.part.layer - b.part.layer ||
            (a.part.piece < b.part.piece
                ? -1
                : a.part.piece > b.part.piece
                  ? 1
                  : 0) ||
            a.part.index - b.part.index;
        const order: DrawEntry[] = [];
        const parts = this.parts_for(skin);
        for (let index = 0; index < slots.length; index++) {
            const back = behind[index].sort(inner_first).reverse();
            for (const { entry } of back) {
                order.push(entry);
            }
            const own = instead[index].sort(inner_first);
            if (own.length > 0) {
                for (const { entry } of own) {
                    order.push(entry);
                }
            } else {
                const part = parts[index];
                if (part !== null) {
                    order.push({
                        name: slots[index].name,
                        bone: slots[index].bone,
                        source_x: part.source_x,
                        source_y: part.source_y,
                        width: part.width,
                        height: part.height,
                        transform: part.transform,
                        picture: skin,
                    });
                }
            }
            for (const { entry } of in_front[index].sort(inner_first)) {
                order.push(entry);
            }
        }
        return order;
    }

    /** A piece's part as a drawing entry: on its bone, or on its anchor's place and angle. */
    private piece_entry(
        piece: WardrobePiece,
        part: PiecePart,
        bone: number,
    ): DrawEntry {
        let transform = part.transform;
        const anchor =
            part.anchor === null
                ? undefined
                : this.rig.anchors.get(part.anchor);
        if (anchor !== undefined) {
            const radians = anchor.rotation * DEGREES;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const m = part.transform;
            transform = Float64Array.of(
                cos * m[0] - sin * m[1],
                sin * m[0] + cos * m[1],
                cos * m[2] - sin * m[3],
                sin * m[2] + cos * m[3],
                cos * m[4] - sin * m[5] + anchor.x,
                sin * m[4] + cos * m[5] + anchor.y,
            );
        }
        return {
            name: `${piece.id}:${part.name}`,
            bone,
            source_x: part.source_x,
            source_y: part.source_y,
            width: part.width,
            height: part.height,
            transform,
            picture: piece.wardrobe,
        };
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
