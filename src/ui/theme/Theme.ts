import { RgbColor } from "../../data";
import {
    Easing,
    ease_in,
    ease_in_out,
    ease_linear,
    ease_out,
} from "../../flow/tween/Tween";
import { ThemeValueAnimator } from "./ThemeValueAnimator";
import { theme_tween_between, ThemeValueTween } from "./ThemeValueTween";
import { ThemeValueProxy } from "./ThemeValueProxy";

export type ThemeFontStyle = "normal" | "italic" | "bold";
export type ThemeBorderStyle = "solid";
export type ThemeTextAlign = "left" | "center" | "right";
export type ThemeTextBaseline = "top" | "middle" | "bottom";
export type ThemeEasing = "linear" | "ease_in" | "ease_out" | "ease_in_out";

/** The easing functions a theme can name. */
const THEME_EASINGS: Readonly<Record<ThemeEasing, Easing>> = {
    linear: ease_linear,
    ease_in,
    ease_out,
    ease_in_out,
};

/** How a change of the theme goes from what shows now to the new value. */
export interface ThemeTransition {
    seconds: number;
    easing?: ThemeEasing;
}

export type ThemePropertyValue =
    | ThemeTransformValue
    | RgbColor
    | string
    | number
    | null;
export type ThemePropertyDefinition<T extends ThemePropertyValue> =
    | T
    | ThemeValueAnimator<T>
    | ThemeValueTween<T>;

export type ThemeTransformStatement =
    | {
          type: "rotate";
          radiant: number;
      }
    | {
          type: "translate";
          x: number;
          y: number;
      }
    | {
          type: "scale";
          x: number;
          y: number;
      };

export class ThemeTransformValue {
    constructor(public statements: Array<ThemeTransformStatement>) {}

    public apply(ctx: CanvasRenderingContext2D) {
        for (const statement of this.statements) {
            switch (statement.type) {
                case "rotate":
                    ctx.rotate(statement.radiant);
                    break;
                case "translate":
                    ctx.translate(statement.x, statement.y);
                    break;
                case "scale":
                    ctx.scale(statement.x, statement.y);
                    break;
            }
        }
    }
}

/**
 * The properties an element can have.
 * These are used for styling elements.
 */
export interface ThemeProperties {
    // colors
    background_color: RgbColor;
    border_color: RgbColor;
    text_color: RgbColor;
    /** What a widget fills to show its value: the mark of a checkbox, the track of a slider. */
    accent_color: RgbColor;
    /** The part of a slider you hold. */
    thumb_color: RgbColor;
    /** The quieter text next to the main one: a slider's name. */
    caption_color: RgbColor;
    // borders
    border_width: number;
    border_radius: number;
    border_style: ThemeBorderStyle;
    // fonts
    font_size: number;
    font_weight: number;
    font_style: ThemeFontStyle;
    font_family: string;
    text_align: ThemeTextAlign;
    text_baseline: ThemeTextBaseline;
    //
    transform: ThemeTransformValue | null;
    /**
     * How long a change of a color, a number or the transform takes on this element, from whatever
     * shows now. The value of the state it is going to counts, as in CSS. 0 snaps.
     */
    transition_seconds: number;
    transition_easing: ThemeEasing;
}

/**
 * The properties an element can be defined as.
 */
export type ThemePropertyDefinitions = {
    [key in keyof ThemeProperties]: ThemePropertyDefinition<
        ThemeProperties[key]
    >;
};

/**
 * The structure of an element that can be themed.
 * It needs to declare the type of element it is, and optionally a class and state.
 */
export interface Themable {
    type: string;
    class: string | null;
    state: string | null;
}

/**
 * Theme Rules may be guarded by selectors and only apply if these match.
 */
export interface ThemeSelector {
    type?: string;
    class?: string;
    state?: string;
}

/**
 * Theme Rules contain properties that are applied to elements that match the selectors.
 */
export interface ThemeRule {
    selectors?: Array<ThemeSelector>;
    properties?: Partial<ThemePropertyDefinitions>;
}

/**
 * Determine if a theme selector applies to a given element.
 *
 * @param selector
 * @param element
 */
