import { EventBase, EventSocket } from "../../signals/EventSocket";
import { MarkPicture, MarkSheet } from "./MarkSheet";
import { PartMesh } from "./PartMesh";
import {
    BakedLook,
    default_puppet_canvas,
    LookLayer,
    LookMark,
    MakePuppetCanvas,
    pack_looks,
    PackedLooks,
    PuppetBaker,
} from "./PuppetLook";
import { PuppetJiggle } from "./PuppetJiggle";
import { PuppetLayers } from "./PuppetLayers";
import { PuppetPlayer, PuppetPlayOptions } from "./PuppetPlayer";
import { PuppetRig } from "./PuppetRig";
import { PuppetPart, PuppetSkin } from "./PuppetSkin";
import { CharacterData, MarkData, OutfitData } from "./RigData";
import { PuppetPoint, Skeleton } from "./Skeleton";
import { SoftLayer } from "./SoftLayer";
import { skin_points, soft_matrices } from "./SoftMesh";
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
    /** The piece's id; null for the skin's parts. */
    readonly piece: string | null;
    readonly bone: number;
    readonly source_x: number;
    readonly source_y: number;
    readonly width: number;
    readonly height: number;
    /** From the part's pixels to its bone's frame (an anchor's offset and angle included). */
    readonly transform: Float64Array;
    /** Whose picture it is: the skin's or a wardrobe's, read when drawing (it may come later). */
    readonly picture: { readonly image: CanvasImageSource | null };
    /** It hangs on an anchor at this point of its bone: the bone's scale moves it, never stretches it. */
    readonly on_anchor: boolean;
    readonly anchor_x: number;
    readonly anchor_y: number;
    /** A skin part's tint layers (`[x, y]` in its atlas); null for clothes and parts without. */
    readonly layers: ReadonlyMap<string, readonly [number, number]> | null;
}

/** How one drawing entry looks now when it is not its plain part: laid into a canvas, or a moved mesh. */
interface EntryLook {
    /** What it was made from: shape values, tints, marks, pictures. */
    readonly signature: string;
    readonly baked: BakedLook | null;
    readonly mesh: PartMesh | null;
    /** The mesh's moved points; null when it doesn't move. */
    readonly deformed: Float64Array | null;
}

/** Where a mark goes, as `add_mark()` and `move_mark()` take it: everything but its picture and slot. */
export type MarkPlacement = Partial<Omit<MarkData, "id" | "slot">>;

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
    /** Only the clothes, not the skin's parts: a piece on a hanger, a drawer's picture. */
    readonly only_clothes?: boolean;
    /**
     * Draws moved meshes triangle by triangle every frame instead of from the canvas their look
     * was laid into once (for measuring; tints and marks then stay off). Default false.
     */
    readonly direct_meshes?: boolean;
    /**
     * A soft skin waits in this layer for `layer.draw(context)` (many puppets in one pass on the
     * graphics card). Without one, a soft puppet is drawn at once through the context's shared layer.
     */
    readonly layer?: SoftLayer;
    /** A soft skin's grid drawn over it. */
    readonly grid?: boolean;
    /** A soft skin in its bones' colours, each point mixed by its weights. */
    readonly weights?: boolean;
    /** A soft skin's opacity, 0 to 1. Default 1. */
    readonly alpha?: number;
}

/** A box in the puppet's own space. */
export interface PuppetBox {
    x: number;
    y: number;
    width: number;
    height: number;
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
    /** Body shape values by name; while the rig is on its way, also names it may not have. */
    private readonly shape_values = new Map<string, number>();
    private readonly tint_map = new Map<string, string>();
    private mark_list: MarkData[] = [];
    private readonly mark_sheet_list: MarkSheet[] = [];
    /** Grows with every change of the shape, tints or marks. */
    private look_version = 0;
    private looks: (EntryLook | null)[] = [];
    private looks_key: readonly unknown[] = [];
    private entry_looks = new WeakMap<DrawEntry, EntryLook>();
    private readonly meshes = new WeakMap<
        DrawEntry,
        { readonly version: number; readonly mesh: PartMesh | null }
    >();
    private baker: PuppetBaker | null = null;
    private baker_canvas: MakePuppetCanvas | null = null;
    /** The baked looks laid into one canvas, so the puppet draws them from one picture. */
    private packed: PackedLooks | null = null;
    private readonly matrix = new Float64Array(6);
    /**
     * Makes the canvases a part's look (shape, tints, marks) is laid into: a page's canvas or an
     * `OffscreenCanvas` by default. Without one, moved meshes are drawn triangle by triangle every
     * frame and tints and marks stay off.
     */
    public make_canvas: MakePuppetCanvas = default_puppet_canvas;
    /** The spacing of a part mesh's grid, in the part's pixels. Smaller bends more smoothly and costs more. */
    public mesh_cell = 16;
    /**
     * The rig's jiggling bones (ears, tails; its `jiggle` data), one spring each: `enabled`,
     * `strength`, and `carry(dx, dy)` when the game moves the puppet, so they lag behind the move.
     */
    public readonly jiggle = new PuppetJiggle();
    /**
     * Clip layers over the puppet's own clip, each on the bones of a mask (since step 44): the
     * legs run while the arms aim. `layers.play("aim", "hold", { mask: "upper_body" })`.
     */
    public readonly layers: PuppetLayers;

