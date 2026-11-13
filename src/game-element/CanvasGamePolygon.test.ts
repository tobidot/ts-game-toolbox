import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector2I } from "../geometries";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

const TRIANGLE: Vector2I[] = [
    { x: 10, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
];
const SQUARE: Vector2I[] = [
    { x: 40, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 10 },
    { x: 40, y: 10 },
];

class PolygonRenderer extends CanvasGameRenderer<null> {
    public scene: "one" | "outlined" | "batch" = "one";
    protected paint(): void {
        const context = this.context;
        if (this.scene === "one") {
            this.polygon(TRIANGLE, "#d48c17");
            return;
        }
        if (this.scene === "outlined") {
            this.polygon(TRIANGLE, null, { color: "#ffffff", width: 3 });
            return;
        }
        context.beginPath();
        this.trace_polygon(TRIANGLE);
        this.trace_polygon(SQUARE);
        context.fill();
    }
}

class PolygonLogic extends CanvasGameLogic<null> {
    protected create_game(): null {
        return null;
    }
    public get painter(): PolygonRenderer {
        return this.renderer as PolygonRenderer;
    }
}

class PolygonElement extends CanvasGameElement<PolygonLogic> {
    public readonly logic = this.assemble({
        settings: CanvasGameSettings,
        renderer: PolygonRenderer,
        logic: PolygonLogic,
    });
}

customElements.define("test-polygon", PolygonElement);

describe("polygon() and trace_polygon()", () => {
    /** The path calls after the shell's own painting, in order. */
    let calls: string[];
    let $element: PolygonElement;

    beforeEach(() => {
        calls = [];
        const context: Record<string | symbol, unknown> = {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            fillStyle: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            strokeStyle: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            lineWidth: 1,
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            beginPath: () => calls.push("begin"),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            lineTo: (x: number, y: number) => calls.push(`line ${x},${y}`),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            closePath: () => calls.push("close"),
            fill: () => calls.push(`fill ${context.fillStyle}`),
            stroke: () =>
                calls.push(
                    `stroke ${context.strokeStyle} ${context.lineWidth}`,
                ),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            measureText: (text: string) => ({ width: text.length * 10 }),
        };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(context, {
                get: (target, name) => {
                    if (!(name in target)) {
                        target[name] = vi.fn();
                    }
                    return target[name];
                },
            }) as unknown as CanvasRenderingContext2D,
        );
        $element = document.createElement("test-polygon") as PolygonElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    function paint(scene: PolygonRenderer["scene"]): string[] {
        const painter = $element.logic.painter;
        painter.scene = scene;
        calls = [];
        painter.render({ game: null, ui: $element.logic.properties.ui });
        // the game's paint() runs before the UI page; its calls come first after the backdrop
        const start = calls.indexOf("move 10,0") - 1;
        return calls.slice(start);
    }

    it("fills one polygon in one call", () => {
        expect(paint("one").slice(0, 6)).toEqual([
            "begin",
            "move 10,0",
            "line 20,20",
            "line 0,20",
            "close",
            "fill #d48c17",
        ]);
    });

    it("outlines without a fill", () => {
        const painted = paint("outlined");
        expect(painted.slice(0, 6)).toEqual([
            "begin",
            "move 10,0",
            "line 20,20",
            "line 0,20",
            "close",
            "stroke #ffffff 3",
        ]);
        expect(painted).not.toContain("fill ");
    });

    it("traces many polygons into one path, for one fill", () => {
        const painted = paint("batch");
        expect(painted.slice(0, 10)).toEqual([
            "begin",
            "move 10,0",
            "line 20,20",
            "line 0,20",
            "close",
            "move 40,0",
            "line 50,0",
            "line 50,10",
            "line 40,10",
            "close",
        ]);
        expect(painted[10]).toMatch(/^fill /);
    });
});
