import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RgbColor } from "../../data/RgbColor";
import { set_theme_clock } from "./ThemeClock";
import { ThemeTransformValue } from "./Theme";
import { theme_pulse, ThemeValueAnimator } from "./ThemeValueAnimator";
import {
    theme_tween_between,
    ThemeValueTweenColor,
    ThemeValueTweenNumber,
    ThemeValueTweenTransform,
} from "./ThemeValueTween";

let time = 0;

beforeEach(() => {
    time = 100;
    set_theme_clock(() => time);
});

afterEach(() => {
    set_theme_clock(null);
});

describe("ThemeValueTween.equals", () => {
    it("tells two tweens with different ends apart", () => {
        const to_ten = new ThemeValueTweenNumber(0, 10, 1);
        const to_twenty = new ThemeValueTweenNumber(0, 20, 1);
        expect(to_ten.equals(to_twenty)).toBe(false);
    });

    it("takes a copy for the same tween", () => {
        const tween = new ThemeValueTweenNumber(0, 10, 1);
        expect(tween.equals(tween.cpy())).toBe(true);
    });
});

describe("ThemeValueTweenColor", () => {
    const BLACK = new RgbColor(0, 0, 0);
    const WHITE = new RgbColor(255, 255, 255);

    it("goes from the start to the end over its seconds, by the clock", () => {
        const tween = new ThemeValueTweenColor(BLACK, WHITE, 2);
        expect(tween.get().equals(BLACK)).toBe(true);
        time += 1;
        expect(tween.get().r).toBe(128);
        expect(tween.is_finished).toBe(false);
        time += 1;
        expect(tween.get().equals(WHITE)).toBe(true);
        expect(tween.is_finished).toBe(true);
    });

    it("eases", () => {
        const tween = new ThemeValueTweenColor(BLACK, WHITE, 2, (t) => t * t);
        time += 1;
        expect(tween.get().r).toBe(64);
    });

    it("arrives at wherever an animator is by then", () => {
        const moving = new ThemeValueAnimator(10, (t) =>
            new RgbColor(0, 0, 0).lerp(new RgbColor(100, 100, 100), t),
        );
        const tween = new ThemeValueTweenColor(WHITE, moving, 1);
        time += 1;
        expect(tween.get().r).toBeCloseTo(10);
    });

    it("doesn't darken on its way from or to a color with no opacity", () => {
        const clear = new RgbColor(0, 0, 0, 0);
        const tween = new ThemeValueTweenColor(clear, WHITE, 2);
        time += 1;
        const middle = tween.get();
        expect(middle.r).toBe(255);
        expect(middle.a).toBe(128);
    });
});

describe("ThemeValueTweenTransform", () => {
    const small = new ThemeTransformValue([{ type: "scale", x: 0.5, y: 0.5 }]);

    it("blends statements of the same type", () => {
        const large = new ThemeTransformValue([
            { type: "scale", x: 1.5, y: 2.5 },
        ]);
        const tween = new ThemeValueTweenTransform(small, large, 2);
        time += 1;
        expect(tween.get()?.statements).toEqual([
            { type: "scale", x: 1, y: 1.5 },
        ]);
    });

    it("takes null for doing nothing, on both sides", () => {
        const pressing = new ThemeValueTweenTransform(null, small, 2);
        const letting_go = new ThemeValueTweenTransform(small, null, 2);
        time += 1;
        expect(pressing.get()?.statements).toEqual([
            { type: "scale", x: 0.75, y: 0.75 },
        ]);
        expect(letting_go.get()?.statements).toEqual([
            { type: "scale", x: 0.75, y: 0.75 },
        ]);
        time += 1;
        expect(letting_go.get()).toBeNull();
    });

    it("shows where it is going when the statements don't match", () => {
        const turned = new ThemeTransformValue([
            { type: "rotate", radiant: 1 },
        ]);
        const tween = new ThemeValueTweenTransform(small, turned, 2);
        time += 1;
        expect(tween.get()).toBe(turned);
    });
});

describe("theme_tween_between", () => {
    it("knows colors, numbers and transforms, and nothing else", () => {
        const color = new RgbColor(1, 2, 3);
        expect(theme_tween_between(color, color, 1, (t) => t)).toBeInstanceOf(
            ThemeValueTweenColor,
        );
        expect(theme_tween_between(1, 2, 1, (t) => t)).toBeInstanceOf(
            ThemeValueTweenNumber,
        );
        expect(theme_tween_between(null, null, 1, (t) => t)).toBeInstanceOf(
            ThemeValueTweenTransform,
        );
        expect(theme_tween_between("a", "b", 1, (t) => t)).toBeNull();
        expect(theme_tween_between(1, color, 1, (t) => t)).toBeNull();
    });
});

describe("ThemeValueAnimator", () => {
    const callback = (t: number): number => t;

    it("runs by the clock and starts over", () => {
        const animator = new ThemeValueAnimator(2, callback);
        time += 1;
        expect(animator.get()).toBeCloseTo(0.5);
        time += 1.5;
        expect(animator.get()).toBeCloseTo(0.25);
    });

    it("tells different intervals apart", () => {
        const short = new ThemeValueAnimator(1, callback);
        const long = new ThemeValueAnimator(2, callback);
        expect(short.equals(long)).toBe(false);
        expect(short.equals(short.cpy())).toBe(true);
    });
});

describe("theme_pulse", () => {
    it("breathes there and back", () => {
        const pulse = theme_pulse(
            new RgbColor(0, 0, 0),
            new RgbColor(100, 0, 0),
            2,
        );
        expect(pulse.get().r).toBeCloseTo(0);
        time += 1;
        expect(pulse.get().r).toBeCloseTo(100);
        time += 1;
        expect(pulse.get().r).toBeCloseTo(0);
    });
});