    public constructor(
        public readonly rig: PuppetRig,
        clip?: string,
    ) {
        this.player = new PuppetPlayer(rig, clip);
        this.layers = new PuppetLayers(rig);
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

    /**
     * Moves the clip and its layers on by `delta_seconds`, poses the skeleton (the clip, the layers
     * mixed over it) and swings the jiggling bones.
     */
    public update(delta_seconds: number): void {
        this.refresh();
        this.player.update(delta_seconds);
        this.layers.update(delta_seconds);
        this.player.apply(this.skeleton, false);
        this.layers.apply(this.skeleton);
        this.skeleton.update();
        if (this.player.clip !== null) {
            this.jiggle.step(delta_seconds, this.skeleton);
        }
    }

    /**
     * The clips' stretch and squash (their `scale_x`, `scale_y` keys) is shown; false keeps every
     * bone at its length. Since step 41.
     */
    public get stretch(): boolean {
        return this.player.stretch;
    }

    public set stretch(stretch: boolean) {
        this.player.stretch = stretch;
    }

    /** The skin it wears is a soft skin (a grid over whole pictures), not cut-out parts. */
    public get is_soft(): boolean {
        return this.skin?.soft != null;
    }

    /**
     * Where the points of its soft skin's grid are now, in the puppet's own space (two numbers
     * per point; `cell_size` defaults to the skin's GPU grid). Null without a soft skin or its picture.
     */
    public soft_points(cell_size?: number): Float64Array | null {
        const soft = this.skin?.soft ?? null;
        const inverse = soft?.rest_inverse ?? null;
        if (soft === null || inverse === null) {
            return null;
        }
        const mesh = soft.mesh(cell_size ?? soft.cell_size);
        if (mesh === null) {
            return null;
        }
        const matrices = soft_matrices(
            this.skeleton,
            inverse,
            [1, 0, 0, 1, 0, 0],
            new Float64Array(this.skeleton.count * 6),
        );
        return skin_points(mesh, matrices, new Float64Array(mesh.count * 2));
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

    // ---- body shape and skin ----

    /**
     * Sets body shape values (`{ belly: 0.6, height: 1.1 }`), each kept within its `min` and
     * `max`; values left out stay. Bones get longer or wider, soft parts round out, clothes on them
     * follow, and the feet stay on the ground. False when a name isn't one of the rig's shapes
     * (it is left out); while the rig is on its way every name is kept until the data says.
     */
    public set_shape(values: Readonly<Record<string, number>>): boolean {
        this.refresh();
        let is_whole = true;
        let is_changed = false;
        const shapes = this.rig.shapes;
        for (const [name, value] of Object.entries(values)) {
            if (typeof value !== "number" || !Number.isFinite(value)) {
                is_whole = false;
                continue;
            }
            const shape = shapes.get(name);
            if (shape === undefined && this.rig.has_data) {
                is_whole = false;
                continue;
            }
            const kept =
                shape === undefined
                    ? value
                    : Math.min(shape.max, Math.max(shape.min, value));
            if ((this.shape_values.get(name) ?? 0) === kept) {
                continue;
            }
            if (kept === 0) {
                this.shape_values.delete(name);
            } else {
                this.shape_values.set(name, kept);
            }
            is_changed = true;
        }
        if (is_changed) {
            this.apply_shape();
            this.skeleton.update();
            this.look_version += 1;
        }
        return is_whole;
    }

    /** Every shape value back to 0: the rig as drawn. */
    public reset_shape(): void {
        if (this.shape_values.size > 0) {
            this.shape_values.clear();
            this.apply_shape();
            this.skeleton.update();
            this.look_version += 1;
        }
    }

    /** The body shape values: every shape of the rig (0 for those at rest), as plain data. */
    public get shape(): Readonly<Record<string, number>> {
        this.refresh();
        const out: Record<string, number> = {};
        for (const name of this.rig.shapes.keys()) {
            out[name] = this.shape_values.get(name) ?? 0;
        }
        for (const [name, value] of this.shape_values) {
            out[name] = value;
        }
        return out;
    }

    /**
     * Colours a tint layer of the skin (`"skin"`, `"hair"`): the colour multiplied into the layer's
     * grey shading, laid over the part. Null (or `""`) takes the tint off: the colours as drawn.
     */
    public set_tint(layer: string, colour: string | null): void {
        const before = this.tint_map.get(layer) ?? null;
        const after = colour === null || colour === "" ? null : colour;
        if (before === after) {
            return;
        }
        if (after === null) {
            this.tint_map.delete(layer);
        } else {
            this.tint_map.set(layer, after);
        }
        this.look_version += 1;
    }

    /** The tints by layer, as plain data. */
    public get tints(): Readonly<Record<string, string>> {
        return Object.fromEntries(this.tint_map);
    }

    /** The mark sheets this puppet takes marks from, in the order `use_marks()` gave them. */
    public get mark_sheets(): readonly MarkSheet[] {
        return this.mark_sheet_list;
    }

    /** Takes marks from a sheet from now on (one still loading is fine; its marks wait for it). */
    public use_marks(sheet: MarkSheet): void {
        if (!this.mark_sheet_list.includes(sheet)) {
            this.mark_sheet_list.push(sheet);
            this.look_version += 1;
        }
    }

    /** A mark picture of the puppet's sheets by id; null for none (yet). */
    public find_mark(id: string): MarkPicture | null {
        for (const sheet of this.mark_sheet_list) {
            const mark = sheet.mark(id);
            if (mark !== null) {
                return mark;
            }
        }
        return null;
    }

    /**
     * Puts a mark (`"anchor"` of a mark sheet) on a slot's part (`"upper_arm_r"`), at `x`, `y` in
     * that part's bone frame (rig units, x along the bone from its joint), turned by `angle`
     * degrees on the bone (default: upright on the screen at the rest pose) and `size` times as
     * large. It moves, turns and bends with the part and is clipped to it. Answers its number in
     * `marks`; -1, and nothing changes, for a slot the rig doesn't have or a mark none of the
     * sheets has (a sheet still loading is fine).
     */
    public add_mark(
        id: string,
        slot: string,
        placement: MarkPlacement = {},
    ): number {
        this.refresh();
        const mark = this.checked_mark(id, slot, placement);
        if (mark === null) {
            return -1;
        }
        this.mark_list.push(mark);
        this.look_version += 1;
        return this.mark_list.length - 1;
    }

    /** Moves, turns, sizes or recolours mark `index` (what `placement` names; the rest stays). False for no such mark. */
    public move_mark(
        index: number,
        placement: MarkPlacement,
        slot?: string,
    ): boolean {
        const before = this.mark_list[index];
        if (before === undefined) {
            return false;
        }
        const mark = this.checked_mark(before.id, slot ?? before.slot, {
            ...before,
            ...placement,
        });
        if (mark === null) {
            return false;
        }
        this.mark_list[index] = mark;
        this.look_version += 1;
        return true;
    }

    /** Takes mark `index` off (the later ones move up one). False for no such mark. */
    public remove_mark(index: number): boolean {
        if (index < 0 || index >= this.mark_list.length) {
            return false;
        }
        this.mark_list.splice(index, 1);
        this.look_version += 1;
        return true;
    }

    /** Takes every mark off. */
    public clear_marks(): void {
        if (this.mark_list.length > 0) {
            this.mark_list = [];
            this.look_version += 1;
        }
    }

    /** The marks, in the order they were put on (later ones over earlier ones), as plain data. */
    public get marks(): readonly MarkData[] {
        return this.mark_list.map((mark) => ({ ...mark }));
    }

    /** Puts these marks on in place of the ones before. False when one was left out (an unknown slot or mark). */
    public set_marks(marks: readonly MarkData[]): boolean {
        this.refresh();
        const list: MarkData[] = [];
        let is_whole = true;
        for (const mark of marks) {
            const checked =
                typeof mark === "object" && mark !== null
                    ? this.checked_mark(mark.id, mark.slot, mark)
                    : null;
            if (checked === null) {
                is_whole = false;
                continue;
            }
            list.push(checked);
        }
        this.mark_list = list;
        this.look_version += 1;
        return is_whole;
    }

    /**
     * Where mark `index` sits now: in the puppet's own space, or, given where and how `draw()`
     * draws the puppet, in the context's. Null for no such mark. After `update()`.
     */
    public mark_point(
        index: number,
        x = 0,
        y = 0,
        options: PuppetDrawOptions = {},
        out: PuppetPoint = { x: 0, y: 0 },
    ): PuppetPoint | null {
        this.refresh();
        const mark = this.mark_list[index];
        const slot = mark === undefined ? -1 : this.rig.slot_index(mark.slot);
        if (mark === undefined || slot < 0) {
            return null;
        }
        const bone = this.rig.slots[slot].bone;
        const point = this.mark_spot(bone, mark, this.tip);
        const scale = options.scale ?? 1;
        out.x = x + point.x * (options.flip_x === true ? -scale : scale);
        out.y = y + point.y * scale;
        return out;
    }

    /**
     * The mark on top at a point of the puppet's own space (`to_local()`), within `within` units of
     * its middle; -1 for none. For picking a mark up with a pointer.
     */
    public mark_at(x: number, y: number, within: number): number {
        this.refresh();
        let best = -1;
        let best_distance = within;
        for (let index = this.mark_list.length - 1; index >= 0; index--) {
            const point = this.mark_point(index);
            if (point === null) {
                continue;
            }
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance < best_distance) {
                best = index;
                best_distance = distance;
            }
        }
        return best;
    }

    /**
     * A point of the puppet's own space in a slot's bone frame, as `add_mark()` takes it (rig
     * units, x along the bone): where a mark dropped there goes. Null for a slot the rig doesn't have.
     */
    public to_part(slot: string, x: number, y: number): PuppetPoint | null {
        this.refresh();
        const index = this.rig.slot_index(slot);
        if (index < 0) {
            return null;
        }
        const bone = this.rig.slots[index].bone;
        const point = this.skeleton.local_point(bone, x, y);
        const deformed = this.part_mesh_point(index, point);
        return deformed ?? point;
    }

    /** The angle (degrees on the bone) that shows a mark upright on the screen in the pose now. */
    public upright_angle(slot: string): number {
        this.refresh();
        const index = this.rig.slot_index(slot);
        if (index < 0) {
            return 0;
        }
        return -this.skeleton.world_rotation(this.rig.slots[index].bone);
    }

    /**
     * The whole character as plain data: the skin's name, the shape values that aren't 0, the
     * tints, the marks and the outfit. Save it as it is (`SaveSlots`), or export it as a file.
     */
    public get character(): CharacterData {
        this.refresh();
        const shape: Record<string, number> = {};
        for (const [name, value] of this.shape_values) {
            shape[name] = value;
        }
        const skin =
            this.worn?.name ??
            (typeof this.skin_source === "string"
                ? this.skin_source
                : undefined);
        return {
            ...(skin === undefined ? {} : { skin }),
            shape,
            tints: this.tints,
            marks: this.marks,
            outfit: this.outfit,
        };
    }

    /**
     * Becomes the character in the data, in place of the one before: its skin (one of the rig's
     * by name), shape, tints, marks and outfit; a part left out goes back to plain (no marks, no
     * tints, shape 0, nothing worn). False when something didn't fit (an unknown skin, shape,
     * slot, mark or piece); the rest is taken.
     */
    public set_character(data: CharacterData): boolean {
        if (typeof data !== "object" || data === null) {
            return false;
        }
        let is_whole = true;
        if (typeof data.skin === "string" && data.skin !== this.worn?.name) {
            is_whole = this.set_skin(data.skin) && is_whole;
        }
        this.shape_values.clear();
        this.apply_shape();
        this.look_version += 1;
        is_whole = this.set_shape(data.shape ?? {}) && is_whole;
        this.skeleton.update();
        this.tint_map.clear();
        for (const [layer, colour] of Object.entries(data.tints ?? {})) {
            if (typeof colour === "string") {
                this.tint_map.set(layer, colour);
            } else {
                is_whole = false;
            }
        }
        is_whole =
            this.set_marks(Array.isArray(data.marks) ? data.marks : []) &&
            is_whole;
        is_whole = this.set_outfit(data.outfit ?? {}) && is_whole;
        return is_whole;
    }

    /** A mark checked against the rig and the sheets, with its angle filled in; null when it can't be worn. */
    private checked_mark(
        id: string,
        slot: string,
        placement: MarkPlacement,
    ): MarkData | null {
        if (typeof id !== "string" || typeof slot !== "string") {
            return null;
        }
        const slot_index = this.rig.slot_index(slot);
        if (this.rig.has_data && slot_index < 0) {
            return null;
        }
        const is_loading = this.mark_sheet_list.some(
            (sheet) => !sheet.has_data,
        );
        if (this.find_mark(id) === null && !is_loading) {
            return null;
        }
        const x = placement.x ?? 0;
        const y = placement.y ?? 0;
        const size = placement.size ?? 1;
        let angle = placement.angle;
        if (angle === undefined) {
            angle =
                slot_index < 0
                    ? 0
                    : -this.rest_rotation(this.rig.slots[slot_index].bone);
        }
        if (![x, y, size, angle].every(Number.isFinite) || size <= 0) {
            return null;
        }
        const mark: { -readonly [key in keyof MarkData]: MarkData[key] } = {
            id,
            slot,
            x,
            y,
            angle,
            size,
        };
        if (typeof placement.tint === "string" && placement.tint !== "") {
            mark.tint = placement.tint;
        }
        if (placement.blend === "multiply" || placement.blend === "normal") {
            mark.blend = placement.blend;
        }
        if (
            typeof placement.opacity === "number" &&
            placement.opacity >= 0 &&
            placement.opacity <= 1
        ) {
            mark.opacity = placement.opacity;
        }
        if (placement.flip === true) {
            mark.flip = true;
        }
        return mark;
    }

    /** A bone's angle in the rest pose. */
    private rest_rotation(bone: number): number {
        const rest = this.rig.make_skeleton();
        return rest.world_rotation(bone);
    }

    /** Where a mark's middle is in the puppet's space now, the part's moved mesh included. */
    private mark_spot(
        bone: number,
        mark: MarkData,
        out: PuppetPoint,
    ): PuppetPoint {
        let x = mark.x;
        let y = mark.y;
        const slot = this.rig.slot_index(mark.slot);
        const moved = this.moved_point(slot, x, y);
        if (moved !== null) {
            x = moved.x;
            y = moved.y;
        }
        return this.skeleton.world_point(bone, x, y, out);
    }

    /**
     * A point of a skin part's bone frame moved by the part's mesh for the shape now (where it is
     * drawn); null when the part has no moving mesh.
     */
    private moved_point(
        slot: number,
        x: number,
        y: number,
    ): PuppetPoint | null {
        const skin = this.worn;
        if (skin === null || slot < 0 || this.shape_values.size === 0) {
            return null;
        }
        const entry = this.order_for(skin).find(
            (each) =>
                each.piece === null && each.name === this.rig.slots[slot].name,
        );
        if (entry === undefined) {
            return null;
        }
        const mesh = this.mesh_of(entry);
        if (mesh === null || !mesh.moves_for(this.shape_values)) {
            return null;
        }
        const m = entry.transform;
        const determinant = m[0] * m[3] - m[1] * m[2];
        const u = (m[3] * (x - m[4]) - m[2] * (y - m[5])) / determinant;
        const v = (m[0] * (y - m[5]) - m[1] * (x - m[4])) / determinant;
        // The grid's own point there, moved as the mesh moves it.
        const move = mesh.offset_at(this.shape_values, u, v);
        const moved_u = u + move.u;
        const moved_v = v + move.v;
        return {
            x: m[0] * moved_u + m[2] * moved_v + m[4],
            y: m[1] * moved_u + m[3] * moved_v + m[5],
        };
    }

    /** A point of the puppet's space on a skin part with a moved mesh, back where it came from on the part (bone frame). */
    private part_mesh_point(
        slot: number,
        point: PuppetPoint,
    ): PuppetPoint | null {
        const skin = this.worn;
        if (skin === null || this.shape_values.size === 0) {
            return null;
        }
        const entry = this.order_for(skin).find(
            (each) =>
                each.piece === null && each.name === this.rig.slots[slot].name,
        );
        if (entry === undefined) {
            return null;
        }
        const mesh = this.mesh_of(entry);
        if (mesh === null || !mesh.moves_for(this.shape_values)) {
            return null;
        }
        const m = entry.transform;
        const determinant = m[0] * m[3] - m[1] * m[2];
        const u =
            (m[3] * (point.x - m[4]) - m[2] * (point.y - m[5])) / determinant;
        const v =
            (m[0] * (point.y - m[5]) - m[1] * (point.x - m[4])) / determinant;
        const source = mesh.to_source(mesh.deform(this.shape_values), u, v);
        if (source === null) {
            return null;
        }
        return {
            x: m[0] * source.u + m[2] * source.v + m[4],
            y: m[1] * source.u + m[3] * source.v + m[5],
        };
    }

    /** The shape values into the skeleton's pose scales. */
    private apply_shape(): void {
        const skeleton = this.skeleton;
        skeleton.scale_x.fill(1);
        skeleton.scale_y.fill(1);
        for (const [name, value] of this.shape_values) {
            const shape = this.rig.shapes.get(name);
            if (shape === undefined) {
                continue;
            }
            for (const scale of shape.bones) {
                if (scale.bone < skeleton.count) {
                    skeleton.scale_x[scale.bone] += value * scale.length;
                    skeleton.scale_y[scale.bone] += value * scale.width;
                }
            }
        }
        for (let index = 0; index < skeleton.count; index++) {
            skeleton.scale_x[index] = Math.max(0.05, skeleton.scale_x[index]);
            skeleton.scale_y[index] = Math.max(0.05, skeleton.scale_y[index]);
        }
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
     * The box around the parts as they are drawn now, in the puppet's own space (`draw()` puts
     * the root at its `x`, `y`): of every part (default), of the skin's (`"body"`), of the clothes
     * (`"clothes"`) or of one worn piece (its id). Rectangles, not pixels. Null when there is none.
     * For framing a piece in a drawer, a hit area, a camera.
     */
    public bounds(of?: string): PuppetBox | null {
        this.refresh();
        const skin = this.worn;
        if (skin === null) {
            return null;
        }
        if (skin.soft !== null && (of === undefined || of === "body")) {
            // A soft skin: the box around its grid's points as they are now.
            const points = this.soft_points(skin.soft.cpu_cell_size);
            if (points === null || points.length === 0) {
                return null;
            }
            let soft_left = Infinity;
            let soft_top = Infinity;
            let soft_right = -Infinity;
            let soft_bottom = -Infinity;
            for (let index = 0; index < points.length; index += 2) {
                soft_left = Math.min(soft_left, points[index]);
                soft_right = Math.max(soft_right, points[index]);
                soft_top = Math.min(soft_top, points[index + 1]);
                soft_bottom = Math.max(soft_bottom, points[index + 1]);
            }
            return {
                x: soft_left,
                y: soft_top,
                width: soft_right - soft_left,
                height: soft_bottom - soft_top,
            };
        }
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const entry of this.order_for(skin)) {
            const is_body = entry.piece === null;
            if (
                (of === "body" && !is_body) ||
                (of === "clothes" && is_body) ||
                (of !== undefined &&
                    of !== "body" &&
                    of !== "clothes" &&
                    entry.piece !== of)
            ) {
                continue;
            }
            const [a, b, c, d, e, f] = this.entry_matrix(entry);
            for (const [u, v] of [
                [0, 0],
                [entry.width, 0],
                [0, entry.height],
                [entry.width, entry.height],
            ]) {
                const x = a * u + c * v + e;
                const y = b * u + d * v + f;
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
            }
        }
        if (left === Infinity) {
            return null;
        }
        return { x: left, y: top, width: right - left, height: bottom - top };
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
        if (skin.soft !== null) {
            // A soft skin: the layer draws it (on the graphics card, or triangle by triangle).
            const layer = options.layer ?? SoftLayer.for_context(context);
            const added = layer.add(this, context, x, y, options);
            if (options.layer === undefined) {
                layer.draw(context);
            }
            return added;
        }
        const order = this.order_for(skin);
        const looks = this.looks_for(order);
        const is_direct = options.direct_meshes === true;
        const skeleton = this.skeleton;
        const is_scaled = skeleton.is_scaled;
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
            if (
                picture === null ||
                (options.only_clothes === true && part.piece === null)
            ) {
                continue;
            }
            const at = part.bone * 6;
            // The bone in the context's frame.
            let wa = world[at];
            let wb = world[at + 1];
            let wc = world[at + 2];
            let wd = world[at + 3];
            const we = world[at + 4];
            const wf = world[at + 5];
            let m = part.transform;
            if (is_scaled) {
                const scale_x = skeleton.length_scale(part.bone);
                const scale_y = skeleton.width_scale(part.bone);
                if (part.on_anchor) {
                    // Hung on an anchor: the scale moves the anchor, the piece keeps its size.
                    m = shifted(
                        m,
                        (scale_x - 1) * part.anchor_x,
                        (scale_y - 1) * part.anchor_y,
                    );
                } else {
                    wa *= scale_x;
                    wb *= scale_x;
                    wc *= scale_y;
                    wd *= scale_y;
                }
            }
            const ba = pa * wa + pc * wb;
            const bb = pb * wa + pd * wb;
            const bc = pa * wc + pc * wd;
            const bd = pb * wc + pd * wd;
            const be = pa * we + pc * wf + pe;
            const bf = pb * we + pd * wf + pf;
            const look = looks[index];
            if (look !== null && look.baked !== null && !is_direct) {
                // Its look, laid into a canvas once per change (with the others into one).
                const baked = look.baked;
                const packed = this.packed;
                const place = packed?.places[index] ?? null;
                m = shifted_in_part(m, baked.shift_x, baked.shift_y);
                context.setTransform(
                    ba * m[0] + bc * m[1],
                    bb * m[0] + bd * m[1],
                    ba * m[2] + bc * m[3],
                    bb * m[2] + bd * m[3],
                    ba * m[4] + bc * m[5] + be,
                    bb * m[4] + bd * m[5] + bf,
                );
                context.drawImage(
                    packed === null || place === null
                        ? baked.canvas
                        : packed.canvas,
                    place === null ? 0 : place[0],
                    place === null ? 0 : place[1],
                    baked.width,
                    baked.height,
                    0,
                    0,
                    baked.width,
                    baked.height,
                );
                continue;
            }
            const part_matrix: [
                number,
                number,
                number,
                number,
                number,
                number,
            ] = [
                ba * m[0] + bc * m[1],
                bb * m[0] + bd * m[1],
                ba * m[2] + bc * m[3],
                bb * m[2] + bd * m[3],
                ba * m[4] + bc * m[5] + be,
                bb * m[4] + bd * m[5] + bf,
            ];
            if (look !== null && look.mesh !== null && look.deformed !== null) {
                // No canvas to lay it into (or measuring): the mesh, triangle by triangle.
                look.mesh.draw(
                    context,
                    picture,
                    part.source_x,
                    part.source_y,
                    part.width,
                    part.height,
                    look.deformed,
                    part_matrix,
                );
                continue;
            }
            // The part on its bone.
            context.setTransform(...part_matrix);
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
        const slots = this.rig.slots;
        for (let index = below - 1; index >= 0; index--) {
            const part = parts[index];
            if (part === null) {
                continue;
            }
            const w = this.skeleton.bone_matrix(slots[index].bone, this.matrix);
            const m = part.transform;
            // The part's pixels in the puppet's space: the bone's frame (with its scale) times the part's.
            const a = w[0] * m[0] + w[2] * m[1];
            const b = w[1] * m[0] + w[3] * m[1];
            const c = w[0] * m[2] + w[2] * m[3];
            const d = w[1] * m[2] + w[3] * m[3];
            const e = w[0] * m[4] + w[2] * m[5] + w[4];
            const f = w[1] * m[4] + w[3] * m[5] + w[5];
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

    /** The bones as lines from joint to tip, joints as rings; on top of whatever is drawn (`debug`). */
    public draw_bones(
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
            this.jiggle.set_bones(this.rig.jiggle);
            this.worn = null;
            if (this.rig.has_data) {
                for (const name of [...this.shape_values.keys()]) {
                    if (!this.rig.shapes.has(name)) {
                        this.shape_values.delete(name);
                    }
                }
            }
            this.apply_shape();
            this.look_version += 1;
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
                        piece: null,
                        bone: slots[index].bone,
                        source_x: part.source_x,
                        source_y: part.source_y,
                        width: part.width,
                        height: part.height,
                        transform: part.transform,
                        picture: skin,
                        on_anchor: false,
                        anchor_x: 0,
                        anchor_y: 0,
                        layers: part.layers ?? null,
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
            piece: piece.id,
            bone,
            source_x: part.source_x,
            source_y: part.source_y,
            width: part.width,
            height: part.height,
            transform,
            picture: piece.wardrobe,
            on_anchor: anchor !== undefined,
            anchor_x: anchor?.x ?? 0,
            anchor_y: anchor?.y ?? 0,
            layers: null,
        };
    }

    /** An entry's frame in the puppet's space: its bone (with the bone's scale) times its own transform. */
    private entry_matrix(
        entry: DrawEntry,
    ): [number, number, number, number, number, number] {
        const skeleton = this.skeleton;
        let m = entry.transform;
        const w = this.matrix;
        if (entry.on_anchor) {
            const at = entry.bone * 6;
            for (let index = 0; index < 6; index++) {
                w[index] = skeleton.world[at + index];
            }
            m = shifted(
                m,
                (skeleton.length_scale(entry.bone) - 1) * entry.anchor_x,
                (skeleton.width_scale(entry.bone) - 1) * entry.anchor_y,
            );
        } else {
            skeleton.bone_matrix(entry.bone, w);
        }
        return [
            w[0] * m[0] + w[2] * m[1],
            w[1] * m[0] + w[3] * m[1],
            w[0] * m[2] + w[2] * m[3],
            w[1] * m[2] + w[3] * m[3],
            w[0] * m[4] + w[2] * m[5] + w[4],
            w[1] * m[4] + w[3] * m[5] + w[5],
        ];
    }

    /** The mesh of an entry's part (from the rig's shape pushes on its bone); null for one on an anchor or without pushes. */
    private mesh_of(entry: DrawEntry): PartMesh | null {
        const known = this.meshes.get(entry);
        if (known !== undefined && known.version === this.rig.version) {
            return known.mesh;
        }
        const mesh = entry.on_anchor
            ? null
            : PartMesh.for_part(
                  entry.width,
                  entry.height,
                  entry.transform,
                  entry.bone,
                  this.rig.shapes.values(),
                  this.mesh_cell,
              );
        this.meshes.set(entry, { version: this.rig.version, mesh });
        return mesh;
    }

    /**
     * How each entry of the drawing order looks now: null for its plain part, else its look laid
     * into a canvas (or its moved mesh). Made again only for entries whose shape values, tints,
     * marks or pictures changed, never per frame.
     */
    private looks_for(order: DrawEntry[]): (EntryLook | null)[] {
        if (this.looks_are_current(order)) {
            return this.looks;
        }
        const has_look =
            this.shape_values.size > 0 ||
            this.tint_map.size > 0 ||
            this.mark_list.length > 0;
        if (this.baker === null || this.baker_canvas !== this.make_canvas) {
            this.baker = new PuppetBaker(this.make_canvas);
            this.baker_canvas = this.make_canvas;
            this.entry_looks = new WeakMap();
        }
        const baker = this.baker;
        this.looks = order.map((entry) =>
            has_look ? this.look_of(entry, baker) : null,
        );
        this.packed = pack_looks(
            this.looks.map((look) => look?.baked ?? null),
            this.make_canvas,
            this.packed?.canvas ?? null,
        );
        this.looks_key = [
            order,
            this.look_version,
            ...order.map((entry) => entry.picture.image),
            ...this.mark_sheet_list.flatMap((sheet) => [
                sheet.version,
                sheet.image,
            ]),
        ];
        return this.looks;
    }

    /** The looks were made for this order, these changes and these pictures (checked without making anything). */
    private looks_are_current(order: DrawEntry[]): boolean {
        const key = this.looks_key;
        const sheets = this.mark_sheet_list;
        if (
            key.length !== 2 + order.length + sheets.length * 2 ||
            key[0] !== order ||
            key[1] !== this.look_version ||
            this.baker_canvas !== this.make_canvas
        ) {
            return false;
        }
        for (let index = 0; index < order.length; index++) {
            if (key[2 + index] !== order[index].picture.image) {
                return false;
            }
        }
        for (let index = 0; index < sheets.length; index++) {
            const at = 2 + order.length + index * 2;
            if (
                key[at] !== sheets[index].version ||
                key[at + 1] !== sheets[index].image
            ) {
                return false;
            }
        }
        return true;
    }

    /** One entry's look: its moved mesh, the tints of its layers and its marks; null when it has none. */
    private look_of(entry: DrawEntry, baker: PuppetBaker): EntryLook | null {
        const mesh = this.mesh_of(entry);
        const moves = mesh !== null && mesh.moves_for(this.shape_values);
        const layers: LookLayer[] = [];
        if (entry.layers !== null) {
            for (const [layer, [x, y]] of entry.layers) {
                const tint = this.tint_map.get(layer);
                if (tint !== undefined) {
                    layers.push({ x, y, tint });
                }
            }
        }
        const marks: LookMark[] = [];
        if (entry.piece === null) {
            for (const mark of this.mark_list) {
                const look =
                    mark.slot === entry.name
                        ? this.look_mark(entry, mark)
                        : null;
                if (look !== null) {
                    marks.push(look);
                }
            }
        }
        if (!moves && layers.length === 0 && marks.length === 0) {
            return null;
        }
        const values =
            moves && mesh !== null
                ? [...mesh.weights.keys()].map(
                      (name) => this.shape_values.get(name) ?? 0,
                  )
                : null;
        const signature = JSON.stringify([
            values,
            layers,
            marks.map((mark) => [
                mark.picture.id,
                mark.picture.sheet.image !== null,
                mark.transform,
                mark.tint,
                mark.blend,
                mark.opacity,
                mark.clip,
            ]),
            entry.picture.image !== null,
        ]);
        const before = this.entry_looks.get(entry);
        if (before !== undefined && before.signature === signature) {
            return before;
        }
        const deformed =
            moves && mesh !== null ? mesh.deform(this.shape_values) : null;
        const image = entry.picture.image;
        let baked: BakedLook | null = null;
        if (image !== null) {
            baked = baker.bake(
                {
                    image,
                    source_x: entry.source_x,
                    source_y: entry.source_y,
                    width: entry.width,
                    height: entry.height,
                    layers,
                    marks,
                    mesh: moves ? mesh : null,
                    deformed,
                },
                before?.baked ?? null,
            );
        }
        const look: EntryLook = {
            signature,
            baked,
            mesh: moves ? mesh : null,
            deformed,
        };
        this.entry_looks.set(entry, look);
        return look;
    }

    /** A mark as it is laid onto an entry's part: from its picture's pixels to the part's. */
    private look_mark(entry: DrawEntry, mark: MarkData): LookMark | null {
        const picture = this.find_mark(mark.id);
        if (picture === null) {
            return null;
        }
        const radians = ((mark.angle ?? 0) * Math.PI) / 180;
        const size = (mark.size ?? 1) * picture.unit;
        const flip = mark.flip === true ? -1 : 1;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        // The mark's pixels into the bone's frame: its pivot on its place, turned and sized.
        const ta = cos * size;
        const tb = sin * size;
        const tc = -sin * size * flip;
        const td = cos * size * flip;
        const te = mark.x - ta * picture.pivot_x - tc * picture.pivot_y;
        const tf = mark.y - tb * picture.pivot_x - td * picture.pivot_y;
        // Then out of the bone's frame into the part's pixels.
        const m = entry.transform;
        const determinant = m[0] * m[3] - m[1] * m[2];
        if (determinant === 0) {
            return null;
        }
        const ia = m[3] / determinant;
        const ib = -m[1] / determinant;
        const ic = -m[2] / determinant;
        const id = m[0] / determinant;
        const ie = (m[2] * m[5] - m[3] * m[4]) / determinant;
        const iff = (m[1] * m[4] - m[0] * m[5]) / determinant;
        const layer = entry.layers?.get(picture.on);
        return {
            picture,
            transform: [
                ia * ta + ic * tb,
                ib * ta + id * tb,
                ia * tc + ic * td,
                ib * tc + id * td,
                ia * te + ic * tf + ie,
                ib * te + id * tf + iff,
            ],
            tint: mark.tint ?? null,
            blend: mark.blend ?? picture.blend,
            opacity: mark.opacity ?? picture.opacity,
            clip: layer ?? [entry.source_x, entry.source_y],
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

/** A part's transform moved by `x`, `y` in its bone's frame. */
function shifted(m: Float64Array, x: number, y: number): Float64Array {
    return Float64Array.of(m[0], m[1], m[2], m[3], m[4] + x, m[5] + y);
}

/** A part's transform for a picture that starts `x`, `y` of the part's own pixels off its top left. */
function shifted_in_part(m: Float64Array, x: number, y: number): Float64Array {
    return Float64Array.of(
        m[0],
        m[1],
        m[2],
        m[3],
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5],
    );
}
