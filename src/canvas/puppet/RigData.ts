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
    /** Named points on bones (the soles' heel and toe; step 39 adds hands, head and belt). */
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

/** A point on a bone, in the bone's frame. */
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
