import { RgbColor } from "../../data";
import { Nullable } from "../../flow/types/Nullable";
import { ThemeValueAnimator } from "./ThemeValueAnimator";
import { ThemeValueTween } from "./ThemeValueTween";
import { ThemeValueProxy } from "./ThemeValueProxy";

export type ThemeFontStyle = "normal" | "italic" | "bold";
export type ThemeBorderStyle = "solid";
export type ThemeTextAlign = "left" | "center" | "right";
export type ThemeTextBaseline = "top" | "middle" | "bottom";

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
        (!selector.state || selector.state === element.state)
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
    const theme: ThemePropertyDefinitions = Object.assign({}, DEFAULT_THEME);
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
 * A theme instance is what an element uses to store it current theme properties.
 */
export class ThemeInstance implements ThemePropertyDefinitions {
    // colors
    public background_color!: ThemePropertyDefinition<RgbColor>;
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


    constructor(theme?: Partial<ThemePropertyDefinitions>) {
        Object.assign(this, DEFAULT_THEME, theme);
    }

    public set_all(theme: ThemePropertyDefinitions) {
        for (const [key, value] of Object.entries(theme)) {
            this.set(key as keyof ThemePropertyDefinitions, value as any);
        }
    }

    public set<K extends keyof this & keyof ThemePropertyDefinitions>(
        key: K,
        new_value: this[K],
    ): ThemePropertyDefinitions[K] {
        const old_value = this[key as K];
        if (theme_property_definition_equals(old_value, new_value)) {
            return old_value;
        }
        if (new_value instanceof ThemeValueProxy) {
            // copy the value, this will restart the timer
            this[key] = new_value.cpy() as this[typeof key];
        } else {
            // plain value
            this[key] = new_value;
        }
        return new_value;
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

/**
 * The fallback value for all value resolutions.
 */
export const DEFAULT_THEME = {
    background_color: new RgbColor(220, 220, 220),

    border_color: new RgbColor(70, 70, 70),
    border_width: 0,
    border_radius: 0,
    border_style: "solid",

    font_style: "normal",
    font_size: 16,
    font_weight: 600,
    font_family: "Arial",

    text_color: new RgbColor(0, 0, 0),
    text_align: "left",
    text_baseline: "middle",

    transform: null,
} satisfies ThemeProperties;