export function theme_selector_matches_element(
    selector: ThemeSelector,
    element: Themable,
): boolean {
    return (
        (!selector.type || selector.type === element.type) &&
        (!selector.class || selector.class === element.class) &&
        (!selector.state ||
            selector.state === element.state ||
            (selector.state === "disabled" && element.state === "refused"))
    );
}

export function theme_rule_get_specificity(rule: ThemeRule): {
    type: number;
    class: number;
    state: number;
    class_state: number;
} {
    const specificity = {
        type: 0,
        class: 0,
        state: 0,
        class_state: 0,
    };
    if (!rule.selectors) {
        return specificity;
    }
    for (const selector of rule.selectors) {
        if (selector.type) {
            specificity.type++;
        }
        if (selector.class && selector.state) {
            specificity.class_state++;
        } else if (selector.class) {
            specificity.class++;
        } else if (selector.state) {
            specificity.state++;
        }
    }
    return specificity;
}

/**
 * Sorts the rules by their specificity.
 *
 * .class:state > :state > .class > type
 *
 * If selectors' strengths are equal, the order of definition is relevant.
 * The first rule will be overriden by the last.
 * The order mostly comes from the element hierarchy.
 *
 * @param rules
 */
export function theme_rules_sort_by_specificity(
    rules: Array<ThemeRule>,
): Array<ThemeRule> {
    // get the specificity for every rule
    const rules_with_specificity = rules.map(
        (rule: ThemeRule, index: number) => {
            return {
                rule,
                index,
                specificity: theme_rule_get_specificity(rule),
            };
        },
    );
    // sort the rules
    // the last rule will have the highest effect
    const sorted_rules = rules_with_specificity
        .sort((a, b) => {
            // lower
            const compare_index = a.index - b.index;
            if (a.specificity.class_state || b.specificity.class_state) {
                return (
                    a.specificity.class_state - b.specificity.class_state ||
                    compare_index
                );
            } else if (a.specificity.state || b.specificity.state) {
                return (
                    a.specificity.state - b.specificity.state || compare_index
                );
            } else if (a.specificity.class || b.specificity.class) {
                return (
                    a.specificity.class - b.specificity.class || compare_index
                );
            } else if (a.specificity.type || b.specificity.type) {
                return a.specificity.type - b.specificity.type || compare_index;
            }
            return compare_index;
        })
        .map((item) => item.rule);
    return sorted_rules;
}

/**
 * From a set of rules, evaluate all theme properties.
 * @param themable
 * @param rules
 */
export function theme_evaluate(
    themable: Themable,
    rules: Array<ThemeRule>,
): ThemePropertyDefinitions {
    const theme: ThemePropertyDefinitions = Object.assign(
        {},
        DEFAULT_THEME,
        DEFAULT_THEME_OF_TYPE[themable.type],
    );
    const sorted_rules = theme_rules_sort_by_specificity(rules);
    for (const rule of sorted_rules) {
        const are_all_selectors_matching =
            !rule.selectors ||
            rule.selectors.every((selector: ThemeSelector) => {
                return theme_selector_matches_element(selector, themable);
            });
        if (are_all_selectors_matching) {
            Object.assign(theme, rule.properties);
        }
    }
    return theme;
}

/**
 * The CSS font of a theme: all widgets set their text through this, so `font_weight` and
 * `font_style` reach every one of them.
 */
export function theme_font(
    theme: Pick<
        ThemeProperties,
        "font_style" | "font_weight" | "font_size" | "font_family"
    >,
): string {
    const style = theme.font_style === "italic" ? "italic " : "";
    const weight = theme.font_style === "bold" ? 700 : theme.font_weight;
    const weight_text = weight === 400 ? "" : `${weight} `;
    return `${style}${weight_text}${theme.font_size}px ${theme.font_family}`;
}

/**
 * A theme instance is what an element uses to store it current theme properties.
 */
