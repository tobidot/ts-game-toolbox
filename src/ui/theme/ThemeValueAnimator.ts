import { RgbColor } from "../../data/RgbColor";
import { theme_now } from "./ThemeClock";
import { ThemeValueProxy } from "./ThemeValueProxy";
import { ThemePropertyValue, ThemeTransformValue } from "./Theme";

/** How long an element shows a refusal. */
export const REFUSED_SECONDS = 0.35;

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

/** A sideways shake of `distance` that dies away over one round: for a `:refused` rule. */
export function theme_shake(
    distance: number,
    seconds: number = REFUSED_SECONDS,
): ThemeValueAnimator<ThemeTransformValue | null> {
    return new ThemeValueAnimator<ThemeTransformValue | null>(
        seconds,
        (t) =>
            new ThemeTransformValue([
                {
                    type: "translate",
                    x: distance * (1 - t) * Math.sin(t * 4 * Math.PI),
                    y: 0,
                },
            ]),
    );
}
