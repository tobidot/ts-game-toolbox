/**
 * A puppet as plain data: the shape of a catalogue entry's `rig` (dll-tce-assets 0.5.0), so an
 * entry feeds `PuppetRig.from_data()` as it is.
 *
 * Units are the atlas's pixels (a skin's `resolution` of them per unit, default 1), y points down, angles
 * are degrees and turn clockwise on the screen (from +x towards +y). The root bone sits where the
 * puppet stands, so `puppet.draw(context, x, y)` puts its feet at `x`, `y`.
 */
export interface RigData {
    /**
     * The skeleton's name. Two rigs with the same name have the same bones and slots, so one's
     * skin fits the other's puppet and both wear the same clips.
     */
    readonly skeleton: string;
    /** The way the pictures face (`"right"`); `draw(..., { flip_x })` mirrors them. */
    readonly facing?: "right" | "left";
    /** The rest pose's box around the root: `[x, y, width, height]`, for placing and hit areas. */
    readonly bounds?: readonly [number, number, number, number];
    /** Parents before their children. */
    readonly bones: readonly BoneData[];
    /** Places for parts, in drawing order: the first is drawn first, behind the others. */
    readonly slots: readonly SlotData[];
    /** Sets of parts by name; a skin's parts lie in this rig's picture. */
    readonly skins: Readonly<Record<string, SkinData>>;
    /** The skin a new puppet wears. Default: the first. */
    readonly default_skin?: string;
    /**
     * Named points on bones, each with an angle: where a hat (`head_top`), a sword (`hand_r`) or a
     * bag (`back`) goes, and the soles' heel and toe.
     */
    readonly anchors?: Readonly<Record<string, AnchorData>>;
    readonly clips?: Readonly<Record<string, PuppetClipData>>;
    /** The clip a new puppet plays. Default: the first clip. */
    readonly default_clip?: string;
}

/** One bone: where it sits on its parent at rest, which way it points and how long it is. */
export interface BoneData {
    readonly name: string;
    /** None for the root. */
    readonly parent?: string;
    /** Where the bone's joint sits, in its parent's frame (along the parent is +x). Default 0. */
    readonly x?: number;
    readonly y?: number;
    /** Its angle on the parent's, in degrees, at rest. Default 0. */
    readonly rotation?: number;
    /** From the joint to where a child usually sits; for drawing the bones and picking them. */
    readonly length?: number;
}

/** A named place in the drawing order, on a bone. */
export interface SlotData {
    readonly name: string;
    readonly bone: string;
}

/** A skin: one part per slot (a slot without one draws nothing). */
export interface SkinData {
    readonly attachments: Readonly<Record<string, AttachmentData>>;
    /** Atlas pixels per unit. Default 1; a sharper atlas of the same puppet says 2. */
    readonly resolution?: number;
}

/** A picture part on its bone: a rectangle of the atlas, turned and placed by its pivot. */
export interface AttachmentData {
    /** `[x, y, width, height]` in the atlas's pixels. */
    readonly rect: readonly [number, number, number, number];
    /** The point of the part, from the rectangle's top left, that sits on the bone's joint. */
    readonly pivot: readonly [number, number];
    /** The part's angle on its bone, in degrees (a part drawn upright on a bone that points down: -90). */
    readonly rotation?: number;
}

/** A point on a bone, in the bone's frame, with an angle (a hand's grip, the top of the head). */
export interface AnchorData {
    readonly bone: string;
    readonly x: number;
    readonly y: number;
    /** Degrees on the bone. Default 0. */
    readonly rotation?: number;
}

/** How a value goes from one key to the next. */
export type PuppetEase = "linear" | "smooth" | "step";

/**
 * One key of a bone's track: at time `t`, the bone's turn and shift on its rest pose. A channel a
 * key leaves out is taken from the keys around it that have it.
 */
export interface PuppetKeyData {
    readonly t: number;
    /** Degrees added to the bone's rest rotation. */
    readonly rotation?: number;
    /** Added to the bone's rest position, in its parent's frame (the hip's walk bob). */
    readonly x?: number;
    readonly y?: number;
    /** From this key to the next. Default `linear`; `smooth` eases in and out; `step` holds. */
    readonly ease?: PuppetEase;
}

