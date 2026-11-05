import { RgbColor } from "../../data/RgbColor";
import { theme_now } from "./ThemeClock";
import { ThemeValueProxy } from "./ThemeValueProxy";
import {
    theme_property_definition_equals,
    ThemePropertyDefinition,
    ThemePropertyValue,
    ThemeTransformStatement,
    ThemeTransformValue,
} from "./Theme";

/**
 * Represents a transition between two values. The end may be a value that moves by itself, an
 * animator: the tween then arrives at wherever that is by then.
 */
export abstract class ThemeValueTween<
    T extends ThemePropertyValue,
> extends ThemeValueProxy<T> {
    public start: number = theme_now();

    protected constructor(
        protected start_value: T,
        protected end_value: T | ThemeValueProxy<T>,
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

    /** Where it is going: a value, or an animator that moves by itself. */
    public get end(): T | ThemeValueProxy<T> {
        return this.end_value;
    }

    /** How far the time has come, 0 to 1. */
    public get progress(): number {
        if (this.seconds <= 0) {
            return 1;
        }
        const raw_t = (theme_now() - this.start) / this.seconds;
        return Math.max(0, Math.min(1, raw_t));
    }

    public get is_finished(): boolean {
        return this.progress >= 1;
    }

    public get(): T {
        const end_value =
            this.end_value instanceof ThemeValueProxy
                ? (this.end_value.get() as T)
                : this.end_value;
        const t = this.progress;
        if (t >= 1) {
            return end_value;
        }
        return this.interpolate(this.start_value, end_value, this.easing(t));
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
            this.end_value as ThemePropertyDefinition<T>,
            other.end_value as ThemePropertyDefinition<T>,
        );
        const seconds_equals = this.seconds === other.seconds;
        return start_equals && end_equals && seconds_equals;
    }
}

export class ThemeValueTweenNumber extends ThemeValueTween<number> {
    public constructor(
        start_value: number,
        end_value: number | ThemeValueProxy<number>,
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

export class ThemeValueTweenColor extends ThemeValueTween<RgbColor> {
    public constructor(
        start_value: RgbColor,
        end_value: RgbColor | ThemeValueProxy<RgbColor>,
        seconds: number,
        easing: (t: number) => number = (t) => t,
    ) {
        super(start_value, end_value, seconds, easing);
    }

    public cpy(): this {
        return new ThemeValueTweenColor(
            this.start_value,
            this.end_value,
            this.seconds,
            this.easing,
        ) as this;
    }

    public interpolate(
        start_value: RgbColor,
        end_value: RgbColor,
        t: number,
    ): RgbColor {
        return lerp_visible(start_value, end_value, t);
    }
}

/**
 * Between two transforms. Statements of the same type in the same order blend one by one, and
 * `null` counts as the other side doing nothing. Two that don't match can't blend: the tween then
 * shows where it is going.
 */
export class ThemeValueTweenTransform extends ThemeValueTween<ThemeTransformValue | null> {
    public constructor(
        start_value: ThemeTransformValue | null,
        end_value:
            | ThemeTransformValue
            | null
            | ThemeValueProxy<ThemeTransformValue | null>,
        seconds: number,
        easing: (t: number) => number = (t) => t,
    ) {
        super(start_value, end_value, seconds, easing);
    }

    public cpy(): this {
        return new ThemeValueTweenTransform(
            this.start_value,
            this.end_value,
            this.seconds,
            this.easing,
        ) as this;
    }

    public interpolate(
        start_value: ThemeTransformValue | null,
        end_value: ThemeTransformValue | null,
        t: number,
    ): ThemeTransformValue | null {
        const statements_from =
            start_value?.statements ??
            end_value?.statements.map(idle_statement) ??
            [];
        const statements_to =
            end_value?.statements ?? statements_from.map(idle_statement);
        if (
            statements_from.length !== statements_to.length ||
            statements_from.some(
                (one, index) => one.type !== statements_to[index].type,
            )
        ) {
            return end_value;
        }
        return new ThemeTransformValue(
            statements_from.map((one, index) =>
                lerp_statement(one, statements_to[index], t),
            ),
        );
    }
}

/**
 * The tween from what shows now to where a rule wants to go, or null when these two can't blend:
 * only colors, numbers and transforms can.
 */
export function theme_tween_between(
    shown: ThemePropertyValue,
    target: ThemePropertyValue | ThemeValueProxy<ThemePropertyValue>,
    seconds: number,
    easing: (t: number) => number,
): ThemeValueTween<ThemePropertyValue> | null {
    const end_sample =
        target instanceof ThemeValueProxy ? target.get() : target;
    if (shown instanceof RgbColor && end_sample instanceof RgbColor) {
        return new ThemeValueTweenColor(
            shown,
            target as RgbColor,
            seconds,
            easing,
        ) as unknown as ThemeValueTween<ThemePropertyValue>;
    }
    if (typeof shown === "number" && typeof end_sample === "number") {
        return new ThemeValueTweenNumber(
            shown,
            target as number,
            seconds,
            easing,
        ) as unknown as ThemeValueTween<ThemePropertyValue>;
    }
    const is_transform = (value: ThemePropertyValue): boolean =>
        value === null || value instanceof ThemeTransformValue;
    if (is_transform(shown) && is_transform(end_sample)) {
        return new ThemeValueTweenTransform(
            shown as ThemeTransformValue | null,
            target as ThemeTransformValue | null,
            seconds,
            easing,
        ) as unknown as ThemeValueTween<ThemePropertyValue>;
    }
    return null;
}

/** Whole channels; a side with no opacity has no color of its own, so it takes the other's. */
function lerp_visible(from: RgbColor, to: RgbColor, t: number): RgbColor {
    const visible_from =
        from.a === 0 ? new RgbColor(to.r, to.g, to.b, 0) : from;
    const visible_to =
        to.a === 0 ? new RgbColor(from.r, from.g, from.b, 0) : to;
    const mixed = visible_from.lerp(visible_to, t);
    return new RgbColor(
        Math.round(mixed.r),
        Math.round(mixed.g),
        Math.round(mixed.b),
        Math.round(mixed.a),
    );
}

/** The statement that changes nothing, of the same type. */
function idle_statement(
    statement: ThemeTransformStatement,
): ThemeTransformStatement {
    switch (statement.type) {
        case "rotate":
            return { type: "rotate", radiant: 0 };
        case "translate":
            return { type: "translate", x: 0, y: 0 };
        case "scale":
            return { type: "scale", x: 1, y: 1 };
    }
}

function lerp_statement(
    from: ThemeTransformStatement,
    to: ThemeTransformStatement,
    t: number,
): ThemeTransformStatement {
    const mix = (a: number, b: number): number => a * (1 - t) + b * t;
    if (from.type === "rotate" && to.type === "rotate") {
        return { type: "rotate", radiant: mix(from.radiant, to.radiant) };
    }
    if (from.type === "translate" && to.type === "translate") {
        return {
            type: "translate",
            x: mix(from.x, to.x),
            y: mix(from.y, to.y),
        };
    }
    if (from.type === "scale" && to.type === "scale") {
        return { type: "scale", x: mix(from.x, to.x), y: mix(from.y, to.y) };
    }
    return to;
}