export class ThemeInstance implements ThemePropertyDefinitions {
    // colors
    public background_color!: ThemePropertyDefinition<RgbColor>;
    public accent_color!: ThemePropertyDefinition<RgbColor>;
    public thumb_color!: ThemePropertyDefinition<RgbColor>;
    public caption_color!: ThemePropertyDefinition<RgbColor>;
    // borders
    public border_color!: ThemePropertyDefinition<RgbColor>;
    public border_width!: ThemePropertyDefinition<number>;
    public border_radius!: ThemePropertyDefinition<number>;
    public border_style!: ThemePropertyDefinition<ThemeBorderStyle>;
    // fonts
    public font_size!: ThemePropertyDefinition<number>;
    public font_weight!: ThemePropertyDefinition<number>;
    public font_style!: ThemePropertyDefinition<ThemeFontStyle>;
    public font_family!: ThemePropertyDefinition<string>;
    // text
    public text_color!: ThemePropertyDefinition<RgbColor>;
    public text_align!: ThemePropertyDefinition<ThemeTextAlign>;
    public text_baseline!: ThemePropertyDefinition<ThemeTextBaseline>;

    public transform!: ThemePropertyDefinition<ThemeTransformValue | null>;

    public transition_seconds!: ThemePropertyDefinition<number>;
    public transition_easing!: ThemePropertyDefinition<ThemeEasing>;

    /**
     * Whether its element was on the screen yet. Until then there is nothing to go smoothly from:
     * a new widget has its look at once.
     */
    public is_shown: boolean = false;
    /** What the rules asked for last. A value on the way there is in the property itself. */
    private readonly targets: Map<
        keyof ThemePropertyDefinitions,
        ThemePropertyDefinition<ThemePropertyValue>
    > = new Map();
    /** The properties holding a value that moves. */
    private readonly moving: Set<keyof ThemePropertyDefinitions> = new Set();

    constructor(theme?: Partial<ThemePropertyDefinitions>) {
        Object.assign(this, DEFAULT_THEME, theme);
    }

    /**
     * Takes on a new set of values. `transition` is a one-off in place of what the theme itself
     * says, for a whole theme changing at once.
     */
    public set_all(
        theme: ThemePropertyDefinitions,
        transition?: ThemeTransition,
    ) {
        const seconds = transition?.seconds ?? theme.transition_seconds;
        const easing = transition?.easing ?? theme.transition_easing;
        const own: ThemeTransition = {
            seconds: typeof seconds === "number" ? seconds : 0,
            easing: typeof easing === "string" ? easing : "linear",
        };
        for (const [key, value] of Object.entries(theme)) {
            this.set(key as keyof ThemePropertyDefinitions, value as any, own);
        }
    }

    /**
     * Whether a value of this instance moved, or arrived just now: the frame after a value arrived
     * is the one that has to show it. Call it once per frame.
     */
    public poll_animation(): boolean {
        const is_moving = this.moving.size > 0;
        for (const key of this.moving) {
            const value = this[key] as unknown;
            if (value instanceof ThemeValueTween && value.is_finished) {
                (this as Record<string, unknown>)[key] = value.end;
                if (!(value.end instanceof ThemeValueProxy)) {
                    this.moving.delete(key);
                }
            }
        }
        return is_moving;
    }

    public set<K extends keyof this & keyof ThemePropertyDefinitions>(
        key: K,
        new_value: this[K],
        transition?: ThemeTransition,
    ): ThemePropertyDefinitions[K] {
        const old_target = this.targets.has(key)
            ? this.targets.get(key)
            : this[key as K];
        if (
            theme_property_definition_equals(
                old_target as ThemePropertyDefinition<ThemePropertyValue>,
                new_value as ThemePropertyDefinition<ThemePropertyValue>,
            )
        ) {
            this.targets.set(
                key,
                old_target as ThemePropertyDefinition<ThemePropertyValue>,
            );
            return old_target as ThemePropertyDefinitions[K];
        }
        this.targets.set(
            key,
            new_value as ThemePropertyDefinition<ThemePropertyValue>,
        );
        // a proxy gets copied: this restarts its timer
        const end =
            new_value instanceof ThemeValueProxy ? new_value.cpy() : new_value;
        const tween = this.transition_to(key, end, transition);
        const shown = tween ?? end;
        this[key] = shown as this[K];
        if (shown instanceof ThemeValueProxy) {
            this.moving.add(key);
        } else {
            this.moving.delete(key);
        }
        return new_value as ThemePropertyDefinitions[K];
    }