/** A clip as plain data: keys per bone over `length` seconds. */
export interface PuppetClipData {
    readonly length: number;
    /** Starts over at the end. Default false: it stops at its end, and `then` follows. */
    readonly loop?: boolean;
    readonly then?: string;
    /** Names for moments, in seconds as written (`{ "0.5": "step" }`). */
    readonly events?: Readonly<Record<string, string>>;
    /**
     * How fast a foot that stands slides back, in units per second: move the puppet this fast and
     * it doesn't skate. Leave out for clips on the spot.
     */
    readonly travel?: number;
    readonly tracks: Readonly<Record<string, readonly PuppetKeyData[]>>;
}

/**
 * A wardrobe as plain data: clothes and accessories for every puppet of one skeleton, in one atlas
 * of their own (a clothes atlas). The shape of a catalogue entry's `rig` for such a picture: it
 * names the skeleton and holds pieces instead of bones (`is_wardrobe_data()` tells them apart).
 */
export interface WardrobeData {
    /** The skeleton the pieces are made for: they fit every rig of that name. */
    readonly skeleton: string;
    /** The way the pictures face, as the rig's. */
    readonly facing?: "right" | "left";
    /**
     * The places a puppet wears one piece each in (`hat`, `top`, `shoes`), with their layer: of
     * two parts at the same spot in the drawing order, the lower layer lies nearer the body (a
     * shirt under a coat). Wardrobes that share places give them the same numbers.
     */
    readonly places: Readonly<Record<string, number>>;
    /** The pieces by id (`"straw-hat"`). */
    readonly pieces: Readonly<Record<string, PieceData>>;
    /** Atlas pixels per unit, as a skin's. Default 1. */
    readonly resolution?: number;
}

/** One piece of clothing or an accessory: the place it is worn in and its parts. */
export interface PieceData {
    /** One of the wardrobe's `places`. */
    readonly place: string;
    /** What a game shows ("Strohhut"). Default: the id. */
    readonly title?: string;
    /** A coat is a torso part, a sleeve per arm segment and its tails: each on its bone. */
    readonly parts: readonly PiecePartData[];
}

/**
 * A part of a piece: a picture part like a skin's (`rect`, `pivot`, `rotation`), on a bone or an
 * anchor, with its place in the drawing order.
 *
 * - **`bone`**: the part covers that bone (a sleeve on `upper_arm_r`); its pivot sits on the bone's
 *   joint, as a skin's part does.
 * - **`anchor`**: the part hangs on that anchor (a hat on `head_top`); its pivot sits on the anchor's
 *   point and it turns with the anchor's angle.
 *
 * The order is data: `in_front_of` a slot (just after it), `behind` a slot (just before it), or
 * `slot`: in that slot instead of the skin's part (a glove for a hand). Without any of them the part
 * is drawn just in front of the first slot on its bone.
 */
export interface PiecePartData {
    /** For people and for the drawing order's names (`"blue-coat:sleeve_upper_r"`). Default its number. */
    readonly name?: string;
    readonly bone?: string;
    readonly anchor?: string;
    /** `[x, y, width, height]` in the wardrobe atlas's pixels. */
    readonly rect: readonly [number, number, number, number];
    /** The point of the part, from the rectangle's top left, that sits on the joint or the anchor. */
    readonly pivot: readonly [number, number];
    /** Degrees on the bone (or on the anchor's angle). */
    readonly rotation?: number;
    readonly in_front_of?: string;
    readonly behind?: string;
    readonly slot?: string;
    /** Its layer instead of its place's. */
    readonly layer?: number;
}

/** What a puppet wears, as plain data: a piece id per place (`{ hat: "straw-hat" }`); a place may be left out. */
export type OutfitData = Readonly<Record<string, string>>;

/** A catalogue `rig` that is a wardrobe (pieces), not a puppet (bones). */
export function is_wardrobe_data(
    data: RigData | WardrobeData,
): data is WardrobeData {
    return (
        typeof data === "object" &&
        data !== null &&
        "pieces" in data &&
        !("bones" in data)
    );
}
