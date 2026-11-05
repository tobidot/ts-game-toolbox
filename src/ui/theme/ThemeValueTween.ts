import { ThemeValueProxy } from "./ThemeValueProxy";
import { theme_property_definition_equals, ThemePropertyValue } from "./Theme";

/**
 * Represents a transition between two values.
 */
export abstract class ThemeValueTween<
    T extends ThemePropertyValue,
> extends ThemeValueProxy<T> {
    public start: number = performance.now();

    protected constructor(
        protected start_value: T,
        protected end_value: T,
        protected seconds: number,
        protected easing: (t: number) => number,
    ) {
        super();
    }

    public abstract cpy(): this;

    /**
     * Interpolates between two values.
     *
     * @param start_value
     * @param end_value
     * @param t Value between 0 (start) and 1 (end)
     */
    public abstract interpolate(start_value: T, end_value: T, t: number): T;

    public get(): T {
        const raw_t = (performance.now() - this.start) / 1000 / this.seconds;
        const t = Math.max(0, Math.min(1, raw_t));
        return this.interpolate(
            this.start_value,
            this.end_value,
            this.easing(t),
        );
    }

    public equals(other: ThemeValueTween<T>): boolean {
        if (other === this) {
            return true;
        }
        const start_equals = theme_property_definition_equals(
            this.start_value,
            other.start_value,
        );
        const end_equals = theme_property_definition_equals(
            this.end_value,
            other.end_value,
        );
        const seconds_equals = this.seconds === other.seconds;
        return start_equals && end_equals && seconds_equals;
    }
}

export class ThemeValueTweenNumber extends ThemeValueTween<number> {
    public constructor(
        start_value: number,
        end_value: number,
        seconds: number,
        easing: (t: number) => number = (t) => t,
    ) {
        super(start_value, end_value, seconds, easing);
    }

    public cpy(): this {
        return new ThemeValueTweenNumber(
            this.start_value,
            this.end_value,
            this.seconds,
            this.easing,
        ) as this;
    }

    public interpolate(
        start_value: number,
        end_value: number,
        t: number,
    ): number {
        return start_value * (1 - t) + end_value * t;
    }
}
