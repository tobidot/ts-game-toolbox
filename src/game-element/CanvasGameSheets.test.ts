/* eslint-disable @typescript-eslint/naming-convention -- frame numbers as keys, as a catalogue entry writes them */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetData } from "../canvas/animation/SheetData";
import { CanvasGameElement, CatalogueFile } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** Stands in for `Image`: jsdom loads nothing, so the test says when the picture came. */
class FakeImage {
    public static created: FakeImage[] = [];
    public src = "";
    public width = 64;
    public height = 32;
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

const COB_SHEET: SheetData = {
    frame_width: 16,
    frame_height: 16,
    columns: 4,
    rows: 2,
    anchor: { x: 8, y: 15 },
    default: "idle",
    clips: {
        idle: { frames: "0-1", fps: 4, loop: true },
        walk: {
            frames: "4-7",
            fps: 10,
            loop: true,
            events: { 1: "step" },
        },
    },
};

/** A catalogue with one animated sheet and one plain picture. */
const CATALOGUE = new Map<string, CatalogueFile>([
    ["rendered/character/cob", { url: "blob:cob", sheet: COB_SHEET }],
    ["pixel/prop/coin", { url: "blob:coin" }],
]);

class SheetSettings extends CanvasGameSettings {
    public override readonly title = "Sheets";
    public override readonly catalogue_images = {
        cob: "rendered/character/cob",
        coin: "pixel/prop/coin",
    };
}

class SheetRenderer extends CanvasGameRenderer<null, SheetSettings> {
    protected paint(): void {}
}

class SheetLogic extends CanvasGameLogic<null, SheetSettings> {
    protected create_game(): null {
        return null;
    }
}

class SheetElement extends CanvasGameElement<SheetLogic> {
    public readonly logic = this.assemble({
        settings: SheetSettings,
        renderer: SheetRenderer,
        logic: SheetLogic,
    });

    protected override load_catalogue_url(id: string): Promise<CatalogueFile> {
        const file = CATALOGUE.get(id);
        return file === undefined
            ? Promise.reject(new Error(`unknown ${id}`))
            : Promise.resolve(file);
    }
}

customElements.define("test-sheets", SheetElement);

describe("animated sheets from a catalogue", () => {
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

    function connect(): SheetElement {
        const $element = document.createElement("test-sheets") as SheetElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        return $element;
    }

    function arrive(url: string): void {
        FakeImage.created.find(($image) => $image.src === url)!.fire("load");
    }

    it("gives a player at once, which starts the sheet's default clip when its data comes", async () => {
        const $element = connect();
        const player = $element.logic.load_animation("cob");
        expect(player.frame).toBe(-1);
        await flush();
        player.update(0.25 + 1e-9);
        expect(player.clip_name).toBe("idle");
        expect(player.frame).toBe(1);
        expect($element.logic.load_animation("cob", "walk").frame).toBe(4);
    });

    it("hands the picture to the sheet when it arrives, in either order", async () => {
        const $element = connect();
        const early = $element.logic.references.sheet("cob");
        await flush();
        expect(early.image).toBeNull();
        expect(early.clips.size).toBe(2);
        arrive("blob:cob");
        await flush();
        expect(early.image).toBe(
            FakeImage.created.find(($image) => $image.src === "blob:cob"),
        );
        expect(early.is_ready).toBe(true);
        expect(early.frames[5]).toEqual({
            left: 16,
            top: 16,
            width: 16,
            height: 16,
        });
        // A sheet asked for after its picture came finds it as well.
        arrive("blob:coin");
        await flush();
        expect($element.logic.references.sheet("coin").image).not.toBeNull();
    });

    it("keeps a plain picture a plain picture", async () => {
        const $element = connect();
        await flush();
        expect($element.logic.references.sheets.has("coin")).toBe(false);
        expect($element.logic.references.assets.loads.get("coin")?.kind).toBe(
            "image",
        );
    });
});
