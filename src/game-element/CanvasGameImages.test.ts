import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer, ImageStyle } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** Stands in for `Image`: jsdom loads nothing, so the test says when a file arrives. */
class FakeImage {
    public static created: FakeImage[] = [];
    public crossOrigin = "";
    public src = "";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public naturalWidth = 32;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public naturalHeight = 64;
    private readonly listeners = new Map<string, () => void>();

    public constructor() {
        FakeImage.created.push(this);
    }

    public addEventListener(type: string, listener: () => void): void {
        this.listeners.set(type, listener);
    }

    public fire(type: "load" | "error"): void {
        this.listeners.get(type)?.();
    }
}

class PictureSettings extends CanvasGameSettings {
    public override readonly title = "Pictures";
    public override readonly images = { tree: "tree.png", ball: "ball.png" };
}

class PictureRenderer extends CanvasGameRenderer<null, PictureSettings> {
    public style: ImageStyle = {};
    public painted: boolean[] = [];
    protected paint(): void {
        this.painted.push(
            this.paint_image(
                "tree",
                { left: 10, top: 20, width: 100, height: 100 },
                this.style,
            ),
        );
        this.painted.push(
            this.paint_image("unlisted", {
                left: 0,
                top: 0,
                width: 1,
                height: 1,
            }),
        );
    }
}

class PictureLogic extends CanvasGameLogic<null, PictureSettings> {
    protected create_game(): null {
        return null;
    }
    public get painter(): PictureRenderer {
        return this.renderer as PictureRenderer;
    }
}

class PictureElement extends CanvasGameElement<PictureLogic> {
    public readonly logic = this.assemble({
        settings: PictureSettings,
        renderer: PictureRenderer,
        logic: PictureLogic,
    });
}

class PlainRenderer extends CanvasGameRenderer<null> {
    protected paint(): void {}
}

class PlainLogic extends CanvasGameLogic<null> {
    protected create_game(): null {
        return null;
    }
}

class PlainElement extends CanvasGameElement<PlainLogic> {
    public readonly logic = this.assemble({
        settings: CanvasGameSettings,
        renderer: PlainRenderer,
        logic: PlainLogic,
    });
}

customElements.define("test-pictures", PictureElement);
customElements.define("test-plain", PlainElement);

describe("the shell's images", () => {
    let draw_image: ReturnType<typeof vi.fn>;
    let smoothing_while_drawing: unknown;

    beforeEach(() => {
        FakeImage.created = [];
        vi.stubGlobal("Image", FakeImage);
        const context: Record<string | symbol, unknown> = {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            imageSmoothingEnabled: true,
        };
        draw_image = vi.fn(() => {
            smoothing_while_drawing = context.imageSmoothingEnabled;
        });
        context.drawImage = draw_image;
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            // Every other drawing call is a no-op in jsdom.
            new Proxy(context, {
                get: (target, name) => {
                    if (!(name in target)) {
                        target[name] = vi.fn();
                    }
                    return target[name];
                },
            }) as unknown as CanvasRenderingContext2D,
        );
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function connect(): PictureElement {
        const $element = document.createElement(
            "test-pictures",
        ) as PictureElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        return $element;
    }

    function paint($element: PictureElement): boolean[] {
        const painter = $element.logic.painter;
        painter.painted = [];
        painter.render({ game: null, ui: $element.logic.properties.ui });
        return painter.painted;
    }

    it("loads the listed images once, whatever the connections", () => {
        const $element = connect();
        expect(FakeImage.created.map((image) => image.src)).toEqual([
            "tree.png",
            "ball.png",
        ]);
        $element.remove();
        document.body.append($element);
        expect(FakeImage.created.length).toBe(2);
    });

    it("paints nothing until the image has loaded, and repaints when it has", () => {
        const $element = connect();
        expect(paint($element)).toEqual([false, false]);
        expect(draw_image).not.toHaveBeenCalled();

        $element.logic.properties.is_dirty = false;
        FakeImage.created[0].fire("load");
        expect($element.logic.properties.is_dirty).toBe(true);

        expect(paint($element)).toEqual([true, false]);
        expect(draw_image).toHaveBeenCalledWith(
            FakeImage.created[0],
            10,
            20,
            100,
            100,
        );
    });

    it("keeps the proportions and the sharp pixels unless told otherwise", () => {
        const $element = connect();
        FakeImage.created[0].fire("load");
        $element.logic.painter.style = { is_contained: true };
        paint($element);
        expect(draw_image).toHaveBeenCalledWith(
            FakeImage.created[0],
            35,
            20,
            50,
            100,
        );
        expect(smoothing_while_drawing).toBe(false);
        const context = $element.logic.references.stage.context;
        expect(context.imageSmoothingEnabled).toBe(true);
    });

    it("survives an image that fails: it warns and stays unpainted", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const $element = connect();
        $element.logic.properties.is_dirty = false;
        FakeImage.created[0].fire("error");
        FakeImage.created[1].fire("load");
        await Promise.resolve();
        expect(warn).toHaveBeenCalled();
        expect($element.logic.properties.is_dirty).toBe(true);
        expect(paint($element)).toEqual([false, false]);
    });

    it("loads nothing for a game that lists no images", () => {
        const $element = document.createElement("test-plain") as PlainElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        expect(FakeImage.created).toEqual([]);
        expect($element.logic.references.assets.images.size).toBe(0);
    });
});
