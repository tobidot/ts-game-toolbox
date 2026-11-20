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
    /**
     * Body shape values by name (`height`, `belly`, ...; since step 40): each scales bones and
     * pushes the parts' soft meshes, 0 is the rig as drawn. `puppet.set_shape({ belly: 0.6 })`.
     */
    readonly shapes?: Readonly<Record<string, ShapeData>>;
    /**
     * Anchors that stand on the ground (the soles' heels and toes). With scaled bones (longer
     * legs) the body is raised or lowered so they stand where they would at shape 0: the hip
     * height follows the leg length, through every clip. Default: none.
     */
    readonly soles?: readonly string[];
    /**
     * Bones that lag behind and swing a little (ears, a belly, a tail; since step 41): a spring per
     * bone, stepped with the frame time and steady at any frame rate. `puppet.jiggle` switches it.
     */
    readonly jiggle?: Readonly<Record<string, JiggleData>>;
    /**
     * How a hand-drawn character was rigged (since step 43, `rig_from_picture()`): its skeleton
     * template, the joints placed on the picture and the ground line, so an editor opens the built
     * character again (`drawing_from_rig()`). Games ignore it.
     */
    readonly drawing?: RigDrawingData;
    /**
     * Named bone masks for clip layers (since step 44): each a list of bones, every one with its
     * children (`{ "upper_body": ["torso"] }`). `PuppetLayers.mask()` adds the ones made from the
     * bone tree (`lower_body`, `upper_body`, `arm_r`, ...) where the rig names none.
     */
    readonly masks?: Readonly<Record<string, readonly string[]>>;
    /**
     * Constraints by name (since step 44): an aim, a look or a reach that turns bones towards a
     * target after the clips (`puppet.constraints.aim("arm_r", x, y)`). Names a rig leaves out
     * are made from the bone names where they can be.
     */
    readonly constraints?: Readonly<Record<string, ConstraintData>>;
    /**
     * How far bones may turn on their parents in a ragdoll (since step 44): `[low, high]` degrees as
     * a clip's rotation keys. Bones left out get the range their clips turn them through, plus 25.
     */
    readonly limits?: Readonly<Record<string, readonly [number, number]>>;
}

/**
 * A constraint of a rig (since step 44): turns bones towards a target the game sets each frame.
 * `weight` (default 1) is how much of the turn shows, `enabled` (default true) whether it starts on.
 */
export type ConstraintData =
    | {
          /** Turns a chain so the line of an anchor (a hand) goes through the target. */
          readonly kind: "aim";
          /** The bones that turn, from the body outwards (spine, upper arm, forearm). */
          readonly chain: readonly string[];
          /** The anchor whose line (from its point, along its angle) is aimed. */
          readonly anchor: string;
          /** How the turn is shared along the chain. Default: equally. */
          readonly weights?: readonly number[];
          /** Per bone, `[low, high]` degrees it may turn away from the clip's pose. Default ±180. */
          readonly limits?: readonly (readonly [number, number])[];
          readonly weight?: number;
          readonly enabled?: boolean;
      }
    | {
          /** Turns one bone so its axis points at the target: a head. */
          readonly kind: "look_at";
          readonly bone: string;
          /**
           * Degrees from the bone's line to where it looks. Default: the way the puppet faces at rest
           * (a head bone pointing up looks ahead).
           */
          readonly axis?: number;
          /** `[low, high]` degrees it may turn away from the clip's pose. Default ±45. */
          readonly limits?: readonly [number, number];
          readonly weight?: number;
          readonly enabled?: boolean;
      }
    | {
          /** Puts the end of two bones (a foot, a hand) on the target: two-bone IK. */
          readonly kind: "reach";
          readonly upper: string;
          /** The upper bone's child. */
          readonly lower: string;
          /** The end on the lower bone: an anchor on it, or `[x, y]` in its frame. Default its tip. */
          readonly end?: string | readonly [number, number];
          /** 1 or -1, the side the middle joint bends to. Default: the side it bends to in the pose. */
          readonly bend?: number;
          readonly weight?: number;
          readonly enabled?: boolean;
      };

