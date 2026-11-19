import { Puppet } from "./Puppet";
import { PuppetClip } from "./PuppetClip";
import { PuppetSkin } from "./PuppetSkin";
import { PuppetClipData, RigData } from "./RigData";
import { Skeleton } from "./Skeleton";

/** A place in the drawing order, on a bone (by number). */
export interface PuppetSlot {
    readonly name: string;
    readonly bone: number;
}

/** A point on a bone (by number), in the bone's frame. */
export interface PuppetAnchor {
    readonly name: string;
    readonly bone: number;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
}

/**
 * A puppet's rig, read once and shared by every puppet made from it: the bones, the slots in
 * drawing order, the skins, the anchors and the clips. `from_data(data, image)` reads a catalogue
 * entry's `rig` with its atlas; `puppet()` makes a puppet.
 *
 * A rig may also start empty and get its data (`set_data()`) and its picture (`image`) later, in
 * either order, as the shell's `references.puppet(name)` does; puppets made before wait and start
 * moving as soon as they can.
 */
export class PuppetRig {
    /** Grows on each `set_data()`, so puppets know to read the rig again. */
    public version = 0;
    private rig_data: RigData | null = null;
    private template: Skeleton | null = null;
    private slot_list: PuppetSlot[] = [];
    private slot_names = new Map<string, number>();
    private skin_map = new Map<string, PuppetSkin>();
    private clip_map = new Map<string, PuppetClip>();
    private anchor_map = new Map<string, PuppetAnchor>();
    private picture: CanvasImageSource | null = null;
    private first_skin: string | null = null;
    private first_clip: string | null = null;

    /** A rig from data (and its picture, now or later); throws on data that doesn't hold together. */
    public static from_data(
        data: RigData,
        image: CanvasImageSource | null = null,
    ): PuppetRig {
        const rig = new PuppetRig();
        rig.set_data(data);
        rig.image = image;
        return rig;
    }

    /**
     * Reads the data: bones, slots, skins, anchors and clips. Throws with a clear message (a slot on
     * an unknown bone, a clip on an unknown bone, a part for a slot the rig doesn't have, ...) and
     * then keeps what it had.
     */
    public set_data(data: RigData): void {
        if (typeof data.skeleton !== "string" || data.skeleton === "") {
            throw new Error("a rig names its skeleton");
        }
        const template = Skeleton.from_data(data.bones ?? []);
        const slot_list: PuppetSlot[] = [];
        const slot_names = new Map<string, number>();
        for (const slot of data.slots ?? []) {
            const bone = template.index_of(slot.bone);
            if (bone < 0) {
                throw new Error(`slot "${slot.name}": no bone "${slot.bone}"`);
            }
            if (slot_names.has(slot.name)) {
                throw new Error(`slot "${slot.name}" twice`);
            }
            slot_names.set(slot.name, slot_list.length);
            slot_list.push({ name: slot.name, bone });
        }
        const skin_map = new Map<string, PuppetSkin>();
        for (const [name, skin] of Object.entries(data.skins ?? {})) {
            skin_map.set(
                name,
                PuppetSkin.from_data(
                    name,
                    data.skeleton,
                    skin,
                    (slot) => slot_names.has(slot),
                    this.picture,
                ),
            );
        }
        if (
            data.default_skin !== undefined &&
            !skin_map.has(data.default_skin)
        ) {
            throw new Error(
                `default_skin "${data.default_skin}" is not a skin`,
            );
        }
        const anchor_map = new Map<string, PuppetAnchor>();
        for (const [name, anchor] of Object.entries(data.anchors ?? {})) {
            const bone = template.index_of(anchor.bone);
            if (bone < 0) {
                throw new Error(`anchor "${name}": no bone "${anchor.bone}"`);
            }
            anchor_map.set(name, {
                name,
                bone,
                x: anchor.x,
                y: anchor.y,
                rotation: anchor.rotation ?? 0,
            });
        }
        const clip_map = new Map<string, PuppetClip>();
        for (const [name, clip] of Object.entries(data.clips ?? {})) {
            clip_map.set(
                name,
                PuppetClip.from_data(
                    name,
                    clip,
                    (bone) => template.index_of(bone),
                    template.count,
                ),
            );
        }
        for (const clip of clip_map.values()) {
            if (clip.then !== null && !clip_map.has(clip.then)) {
                throw new Error(
                    `clip "${clip.name}": then "${clip.then}" is not a clip`,
                );
            }
        }
        if (
            data.default_clip !== undefined &&
            !clip_map.has(data.default_clip)
        ) {
            throw new Error(
                `default_clip "${data.default_clip}" is not a clip`,
            );
        }
        this.rig_data = data;
        this.template = template;
        this.slot_list = slot_list;
        this.slot_names = slot_names;
        this.skin_map = skin_map;
        this.anchor_map = anchor_map;
        this.clip_map = clip_map;
        this.first_skin =
            data.default_skin ?? skin_map.keys().next().value ?? null;
        this.first_clip =
            data.default_clip ?? clip_map.keys().next().value ?? null;
        this.version += 1;
    }

