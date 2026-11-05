import { describe, expect, it } from "vitest";
import { ThemeValueTweenNumber } from "./ThemeValueTween";

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