/** A drawn character's rigging, kept in its rig (since step 43). */
export interface RigDrawingData {
    /** The skeleton template's name (`zweibeiner`, `vierbeiner`, `wurm`, `flieger`). */
    readonly template: string;
    /** The joints in the drawn picture's pixels. */
    readonly joints: Readonly<Record<string, readonly [number, number]>>;
    /** The ground line's y in the picture's pixels. */
    readonly ground: number;
    /** The drawn picture's size (every layer's). */
    readonly size: readonly [number, number];
    /** The layers back to front: the bones each may follow, and whether its bone map was painted by hand. */
    readonly layers: readonly {
        readonly name: string;
        readonly bones?: readonly string[];
        readonly map?: boolean;
    }[];
}

/**
 * A bone that jiggles: its tip follows where the clip puts it through a spring, so it lags behind a
 * turn and swings back. The lag turns the bone, at most `max` degrees either way.
 */
export interface JiggleData {
    /** Seconds for a swing to die down to half. Default 0.2. */
    readonly half_life?: number;
    /** How much of the lag turns the bone: 0 none, 1 all of it. Default 1. */
    readonly strength?: number;
    /** The most it turns the bone either way, in degrees. Default 30. */
    readonly max?: number;
}

/**
 * One body shape value: how far it goes, the bones it scales and the soft pushes it gives the
 * parts on its bones. At value `v` a bone is `1 + v * length` times as long and `1 + v * width`
 * times as wide (summed over the values), and a point of a part moves by `v` times its push.
 */
export interface ShapeData {
    /** What a game shows ("Bauch"). Default: the name. */
    readonly title?: string;
    /** Default -1. */
    readonly min?: number;
    /** Default 1. */
    readonly max?: number;
    /** Per bone `[length, width]`: the scale it adds per unit of the value. */
    readonly bones?: Readonly<Record<string, readonly [number, number]>>;
    /** Soft pushes: the parts on these bones are drawn as meshes whose points move. */
    readonly pushes?: readonly ShapePushData[];
}

/**
 * A soft push on the parts of one bone, in the bone's frame (x along the bone from its joint, y
 * across it, rig units). A point at `(x, y)` moves at value 1 by `weight * [push[0], push[1] + swell * y]`,
 * where the weight is `along`'s trapezoid at x times `across`'s ramp at y. Every part on the bone
 * moves alike: the skin's, the clothes' and the marks on them, so a coat stays over a belly.
 */
export interface ShapePushData {
    readonly bone: string;
    /**
     * `[a, b, c, d]` along the bone: no weight before `a` and after `d`, full from `b` to `c`,
     * smooth in between. Default: the whole bone and well past its ends.
     */
    readonly along?: readonly [number, number, number, number];
    /**
     * `[from, to]` across the bone: no weight at `from`, full at `to` and beyond (`to` below
     * `from` turns the other way). Default: full everywhere.
     */
    readonly across?: readonly [number, number];
    /** How far a point with full weight moves at value 1: `[along, across]`. Default `[0, 0]`. */
    readonly push?: readonly [number, number];
    /** Across the bone a point moves by its distance from the bone's line times this (a fatter limb). Default 0. */
    readonly swell?: number;
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
    /** Its rest scale along (`scale_x`) and across (`scale_y`) the bone. Default 1. */
    readonly scale_x?: number;
    readonly scale_y?: number;
}

/** A named place in the drawing order, on a bone. */
export interface SlotData {
    readonly name: string;
    readonly bone: string;
}

/** A skin: one part per slot (a slot without one draws nothing), or a soft skin. */
export interface SkinData {
    readonly attachments: Readonly<Record<string, AttachmentData>>;
    /** Atlas pixels per unit. Default 1; a sharper atlas of the same puppet says 2. */
    readonly resolution?: number;
    /**
     * A soft skin (since step 41): the creature as whole pictures in its rest pose, covered by a
     * fine grid whose points move with up to four bones each. A skin with `soft` draws it instead
     * of parts (its `attachments` may be empty).
     */
    readonly soft?: SoftSkinData;
}

