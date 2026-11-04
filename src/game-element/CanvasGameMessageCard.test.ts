import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer, MessageCardStyle } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

const RECT = { left: 100, top: 200, width: 240, height: 100 };

class CardRenderer extends CanvasGameRenderer<null> {
    public style: MessageCardStyle | undefined = undefined;
    public message = "";
    public lines = 0;
    protected paint(): void {
        this.lines = this.message_card(RECT, this.message, this.style);
    }
}

class CardLogic extends CanvasGameLogic<null> {
    protected create_game(): null {
        return null;
    }
    public get painter(): CardRenderer {
        return this.renderer as CardRenderer;
    }
}

class CardElement extends CanvasGameElement<CardLogic> {
    public readonly logic = this.assemble({
        settings: CanvasGameSettings,
        renderer: CardRenderer,
        logic: CardLogic,
    });
}

customElements.define("test-message-card", CardElement);

/** Every letter is 10 pixels wide here, so the test knows what fits on a line. */
describe("message_card()", () => {
    /** What was painted, in order, with the font and color it was painted in. */
    let painted: Array<{
        kind: string;
        text?: string;
        x?: number;
        y?: number;
        font?: unknown;
        color?: unknown;
    }>;
    let $element: CardElement;

    beforeEach(() => {
        painted = [];
        const context: Record<string | symbol, unknown> = {
            font: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            fillStyle: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            measureText: (text: string) => ({ width: text.length * 10 }),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            roundRect: vi.fn(),
            fill: () =>
                painted.push({ kind: "card", color: context.fillStyle }),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
            fillText: (text: string, x: number, y: number) =>
                painted.push({
                    kind: "text",
                    text,
                    x,
                    y,
                    font: context.font,
                    color: context.fillStyle,
                }),
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
        $element = document.createElement("test-message-card") as CardElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    function paint(text: string, style?: MessageCardStyle): number {
        const painter = $element.logic.painter;
        painter.message = text;
        painter.style = style;
        painted = [];
        painter.render({ game: null, ui: $element.logic.properties.ui });
        return painter.lines;
    }

    it("paints the card first and the text on it, white and regular by default", () => {
        const colors = new CanvasGameSettings().colors;
        paint("Los");
        const card = painted.findIndex(
            (entry) => entry.kind === "card" && entry.color === colors.card,
        );
        const text = painted.findIndex((entry) => entry.kind === "text");
        expect(card).toBeGreaterThanOrEqual(0);
        expect(text).toBeGreaterThan(card);
        expect(painted[text].color).toBe(colors.white);
        expect(painted[text].font).toBe("18px monospace");
        expect(painted[text].x).toBe(RECT.left + 20);
        expect(painted[text].y).toBe(RECT.top + RECT.height / 2);
    });

    it("takes the size, the weight and the color", () => {
        paint("Los", { size: 15, is_bold: true, color: "#123456" });
        const text = painted.find((entry) => entry.kind === "text");
        expect(text?.font).toBe("bold 15px monospace");
        expect(text?.color).toBe("#123456");
    });

    it("wraps to the card less the inset and centres the lines", () => {
        // 240 less 2 x 20 fits 20 letters; "aaaaaaaaaa bbbbbbbbbb" has 21.
        const lines = paint("aaaaaaaaaa bbbbbbbbbb");
        const texts = painted.filter((entry) => entry.kind === "text");
        expect(lines).toBe(2);
        expect(texts.map((entry) => entry.text)).toEqual([
            "aaaaaaaaaa",
            "bbbbbbbbbb",
        ]);
        expect(texts[0].y).toBe(RECT.top + RECT.height / 2 - 13);
        expect(texts[1].y).toBe(RECT.top + RECT.height / 2 + 13);
    });

    it("takes the line height and the inset", () => {
        // 240 less 2 x 10 fits 22 letters: now it is one line.
        expect(paint("aaaaaaaaaa bbbbbbbbbb", { inset: 10 })).toBe(1);
        expect(painted.find((entry) => entry.kind === "text")?.x).toBe(
            RECT.left + 10,
        );
        paint("aaaaaaaaaa bbbbbbbbbb", { line_height: 40 });
        const texts = painted.filter((entry) => entry.kind === "text");
        expect((texts[1].y ?? 0) - (texts[0].y ?? 0)).toBe(40);
    });
});
