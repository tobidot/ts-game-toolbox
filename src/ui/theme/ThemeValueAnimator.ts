import { RgbColor } from "../../data/RgbColor";
import { theme_now } from "./ThemeClock";
import { ThemeValueProxy } from "./ThemeValueProxy";
import { ThemePropertyValue } from "./Theme";

/**
 * A value that keeps moving: `callback` gets how far the current round is, 0 to 1. Put it in a rule
 * and it runs for as long as the rule applies, from the moment it starts to apply.
 */
export class ThemeValueAnimator<
    T extends ThemePropertyValue,
> extends ThemeValueProxy<T> {
    public start: number = theme_now();

    constructor(
        protected interval_seconds: number,
        protected callback: (t: number) => T,
    ) {
        super();
    }

    public cpy(): this {
        return new ThemeValueAnimator<T>(
            this.interval_seconds,
            this.callback,
        ) as this;
    }

    public get(): T {
        const t = (theme_now() - this.start) % this.interval_seconds;
        return this.callback(t / this.interval_seconds);
    }

    public equals(other: ThemeValueAnimator<T>): boolean {
        if (other === this) {
            return true;
        }
        return (
            this.callback === other.callback &&
            this.interval_seconds === other.interval_seconds
        );
    }
}

/** A color breathing from `from` to `to` and back, softly, once in `interval_seconds`. */
export function theme_pulse(
    from: RgbColor,
    to: RgbColor,
    interval_seconds: number,
): ThemeValueAnimator<RgbColor> {
    return new ThemeValueAnimator(interval_seconds, (t) =>
        from.lerp(to, (1 - Math.cos(t * 2 * Math.PI)) / 2),
    );
}
