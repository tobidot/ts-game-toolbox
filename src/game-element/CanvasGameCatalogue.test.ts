import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement, CatalogueFile } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings, MuteButtonsLayout } from "./CanvasGameSettings";

/** Stands in for `Audio`: jsdom plays nothing, so the test says what the browser does. */
class FakeAudio {
    public static created: FakeAudio[] = [];
    public paused = true;
    public ended = false;
    public muted = false;
    public volume = 1;
    public loop = false;
    public preload = "";
    public crossOrigin = "";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public currentTime = 0;
    public plays = 0;
    public src = "";
    private readonly listeners = new Map<string, () => void>();

    public constructor() {
        FakeAudio.created.push(this);
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

    public load(): void {}

    public play(): Promise<void> {
        this.plays += 1;
        this.paused = false;
        return Promise.resolve();
    }

    public pause(): void {
        this.paused = true;
    }
}

/** The audio element the asset manager opened for `url`. */
function opened(url: string): FakeAudio {
    return FakeAudio.created.find(($audio) => $audio.src === url)!;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The catalogue of these tests: two sounds and a picture; anything else is unknown. */
const CATALOGUE = new Map<string, string>([
    ["retro/sound/select", "blob:select"],
    ["chiptune/music/song", "blob:song"],
    ["pixel/prop/coin", "blob:coin"],
]);

class CatalogueSettings extends CanvasGameSettings<MuteButtonsLayout> {
    public override readonly title = "Catalogue";
    public override readonly layouts: readonly MuteButtonsLayout[] = [
        {
            width: 960,
            height: 640,
            sound_button: { left: 800, top: 10, width: 56, height: 56 },
            music_button: { left: 864, top: 10, width: 56, height: 56 },
        },
    ];
    public override readonly catalogue_images = {
        coin: "pixel/prop/coin",
        gem: "pixel/prop/gem",
    };
    public override readonly catalogue_sounds = {
        select: "retro/sound/select",
        song: "chiptune/music/song",
    };
    public override readonly music = "song";
}

class CatalogueRenderer extends CanvasGameRenderer<null, CatalogueSettings> {
    protected paint(): void {}
}

class CatalogueLogic extends CanvasGameLogic<null, CatalogueSettings> {
    protected create_game(): null {
        return null;
    }
}

class CatalogueElement extends CanvasGameElement<CatalogueLogic> {
    public readonly asked: string[] = [];
    public readonly logic = this.assemble({
        settings: CatalogueSettings,
        renderer: CatalogueRenderer,
        logic: CatalogueLogic,
    });

    protected override load_catalogue_url(id: string): Promise<CatalogueFile> {
        this.asked.push(id);
        const url = CATALOGUE.get(id);
        return url === undefined
            ? Promise.reject(new Error(`unknown ${id}`))
            : Promise.resolve({ url });
    }
}

/** No hosting framework: the default hook rejects. */
class LonelyElement extends CanvasGameElement<CatalogueLogic> {
    public readonly logic = this.assemble({
        settings: CatalogueSettings,
        renderer: CatalogueRenderer,
        logic: CatalogueLogic,
    });
}

customElements.define("test-catalogue", CatalogueElement);
customElements.define("test-catalogue-lonely", LonelyElement);

describe("media from a catalogue", () => {
    beforeEach(() => {
        FakeAudio.created = [];
        vi.stubGlobal("Audio", FakeAudio);
        vi.spyOn(document, "createElement");
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

    function connect(): CatalogueElement {
        const $element = document.createElement(
            "test-catalogue",
        ) as CatalogueElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        return $element;
    }

    it("asks the hook once per entry, at the first connection only", async () => {
        const $element = connect();
        $element.remove();
        document.body.append($element);
        await flush();
        expect($element.asked.sort()).toEqual([
            "chiptune/music/song",
            "pixel/prop/coin",
            "pixel/prop/gem",
            "retro/sound/select",
        ]);
    });

    it("requests what the hook found under the game's names, and warns about the rest", async () => {
        const $element = connect();
        await flush();
        const loads = $element.logic.references.assets.loads;
        expect(loads.get("select")?.url).toBe("blob:select");
        expect(loads.get("select")?.kind).toBe("audio");
        expect(loads.get("coin")?.kind).toBe("image");
        expect(loads.has("gem")).toBe(false);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining("pixel/prop/gem"),
            expect.anything(),
        );
    });

    it("shows the sound and music buttons for catalogue sounds alone", () => {
        const $element = connect();
        expect($element.logic.properties.sound_button).not.toBeNull();
        expect($element.logic.properties.music_button).not.toBeNull();
    });

    it("starts the music when the track arrives after the intro", async () => {
        const $element = connect();
        await flush();
        const song = opened("blob:song");
        expect(song.plays).toBe(0);
        song.fire("canplaythrough");
        song.fire("canplay");
        song.fire("loadeddata");
        await flush();
        expect($element.logic.properties.audio.current_music).toBe("song");
        expect(
            FakeAudio.created.some(
                ($audio) => $audio.src === "blob:song" && $audio.plays > 0,
            ),
        ).toBe(true);
    });

    it("plays without a catalogue: nothing loads, one warning per entry", async () => {
        const $element = document.createElement(
            "test-catalogue-lonely",
        ) as LonelyElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        await flush();
        expect($element.logic.references.assets.loads.size).toBe(0);
        expect(console.warn).toHaveBeenCalledTimes(4);
    });
});
