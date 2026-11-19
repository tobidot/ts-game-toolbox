import type { PuppetRig } from "./PuppetRig";
import { part_transform } from "./PuppetSkin";
import { PieceData, PiecePartData, WardrobeData } from "./RigData";

/** Where a piece's part goes in the drawing order, relative to a slot of the rig. */
export type PieceOrder = "in_front_of" | "behind" | "slot";

/** One part of a piece, ready to draw: its rectangle of the wardrobe's atlas and where it hangs. */
export interface PiecePart {
    /** The piece's id. */
    readonly piece: string;
    /** The part's name (`sleeve_upper_r`), or its number. */
    readonly name: string;
    /** The bone it covers; null when it hangs on an anchor. */
    readonly bone: string | null;
    /** The anchor it hangs on; null when it covers a bone. */
    readonly anchor: string | null;
    readonly order: PieceOrder;
    /** The slot `order` is about; null: the first slot on its bone, in front of it. */
    readonly order_slot: string | null;
    /** Among parts at the same spot: lower lies nearer the body. */
    readonly layer: number;
    /** Its number in the piece. */
    readonly index: number;
    readonly source_x: number;
    readonly source_y: number;
    readonly width: number;
    readonly height: number;
    /** Six numbers (`a, b, c, d, e, f`) from the part's pixels to its bone's or anchor's frame. */
    readonly transform: Float64Array;
}

/** A piece of a wardrobe, ready to wear. */
export interface WardrobePiece {
    readonly id: string;
    readonly place: string;
    /** What a game shows; the id when the data names nothing. */
    readonly title: string;
    readonly parts: readonly PiecePart[];
    /** The wardrobe it is in (its atlas). */
    readonly wardrobe: Wardrobe;
}

/**
 * Clothes and accessories for every puppet of one skeleton, in one atlas: a clothes atlas. Read
 * once from plain data (`WardrobeData`, the catalogue's `rig` of such a picture) and shared by every
 * puppet that uses it (`puppet.use_wardrobe(wardrobe)`, then `puppet.wear("straw-hat")`).
 *
 * Like a `PuppetRig`, a wardrobe may start empty and get its data (`set_data()`) and its picture
 * (`image`) later, in either order, as the shell's `references.wardrobe(name)` does.
 */
export class Wardrobe {
    /** Grows on each `set_data()`, so puppets know to read the wardrobe again. */
    public version = 0;
    /** The atlas; null until it arrives. */
    public image: CanvasImageSource | null = null;
    private wardrobe_data: WardrobeData | null = null;
    private place_map = new Map<string, number>();
    private piece_map = new Map<string, WardrobePiece>();

    /** A wardrobe from data (and its picture, now or later); throws on data that doesn't hold together. */
    public static from_data(
        data: WardrobeData,
        image: CanvasImageSource | null = null,
    ): Wardrobe {
        const wardrobe = new Wardrobe();
        wardrobe.set_data(data);
        wardrobe.image = image;
        return wardrobe;
    }

    /**
     * Reads the data. Throws with a clear message (a piece in a place the wardrobe doesn't have, a
     * part on neither a bone nor an anchor, or on both, two orders for one part, ...) and then keeps
     * what it had. Whether a piece fits a rig is `problems_on(rig, id)`'s question.
     */
    public set_data(data: WardrobeData): void {
        if (typeof data.skeleton !== "string" || data.skeleton === "") {
            throw new Error("a wardrobe names its skeleton");
        }
        const resolution = data.resolution ?? 1;
        if (!(resolution > 0)) {
            throw new Error("a wardrobe's resolution must be above 0");
        }
        const place_map = new Map<string, number>();
        for (const [place, layer] of Object.entries(data.places ?? {})) {
            if (!Number.isFinite(layer)) {
                throw new Error(`place "${place}": its layer must be a number`);
            }
            place_map.set(place, layer);
        }
        const piece_map = new Map<string, WardrobePiece>();
        for (const [id, piece] of Object.entries(data.pieces ?? {})) {
            piece_map.set(
                id,
                this.read_piece(id, piece, place_map, resolution),
            );
        }
        this.wardrobe_data = data;
        this.place_map = place_map;
        this.piece_map = piece_map;
        this.version += 1;
    }

    /** The data as given; null until it comes. */
    public get data(): WardrobeData | null {
        return this.wardrobe_data;
    }

    public get has_data(): boolean {
        return this.wardrobe_data !== null;
    }

    /** The data and the picture are both there. */
    public get is_ready(): boolean {
        return this.wardrobe_data !== null && this.image !== null;
    }

    /** The skeleton's name; null until the data comes. */
    public get skeleton_name(): string | null {
        return this.wardrobe_data?.skeleton ?? null;
    }

    /** The places by name with their layers. */
    public get places(): ReadonlyMap<string, number> {
        return this.place_map;
    }

    /** The pieces by id, in the data's order. */
    public get pieces(): ReadonlyMap<string, WardrobePiece> {
        return this.piece_map;
    }

    /** A piece by id; null for none. */
    public piece(id: string): WardrobePiece | null {
        return this.piece_map.get(id) ?? null;
    }

