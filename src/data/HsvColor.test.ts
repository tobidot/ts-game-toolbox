import { describe, expect, it } from "vitest";
import { HsvColor } from "./HsvColor";
import { RgbColor } from "./RgbColor";

/** The house palette of game-object.de. */
const palette = [
    "#6cdad9",
    "#6c6c6c",
    "#26306a",
    "#d48c17",
    "#111111",
    "#ffffff",
    "#d9d9d9",
    "#000000",
    "#ff0000",
    "#00ff00",
    "#0000ff",
];

describe("HsvColor", () => {
    it("round-trips rgb -> hsv -> rgb for the house palette", () => {
        for (const hex of palette) {
            const hsv = HsvColor.from_hex(hex);
            expect(hsv.to_hex()).toBe(hex);
            const rgb = hsv.to_rgb();
            const back = HsvColor.from_rgb(rgb).to_rgb();
            expect([back.r, back.g, back.b, back.a]).toEqual([
                rgb.r,
                rgb.g,
                rgb.b,
                rgb.a,
            ]);
        }
    });

    it("converts the primaries and greys as the textbook says", () => {
        const red = HsvColor.from_rgb(new RgbColor(255, 0, 0));
        expect([red.hue, red.saturation, red.value]).toEqual([0, 1, 1]);
        const green = HsvColor.from_rgb({ r: 0, g: 255, b: 0 });
        expect(green.hue).toBe(120);
        const blue = HsvColor.from_rgb({ r: 0, g: 0, b: 255 });
        expect(blue.hue).toBe(240);
        const grey = HsvColor.from_rgb({ r: 108, g: 108, b: 108 });
        expect(grey.hue).toBe(0);
        expect(grey.saturation).toBe(0);
        expect(grey.value).toBeCloseTo(108 / 255, 10);
        const black = HsvColor.from_hex("#000");
        expect(black.value).toBe(0);
        expect(
            new HsvColor(200, 1, 1).to_rgb().equals(new RgbColor(0, 170, 255)),
        ).toBe(true);
        expect(new RgbColor(0, 170, 255).to_hsv().hue).toBe(200);
    });

    it("parses short, long and alpha hex forms", () => {
        expect(HsvColor.from_hex("#abc").to_hex()).toBe("#aabbcc");
        expect(HsvColor.from_hex("ABC").to_hex()).toBe("#aabbcc");
        expect(HsvColor.from_hex("#abcd").to_hex()).toBe("#aabbccdd");
        expect(HsvColor.from_hex("#d48c17").to_hex()).toBe("#d48c17");
        const translucent = HsvColor.from_hex("#d48c1780");
        expect(translucent.alpha).toBeCloseTo(128 / 255, 10);
        expect(translucent.to_hex()).toBe("#d48c1780");
        expect(translucent.to_css()).toBe(`rgba(212, 140, 23, ${128 / 255})`);
        expect(HsvColor.from_hex("#6cdad9").to_css()).toBe(
            "rgb(108, 218, 217)",
        );
        expect(() => HsvColor.from_hex("#12345")).toThrow();
        expect(() => HsvColor.from_hex("#gggggg")).toThrow();
        expect(() => HsvColor.from_hex("")).toThrow();
    });

    it("wraps the hue and clamps saturation, value and alpha", () => {
        const color = new HsvColor(370, 1.5, -0.5, 2);
        expect(color.hue).toBe(10);
        expect(color.saturation).toBe(1);
        expect(color.value).toBe(0);
        expect(color.alpha).toBe(1);
        expect(new HsvColor(-10, 0, 0).hue).toBe(350);
        expect(HsvColor.wrap_hue(720)).toBe(0);
        expect(new HsvColor(NaN, 0.5, 0.5).hue).toBe(0);
    });

    it("lerps the hue the short way across 350° -> 10°", () => {
        const a = new HsvColor(350, 1, 1);
        const b = new HsvColor(10, 0, 0);
        expect(a.lerp(b, 0.5).hue).toBeCloseTo(0, 10);
        expect(a.lerp(b, 0.25).hue).toBeCloseTo(355, 10);
        expect(a.lerp(b, 0.75).hue).toBeCloseTo(5, 10);
        expect(a.lerp(b, 0.5).saturation).toBeCloseTo(0.5, 10);
        expect(a.lerp(b, 0.5).value).toBeCloseTo(0.5, 10);
        expect(b.lerp(a, 0.5).hue).toBeCloseTo(0, 10);
        expect(a.lerp(b, 0).equals(a)).toBe(true);
        expect(a.lerp(b, 1).equals(b)).toBe(true);
        // 10° -> 190° is exactly opposite: 180° either way
        expect(Math.abs(HsvColor.hue_delta(10, 190))).toBe(180);
        expect(HsvColor.hue_delta(30, 300)).toBe(-90);
        expect(HsvColor.hue_delta(300, 30)).toBe(90);
    });

    it("measures a symmetric distance between 0 and 1", () => {
        const a = new HsvColor(350, 0.2, 0.9);
        const b = new HsvColor(20, 0.7, 0.4);
        expect(a.distance(b)).toBeCloseTo(b.distance(a), 12);
        expect(a.distance(a)).toBe(0);
        expect(a.distance(a.clone())).toBe(0);
        const far = new HsvColor(0, 0, 0).distance(new HsvColor(180, 1, 1));
        expect(far).toBeCloseTo(1, 10);
        // hue alone: 180° apart counts like a full saturation step
        expect(
            new HsvColor(0, 1, 1).distance(new HsvColor(180, 1, 1)),
        ).toBeCloseTo(Math.sqrt(1 / 3), 10);
        expect(
            new HsvColor(0, 1, 1).distance(new HsvColor(0, 0, 1)),
        ).toBeCloseTo(Math.sqrt(1 / 3), 10);
        // the short way: 350° and 10° are 20° apart, not 340°
        expect(
            new HsvColor(350, 1, 1).distance(new HsvColor(10, 1, 1)),
        ).toBeCloseTo(20 / 180 / Math.sqrt(3), 10);
    });

    it("builds variants without touching the original", () => {
        const base = new HsvColor(120, 0.5, 0.5, 0.5);
        const changed = base
            .with_hue(240)
            .with_saturation(1)
            .with_value(0)
            .with_alpha(1);
        expect([
            changed.hue,
            changed.saturation,
            changed.value,
            changed.alpha,
        ]).toEqual([240, 1, 0, 1]);
        expect([base.hue, base.saturation, base.value, base.alpha]).toEqual([
            120, 0.5, 0.5, 0.5,
        ]);
        expect(base.toString()).toBe("hsv(120, 0.5, 0.5, 0.5)");
    });
});
