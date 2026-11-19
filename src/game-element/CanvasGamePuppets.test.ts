import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartKitData } from "../canvas/puppet/PartKit";
import { MarkSheetData, RigData, WardrobeData } from "../canvas/puppet/RigData";
import { CanvasGameElement, CatalogueFile } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** Stands in for `Image`: jsdom loads nothing, so the test says when the picture came. */
class FakeImage {
    public static created: FakeImage[] = [];
    public src = "";
    public width = 64;
    public height = 64;
    private readonly listeners = new Map<string, () => void>();

    public constructor() {
        FakeImage.created.push(this);
    }

    public addEventListener(type: string, listener: () => void): void {
        this.listeners.set(type, listener);
    }

    public removeEventListener(type: string): void {
        this.listeners.delete(type);
    }

    public fire(type: string): void {
        this.listeners.get(type)?.();
    }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A puppet of two bones and one part; `skin` names its skin, `skeleton` its skeleton. */
function rig(skin: string, skeleton = "stick"): RigData {
    return {
        skeleton,
        bones: [
            { name: "root" },
            { name: "body", parent: "root", y: -20, rotation: -90, length: 20 },
        ],
        slots: [{ name: "body", bone: "body" }],
        skins: {
            [skin]: {
                attachments: {
                    body: {
                        rect: [0, 0, 10, 24],
                        pivot: [5, 22],
                        rotation: 90,
                    },
                },
            },
        },
        clips: {
            idle: {
                length: 1,
                loop: true,
                tracks: { body: [{ t: 0, rotation: 0 }] },
            },
            nod: {
                length: 1,
                loop: true,
                tracks: {
                    body: [
                        { t: 0, rotation: 0 },
                        { t: 1, rotation: 40 },
                    ],
                },
            },
        },
        default_clip: "idle",
    };
}

/** A clothes atlas for the stick: a hat on the body bone. */
const CLOTHES: WardrobeData = {
    skeleton: "stick",
    places: { hat: 10 },
    pieces: {
        cap: {
            place: "hat",
            parts: [{ bone: "body", rect: [0, 0, 8, 4], pivot: [4, 4] }],
        },
    },
};

/** Marks for any skin: a dot. */
const MARKS: MarkSheetData = {
    marks: { dot: { rect: [0, 0, 4, 4], title: "Punkt", kind: "tattoo" } },
};

/** A part kit for generated creatures: one head. */
const KIT: PartKitData = {
    kinds: ["quadruped"],
    parts: {
        head: {
            role: "head",
            rect: [0, 0, 8, 6],
            mask: [8, 0, 8, 6],
            pivot: [0, 3],
            tip: [8, 3],
        },
    },
};

/** A catalogue with two puppets of one skeleton, one of another, clothes, marks, a part kit and a plain picture. */
const CATALOGUE = new Map<string, CatalogueFile>([
    ["rendered/puppet/hero", { url: "blob:hero", rig: rig("hero") }],
    ["rendered/puppet/twin", { url: "blob:twin", rig: rig("twin") }],
    ["rendered/puppet/crab", { url: "blob:crab", rig: rig("crab", "crab") }],
    ["rendered/puppet/clothes", { url: "blob:clothes", rig: CLOTHES }],
    ["rendered/puppet/marks", { url: "blob:marks", rig: MARKS }],
    ["rendered/monster/quadruped-parts", { url: "blob:kit", rig: KIT }],
    ["pixel/prop/coin", { url: "blob:coin" }],
]);

class PuppetSettings extends CanvasGameSettings {
    public override readonly title = "Puppets";
    public override readonly catalogue_images = {
        hero: "rendered/puppet/hero",
        twin: "rendered/puppet/twin",
        crab: "rendered/puppet/crab",
        clothes: "rendered/puppet/clothes",
        marks: "rendered/puppet/marks",
        beasts: "rendered/monster/quadruped-parts",
        coin: "pixel/prop/coin",
    };
}

class PuppetRenderer extends CanvasGameRenderer<null, PuppetSettings> {
    protected paint(): void {}
}

class PuppetLogic extends CanvasGameLogic<null, PuppetSettings> {
    protected create_game(): null {
        return null;
    }
}

class PuppetElement extends CanvasGameElement<PuppetLogic> {
    public readonly logic = this.assemble({
        settings: PuppetSettings,
        renderer: PuppetRenderer,
        logic: PuppetLogic,
    });