    /** The tween from what shows now to `end`, or null when this change should snap. */
    private transition_to(
        key: keyof ThemePropertyDefinitions,
        end: unknown,
        transition: ThemeTransition | undefined,
    ): ThemeValueTween<ThemePropertyValue> | null {
        if (
            !this.is_shown ||
            !transition ||
            transition.seconds <= 0 ||
            NEVER_TWEENED.has(key)
        ) {
            return null;
        }
        return theme_tween_between(
            this.get(key as keyof ThemeProperties),
            end as ThemePropertyValue,
            transition.seconds,
            THEME_EASINGS[transition.easing ?? "ease_out"],
        );
    }

    /**
     * @Todo why the types not good?
     * @param key
     */
    public get<K extends keyof ThemeProperties>(key: K): ThemeProperties[K] {
        const proxy = this[key];
        if (proxy instanceof ThemeValueProxy) {
            return (
                proxy as unknown as ThemeValueProxy<ThemeProperties[K]>
            ).get();
        }
        return proxy as ThemeProperties[K];
    }

    public get_all(): ThemeProperties {
        return {
            background_color: this.get("background_color"),
            accent_color: this.get("accent_color"),
            thumb_color: this.get("thumb_color"),
            caption_color: this.get("caption_color"),
            border_color: this.get("border_color"),
            border_width: this.get("border_width"),
            border_radius: this.get("border_radius"),
            border_style: this.get("border_style"),
            font_size: this.get("font_size"),
            font_weight: this.get("font_weight"),
            font_style: this.get("font_style"),
            font_family: this.get("font_family"),
            text_color: this.get("text_color"),
            text_align: this.get("text_align"),
            text_baseline: this.get("text_baseline"),
            transform: this.get("transform"),
            transition_seconds: this.get("transition_seconds"),
            transition_easing: this.get("transition_easing"),
        };
    }
}

/**
 * Checks if the given two theme values are equal.
 * @param a
 * @param b
 */
export function theme_property_value_equals(
    a: ThemePropertyValue,
    b: ThemePropertyValue,
): boolean {
    if (a instanceof RgbColor && b instanceof RgbColor) {
        return a.equals(b);
    }
    if (a instanceof RgbColor || b instanceof RgbColor) {
        // either is a color, but the other is not
        return false;
    }
    return a === b;
}

/**
 * Checks if the given two theme values are equal.
 * @param a
 * @param b
 */
export function theme_property_definition_equals(
    a: ThemePropertyDefinition<ThemePropertyValue>,
    b: ThemePropertyDefinition<ThemePropertyValue>,
): boolean {
    if (a instanceof ThemeValueAnimator && b instanceof ThemeValueAnimator) {
        return a.equals(b);
    }
    if (a instanceof ThemeValueTween && b instanceof ThemeValueTween) {
        return a.equals(b);
    }
    if (a instanceof ThemeValueProxy || b instanceof ThemeValueProxy) {
        // either is a proxy, but not of the same type as the other
        return false;
    }
    return theme_property_value_equals(a, b);
}

/** Numbers that make no sense on the way: a font weight, and the transition's own length. */
const NEVER_TWEENED: ReadonlySet<keyof ThemePropertyDefinitions> = new Set([
    "font_weight",
    "transition_seconds",
] as const);

/**
 * What differs from `DEFAULT_THEME` for one type of widget. A button is centered with no rule at
 * all, also on a page that doesn't use the house rules.
 */
const DEFAULT_THEME_OF_TYPE: Readonly<
    Record<string, Partial<ThemeProperties>>
> = {
    button: { text_align: "center" },
};

/**
 * The fallback value for all value resolutions.
 */
export const DEFAULT_THEME = {
    background_color: new RgbColor(220, 220, 220),
    accent_color: new RgbColor(0, 0, 0),
    thumb_color: new RgbColor(0, 0, 0),
    caption_color: new RgbColor(0, 0, 0),

    border_color: new RgbColor(70, 70, 70),
    border_width: 0,
    border_radius: 0,
    border_style: "solid",

    font_style: "normal",
    font_size: 16,
    font_weight: 400,
    font_family: "Arial",

    text_color: new RgbColor(0, 0, 0),
    text_align: "left",
    text_baseline: "middle",

    transform: null,

    transition_seconds: 0,
    transition_easing: "ease_out",
} satisfies ThemeProperties;
