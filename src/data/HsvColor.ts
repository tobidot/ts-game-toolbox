import { RgbColor } from "./RgbColor";

/** What `HsvColor.from_rgb` accepts: the toolbox's `RgbColor` (0..255 channels) or any plain object shaped like it. */
export interface RgbLike {
    r: number;
    g: number;
    b: number;
    /** 0..255 like `RgbColor.a`; omitted means opaque. */
    a?: number;
}

/**
 * A color as hue (degrees, 0 <= hue < 360), saturation and value (both 0..1) and alpha (0..1).
 * Immutable in use: every `with_*`, `lerp` and conversion returns a new color. HSV is the
 * space of color pickers: one slider for the color, one for how grey, one for how dark, where
 * RGB mixes all three into every channel.
 */
export class HsvColor {
    public hue: number;
    public saturation: number;
    public value: number;
    public alpha: number;

    /** Hue is wrapped onto the circle (370 -> 10, -10 -> 350); saturation, value and alpha are clamped to 0..1. */
    public constructor(
        hue: number,
        saturation: number,
        value: number,
        alpha: number = 1,
    ) {
        this.hue = HsvColor.wrap_hue(hue);
        this.saturation = HsvColor.clamp(saturation);
        this.value = HsvColor.clamp(value);
        this.alpha = HsvColor.clamp(alpha);
    }

    /** From 0..255 channels (an `RgbColor` fits). Grey has hue 0 and saturation 0; black has value 0. */
    public static from_rgb(color: RgbLike): HsvColor {
        const r = HsvColor.clamp(color.r / 255);
        const g = HsvColor.clamp(color.g / 255);
        const b = HsvColor.clamp(color.b / 255);
        const alpha = color.a === undefined ? 1 : color.a / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        let hue = 0;
        if (chroma > 0) {
            if (max === r) hue = ((g - b) / chroma) % 6;
            else if (max === g) hue = (b - r) / chroma + 2;
            else hue = (r - g) / chroma + 4;
            hue *= 60;
        }
        const saturation = max === 0 ? 0 : chroma / max;
        return new HsvColor(hue, saturation, max, alpha);
    }

    /** Parses "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (the "#" is optional, case does not matter). Throws on anything else. */
    public static from_hex(hex: string): HsvColor {
        const digits = hex.trim().replace(/^#/, "");
        if (!/^[0-9a-fA-F]+$/.test(digits)) {
            throw new Error(`HsvColor.from_hex: not a hex color: "${hex}"`);
        }
        let expanded: string;
        if (digits.length === 3 || digits.length === 4) {
            expanded = digits
                .split("")
                .map((digit) => digit + digit)
                .join("");
        } else if (digits.length === 6 || digits.length === 8) {
            expanded = digits;
        } else {
            throw new Error(`HsvColor.from_hex: not a hex color: "${hex}"`);
        }
        const channel = (index: number) =>
            parseInt(expanded.slice(index * 2, index * 2 + 2), 16);
        return HsvColor.from_rgb({
            r: channel(0),
            g: channel(1),
            b: channel(2),
            a: expanded.length === 8 ? channel(3) : 255,
        });
    }

    /** The toolbox's `RgbColor` with whole 0..255 channels (alpha 0..1 becomes 0..255). */
    public to_rgb(): RgbColor {
        const chroma = this.value * this.saturation;
        const sector = this.hue / 60;
        const x = chroma * (1 - Math.abs((sector % 2) - 1));
        // One sextant of the hue circle at a time: which channel is at chroma, which rises/falls.
        const sextants: ReadonlyArray<[number, number, number]> = [
            [chroma, x, 0],
            [x, chroma, 0],
            [0, chroma, x],
            [0, x, chroma],
            [x, 0, chroma],
            [chroma, 0, x],
        ];
        const [r, g, b] = sextants[Math.min(5, Math.floor(sector))];
        const m = this.value - chroma;
        return new RgbColor(
            Math.round((r + m) * 255),
            Math.round((g + m) * 255),
            Math.round((b + m) * 255),
            Math.round(this.alpha * 255),
        );
    }

    /** "#rrggbb", or "#rrggbbaa" when the color is not fully opaque. */
    public to_hex(): string {
        const rgb = this.to_rgb();
        const pair = (channel: number) => channel.toString(16).padStart(2, "0");
        const hex = `#${pair(rgb.r)}${pair(rgb.g)}${pair(rgb.b)}`;
        return rgb.a === 255 ? hex : hex + pair(rgb.a);
    }

    /** A CSS color: "rgb(r, g, b)" or "rgba(r, g, b, a)". CSS has hsl(), not hsv, so this converts. */
    public to_css(): string {
        const rgb = this.to_rgb();
        if (rgb.a === 255) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.alpha})`;
    }

    public with_hue(hue: number): HsvColor {
        return new HsvColor(hue, this.saturation, this.value, this.alpha);
    }

    public with_saturation(saturation: number): HsvColor {
        return new HsvColor(this.hue, saturation, this.value, this.alpha);
    }

    public with_value(value: number): HsvColor {
        return new HsvColor(this.hue, this.saturation, value, this.alpha);
    }

    public with_alpha(alpha: number): HsvColor {
        return new HsvColor(this.hue, this.saturation, this.value, alpha);
    }

    /**
     * Blends towards `other` (t = 0: this, t = 1: other). The hue goes the short way around the
     * circle: 350° to 10° passes through 0°, not through 180°.
     */
    public lerp(other: HsvColor, t: number): HsvColor {
        const delta = HsvColor.hue_delta(this.hue, other.hue);
        return new HsvColor(
            this.hue + delta * t,
            this.saturation + (other.saturation - this.saturation) * t,
            this.value + (other.value - this.value) * t,
            this.alpha + (other.alpha - this.alpha) * t,
        );
    }

    /**
     * How far apart two colors are, 0 (same) to 1 (as different as HSV allows): the hue
     * difference on the circle scaled so 180° counts like a full saturation or value step,
     * then the euclidean distance of the three, normalized. Alpha is ignored.
     */
    public distance(other: HsvColor): number {
        const dh = Math.abs(HsvColor.hue_delta(this.hue, other.hue)) / 180;
        const ds = this.saturation - other.saturation;
        const dv = this.value - other.value;
        return Math.sqrt((dh * dh + ds * ds + dv * dv) / 3);
    }

    public equals(other: HsvColor, epsilon: number = 1e-9): boolean {
        return (
            Math.abs(HsvColor.hue_delta(this.hue, other.hue)) <= epsilon &&
            Math.abs(this.saturation - other.saturation) <= epsilon &&
            Math.abs(this.value - other.value) <= epsilon &&
            Math.abs(this.alpha - other.alpha) <= epsilon
        );
    }

    public clone(): HsvColor {
        return new HsvColor(this.hue, this.saturation, this.value, this.alpha);
    }

    public toString(): string {
        return `hsv(${this.hue}, ${this.saturation}, ${this.value}, ${this.alpha})`;
    }

    /** The signed shortest turn from hue `from` to hue `to`, in -180..180. */
    public static hue_delta(from: number, to: number): number {
        const delta = HsvColor.wrap_hue(to - from);
        return delta > 180 ? delta - 360 : delta;
    }

    /** Any number onto 0 <= hue < 360. */
    public static wrap_hue(hue: number): number {
        if (!Number.isFinite(hue)) return 0;
        const wrapped = hue % 360;
        return wrapped < 0 ? wrapped + 360 : wrapped;
    }

    private static clamp(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }
}
