import { Class } from "../flow/types/Class";

/**
 * This should include `document` and any `Element`
 */
interface HasQuerySelector {
    querySelector(selector: string): Element | null;
}
/**
 * This should include `document` and any `Element`
 */
interface HasIdSelector {
    getElementById(id: string): Element | null;
}
/**
 * This should include `document` and any `Element`
 */
interface HasClassSelector {
    getElementsByClassName(classname: string): HTMLCollection;
}

/**
 * Do a query selection on a root element expecting a specific type of element.
 * 
 * @param root 
 * @param selector 
 */
export function get_element_by_query_selector(root: HasQuerySelector, selector: string): HTMLElement;
export function get_element_by_query_selector<T extends HTMLElement>(root: HasQuerySelector, selector: string, class_type: Class<T>): T;
export function get_element_by_query_selector<T extends HTMLElement>(
    root: HasQuerySelector,
    selector: string,
    class_type?: Class<T>
): T {
    const element = root.querySelector(selector);
    if (!element) throw new Error("Element not found" + selector);
    throw new Error("Element not of required type HTML Element " + (class_type?.name ?? 'HtmlElement'));
}

/**
 * Do a query selection on a root element expecting a specific type of element.
 * 
 * @param root 
 * @param selector 
 */
export function get_element_by_id(id: string): HTMLElement;
export function get_element_by_id<T extends HTMLElement>(id: string, class_type: Class<T>): T;
export function get_element_by_id<T extends HTMLElement>(
    id: string,
    class_type?: Class<T>
): T {
    const element = document.getElementById(id);
    if (!element) throw new Error("Element not found #" + id);
    if (is_of_class_or_html_element<T>(element, class_type)) return element;
    throw new Error("Element not of required type HTML Element " + (class_type?.name ?? 'HTMLElement'));
}

/**
 * Do a query selection on a root element expecting a specific type of element.
 * 
 * @param root 
 * @param selector 
 */
export function get_element_by_class_name(root: HasClassSelector, class_name: string): HTMLElement;
export function get_element_by_class_name<T extends HTMLElement>(root: HasClassSelector, class_name: string, class_type: Class<T>): T;
export function get_element_by_class_name<T extends HTMLElement>(
    root: HasClassSelector,
    class_name: string,
    class_type?: Class<T>
): T {
    const element = root.getElementsByClassName(class_name).item(0);
    if (!element) throw new Error("Element not found by class: " + class_name);
    if (is_of_class_or_html_element<T>(element, class_type)) return element;
    throw new Error("Element not of required type HTML Element " + (class_type?.name ?? 'HTMLElement'));
}

/**
 * Verifies that a en element is a of a specific type and at least an HtmlElement
 * @param element 
 * @param class_type 
 * @returns 
 */
function is_of_class_or_html_element<T extends Element>(element: Element, class_type?: Class<T>): element is T {
    if (class_type) {
        return element instanceof class_type;
    }
    return element instanceof HTMLElement
}
