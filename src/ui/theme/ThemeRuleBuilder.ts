import {
    ThemePropertyDefinition,
    ThemePropertyDefinitions,
    ThemeRule, ThemeSelector,
} from "./Theme";

/**
 * [
 *     ["type.class:state", {...}],
 * ]
 *
 * @param definitions
 */
export function theme_rules_from(
    definitions: Array<[string, Partial<ThemePropertyDefinitions>]> | Partial<ThemePropertyDefinitions>,
): Array<ThemeRule> {
    if (definitions instanceof Array) {
        return definitions.map(([selector_string, properties]) => {
            const match = /(?<type>[a-z0-9_-]+)?(\.(?<class>[a-z0-9_-]+))?(:(?<state>[a-z0-9_-]+))?/.exec(selector_string);
            const {type, class: class_name, state} = match?.groups ?? {};
            const selectors: Array<ThemeSelector> = [{
                type,
                class: class_name,
                state,
            }];
            return {
                selectors,
                properties,
            } satisfies ThemeRule;
        });
    }
    // only define properties without selector
    return [{
        selectors: [],
        properties: definitions,
    }];
}