    protected override load_catalogue_url(id: string): Promise<CatalogueFile> {
        const file = CATALOGUE.get(id);
        return file === undefined
            ? Promise.reject(new Error(`unknown ${id}`))
            : Promise.resolve(file);
    }
}

customElements.define("test-puppets", PuppetElement);

describe("puppets from a catalogue", () => {
    beforeEach(() => {
        FakeImage.created = [];
        vi.stubGlobal("Image", FakeImage);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(
                {},
                {
                    get: () => vi.fn(),
                    set: () => true,
                },
            ) as unknown as CanvasRenderingContext2D,
        );
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function connect(): PuppetElement {
        const $element = document.createElement(
            "test-puppets",
        ) as PuppetElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        return $element;
    }

    function arrive(url: string): FakeImage {
        const $image = FakeImage.created.find(($each) => $each.src === url)!;
        $image.fire("load");
        return $image;
    }

    it("gives a puppet at once, which plays its clip when the data comes", async () => {
        const $element = connect();
        const hero = $element.logic.load_puppet("hero", "nod");
        expect(hero.player.clip).toBeNull();
        await flush();
        hero.update(0.5);
        expect(hero.player.clip_name).toBe("nod");
        expect(
            hero.skeleton.rotation[hero.skeleton.index_of("body")],
        ).toBeCloseTo(20);
        expect($element.logic.load_puppet("hero").player.clip_name).toBe(
            "idle",
        );
    });

    it("hands the picture to the rig when it arrives, in either order", async () => {
        const $element = connect();
        const early = $element.logic.references.puppet("hero");
        await flush();
        expect(early.has_data).toBe(true);
        expect(early.image).toBeNull();
        const $hero = arrive("blob:hero");
        await flush();
        expect(early.image).toBe($hero);
        expect(early.is_ready).toBe(true);
        expect(early.skin()?.image).toBe($hero);
        arrive("blob:twin");
        await flush();
        // A rig asked for after its picture came finds it as well.
        expect($element.logic.references.puppet("twin").is_ready).toBe(true);
    });

    it("puts another puppet's skin onto the first, but not one of another skeleton", async () => {
        const $element = connect();
        const hero = $element.logic.load_puppet("hero");
        await flush();
        const $twin = arrive("blob:twin");
        await flush();
        expect(hero.set_skin($element.logic.references.puppet("twin"))).toBe(
            true,
        );
        expect(hero.skin?.name).toBe("twin");
        expect(hero.skin?.image).toBe($twin);
        expect(hero.set_skin($element.logic.references.puppet("crab"))).toBe(
            false,
        );
        expect(hero.skin?.name).toBe("twin");
    });

    it("gives a wardrobe at once, whose pieces a puppet wears when its data comes", async () => {
        const $element = connect();
        const hero = $element.logic.load_puppet("hero");
        const clothes = $element.logic.load_wardrobe("clothes");
        hero.use_wardrobe(clothes);
        expect(hero.set_outfit({ hat: "cap" })).toBe(true);
        expect(clothes.has_data).toBe(false);
        await flush();
        expect(clothes.has_data).toBe(true);
        expect($element.logic.references.puppets.has("clothes")).toBe(false);
        expect(hero.drawing_order).toEqual(["body", "cap:0"]);
        const $clothes = arrive("blob:clothes");
        await flush();
        expect(clothes.image).toBe($clothes);
        expect(hero.wear("cap")).toBe(true);
        expect(hero.outfit).toEqual({ hat: "cap" });
    });

    it("gives a mark sheet at once, whose marks a puppet wears when its data comes", async () => {
        const $element = connect();
        const hero = $element.logic.load_puppet("hero");
        const marks = $element.logic.load_marks("marks");
        hero.use_marks(marks);
        expect(marks.has_data).toBe(false);
        expect(hero.add_mark("dot", "body", { x: 4, y: 0 })).toBe(0);
        await flush();
        expect(marks.has_data).toBe(true);
        expect(marks.mark("dot")?.title).toBe("Punkt");
        expect($element.logic.references.puppets.has("marks")).toBe(false);
        expect($element.logic.references.wardrobes.has("marks")).toBe(false);
        // Four pictures load at a time: the marks come after the first ones.
        arrive("blob:hero");
        await flush();
        const $marks = arrive("blob:marks");
        await flush();
        expect(marks.image).toBe($marks);
        expect(hero.add_mark("star", "body")).toBe(-1);
        expect(hero.marks.map((mark) => mark.id)).toEqual(["dot"]);
    });

    it("gives a part kit at once, filled when its data and its picture come", async () => {
        const $element = connect();
        const kit = $element.logic.load_kit("beasts");
        expect(kit.has_data).toBe(false);
        expect(kit.is_ready).toBe(false);
        await flush();
        expect(kit.has_data).toBe(true);
        expect(kit.part("head")?.role).toBe("head");
        expect(kit.parts_of("head", "quadruped").length).toBe(1);
        expect($element.logic.references.puppets.has("beasts")).toBe(false);
        expect($element.logic.references.mark_sheets.has("beasts")).toBe(false);
        expect($element.logic.load_kit("beasts")).toBe(kit);
        // Four pictures load at a time: the kit comes after the first ones.
        arrive("blob:hero");
        arrive("blob:twin");
        await flush();
        const $kit = arrive("blob:kit");
        await flush();
        expect(kit.image).toBe($kit);
    });

    it("keeps a plain picture a plain picture", async () => {
        const $element = connect();
        await flush();
        expect($element.logic.references.puppets.has("coin")).toBe(false);
        expect($element.logic.references.sheets.has("hero")).toBe(false);
        expect($element.logic.references.wardrobes.has("coin")).toBe(false);
        expect($element.logic.references.mark_sheets.has("coin")).toBe(false);
        expect($element.logic.references.part_kits.has("coin")).toBe(false);
    });
});