    /** The pieces worn in one place, in the data's order (a game's drawer). */
    public pieces_in(place: string): WardrobePiece[] {
        return [...this.piece_map.values()].filter(
            (piece) => piece.place === place,
        );
    }

    /**
     * What keeps a piece off a rig's puppets, in words (empty: it fits): another skeleton, a bone,
     * an anchor or a slot the rig doesn't have, a bone without a slot to be drawn by.
     */
    public problems_on(rig: PuppetRig, id: string): string[] {
        const piece = this.piece_map.get(id);
        if (piece === undefined) {
            return [`no piece "${id}"`];
        }
        return piece_problems(piece, rig);
    }

    private read_piece(
        id: string,
        piece: PieceData,
        places: ReadonlyMap<string, number>,
        resolution: number,
    ): WardrobePiece {
        if (!places.has(piece.place)) {
            throw new Error(
                `piece "${id}": the wardrobe has no place "${piece.place}"`,
            );
        }
        if (!Array.isArray(piece.parts) || piece.parts.length === 0) {
            throw new Error(`piece "${id}" has no parts`);
        }
        const layer = places.get(piece.place) ?? 0;
        const parts = piece.parts.map((part, index) =>
            read_part(id, part, index, layer, resolution),
        );
        return {
            id,
            place: piece.place,
            title: piece.title ?? id,
            parts,
            wardrobe: this,
        };
    }
}

function read_part(
    piece: string,
    part: PiecePartData,
    index: number,
    place_layer: number,
    resolution: number,
): PiecePart {
    const name = part.name ?? String(index);
    const where = `piece "${piece}", part "${name}"`;
    const has_bone = typeof part.bone === "string" && part.bone !== "";
    const has_anchor = typeof part.anchor === "string" && part.anchor !== "";
    if (has_bone === has_anchor) {
        throw new Error(`${where}: name either a bone or an anchor`);
    }
    const orders = (["in_front_of", "behind", "slot"] as const).filter(
        (key) => part[key] !== undefined,
    );
    if (orders.length > 1) {
        throw new Error(
            `${where}: one of in_front_of, behind or slot, not ${orders.join(" and ")}`,
        );
    }
    const rect = part.rect;
    const pivot = part.pivot;
    if (
        !Array.isArray(rect) ||
        rect.length !== 4 ||
        !rect.every(Number.isFinite) ||
        !Array.isArray(pivot) ||
        pivot.length !== 2 ||
        !pivot.every(Number.isFinite)
    ) {
        throw new Error(
            `${where}: rect [x, y, width, height] and pivot [x, y] must be numbers`,
        );
    }
    if (part.layer !== undefined && !Number.isFinite(part.layer)) {
        throw new Error(`${where}: layer must be a number`);
    }
    const order: PieceOrder = orders[0] ?? "in_front_of";
    return {
        piece,
        name,
        bone: has_bone ? (part.bone as string) : null,
        anchor: has_anchor ? (part.anchor as string) : null,
        order,
        order_slot: orders.length === 0 ? null : (part[order] as string),
        layer: part.layer ?? place_layer,
        index,
        source_x: rect[0],
        source_y: rect[1],
        width: rect[2],
        height: rect[3],
        transform: part_transform(pivot, part.rotation ?? 0, resolution),
    };
}

/** What keeps a piece off a rig (empty: it fits). */
export function piece_problems(piece: WardrobePiece, rig: PuppetRig): string[] {
    const problems: string[] = [];
    const theirs = piece.wardrobe.skeleton_name;
    const own = rig.skeleton_name;
    if (own === null) {
        return problems;
    }
    if (theirs !== null && theirs !== own) {
        return [
            `piece "${piece.id}" is made for the skeleton "${theirs}", not "${own}"`,
        ];
    }
    for (const part of piece.parts) {
        const where = `piece "${piece.id}", part "${part.name}"`;
        const bone = part_bone(part, rig);
        if (part.anchor !== null && bone < 0) {
            problems.push(`${where}: no anchor "${part.anchor}"`);
            continue;
        }
        if (part.bone !== null && bone < 0) {
            problems.push(`${where}: no bone "${part.bone}"`);
            continue;
        }
        if (part.order_slot !== null) {
            if (rig.slot_index(part.order_slot) < 0) {
                problems.push(`${where}: no slot "${part.order_slot}"`);
            }
        } else if (first_slot_on(rig, bone) < 0) {
            problems.push(
                `${where}: no slot on the bone "${rig.bone_names[bone]}" to be drawn by`,
            );
        }
    }
    return problems;
}

/** The bone a part hangs on in a rig (an anchor's bone); -1 for none. */
export function part_bone(part: PiecePart, rig: PuppetRig): number {
    if (part.anchor !== null) {
        return rig.anchors.get(part.anchor)?.bone ?? -1;
    }
    return rig.bone_index(part.bone ?? "");
}

/** The first slot (in drawing order) on a bone; -1 for none. */
export function first_slot_on(rig: PuppetRig, bone: number): number {
    return rig.slots.findIndex((slot) => slot.bone === bone);
}
