import { describe, expect, it } from "vitest";
import { ellipsize_text, wrap_text } from "./text";
import { Button } from "./widgets/Button";
import { Label } from "./widgets/Label";

const CHAR = 10;

/** A context where every character is 10 wide, and what it wrote. */
function context_with_texts() {
    const texts: Array<{ text: string; y: number; max: unknown }> = [];
    const state: Record<string | symbol, unknown> = {};
    const context = new Proxy(state, {
        get: (target, name) => {
            if (name in target) {
                return target[name];
            }
            if (name === "measureText") {
                return (text: string) => ({ width: text.length * CHAR });
            }
            return (...args: unknown[]) => {
                if (name === "fillText") {
                    texts.push({
                        text: args[0] as string,
                        y: args[2] as number,
                        max: args[3],
                    });
                }
            };
        },
        set: (target, name, value) => {
            target[name] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { context, texts };
}

const RECT = { left: 0, top: 0, width: 100, height: 60 };

describe("wrap_text", () => {
    it("breaks at the spaces, and keeps a word too long for a line whole", () => {
        const { context } = context_with_texts();
        expect(wrap_text(context, "ein zwei drei", 90)).toEqual([
            "ein zwei",
            "drei",
        ]);
        expect(wrap_text(context, "Donaudampfschiff a", 50)).toEqual([
            "Donaudampfschiff",
            "a",
        ]);
        expect(wrap_text(context, "  ", 50)).toEqual([]);
    });
});

describe("ellipsize_text", () => {
    it("leaves what fits alone", () => {
        const { context } = context_with_texts();
        expect(ellipsize_text(context, "Hund", 40)).toBe("Hund");
    });

    it("ends what doesn't in an ellipsis, as long as it fits", () => {
        const { context } = context_with_texts();
        const text = ellipsize_text(context, "Hundesteuerbescheid", 60);
        expect(text).toBe("Hunde…");
        expect(text.length * CHAR).toBeLessThanOrEqual(60);
    });

    it("drops the space before the ellipsis", () => {
        const { context } = context_with_texts();
        expect(ellipsize_text(context, "ab cdef", 40)).toBe("ab…");
    });

    it("has only the ellipsis left in very little room", () => {
        const { context } = context_with_texts();
        expect(ellipsize_text(context, "Hund", 5)).toBe("…");
    });
});

describe("Button text_overflow", () => {
    it("squeezes by default, and an ellipsis needs no squeeze", () => {
        const { context, texts } = context_with_texts();
        const button = new Button("Hundesteuerbescheid", RECT);
        button.columns = [{ text: "Hundesteuerbescheid", share: 1 }];
        button.draw(context);
        expect(texts[0]).toMatchObject({
            text: "Hundesteuerbescheid",
            max: 80,
        });
        button.text_overflow = "ellipsis";
        button.draw(context);
        expect(texts[1]).toMatchObject({ text: "Hundest…", max: undefined });
    });
});

describe("Label text_padding", () => {
    it("keeps the text off the edge, and off a wrapped line's width", () => {
        const { context, texts } = context_with_texts();
        const label = new Label("ein langer Satz", RECT);
        label.text_padding = 10;
        label.draw(context);
        expect(texts[0].max).toBe(80);
        label.is_wrapped = true;
        label.draw(context);
        expect(texts.slice(1).map((one) => one.text)).toEqual([
            "ein",
            "langer",
            "Satz",
        ]);
    });
});

describe("Label is_wrapped", () => {
    it("squeezes one line by default", () => {
        const { context, texts } = context_with_texts();
        new Label("ein langer Satz der weit geht", RECT).draw(context);
        expect(texts.length).toBe(1);
    });

    it("breaks into lines around the middle of its box", () => {
        const { context, texts } = context_with_texts();
        const label = new Label("ein langer Satz am Schalter", RECT);
        label.is_wrapped = true;
        label.draw(context);
        expect(texts.map((one) => one.text)).toEqual([
            "ein langer",
            "Satz am",
            "Schalter",
        ]);
        expect(texts[1].y).toBeCloseTo(0);
        expect(texts[2].y - texts[1].y).toBeCloseTo(20);
        expect(texts[1].y - texts[0].y).toBeCloseTo(20);
    });
});