/**
 * A soft skin as plain data: whole pictures of the creature in its rest pose (the rig's bones
 * at rest, no clip), drawn back to front, each with a bone map beside it in the same atlas. A
 * fine grid is laid over each picture where it has pixels; every grid point binds to up to four
 * bones, weighted by the bone map blurred a little, and moves with them (linear blend skinning).
 */
export interface SoftSkinData {
    /**
     * Back to front. One picture is the whole creature; a creature seen from the side with limbs
     * on both sides takes more (the far legs, the body, the near legs), so a leg never hides
     * the other in the picture.
     */
    readonly pictures: readonly SoftPictureData[];
    /** Each bone's flat colour in the bone maps (`"#d04040"`). */
    readonly colors?: Readonly<Record<string, string>>;
    /** The bones a point may bind to. Default: those with a colour, else every bone. */
    readonly bones?: readonly string[];
    /** The grid's spacing on the graphics card, in atlas pixels. Default 12. */
    readonly cell_size?: number;
    /** The grid's spacing when drawn on the CPU (triangle by triangle on canvas 2D). Default 32. */
    readonly cpu_cell_size?: number;
    /** How far the bone map is blurred, in atlas pixels: the width of the soft crossover at a joint. Default 8. */
    readonly blur?: number;
}

/** One picture of a soft skin: where it is in the atlas, its bone map, and where its root sits. */
export interface SoftPictureData {
    /** For people and errors (`"near"`). */
    readonly name?: string;
    /** `[x, y, width, height]` in the atlas's pixels. */
    readonly rect: readonly [number, number, number, number];
    /** The bone map: as large as `rect`, each pixel in its bone's colour. Without one, points bind by distance. */
    readonly map?: readonly [number, number, number, number];
    /** The pixel of the picture (from its top left) where the root sits at rest: the feet. */
    readonly origin: readonly [number, number];
    /** The bones this picture's points may bind to. Default: the skin's. */
    readonly bones?: readonly string[];
}

/** A picture part on its bone: a rectangle of the atlas, turned and placed by its pivot. */
export interface AttachmentData {
    /** `[x, y, width, height]` in the atlas's pixels. */
    readonly rect: readonly [number, number, number, number];
    /** The point of the part, from the rectangle's top left, that sits on the bone's joint. */
    readonly pivot: readonly [number, number];
    /** The part's angle on its bone, in degrees (a part drawn upright on a bone that points down: -90). */
    readonly rotation?: number;
    /**
     * Tint layers by name (`skin`, `hair`; since step 40): rectangles of the same size as `rect`
     * in the same atlas, the layer's pixels of the part in grey (its shading, white where fully
     * lit). `puppet.set_tint("skin", colour)` multiplies the colour into them and lays them over
     * the part: another colour with the shading kept.
     */
    readonly layers?: Readonly<
        Record<string, readonly [number, number, number, number]>
    >;
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
    /**
     * The bone's stretch along it (since step 41), 1 at rest: 1.2 is a fifth longer. A track that
     * keys `scale_x` and never `scale_y` keeps the area: `scale_y` is `1 / scale_x` (longer is thinner).
     */
    readonly scale_x?: number;
    /** The bone's stretch across it; alone it keeps the area as `scale_x` does. */
    readonly scale_y?: number;
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
    /**
     * Named points of the part, in its pixels from the rectangle's top left as `pivot` (since step
     * 44): a gun's `muzzle`, the `grip` a second hand holds. `puppet.piece_point()` says where they are.
     */
    readonly points?: Readonly<Record<string, readonly [number, number]>>;
}

/** What a puppet wears, as plain data: a piece id per place (`{ hat: "straw-hat" }`); a place may be left out. */
export type OutfitData = Readonly<Record<string, string>>;

