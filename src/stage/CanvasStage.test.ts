import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiPage } from "../ui/UiPage";
import { CanvasStage } from "./CanvasStage";

const wide = { width: 960, height: 640 };
const tall = { width: 600, height: 960 };

/** jsdom has no layout and no 2D context: give the stage a size and a stub context. */
function size($element: HTMLElement, width: number, height: number): void {
    $element.getBoundingClientRect = () =>
        ({
            left: 0,
            top: 0,
            width,
            height,
            right: width,
            bottom: height,
        }) as DOMRect;
}

describe("CanvasStage", () => {
    let $stage: HTMLDivElement;

    beforeEach(() => {
        $stage = document.createElement("div");
        document.body.append($stage);
        /* eslint-disable @typescript-eslint/naming-convention -- DOM names */
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            setTransform: vi.fn(),
            fillRect: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
        /* eslint-enable @typescript-eslint/naming-convention */
    });

    afterEach(() => {
        $stage.remove();
        vi.restoreAllMocks();
    });

    function stage_of(width: number, height: number): CanvasStage {
        const stage = new CanvasStage($stage, [wide, tall]);
        size($stage, width, height);
        size(stage.$canvas, width, height);
        return stage;
    }

    it("picks and fits the layout on resize, and reports a layout change", () => {
        const stage = stage_of(1280, 600);
        expect(stage.resize()).toBe(false); // still the wide layout
        expect(stage.layout).toBe(wide);
        expect(stage.fit.scale).toBeCloseTo(600 / 640);

        size($stage, 390, 760);
        size(stage.$canvas, 390, 760);
        expect(stage.resize()).toBe(true);
        expect(stage.layout).toBe(tall);
        expect(stage.$canvas.width).toBe(390);
    });

    it("places attached pages in the same rectangle as the scene", () => {
        const stage = stage_of(1280, 600);
        const page = new UiPage(
            { x: 960, y: 640 },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 960, height: 640 },
        );
        stage.attach(page);
        stage.resize();
        const scene_width = 960 * stage.fit.scale;
        expect(page.rect.left).toBeCloseTo(stage.fit.offset_x / 1280);
        expect(page.rect.width).toBeCloseTo(scene_width / 1280);
        expect(page.rect.top).toBe(0);
        expect(page.rect.height).toBeCloseTo(1);

        // switching layouts moves the page's reference size along
        size($stage, 390, 760);
        size(stage.$canvas, 390, 760);
        stage.resize();
        expect(page.reference_rect.width).toBe(600);
        expect(page.reference_rect.height).toBe(960);
    });

    it("maps a pointer to layout coordinates through the fit", () => {
        const stage = stage_of(1280, 600);
        stage.resize();
        const left_edge = stage.fit.offset_x;
        const point = stage.to_layout(
            new MouseEvent("pointermove", { clientX: left_edge, clientY: 300 }), // eslint-disable-line @typescript-eslint/naming-convention -- DOM names
        );
        expect(point.x).toBeCloseTo(0);
        expect(point.y).toBeCloseTo(320);
    });
});