    /** The data as given; null until it comes. */
    public get data(): RigData | null {
        return this.rig_data;
    }

    public get has_data(): boolean {
        return this.rig_data !== null;
    }

    /** The data and the picture are both there. */
    public get is_ready(): boolean {
        return this.rig_data !== null && this.picture !== null;
    }

    /** The atlas; giving it here hands it to the rig's skins. */
    public get image(): CanvasImageSource | null {
        return this.picture;
    }

    public set image(image: CanvasImageSource | null) {
        this.picture = image;
        for (const skin of this.skin_map.values()) {
            skin.image = image;
        }
    }

    /** The skeleton's name; null until the data comes. */
    public get skeleton_name(): string | null {
        return this.rig_data?.skeleton ?? null;
    }

    public get bone_count(): number {
        return this.template?.count ?? 0;
    }

    public get slots(): readonly PuppetSlot[] {
        return this.slot_list;
    }

    /** The slot's place in the drawing order; -1 for none. */
    public slot_index(name: string): number {
        return this.slot_names.get(name) ?? -1;
    }

    public get skins(): ReadonlyMap<string, PuppetSkin> {
        return this.skin_map;
    }

    /** A skin by name (default: the rig's default skin); null for none. */
    public skin(name?: string): PuppetSkin | null {
        const wanted = name ?? this.first_skin;
        return wanted === null ? null : (this.skin_map.get(wanted) ?? null);
    }

    public get clips(): ReadonlyMap<string, PuppetClip> {
        return this.clip_map;
    }

    public clip(name: string): PuppetClip | null {
        return this.clip_map.get(name) ?? null;
    }

    /** The clip a new puppet plays: the default clip, else the first; null without clips. */
    public get start_clip(): string | null {
        return this.first_clip;
    }

    public get anchors(): ReadonlyMap<string, PuppetAnchor> {
        return this.anchor_map;
    }

    /** The rest pose's box around the feet (`[x, y, width, height]`), if the data says it. */
    public get bounds(): readonly [number, number, number, number] | null {
        return this.rig_data?.bounds ?? null;
    }

    /**
     * Adds a clip, or replaces the one of that name (an editor's clip). Throws as `set_data()`
     * does; a puppet playing the old one goes on with it until it plays the name again.
     */
    public add_clip(name: string, data: PuppetClipData): PuppetClip {
        if (this.template === null) {
            throw new Error(`clip "${name}": the rig has no bones yet`);
        }
        const template = this.template;
        const clip = PuppetClip.from_data(
            name,
            data,
            (bone) => template.index_of(bone),
            template.count,
        );
        this.clip_map.set(name, clip);
        if (this.first_clip === null) {
            this.first_clip = name;
        }
        return clip;
    }

    /** A skeleton of this rig at rest (an empty one before the data comes). */
    public make_skeleton(): Skeleton {
        return this.template?.clone() ?? Skeleton.from_data([]);
    }

    /** A puppet of this rig in its default skin, playing `clip` (default: the start clip). */
    public puppet(clip?: string): Puppet {
        return new Puppet(this, clip);
    }
}