/** A catalogue `rig` that is a wardrobe (pieces), not a puppet (bones). */
export function is_wardrobe_data(
    data: RigData | WardrobeData | MarkSheetData,
): data is WardrobeData {
    return (
        typeof data === "object" &&
        data !== null &&
        "pieces" in data &&
        !("bones" in data)
    );
}

/**
 * Marks for skins as plain data (since step 40): small pictures in one atlas (a mark sheet) that a
 * puppet wears on its parts, tattoos, scars, freckles. The shape of a catalogue entry's `rig` for
 * such a picture (`is_mark_sheet_data()` tells it from a puppet's and a wardrobe's). Marks belong
 * to no skeleton: any puppet takes them (`puppet.use_marks(sheet)`).
 */
export interface MarkSheetData {
    readonly marks: Readonly<Record<string, MarkPictureData>>;
    /** Atlas pixels per rig unit, as a skin's. Default 1. */
    readonly resolution?: number;
}

/** How a mark is laid onto the part: multiplied (ink, freckles: the shading shows through) or over it (a plaster). */
export type MarkBlend = "multiply" | "normal";

/** One mark's picture and how it is worn by default. */
export interface MarkPictureData {
    /** `[x, y, width, height]` in the mark sheet's pixels. */
    readonly rect: readonly [number, number, number, number];
    /** The point of the picture that sits on the mark's place. Default: its middle. */
    readonly pivot?: readonly [number, number];
    /** What a game shows ("Anker"). Default: the id. */
    readonly title?: string;
    /** A kind for a game to sort by (`tattoo`, `scar`, `freckles`, `birthmark`, `paint`, `plaster`). */
    readonly kind?: string;
    /** Default `multiply`. */
    readonly blend?: MarkBlend;
    /** Default 1. */
    readonly opacity?: number;
    /** The layer it is clipped to where the part has it (`skin`: ink never lands on a shirt). Default `skin`; `""` the part's outline. */
    readonly on?: string;
}

/**
 * A mark on a puppet, as plain data: which picture, on which slot's part, where in that part's
 * bone frame (rig units, x along the bone from its joint, y across), turned and sized. The same
 * data fits every skin of the skeleton.
 */
export interface MarkData {
    /** The picture's id in a mark sheet. */
    readonly id: string;
    /** The slot whose part wears it (`upper_arm_r`). */
    readonly slot: string;
    readonly x: number;
    readonly y: number;
    /** Degrees on the bone. Default 0. */
    readonly angle?: number;
    /** Default 1: the picture at its sheet's resolution. */
    readonly size?: number;
    /** A colour multiplied into the picture (an ink colour). Default none. */
    readonly tint?: string;
    /** Default: the picture's. */
    readonly blend?: MarkBlend;
    /** Default: the picture's. */
    readonly opacity?: number;
    /** Mirrored across the bone. Default false. */
    readonly flip?: boolean;
}

/**
 * A whole character as plain data (since step 40): the skin it wears, its body shape, the tints
 * of its layers, its marks and its outfit. `puppet.character` and `puppet.set_character(data)`;
 * save it as it is, or export it as a file another game loads.
 */
export interface CharacterData {
    /** The skin's name. */
    readonly skin?: string;
    /** Shape values by name; a value left out is 0. */
    readonly shape?: Readonly<Record<string, number>>;
    /** Colours by layer (`{ skin: "#c58c68" }`). */
    readonly tints?: Readonly<Record<string, string>>;
    readonly marks?: readonly MarkData[];
    readonly outfit?: OutfitData;
}

/** A catalogue `rig` that is a mark sheet (marks), not a puppet (bones) or a wardrobe (pieces). */
export function is_mark_sheet_data(
    data: RigData | WardrobeData | MarkSheetData,
): data is MarkSheetData {
    return (
        typeof data === "object" &&
        data !== null &&
        "marks" in data &&
        !("bones" in data) &&
        !("pieces" in data)
    );
}
